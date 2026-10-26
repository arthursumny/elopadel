import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  leaderboardApi,
  filterLeaderboardByScope,
  findUserRank,
} from './leaderboard';
import { apiClient } from './client';
import type { LeaderboardEntry } from './types';

const mockEntries: LeaderboardEntry[] = [
  {
    position: 1,
    player: 'Alice Silva',
    handle: '@alice',
    initials: 'AS',
    club: 'Arena Padel Morumbi',
    city: 'São Paulo',
    state: 'SP',
    tier: '1ª I',
    points: 98,
    delta: 50,
    active: true,
  },
  {
    position: 2,
    player: 'Bob Santos',
    handle: '@bob',
    initials: 'BS',
    club: 'Padel Club Campinas',
    city: 'Campinas',
    state: 'SP',
    tier: '2ª II',
    points: 85,
    delta: 30,
    active: true,
  },
  {
    position: 3,
    player: 'Carlos Mendes',
    handle: '@carlos',
    initials: 'CM',
    club: 'Arena Padel Morumbi',
    city: 'Curitiba',
    state: 'PR',
    tier: '3ª I',
    points: 75,
    delta: -10,
    active: true,
  },
  {
    position: 4,
    player: 'Daniela Lima',
    handle: '@daniela',
    initials: 'DL',
    club: 'Padel Club Jardins',
    city: 'São Paulo',
    state: 'SP',
    tier: '4ª II',
    points: 60,
    delta: 20,
    active: true,
  },
];

describe('leaderboardApi Service & Scope Filtering Unit Tests (`leaderboard.ts`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('filterLeaderboardByScope()', () => {
    it('TC-RANK-01: global scope returns all entries re-indexed sequentially', () => {
      const res = filterLeaderboardByScope(mockEntries, 'global');
      expect(res).toHaveLength(4);
      expect(res[0].position).toBe(1);
      expect(res[3].position).toBe(4);
    });

    it('TC-RANK-02: state scope filters by user state and recalculates positions 1..N', () => {
      const res = filterLeaderboardByScope(mockEntries, 'state', { state: 'SP' });
      expect(res).toHaveLength(3); // Alice, Bob, Daniela
      expect(res.map((e) => e.handle)).toEqual(['@alice', '@bob', '@daniela']);
      expect(res[0].position).toBe(1);
      expect(res[1].position).toBe(2);
      expect(res[2].position).toBe(3);
    });

    it('TC-RANK-03: city scope filters by user city and recalculates positions', () => {
      const res = filterLeaderboardByScope(mockEntries, 'city', { city: 'São Paulo' });
      expect(res).toHaveLength(2); // Alice, Daniela
      expect(res[0].handle).toBe('@alice');
      expect(res[0].position).toBe(1);
      expect(res[1].handle).toBe('@daniela');
      expect(res[1].position).toBe(2);
    });

    it('TC-RANK-04: club scope filters by user club and recalculates positions', () => {
      const res = filterLeaderboardByScope(mockEntries, 'club', { club: 'Arena Padel Morumbi' });
      expect(res).toHaveLength(2); // Alice, Carlos
      expect(res[0].handle).toBe('@alice');
      expect(res[0].position).toBe(1);
      expect(res[1].handle).toBe('@carlos');
      expect(res[1].position).toBe(2);
    });

    it('TC-RANK-05: returns empty array if no players match filter', () => {
      const res = filterLeaderboardByScope(mockEntries, 'city', { city: 'Manaus' });
      expect(res).toHaveLength(0);
    });
  });

  describe('findUserRank()', () => {
    it('TC-RANK-06: locates user rank in filtered list by handle with or without @', () => {
      const rankWithAt = findUserRank(mockEntries, '@daniela');
      expect(rankWithAt).not.toBeNull();
      expect(rankWithAt?.position).toBe(4);
      expect(rankWithAt?.entry?.player).toBe('Daniela Lima');

      const rankWithoutAt = findUserRank(mockEntries, 'daniela');
      expect(rankWithoutAt?.position).toBe(4);
    });

    it('TC-RANK-07: returns null when user is not found in ranking', () => {
      expect(findUserRank(mockEntries, '@inexistente')).toBeNull();
      expect(findUserRank(mockEntries, '')).toBeNull();
    });
  });

  describe('leaderboardApi.getLeaderboard()', () => {
    it('TC-RANK-08: fetches and applies state filtering', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ entries: mockEntries });

      const res = await leaderboardApi.getLeaderboard({
        scope: 'state',
        userContext: { state: 'PR' },
      });

      expect(apiClient.get).toHaveBeenCalledWith('/api/leaderboard', {
        params: { scope: 'state' },
      });
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].handle).toBe('@carlos');
      expect(res.entries[0].position).toBe(1);
    });
  });
});
