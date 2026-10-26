import { describe, expect, it } from 'vitest';
import {
  isValidEmail,
  isValidHandle,
  normalizeHandleInput,
  validatePassword,
} from './playerProfile';

describe('playerProfile validation', () => {
  it('normalizes handles like the onboarding flow', () => {
    expect(normalizeHandleInput('  JÕÃO Vítor@Padel ')).toBe('joao_vitorpadel');
    expect(normalizeHandleInput('@@@carlos_silva')).toBe('carlos_silva');
  });

  it('accepts valid handles and rejects reserved or malformed ones', () => {
    expect(isValidHandle('carlos_silva')).toBe(true);
    expect(isValidHandle('a.b')).toBe(true);
    expect(isValidHandle('ab')).toBe(false);
    expect(isValidHandle('_carlos')).toBe(false);
    expect(isValidHandle('carlos_')).toBe(false);
    expect(isValidHandle('admin')).toBe(false);
    expect(isValidHandle('Elite')).toBe(true);
  });

  it('validates email with a simple non-empty local/domain shape', () => {
    expect(isValidEmail('jogador@email.com')).toBe(true);
    expect(isValidEmail(' jogador@email.com ')).toBe(true);
    expect(isValidEmail('jogador@')).toBe(false);
    expect(isValidEmail('jogador.email.com')).toBe(false);
  });

  it('enforces the 10 to 128 character password contract', () => {
    expect(validatePassword('123456789')).toMatch(/pelo menos 10/);
    expect(validatePassword('1234567890')).toBeNull();
    expect(validatePassword('a'.repeat(128))).toBeNull();
    expect(validatePassword('a'.repeat(129))).toMatch(/no máximo 128/);
  });
});
