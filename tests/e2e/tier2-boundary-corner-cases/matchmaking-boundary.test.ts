import { describe, expect, it } from 'vitest';
import { areCompetitivePlayersCompatible, areTeamSidesCompatible } from '@/lib/domain/matchmaking';

describe('Tier 2: Boundary & Corner Cases — Matchmaking Domain Boundaries (R1)', () => {
  it('TC-BND-MM-01: Accepts players with MMR difference exactly at 300 points boundary', () => {
    const players = [
      { rating: 1500, tier: '5ª I' },
      { rating: 1800, tier: '4ª II' }, // Delta = exactly 300 MMR, order delta = exactly 2
    ];
    expect(areCompetitivePlayersCompatible(players)).toBe(true);
  });

  it('TC-BND-MM-02: Rejects players with MMR difference at 301 points boundary in ranked mode', () => {
    const players = [
      { rating: 1500, tier: '5ª II' },
      { rating: 1801, tier: '4ª I' }, // Delta = 301 (> 300)
    ];
    expect(areCompetitivePlayersCompatible(players)).toBe(false);
  });

  it('TC-BND-MM-03: Rejects team where both players demand "right" side exclusively', () => {
    const members = [
      { id: 'p1', sidePreference: 'right' as const },
      { id: 'p2', sidePreference: 'right' as const },
    ];
    expect(areTeamSidesCompatible(members)).toBe(false);
  });

  it('TC-BND-MM-04: Rejects team where both players demand "left" side exclusively', () => {
    const members = [
      { id: 'p1', sidePreference: 'left' as const },
      { id: 'p2', sidePreference: 'left' as const },
    ];
    expect(areTeamSidesCompatible(members)).toBe(false);
  });

  it('TC-BND-MM-05: Accepts team when at least one player has "any" side preference', () => {
    const leftAndFlexible = [
      { id: 'p1', sidePreference: 'left' as const },
      { id: 'p2', sidePreference: 'any' as const },
    ];
    expect(areTeamSidesCompatible(leftAndFlexible)).toBe(true);

    const bothFlexible = [
      { id: 'p1', sidePreference: 'any' as const },
      { id: 'p2', sidePreference: 'any' as const },
    ];
    expect(areTeamSidesCompatible(bothFlexible)).toBe(true);
  });
});
