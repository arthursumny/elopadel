import { describe, expect, it } from 'vitest';
import { getSeasonViewState, hasPlayerSeasonStanding } from './season-state';

describe('season view state', () => {
  it('separates no active season from an active empty season', () => {
    expect(getSeasonViewState({ active: false, leaderboard: [] })).toBe('inactive');
    expect(getSeasonViewState({ active: true, leaderboard: [] })).toBe('empty');
  });

  it('marks a season with validated entries as active', () => {
    expect(getSeasonViewState({
      active: true,
      leaderboard: [{ position: 1, name: 'Marina', initials: 'MS', tier: '4ª II', points: 120, isCurrentPlayer: true }],
    })).toBe('active');
  });

  it('only treats a positive position as player standing', () => {
    expect(hasPlayerSeasonStanding({ position: 0 })).toBe(false);
    expect(hasPlayerSeasonStanding({ position: 7 })).toBe(true);
  });
});
