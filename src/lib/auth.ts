import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_VERSION_CLAIM, getPlayerSessionVersion, isPlayerSessionVersionValid } from './security/session-version';

export const PLAYER_COOKIE_NAME = 'elo_session';
export const CLUB_COOKIE_NAME = 'elo_club_session';
export const ADMIN_COOKIE_NAME = 'elo_admin_session';
export const SESSION_COOKIE_NAME = PLAYER_COOKIE_NAME;

export type SessionRole = 'player' | 'club' | 'admin';
export type Session = { id: string; role: SessionRole };

export type OnboardingPayload = {
  provider: 'google';
  sub: string;
  emailVerified: true;
  email?: string;
  name?: string;
  avatarUrl?: string;
  jti?: string;
};

// In-memory consumed token tracking store (token ID / jti -> expiresAt timestamp in ms)
const consumedOnboardingTokens = new Map<string, number>();

export function isTokenConsumed(tokenId: string): boolean {
  if (!tokenId) return false;
  const expiresAt = consumedOnboardingTokens.get(tokenId);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    consumedOnboardingTokens.delete(tokenId);
    return false;
  }
  return true;
}

export function consumeOnboardingToken(tokenId: string, ttlSeconds: number = 900): boolean {
  if (!tokenId) return false;
  if (isTokenConsumed(tokenId)) return false;
  consumedOnboardingTokens.set(tokenId, Date.now() + ttlSeconds * 1000);
  return true;
}

export function clearConsumedTokens(): void {
  consumedOnboardingTokens.clear();
}

const DEV_AUTH_SECRET = 'elo-padel-local-development-secret-change-me';
const KNOWN_WEAK_SECRETS = new Set([
  DEV_AUTH_SECRET,
  'elo-padel-local-secret-change-before-production',
]);
const MIN_PRODUCTION_SECRET_LENGTH = 32;

/**
 * Resolves the HS256 signing key.
 *
 * Production must provide a strong AUTH_SECRET (>= 32 chars). There is no
 * fallback in production: signing/verification fails closed instead of
 * accepting tokens signed with a publicly known development secret.
 */
export function getAuthSecret(): Uint8Array {
  const configured = process.env.AUTH_SECRET?.trim();
  if (process.env.NODE_ENV === 'production') {
    if (!configured || KNOWN_WEAK_SECRETS.has(configured) || configured.length < MIN_PRODUCTION_SECRET_LENGTH) {
      throw new Error('AUTH_SECRET precisa ser configurado com pelo menos 32 caracteres em produção.');
    }
    return new TextEncoder().encode(configured);
  }
  return new TextEncoder().encode(configured || DEV_AUTH_SECRET);
}

function secret() {
  return getAuthSecret();
}

export type CreateSessionOptions = {
  /** Player-only snapshot version. Avoids re-reading after credential verification. */
  sessionVersion?: number;
};

export async function createSession(
  subject: string,
  role: SessionRole = 'player',
  options: CreateSessionOptions = {}
) {
  const claims: Record<string, unknown> = { role };
  if (role === 'player') {
    // Fails closed in production when the version store is unavailable.
    claims[SESSION_VERSION_CLAIM] = options.sessionVersion ?? await getPlayerSessionVersion(subject);
  }
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject(subject).setIssuedAt().setExpirationTime('30d').sign(secret());
}

export async function createOnboardingToken(payload: OnboardingPayload): Promise<string> {
  if (payload.provider !== 'google') {
    throw new Error('Somente o provedor Google é suportado.');
  }
  if (payload.emailVerified !== true || !payload.email) {
    throw new Error('É necessário um email verificado do Google para iniciar o cadastro.');
  }
  const jti = payload.jti ?? (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `onb_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  return new SignJWT({ ...payload, jti, purpose: 'onboarding' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret());
}

export async function verifyOnboardingToken(token: string): Promise<OnboardingPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    // Old Google tokens without the email-verification proof are rejected, as
    // are Apple tokens signed with the current secret.
    if (
      payload.purpose === 'onboarding' &&
      payload.provider === 'google' &&
      payload.emailVerified === true &&
      typeof payload.email === 'string' &&
      payload.email &&
      payload.sub
    ) {
      return {
        provider: 'google',
        sub: payload.sub,
        emailVerified: true,
        email: payload.email,
        name: typeof payload.name === 'string' ? payload.name : undefined,
        avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : undefined,
        jti: typeof payload.jti === 'string' ? payload.jti : undefined,
      };
    }
  } catch {
    // Expired or invalid onboarding token
  }
  return null;
}


export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    if (payload.sub && (payload.role === 'player' || payload.role === 'club' || payload.role === 'admin')) {
      const role = payload.role as SessionRole;
      if (role === 'player') {
        // A database/version-store error must deny access, never fall back to trusting the JWT.
        const validVersion = await isPlayerSessionVersionValid(payload.sub, payload[SESSION_VERSION_CLAIM]);
        if (!validVersion) return null;
      }
      return { id: payload.sub, role };
    }
  } catch {
    // An expired, invalid, or unverifiable session is treated as anonymous.
  }
  return null;
}

export async function setSessionCookie(userId: string, token?: string) {
  const store = await cookies();
  // Reuse the exact JWT returned by the API when provided: a second signing
  // pass could observe a newer version after a concurrent password reset.
  store.set(PLAYER_COOKIE_NAME, token ?? await createSession(userId), cookieOptions());
}

export async function setClubSessionCookie(clubId: string) {
  const store = await cookies();
  store.set(CLUB_COOKIE_NAME, await createSession(clubId, 'club'), cookieOptions());
}

export async function setAdminSessionCookie() {
  const store = await cookies();
  store.set(ADMIN_COOKIE_NAME, await createSession('admin', 'admin'), cookieOptions());
}

function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 30, path: '/' };
}

export async function readSession(cookieName: string = SESSION_COOKIE_NAME): Promise<Session | null> {
  let token: string | undefined;

  try {
    const reqHeaders = await headers();
    const authHeader = reqHeaders.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  } catch {
    // headers() might not be available in non-request contexts
  }

  if (!token) {
    try {
      const store = await cookies();
      token = store.get(cookieName)?.value;
    } catch {
      // cookies() might not be available in non-request contexts
    }
  }

  if (!token) return null;
  return verifySessionToken(token);
}

export async function currentSession() {
  return readSession(PLAYER_COOKIE_NAME);
}

export async function currentClubId() {
  const session = await readSession(CLUB_COOKIE_NAME);
  return session?.role === 'club' ? session.id : null;
}

export async function currentAdminSession() {
  const session = await readSession(ADMIN_COOKIE_NAME);
  return session?.role === 'admin' && session.id === 'admin' ? session : null;
}

export async function currentUserId() {
  const session = await currentSession();
  return session?.role === 'player' ? session.id : null;
}

export async function requireUserId() {
  const userId = await currentUserId();
  if (!userId) redirect('/login');
  return userId;
}

export async function requireClubId() {
  const clubId = await currentClubId();
  if (!clubId) redirect('/club/login');
  return clubId;
}

export async function requireAdminSession() {
  const session = await currentAdminSession();
  if (!session) redirect('/admin/login');
  return session;
}
