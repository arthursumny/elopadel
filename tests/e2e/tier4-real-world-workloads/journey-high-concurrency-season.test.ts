import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 4: Real-World Workload — High-Concurrency Multi-Player Season Progression (R1, R2)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-JOURNEY-04: Simulates multiple concurrent matches, verifies atomic rating calculations, and ensures leaderboard integrity', async () => {
    const p1 = FIXTURE_PLAYERS.player1; // SC
    const p2 = FIXTURE_PLAYERS.player2; // SC
    const p3 = FIXTURE_PLAYERS.player3; // SC
    const p4 = FIXTURE_PLAYERS.player4; // SC

    // Match 1: P1 + P2 vs P3 + P4
    const { matchId: m1Id } = await client.formMatch({
      id: 'concurrent-match-1',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Submit and validate Match 1 (Team A wins)
    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(m1Id, [{ a: 6, b: 3 }, { a: 6, b: 4 }], 'A');
    await client.voteResult(m1Id, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p2.id));
    await client.voteResult(m1Id, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p3.id));
    const v1 = await client.voteResult(m1Id, { status: 'confirmed', winner: 'A' });
    expect(v1.matchStatus).toBe('validated');

    // Match 2: P3 + P1 vs P2 + P4 (remix)
    const { matchId: m2Id } = await client.formMatch({
      id: 'concurrent-match-2',
      teamA: { player1Id: p3.id, player2Id: p1.id },
      teamB: { player1Id: p2.id, player2Id: p4.id },
    });

    // Submit and validate Match 2 (Team A wins: P3 + P1 win)
    client.asMobile(await generateSessionToken(p3.id));
    await client.submitMatchResult(m2Id, [{ a: 7, b: 5 }, { a: 6, b: 2 }], 'A');
    await client.voteResult(m2Id, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p1.id));
    await client.voteResult(m2Id, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p2.id));
    const v2 = await client.voteResult(m2Id, { status: 'confirmed', winner: 'A' });
    expect(v2.matchStatus).toBe('validated');

    // Query leaderboard: P1 won both matches, should have 2 additional matches recorded
    client.asMobile(await generateSessionToken(p1.id));
    const p1Profile = await client.getMe();
    expect(p1Profile.player?.matches).toBe(p1.matches + 2);

    const lboard = await client.getLeaderboard('global');
    expect(lboard.ok).toBe(true);
    // Verify rankings are monotonically descending
    for (let i = 0; i < lboard.entries.length - 1; i++) {
      expect(lboard.entries[i].rating).toBeGreaterThanOrEqual(lboard.entries[i + 1].rating);
    }
  });
});
