import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Friends & @Handle Discovery (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-FRIENDS-01: Searches players by @handle without exposing private phone numbers', async () => {
    const res = await client.searchPlayers('@carlos');

    expect(res.ok).toBe(true);
    expect(res.players.length).toBeGreaterThanOrEqual(1);

    const carlos = res.players.find((p) => p.handle === FIXTURE_PLAYERS.player1.handle);
    expect(carlos).toBeDefined();
    expect(carlos?.displayName).toBe(FIXTURE_PLAYERS.player1.displayName);
    // Strict privacy contract: phone number must NOT be present in discovery response
    expect((carlos as any).phone).toBeUndefined();
  });

  it('TC-FRIENDS-02: Searches players by display name with partial matching and case insensitivity', async () => {
    const res = await client.searchPlayers('marina');

    expect(res.ok).toBe(true);
    const marina = res.players.find((p) => p.id === FIXTURE_PLAYERS.player2.id);
    expect(marina).toBeDefined();
  });

  it('TC-FRIENDS-03: Sends friend request and delivers push notification to recipient', async () => {
    const sender = FIXTURE_PLAYERS.player1;
    const recipient = FIXTURE_PLAYERS.player2;

    pushService.registerDeviceToken(recipient.id, 'ExponentPushToken[recipient-phone-1]');

    client.asMobile(await generateSessionToken(sender.id));
    const res = await client.sendFriendRequest(recipient.id);

    expect(res.ok).toBe(true);
    expect(res.status).toBe('pending');

    const recipientNotifications = pushService.getSentForUser(recipient.id);
    const friendPush = recipientNotifications.find((n) => n.data?.type === 'friend-request');
    expect(friendPush).toBeDefined();
    expect(friendPush?.title).toMatch(/amizade/i);
  });

  it('TC-FRIENDS-04: Automatically converts reciprocal friend requests into "accepted" connection', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;

    // Step 1: P1 sends request to P2
    client.asMobile(await generateSessionToken(p1.id));
    const r1 = await client.sendFriendRequest(p2.id);
    expect(r1.status).toBe('pending');

    // Step 2: P2 sends reciprocal request to P1 -> auto-accepts!
    client.asMobile(await generateSessionToken(p2.id));
    const r2 = await client.sendFriendRequest(p1.id);
    expect(r2.status).toBe('accepted');
  });

  it('TC-FRIENDS-05: Returns empty array gracefully when search query matches no players', async () => {
    const res = await client.searchPlayers('@nonexistent_player_12345');
    expect(res.ok).toBe(true);
    expect(res.players).toEqual([]);
  });
});
