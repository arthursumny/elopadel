import { describe, expect, it } from 'vitest';
import { canValidateResult, hasConflictingResult, resultVoteCounts } from '@/lib/domain/match';

describe('Tier 2: Boundary & Corner Cases — 3-Vote Quorum & Divergence Boundaries (R1)', () => {
  it('TC-BND-QRM-01: Rejects validation if all votes originate from only one team (no mutual representation)', () => {
    // 3 votes, but all from Team A (e.g. including sub or erroneous registration)
    const votesFromTeamAOnly = [
      { playerId: 'p1', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p2', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p3', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
    ];
    // Both teams must be represented!
    expect(canValidateResult(votesFromTeamAOnly, 'A')).toBe(false);
  });

  it('TC-BND-QRM-02: Rejects validation when only 2 votes are present (below quorum threshold of 3)', () => {
    const twoVotes = [
      { playerId: 'p1', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p3', team: 'B' as const, status: 'confirmed' as const, winner: 'A' as const },
    ];
    expect(canValidateResult(twoVotes, 'A')).toBe(false);
  });

  it('TC-BND-QRM-03: Detects divergence immediately on a 2x2 split vote and blocks rating updates', () => {
    const splitVotes = [
      { playerId: 'p1', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p2', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p3', team: 'B' as const, status: 'confirmed' as const, winner: 'B' as const },
      { playerId: 'p4', team: 'B' as const, status: 'confirmed' as const, winner: 'B' as const },
    ];
    expect(hasConflictingResult(splitVotes, 'A')).toBe(true);
    expect(canValidateResult(splitVotes, 'A')).toBe(false);

    const counts = resultVoteCounts(splitVotes);
    expect(counts).toEqual({ A: 2, B: 2, pending: 0, disputed: 0 });
  });

  it('TC-BND-QRM-04: Detects divergence on 1x1 conflicting vote before full quorum arrives', () => {
    const earlyConflictVotes = [
      { playerId: 'p1', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p3', team: 'B' as const, status: 'confirmed' as const, winner: 'B' as const },
    ];
    expect(hasConflictingResult(earlyConflictVotes, 'A')).toBe(true);
    expect(canValidateResult(earlyConflictVotes, 'A')).toBe(false);
  });

  it('TC-BND-QRM-05: Blocks validation if any participant casts an explicit "disputed" vote', () => {
    const disputedVotes = [
      { playerId: 'p1', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p2', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: 'p3', team: 'B' as const, status: 'disputed' as const },
    ];
    expect(canValidateResult(disputedVotes, 'A')).toBe(false);
  });
});
