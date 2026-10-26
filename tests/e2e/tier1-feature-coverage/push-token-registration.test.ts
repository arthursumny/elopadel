import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Idempotent Push Token Registration (R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-TOKEN-01: Registers iOS Expo push token successfully for authenticated player', async () => {
    const player = FIXTURE_PLAYERS.player1;
    client.asMobile(await generateSessionToken(player.id));

    const res = await client.registerPushToken({
      token: 'ExponentPushToken[ios-token-alpha-1]',
      platform: 'ios',
      deviceType: 'iPhone 15 Pro',
      appVersion: '1.0.0',
    });

    expect(res.ok).toBe(true);
    expect(res.registeredAt).toBeDefined();

    const registeredTokens = pushService.getTokensForUser(player.id);
    expect(registeredTokens).toContain('ExponentPushToken[ios-token-alpha-1]');
  });

  it('TC-TOKEN-02: Registers Android Expo push token successfully', async () => {
    const player = FIXTURE_PLAYERS.player2;
    client.asMobile(await generateSessionToken(player.id));

    const res = await client.registerPushToken({
      token: 'ExponentPushToken[android-token-galaxy-2]',
      platform: 'android',
      deviceType: 'Samsung Galaxy S24',
      appVersion: '1.0.0',
    });

    expect(res.ok).toBe(true);
    const tokens = pushService.getTokensForUser(player.id);
    expect(tokens).toContain('ExponentPushToken[android-token-galaxy-2]');
  });

  it('TC-TOKEN-03: Repeated token registration is strictly idempotent and does not create duplicates', async () => {
    const player = FIXTURE_PLAYERS.player3;
    client.asMobile(await generateSessionToken(player.id));

    const token = 'ExponentPushToken[idempotent-token-3]';

    // Register 5 times consecutively
    for (let i = 0; i < 5; i++) {
      const res = await client.registerPushToken({
        token,
        platform: 'ios',
      });
      expect(res.ok).toBe(true);
    }

    const tokens = pushService.getTokensForUser(player.id);
    const occurrences = tokens.filter((t) => t === token).length;
    expect(occurrences).toBe(1);
  });

  it('TC-TOKEN-04: Reassigns push token to new user when a different account logs into same physical device', async () => {
    const deviceToken = 'ExponentPushToken[shared-family-tablet]';
    const player1 = FIXTURE_PLAYERS.player1;
    const player2 = FIXTURE_PLAYERS.player2;

    // Player 1 logs in on tablet
    client.asMobile(await generateSessionToken(player1.id));
    await client.registerPushToken({ token: deviceToken, platform: 'android' });
    expect(pushService.getTokensForUser(player1.id)).toContain(deviceToken);

    // Player 2 logs into the same tablet -> token transfers to Player 2
    client.asMobile(await generateSessionToken(player2.id));
    await client.registerPushToken({ token: deviceToken, platform: 'android' });

    expect(pushService.getTokensForUser(player2.id)).toContain(deviceToken);
    expect(pushService.getTokensForUser(player1.id)).not.toContain(deviceToken);
  });

  it('TC-TOKEN-05: Unregisters push token on user logout', async () => {
    const player = FIXTURE_PLAYERS.player1;
    client.asMobile(await generateSessionToken(player.id));

    const token = 'ExponentPushToken[logout-test-token]';
    await client.registerPushToken({ token, platform: 'ios' });
    expect(pushService.getTokensForUser(player.id)).toContain(token);

    const unregRes = await client.unregisterPushToken(token);
    expect(unregRes.ok).toBe(true);
    expect(pushService.getTokensForUser(player.id)).not.toContain(token);
  });
});
