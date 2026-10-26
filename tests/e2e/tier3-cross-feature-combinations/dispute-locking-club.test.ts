import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 3: Cross-Feature Combinations — Divergence Locking + Dispute Push (R1 x R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-XFEAT-07: Conflicting votes lock match in "disputed", freeze ratings, and send alert push to all players', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    const initialP1Rating = p1.rating;
    const initialP3Rating = p3.rating;

    pushService.registerDeviceToken(p1.id, 'ExponentPushToken[dispute-p1]');
    pushService.registerDeviceToken(p3.id, 'ExponentPushToken[dispute-p3]');

    const { matchId } = await client.formMatch({
      id: 'match-dispute-lock-1',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // P1 submits score indicating Team A won
    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 4 }, { a: 7, b: 5 }], 'A');
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    // P3 votes Team B won -> CONFLICT!
    client.asMobile(await generateSessionToken(p3.id));
    const voteRes = await client.voteResult(matchId, { status: 'confirmed', winner: 'B' });

    expect(voteRes.matchStatus).toBe('disputed');

    // Verify rating changes are FROZEN (no modifications)
    client.asMobile(await generateSessionToken(p1.id));
    const p1Profile = await client.getMe();
    expect(p1Profile.player?.rating).toBe(initialP1Rating);

    client.asMobile(await generateSessionToken(p3.id));
    const p3Profile = await client.getMe();
    expect(p3Profile.player?.rating).toBe(initialP3Rating);

    // Verify dispute push notification was delivered
    const p1Notifications = pushService.getSentForUser(p1.id);
    expect(p1Notifications.some((n) => n.data?.type === 'result-disputed')).toBe(true);
  });
});
