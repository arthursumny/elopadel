import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Location from 'expo-location';
import { matchmakingApi } from '../api/matchmaking';
import { clubsForMatchmakingLocation, isMatchmakingLocationProofFresh, MatchmakingLocationError, resolveCurrentMatchmakingLocation } from './matchmaking-location';

vi.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

const freshTimestamp = 1_797_000_000_000;

function gpsPosition(overrides: Partial<Location.LocationObjectCoords> = {}): Location.LocationObject {
  return {
    coords: { latitude: -27.1, longitude: -51.5, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null, ...overrides },
    timestamp: freshTimestamp,
  };
}

describe('mobile matchmaking location', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as Location.LocationPermissionResponse);
    vi.mocked(Location.getCurrentPositionAsync).mockResolvedValue(gpsPosition());
  });

  it('asks for foreground permission, captures a fresh precise fix, and resolves a short-lived token', async () => {
    const resolve = vi.spyOn(matchmakingApi, 'resolveLocation').mockResolvedValue({
      location: { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'fresh-proof', expiresAt: new Date(freshTimestamp + 300_000).toISOString() },
    });
    const proof = await resolveCurrentMatchmakingLocation(() => freshTimestamp);

    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledOnce();
    expect(Location.getCurrentPositionAsync).toHaveBeenCalledWith({ accuracy: Location.Accuracy.High });
    expect(resolve).toHaveBeenCalledWith({ latitude: -27.1, longitude: -51.5, accuracy: 12, timestamp: freshTimestamp });
    expect(proof).toMatchObject({ city: 'Joaçaba', state: 'SC', token: 'fresh-proof', resolvedAt: freshTimestamp });
  });

  it('blocks when permission is denied or location accuracy is worse than 100 metres', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied', granted: false } as Location.LocationPermissionResponse);
    await expect(resolveCurrentMatchmakingLocation()).rejects.toThrow('Permita o acesso');
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();

    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted', granted: true } as Location.LocationPermissionResponse);
    vi.mocked(Location.getCurrentPositionAsync).mockResolvedValue(gpsPosition({ accuracy: 101 }));
    await expect(resolveCurrentMatchmakingLocation(() => freshTimestamp)).rejects.toThrow('imprecisa');
    expect(matchmakingApi.resolveLocation).not.toHaveBeenCalled();
  });

  it('surfaces provider errors and does not reuse an expired location proof', async () => {
    vi.spyOn(matchmakingApi, 'resolveLocation').mockRejectedValue(new Error('Validação indisponível'));
    await expect(resolveCurrentMatchmakingLocation(() => freshTimestamp)).rejects.toThrow('Validação indisponível');

    const proof = { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'proof', expiresAt: new Date(freshTimestamp + 300_000).toISOString(), resolvedAt: freshTimestamp };
    expect(isMatchmakingLocationProofFresh(proof, freshTimestamp + 299_000)).toBe(true);
    expect(isMatchmakingLocationProofFresh(proof, freshTimestamp + 300_000)).toBe(false);
    expect(isMatchmakingLocationProofFresh(proof, freshTimestamp - 1)).toBe(false);
  });

  it('shows clubs only from the verified city and UF', () => {
    const clubs = [
      { id: 'sc-1', name: 'Arena SC', city: 'Joaçaba', state: 'SC', country: 'Brasil' },
      { id: 'sc-2', name: 'Clube SC', city: 'Joacaba', state: 'SC', country: 'Brasil' },
      { id: 'rs', name: 'Arena RS', city: 'Joaçaba', state: 'RS', country: 'Brasil' },
      { id: 'other-city', name: 'Arena Chapecó', city: 'Chapecó', state: 'SC', country: 'Brasil' },
    ];
    expect(clubsForMatchmakingLocation(clubs, { city: 'Joaçaba', state: 'SC' }).map((club) => club.id)).toEqual(['sc-1', 'sc-2']);
  });

  it('stops waiting for a GPS fix after ten seconds', async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => {}));
      const result = resolveCurrentMatchmakingLocation(() => freshTimestamp);
      const rejection = expect(result).rejects.toThrow('a tempo');
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);
      await rejection;
      expect(matchmakingApi.resolveLocation).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
