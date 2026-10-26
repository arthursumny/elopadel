import { describe, expect, it } from 'vitest';
import { areCanonicalLocationsEqual, mapGeoapifyFeaturesToClubLocation, staleLocationReadiness } from './location-domain';

const clubs = [
  { city: 'Joaçaba', state: 'SC', country: 'Brasil', isActive: true },
  { city: 'Joaçaba', state: 'Santa Catarina', country: 'Brasil', isActive: true },
  { city: 'Chapecó', state: 'SC', country: 'Brasil', isActive: true },
  { city: 'Joaçaba', state: 'RS', country: 'Brasil', isActive: false },
];
const feature = (properties: Record<string, unknown>) => ({ type: 'Feature', properties });

describe('Geoapify location mapping', () => {
  it('maps only an unambiguous Brazilian city to an active first-party location', () => {
    expect(mapGeoapifyFeaturesToClubLocation([
      feature({ result_type: 'city', country_code: 'br', city: 'Joacaba', state_code: 'SC', state: 'Santa Catarina' }),
    ], clubs)).toEqual({ city: 'Joaçaba', state: 'SC', country: 'Brasil' });
  });

  it('rejects districts, counties, non-Brazil results, missing city and ambiguous state', () => {
    expect(mapGeoapifyFeaturesToClubLocation([feature({ result_type: 'district', country_code: 'br', city: 'Joaçaba', state_code: 'SC' })], clubs)).toBeNull();
    expect(mapGeoapifyFeaturesToClubLocation([feature({ result_type: 'city', country_code: 'ar', city: 'Joaçaba', state_code: 'SC' })], clubs)).toBeNull();
    expect(mapGeoapifyFeaturesToClubLocation([feature({ result_type: 'city', country_code: 'br', name: 'Joaçaba', state_code: 'SC' })], clubs)).toBeNull();
    expect(mapGeoapifyFeaturesToClubLocation([feature({ result_type: 'city', country_code: 'br', city: 'Joaçaba', state: 'Santa Catarina', state_code: 'RS' })], clubs)).toBeNull();
  });

  it('does not resolve a city absent from active clubs or expand to a nearby city', () => {
    expect(mapGeoapifyFeaturesToClubLocation([feature({ result_type: 'city', country_code: 'br', city: 'Chapecó', state_code: 'SC' })], [clubs[0]!])).toBeNull();
    expect(mapGeoapifyFeaturesToClubLocation([feature({ result_type: 'city', country_code: 'br', city: 'Joaçaba', state_code: 'RS' })], clubs)).toBeNull();
  });

  it('compares city, UF and country together', () => {
    expect(areCanonicalLocationsEqual({ city: 'Joacaba', state: 'SC', country: 'BR' }, { city: 'Joaçaba', state: 'Santa Catarina', country: 'Brasil' })).toBe(true);
    expect(areCanonicalLocationsEqual({ city: 'Joaçaba', state: 'SC', country: 'Brasil' }, { city: 'Chapecó', state: 'SC', country: 'Brasil' })).toBe(false);
  });

  it('marks only ready members with missing or expired location proofs as stale', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(staleLocationReadiness(now, {
      initiatorReady: true,
      initiatorExpiresAt: new Date('2026-10-26T11:59:59Z'),
      partnerReady: true,
      partnerExpiresAt: new Date('2026-10-26T12:01:00Z'),
    })).toEqual({ initiator: true, partner: false });
    expect(staleLocationReadiness(now, {
      initiatorReady: false,
      initiatorExpiresAt: null,
      partnerReady: true,
      partnerExpiresAt: null,
    })).toEqual({ initiator: false, partner: true });
  });
});
