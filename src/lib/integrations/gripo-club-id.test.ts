import { describe, it, expect } from 'vitest';
import { resolveGripoClubIdFromRecord } from './gripo';

describe('resolveGripoClubIdFromRecord', () => {
  it('returns gripoClubId directly when present on the club record', () => {
    const result = resolveGripoClubIdFromRecord({
      gripoClubId: 999,
      gripoUrl: 'https://gripo.app/racket-center',
    });

    expect(result).toBe(999);
  });

  it('falls back to resolving via gripoUrl when gripoClubId is null', () => {
    const result = resolveGripoClubIdFromRecord({
      gripoClubId: null,
      gripoUrl: 'https://gripo.app/racket-center-joacaba-sc',
    });

    expect(result).toBe(122);
  });

  it('falls back to resolving via gripoUrl when gripoClubId is undefined', () => {
    const result = resolveGripoClubIdFromRecord({
      gripoUrl: 'https://gripo.app/padel-joacaba-joacaba-sc',
    });

    expect(result).toBe(31);
  });

  it('returns null when gripoClubId is missing and gripoUrl cannot be resolved', () => {
    const result = resolveGripoClubIdFromRecord({
      gripoClubId: null,
      gripoUrl: 'https://gripo.app/unknown-club',
    });

    expect(result).toBeNull();
  });

  it('handles null or empty club records safely', () => {
    expect(resolveGripoClubIdFromRecord(null)).toBeNull();
    expect(resolveGripoClubIdFromRecord(undefined)).toBeNull();
    expect(resolveGripoClubIdFromRecord({})).toBeNull();
  });
});
