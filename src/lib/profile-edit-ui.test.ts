import { describe, expect, it } from 'vitest';
import {
  buildLocationOptions,
  clubIdForLocation,
  clubNameFor,
  clubsForLocation,
  locationKey,
  parseLocationKey,
} from './profile-edit-ui';

const clubs = [
  { id: 'sp-1', name: 'Padel House', city: 'São Paulo', state: 'SP', country: 'Brasil' },
  { id: 'campinas-1', name: 'Arena Campinas', city: 'Campinas', state: 'SP', country: 'Brasil' },
  { id: 'bom-jesus-mg', name: 'Arena MG', city: 'Bom Jesus', state: 'MG', country: 'Brasil' },
  { id: 'bom-jesus-rs', name: 'Arena RS', city: 'Bom Jesus', state: 'RS', country: 'Brasil' },
];

describe('profile edit location helpers', () => {
  it('keeps homonymous cities distinct by state and country', () => {
    expect(locationKey({ city: 'Bom Jesus', state: 'MG', country: 'Brasil' }))
      .not.toBe(locationKey({ city: 'Bom Jesus', state: 'RS', country: 'Brasil' }));
    expect(locationKey({ city: 'Bom Jesus', state: 'MG', country: 'Brasil' }))
      .not.toBe(locationKey({ city: 'Bom Jesus', state: 'MG', country: 'Portugal' }));
    expect(parseLocationKey(locationKey({ city: 'Bom Jesus', state: 'MG', country: 'Brasil' })))
      .toEqual({ city: 'Bom Jesus', state: 'MG', country: 'Brasil' });
  });

  it('filters clubs by the complete location, not only the city name', () => {
    expect(clubsForLocation(clubs, { city: 'Bom Jesus', state: 'MG', country: 'Brasil' }).map((club) => club.id)).toEqual(['bom-jesus-mg']);
    expect(clubsForLocation(clubs, { city: 'Bom Jesus', state: 'RS', country: 'Brasil' }).map((club) => club.id)).toEqual(['bom-jesus-rs']);
  });

  it('clears a club when the selected location changes', () => {
    expect(clubIdForLocation('sp-1', { city: 'Campinas', state: 'SP', country: 'Brasil' }, clubs)).toBe('');
    expect(clubIdForLocation('campinas-1', { city: 'Campinas', state: 'SP', country: 'Brasil' }, clubs)).toBe('campinas-1');
  });

  it('keeps the current location selectable when it is absent from the catalog', () => {
    const options = buildLocationOptions([{ city: 'São Paulo', state: 'SP', country: 'Brasil', clubCount: 2 }], { city: 'Campinas', state: 'SP', country: 'Brasil' });
    expect(options.some((option) => option.city === 'Campinas' && option.clubCount === 0)).toBe(true);
  });

  it('only names a pending club, never a current approved club', () => {
    expect(clubNameFor({ clubId: 'sp-1', clubStatus: 'pending', currentClub: null }, clubs)).toBe('Padel House');
    expect(clubNameFor({ clubId: 'sp-1', clubStatus: 'approved', currentClub: { id: 'sp-1', name: 'Padel House' } }, clubs)).toBeNull();
  });
});
