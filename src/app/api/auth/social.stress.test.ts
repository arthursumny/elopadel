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
} from '@/lib/auth';
import { POST as socialPost } from './social/route';
import { POST as onboardingPost } from './social/onboarding/route';
import { POST as linkPost } from './social/link/route';
import { verifySocialToken, runtimeUsersByPhone } from './social/service';
import { GET as meGet } from '../me/route';
import { GET as historyGet } from '../history/route';
import { GET as seasonGet } from '../season/route';
import { createPlayer, getPlayer, issueOtp } from '@/lib/runtime-store';
import { normalizePublicHandle, isValidPublicHandle } from '@/lib/handles';

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

async function createValidSocialToken(payload: { sub: string; email?: string; name?: string; picture?: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('1h')
    .sign(secret());
}

describe('Milestone 1 Empirical Stress Tests & Adversarial Challenge Harness', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    vi.clearAllMocks();
  });

  // =========================================================================
  // CATEGORY 1: Token Validation, Forgery & Cryptographic Integrity
  // =========================================================================
  describe('Category 1: Token Validation & Cryptographic Vulnerabilities', () => {
    it('strictly rejects an unverified forged JWT with bogus signature in verifySocialToken', async () => {
      // Craft an unverified token with a bogus signature
      const bogusToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmb3JnZWQtc3ViLTEyMyIsImVtYWlsIjoiZm9yZ2VkQGV4YW1wbGUuY29tIiwibmFtZSI6IkF0dGFja2VyIn0.bogus_signature_not_signed_by_secret';

      let accepted = false;
      try {
        const profile = await verifySocialToken({ provider: 'google', token: bogusToken });
        if (profile && profile.sub === 'forged-sub-123') {
          accepted = true;
        }
      } catch {
        accepted = false;
      }

      // Forged token must be rejected
      expect(accepted).toBe(false);
    });

    it('rejects social login takeover attempt via forged JWT with HTTP 401', async () => {
      const forgedVictimSub = `hacker-crafted-sub-${Date.now()}`;
      const forgedToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIke2ZvcmdlZFZpY3RpbVN1Yn0iLCJlbWFpbCI6InZpY3RpbUBnbWFpbC5jb20iLCJuYW1lIjoiVmljdGltIFBsYXllciJ9.invalid_signature_382910`;

      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: forgedToken }),
      }));

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('inválida ou expirada');
    });


    it('rejects tampered session token and does NOT fall back to cookie if bearer header is present', async () => {
      const validCookieToken = await createSession('legit-web-user', 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: validCookieToken });

      // Attacker or broken client passes malformed Bearer header
      mockHeadersMap.set('authorization', 'Bearer tampered.bearer.token');

      const session = await readSession();
      // Must NOT silently use validCookieToken! It must return null!
      expect(session).toBeNull();

      const userId = await currentUserId();
      expect(userId).toBeNull();
    });

    it('enforces strict role separation between player, club, and admin sessions', async () => {
      const playerToken = await createSession('player-attacker', 'player');
      mockHeadersMap.set('authorization', `Bearer ${playerToken}`);

      // Player token must NOT grant club or admin privileges
      expect(await currentUserId()).toBe('player-attacker');
      expect(await currentClubId()).toBeNull();
      expect(await currentAdminSession()).toBeNull();

      // Club token must NOT grant player or admin privileges
      const clubToken = await createSession('club-central', 'club');
      mockHeadersMap.set('authorization', `Bearer ${clubToken}`);
      expect(await currentUserId()).toBeNull();
      expect(await currentClubId()).toBe('club-central');
      expect(await currentAdminSession()).toBeNull();

      // Forged admin token with non-admin subject must NOT grant admin access
      const forgedAdminToken = await createSession('imposter', 'admin');
      mockHeadersMap.set('authorization', `Bearer ${forgedAdminToken}`);
      expect(await currentAdminSession()).toBeNull(); // Requires id === 'admin'
    });

    it('rejects onboarding token when presented as session token in readSession', async () => {
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'sub-attempting-session',
        email: 'session-attempt@example.com',
      });

      mockHeadersMap.set('authorization', `Bearer ${onboardingToken}`);
      const session = await readSession();
      expect(session).toBeNull();
      expect(await currentUserId()).toBeNull();
    });

    it('rejects expired onboarding tokens (>15 minutes)', async () => {
      const expiredOnboarding = await new SignJWT({
        provider: 'google',
        sub: 'expired-sub',
        purpose: 'onboarding',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('expired-sub')
        .setExpirationTime('-10s')
        .sign(secret());

      const payload = await verifyOnboardingToken(expiredOnboarding);
      expect(payload).toBeNull();

      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: expiredOnboarding,
          handle: '@valid_handle',
          name: 'Expired Test',
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      }));
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('inválido ou expirado');
    });
  });

  // =========================================================================
  // CATEGORY 2: Onboarding Collisions, Normalization & Replay Attacks
  // =========================================================================
  describe('Category 2: Onboarding Collisions & Handle Validation', () => {
    it('strictly enforces 3-20 characters for handles, rejecting 1-character and 2-character handles', () => {
      // Contract specifies 3-20 characters: @a (1 char) and @ab (2 chars) must be rejected
      expect(isValidPublicHandle('@a')).toBe(false);
      expect(isValidPublicHandle('@ab')).toBe(false);
      expect(isValidPublicHandle('@abc')).toBe(true);
      expect(isValidPublicHandle('@')).toBe(false);

      expect(isValidPublicHandle('@valid_handle1')).toBe(true);
      expect(isValidPublicHandle('@valid.handle')).toBe(true);
      expect(isValidPublicHandle('@toolong12345678901234567890')).toBe(false); // > 20 chars

      // Normalization of spaces and accents
      expect(normalizePublicHandle('  @Carlos Padel  ')).toBe('@carlos_padel');
      expect(normalizePublicHandle('João Padel')).toBe('@joao_padel');
    });

    it('rejects onboarding with missing required fields with HTTP 400', async () => {
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: `sub-fields-${Date.now()}`,
        email: `fields-${Date.now()}@example.com`,
      });

      // Missing category
      const res1 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          handle: '@valid_handle',
          name: 'Jogador',
          city: 'Curitiba',
          state: 'PR',
        }),
      }));
      expect(res1.status).toBe(400);

      // Missing city & state
      const res2 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          handle: '@valid_handle',
          name: 'Jogador',
          category: '5ª',
        }),
      }));
      expect(res2.status).toBe(400);
    });

    it('ADVERSARIAL: tests replay attack on onboardingToken with different profile details', async () => {
      const sharedSub = `google-sub-replay-${Date.now()}`;
      const token = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: sharedSub,
        email: `replay_${Date.now()}@gmail.com`,
      });

      // First onboarding attempt
      const res1 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          handle: `@original_${Date.now().toString().slice(-5)}`,
          name: 'Original Player',
          city: 'Joinville',
          state: 'SC',
          category: '5ª',
        }),
      }));
      expect(res1.status).toBe(201);
      const data1 = await res1.json();
      const user1Id = data1.user.id;

      // Replaying the token with different handle and name
      const res2 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: token,
          handle: `@attacker_${Date.now().toString().slice(-5)}`,
          name: 'Attacker Player',
          city: 'Blumenau',
          state: 'SC',
          category: '4ª',
        }),
      }));

      // Single-use token must be rejected upon replay
      expect(res2.status).toBe(401);
      const data2 = await res2.json();
      expect(data2.error).toContain('já utilizado ou expirado');

      // When social login occurs, it must resolve to the legitimate first user
      const loginToken = await createValidSocialToken({ sub: sharedSub });
      const loginRes = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: loginToken }),
      }));

      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData.user.id).toBe(user1Id);
    });

  });

  // =========================================================================
  // CATEGORY 3: Discontinued Phone/OTP Flows
  // =========================================================================
  describe('Category 3: Phone/OTP Flows Are Gone', () => {
    it('returns 410 for the social link endpoint regardless of payload', async () => {
      const res = await linkPost(new Request('http://localhost:3000/api/auth/social/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '41987654321', otpCode: '123456' }),
      }));

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.code).toBe('GONE');
      expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
    });

    it('rejects legacy Apple onboarding tokens even when correctly signed', async () => {
      const appleToken = await new SignJWT({
        provider: 'apple',
        purpose: 'onboarding',
        email: 'legacy@icloud.com',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject('legacy-apple-sub')
        .setJti(`legacy-${Date.now()}`)
        .setExpirationTime('15m')
        .sign(secret());

      expect(await verifyOnboardingToken(appleToken)).toBeNull();

      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: appleToken,
          handle: `@legacy_${Date.now().toString().slice(-5)}`,
          name: 'Legacy Apple',
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      }));
      expect(res.status).toBe(401);
    });
  });

  // =========================================================================
  // CATEGORY 4: Mobile Read Parity Endpoints
  // =========================================================================
  describe('Category 4: Mobile Parity Endpoints Under Boundary Conditions', () => {
    it('GET /api/me safely handles brand new player with 0 matches (no division by zero)', async () => {
      const newPlayer = createPlayer({
        phone: '41912345678',
        displayName: 'Atleta Estreante',
        handle: `@estreante_${Date.now().toString().slice(-4)}`,
        city: 'Curitiba',
        state: 'PR',
        category: '6ª',
      });

      const sessionToken = await createSession(newPlayer.id, 'player');
      mockHeadersMap.set('authorization', `Bearer ${sessionToken}`);

      const res = await meGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.player.winRate).toBe(0);
      expect(data.player.totalMatches).toBe(0);
    });

    it('rejects access to /api/me and /api/history when token has non-player role', async () => {
      const clubToken = await createSession('club-id', 'club');
      mockHeadersMap.set('authorization', `Bearer ${clubToken}`);

      const meRes = await meGet();
      expect(meRes.status).toBe(401);

      const historyRes = await historyGet();
      expect(historyRes.status).toBe(401);
    });
  });
});
