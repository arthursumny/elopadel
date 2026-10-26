import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: null }));

import { clearRateLimits, consumeRateLimit, hashRateLimitIp, RATE_LIMITS } from './rate-limit';

afterEach(() => clearRateLimits());

describe('handle availability rate limit', () => {
  it('limits a hashed IP to 60 requests per minute', async () => {
    expect(RATE_LIMITS.handleAvailability).toEqual({ limit: 60, windowMs: 60_000 });
    const key = hashRateLimitIp('203.0.113.10');
    expect(key).not.toContain('203.0.113.10');

    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(await consumeRateLimit('handleAvailability', key, 1_000)).toBe(true);
    }
    expect(await consumeRateLimit('handleAvailability', key, 1_000)).toBe(false);
  });

  it('resets the limit after the fixed window', async () => {
    const key = hashRateLimitIp('203.0.113.11');
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await consumeRateLimit('handleAvailability', key, 1_000);
    }
    expect(await consumeRateLimit('handleAvailability', key, 61_000)).toBe(true);
  });
});

describe('location resolution rate limit', () => {
  it('limits server-side geocoder requests by hashed client IP', async () => {
    expect(RATE_LIMITS.locationResolve).toEqual({ limit: 20, windowMs: 15 * 60_000 });
    const key = hashRateLimitIp('203.0.113.12');
    expect(key).not.toContain('203.0.113.12');
    for (let attempt = 0; attempt < 20; attempt += 1) expect(await consumeRateLimit('locationResolve', key, 1_000)).toBe(true);
    expect(await consumeRateLimit('locationResolve', key, 1_000)).toBe(false);
  });
});
