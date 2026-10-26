import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Matchmaking Lobby & Partner Invites (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-LOBBY-01: Creates solo matchmaking search with preferred dates and times', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const token = await generateSessionToken(player.id);
    client.asMobile(token);

    const res = await client.createMatchSearch({
      partyType: 'solo',
      mode: 'ranked',
      dates: ['2026-10-15', '2026-10-16'],
      from: '18:00',
      to: '20:00',
      city: 'Joaçaba',
      clubId: 'club-joacaba-001',
      sidePreference: 'left',
    });

    expect(res.ok).toBe(true);
    expect(res.searchId).toBeDefined();
  });

  it('TC-LOBBY-02: Creates duo matchmaking search and dispatches push invite to partner', async () => {
    const initiator = FIXTURE_PLAYERS.player1;
    const partner = FIXTURE_PLAYERS.player2;

    // Register push token for partner to receive push invite
    pushService.registerDeviceToken(partner.id, 'ExponentPushToken[partner-device-123]', 'ios');

    const token = await generateSessionToken(initiator.id);
    client.asMobile(token);

    const res = await client.createMatchSearch({
      partyType: 'duo',
      partnerId: partner.id,
      mode: 'ranked',
      dates: ['2026-10-15'],
      from: '19:00',
      to: '21:00',
      city: 'Joaçaba',
      sidePreference: 'left',
      partnerSidePreference: 'right',
    });

    expect(res.ok).toBe(true);
    expect(res.searchId).toBeDefined();

    // Verify push notification was sent to partner
    const partnerNotifications = pushService.getSentForUser(partner.id);
    expect(partnerNotifications.length).toBe(1);
    expect(partnerNotifications[0].data?.type).toBe('match-search-invitation');
    expect(partnerNotifications[0].title).toMatch(/convite/i);
  });

  it('TC-LOBBY-03: Rejects duo search if both partners require the same exclusive court side', async () => {
    const initiator = FIXTURE_PLAYERS.player1;
    const partner = FIXTURE_PLAYERS.player2;

    const token = await generateSessionToken(initiator.id);
    client.asMobile(token);

    // Both insist on 'left'
    const res = await client.createMatchSearch({
      partyType: 'duo',
      partnerId: partner.id,
      mode: 'ranked',
      dates: ['2026-10-15'],
      from: '19:00',
      to: '21:00',
      city: 'Joaçaba',
      sidePreference: 'left',
      partnerSidePreference: 'left',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(409);
    expect(res.error).toMatch(/court side/i);
  });

  it('TC-LOBBY-04: Rejects ranked duo search if partner MMR difference exceeds 300 points', async () => {
    const initiator = FIXTURE_PLAYERS.player1; // MMR 1800
    const elitePartner = FIXTURE_PLAYERS.elitePlayer; // MMR 2850 (diff > 1000)

    const token = await generateSessionToken(initiator.id);
    client.asMobile(token);

    const res = await client.createMatchSearch({
      partyType: 'duo',
      partnerId: elitePartner.id,
      mode: 'ranked',
      dates: ['2026-10-15'],
      from: '19:00',
      to: '21:00',
      city: 'Joaçaba',
    });

    expect(res.ok).toBe(false);
    expect(res.code).toBe(409);
    expect(res.error).toMatch(/exceeds 300 points/i);
  });

  it('TC-LOBBY-05: Cancels active matchmaking search cleanly', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const token = await generateSessionToken(player.id);
    client.asMobile(token);

    const createRes = await client.createMatchSearch({
      partyType: 'solo',
      mode: 'friendly',
      dates: ['2026-10-15'],
      from: '14:00',
      to: '16:00',
      city: 'Joaçaba',
    });

    const cancelRes = await client.cancelMatchSearch(createRes.searchId!);
    expect(cancelRes.ok).toBe(true);
  });
});
