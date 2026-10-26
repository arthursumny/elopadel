import { describe, expect, it } from 'vitest';
import { matchesSearchPreferences, type MatchSearchPreferences } from './matchmaking';
import type { OpenRoom } from './types';

const room: OpenRoom = {
  id: 'room-1',
  clubId: 'club-1',
  title: 'Ranqueada',
  club: 'Arena Padel',
  city: 'Joaçaba',
  startsAt: new Date(2026, 7, 29, 19, 0).toISOString(),
  date: '29 ago',
  time: '19:00',
  mode: 'ranked',
  tier: '4ª',
  slots: 2,
  totalSlots: 4,
  host: 'Jogador',
  distance: '—',
  tags: [],
};

const preferences: MatchSearchPreferences = {
  dates: ['2026-08-29'],
  from: '18:00',
  to: '20:00',
  city: 'Joaçaba',
  clubId: 'club-1',
};

describe('matchesSearchPreferences', () => {
  it('matches date, time, city and club together', () => {
    expect(matchesSearchPreferences(room, preferences)).toBe(true);
  });

  it('rejects rooms outside the selected time window', () => {
    expect(matchesSearchPreferences({ ...room, startsAt: new Date(2026, 7, 29, 21, 0).toISOString() }, preferences)).toBe(false);
  });

  it('rejects a different location but does not filter by category', () => {
    expect(matchesSearchPreferences({ ...room, city: 'Luzerna' }, preferences)).toBe(false);
    expect(matchesSearchPreferences({ ...room, tier: '5ª' }, preferences)).toBe(true);
  });

  it('accepts any future room when a preference is left open', () => {
    expect(matchesSearchPreferences(room, { dates: [], from: '', to: '', city: '', clubId: '' })).toBe(true);
  });
});
