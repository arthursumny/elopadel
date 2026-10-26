import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConsumedTokens, PLAYER_COOKIE_NAME, readSession, verifySessionToken } from '@/lib/auth';
import { clearRateLimits } from '@/lib/security/rate-limit';
import { clearRuntimeSessionVersions } from '@/lib/security/session-version';
import {
  clearEmailAuthRuntime,
  hashNewPassword,
  issueEmailVerificationToken,
  issuePasswordResetToken,
  registerEmailAccount,
  resetEmailPassword,
  verifyEmailAddress,
} from '@/app/api/auth/email/service';
import { POST as loginPost } from '@/app/api/auth/email/login/route';

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

const gate = vi.hoisted(() => {
  let reachResolve = () => {};
  let releaseResolve = () => {};
  const reached = new Promise<void>((resolve) => {
    reachResolve = resolve;
  });
  const released = new Promise<void>((resolve) => {
    releaseResolve = resolve;
  });
  return {
    reached,
    released,
    armed: false,
    pause: () => {
      reachResolve();
      return released;
    },
    release: () => releaseResolve(),
  };
});

vi.mock('@/lib/security/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/security/password')>();
  return {
    ...actual,
    verifyPassword: async (password: string, storedHash: string) => {
      if (gate.armed) {
        gate.armed = false;
        await gate.pause();
      }
      return actual.verifyPassword(password, storedHash);
    },
  };
});

function loginRequest(email: string, password: string) {
  return new Request('http://localhost:3000/api/auth/email/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
}

describe('Email login/password-reset race', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    clearEmailAuthRuntime();
    clearRateLimits();
    clearRuntimeSessionVersions();
    clearConsumedTokens();
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-with-more-than-32-characters');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.elopadel.test');
    vi.stubEnv('EMAIL_PROVIDER_URL', 'https://mail.provider.test/send');
    vi.stubEnv('EMAIL_PROVIDER_TOKEN', 'mail-token-secret');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    gatewayRelease();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function gatewayRelease() {
    gate.armed = false;
    gate.release();
  }

  it('uses the credential snapshot version so a reset during scrypt invalidates both JWT and cookie', async () => {
    const email = `race_${Date.now()}@example.com`;
    const oldPassword = 'senha-antiga-race-000';
    const newPassword = 'senha-nova-race-111';

    const registration = await registerEmailAccount({
      email,
      passwordHash: await hashNewPassword(oldPassword),
      name: 'Race Login',
      handle: `@race${Date.now().toString(36)}`.slice(0, 20),
      city: 'Curitiba',
      state: 'PR',
      category: '5ª',
    });
    const verifyToken = await issueEmailVerificationToken(registration.userId);
    await verifyEmailAddress(verifyToken, await hashNewPassword(oldPassword));

    gate.armed = true;
    const loginPromise = loginPost(loginRequest(email, oldPassword));
    await gate.reached;

    // Reset completes after the login credential snapshot but before login
    // returns; the password hash validated by the login is now stale.
    const resetToken = await issuePasswordResetToken(registration.userId);
    await resetEmailPassword(resetToken, await hashNewPassword(newPassword));

    gate.release();
    const loginResponse = await loginPromise;
    expect(loginResponse.status).toBe(200);
    const loginData = await loginResponse.json();
    expect(typeof loginData.token).toBe('string');

    const cookie = mockCookiesMap.get(PLAYER_COOKIE_NAME);
    expect(cookie?.value).toBe(loginData.token);

    expect(await verifySessionToken(loginData.token)).toBeNull();
    expect(await readSession()).toBeNull();

    const resetLogin = await loginPost(loginRequest(email, newPassword));
    expect(resetLogin.status).toBe(200);
    const resetData = await resetLogin.json();
    expect(await verifySessionToken(resetData.token)).not.toBeNull();
  });
});
