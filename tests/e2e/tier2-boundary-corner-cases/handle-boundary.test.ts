import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateOnboardingToken } from '../fixtures/auth';
import { isValidPublicHandle, normalizePublicHandle } from '@/lib/handles';

describe('Tier 2: Boundary & Corner Cases — @Handle Format & Adversarial Sanitization (R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-BND-HANDLE-01: Rejects handle below minimum 3 character boundary (@ab)', async () => {
    expect(isValidPublicHandle('@ab')).toBe(false);

    const token = await generateOnboardingToken('google', 'sub-bnd-1', 'test1@test.com');
    const res = await client.completeOnboarding({
      onboardingToken: token,
      displayName: 'Test Short',
      handle: 'ab',
      city: 'Joaçaba',
      state: 'SC',
      category: '5ª',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(400);
  });

  it('TC-BND-HANDLE-02: Accepts handle at exactly minimum 3 character boundary (@pad)', async () => {
    expect(isValidPublicHandle('@pad')).toBe(true);

    const token = await generateOnboardingToken('google', 'sub-bnd-2', 'test2@test.com');
    const res = await client.completeOnboarding({
      onboardingToken: token,
      displayName: 'Min Handle',
      handle: 'pad',
      city: 'Joaçaba',
      state: 'SC',
      category: '5ª',
    });

    expect(res.ok).toBe(true);
    expect(res.player?.handle).toBe('@pad');
  });

  it('TC-BND-HANDLE-03: Accepts handle at maximum 20 character boundary (@abcdefghij123456789)', async () => {
    const twentyChars = 'abcdefghij123456789';
    expect(isValidPublicHandle(`@${twentyChars}`)).toBe(true);

    const token = await generateOnboardingToken('apple', 'sub-bnd-3', 'test3@test.com');
    const res = await client.completeOnboarding({
      onboardingToken: token,
      displayName: 'Max Handle',
      handle: twentyChars,
      city: 'Joaçaba',
      state: 'SC',
      category: '5ª',
    });

    expect(res.ok).toBe(true);
    expect(res.player?.handle).toBe(`@${twentyChars}`);
  });

  it('TC-BND-HANDLE-04: Rejects handle exceeding maximum 20 characters boundary', async () => {
    const twentyOneChars = 'abcdefghij1234567890a';
    expect(isValidPublicHandle(`@${twentyOneChars}`)).toBe(false);

    const token = await generateOnboardingToken('apple', 'sub-bnd-4', 'test4@test.com');
    const res = await client.completeOnboarding({
      onboardingToken: token,
      displayName: 'Over Max Handle',
      handle: twentyOneChars,
      city: 'Joaçaba',
      state: 'SC',
      category: '5ª',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(400);
  });

  it('TC-BND-HANDLE-05: Rejects adversarial inputs (SQL injection, XSS characters, dashes, emoji)', async () => {
    expect(isValidPublicHandle("@' OR 1=1 --")).toBe(false);
    expect(isValidPublicHandle('@<script>')).toBe(false);
    expect(isValidPublicHandle('@joao-padel')).toBe(false); // Hyphen not allowed
    expect(isValidPublicHandle('@padel🎾')).toBe(false); // Emoji not allowed
    expect(isValidPublicHandle('@padel$')).toBe(false); // Special char not allowed
  });
});
