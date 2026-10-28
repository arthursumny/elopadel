import { describe, expect, it, vi } from 'vitest';
import { BrowserLocationError, clubsForBrowserLocation, isBrowserLocationProofFresh, resolveCurrentBrowserLocation, resolveManualBrowserLocation } from './browser-location';

function position(overrides: Partial<GeolocationCoordinates> = {}, timestamp = Date.now()) {
  return {
    coords: { latitude: -27.1, longitude: -51.5, accuracy: 15, altitude: null, altitudeAccuracy: null, heading: null, speed: null, ...overrides },
    timestamp,
  } as GeolocationPosition;
}

function geolocation(value: GeolocationPosition) {
  return {
    getCurrentPosition: vi.fn((success: PositionCallback) => success(value)),
  };
}

function response(payload: unknown, ok = true) {
  return { ok, json: async () => payload } as Response;
}

describe('browser matchmaking location', () => {
  it('captures precise current coordinates with the required browser options and resolves a short-lived proof', async () => {
    const capturedAt = Date.now();
    const geo = geolocation(position({}, capturedAt));
    const fetcher = vi.fn().mockResolvedValue(response({ location: { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'short-lived', expiresAt: new Date(capturedAt + 300_000).toISOString() } }));
    const proof = await resolveCurrentBrowserLocation({ geolocation: geo, fetcher, now: () => capturedAt, secureContext: true });

    expect(geo.getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    });
    expect(fetcher).toHaveBeenCalledWith('/api/location/resolve', expect.objectContaining({
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({ latitude: -27.1, longitude: -51.5, accuracy: 15, timestamp: capturedAt }),
    }));
    expect(proof).toMatchObject({ city: 'Joaçaba', state: 'SC', token: 'short-lived', resolvedAt: capturedAt });
  });

  it('blocks insecure origins, denied permissions, and inaccurate readings with actionable messages', async () => {
    const fetcher = vi.fn();
    await expect(resolveCurrentBrowserLocation({ geolocation: geolocation(position()), fetcher, secureContext: false })).rejects.toThrow('HTTPS');
    await expect(resolveCurrentBrowserLocation({ geolocation: { getCurrentPosition: (_success, failure) => failure?.({ code: 1 } as GeolocationPositionError) }, fetcher, secureContext: true })).rejects.toThrow('permissão');
    await expect(resolveCurrentBrowserLocation({ geolocation: geolocation(position({ accuracy: 5_001 })), fetcher, secureContext: true })).rejects.toThrow('imprecisa');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('surfaces resolve failures and never considers a stale or expired proof reusable', async () => {
    const capturedAt = Date.now();
    await expect(resolveCurrentBrowserLocation({
      geolocation: geolocation(position({}, capturedAt)),
      fetcher: vi.fn().mockResolvedValue(response({ error: 'Não encontramos uma cidade compatível com clubes ativos.' }, false)),
      now: () => capturedAt,
      secureContext: true,
    })).rejects.toBeInstanceOf(BrowserLocationError);

    const proof = { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'token', expiresAt: new Date(capturedAt + 300_000).toISOString(), resolvedAt: capturedAt };
    expect(isBrowserLocationProofFresh(proof, capturedAt + 299_000)).toBe(true);
    expect(isBrowserLocationProofFresh(proof, capturedAt + 300_000)).toBe(false);
    expect(isBrowserLocationProofFresh(proof, capturedAt - 1)).toBe(false);
  });

  it('offers only clubs in the GPS-confirmed city and state', () => {
    const clubs = [
      { id: 'joa-sc-1', name: 'Arena SC', city: 'Joaçaba', state: 'SC' },
      { id: 'joa-sc-2', name: 'Clube SC', city: 'Joacaba', state: 'SC' },
      { id: 'joa-rs', name: 'Arena RS', city: 'Joaçaba', state: 'RS' },
      { id: 'chapeco-sc', name: 'Arena Chapecó', city: 'Chapecó', state: 'SC' },
    ];
    expect(clubsForBrowserLocation(clubs, { city: 'Joaçaba', state: 'SC' }).map((club) => club.id)).toEqual(['joa-sc-1', 'joa-sc-2']);
  });

  it('lets the player declare the city by hand when GPS is unavailable', async () => {
    const now = Date.now();
    const fetcher = vi.fn().mockResolvedValue(response({ location: { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'manual-token', expiresAt: new Date(now + 300_000).toISOString(), source: 'manual' } }));
    const proof = await resolveManualBrowserLocation(' Joaçaba ', { fetcher, now: () => now });

    expect(fetcher).toHaveBeenCalledWith('/api/location/resolve', expect.objectContaining({ method: 'POST', body: JSON.stringify({ city: 'Joaçaba' }) }));
    expect(proof).toMatchObject({ city: 'Joaçaba', state: 'SC', token: 'manual-token', resolvedAt: now, source: 'manual' });
    expect(isBrowserLocationProofFresh(proof, now)).toBe(true);
  });

  it('rejects an empty city choice and surfaces server rejections of unsupported cities', async () => {
    await expect(resolveManualBrowserLocation('  ', { fetcher: vi.fn() })).rejects.toThrow('Escolha a cidade');
    await expect(resolveManualBrowserLocation('Cidade Fantasma', {
      fetcher: vi.fn().mockResolvedValue(response({ error: 'Não encontramos uma cidade com clubes ativos com esse nome.' }, false)),
    })).rejects.toThrow('clubes ativos');
  });
});
