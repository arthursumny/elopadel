import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { issueLocationToken, LOCATION_TOKEN_TTL_SECONDS, LocationServiceError, reverseGeocodeCity, validateLocationMeasurement, verifyLocationToken } from './location';

describe('location service and proof tokens', () => {
  beforeEach(() => {
    vi.stubEnv('AUTH_SECRET', 'location-test-secret-that-is-long-enough');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('calls Geoapify with GeoJSON defaults, city filter, and no real network in tests', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-only-key');
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString());
      expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/reverse');
      expect(url.searchParams.get('lat')).toBe('-27.17');
      expect(url.searchParams.get('lon')).toBe('-51.5');
      expect(url.searchParams.get('type')).toBe('city');
      expect(url.searchParams.get('lang')).toBe('pt');
      expect(url.searchParams.get('apiKey')).toBe('test-only-key');
      expect(url.searchParams.has('format')).toBe(false);
      expect(init?.signal).toBeDefined();
      return Response.json({ features: [] });
    }) as typeof fetch;

    await reverseGeocodeCity(-27.17, -51.5, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('fails closed without an API key and on provider failures', async () => {
    vi.stubEnv('GEOAPIFY_API_KEY', '');
    const fetcher = vi.fn() as typeof fetch;
    await expect(reverseGeocodeCity(-27, -51, fetcher)).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('GEOAPIFY_API_KEY', 'test-only-key');
    await expect(reverseGeocodeCity(-27, -51, vi.fn(async () => new Response('', { status: 502 })) as typeof fetch)).rejects.toBeInstanceOf(LocationServiceError);
  });

  it('accepts only finite in-range coordinates with adequate accuracy and a recent timestamp', () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    expect(validateLocationMeasurement({ latitude: -27, longitude: -51, accuracy: 100, timestamp: now }, now).valid).toBe(true);
    expect(validateLocationMeasurement({ latitude: -27, longitude: -51, accuracy: 5_000, timestamp: now }, now).valid).toBe(true);
    expect(validateLocationMeasurement({ latitude: 91, longitude: -51, accuracy: 20, timestamp: now }, now)).toMatchObject({ valid: false, status: 422 });
    expect(validateLocationMeasurement({ latitude: -27, longitude: -51, accuracy: 5_001, timestamp: now }, now)).toMatchObject({ valid: false, status: 422 });
    expect(validateLocationMeasurement({ latitude: -27, longitude: -51, accuracy: 20, timestamp: now - 300_001 }, now)).toMatchObject({ valid: false, status: 422 });
    expect(validateLocationMeasurement({ latitude: -27, longitude: -51, accuracy: 20, timestamp: now + 30_001 }, now)).toMatchObject({ valid: false, status: 422 });
    expect(validateLocationMeasurement({ latitude: Number.NaN, longitude: -51, accuracy: 20, timestamp: now }, now)).toMatchObject({ valid: false, status: 400 });
  });

  it('issues user-bound five-minute tokens with canonical city, state, and country only', async () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    const location = { city: 'Joaçaba', state: 'SC', country: 'Brasil' };
    const issued = await issueLocationToken('user-1', location, now);
    expect(issued.expiresAt).toBe(new Date(Math.floor(now / 1000) * 1000 + LOCATION_TOKEN_TTL_SECONDS * 1000).toISOString());
    expect(issued.token).not.toContain('-27');
    expect(await verifyLocationToken(issued.token, 'user-1', now)).toMatchObject({ ...location, expiresAt: issued.expiresAt });
    expect(await verifyLocationToken(issued.token, 'user-2', now)).toBeNull();
    expect(await verifyLocationToken(`${issued.token.slice(0, -1)}x`, 'user-1', now)).toBeNull();
    expect(await verifyLocationToken(issued.token, 'user-1', now + 5 * 60_000 + 1)).toBeNull();
    const payload = JSON.parse(Buffer.from(issued.token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
    expect(payload).toMatchObject({ city: 'Joaçaba', state: 'SC', country: 'Brasil', purpose: 'matchmaking-location', sub: 'user-1' });
    expect(payload).not.toHaveProperty('latitude');
    expect(payload).not.toHaveProperty('longitude');
    expect(payload).not.toHaveProperty('timestamp');
  });

  it('distinguishes GPS-confirmed from manually declared city tokens', async () => {
    const now = Date.parse('2026-10-26T12:00:00Z');
    const location = { city: 'Joaçaba', state: 'SC', country: 'Brasil' };
    const manual = await issueLocationToken('user-1', location, now, 'manual');
    const gps = await issueLocationToken('user-1', location, now);
    expect(await verifyLocationToken(manual.token, 'user-1', now)).toMatchObject({ ...location, source: 'manual' });
    expect(await verifyLocationToken(gps.token, 'user-1', now)).toMatchObject({ ...location, source: 'gps' });
  });
});
