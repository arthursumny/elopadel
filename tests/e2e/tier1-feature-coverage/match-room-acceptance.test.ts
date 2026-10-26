import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Match Room Lifecycle & Acceptance (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-ROOM-01: Dispatches match-formed push notifications to all 4 players upon match creation', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    pushService.registerDeviceToken(p1.id, 'ExponentPushToken[p1]');
    pushService.registerDeviceToken(p2.id, 'ExponentPushToken[p2]');
    pushService.registerDeviceToken(p3.id, 'ExponentPushToken[p3]');
    pushService.registerDeviceToken(p4.id, 'ExponentPushToken[p4]');

    const res = await client.formMatch({
      id: 'match-acceptance-01',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    expect(res.ok).toBe(true);
    expect(pushService.getSentForUser(p1.id).length).toBe(1);
    expect(pushService.getSentForUser(p2.id).length).toBe(1);
    expect(pushService.getSentForUser(p3.id).length).toBe(1);
    expect(pushService.getSentForUser(p4.id).length).toBe(1);

    const notification = pushService.getSentForUser(p1.id)[0];
    expect(notification.data?.type).toBe('match-formed');
  });

  it('TC-ROOM-02: Transitions status to "confirmed" when all 4 players accept', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    const { matchId } = await client.formMatch({
      id: 'match-acceptance-02',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Player 1 accepts
    client.asMobile(await generateSessionToken(p1.id));
    let status = (await client.acceptMatch(matchId, 'accept')).status;
    expect(status).toBe('confirming');

    // Player 2 accepts
    client.asMobile(await generateSessionToken(p2.id));
    status = (await client.acceptMatch(matchId, 'accept')).status;
    expect(status).toBe('confirming');

    // Player 3 accepts
    client.asMobile(await generateSessionToken(p3.id));
    status = (await client.acceptMatch(matchId, 'accept')).status;
    expect(status).toBe('confirming');

    // Player 4 accepts -> 4/4 confirmed!
    client.asMobile(await generateSessionToken(p4.id));
    status = (await client.acceptMatch(matchId, 'accept')).status;
    expect(status).toBe('confirmed');
  });

  it('TC-ROOM-03: Cancels match immediately if any player declines', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    const { matchId } = await client.formMatch({
      id: 'match-acceptance-03',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Player 1 declines
    client.asMobile(await generateSessionToken(p1.id));
    const res = await client.acceptMatch(matchId, 'decline');

    expect(res.ok).toBe(true);
    expect(res.status).toBe('cancelled');
  });

  it('TC-ROOM-04: Dispatches match-cancelled push notification to all participants on decline', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    pushService.registerDeviceToken(p2.id, 'ExponentPushToken[p2-cancel]');

    const { matchId } = await client.formMatch({
      id: 'match-acceptance-04',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    await client.acceptMatch(matchId, 'decline');

    const p2Notifications = pushService.getSentForUser(p2.id);
    const cancelNotification = p2Notifications.find((n) => n.data?.type === 'match-cancelled');
    expect(cancelNotification).toBeDefined();
    expect(cancelNotification?.title).toMatch(/cancelada/i);
  });

  it('TC-ROOM-05: Rejects acceptance action from unauthorized non-participant', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    const { matchId } = await client.formMatch({
      id: 'match-acceptance-05',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Unauthenticated client
    const unauthClient = new OpaqueBoxClient('mobile');
    const res = await unauthClient.acceptMatch(matchId, 'accept');

    expect(res.ok).toBe(false);
    expect(res.status).toBe('unauthorized');
  });
});
