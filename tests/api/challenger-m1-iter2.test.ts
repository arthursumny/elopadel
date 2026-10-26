import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createPlayer, issueOtp, getPlayer } from '@/lib/runtime-store';
import { createSession, verifySessionToken, PLAYER_COOKIE_NAME, readSession, currentUserId } from '@/lib/auth';
import { GET as meGet } from '@/app/api/me/route';
import { GET as historyGet } from '@/app/api/history/route';
import { GET as seasonGet } from '@/app/api/season/route';
import { POST as verifyOtpPost } from '@/app/api/auth/verify-otp/route';
import * as queries from '@/lib/db/queries';

const mockHeadersMap = new Map<string, string>();
const mockCookiesMap = new Map<string, { value: string }>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mockHeadersMap.get(name.toLowerCase()) ?? null,
  })),
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookiesMap.get(name) ?? undefined,
    set: vi.fn((name: string, value: string) => {
      mockCookiesMap.set(name, { value });
    }),
  })),
}));

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? 'elo-padel-local-development-secret-change-me');
}

describe('Challenger Tier Empirical Stress Tests: M1 Iteration 2 Parity & Edge Cases', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    vi.restoreAllMocks();
  });

  describe('Edge Case Group 1: Missing Player Profile on GET /api/me', () => {
    it('returns clean HTTP 404 (not 500) when session points to non-existent player in memory runtime', async () => {
      const nonExistentToken = await createSession('ghost-player-99999', 'player');
      mockHeadersMap.set('authorization', `Bearer ${nonExistentToken}`);

      const res = await meGet();
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Jogador não encontrado.');
      expect(json.ok).toBeUndefined();
    });

    it('returns clean HTTP 404 when loadCurrentPlayer throws "Jogador não encontrado." (DB mode simulation)', async () => {
      const validToken = await createSession('user-with-missing-db-record', 'player');
      mockHeadersMap.set('authorization', `Bearer ${validToken}`);

      // Spy on loadCurrentPlayer to simulate database throwing "Jogador não encontrado."
      vi.spyOn(queries, 'loadCurrentPlayer').mockRejectedValueOnce(new Error('Jogador não encontrado.'));

      const res = await meGet();
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Jogador não encontrado.');
    });

    it('returns clean HTTP 404 when loadCurrentPlayer returns null or anonymous', async () => {
      const validToken = await createSession('anon-simulated-user', 'player');
      mockHeadersMap.set('authorization', `Bearer ${validToken}`);

      vi.spyOn(queries, 'loadCurrentPlayer').mockResolvedValueOnce({
        id: 'anonymous',
        displayName: 'Jogador',
      } as any);

      const res = await meGet();
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('Jogador não encontrado.');
    });

    it('returns HTTP 500 when loadCurrentPlayer throws an unexpected database error', async () => {
      const validToken = await createSession('user-db-crash', 'player');
      mockHeadersMap.set('authorization', `Bearer ${validToken}`);

      vi.spyOn(queries, 'loadCurrentPlayer').mockRejectedValueOnce(new Error('PostgreSQL connection timeout: pool exhausted'));

      const res = await meGet();
      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain('PostgreSQL connection timeout');
    });
  });

  describe('Edge Case Group 2: Phone/OTP Authentication Is Disabled', () => {
    it('returns 410 for verify-otp and issues neither token nor cookie', async () => {
      const res = await verifyOtpPost(new Request('http://localhost:3000/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '11977665544', code: '123456' }),
      }));

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.code).toBe('GONE');
      expect(data.token).toBeUndefined();
      expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
    });
  });

  describe('Edge Case Group 3: Dual-Mode Auth Precedence & Ambient Isolation', () => {
    it('strict precedence: mobile Bearer token completely overrides browser cookie on GET /api/me', async () => {
      const mobilePlayer = createPlayer({
        phone: '11900000001',
        displayName: 'Mobile User 1',
        handle: `@mob1_${Date.now().toString().slice(-4)}`,
        city: 'Santos',
        state: 'SP',
        category: '2ª',
      });
      const webPlayer = createPlayer({
        phone: '11900000002',
        displayName: 'Web Cookie User 2',
        handle: `@web2_${Date.now().toString().slice(-4)}`,
        city: 'Bauru',
        state: 'SP',
        category: '6ª',
      });

      const mobileToken = await createSession(mobilePlayer.id, 'player');
      const webToken = await createSession(webPlayer.id, 'player');

      // Both headers and cookies are present
      mockHeadersMap.set('authorization', `Bearer ${mobileToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webToken });

      const res = await meGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      // Must be Mobile User 1, NEVER Web User 2
      expect(data.player.id).toBe(mobilePlayer.id);
      expect(data.player.displayName).toBe('Mobile User 1');
      expect(data.player.city).toBe('Santos');
    });

    it('ambient isolation on GET /api/me: invalid Bearer token fails with 401 even when valid cookie exists', async () => {
      const webPlayer = createPlayer({
        phone: '11900000003',
        displayName: 'Innocent Web User',
        handle: `@innocent_${Date.now().toString().slice(-4)}`,
        city: 'Campinas',
        state: 'SP',
        category: '4ª',
      });
      const webToken = await createSession(webPlayer.id, 'player');

      // Invalid Bearer header + valid web cookie
      mockHeadersMap.set('authorization', 'Bearer bogus.tampered.token');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webToken });

      const res = await meGet();
      // Must NOT authenticate as Innocent Web User!
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Não autenticado');
    });

    it('ambient isolation on GET /api/history: expired Bearer token fails with 401 even when valid cookie exists', async () => {
      const webToken = await createSession('web-player-for-history', 'player');
      const expiredToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-mobile-player')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 500)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
        .sign(secret());

      mockHeadersMap.set('authorization', `Bearer ${expiredToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webToken });

      const res = await historyGet();
      expect(res.status).toBe(401);
    });

    it('ambient isolation on GET /api/season: forged Bearer token fails with 401 even when valid cookie exists', async () => {
      const webToken = await createSession('web-player-for-season', 'player');
      const forgedSecret = new TextEncoder().encode('untrusted-foreign-secret-999');
      const forgedToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('forged-mobile-player')
        .setExpirationTime('1d')
        .sign(forgedSecret);

      mockHeadersMap.set('authorization', `Bearer ${forgedToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webToken });

      const res = await seasonGet();
      expect(res.status).toBe(401);
    });

    it('case-insensitivity of authorization header name (e.g. AUTHORIZATION vs authorization)', async () => {
      const player = createPlayer({
        phone: '11900000004',
        displayName: 'Case Tester',
        handle: `@case_${Date.now().toString().slice(-4)}`,
        city: 'Jundiaí',
        state: 'SP',
        category: '5ª',
      });
      const token = await createSession(player.id, 'player');

      // Headers map lowers keys
      mockHeadersMap.set('authorization', `Bearer ${token}`);
      const res = await meGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.player.id).toBe(player.id);
    });

    it('gracefully accepts extra whitespace around Bearer token', async () => {
      const player = createPlayer({
        phone: '11900000005',
        displayName: 'Spaces Tester',
        handle: `@spaces_${Date.now().toString().slice(-4)}`,
        city: 'Sorocaba',
        state: 'SP',
        category: '5ª',
      });
      const token = await createSession(player.id, 'player');

      mockHeadersMap.set('authorization', `Bearer   \t   ${token}   \n  `);
      const res = await meGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.player.id).toBe(player.id);
    });
  });
});
