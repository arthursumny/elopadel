import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 4: Real-World Workload — Journey of a Competitive Match Dispute (R1, R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-JOURNEY-03: Full match with conflicting score claims, dispute freeze, alert dispatch, and audit protection', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    const initialRatings: Record<string, number> = {
      [p1.id]: p1.rating,
      [p2.id]: p2.rating,
      [p3.id]: p3.rating,
      [p4.id]: p4.rating,
    };

    // Register push tokens for all 4 players
    pushService.registerDeviceToken(p1.id, 'ExponentPushToken[dispute-journey-p1]');
    pushService.registerDeviceToken(p2.id, 'ExponentPushToken[dispute-journey-p2]');
    pushService.registerDeviceToken(p3.id, 'ExponentPushToken[dispute-journey-p3]');
    pushService.registerDeviceToken(p4.id, 'ExponentPushToken[dispute-journey-p4]');

    // Step 1: Form match
    const { matchId } = await client.formMatch({
      id: 'match-journey-dispute-01',
      startsAt: new Date(Date.now() - 7200 * 1000), // Match played earlier
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Step 2: All 4 check in
    for (const p of [p1, p2, p3, p4]) {
      client.asMobile(await generateSessionToken(p.id));
      await client.checkInAttendance(matchId);
    }

    // Step 3: Player 1 submits score: Team A won 6-4, 6-4
    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 4 }, { a: 6, b: 4 }], 'A');
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    // Step 4: Player 3 (Team B) disputes the result
    client.asMobile(await generateSessionToken(p3.id));
    const voteRes = await client.voteResult(matchId, { status: 'disputed' });

    // Verify match status immediately transited to 'disputed'
    expect(voteRes.matchStatus).toBe('disputed');

    // Step 5: Verify all ratings are 100% frozen
    for (const p of [p1, p2, p3, p4]) {
      client.asMobile(await generateSessionToken(p.id));
      const prof = await client.getMe();
      expect(prof.player?.rating).toBe(initialRatings[p.id as keyof typeof initialRatings]);
      expect(prof.player?.matches).toBe(p.matches); // Matches not incremented
    }

    // Step 6: Verify dispute push notifications were dispatched to all players
    for (const p of [p1, p2, p3, p4]) {
      const pushes = pushService.getSentForUser(p.id);
      expect(pushes.some((msg) => msg.data?.type === 'result-disputed')).toBe(true);
    }
  });
});
