import { describe, expect, it } from 'vitest';
import { calculateRatingUpdate, effectiveLeaderboardRating, expectedScore, inactiveRankPointLoss, rankPointDelta, teamRating } from './rating';

const player = (rating: number, deviation = 100) => ({ rating, deviation, volatility: 0.06, matches: 20, provisional: false });

describe('rating de duplas', () => {
  it('calcula a média da dupla e preserva a incerteza combinada', () => {
    const result = teamRating([player(1500, 80), player(1700, 120)]);
    expect(result.rating).toBe(1600);
    expect(result.deviation).toBeCloseTo(102.0, 0);
  });

  it('favorece a dupla mais forte na probabilidade esperada', () => {
    expect(expectedScore(teamRating([player(1700), player(1700)]), teamRating([player(1500), player(1500)]) )).toBeGreaterThan(0.75);
  });

  it('premia o upset com mais pontos', () => {
    const update = calculateRatingUpdate({ rating: 1500, deviation: 100 }, { rating: 1750, deviation: 100 }, 'A');
    expect(update.winnerDelta).toBeGreaterThan(update.loserDelta);
  });

  it('ajusta pontos visíveis pelo alinhamento MMR/patente', () => {
    const above = rankPointDelta(0.5, true, 1700, 1500);
    const below = rankPointDelta(0.5, true, 1300, 1500);
    expect(above).toBeGreaterThan(below);
  });

  it('aplica perda progressiva somente depois da tolerância', () => {
    expect(inactiveRankPointLoss(30)).toBe(0);
    expect(inactiveRankPointLoss(51)).toBe(15);
    expect(inactiveRankPointLoss(180)).toBe(25);
  });

  it('penaliza incerteza no ranking efetivo', () => {
    expect(effectiveLeaderboardRating(player(1600, 50))).toBeGreaterThan(effectiveLeaderboardRating(player(1600, 200)));
  });
});
