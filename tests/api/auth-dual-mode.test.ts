import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import {
  createSession,
  verifySessionToken,
  createOnboardingToken,
  verifyOnboardingToken,
  readSession,
  currentUserId,
  currentClubId,
  currentAdminSession,
  PLAYER_COOKIE_NAME,
  CLUB_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from '@/lib/auth';

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

describe('Empirical Adversarial Tests: Dual-Mode Auth, Precedence & Token Boundaries', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    vi.clearAllMocks();
  });

  describe('Precedence & Ambient Credential Isolation', () => {
    it('strict precedence: Bearer header user wins when both valid Bearer and Cookie are present', async () => {
      const mobilePlayerToken = await createSession('mobile-user-alpha', 'player');
      const webPlayerToken = await createSession('web-user-beta', 'player');

      mockHeadersMap.set('authorization', `Bearer ${mobilePlayerToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webPlayerToken });

      const session = await readSession();
      expect(session).not.toBeNull();
      expect(session?.id).toBe('mobile-user-alpha');
      expect(session?.role).toBe('player');

      const resolvedUserId = await currentUserId();
      expect(resolvedUserId).toBe('mobile-user-alpha');
    });

    it('security isolation: invalid Bearer token MUST NOT fall back to valid cookie', async () => {
      const webPlayerToken = await createSession('web-user-beta', 'player');

      // Attacker or mobile client sends invalid Bearer token
      mockHeadersMap.set('authorization', 'Bearer tampered.invalid.token');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: webPlayerToken });

      const session = await readSession();
      // Must NOT authenticate as web-user-beta!
      expect(session).toBeNull();

      const resolvedUserId = await currentUserId();
      expect(resolvedUserId).toBeNull();
    });

    it('security isolation: expired Bearer token MUST NOT fall back to valid cookie', async () => {
      const expiredBearerToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-mobile-user')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 2000)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 500)
        .sign(secret());

      const validWebToken = await createSession('valid-web-user', 'player');

      mockHeadersMap.set('authorization', `Bearer ${expiredBearerToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: validWebToken });

      const session = await readSession();
      expect(session).toBeNull();
      expect(await currentUserId()).toBeNull();
    });

    it('security isolation: foreign-secret Bearer token MUST NOT fall back to valid cookie', async () => {
      const foreignSecret = new TextEncoder().encode('attacker-unauthorized-secret-key-999');
      const forgedBearerToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('forged-mobile-user')
        .setExpirationTime('1d')
        .sign(foreignSecret);

      const validWebToken = await createSession('valid-web-user', 'player');

      mockHeadersMap.set('authorization', `Bearer ${forgedBearerToken}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: validWebToken });

      const session = await readSession();
      expect(session).toBeNull();
      expect(await currentUserId()).toBeNull();
    });

    it('fallback to cookie when Authorization header is completely missing', async () => {
      const validWebToken = await createSession('only-cookie-user', 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: validWebToken });

      const session = await readSession();
      expect(session?.id).toBe('only-cookie-user');
      expect(session?.role).toBe('player');
      expect(await currentUserId()).toBe('only-cookie-user');
    });

    it('fallback to cookie when Authorization header is empty Bearer', async () => {
      const validWebToken = await createSession('fallback-web-user', 'player');
      mockHeadersMap.set('authorization', 'Bearer   ');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: validWebToken });

      const session = await readSession();
      expect(session?.id).toBe('fallback-web-user');
    });

    it('fallback to cookie when Authorization scheme is Basic or other non-Bearer scheme', async () => {
      const validWebToken = await createSession('basic-fallback-user', 'player');
      mockHeadersMap.set('authorization', 'Basic dXNlcjpwYXNz');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: validWebToken });

      const session = await readSession();
      expect(session?.id).toBe('basic-fallback-user');
    });
  });

  describe('Header Parsing & Formatting Resilience', () => {
    it('handles Bearer tokens with extra internal/trailing whitespace correctly', async () => {
      const token = await createSession('padded-token-user', 'player');
      mockHeadersMap.set('authorization', `Bearer   ${token}   `);

      const session = await readSession();
      expect(session?.id).toBe('padded-token-user');
    });

    it('returns null when header is only "Bearer" without space or token', async () => {
      mockHeadersMap.set('authorization', 'Bearer');
      const session = await readSession();
      expect(session).toBeNull();
    });
  });

  describe('Role-Based Access Boundaries (Player vs Club vs Admin)', () => {
    it('player session token CANNOT authenticate as club in currentClubId', async () => {
      const playerToken = await createSession('player-attacker', 'player');
      mockHeadersMap.set('authorization', `Bearer ${playerToken}`);

      expect(await currentUserId()).toBe('player-attacker');
      expect(await currentClubId()).toBeNull();
      expect(await currentAdminSession()).toBeNull();
    });

    it('club session token CANNOT authenticate as player in currentUserId', async () => {
      const clubToken = await createSession('club-central', 'club');
      mockHeadersMap.set('authorization', `Bearer ${clubToken}`);

      expect(await currentUserId()).toBeNull();
      expect(await currentClubId()).toBe('club-central');
      expect(await currentAdminSession()).toBeNull();
    });

    it('admin session token CANNOT authenticate as player in currentUserId', async () => {
      const adminToken = await createSession('admin', 'admin');
      mockHeadersMap.set('authorization', `Bearer ${adminToken}`);

      expect(await currentUserId()).toBeNull();
      expect(await currentClubId()).toBeNull();
      expect((await currentAdminSession())?.id).toBe('admin');
    });

    it('admin token with subject other than "admin" is rejected by currentAdminSession', async () => {
      const fakeAdminToken = await createSession('not-real-admin', 'admin');
      mockHeadersMap.set('authorization', `Bearer ${fakeAdminToken}`);

      expect(await currentAdminSession()).toBeNull();
    });

    it('club cookie cannot authenticate as player', async () => {
      const clubToken = await createSession('club-cookie-id', 'club');
      mockCookiesMap.set(CLUB_COOKIE_NAME, { value: clubToken });

      expect(await currentUserId()).toBeNull();
      expect(await currentClubId()).toBe('club-cookie-id');
    });

    it('admin cookie cannot authenticate as player', async () => {
      const adminToken = await createSession('admin', 'admin');
      mockCookiesMap.set(ADMIN_COOKIE_NAME, { value: adminToken });

      expect(await currentUserId()).toBeNull();
      expect((await currentAdminSession())?.id).toBe('admin');
    });
  });

  describe('Onboarding Token Isolation & Security', () => {
    it('onboarding token CANNOT be used as session token in readSession or verifySessionToken', async () => {
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'google-sub-hijack',
        email: 'hijack@gmail.com',
      });

      // Attempt to use onboarding token as Bearer session
      mockHeadersMap.set('authorization', `Bearer ${onboardingToken}`);
      const session = await readSession();
      expect(session).toBeNull();

      const directVerify = await verifySessionToken(onboardingToken);
      expect(directVerify).toBeNull();
    });

    it('session token CANNOT be used as onboarding token in verifyOnboardingToken', async () => {
      const sessionToken = await createSession('player-session-id', 'player');
      const onboardingPayload = await verifyOnboardingToken(sessionToken);
      expect(onboardingPayload).toBeNull();
    });

    it('rejects tampered onboarding token', async () => {
      const validToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'google-sub-valid',
        email: 'google@example.com',
      });

      const parts = validToken.split('.');
      // Tamper with payload part
      const tamperedToken = `${parts[0]}.${parts[1]}tampered.${parts[2]}`;
      const payload = await verifyOnboardingToken(tamperedToken);
      expect(payload).toBeNull();
    });

    it('rejects expired onboarding token', async () => {
      const expiredOnboardingToken = await new SignJWT({
        provider: 'google',
        sub: 'expired-sub',
        purpose: 'onboarding',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-sub')
        .setIssuedAt(Math.floor(Date.now() / 1000) - 1000)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 100)
        .sign(secret());

      const payload = await verifyOnboardingToken(expiredOnboardingToken);
      expect(payload).toBeNull();
    });
  });

  describe('Adversarial Cryptographic Stress & Edge Payloads', () => {
    it('rejects "alg": "none" signature bypass attempt', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'admin-attacker', role: 'admin' })).toString('base64url');
      const unsignedToken = `${header}.${payload}.`;

      const session = await verifySessionToken(unsignedToken);
      expect(session).toBeNull();
    });

    it('safely handles massive payload string without crashing or DoS', async () => {
      const giantToken = 'Bearer ' + 'A'.repeat(100000);
      mockHeadersMap.set('authorization', giantToken);

      const session = await readSession();
      expect(session).toBeNull();
    });

    it('tolerates extra metadata claims in token payload without breaking', async () => {
      const tokenWithExtras = await new SignJWT({
        role: 'player',
        customField: 'padel-metadata',
        clientApp: 'mobile-v1.0.0',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('player-extra-fields')
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(secret());

      mockHeadersMap.set('authorization', `Bearer ${tokenWithExtras}`);
      const session = await readSession();
      expect(session).toEqual({
        id: 'player-extra-fields',
        role: 'player',
      });
    });
  });
});
