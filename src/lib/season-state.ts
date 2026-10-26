import type { SeasonData } from './types';

export type SeasonViewState = 'inactive' | 'empty' | 'active';

export function getSeasonViewState(season: Pick<SeasonData, 'active' | 'leaderboard'>): SeasonViewState {
  if (!season.active) return 'inactive';
  return season.leaderboard.length === 0 ? 'empty' : 'active';
}

export function hasPlayerSeasonStanding(season: Pick<SeasonData, 'position'>): boolean {
  return season.position > 0;
}
