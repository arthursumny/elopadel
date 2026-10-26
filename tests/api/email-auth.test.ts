import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT } from 'jose';
import { clearConsumedTokens, createSession, getAuthSecret, PLAYER_COOKIE_NAME, readSession, verifySessionToken } from '@/lib/auth';
import { hashEmailToken } from '@/lib/security/email-tokens';
import { clearRateLimits, consumeRateLimit } from '@/lib/security/rate-limit';
import { clearRuntimeSessionVersions } from '@/lib/security/session-version';
import { POST as registerPost } from '@/app/api/auth/email/register/route';
import { POST as loginPost } from '@/app/api/auth/email/login/route';
import { POST as verifyPost } from '@/app/api/auth/email/verify/route';
import { POST as forgotPost } from '@/app/api/auth/email/forgot-password/route';
import { POST as resetPost } from '@/app/api/auth/email/reset-password/route';
import { POST as socialPost } from '@/app/api/auth/social/route';
import { POST as onboardingPost } from '@/app/api/auth/social/onboarding/route';
import { POST as requestOtpPost } from '@/app/api/auth/request-otp/route';
import { POST as verifyOtpPost } from '@/app/api/auth/verify-otp/route';
import {
  clearEmailAuthRuntime,
  runtimeAuthTokens,
  runtimeEmailAccounts,
} from '@/app/api/auth/email/service';
import { clearRuntimeOAuthStore, runtimeUsersByPhone } from '@/app/api/auth/social/service';
import { createPlayer, getPlayer } from '@/lib/runtime-store';

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

const PASSWORD = 'senha-super-segura-10';
let fetchMock: ReturnType<typeof vi.fn>;

function emailBody(overrides: Record<string, unknown> = {}) {
  return {
    email: `atleta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`,
    password: PASSWORD,
    name: 'Atleta Email',
    handle: `@email_${Date.now().toString().slice(-6)}_${Math.random().toString(36).slice(2, 5)}`,
    city: 'Curitiba',
    state: 'PR',
    category: '5ª',
    ...overrides,
  };
}

function jsonRequest(url: string, body: Record<string, unknown>) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function lastEmailPayload(): { to: string; subject: string; text: string; html?: string } {
  const calls = fetchMock.mock.calls;
  const requestInit = calls[calls.length - 1][1] as RequestInit;
  return JSON.parse(String(requestInit.body));
}

function tokenFromLastEmail(param: 'emailToken' | 'resetToken'): string {
  const text = lastEmailPayload().text;
  const match = text.match(new RegExp(`${param}=([^\\s&]+)`));
  if (!match) throw new Error(`Token ${param} não encontrado no email`);
  return decodeURIComponent(match[1]);
}

async function register(overrides: Record<string, unknown> = {}) {
  const body = emailBody(overrides);
  const res = await registerPost(jsonRequest('http://localhost:3000/api/auth/email/register', body));
  return { res, body };
}

async function registerAndVerify(overrides: Record<string, unknown> = {}) {
  const { res, body } = await register(overrides);
  expect(res.status).toBe(200);
  const token = tokenFromLastEmail('emailToken');
  const verifyRes = await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', { token, password: PASSWORD }));
  expect(verifyRes.status).toBe(200);
  return { body, email: body.email as string };
}

