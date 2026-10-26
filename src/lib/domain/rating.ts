import type { PlayerRating } from '@/lib/types';

export type TeamRating = {
  rating: number;
  deviation: number;
};

export type RatingUpdate = {
  winnerDelta: number;
  loserDelta: number;
  expectedWinner: number;
};

const GLICKO_SCALE = 400;

export function teamRating(players: PlayerRating[]): TeamRating {
  if (players.length !== 2) throw new Error('Uma dupla precisa de dois jogadores');
  return {
    rating: players.reduce((sum, player) => sum + player.rating, 0) / players.length,
    deviation: Math.sqrt(players.reduce((sum, player) => sum + player.deviation ** 2, 0) / players.length),
  };
}

export function expectedScore(teamA: TeamRating, teamB: TeamRating) {
  return 1 / (1 + 10 ** ((teamB.rating - teamA.rating) / GLICKO_SCALE));
}

export function calculateRatingUpdate(teamA: TeamRating, teamB: TeamRating, winner: 'A' | 'B'): RatingUpdate {
  const expectedWinner = expectedScore(teamA, teamB);
  const probability = winner === 'A' ? expectedWinner : 1 - expectedWinner;
  const winnerDelta = Math.round(24 + 20 * (1 - probability));
  const loserDelta = Math.round(24 + 20 * probability);
  return {
    winnerDelta: Math.min(44, Math.max(10, winnerDelta)),
    loserDelta: Math.min(44, Math.max(10, loserDelta)),
    expectedWinner,
  };
}

export function rankPointDelta(expectedWinProbability: number, won: boolean, rating: number, tierMidpoint: number) {
  const alignment = Math.min(1.25, Math.max(0.75, 1 + (rating - tierMidpoint) / 400));
  const raw = won
    ? 20 + 20 * (1 - expectedWinProbability)
    : -(20 + 20 * expectedWinProbability);
  const adjusted = won ? raw * alignment : raw * (2 - alignment);
  return Math.round(Math.min(40, Math.max(-40, adjusted)));
}

export function effectiveLeaderboardRating(rating: PlayerRating) {
  return rating.rating - rating.deviation * 0.25;
}

export function inactiveRankPointLoss(daysInactive: number) {
  if (daysInactive <= 30) return 0;
  return Math.min(25, Math.floor((daysInactive - 30) / 7) * 5);
}
