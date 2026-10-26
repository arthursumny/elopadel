import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  consumeRateLimit: vi.fn(),
  hashRateLimitIp: vi.fn((ip: string) => `hashed:${ip}`),
  configured: vi.fn(),
  validate: vi.fn(),
  resolve: vi.fn(),
  issue: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ currentUserId: mocks.currentUserId }));
vi.mock('@/lib/security/rate-limit', () => ({ consumeRateLimit: mocks.consumeRateLimit, hashRateLimitIp: mocks.hashRateLimitIp }));
vi.mock('@/lib/location', () => ({
  isGeoapifyConfigured: mocks.configured,
  validateLocationMeasurement: mocks.validate,
  resolveCoordinatesToActiveClubLocation: mocks.resolve,
  issueLocationToken: mocks.issue,
  LocationServiceError: class LocationServiceError extends Error { code: string; constructor(code: string) { super(code); this.code = code; } },
}));

import { POST } from './route';

function request(body: unknown, headers?: HeadersInit) {
  return new Request('http://localhost/api/location/resolve', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

describe('POST /api/location/resolve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUserId.mockResolvedValue('user-1');
    mocks.configured.mockReturnValue(true);
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.validate.mockReturnValue({ valid: true, measurement: { latitude: -27, longitude: -51, accuracy: 20, timestamp: Date.now() } });
    mocks.resolve.mockResolvedValue({ city: 'Joaçaba', state: 'SC', country: 'Brasil' });
    mocks.issue.mockResolvedValue({ token: 'signed-location-proof', expiresAt: '2026-10-26T12:05:00.000Z' });
  });

  it('requires an authenticated player and never asks Geoapify without an API key', async () => {
    mocks.currentUserId.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(401);
    mocks.currentUserId.mockResolvedValue('user-1');
    mocks.configured.mockReturnValue(false);
    const response = await POST(request({ latitude: 1, longitude: 1, accuracy: 1, timestamp: Date.now() }));
    expect(response.status).toBe(503);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('validates input and rate-limits before calling the provider', async () => {
    mocks.validate.mockReturnValue({ valid: false, status: 422, error: 'inaccurate' });
    expect((await POST(request({}))).status).toBe(422);
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
    mocks.validate.mockReturnValue({ valid: true, measurement: { latitude: -27, longitude: -51, accuracy: 20, timestamp: Date.now() } });
    mocks.consumeRateLimit.mockResolvedValue(false);
    const limited = await POST(request({}, { 'x-real-ip': '203.0.113.8' }));
    expect(limited.status).toBe(429);
    expect(mocks.hashRateLimitIp).toHaveBeenCalledWith('203.0.113.8');
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('returns only canonical club locality and a short-lived user-bound token', async () => {
    const response = await POST(request({ latitude: -27, longitude: -51, accuracy: 20, timestamp: Date.now() }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ location: { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'signed-location-proof', expiresAt: '2026-10-26T12:05:00.000Z' } });
    expect(mocks.resolve).toHaveBeenCalledWith(-27, -51);
    expect(mocks.issue).toHaveBeenCalledWith('user-1', { city: 'Joaçaba', state: 'SC', country: 'Brasil' });
    expect(JSON.stringify(body)).not.toContain('-27');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 503 on rate-limit storage/provider failure and 422 for unsupported cities', async () => {
    mocks.consumeRateLimit.mockRejectedValue(new Error('storage down'));
    expect((await POST(request({}))).status).toBe(503);
    mocks.consumeRateLimit.mockResolvedValue(true);
    mocks.resolve.mockRejectedValue({ code: 'NOT_FOUND' });
    const unsupported = await POST(request({}));
    expect(unsupported.status).toBe(422);
  });
});