function googleToken(payload: { sub: string; email?: string; email_verified?: boolean; name?: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setExpirationTime('1h')
    .sign(getAuthSecret());
}

describe('Email/password authentication', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    clearEmailAuthRuntime();
    clearRuntimeOAuthStore();
    clearConsumedTokens();
    clearRateLimits();
    clearRuntimeSessionVersions();
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('AUTH_SECRET', 'test-auth-secret-with-more-than-32-characters');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.elopadel.test');
    vi.stubEnv('EMAIL_PROVIDER_URL', 'https://mail.provider.test/send');
    vi.stubEnv('EMAIL_PROVIDER_TOKEN', 'mail-token-secret');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'google-client-id');
    vi.stubEnv('NODE_ENV', 'test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('registers, stores only hashes and sends a verification link', async () => {
    const { res, body } = await register({ email: `  ${emailBody().email.toUpperCase()}  ` });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe('verification_required');
    expect(typeof data.message).toBe('string');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(requestInit.method).toBe('POST');
    expect((requestInit.headers as Record<string, string>).Authorization).toBe('Bearer mail-token-secret');
    const payload = lastEmailPayload();
    expect(payload.to).toBe((body.email as string).trim().toLowerCase());
    expect(payload.subject).toContain('Confirme');
    expect(payload.text).toContain('/login?emailToken=');
    expect(payload.text).toContain('https://app.elopadel.test/login?emailToken=');
    expect(typeof payload.html).toBe('string');

    const rawToken = tokenFromLastEmail('emailToken');
    expect(JSON.stringify(data)).not.toContain(rawToken);

    const account = Array.from(runtimeEmailAccounts.values())[0];
    expect(account.passwordHash).not.toContain(PASSWORD);
    expect(account.passwordHash).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/);

    const storedToken = runtimeAuthTokens.get(hashEmailToken(rawToken));
    expect(storedToken).toBeDefined();
    expect([...runtimeAuthTokens.keys()]).not.toContain(rawToken);
  });

  it('blocks login before email verification and accepts login after verification', async () => {
    const { body } = await register();

    const before = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: body.email,
      password: PASSWORD,
    }));
    expect(before.status).toBe(403);
    expect((await before.json()).error).toContain('Confirme seu email');
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();

    const token = tokenFromLastEmail('emailToken');
    const verify = await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', { token, password: PASSWORD }));
    expect(verify.status).toBe(200);
    const verified = await verify.json();
    expect(verified).toEqual({ ok: true, message: 'Email verificado com sucesso. Você já pode entrar.' });
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();

    const login = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: ` ${String(body.email).toUpperCase()} `,
      password: PASSWORD,
    }));
    expect(login.status).toBe(200);
    const session = await login.json();
    expect(session.ok).toBe(true);
    expect(session.status).toBe('authenticated');
    expect(typeof session.token).toBe('string');
    expect(session.user.id).toBe(Array.from(runtimeEmailAccounts.values())[0].userId);
    expect(session.player).toEqual(session.user);
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeDefined();
  });

  it('neutralizes pre-registration takeover: the victim defines the password at verification', async () => {
    const victimEmail = `vitima_${Date.now()}@example.com`;
    const attackerPassword = 'senha-do-atacante-123';
    const victimPassword = 'senha-da-vitima-456';

    // Attacker pre-registers the victim's email with their own password.
    const attacked = await register({ email: victimEmail, password: attackerPassword });
    expect(attacked.res.status).toBe(200);
    const token = tokenFromLastEmail('emailToken');

    // The verification contract requires the new password chosen by the email owner.
    const noPassword = await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', { token }));
    expect(noPassword.status).toBe(400);
    expect((await noPassword.json()).error).toContain('senha');

    const verified = await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', {
      token,
      password: victimPassword,
    }));
    expect(verified.status).toBe(200);

    const attackerLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: victimEmail,
      password: attackerPassword,
    }));
    expect(attackerLogin.status).toBe(401);

    const victimLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: victimEmail,
      password: victimPassword,
    }));
    expect(victimLogin.status).toBe(200);
    expect(runtimeEmailAccounts.size).toBe(1);
  });

  it('rejects wrong passwords and replayed verification tokens', async () => {
    const { body } = await register();
    const token = tokenFromLastEmail('emailToken');

    const wrong = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: body.email,
      password: 'senha-errada-mas-longa',
    }));
    expect(wrong.status).toBe(401);
    expect((await wrong.json()).error).toContain('Email ou senha inválidos');

    expect((await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', { token, password: PASSWORD }))).status).toBe(200);
    const replay = await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', { token, password: PASSWORD }));
    expect(replay.status).toBe(400);
    expect((await replay.json()).code).toBe('TOKEN_INVALID');
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
  });

  it('rejects expired verification tokens', async () => {
    await register();
    const token = tokenFromLastEmail('emailToken');
    const stored = runtimeAuthTokens.get(hashEmailToken(token));
    stored!.expiresAt = Date.now() - 1;

    const res = await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', { token, password: PASSWORD }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TOKEN_EXPIRED');
  });

  it('resets the password once and invalidates the old credential/session path', async () => {
    const { body } = await registerAndVerify();

    const forgot = await forgotPost(jsonRequest('http://localhost:3000/api/auth/email/forgot-password', {
      email: body.email,
    }));
    expect(forgot.status).toBe(200);
    const forgotData = await forgot.json();
    expect(forgotData.ok).toBe(true);
    expect(forgotData.message).toContain('Se este email estiver cadastrado');

    const resetToken = tokenFromLastEmail('resetToken');
    const newPassword = 'nova-senha-muito-segura';
    const reset = await resetPost(jsonRequest('http://localhost:3000/api/auth/email/reset-password', {
      token: resetToken,
      password: newPassword,
    }));
    expect(reset.status).toBe(200);
    expect(await reset.json()).toEqual({ ok: true, message: 'Senha atualizada. Faça login com a nova senha.' });
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();

    const oldLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: body.email,
      password: PASSWORD,
    }));
    expect(oldLogin.status).toBe(401);

    const newLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: body.email,
      password: newPassword,
    }));
    expect(newLogin.status).toBe(200);

    const replay = await resetPost(jsonRequest('http://localhost:3000/api/auth/email/reset-password', {
      token: resetToken,
      password: 'outra-senha-muito-segura',
    }));
    expect(replay.status).toBe(400);
    expect((await replay.json()).code).toBe('TOKEN_INVALID');
  });

  it('invalidates old player sessions on reset and accepts a newly issued session', async () => {
    const { body } = await registerAndVerify();

    const firstLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: body.email,
      password: PASSWORD,
    }));
    const oldToken = (await firstLogin.json()).token as string;
    expect(await verifySessionToken(oldToken)).not.toBeNull();
    const clubToken = await createSession('club-untouched', 'club');
    const adminToken = await createSession('admin', 'admin');

    mockHeadersMap.set('authorization', `Bearer ${oldToken}`);
    expect(await readSession()).not.toBeNull();

    await forgotPost(jsonRequest('http://localhost:3000/api/auth/email/forgot-password', {
      email: body.email,
    }));
    const resetToken = tokenFromLastEmail('resetToken');
    const newPassword = 'senha-pos-reset-segura';
    expect((await resetPost(jsonRequest('http://localhost:3000/api/auth/email/reset-password', {
      token: resetToken,
      password: newPassword,
    }))).status).toBe(200);

    expect(await verifySessionToken(oldToken)).toBeNull();
    expect(await readSession()).toBeNull();
    expect(await verifySessionToken(clubToken)).toEqual({ id: 'club-untouched', role: 'club' });
    expect(await verifySessionToken(adminToken)).toEqual({ id: 'admin', role: 'admin' });

    const secondLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email: body.email,
      password: newPassword,
    }));
    expect(secondLogin.status).toBe(200);
    const newToken = (await secondLogin.json()).token as string;
    expect(newToken).not.toBe(oldToken);
    expect(await verifySessionToken(newToken)).not.toBeNull();
  });

  it('rejects expired password reset tokens', async () => {
    await registerAndVerify();
    await forgotPost(jsonRequest('http://localhost:3000/api/auth/email/forgot-password', {
      email: Array.from(runtimeEmailAccounts.values())[0].email,
    }));
    const resetToken = tokenFromLastEmail('resetToken');
    runtimeAuthTokens.get(hashEmailToken(resetToken))!.expiresAt = Date.now() - 1;

    const res = await resetPost(jsonRequest('http://localhost:3000/api/auth/email/reset-password', {
      token: resetToken,
      password: 'outra-senha-muito-segura',
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('TOKEN_EXPIRED');
  });

  it('returns a generic forgot-password response for unknown and Google-only accounts without sending', async () => {
    const unknown = await forgotPost(jsonRequest('http://localhost:3000/api/auth/email/forgot-password', {
      email: 'ninguem@example.com',
    }));
    expect(unknown.status).toBe(200);
    expect(await unknown.json()).toMatchObject({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();

    runtimeUsersByPhone.set('google-only-user', {
      id: 'google-only-user',
      displayName: 'Google Only',
      handle: '@google_only',
      city: 'Curitiba',
      state: 'PR',
      country: 'Brasil',
      isActive: true,
      email: 'google-only@example.com',
    });

    const googleOnly = await forgotPost(jsonRequest('http://localhost:3000/api/auth/email/forgot-password', {
      email: 'google-only@example.com',
    }));
    expect(googleOnly.status).toBe(200);
    expect(await googleOnly.json()).toMatchObject({
      ok: true,
      message: 'Se este email estiver cadastrado, enviaremos instruções para redefinir a senha.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enforces validation: duplicate email/handle, password bounds and inactive accounts', async () => {
    const first = await register();
    expect(first.res.status).toBe(200);
    const email = first.body.email as string;

    const duplicateEmail = await register({ email });
    expect(duplicateEmail.res.status).toBe(200);
    expect((await duplicateEmail.res.json()).status).toBe('verification_required');

    await verifyPost(jsonRequest('http://localhost:3000/api/auth/email/verify', {
      token: tokenFromLastEmail('emailToken'),
      password: PASSWORD,
    }));

    const verifiedDuplicate = await register({ email });
    expect(verifiedDuplicate.res.status).toBe(409);
    expect((await verifiedDuplicate.res.json()).error).toContain('já está cadastrado');

    const duplicateHandle = await register({ handle: first.body.handle });
    expect(duplicateHandle.res.status).toBe(409);
    expect((await duplicateHandle.res.json()).error).toContain('arroba já está em uso');

    const shortPassword = await register({ password: '123456789' });
    expect(shortPassword.res.status).toBe(400);
    const longPassword = await register({ password: 'a'.repeat(129) });
    expect(longPassword.res.status).toBe(400);

    const account = Array.from(runtimeEmailAccounts.values()).find((item) => item.email === email)!;
    account.isActive = false;
    const inactiveLogin = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email,
      password: PASSWORD,
    }));
    expect(inactiveLogin.status).toBe(403);
    expect((await inactiveLogin.json()).error).toContain('desativada');
  });

  it('counts every rate-limit attempt and resets after the window', async () => {
    const start = 1_000_000;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(await consumeRateLimit('login', 'limiter-test', start)).toBe(true);
    }
    expect(await consumeRateLimit('login', 'limiter-test', start + 1)).toBe(false);
    expect(await consumeRateLimit('login', 'limiter-test', start + 2)).toBe(false);
    expect(await consumeRateLimit('login', 'limiter-test', start + 15 * 60 * 1000 + 1)).toBe(true);
  });

  it('rate limits repeated failed logins', async () => {
    const email = 'limite@example.com';
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
        email,
        password: 'senha-incorreta-longa',
      }));
      expect(res.status).toBe(401);
    }
    const blocked = await loginPost(jsonRequest('http://localhost:3000/api/auth/email/login', {
      email,
      password: 'senha-incorreta-longa',
    }));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toContain('Muitas tentativas');
  });

  it('fails closed when the email provider is not configured', async () => {
    vi.stubEnv('EMAIL_PROVIDER_URL', '');
    const { res } = await register();
    expect(res.status).toBe(503);
    expect(runtimeEmailAccounts.size).toBe(0);
  });

  it('keeps a pending account when email delivery fails and allows a resend', async () => {
    fetchMock.mockResolvedValueOnce(new Response('provider down', { status: 500 }));

    const { res, body } = await register();
    expect(res.status).toBe(503);
    expect(runtimeEmailAccounts.size).toBe(1);
    expect(runtimeUsersByPhone.size).toBe(1);

    // The pending account is preserved; re-registering re-issues a verification link.
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const retry = await register({ email: body.email, handle: body.handle });
    expect(retry.res.status).toBe(200);
    expect(runtimeEmailAccounts.size).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('links a verified Google email to the existing email account preserving its id', async () => {
    const { body } = await registerAndVerify();
    const existing = Array.from(runtimeEmailAccounts.values())[0];
    const player = getPlayer(existing.userId)!;
    player.rating.rating = 1875.4;
    player.rating.matches = 37;
    player.rating.provisional = false;
    player.rank.points = 88;

    const res = await socialPost(jsonRequest('http://localhost:3000/api/auth/social', {
      provider: 'google',
      idToken: await googleToken({
        sub: 'google-coexist-sub',
        email: body.email as string,
        email_verified: true,
      }),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('authenticated');
    expect(data.linked).toBe(true);
    expect(data.user.id).toBe(existing.userId);
    expect(data.user.rating).toBe(1875.4);
    expect(data.user.provisional).toBe(false);
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeDefined();
  });

  it('preserves a legacy account id when Google auto-links through a verified email', async () => {
    const legacy = createPlayer({
      phone: '41999990000',
      displayName: 'Legado Padel',
      handle: `@legado_${Date.now().toString().slice(-5)}`,
      city: 'Curitiba',
      state: 'PR',
      category: '2ª',
    });
    legacy.rating.rating = 1900;
    legacy.rating.matches = 50;
    legacy.rank.points = 90;
    runtimeUsersByPhone.set(legacy.id, {
      id: legacy.id,
      displayName: legacy.displayName,
      handle: legacy.handle,
      city: legacy.city,
      state: legacy.state,
      country: legacy.country,
      isActive: true,
      email: 'legado@example.com',
    });

    const res = await socialPost(jsonRequest('http://localhost:3000/api/auth/social', {
      provider: 'google',
      idToken: await googleToken({
        sub: 'google-legacy-sub',
        email: 'legado@example.com',
        email_verified: true,
      }),
    }));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.linked).toBe(true);
    expect(data.user.id).toBe(legacy.id);
    expect(data.user.rating).toBe(1900);
    expect(getPlayer(legacy.id)?.rating.matches).toBe(50);
  });

  it('never auto-links Google to an unverified email/password account', async () => {
    const { body } = await register();

    const res = await socialPost(jsonRequest('http://localhost:3000/api/auth/social', {
      provider: 'google',
      idToken: await googleToken({
        sub: 'google-takeover-sub',
        email: body.email as string,
        email_verified: true,
      }),
    }));

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe('EMAIL_UNVERIFIED');
    expect(mockCookiesMap.get(PLAYER_COOKIE_NAME)).toBeUndefined();
  });

  it('does not auto-link Google when its email is not verified', async () => {
    const { body } = await registerAndVerify();
    const before = Array.from(runtimeEmailAccounts.values())[0];

    const res = await socialPost(jsonRequest('http://localhost:3000/api/auth/social', {
      provider: 'google',
      idToken: await googleToken({
        sub: 'google-unverified-email-sub',
        email: body.email as string,
        email_verified: false,
      }),
    }));

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
    expect(data.onboardingToken).toBeUndefined();
    expect(Array.from(runtimeEmailAccounts.values())[0].userId).toBe(before.userId);
  });

  it('rejects Apple everywhere and keeps phone/OTP endpoints as 410 tombstones', async () => {
    const appleRes = await socialPost(jsonRequest('http://localhost:3000/api/auth/social', {
      provider: 'apple',
      idToken: 'anything.anything.anything',
    }));
    expect(appleRes.status).toBe(400);
    expect((await appleRes.json()).error).toContain('Apenas o Google');

    const legacyAppleToken = await new SignJWT({
      provider: 'apple',
      purpose: 'onboarding',
      email: 'legacy@icloud.com',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('legacy-apple-sub')
      .setJti('legacy-apple-jti')
      .setExpirationTime('15m')
      .sign(getAuthSecret());

    const onboardingRes = await onboardingPost(jsonRequest('http://localhost:3000/api/auth/social/onboarding', {
      onboardingToken: legacyAppleToken,
      name: 'Legacy',
      handle: '@legacy_apple',
      city: 'Curitiba',
      state: 'PR',
      category: '5ª',
    }));
    expect(onboardingRes.status).toBe(401);

    expect((await requestOtpPost()).status).toBe(410);
    expect((await verifyOtpPost()).status).toBe(410);
  });

  it('rejects pre-versioning player JWTs in production while preserving club/admin sessions', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));

    const legacyPlayerToken = await new SignJWT({ role: 'player' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('legacy-player-without-version')
      .setExpirationTime('1h')
      .sign(getAuthSecret());
    expect(await verifySessionToken(legacyPlayerToken)).toBeNull();

    await expect(createSession('player-without-store', 'player')).rejects.toThrow(
      'SESSION_VERSION_STORE_UNAVAILABLE'
    );

    const clubToken = await createSession('club-id', 'club');
    expect(await verifySessionToken(clubToken)).toEqual({ id: 'club-id', role: 'club' });
    const adminToken = await createSession('admin', 'admin');
    expect(await verifySessionToken(adminToken)).toEqual({ id: 'admin', role: 'admin' });
  });

  it('requires a strong AUTH_SECRET in production and a Google audience', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('AUTH_SECRET', '');

    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);

    vi.stubEnv('AUTH_SECRET', 'short');
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);

    vi.stubEnv('AUTH_SECRET', 'elo-padel-local-secret-change-before-production');
    expect(() => getAuthSecret()).toThrow(/AUTH_SECRET/);

    vi.stubEnv('AUTH_SECRET', 'a'.repeat(32));
    expect(getAuthSecret()).toHaveLength(32);

    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_AUDIENCE', '');
    const res = await socialPost(jsonRequest('http://localhost:3000/api/auth/social', {
      provider: 'google',
      idToken: 'header.payload.signature',
    }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toContain('não está configurada');
  });
});
