import { createHash, randomBytes } from 'node:crypto';

export const EMAIL_TOKEN_BYTES = 32;
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export type PasswordValidationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Canonical form used for uniqueness, lookup and rate-limit keys. */
export function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function validateEmail(value: unknown): EmailValidationResult {
  const email = normalizeEmail(value);
  if (!email) {
    return { ok: false, error: 'Informe um email válido.' };
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { ok: false, error: 'Informe um email válido.' };
  }
  return { ok: true, email };
}

export function validatePassword(value: unknown): PasswordValidationResult {
  if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha deve ter no máximo ${MAX_PASSWORD_LENGTH} caracteres.` };
  }
  return { ok: true };
}

/** Opaque, high-entropy token. Only its SHA-256 hash is persisted. */
export function generateEmailToken(): string {
  return randomBytes(EMAIL_TOKEN_BYTES).toString('base64url');
}

export function hashEmailToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
