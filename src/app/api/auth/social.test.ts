import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { clearConsumedTokens, createOnboardingToken, createSession, PLAYER_COOKIE_NAME } from '@/lib/auth';
import { POST as socialPost } from './social/route';
import { POST as onboardingPost } from './social/onboarding/route';
import { POST as linkPost } from './social/link/route';
import { clearRuntimeOAuthStore, runtimeUsersByPhone } from './social/service';

import { POST as verifyOtpPost } from './verify-otp/route';
import { GET as meGet } from '../me/route';
import { GET as historyGet } from '../history/route';
import { GET as seasonGet } from '../season/route';
import { createPlayer, issueOtp } from '@/lib/runtime-store';

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

async function createMockSocialToken(payload: { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('1h')
    .sign(secret());
}

describe('Social Authentication & Mobile Read APIs', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    clearRuntimeOAuthStore();
    clearConsumedTokens();
    vi.clearAllMocks();
  });


  describe('POST /api/auth/social', () => {
    it('returns 400 when provider is missing or invalid', async () => {
      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'facebook', token: 'some-token' }),
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Provedor social inválido');
    });

    it('returns 400 when token is missing', async () => {
      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google' }),
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Token de autenticação social');
    });

    it('returns status: needs_onboarding for new social user', async () => {
      const token = await createMockSocialToken({
        sub: `google-user-${Date.now()}`,
        email: `new-player-${Date.now()}@example.com`,
        email_verified: true,
        name: 'Novo Jogador',
      });

      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: token }),
      }));

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe('needs_onboarding');
      expect(typeof data.onboardingToken).toBe('string');
      expect(data.name).toBe('Novo Jogador');
      expect(data.profile.email).toContain('@example.com');
    });

    it('rejects bogus token with HTTP 401', async () => {
      const bogusToken = 'invalid.jwt.token';
      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: bogusToken }),
      }));
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBeDefined();
    });

    it('rejects new onboarding when Google does not provide an email', async () => {
      const token = await createMockSocialToken({
        sub: `google-no-email-${Date.now()}`,
      });

      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: token }),
      }));

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
      expect(data.onboardingToken).toBeUndefined();
    });

    it('rejects new onboarding when the Google email is not verified', async () => {
      const email = `unverified-${Date.now()}@example.com`;
      const existingUser = createPlayer({
        phone: '11999112233',
        displayName: 'Victim User',
        handle: `@victim_${Date.now().toString().slice(-5)}`,
        city: 'São Paulo',
        state: 'SP',
        category: '4ª',
      });
      runtimeUsersByPhone.set(existingUser.id, {
        id: existingUser.id,
        displayName: existingUser.displayName,
        handle: existingUser.handle,
        city: existingUser.city,
        state: existingUser.state,
        country: existingUser.country,
        isActive: true,
        email,
      });

      const unverifiedToken = await new SignJWT({
        sub: `google-unverified-${Date.now()}`,
        email,
        email_verified: false,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(`google-unverified-${Date.now()}`)
        .setExpirationTime('1h')
        .sign(secret());

      const res = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: unverifiedToken }),
      }));

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
      expect(data.onboardingToken).toBeUndefined();
    });
  });


  describe('POST /api/auth/social/onboarding', () => {
    it('returns 400 when onboardingToken is missing', async () => {
      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: '@novo_atleta' }),
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Token de onboarding');
    });

    it('returns 401 when onboardingToken is invalid', async () => {
      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken: 'tampered.token',
          name: 'Teste',
          handle: '@teste_123',
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      }));
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Token de onboarding inválido');
    });

    it('returns 400 when required fields are missing', async () => {
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'sub-missing-fields',
        email: 'missing@example.com',
      });

      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken,
          handle: '@valid_handle',
          // missing name, city, state, category
        }),
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('obrigatórios para concluir o cadastro');
    });

    it('returns 400 when handle is invalid (under 3 characters or bad symbols)', async () => {
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: 'sub-bad-handle',
        email: 'badhandle@example.com',
        name: 'Bad Handle',
      });

      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken,
          name: 'Bad Handle',
          handle: '@ab',
          city: 'São Paulo',
          state: 'SP',
          category: '5ª',
        }),
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Escolha uma arroba');
    });

    it('successfully registers new user and returns session token and profile', async () => {
      const uniqueSub = `google-unique-${Date.now()}`;
      const uniqueHandle = `@atleta_${Date.now().toString().slice(-6)}`;
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: uniqueSub,
        email: `atleta_${Date.now()}@gmail.com`,
        name: 'Atleta Social',
      });

      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken,
          handle: uniqueHandle,
          city: 'Balneário Camboriú',
          state: 'SC',
          category: '5ª',
        }),
      }));

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe('authenticated');
      expect(typeof data.token).toBe('string');
      expect(data.user.handle).toBe(uniqueHandle);
      expect(data.user.city).toBe('Balneário Camboriú');
      expect(data.user.tier).toBe('5ª II');

      // Now verify that logging in again with that social token directly authenticates
      const socialLoginToken = await createMockSocialToken({ sub: uniqueSub });
      const loginRes = await socialPost(new Request('http://localhost:3000/api/auth/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: socialLoginToken }),
      }));

      expect(loginRes.status).toBe(200);
      const loginData = await loginRes.json();
      expect(loginData.status).toBe('authenticated');
      expect(loginData.user.handle).toBe(uniqueHandle);
    });

    it('rejects reserved handle with HTTP 400', async () => {
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: `sub-reserved-${Date.now()}`,
        email: 'admin_test@example.com',
        name: 'Admin Test',
      });

      const res = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken,
          handle: '@admin',
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Escolha uma arroba');
    });

    it('rejects replayed onboarding token with HTTP 401', async () => {
      const onboardingToken = await createOnboardingToken({
        provider: 'google',
        emailVerified: true,
        sub: `sub-replay-${Date.now()}`,
        email: `replay-test-${Date.now()}@example.com`,
        name: 'Replay Test',
      });

      const res1 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken,
          handle: `@valid_${Date.now().toString().slice(-6)}`,
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      }));
      expect(res1.status).toBe(201);

      const res2 = await onboardingPost(new Request('http://localhost:3000/api/auth/social/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          onboardingToken,
          handle: `@another_${Date.now().toString().slice(-6)}`,
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        }),
      }));
      expect(res2.status).toBe(401);
    });
  });

  describe('POST /api/auth/social/link (descontinuado)', () => {
    it('returns 410 without creating a session', async () => {
      const res = await linkPost(new Request('http://localhost:3000/api/auth/social/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '47999887766', otpCode: '123456' }),
      }));
      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.code).toBe('GONE');
      expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
    });
  });


  describe('Mobile Read Endpoints: /api/me, /api/history, /api/season', () => {
    it('GET /api/me returns 401 when unauthenticated', async () => {
      const res = await meGet();
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain('Não autenticado');
    });

    it('GET /api/me returns full profile when authenticated via Bearer token', async () => {
      const player = createPlayer({
        phone: '41999991122',
        displayName: 'Atleta Perfil Teste',
        handle: `@perfil_${Date.now().toString().slice(-5)}`,
        city: 'Curitiba',
        state: 'PR',
        category: '5ª',
      });
      const sessionToken = await createSession(player.id, 'player');
      mockHeadersMap.set('authorization', `Bearer ${sessionToken}`);

      const res = await meGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.player).toBeDefined();
      expect(data.player.displayName).toBe('Atleta Perfil Teste');
      expect(data.player.rating).toBeDefined();
      expect(data.player.rank).toBeDefined();
      expect(typeof data.player.winRate).toBe('number');
    });

    it('GET /api/history returns 401 when unauthenticated', async () => {
      const res = await historyGet();
      expect(res.status).toBe(401);
    });

    it('GET /api/history returns match history when authenticated', async () => {
      const sessionToken = await createSession('player-history-test', 'player');
      mockHeadersMap.set('authorization', `Bearer ${sessionToken}`);

      const res = await historyGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.wins).toBe('number');
    });

    it('GET /api/season returns 401 when unauthenticated', async () => {
      const res = await seasonGet();
      expect(res.status).toBe(401);
    });

    it('GET /api/season returns season info when authenticated', async () => {
      const sessionToken = await createSession('player-season-test', 'player');
      mockHeadersMap.set('authorization', `Bearer ${sessionToken}`);

      const res = await seasonGet();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.name).toBeDefined();
      expect(typeof data.points).toBe('number');
    });
  });

  describe('POST /api/auth/verify-otp (descontinuado)', () => {
    it('returns 410 without creating a session', async () => {
      const res = await verifyOtpPost(new Request('http://localhost:3000/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '11999998888', code: '123456' }),
      }));

      expect(res.status).toBe(410);
      const data = await res.json();
      expect(data.code).toBe('GONE');
      expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
    });
  });
});
