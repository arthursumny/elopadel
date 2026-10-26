import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import {
  createSession,
  verifySessionToken,
  createOnboardingToken,
  verifyOnboardingToken,
  consumeOnboardingToken,
  isTokenConsumed,
  readSession,
  currentUserId,
  currentClubId,
  currentAdminSession,
  PLAYER_COOKIE_NAME,
  CLUB_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from './auth';

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

describe('Auth Layer: Dual-Mode Sessions & Token Verification', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    vi.clearAllMocks();
  });

  describe('createSession & verifySessionToken', () => {
    it('creates and verifies a valid player session token', async () => {
      const token = await createSession('player-123', 'player');
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(20);

      const session = await verifySessionToken(token);
      expect(session).toEqual({
        id: 'player-123',
        role: 'player',
      });
    });

    it('creates and verifies club and admin sessions', async () => {
      const clubToken = await createSession('club-456', 'club');
      const clubSession = await verifySessionToken(clubToken);
      expect(clubSession).toEqual({ id: 'club-456', role: 'club' });

      const adminToken = await createSession('admin', 'admin');
      const adminSession = await verifySessionToken(adminToken);
      expect(adminSession).toEqual({ id: 'admin', role: 'admin' });
    });

    it('rejects an invalid or tampered token', async () => {
      const session = await verifySessionToken('invalid.jwt.token');
      expect(session).toBeNull();
    });

    it('rejects a token signed with a different secret', async () => {
      const foreignSecret = new TextEncoder().encode('completely-different-signing-secret');
      const foreignToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('hacker-999')
        .setExpirationTime('1d')
        .sign(foreignSecret);

      const session = await verifySessionToken(foreignToken);
      expect(session).toBeNull();
    });

    it('rejects an expired token', async () => {
      const secret = new TextEncoder().encode(process.env.AUTH_SECRET ?? 'elo-padel-local-development-secret-change-me');
      const expiredToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-player')
        .setExpirationTime('-10s')
        .sign(secret);

      const session = await verifySessionToken(expiredToken);
      expect(session).toBeNull();
    });
  });

  describe('createOnboardingToken & verifyOnboardingToken', () => {
    it('creates and verifies an onboarding token with Google provider', async () => {
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'google-sub-123',
        email: 'atleta@padel.com',
        name: 'Carlos Padelista',
        avatarUrl: 'https://example.com/avatar.jpg',
      });

      const payload = await verifyOnboardingToken(token);
      expect(payload).toMatchObject({
        provider: 'google',
        sub: 'google-sub-123',
        emailVerified: true,
        email: 'atleta@padel.com',
        name: 'Carlos Padelista',
        avatarUrl: 'https://example.com/avatar.jpg',
      });
      expect(payload?.jti).toBeDefined();
    });

    it('rejects legacy Google onboarding tokens without the email-verification proof', async () => {
      const legacyToken = await new SignJWT({
        provider: 'google',
        purpose: 'onboarding',
        email: 'legacy@gmail.com',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('legacy-google-sub')
        .setJti('legacy-google-jti')
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? 'elo-padel-local-development-secret-change-me'));

      expect(await verifyOnboardingToken(legacyToken)).toBeNull();
    });

    it('rejects legacy Apple onboarding tokens even when signed with the current secret', async () => {
      const appleToken = await new SignJWT({
        provider: 'apple',
        purpose: 'onboarding',
        email: 'apple@icloud.com',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('apple-sub-456')
        .setJti('legacy-apple-jti')
        .setExpirationTime('15m')
        .sign(new TextEncoder().encode(process.env.AUTH_SECRET ?? 'elo-padel-local-development-secret-change-me'));

      const payload = await verifyOnboardingToken(appleToken);
      expect(payload).toBeNull();
    });

    it('rejects an invalid onboarding token', async () => {
      const payload = await verifyOnboardingToken('invalid.token');
      expect(payload).toBeNull();
    });

    it('tracks single-use token consumption via isTokenConsumed and consumeOnboardingToken', () => {
      const jti = 'test-jti-single-use-123';
      expect(isTokenConsumed(jti)).toBe(false);
      expect(consumeOnboardingToken(jti)).toBe(true);
      expect(isTokenConsumed(jti)).toBe(true);
      expect(consumeOnboardingToken(jti)).toBe(false);
    });
  });


  describe('readSession: Dual-Mode (Bearer Token + Cookies)', () => {
    it('resolves session from Authorization: Bearer <token> header for mobile requests', async () => {
      const token = await createSession('mobile-user-1', 'player');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const session = await readSession();
      expect(session).toEqual({ id: 'mobile-user-1', role: 'player' });

      const userId = await currentUserId();
      expect(userId).toBe('mobile-user-1');
    });

    it('falls back to cookie when Authorization header is absent', async () => {
      const token = await createSession('web-user-2', 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: token });

      const session = await readSession();
      expect(session).toEqual({ id: 'web-user-2', role: 'player' });

      const userId = await currentUserId();
      expect(userId).toBe('web-user-2');
    });

    it('gives priority to Authorization header over cookie when both are present', async () => {
      const mobileToken = await createSession('mobile-priority-user', 'player');
      const webToken = await createSession('web-cookie-user', 'player');

      mockHeadersMap.set('authorization', `Bearer ${mobileToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webToken });

      const session = await readSession();
      expect(session).toEqual({ id: 'mobile-priority-user', role: 'player' });
    });

    it('returns null when both Authorization header and cookie are missing', async () => {
      const session = await readSession();
      expect(session).toBeNull();

      const userId = await currentUserId();
      expect(userId).toBeNull();
    });

    it('resolves club session via Bearer token', async () => {
      const token = await createSession('club-central', 'club');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const clubId = await currentClubId();
      expect(clubId).toBe('club-central');
    });

    it('ensures player token cannot authenticate as club session', async () => {
      const token = await createSession('player-99', 'player');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const clubId = await currentClubId();
      expect(clubId).toBeNull();
    });

    it('resolves admin session via Bearer token', async () => {
      const token = await createSession('admin', 'admin');
      mockHeadersMap.set('authorization', `Bearer ${token}`);

      const adminSession = await currentAdminSession();
      expect(adminSession).toEqual({ id: 'admin', role: 'admin' });
    });
  });
});
