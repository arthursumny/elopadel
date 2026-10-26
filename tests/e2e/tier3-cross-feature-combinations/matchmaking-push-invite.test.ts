import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 3: Cross-Feature Combinations — Matchmaking Lobby + Duo Push Invites (R1 x R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-XFEAT-03: Initiates duo search, delivers push invitation to partner, and verifies partner receives inviter details', async () => {
    const initiator = FIXTURE_PLAYERS.player1;
    const partner = FIXTURE_PLAYERS.player2;

    // Partner registers device push token
    pushService.registerDeviceToken(partner.id, 'ExponentPushToken[partner-iphone]', 'ios');

    // Initiator logs in and starts duo search
    client.asMobile(await generateSessionToken(initiator.id));
    const searchRes = await client.createMatchSearch({
      partyType: 'duo',
      partnerId: partner.id,
      mode: 'ranked',
      dates: ['2026-10-20'],
      from: '18:00',
      to: '20:00',
      city: 'Joaçaba',
      sidePreference: 'left',
      partnerSidePreference: 'right',
    });

    expect(searchRes.ok).toBe(true);

    // Verify partner device received the push notification
    const partnerPushes = pushService.getSentForUser(partner.id);
    expect(partnerPushes.length).toBe(1);

    const invitePush = partnerPushes[0];
    expect(invitePush.data?.type).toBe('match-search-invitation');
    expect(invitePush.data?.inviterId).toBe(initiator.id);
    expect(invitePush.title).toMatch(/convite/i);
  });

  it('TC-XFEAT-04: Reciprocal friend request combined with duo invite creation flow', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p3 = FIXTURE_PLAYERS.player3;

    pushService.registerDeviceToken(p3.id, 'ExponentPushToken[p3-device]');

    // Step 1: P1 sends friend request to P3
    client.asMobile(await generateSessionToken(p1.id));
    await client.sendFriendRequest(p3.id);

    // Step 2: P3 sends reciprocal friend request -> connection accepted
    client.asMobile(await generateSessionToken(p3.id));
    const friendRes = await client.sendFriendRequest(p1.id);
    expect(friendRes.status).toBe('accepted');

    // Step 3: P3 immediately creates duo queue with newly connected friend P1
    const duoRes = await client.createMatchSearch({
      partyType: 'duo',
      partnerId: p1.id,
      mode: 'ranked',
      dates: ['2026-10-21'],
      from: '19:00',
      to: '21:00',
      city: 'Joaçaba',
      sidePreference: 'right',
      partnerSidePreference: 'left',
    });

    expect(duoRes.ok).toBe(true);
  });
});
