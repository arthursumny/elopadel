import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { createPlayer, issueOtp } from '@/lib/runtime-store';
import { createSession, verifySessionToken, PLAYER_COOKIE_NAME } from '@/lib/auth';
import { GET as meGet } from '@/app/api/me/route';
import { GET as historyGet } from '@/app/api/history/route';
import { GET as seasonGet } from '@/app/api/season/route';
import { POST as verifyOtpPost } from '@/app/api/auth/verify-otp/route';

const mockHeadersMap = new Map<string, string>();
const mockCookiesMap = new Map<string, { value: string }>();
const mockRepositoryPlayers = new Map<string, any>();

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

vi.mock('@/lib/db/repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/repository')>();
  return {
    ...actual,
    findPlayerByPhone: vi.fn(async (phone: string) => {
      const normalized = phone.replace(/\D/g, '');
      if (mockRepositoryPlayers.has(normalized)) {
        return mockRepositoryPlayers.get(normalized);
      }
      return actual.findPlayerByPhone(phone);
    }),
  };
});

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? 'elo-padel-local-development-secret-change-me');
}

describe('Empirical Boundary Tests: Mobile Read Parity & OTP Session Issuance', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    mockRepositoryPlayers.clear();
    vi.clearAllMocks();
  });

  describe('GET /api/me — Profile, Ratings & Rank Parity', () => {
    it('returns HTTP 401 when completely unauthenticated', async () => {
      const res = await meGet();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Não autenticado');
    });

    it('returns HTTP 401 when Authorization header has empty Bearer token', async () => {
      mockHeadersMap.set('authorization', 'Bearer ');
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when Authorization header is malformed or invalid syntax', async () => {
      mockHeadersMap.set('authorization', 'NotABearerToken');
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when Bearer token is syntactically invalid garbage', async () => {
      mockHeadersMap.set('authorization', 'Bearer invalid.jwt.garbage.payload');
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when Bearer token is expired', async () => {
      const expiredToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-user')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
        .sign(secret());

      mockHeadersMap.set('authorization', `Bearer ${expiredToken}`);
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when Bearer token was signed with wrong secret key', async () => {
      const fakeSecret = new TextEncoder().encode('unauthorized-attacker-secret-key-12345');
      const spoofedToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('spoofed-user')
        .setExpirationTime('1d')
        .sign(fakeSecret);

      mockHeadersMap.set('authorization', `Bearer ${spoofedToken}`);
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when token has club role (privilege separation)', async () => {
      const clubToken = await createSession('club-xyz', 'club');
      mockHeadersMap.set('authorization', `Bearer ${clubToken}`);
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when token has admin role (privilege separation)', async () => {
      const adminToken = await createSession('admin', 'admin');
      mockHeadersMap.set('authorization', `Bearer ${adminToken}`);
      const res = await meGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 404 when valid session token points to non-existent player', async () => {
      const ghostToken = await createSession('non-existent-ghost-user', 'player');
      mockHeadersMap.set('authorization', `Bearer ${ghostToken}`);
      const res = await meGet();
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('Jogador não encontrado');
    });

    it('returns fully populated profile via Bearer token with full data contract compliance', async () => {
      const player = createPlayer({
        phone: '11988887766',
        displayName: 'Mobile Champion',
        handle: `@mob_champ_${Date.now().toString().slice(-4)}`,
        city: 'Campinas',
        state: 'SP',
        category: '4ª',
        club: 'Arena Padel Campinas',
      });

      const token = await createSession(player.id, 'player');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const res = await meGet();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.player).toBeDefined();
      expect(data.user).toBeDefined();
      expect(data.profile).toBeDefined();

      const p = data.player;
      expect(p.id).toBe(player.id);
      expect(p.displayName).toBe('Mobile Champion');
      expect(p.handle).toBe(player.handle);
      expect(p.city).toBe('Campinas');
      expect(p.state).toBe('SP');
      expect(p.country).toBe('Brasil');

      // Rating object checks
      expect(p.rating).toBeDefined();
      expect(typeof p.rating.rating).toBe('number');
      expect(typeof p.rating.deviation).toBe('number');
      expect(typeof p.rating.volatility).toBe('number');
      expect(typeof p.rating.matches).toBe('number');
      expect(typeof p.rating.provisional).toBe('boolean');

      // Rank object checks
      expect(p.rank).toBeDefined();
      expect(p.rank.tier).toBeDefined();
      expect(typeof p.rank.points).toBe('number');
      expect(typeof p.rank.maxPoints).toBe('number');

      // Stats
      expect(typeof p.wins).toBe('number');
      expect(typeof p.totalMatches).toBe('number');
      expect(typeof p.winRate).toBe('number');
      expect(p.winRate).toBeGreaterThanOrEqual(0);
      expect(p.winRate).toBeLessThanOrEqual(100);
    });

    it('preserves web cookie authentication with exact data parity', async () => {
      const player = createPlayer({
        phone: '21977776655',
        displayName: 'Web Browser Player',
        handle: `@web_player_${Date.now().toString().slice(-4)}`,
        city: 'Rio de Janeiro',
        state: 'RJ',
        category: '5ª',
      });

      const token = await createSession(player.id, 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: token });

      const res = await meGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.player.id).toBe(player.id);
      expect(data.player.displayName).toBe('Web Browser Player');
    });
  });

  describe('GET /api/history — Match History Parity', () => {
    it('returns HTTP 401 when unauthenticated', async () => {
      const res = await historyGet();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Não autenticado');
    });

    it('returns HTTP 401 when Bearer token is invalid', async () => {
      mockHeadersMap.set('authorization', 'Bearer bad.token');
      const res = await historyGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when authenticated as non-player role', async () => {
      const token = await createSession('club-id-99', 'club');
      mockHeadersMap.set('authorization', `Bearer ${token}`);
      const res = await historyGet();
      expect(res.status).toBe(401);
    });

    it('returns match history payload via Bearer token', async () => {
      const player = createPlayer({
        phone: '31966665544',
        displayName: 'History Tester',
        handle: `@hist_${Date.now().toString().slice(-4)}`,
        city: 'Belo Horizonte',
        state: 'MG',
        category: '6ª',
      });

      const token = await createSession(player.id, 'player');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const res = await historyGet();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.wins).toBe('number');
      expect(typeof data.mmrDelta).toBe('number');
      expect(data.history).toBeDefined();
    });

    it('returns match history payload via Web Cookie', async () => {
      const token = await createSession('web-hist-user', 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: token });

      const res = await historyGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
    });
  });

  describe('GET /api/season — Active Season Parity', () => {
    it('returns HTTP 401 when unauthenticated', async () => {
      const res = await seasonGet();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Não autenticado');
    });

    it('returns HTTP 401 when Bearer token is invalid', async () => {
      mockHeadersMap.set('authorization', 'Bearer expired-or-invalid');
      const res = await seasonGet();
      expect(res.status).toBe(401);
    });

    it('returns HTTP 401 when authenticated as club', async () => {
      const token = await createSession('club-season', 'club');
      mockHeadersMap.set('authorization', `Bearer ${token}`);
      const res = await seasonGet();
      expect(res.status).toBe(401);
    });

    it('returns season payload via Bearer token', async () => {
      const token = await createSession('mobile-season-user', 'player');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const res = await seasonGet();
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(typeof data.active).toBe('boolean');
      expect(typeof data.name).toBe('string');
      expect(typeof data.startsAt).toBe('string');
      expect(typeof data.endsAt).toBe('string');
      expect(typeof data.points).toBe('number');
      expect(typeof data.wins).toBe('number');
      expect(typeof data.matches).toBe('number');
      expect(typeof data.position).toBe('number');
      expect(Array.isArray(data.leaderboard)).toBe(true);
      expect(data.season).toBeDefined();
    });

    it('returns season payload via Web Cookie', async () => {
      const token = await createSession('web-season-user', 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: token });

      const res = await seasonGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(typeof data.name).toBe('string');
    });
  });

  describe('POST /api/auth/verify-otp — descontinuado', () => {
    it('returns 410 without issuing a token or cookie', async () => {
      const res = await verifyOtpPost(new Request('http://localhost:3000/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '51988889999', code: '123456' }),
      }));

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.code).toBe('GONE');
      expect(data.token).toBeUndefined();
      expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
    });
  });
});
