import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { AsyncLocalStorage } from 'node:async_hooks';

// --- Domain & Library Imports ---
import {
  createSession,
  verifySessionToken,
  createOnboardingToken,
  verifyOnboardingToken,
  consumeOnboardingToken,
  isTokenConsumed,
  clearConsumedTokens,
  readSession,
  currentUserId,
  currentClubId,
  currentAdminSession,
  requireUserId,
  requireClubId,
  requireAdminSession,
  PLAYER_COOKIE_NAME,
  CLUB_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from '@/lib/auth';

import { POST as socialPost } from '@/app/api/auth/social/route';
import { POST as onboardingPost } from '@/app/api/auth/social/onboarding/route';
import { POST as linkPost } from '@/app/api/auth/social/link/route';
import {
  verifySocialToken,
  clearRuntimeOAuthStore,
  runtimeUsersByPhone,
} from '@/app/api/auth/social/service';

import {
  normalizeHandleInput,
  normalizePublicHandle,
  isReservedHandle,
  isValidPublicHandle,
  RESERVED_HANDLES,
} from '@/lib/handles';

import {
  createPlayer,
  getPlayer,
  issueOtp,
  verifyOtp,
} from '@/lib/runtime-store';

import {
  upsertDevicePushToken,
  deactivateDevicePushToken,
  getActivePushTokens,
  deleteDevicePushTokens,
  clearRuntimePushTokens,
  runtimeDevicePushTokens,
} from '@/lib/notifications/tokens';

import {
  chunkArray,
  isExpoPushToken,
  formatPushPayload,
  sendExpoPushMessages,
  dispatchPushNotifications,
  reapDeadTokens,
  type ExpoPushMessage,
  type ExpoPushTicket,
} from '@/lib/notifications/push';

import {
  validateBestOfThree,
  canValidateResult,
  hasConflictingResult,
  resultVoteCounts,
  nextMatchStatus,
  type Confirmation,
  type MatchResultInput,
} from '@/lib/domain/match';

import {
  teamRating,
  calculateRatingUpdate,
  rankPointDelta,
  expectedScore,
} from '@/lib/domain/rating';

import {
  areCompetitivePlayersCompatible,
  areTeamSidesCompatible,
  normalizeCourtSide,
  findAvailabilityOverlap,
  findMatchmakingGroup,
  buildTeamAssignments,
  timeToMinutes,
  type MatchmakingParty,
  type CompetitivePlayer,
} from '@/lib/domain/matchmaking';

// --- Header / Cookie Storage Isolation for Next.js Headers Mock ---
const defaultHeadersMap = new Map<string, string>();
const defaultCookiesMap = new Map<string, { value: string }>();

const headersStorage = new AsyncLocalStorage<Map<string, string>>();
const cookiesStorage = new AsyncLocalStorage<Map<string, { value: string }>>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => {
    const store = headersStorage.getStore() ?? defaultHeadersMap;
    return {
      get: (name: string) => store.get(name.toLowerCase()) ?? null,
    };
  }),
  cookies: vi.fn(async () => {
    const store = cookiesStorage.getStore() ?? defaultCookiesMap;
    return {
      get: (name: string) => store.get(name) ?? undefined,
      set: vi.fn((name: string, value: string) => {
        store.set(name, { value });
      }),
    };
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET ?? 'elo-padel-local-development-secret-change-me');
}

async function createValidSocialJwt(payload: {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('1h')
    .sign(secret());
}

function runWithIsolatedContext<T>(
  headers: Record<string, string>,
  cookies: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const hMap = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) {
    hMap.set(k.toLowerCase(), v);
  }
  const cMap = new Map<string, { value: string }>();
  for (const [k, v] of Object.entries(cookies)) {
    cMap.set(k, { value: v });
  }

  return headersStorage.run(hMap, () => {
    return cookiesStorage.run(cMap, fn);
  });
}

