import { SignJWT, jwtVerify } from 'jose';

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'elo-padel-local-secret-change-before-production';
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET);

export interface MockSocialUser {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function generateSessionToken(
  userId: string,
  role: 'player' | 'club' | 'admin' = 'player',
  expiresIn: string = '30d'
): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET_KEY);
}

export async function generateExpiredSessionToken(userId: string): Promise<string> {
  return new SignJWT({ role: 'player' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(SECRET_KEY);
}

export async function generateOnboardingToken(
  provider: 'google' | 'apple',
  sub: string,
  email: string,
  suggestedName?: string,
  picture?: string
): Promise<string> {
  return new SignJWT({
    type: 'onboarding',
    provider,
    email,
    name: suggestedName,
    picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(SECRET_KEY);
}

export async function verifyToken(token: string) {
  return jwtVerify(token, SECRET_KEY);
}

export function createMockGoogleIdToken(user: MockSocialUser): string {
  // Encodes a synthetic Google JWT token for opaque-box test input
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'google-test-key-1' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    sub: user.sub,
    email: user.email,
    email_verified: user.emailVerified,
    name: user.name ?? 'Google User',
    picture: user.picture ?? 'https://lh3.googleusercontent.com/test-avatar',
    aud: 'elo-padel-client-id',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url');
  return `${header}.${payload}.synthetic_signature`;
}

export function createMockAppleIdentityToken(user: MockSocialUser): string {
  // Encodes a synthetic Apple identity token for opaque-box test input
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'apple-test-key-1' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://appleid.apple.com',
    sub: user.sub,
    email: user.email,
    email_verified: user.emailVerified ? 'true' : 'false',
    aud: 'com.elopadel.app',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  })).toString('base64url');
  return `${header}.${payload}.synthetic_signature`;
}
