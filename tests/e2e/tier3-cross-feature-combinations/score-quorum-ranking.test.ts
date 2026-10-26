import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 3: Cross-Feature Combinations — Score Submission + Quorum Voting + Leaderboard Sync (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-XFEAT-06: Validating match outcome automatically updates Glicko-2 ratings and updates leaderboard rankings', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    // Fetch initial leaderboard
    const initialLboard = await client.getLeaderboard('city', 'Joaçaba');
    const initialP1Rating = initialLboard.entries.find((e) => e.id === p1.id)!.rating;

    // Form match
    const { matchId } = await client.formMatch({
      id: 'match-quorum-rank-sync-1',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // P1 submits score: Team A won 6-3, 6-4
    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 3 }, { a: 6, b: 4 }], 'A');

    // 3 votes reached (P1, P2 from Team A, P3 from Team B)
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p2.id));
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p3.id));
    const finalVote = await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    expect(finalVote.matchStatus).toBe('validated');

    // Fetch updated leaderboard
    const updatedLboard = await client.getLeaderboard('city', 'Joaçaba');
    const updatedP1 = updatedLboard.entries.find((e) => e.id === p1.id)!;

    // Team A won -> P1 rating should increase
    expect(updatedP1.rating).toBeGreaterThan(initialP1Rating);
  });
});