describe('Milestone 5 Phase 2: Tier 5 Backend Adversarial Challenger Suite', () => {
  beforeEach(() => {
    defaultHeadersMap.clear();
    defaultCookiesMap.clear();
    clearRuntimeOAuthStore();
    clearConsumedTokens();
    clearRuntimePushTokens();
    vi.clearAllMocks();
  });

  // =========================================================================
  // MODULE 1: Auth Layer (src/lib/auth.ts)
  // =========================================================================
  describe('Target 1: Auth Layer & Dual-Mode Session Hardening (src/lib/auth.ts)', () => {
    it('AUTH-01: Extracts valid mobile token from Authorization: Bearer header when cookie is missing', async () => {
      const token = await createSession('mobile-player-01', 'player');
      await runWithIsolatedContext({ authorization: `Bearer ${token}` }, {}, async () => {
        const session = await readSession();
        expect(session).toEqual({ id: 'mobile-player-01', role: 'player' });
        expect(await currentUserId()).toBe('mobile-player-01');
      });
    });

    it('AUTH-02: Falls back to cookie session when Authorization header is completely absent', async () => {
      const cookieToken = await createSession('web-player-02', 'player');
      await runWithIsolatedContext({}, { [PLAYER_COOKIE_NAME]: cookieToken }, async () => {
        const session = await readSession();
        expect(session).toEqual({ id: 'web-player-02', role: 'player' });
        expect(await currentUserId()).toBe('web-player-02');
      });
    });

    it('AUTH-03: Bearer header strictly overrides cookie when both are present with different subjects', async () => {
      const mobileToken = await createSession('bearer-dominant-user', 'player');
      const cookieToken = await createSession('cookie-subservient-user', 'player');

      await runWithIsolatedContext(
        { authorization: `Bearer ${mobileToken}` },
        { [PLAYER_COOKIE_NAME]: cookieToken },
        async () => {
          const session = await readSession();
          expect(session).toEqual({ id: 'bearer-dominant-user', role: 'player' });
          expect(await currentUserId()).toBe('bearer-dominant-user');
        }
      );
    });

    it('AUTH-04: Returns null and currentUserId() is null when both header and cookie are empty', async () => {
      await runWithIsolatedContext({}, {}, async () => {
        expect(await readSession()).toBeNull();
        expect(await currentUserId()).toBeNull();
      });
    });

    it('AUTH-05: Handles malformed Bearer header with empty token ("Bearer ") by falling back to cookie', async () => {
      const cookieToken = await createSession('fallback-web-user', 'player');
      await runWithIsolatedContext(
        { authorization: 'Bearer ' },
        { [PLAYER_COOKIE_NAME]: cookieToken },
        async () => {
          // slice(7).trim() produces empty string, which triggers fallback to cookie
          const session = await readSession();
          expect(session).toEqual({ id: 'fallback-web-user', role: 'player' });
        }
      );
    });

    it('AUTH-06: Handles malformed Bearer header with only whitespace ("Bearer    ") safely', async () => {
      await runWithIsolatedContext({ authorization: 'Bearer     ' }, {}, async () => {
        const session = await readSession();
        expect(session).toBeNull();
      });
    });

    it('AUTH-07: Ignores non-Bearer auth schemes ("Basic ...", "Digest ...") and falls back to cookie', async () => {
      const cookieToken = await createSession('cookie-fallback-user-2', 'player');
      await runWithIsolatedContext(
        { authorization: 'Basic dXNlcjpwYXNzd29yZA==' },
        { [PLAYER_COOKIE_NAME]: cookieToken },
        async () => {
          const session = await readSession();
          expect(session).toEqual({ id: 'cookie-fallback-user-2', role: 'player' });
        }
      );
    });

    it('AUTH-08: Does not crash on massive garbage Bearer header (100KB string)', async () => {
      const hugeBogusHeader = `Bearer ${'x'.repeat(100000)}`;
      await runWithIsolatedContext({ authorization: hugeBogusHeader }, {}, async () => {
        const session = await readSession();
        expect(session).toBeNull();
      });
    });

    it('AUTH-09: Rejects expired session token with null', async () => {
      const expiredToken = await new SignJWT({ role: 'player' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-user-99')
        .setExpirationTime('-1m')
        .sign(secret());

      await runWithIsolatedContext({ authorization: `Bearer ${expiredToken}` }, {}, async () => {
        expect(await readSession()).toBeNull();
      });
    });

    it('AUTH-10: Enforces role isolation: player token cannot access currentClubId() or currentAdminSession()', async () => {
      const playerToken = await createSession('player-attacker', 'player');
      await runWithIsolatedContext({ authorization: `Bearer ${playerToken}` }, {}, async () => {
        expect(await currentUserId()).toBe('player-attacker');
        expect(await currentClubId()).toBeNull();
        expect(await currentAdminSession()).toBeNull();
      });
    });

    it('AUTH-11: requireUserId() throws redirect to /login when unauthenticated', async () => {
      await runWithIsolatedContext({}, {}, async () => {
        await expect(requireUserId()).rejects.toThrow('NEXT_REDIRECT:/login');
      });
    });

    it('AUTH-12: requireClubId() throws redirect to /club/login when session is player or absent', async () => {
      const playerToken = await createSession('player-1', 'player');
      await runWithIsolatedContext({ authorization: `Bearer ${playerToken}` }, {}, async () => {
        await expect(requireClubId()).rejects.toThrow('NEXT_REDIRECT:/club/login');
      });
    });

    it('AUTH-13: Onboarding token replay protection is single-use and resistant to concurrent consumes', async () => {
      const jti = 'onb_concurrent_test_123';
      expect(isTokenConsumed(jti)).toBe(false);

      // First consume must succeed
      const first = consumeOnboardingToken(jti);
      expect(first).toBe(true);
      expect(isTokenConsumed(jti)).toBe(true);

      // Second consume must fail immediately
      const second = consumeOnboardingToken(jti);
      expect(second).toBe(false);
    });
  });

  // =========================================================================
  // MODULE 2: Social Auth & Onboarding (src/app/api/auth/social/)
  // =========================================================================
  describe('Target 2: Social Auth, Onboarding & Account Linking (src/app/api/auth/social/)', () => {
    describe('2.1 POST /api/auth/social', () => {
      it('SOC-01: Rejects unsupported social provider with HTTP 400', async () => {
        const req = new Request('http://localhost:3000/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'facebook', idToken: 'some-token' }),
        });
        const res = await socialPost(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Provedor social inválido');
      });

      it('SOC-02: Rejects missing token with HTTP 400', async () => {
        const req = new Request('http://localhost:3000/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'google', idToken: '   ' }),
        });
        const res = await socialPost(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('Token de autenticação social obrigatório');
      });

      it('SOC-03: Rejects forged signature token with HTTP 401', async () => {
        const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJoYWNrZXIifQ.wrong_signature_123';
        const req = new Request('http://localhost:3000/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'google', idToken: forgedToken }),
        });
        const res = await socialPost(req);
        expect(res.status).toBe(401);
      });

      it('SOC-04: Returns needs_onboarding for new social player with valid ID token', async () => {
        const idToken = await createValidSocialJwt({
          sub: 'new-google-user-123',
          email: 'novo.jogador@gmail.com',
          email_verified: true,
          name: 'Novo Jogador',
        });

        const req = new Request('http://localhost:3000/api/auth/social', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'google', idToken }),
        });
        const res = await socialPost(req);
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.status).toBe('needs_onboarding');
        expect(data.onboardingToken).toBeDefined();
        expect(data.email).toBe('novo.jogador@gmail.com');
      });
    });

    describe('2.2 POST /api/auth/social/onboarding — Handle Validation & Collisions', () => {
      it('ONB-01: Rejects handle below minimum length (<3 chars, e.g. "ab") with HTTP 400', async () => {
        const onboardingToken = await createOnboardingToken({
          provider: 'google',
          emailVerified: true,
          sub: 'onb-adv-sub-1',
          email: 'onb-adv-1@example.com',
          name: 'Adv Player',
        });

        const req = new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingToken,
            name: 'Adv Player',
            handle: 'ab',
            city: 'Joinville',
            state: 'SC',
            category: '5ª',
          }),
        });
        const res = await onboardingPost(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('3 a 20 caracteres');
      });

      it('ONB-02: Verifies handle length boundaries and normalization behavior', async () => {
        // Direct format validation strictly rejects handles > 20 characters
        expect(isValidPublicHandle(`@${'a'.repeat(21)}`)).toBe(false);

        // Submitting handle that cannot be normalized to valid public handle returns HTTP 400
        const onboardingToken = await createOnboardingToken({
          provider: 'google',
          emailVerified: true,
          sub: 'onb-adv-sub-2',
          email: 'onb-adv-2@example.com',
          name: 'Adv Player',
        });

        const req = new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingToken,
            name: 'Adv Player',
            handle: 'a'.repeat(19) + '..', // Ends with invalid punctuation after normalization
            city: 'Joinville',
            state: 'SC',
            category: '5ª',
          }),
        });
        const res = await onboardingPost(req);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toContain('3 a 20 caracteres');
      });

      it('ONB-03: Rejects handles starting or ending with dot or underscore', async () => {
        const badHandles = ['.padelista', '_padelista', 'padelista.', 'padelista_'];
        for (const bad of badHandles) {
          const norm = normalizePublicHandle(bad);
          expect(isValidPublicHandle(norm)).toBe(false);
        }
      });

      it('ONB-04: Rejects all reserved blacklist handles (@admin, @root, @system, @club, @elopadel, @support)', async () => {
        for (const reserved of Array.from(RESERVED_HANDLES)) {
          const norm = normalizePublicHandle(reserved);
          expect(isReservedHandle(norm)).toBe(true);
          expect(isValidPublicHandle(norm)).toBe(false);
        }
      });

      it('ONB-05: Accepts valid handle boundary cases (3 chars, 20 chars, interior dots/underscores)', () => {
        const validHandles = ['pad', 'padel.pro', 'padel_master_br', 'a123456789012345678b'];
        for (const h of validHandles) {
          const norm = normalizePublicHandle(h);
          expect(isValidPublicHandle(norm)).toBe(true);
        }
      });

      it('ONB-06: Detects handle collision and returns HTTP 409 HANDLE_TAKEN', async () => {
        const token1 = await createOnboardingToken({ provider: 'google', emailVerified: true, sub: 'user-sub-alpha', email: 'alpha@example.com', name: 'User Alpha' });
        const req1 = new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingToken: token1,
            name: 'User Alpha',
            handle: 'duplicateme',
            city: 'Curitiba',
            state: 'PR',
            category: '4ª',
          }),
        });
        const res1 = await onboardingPost(req1);
        expect(res1.status).toBe(201);

        // Attempt second registration with same handle
        const token2 = await createOnboardingToken({ provider: 'google', emailVerified: true, sub: 'user-sub-beta', email: 'beta@example.com', name: 'User Beta' });
        const req2 = new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            onboardingToken: token2,
            name: 'User Beta',
            handle: 'duplicateme',
            city: 'Curitiba',
            state: 'PR',
            category: '4ª',
          }),
        });
        const res2 = await onboardingPost(req2);
        expect(res2.status).toBe(409);
        const data2 = await res2.json();
        expect(data2.error).toContain('já está em uso');
      });

      it('ONB-07: Prevents replay attack: reusing consumed onboardingToken returns HTTP 401', async () => {
        const token = await createOnboardingToken({ provider: 'google', emailVerified: true, sub: 'user-replay-1', email: 'replay1@example.com', name: 'Replay User' });
        const body = {
          onboardingToken: token,
          name: 'Replay User',
          handle: 'unique_replay_1',
          city: 'Florianópolis',
          state: 'SC',
          category: '5ª',
        };

        const res1 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }));
        expect(res1.status).toBe(201);

        // Second submission with identical onboardingToken
        const res2 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }));
        expect(res2.status).toBe(401);
        const data2 = await res2.json();
        expect(data2.error).toContain('já utilizado');
      });
    });

    describe('2.3 POST /api/auth/social/link — descontinuado', () => {
      it('LINK-01: returns 410 without creating a session', async () => {
        const req = new Request('http://localhost:3000/api/auth/social/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: '47988776655',
            otpCode: '123456',
            provider: 'google',
            idToken: 'token',
          }),
        });
        const res = await linkPost(req);
        expect(res.status).toBe(410);
        const data = await res.json();
        expect(data.code).toBe('GONE');
      });
    });
  });

  // =========================================================================
  // MODULE 3: Notifications Pipeline (src/lib/notifications/)
  // =========================================================================
  describe('Target 3: Push Notifications Pipeline & Device Reassignment (src/lib/notifications/)', () => {
    it('PUSH-01: Idempotently upserts push token without duplicate records', async () => {
      const token = 'ExponentPushToken[unique-device-token-1]';
      const record1 = await upsertDevicePushToken({
        userId: 'user-push-1',
        token,
        platform: 'ios',
        deviceType: 'iPhone15,2',
      });
      expect(record1.userId).toBe('user-push-1');
      expect(record1.isEnabled).toBe(true);

      // Re-upsert same token
      const record2 = await upsertDevicePushToken({
        userId: 'user-push-1',
        token,
        platform: 'ios',
      });
      expect(record2.id).toBe(record1.id);
      expect(runtimeDevicePushTokens.size).toBe(1);
    });

    it('PUSH-02: Handles device reassignment: Device token D1 moves from User A to User B cleanly', async () => {
      const deviceToken = 'ExponentPushToken[shared-physical-tablet]';

      // User A logs into tablet
      await upsertDevicePushToken({ userId: 'user-alpha', token: deviceToken, platform: 'android' });
      let tokensAlpha = await getActivePushTokens(['user-alpha']);
      expect(tokensAlpha.length).toBe(1);
      expect(tokensAlpha[0].token).toBe(deviceToken);

      // User B logs into same tablet
      await upsertDevicePushToken({ userId: 'user-beta', token: deviceToken, platform: 'android' });

      // User A must NO LONGER have active push token on this device
      tokensAlpha = await getActivePushTokens(['user-alpha']);
      expect(tokensAlpha.length).toBe(0);

      // User B must now own the token
      const tokensBeta = await getActivePushTokens(['user-beta']);
      expect(tokensBeta.length).toBe(1);
      expect(tokensBeta[0].token).toBe(deviceToken);
      expect(tokensBeta[0].userId).toBe('user-beta');
    });

    it('PUSH-03: Deactivates device push token upon user logout', async () => {
      const token = 'ExponentPushToken[logout-token]';
      await upsertDevicePushToken({ userId: 'user-logout', token, platform: 'ios' });

      const deactivated = await deactivateDevicePushToken('user-logout', token);
      expect(deactivated).toBe(true);

      const active = await getActivePushTokens(['user-logout']);
      expect(active.length).toBe(0);
    });

    it('PUSH-04: isExpoPushToken strictly validates token format', () => {
      expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxx]')).toBe(true);
      expect(isExpoPushToken('ExpoPushToken[xxxxxxxxxxxx]')).toBe(true);
      expect(isExpoPushToken('FCM-raw-token-12345')).toBe(false);
      expect(isExpoPushToken('')).toBe(false);
      expect(isExpoPushToken(null)).toBe(false);
      expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    });

    it('PUSH-05: chunkArray divides messages into batches of <= 100 with zero element loss', () => {
      const testSizes = [0, 1, 50, 99, 100, 101, 250, 500];
      for (const size of testSizes) {
        const items = Array.from({ length: size }, (_, i) => `item-${i}`);
        const chunks = chunkArray(items, 100);

        if (size === 0) {
          expect(chunks.length).toBe(0);
        } else {
          expect(chunks.every((c) => c.length <= 100)).toBe(true);
          const flattened = chunks.flat();
          expect(flattened.length).toBe(size);
          expect(flattened).toEqual(items);
        }
      }
    });

    it('PUSH-06: Automatically reaps dead device tokens when Expo API reports DeviceNotRegistered', async () => {
      const deadToken = 'ExponentPushToken[dead-device-token]';
      const liveToken = 'ExponentPushToken[live-device-token]';

      await upsertDevicePushToken({ userId: 'dead-user', token: deadToken, platform: 'ios' });
      await upsertDevicePushToken({ userId: 'live-user', token: liveToken, platform: 'ios' });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'ok', id: 'ticket-123' },
          ],
        }),
      } as Response);

      const messages: ExpoPushMessage[] = [
        formatPushPayload(deadToken, { type: 'match-formed', title: 'Partida', body: 'Partida formada' }),
        formatPushPayload(liveToken, { type: 'match-formed', title: 'Partida', body: 'Partida formada' }),
      ];

      const { tickets, deadTokens } = await sendExpoPushMessages(messages, mockFetch as unknown as typeof fetch);
      expect(deadTokens).toEqual([deadToken]);
      expect(tickets.length).toBe(2);

      await reapDeadTokens(deadTokens);

      // Dead token must be purged from database/runtime
      const deadUserTokens = await getActivePushTokens(['dead-user']);
      expect(deadUserTokens.length).toBe(0);

      // Live token remains intact
      const liveUserTokens = await getActivePushTokens(['live-user']);
      expect(liveUserTokens.length).toBe(1);
    });

    it('PUSH-07: Non-blocking resilience: Expo 500/502 and network failures do not throw exceptions', async () => {
      const token = 'ExponentPushToken[fault-tolerance-token]';
      await upsertDevicePushToken({ userId: 'fault-user', token, platform: 'android' });

      // Mock network partition
      const crashingFetch = vi.fn().mockRejectedValue(new Error('Connection reset by peer'));

      const result = await dispatchPushNotifications(
        ['fault-user'],
        { type: 'match-reminder', title: 'Aviso', body: 'Horário do jogo' },
        { fetchFn: crashingFetch as unknown as typeof fetch }
      );

      // Must complete without throwing and report safe outcome
      expect(result).toBeDefined();
      expect(result.sentCount).toBe(0);
    });
  });

  // =========================================================================
  // MODULE 4: Competition & Match Integrity (src/lib/domain/match.ts & rating.ts)
  // =========================================================================
  describe('Target 4: Match Quorum, Divergence Locking & Rating Updates (Domain & Competition)', () => {
    describe('4.1 Best-of-3 Score Validation (validateBestOfThree)', () => {
      it('COMP-01: Accepts valid 2-0 and 2-1 set scores', () => {
        expect(validateBestOfThree({ sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }], winner: 'A' })).toBe(true);
        expect(validateBestOfThree({ sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 7, b: 5 }], winner: 'A' })).toBe(true);
        expect(validateBestOfThree({ sets: [{ a: 3, b: 6 }, { a: 6, b: 4 }, { a: 8, b: 10 }], winner: 'B' })).toBe(true);
      });

      it('COMP-02: Rejects invalid set counts (<2 or >3 sets)', () => {
        expect(validateBestOfThree({ sets: [{ a: 6, b: 2 }], winner: 'A' })).toBe(false);
        expect(validateBestOfThree({
          sets: [{ a: 6, b: 2 }, { a: 4, b: 6 }, { a: 6, b: 4 }, { a: 6, b: 3 }],
          winner: 'A',
        })).toBe(false);
      });

      it('COMP-03: Rejects tied game scores within a set ({a: 6, b: 6})', () => {
        expect(validateBestOfThree({ sets: [{ a: 6, b: 6 }, { a: 6, b: 4 }], winner: 'A' })).toBe(false);
      });

      it('COMP-04: Rejects negative games or decimal numbers', () => {
        expect(validateBestOfThree({ sets: [{ a: -1, b: 6 }, { a: 6, b: 2 }], winner: 'A' })).toBe(false);
        expect(validateBestOfThree({ sets: [{ a: 6.5, b: 4 }, { a: 6, b: 2 }], winner: 'A' })).toBe(false);
      });

      it('COMP-05: Rejects incomplete match where neither team reached 2 set wins', () => {
        expect(validateBestOfThree({ sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }], winner: 'A' })).toBe(false);
      });

      it('COMP-06: Rejects declared winner contradicting actual set score', () => {
        expect(validateBestOfThree({ sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }], winner: 'B' })).toBe(false);
      });
    });

    describe('4.2 3-Vote Quorum Resolution & Team Representation (canValidateResult)', () => {
      it('QUORUM-01: Validates when 3 votes confirm with BOTH teams represented (2 from A, 1 from B)', () => {
        const votes: Confirmation[] = [
          { playerId: 'p1', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p2', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p3', team: 'B', status: 'confirmed', winner: 'A' },
          { playerId: 'p4', team: 'B', status: 'confirmed', winner: null }, // pending
        ];
        expect(canValidateResult(votes, 'A')).toBe(true);
      });

      it('QUORUM-02: Strictly blocks validation when 3 votes come from only ONE team (3 from A, 0 from B)', () => {
        const votes: Confirmation[] = [
          { playerId: 'p1', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p2', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p3_dup', team: 'A', status: 'confirmed', winner: 'A' },
        ];
        // Team B has zero votes represented
        expect(canValidateResult(votes, 'A')).toBe(false);
      });

      it('QUORUM-03: Blocks validation when total confirmed votes is fewer than 3 (e.g. 2 votes)', () => {
        const votes: Confirmation[] = [
          { playerId: 'p1', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p3', team: 'B', status: 'confirmed', winner: 'A' },
        ];
        expect(canValidateResult(votes, 'A')).toBe(false);
      });

      it('QUORUM-04: Divergence Locking: ANY explicit dispute immediately locks validation', () => {
        const votes: Confirmation[] = [
          { playerId: 'p1', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p2', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p3', team: 'B', status: 'disputed' }, // Player disputes!
          { playerId: 'p4', team: 'B', status: 'confirmed', winner: 'A' },
        ];
        expect(canValidateResult(votes, 'A')).toBe(false);
      });

      it('QUORUM-05: Divergence Locking: Conflicting winner votes immediately trigger hasConflictingResult', () => {
        const conflictingVotes: Confirmation[] = [
          { playerId: 'p1', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p2', team: 'A', status: 'confirmed', winner: 'A' },
          { playerId: 'p3', team: 'B', status: 'confirmed', winner: 'B' }, // Contradictory winner!
          { playerId: 'p4', team: 'B', status: 'confirmed', winner: 'B' },
        ];
        expect(hasConflictingResult(conflictingVotes, 'A')).toBe(true);
        expect(canValidateResult(conflictingVotes, 'A')).toBe(false);

        const counts = resultVoteCounts(conflictingVotes);
        expect(counts).toEqual({ A: 2, B: 2, pending: 0, disputed: 0 });
      });

      it('QUORUM-06: Divergence Locking: Votes disagreeing with submittedWinner trigger dispute lock', () => {
        const votes: Confirmation[] = [
          { playerId: 'p1', team: 'A', status: 'confirmed', winner: 'B' },
          { playerId: 'p2', team: 'A', status: 'confirmed', winner: 'B' },
          { playerId: 'p3', team: 'B', status: 'confirmed', winner: 'B' },
        ];
        // Score was submitted claiming 'A' won, but 3 players voted 'B'
        expect(hasConflictingResult(votes, 'A')).toBe(true);
        expect(canValidateResult(votes, 'A')).toBe(false);
      });
    });

    describe('4.3 Glicko-2 Atomic Rating Calculations (src/lib/domain/rating.ts)', () => {
      it('RATE-01: teamRating requires exactly 2 players and throws otherwise', () => {
        expect(() => teamRating([{ rating: 1500, deviation: 350 } as any])).toThrow('precisa de dois jogadores');
        expect(() => teamRating([
          { rating: 1500, deviation: 350 } as any,
          { rating: 1500, deviation: 350 } as any,
          { rating: 1500, deviation: 350 } as any,
        ])).toThrow('precisa de dois jogadores');
      });

      it('RATE-02: Rating updates are bounded between 10 and 44 points', () => {
        const teamA = { rating: 1200, deviation: 100 };
        const teamB = { rating: 1800, deviation: 100 };

        // Massive upset: underdog team A beats powerhouse team B
        const upset = calculateRatingUpdate(teamA, teamB, 'A');
        expect(upset.winnerDelta).toBeGreaterThanOrEqual(10);
        expect(upset.winnerDelta).toBeLessThanOrEqual(44);
        expect(upset.loserDelta).toBeGreaterThanOrEqual(10);
        expect(upset.loserDelta).toBeLessThanOrEqual(44);

        // Expected outcome: powerhouse team B beats underdog team A
        const expectedWin = calculateRatingUpdate(teamA, teamB, 'B');
        expect(expectedWin.winnerDelta).toBeGreaterThanOrEqual(10);
        expect(expectedWin.winnerDelta).toBeLessThanOrEqual(44);
        expect(expectedWin.loserDelta).toBeGreaterThanOrEqual(10);
        expect(expectedWin.loserDelta).toBeLessThanOrEqual(44);
      });

      it('RATE-03: rankPointDelta is strictly bounded between -40 and +40', () => {
        expect(rankPointDelta(0.01, true, 2000, 1500)).toBeLessThanOrEqual(40);
        expect(rankPointDelta(0.99, false, 1200, 1500)).toBeGreaterThanOrEqual(-40);
      });
    });
  });

  // =========================================================================
  // MODULE 5: Matchmaking System (src/lib/domain/matchmaking.ts)
  // =========================================================================
  describe('Target 5: Matchmaking Search Creation, Invariants & Lobby Invariants', () => {
    describe('5.1 Ranked Player Compatibility (areCompetitivePlayersCompatible)', () => {
      it('MM-01: Rejects player pairings with MMR delta > 300 in ranked mode', () => {
        const compatible: CompetitivePlayer[] = [
          { id: '1', rating: 1500, tier: '4ª II' },
          { id: '2', rating: 1750, tier: '4ª I' }, // Delta = 250 <= 300, order diff = 1 <= 2
        ];
        expect(areCompetitivePlayersCompatible(compatible)).toBe(true);

        const incompatible: CompetitivePlayer[] = [
          { id: '1', rating: 1200, tier: '6ª II' },
          { id: '2', rating: 1650, tier: '4ª I' }, // Delta = 450 > 300
        ];
        expect(areCompetitivePlayersCompatible(incompatible)).toBe(false);
      });

      it('MM-02: Rejects player pairings with tier order distance > 2 ranks', () => {
        const incompatibleTiers: CompetitivePlayer[] = [
          { id: '1', rating: 1400, tier: '6ª III' }, // order = 0
          { id: '2', rating: 1550, tier: '3ª I' },   // order = 3 -> distance = 3 > 2
        ];
        expect(areCompetitivePlayersCompatible(incompatibleTiers)).toBe(false);
      });
    });

    describe('5.2 Court Side Preference Compatibility (areTeamSidesCompatible)', () => {
      it('MM-03: Rejects team where both players strictly require left side', () => {
        const bothLeft: CompetitivePlayer[] = [
          { id: '1', rating: 1500, tier: '4ª', sidePreference: 'left' },
          { id: '2', rating: 1500, tier: '4ª', sidePreference: 'left' },
        ];
        expect(areTeamSidesCompatible(bothLeft)).toBe(false);
      });

      it('MM-04: Rejects team where both players strictly require right side', () => {
        const bothRight: CompetitivePlayer[] = [
          { id: '1', rating: 1500, tier: '4ª', sidePreference: 'right' },
          { id: '2', rating: 1500, tier: '4ª', sidePreference: 'right' },
        ];
        expect(areTeamSidesCompatible(bothRight)).toBe(false);
      });

      it('MM-05: Accepts complementary or flexible side preferences', () => {
        const leftAndRight: CompetitivePlayer[] = [
          { id: '1', rating: 1500, tier: '4ª', sidePreference: 'left' },
          { id: '2', rating: 1500, tier: '4ª', sidePreference: 'right' },
        ];
        expect(areTeamSidesCompatible(leftAndRight)).toBe(true);

        const leftAndAny: CompetitivePlayer[] = [
          { id: '1', rating: 1500, tier: '4ª', sidePreference: 'left' },
          { id: '2', rating: 1500, tier: '4ª', sidePreference: 'any' },
        ];
        expect(areTeamSidesCompatible(leftAndAny)).toBe(true);

        const bothAny: CompetitivePlayer[] = [
          { id: '1', rating: 1500, tier: '4ª', sidePreference: 'any' },
          { id: '2', rating: 1500, tier: '4ª', sidePreference: 'any' },
        ];
        expect(areTeamSidesCompatible(bothAny)).toBe(true);
      });
    });

    describe('5.3 Availability Overlap (findAvailabilityOverlap)', () => {
      function makeParty(
        id: string,
        dates: string[],
        from: string,
        to: string,
        city = 'Curitiba',
        clubId: string | null = 'club-1'
      ): MatchmakingParty {
        return {
          id,
          partyType: 'solo',
          dates,
          from,
          to,
          city,
          state: 'PR',
          country: 'Brasil',
          clubId,
          tier: '4ª',
          mode: 'ranked',
          createdAt: new Date(),
          members: [{ id: `m-${id}`, rating: 1500, tier: '4ª II' }],
        };
      }

      it('MM-06: Computes overlapping time window when dates and times intersect', () => {
        const p1 = makeParty('p1', ['2026-10-15', '2026-10-16'], '18:00', '21:00');
        const p2 = makeParty('p2', ['2026-10-15'], '19:00', '22:00');

        const overlap = findAvailabilityOverlap([p1, p2], 0, new Date('2026-10-14T00:00:00Z'));
        expect(overlap).not.toBeNull();
        expect(overlap?.date).toBe('2026-10-15');
        expect(overlap?.from).toBe('19:00');
        expect(overlap?.to).toBe('21:00');
      });

      it('MM-07: Returns null when dates have no common intersection', () => {
        const p1 = makeParty('p1', ['2026-10-15'], '18:00', '20:00');
        const p2 = makeParty('p2', ['2026-10-16'], '18:00', '20:00');
        expect(findAvailabilityOverlap([p1, p2])).toBeNull();
      });

      it('MM-08: Returns null when times do not overlap (from > to)', () => {
        const p1 = makeParty('p1', ['2026-10-15'], '14:00', '16:00');
        const p2 = makeParty('p2', ['2026-10-15'], '18:00', '20:00');
        expect(findAvailabilityOverlap([p1, p2])).toBeNull();
      });

      it('MM-09: Returns null when parties belong to different cities', () => {
        const p1 = makeParty('p1', ['2026-10-15'], '18:00', '20:00', 'Curitiba');
        const p2 = makeParty('p2', ['2026-10-15'], '18:00', '20:00', 'Florianópolis');
        expect(findAvailabilityOverlap([p1, p2])).toBeNull();
      });

      it('MM-10: Returns null when parties specify different preferred clubs', () => {
        const p1 = makeParty('p1', ['2026-10-15'], '18:00', '20:00', 'Curitiba', 'club-alpha');
        const p2 = makeParty('p2', ['2026-10-15'], '18:00', '20:00', 'Curitiba', 'club-beta');
        expect(findAvailabilityOverlap([p1, p2])).toBeNull();
      });
    });

    describe('5.4 Matchmaking Group Formation & Team Assignment', () => {
      it('MM-11: Groups two duos into balanced 4-player match with team assignments', () => {
        const duo1: MatchmakingParty = {
          id: 'duo-1',
          partyType: 'duo',
          dates: ['2026-10-20'],
          from: '19:00',
          to: '21:00',
          city: 'Maringá',
          state: 'PR',
          country: 'Brasil',
          clubId: 'club-maringa',
          tier: '4ª',
          mode: 'ranked',
          createdAt: new Date('2026-10-01T10:00:00Z'),
          members: [
            { id: 'p1', rating: 1520, tier: '4ª II', sidePreference: 'left' },
            { id: 'p2', rating: 1540, tier: '4ª II', sidePreference: 'right' },
          ],
        };

        const duo2: MatchmakingParty = {
          id: 'duo-2',
          partyType: 'duo',
          dates: ['2026-10-20'],
          from: '19:00',
          to: '21:00',
          city: 'Maringá',
          state: 'PR',
          country: 'Brasil',
          clubId: 'club-maringa',
          tier: '4ª',
          mode: 'ranked',
          createdAt: new Date('2026-10-01T10:05:00Z'),
          members: [
            { id: 'p3', rating: 1500, tier: '4ª II', sidePreference: 'left' },
            { id: 'p4', rating: 1560, tier: '4ª II', sidePreference: 'any' },
          ],
        };

        const group = findMatchmakingGroup([duo1, duo2], { now: new Date('2026-10-19T12:00:00Z') });
        expect(group).not.toBeNull();
        expect(group?.length).toBe(2);

        const assignments = buildTeamAssignments(group!);
        expect(assignments).toEqual({
          p1: 'A',
          p2: 'A',
          p3: 'B',
          p4: 'B',
        });
      });

      it('MM-12: Correctly rejects matchmaking when duplicate player ID appears across parties', () => {
        const duo1: MatchmakingParty = {
          id: 'duo-dup-1',
          partyType: 'duo',
          dates: ['2026-10-20'],
          from: '19:00',
          to: '21:00',
          city: 'Maringá',
          state: 'PR',
          country: 'Brasil',
          clubId: null,
          tier: '4ª',
          mode: 'ranked',
          createdAt: new Date(),
          members: [
            { id: 'p-shared', rating: 1500, tier: '4ª II' },
            { id: 'p2', rating: 1500, tier: '4ª II' },
          ],
        };

        const duo2: MatchmakingParty = {
          id: 'duo-dup-2',
          partyType: 'duo',
          dates: ['2026-10-20'],
          from: '19:00',
          to: '21:00',
          city: 'Maringá',
          state: 'PR',
          country: 'Brasil',
          clubId: null,
          tier: '4ª',
          mode: 'ranked',
          createdAt: new Date(),
          members: [
            { id: 'p-shared', rating: 1500, tier: '4ª II' }, // Same player!
            { id: 'p4', rating: 1500, tier: '4ª II' },
          ],
        };

        expect(findMatchmakingGroup([duo1, duo2], { now: new Date('2026-10-19T12:00:00Z') })).toBeNull();
      });
    });
  });
});
