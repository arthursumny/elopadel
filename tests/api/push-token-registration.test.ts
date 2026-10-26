import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, DELETE } from '@/app/api/notifications/push-token/route';
import {
  POST as aliasPOST,
  DELETE as aliasDELETE,
} from '@/app/api/push-tokens/route';
import { createSession, PLAYER_COOKIE_NAME } from '@/lib/auth';
import {
  clearRuntimePushTokens,
  getActivePushTokens,
  runtimeDevicePushTokens,
} from '@/lib/notifications/tokens';

const mockHeadersMap = new Map<string, string>();
const mockCookiesMap = new Map<string, { value: string }>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => mockHeadersMap.get(name.toLowerCase()) ?? null,
  })),
  cookies: vi.fn(async () => ({
    get: (name: string) => mockCookiesMap.get(name) ?? undefined,
    set: vi.fn((name: string, value: string) => {
      mockCookiesMap.set(name, { value });
    }),
  })),
}));

describe('Push Token Registration API (/api/notifications/push-token and alias)', () => {
  beforeEach(() => {
    mockHeadersMap.clear();
    mockCookiesMap.clear();
    clearRuntimePushTokens();
    vi.clearAllMocks();
  });

  describe('Authentication & Dual-Mode Access', () => {
    it('TC-AUTH-01: Rejects unauthenticated POST with 401', async () => {
      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[unauth-token]',
          platform: 'ios',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Não autorizado');
    });

    it('TC-AUTH-02: Rejects invalid Bearer token with 401', async () => {
      mockHeadersMap.set('authorization', 'Bearer garbage.invalid.jwt');

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[invalid-jwt-token]',
          platform: 'ios',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('TC-AUTH-03: Registers iOS token successfully with Bearer auth', async () => {
      const jwt = await createSession('player-alpha-1', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[ios-token-alpha]',
          platform: 'ios',
          deviceType: 'iPhone 15 Pro',
          appVersion: '1.2.0',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.registeredAt).toBeDefined();
      expect(json.token).toBe('ExponentPushToken[ios-token-alpha]');
      expect(json.platform).toBe('ios');

      const active = await getActivePushTokens(['player-alpha-1']);
      expect(active).toHaveLength(1);
      expect(active[0].token).toBe('ExponentPushToken[ios-token-alpha]');
      expect(active[0].deviceType).toBe('iPhone 15 Pro');
      expect(active[0].appVersion).toBe('1.2.0');
    });

    it('TC-AUTH-04: Registers Android token successfully with Bearer auth', async () => {
      const jwt = await createSession('player-android-1', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[android-token-galaxy]',
          platform: 'android',
          deviceType: 'Pixel 8',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.platform).toBe('android');

      const active = await getActivePushTokens(['player-android-1']);
      expect(active).toHaveLength(1);
      expect(active[0].platform).toBe('android');
    });

    it('TC-AUTH-05: Registers Web token successfully with cookie auth', async () => {
      const jwt = await createSession('web-player-1', 'player');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: jwt });

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[web-token-chrome]',
          platform: 'web',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);

      const active = await getActivePushTokens(['web-player-1']);
      expect(active).toHaveLength(1);
      expect(active[0].token).toBe('ExponentPushToken[web-token-chrome]');
    });

    it('TC-AUTH-06: Strict Precedence: Bearer token overrides cookie', async () => {
      const bearerUser = await createSession('bearer-priority-user', 'player');
      const cookieUser = await createSession('cookie-ignored-user', 'player');

      mockHeadersMap.set('authorization', `Bearer ${bearerUser}`);
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: cookieUser });

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[precedence-token]',
          platform: 'ios',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const bearerTokens = await getActivePushTokens(['bearer-priority-user']);
      const cookieTokens = await getActivePushTokens(['cookie-ignored-user']);
      expect(bearerTokens).toHaveLength(1);
      expect(cookieTokens).toHaveLength(0);
    });

    it('TC-AUTH-07: Security isolation: Invalid Bearer does NOT fall back to valid cookie', async () => {
      const cookieUser = await createSession('cookie-valid-user', 'player');
      mockHeadersMap.set('authorization', 'Bearer corrupt.token.signature');
      mockCookiesMap.set(PLAYER_COOKIE_NAME, { value: cookieUser });

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[security-leak-token]',
          platform: 'ios',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('Payload Validation', () => {
    it('TC-VAL-01: Rejects missing token with 400', async () => {
      const jwt = await createSession('user-val-1', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'ios' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Token de push é obrigatório');
    });

    it('TC-VAL-02: Rejects whitespace-only token with 400', async () => {
      const jwt = await createSession('user-val-2', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: '    ', platform: 'ios' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('TC-VAL-03: Rejects non-string token with 400', async () => {
      const jwt = await createSession('user-val-3', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 123456, platform: 'ios' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('TC-VAL-04: Rejects invalid platform enum with 400', async () => {
      const jwt = await createSession('user-val-4', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'ExponentPushToken[val-platform]',
          platform: 'windows',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Plataforma inválida');
    });

    it('TC-VAL-05: Rejects broken JSON body with 400', async () => {
      const jwt = await createSession('user-val-5', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{broken-json',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('TC-VAL-06: Rejects token exceeding 500 characters', async () => {
      const jwt = await createSession('user-val-6', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const req = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'A'.repeat(501),
          platform: 'ios',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe('Idempotence, Multi-User Handover & Reactivation', () => {
    it('TC-IDEMP-01: Repeated registrations by same user do not duplicate records', async () => {
      const jwt = await createSession('user-idemp-1', 'player');
      mockHeadersMap.set('authorization', `Bearer ${jwt}`);

      const token = 'ExponentPushToken[same-device-5x]';

      for (let i = 0; i < 5; i++) {
        const req = new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        });
        const res = await POST(req);
        expect(res.status).toBe(200);
      }

      const active = await getActivePushTokens(['user-idemp-1']);
      expect(active).toHaveLength(1);
      expect(active[0].token).toBe(token);
    });

    it('TC-HANDOVER-01: Reassigns device push token when different user logs into same device', async () => {
      const sharedToken = 'ExponentPushToken[shared-tablet]';
      const userA = await createSession('user-alice', 'player');
      const userB = await createSession('user-bob', 'player');

      // Alice logs in on shared tablet
      mockHeadersMap.set('authorization', `Bearer ${userA}`);
      const reqA = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sharedToken, platform: 'android' }),
      });
      const resA = await POST(reqA);
      expect(resA.status).toBe(200);

      let aliceTokens = await getActivePushTokens(['user-alice']);
      let bobTokens = await getActivePushTokens(['user-bob']);
      expect(aliceTokens).toHaveLength(1);
      expect(bobTokens).toHaveLength(0);

      // Bob logs in on same shared tablet
      mockHeadersMap.set('authorization', `Bearer ${userB}`);
      const reqB = new Request('http://localhost:3000/api/notifications/push-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sharedToken, platform: 'android' }),
      });
      const resB = await POST(reqB);
      expect(resB.status).toBe(200);

      aliceTokens = await getActivePushTokens(['user-alice']);
      bobTokens = await getActivePushTokens(['user-bob']);
      expect(aliceTokens).toHaveLength(0);
      expect(bobTokens).toHaveLength(1);
      expect(bobTokens[0].token).toBe(sharedToken);
    });

    it('TC-REACT-01: Re-registration reactivates previously disabled token', async () => {
      const user = await createSession('user-reactivate', 'player');
      mockHeadersMap.set('authorization', `Bearer ${user}`);

      const token = 'ExponentPushToken[reactivate-token]';

      // 1. Initial register
      await POST(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      );
      expect(await getActivePushTokens(['user-reactivate'])).toHaveLength(1);

      // 2. Deactivate via DELETE
      await DELETE(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      );
      expect(await getActivePushTokens(['user-reactivate'])).toHaveLength(0);

      // 3. Register again
      const reRegRes = await POST(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      );
      expect(reRegRes.status).toBe(200);
      const activeAfter = await getActivePushTokens(['user-reactivate']);
      expect(activeAfter).toHaveLength(1);
      expect(activeAfter[0].isEnabled).toBe(true);
    });
  });

  describe('Deactivation (DELETE)', () => {
    it('TC-DEL-01: Authenticated owner successfully deactivates token via body', async () => {
      const user = await createSession('user-del-owner', 'player');
      mockHeadersMap.set('authorization', `Bearer ${user}`);

      const token = 'ExponentPushToken[del-body-token]';
      await POST(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      );

      const delRes = await DELETE(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      );

      expect(delRes.status).toBe(200);
      const json = await delRes.json();
      expect(json.ok).toBe(true);
      expect(json.deactivated).toBe(true);

      const active = await getActivePushTokens(['user-del-owner']);
      expect(active).toHaveLength(0);
    });

    it('TC-DEL-02: Authenticated owner successfully deactivates token via query param', async () => {
      const user = await createSession('user-del-query', 'player');
      mockHeadersMap.set('authorization', `Bearer ${user}`);

      const token = 'ExponentPushToken[del-query-token]';
      await POST(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      );

      const delRes = await DELETE(
        new Request(
          `http://localhost:3000/api/notifications/push-token?token=${encodeURIComponent(token)}`,
          { method: 'DELETE' }
        )
      );

      expect(delRes.status).toBe(200);
      const json = await delRes.json();
      expect(json.ok).toBe(true);
      expect(json.deactivated).toBe(true);

      const active = await getActivePushTokens(['user-del-query']);
      expect(active).toHaveLength(0);
    });

    it('TC-DEL-03: Rejects unauthenticated DELETE with 401', async () => {
      const res = await DELETE(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: 'ExponentPushToken[any]' }),
        })
      );
      expect(res.status).toBe(401);
    });

    it('TC-DEL-04: Rejects DELETE with missing token with 400', async () => {
      const user = await createSession('user-del-missing', 'player');
      mockHeadersMap.set('authorization', `Bearer ${user}`);

      const res = await DELETE(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
      );
      expect(res.status).toBe(400);
    });

    it('TC-DEL-05: Cross-User Security: User B cannot deactivate User A token', async () => {
      const userA = await createSession('user-alice-del', 'player');
      const userB = await createSession('user-bob-attacker', 'player');

      const token = 'ExponentPushToken[alice-protected-token]';

      // Alice registers token
      mockHeadersMap.set('authorization', `Bearer ${userA}`);
      await POST(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'ios' }),
        })
      );

      // Bob attempts to deactivate Alice's token
      mockHeadersMap.set('authorization', `Bearer ${userB}`);
      const attackRes = await DELETE(
        new Request('http://localhost:3000/api/notifications/push-token', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      );

      expect(attackRes.status).toBe(200);
      const json = await attackRes.json();
      expect(json.deactivated).toBe(false);

      // Alice's token remains active
      const aliceTokens = await getActivePushTokens(['user-alice-del']);
      expect(aliceTokens).toHaveLength(1);
      expect(aliceTokens[0].token).toBe(token);
    });
  });

  describe('Route Alias Parity (/api/push-tokens)', () => {
    it('TC-ALIAS-01: /api/push-tokens registers and deactivates tokens identically', async () => {
      const user = await createSession('user-alias-parity', 'player');
      mockHeadersMap.set('authorization', `Bearer ${user}`);

      const token = 'ExponentPushToken[alias-route-token]';

      // POST via alias
      const postRes = await aliasPOST(
        new Request('http://localhost:3000/api/push-tokens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, platform: 'android' }),
        })
      );
      expect(postRes.status).toBe(200);
      expect((await postRes.json()).ok).toBe(true);

      expect(await getActivePushTokens(['user-alias-parity'])).toHaveLength(1);

      // DELETE via alias
      const delRes = await aliasDELETE(
        new Request('http://localhost:3000/api/push-tokens', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
      );
      expect(delRes.status).toBe(200);
      expect((await delRes.json()).deactivated).toBe(true);

      expect(await getActivePushTokens(['user-alias-parity'])).toHaveLength(0);
    });
  });
});
