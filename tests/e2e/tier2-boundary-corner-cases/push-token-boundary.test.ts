import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 2: Boundary & Corner Cases — Push Token Registration Boundaries (R3)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
    pushService.clear();
  });

  it('TC-BND-PUSH-01: Rejects empty or whitespace-only push token string (400)', async () => {
    const player = FIXTURE_PLAYERS.player1;
    client.asMobile(await generateSessionToken(player.id));

    const res1 = await client.registerPushToken({ token: '', platform: 'ios' });
    expect(res1.ok).toBe(false);
    expect(res1.status).toBe(400);

    const res2 = await client.registerPushToken({ token: '   ', platform: 'ios' });
    expect(res2.ok).toBe(false);
  });

  it('TC-BND-PUSH-02: Handles long token strings (e.g. 256+ characters) safely', async () => {
    const player = FIXTURE_PLAYERS.player1;
    client.asMobile(await generateSessionToken(player.id));

    const longToken = `ExponentPushToken[${'a'.repeat(256)}]`;
    const res = await client.registerPushToken({ token: longToken, platform: 'ios' });

    expect(res.ok).toBe(true);
    expect(pushService.getTokensForUser(player.id)).toContain(longToken);
  });

  it('TC-BND-PUSH-03: Handles rapid burst of 50 duplicate registrations without race condition', async () => {
    const player = FIXTURE_PLAYERS.player1;
    client.asMobile(await generateSessionToken(player.id));

    const token = 'ExponentPushToken[burst-stress-test]';
    const promises = Array.from({ length: 50 }, () =>
      client.registerPushToken({ token, platform: 'android' })
    );

    const results = await Promise.all(promises);
    expect(results.every((r) => r.ok)).toBe(true);

    const tokens = pushService.getTokensForUser(player.id);
    expect(tokens.filter((t) => t === token).length).toBe(1);
  });

  it('TC-BND-PUSH-04: Rejects unregister call for a token not registered by current user', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;

    // P1 registers a token
    client.asMobile(await generateSessionToken(p1.id));
    const token = 'ExponentPushToken[p1-private-device]';
    await client.registerPushToken({ token, platform: 'ios' });

    // P2 attempts to unregister P1's token
    client.asMobile(await generateSessionToken(p2.id));
    const res = await client.unregisterPushToken(token);

    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/mismatch/i);
    expect(pushService.getTokensForUser(p1.id)).toContain(token);
  });

  it('TC-BND-PUSH-05: Returns graceful empty results when sending push to user with zero tokens', async () => {
    const userWithNoDevices = 'user-zero-devices-999';

    const dispatchRes = await pushService.dispatchEventToUsers([userWithNoDevices], {
      type: 'match-formed',
      title: 'Sem dispositivos',
      body: 'Não deve falhar',
    });

    expect(dispatchRes.sentCount).toBe(0);
    expect(dispatchRes.tickets).toEqual([]);
  });
});
