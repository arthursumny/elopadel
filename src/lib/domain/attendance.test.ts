import { describe, expect, it } from 'vitest';
import { applyRankPenalty, noShowPenalty } from './attendance';

describe('punição por não comparecimento', () => {
  it('aumenta a punição conforme as reincidências', () => {
    expect(noShowPenalty(1)).toEqual({ mmrLoss: 100, pointsLoss: 25, suspensionDays: 1 });
    expect(noShowPenalty(2).mmrLoss).toBeGreaterThan(noShowPenalty(1).mmrLoss);
    expect(noShowPenalty(3).suspensionDays).toBe(30);
  });

  it('pode rebaixar a divisão quando a perda de pontos atravessa zero', () => {
    expect(applyRankPenalty(4, 10, 25)).toEqual({ tierOrder: 3, points: 85 });
    expect(applyRankPenalty(0, 10, 25)).toEqual({ tierOrder: 0, points: 0 });
  });
});
