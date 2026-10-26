import { describe, expect, it } from 'vitest';
import { clubIdForCity, clubsForCity } from './matchmaking-club-filter';

const clubs = [
  { id: 'sp-1', name: 'Padel House', city: 'São Paulo' },
  { id: 'sp-2', name: 'Arena Sul', city: 'São Paulo' },
  { id: 'campinas-1', name: 'Padel Campinas', city: 'Campinas' },
  { id: 'rio-1', name: 'Arena Rio', city: 'Rio de Janeiro' },
];

describe('matchmaking club filter', () => {
  it('filters clubs by the exact selected city', () => {
    expect(clubsForCity(clubs, 'São Paulo').map((club) => club.id)).toEqual(['sp-1', 'sp-2']);
    expect(clubsForCity(clubs, 'Campinas').map((club) => club.id)).toEqual(['campinas-1']);
  });

  it('returns all clubs when no city is selected', () => {
    expect(clubsForCity(clubs, '').map((club) => club.id)).toEqual(['sp-1', 'sp-2', 'campinas-1', 'rio-1']);
  });

  it('clears a club that does not belong to the selected city', () => {
    expect(clubIdForCity('sp-1', 'Campinas', clubs)).toBe('');
    expect(clubIdForCity('campinas-1', 'Campinas', clubs)).toBe('campinas-1');
    expect(clubIdForCity('sp-1', '', clubs)).toBe('sp-1');
  });

  it('keeps the contract city-only behavior for homonymous cities', () => {
    const homonymous = [
      { id: 'a', name: 'A', city: 'Bom Jesus' },
      { id: 'b', name: 'B', city: 'Bom Jesus' },
    ];
    expect(clubsForCity(homonymous, 'Bom Jesus').map((club) => club.id)).toEqual(['a', 'b']);
  });
});
