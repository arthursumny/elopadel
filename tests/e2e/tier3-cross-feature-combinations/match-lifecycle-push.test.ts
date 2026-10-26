import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 3: Cross-Feature Combinations — Match Room Formation + Acceptance + Check-in Push (R1 x R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-XFEAT-05: Complete sequence: Match formed push -> 4 accepts -> Confirmed push -> 4 check-ins -> Ready to play push', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    // Register push tokens for all 4
    pushService.registerDeviceToken(p1.id, 'ExponentPushToken[seq-p1]');
    pushService.registerDeviceToken(p2.id, 'ExponentPushToken[seq-p2]');
    pushService.registerDeviceToken(p3.id, 'ExponentPushToken[seq-p3]');
    pushService.registerDeviceToken(p4.id, 'ExponentPushToken[seq-p4]');

    // Step 1: Form match
    const pastStartTime = new Date(Date.now() - 60 * 1000); // Match already at starting time
    const { matchId } = await client.formMatch({
      id: 'match-lifecycle-seq-1',
      startsAt: pastStartTime,
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Check match formed push
    expect(pushService.getSentForUser(p1.id).some((p) => p.data?.type === 'match-formed')).toBe(true);

    // Step 2: All 4 accept
    for (const p of [p1, p2, p3, p4]) {
      client.asMobile(await generateSessionToken(p.id));
      await client.acceptMatch(matchId, 'accept');
    }

    // Check match confirmed push
    expect(pushService.getSentForUser(p1.id).some((p) => p.data?.type === 'match-confirmed')).toBe(true);

    // Step 3: All 4 check in
    for (const p of [p1, p2, p3, p4]) {
      client.asMobile(await generateSessionToken(p.id));
      await client.checkInAttendance(matchId);
    }

    // Check ready to play push
    expect(pushService.getSentForUser(p1.id).some((p) => p.data?.type === 'match-ready-to-play')).toBe(true);
  });
});
