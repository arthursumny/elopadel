import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AsyncLocalStorage } from 'node:async_hooks';
import { POST as primaryPOST, DELETE as primaryDELETE } from '@/app/api/notifications/push-token/route';
import { POST as aliasPOST, DELETE as aliasDELETE } from '@/app/api/push-tokens/route';
import {
  createSession,
  PLAYER_COOKIE_NAME,
  CLUB_COOKIE_NAME,
  ADMIN_COOKIE_NAME,
} from '@/lib/auth';
import {
  clearRuntimePushTokens,
  getActivePushTokens,
  runtimeDevicePushTokens,
  deleteDevicePushTokens,
} from '@/lib/notifications/tokens';

const defaultHeadersMap = new Map<string, string>();
const defaultCookiesMap = new Map<string, { value: string }>();

const headersStorage = new AsyncLocalStorage<Map<string, string>>();
const cookiesStorage = new AsyncLocalStorage<Map<string, { value: string }>>();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => {
    const store = headersStorage.getStore() ?? defaultHeadersMap;
    return {
      get: (name: string) => store.get(name.toLowerCase()) ?? null,
    };
  }),
  cookies: vi.fn(async () => {
    const store = cookiesStorage.getStore() ?? defaultCookiesMap;
    return {
      get: (name: string) => store.get(name) ?? undefined,
      set: vi.fn((name: string, value: string) => {
        store.set(name, { value });
      }),
    };
  }),
}));

describe('Empirical Challenger Tier: Milestone 2 Push Token Security & Stress Suite', () => {
  beforeEach(() => {
    defaultHeadersMap.clear();
    defaultCookiesMap.clear();
    clearRuntimePushTokens();
    vi.restoreAllMocks();
  });

  // Helper to run code within an isolated request context
  function runWithAuth<T>(
    auth: { bearer?: string; cookie?: string },
    fn: () => Promise<T>
  ): Promise<T> {
    const headersMap = new Map<string, string>();
    const cookiesMap = new Map<string, { value: string }>();

    if (auth.bearer) {
      headersMap.set('authorization', `Bearer ${auth.bearer}`);
    }
    if (auth.cookie) {
      cookiesMap.set(PLAYER_COOKIE_NAME, { value: auth.cookie });
    }

    return headersStorage.run(headersMap, () => {
      return cookiesStorage.run(cookiesMap, fn);
    });
  }

  function makePostReq(url: string, body: unknown) {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  function makeDeleteReq(url: string, body?: unknown) {
    const init: RequestInit = {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    };
    if (body !== undefined) {
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    return new Request(url, init);
  }

  /* -------------------------------------------------------------------------
   * Group 1: Concurrency & Multi-Device Registration Stress
   * ------------------------------------------------------------------------- */
  describe('Group 1: Concurrency & Multi-Device Registration Stress', () => {
    it('EMP-CONC-01: Concurrently registers 30 distinct devices for the same user without data loss', async () => {
      const userToken = await createSession('player-multi-device-1', 'player');

      const platforms = ['ios', 'android', 'web'] as const;
      const deviceCount = 30;

      const requests = Array.from({ length: deviceCount }, (_, i) => {
        const platform = platforms[i % platforms.length];
        return runWithAuth({ bearer: userToken }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: `ExponentPushToken[device-${i}-${Math.random().toString(36).slice(2, 7)}]`,
              platform,
              deviceType: `TestDevice_${i}`,
              appVersion: `1.0.${i}`,
            })
          )
        );
      });

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.registeredAt).toBeDefined();
      }

      const active = await getActivePushTokens(['player-multi-device-1']);
      expect(active).toHaveLength(deviceCount);

      const activeTokensSet = new Set(active.map((r) => r.token));
      expect(activeTokensSet.size).toBe(deviceCount);
      for (const record of active) {
        expect(record.userId).toBe('player-multi-device-1');
        expect(record.isEnabled).toBe(true);
      }
    });

    it('EMP-CONC-02: Stampede race: 20 concurrent registrations of the exact same token for one user produces exactly 1 record', async () => {
      const userToken = await createSession('player-stampede-1', 'player');
      const singleToken = 'ExponentPushToken[shared-stampede-token]';

      const requests = Array.from({ length: 20 }, (_, i) =>
        runWithAuth({ bearer: userToken }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: singleToken,
              platform: 'android',
              deviceType: `DeviceIteration_${i}`,
              appVersion: '2.0.0',
            })
          )
        )
      );

      const responses = await Promise.all(requests);
      for (const res of responses) {
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.ok).toBe(true);
        expect(json.token).toBe(singleToken);
      }

      const active = await getActivePushTokens(['player-stampede-1']);
      expect(active).toHaveLength(1);
      expect(active[0].token).toBe(singleToken);
      expect(active[0].isEnabled).toBe(true);
    });

    it('EMP-CONC-03: Multi-tenant mass registration: 10 distinct users simultaneously register 5 devices each', async () => {
      const userIds = Array.from({ length: 10 }, (_, u) => `player-tenant-${u}`);
      const sessions = await Promise.all(userIds.map((id) => createSession(id, 'player')));

      const tasks: Promise<Response>[] = [];

      for (let u = 0; u < 10; u++) {
        for (let d = 0; d < 5; d++) {
          const userJwt = sessions[u];
          const tokenStr = `ExponentPushToken[user-${u}-device-${d}]`;
          tasks.push(
            runWithAuth({ bearer: userJwt }, () =>
              primaryPOST(
                makePostReq('http://localhost:3000/api/notifications/push-token', {
                  token: tokenStr,
                  platform: d % 2 === 0 ? 'ios' : 'android',
                  deviceType: `Phone_${u}_${d}`,
                })
              )
            )
          );
        }
      }

      const results = await Promise.all(tasks);
      for (const res of results) {
        expect(res.status).toBe(200);
      }

      for (const userId of userIds) {
        const tokens = await getActivePushTokens([userId]);
        expect(tokens).toHaveLength(5);
        for (const t of tokens) {
          expect(t.userId).toBe(userId);
          expect(t.isEnabled).toBe(true);
        }
      }
    });
  });

  /* -------------------------------------------------------------------------
   * Group 2: Rapid Handover & Ownership Race Conditions
   * ------------------------------------------------------------------------- */
  describe('Group 2: Rapid Handover & Ownership Race Conditions', () => {
    it('EMP-RACE-01: Concurrent ownership clash between User A and User B guarantees mutual exclusivity', async () => {
      const userA = await createSession('alice-contender', 'player');
      const userB = await createSession('bob-contender', 'player');

      const contestedToken = 'ExponentPushToken[single-physical-ipad]';

      // Simulate simultaneous registration requests from both contenders with isolated context
      const reqA = runWithAuth({ bearer: userA }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: contestedToken,
            platform: 'ios',
            deviceType: 'iPad Mini (Alice)',
          })
        )
      );

      const reqB = runWithAuth({ bearer: userB }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: contestedToken,
            platform: 'ios',
            deviceType: 'iPad Mini (Bob)',
          })
        )
      );

      const [resA, resB] = await Promise.all([reqA, reqB]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Verify mutual exclusivity: token must belong to EXACTLY one user
      const aliceTokens = await getActivePushTokens(['alice-contender']);
      const bobTokens = await getActivePushTokens(['bob-contender']);

      const totalOwned = aliceTokens.length + bobTokens.length;
      expect(totalOwned).toBe(1);

      if (aliceTokens.length === 1) {
        expect(aliceTokens[0].token).toBe(contestedToken);
        expect(bobTokens).toHaveLength(0);
      } else {
        expect(bobTokens[0].token).toBe(contestedToken);
        expect(aliceTokens).toHaveLength(0);
      }
    });

    it('EMP-RACE-02: Rapid 10-round ping-pong handover updates ownership cleanly with zero ghost state', async () => {
      const userAlice = await createSession('alice-ping-pong', 'player');
      const userBob = await createSession('bob-ping-pong', 'player');
      const sharedToken = 'ExponentPushToken[shared-ping-pong-phone]';

      for (let round = 1; round <= 10; round++) {
        // Alice takes device
        const resAlice = await runWithAuth({ bearer: userAlice }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: sharedToken,
              platform: 'android',
              deviceType: `AlicePhone-R${round}`,
            })
          )
        );
        expect(resAlice.status).toBe(200);

        let aliceTokens = await getActivePushTokens(['alice-ping-pong']);
        let bobTokens = await getActivePushTokens(['bob-ping-pong']);
        expect(aliceTokens).toHaveLength(1);
        expect(bobTokens).toHaveLength(0);
        expect(aliceTokens[0].token).toBe(sharedToken);

        // Bob takes device
        const resBob = await runWithAuth({ bearer: userBob }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: sharedToken,
              platform: 'android',
              deviceType: `BobPhone-R${round}`,
            })
          )
        );
        expect(resBob.status).toBe(200);

        aliceTokens = await getActivePushTokens(['alice-ping-pong']);
        bobTokens = await getActivePushTokens(['bob-ping-pong']);
        expect(aliceTokens).toHaveLength(0);
        expect(bobTokens).toHaveLength(1);
        expect(bobTokens[0].token).toBe(sharedToken);
      }
    });

    it('EMP-RACE-03: Handover of a disabled token reactivates device for the new user', async () => {
      const userAlice = await createSession('alice-deactivator', 'player');
      const userBob = await createSession('bob-inheritor', 'player');
      const token = 'ExponentPushToken[dormant-handed-over-device]';

      // 1. Alice registers
      await runWithAuth({ bearer: userAlice }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token,
            platform: 'ios',
          })
        )
      );
      expect(await getActivePushTokens(['alice-deactivator'])).toHaveLength(1);

      // 2. Alice deactivates
      const delRes = await runWithAuth({ bearer: userAlice }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', { token })
        )
      );
      expect((await delRes.json()).deactivated).toBe(true);
      expect(await getActivePushTokens(['alice-deactivator'])).toHaveLength(0);

      // 3. Bob acquires device and registers
      const regBob = await runWithAuth({ bearer: userBob }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token,
            platform: 'ios',
          })
        )
      );
      expect(regBob.status).toBe(200);

      const bobActive = await getActivePushTokens(['bob-inheritor']);
      expect(bobActive).toHaveLength(1);
      expect(bobActive[0].token).toBe(token);
      expect(bobActive[0].isEnabled).toBe(true);

      const aliceActive = await getActivePushTokens(['alice-deactivator']);
      expect(aliceActive).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------------------
   * Group 3: Cross-User Deactivation & Security Tampering Attacks
   * ------------------------------------------------------------------------- */
  describe('Group 3: Cross-User Deactivation & Tampering Attacks', () => {
    it('EMP-SEC-01: Attacker cannot deactivate victim token via JSON body', async () => {
      const victim = await createSession('victim-alice', 'player');
      const attacker = await createSession('attacker-mallory', 'player');

      const victimToken = 'ExponentPushToken[alice-secret-device]';

      // Alice registers
      await runWithAuth({ bearer: victim }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: victimToken,
            platform: 'ios',
          })
        )
      );

      // Mallory attempts DELETE with Alice's token in body
      const delRes = await runWithAuth({ bearer: attacker }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', {
            token: victimToken,
          })
        )
      );

      expect(delRes.status).toBe(200);
      const json = await delRes.json();
      expect(json.ok).toBe(true);
      expect(json.deactivated).toBe(false);
      expect(json.unregistered).toBe(false);

      // Alice's token remains completely active
      const aliceTokens = await getActivePushTokens(['victim-alice']);
      expect(aliceTokens).toHaveLength(1);
      expect(aliceTokens[0].token).toBe(victimToken);
      expect(aliceTokens[0].isEnabled).toBe(true);
    });

    it('EMP-SEC-02: Attacker cannot deactivate victim token via URL query parameter', async () => {
      const victim = await createSession('victim-carol', 'player');
      const attacker = await createSession('attacker-oscar', 'player');

      const victimToken = 'ExponentPushToken[carol-query-device]';

      // Carol registers
      await runWithAuth({ bearer: victim }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: victimToken,
            platform: 'android',
          })
        )
      );

      // Oscar attempts DELETE with query param
      const delRes = await runWithAuth({ bearer: attacker }, () =>
        primaryDELETE(
          makeDeleteReq(
            `http://localhost:3000/api/notifications/push-token?token=${encodeURIComponent(victimToken)}`
          )
        )
      );

      expect(delRes.status).toBe(200);
      const json = await delRes.json();
      expect(json.deactivated).toBe(false);

      // Carol's token remains active
      const carolTokens = await getActivePushTokens(['victim-carol']);
      expect(carolTokens).toHaveLength(1);
      expect(carolTokens[0].isEnabled).toBe(true);
    });

    it('EMP-SEC-03: Owner deactivation leaves token disabled and prevents redundant exposure', async () => {
      const user = await createSession('user-double-del', 'player');

      const token = 'ExponentPushToken[double-del-token]';
      await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token,
            platform: 'ios',
          })
        )
      );

      // First DELETE: succeeds
      const res1 = await runWithAuth({ bearer: user }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', { token })
        )
      );
      expect((await res1.json()).ok).toBe(true);

      const activeAfter1 = await getActivePushTokens(['user-double-del']);
      expect(activeAfter1).toHaveLength(0);

      // Second DELETE: token already disabled, remains inactive
      const res2 = await runWithAuth({ bearer: user }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', { token })
        )
      );
      expect(res2.status).toBe(200);
      expect((await res2.json()).ok).toBe(true);

      const activeAfter2 = await getActivePushTokens(['user-double-del']);
      expect(activeAfter2).toHaveLength(0);
    });

    it('EMP-SEC-04: Non-player roles (club, admin) cannot register or deactivate player push tokens', async () => {
      const clubJwt = await createSession('club-santorini-1', 'club');
      const adminJwt = await createSession('admin', 'admin');

      // Club attempt POST
      const clubPost = await runWithAuth({ bearer: clubJwt }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: 'ExponentPushToken[club-attempt]',
            platform: 'ios',
          })
        )
      );
      expect(clubPost.status).toBe(401);

      // Admin attempt POST
      const adminPost = await runWithAuth({ bearer: adminJwt }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: 'ExponentPushToken[admin-attempt]',
            platform: 'ios',
          })
        )
      );
      expect(adminPost.status).toBe(401);

      // Club attempt DELETE
      const clubDel = await runWithAuth({ bearer: clubJwt }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', {
            token: 'ExponentPushToken[any]',
          })
        )
      );
      expect(clubDel.status).toBe(401);

      // Admin attempt DELETE
      const adminDel = await runWithAuth({ bearer: adminJwt }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', {
            token: 'ExponentPushToken[any]',
          })
        )
      );
      expect(adminDel.status).toBe(401);
    });
  });

  /* -------------------------------------------------------------------------
   * Group 4: Boundary Inputs & Malicious Payloads
   * ------------------------------------------------------------------------- */
  describe('Group 4: Boundary Inputs & Malicious Payloads', () => {
    it('EMP-BND-01: Rejects empty, whitespace, null, and non-string token inputs with 400', async () => {
      const user = await createSession('boundary-user-1', 'player');

      const invalidTokens = [
        '',
        '   ',
        '\t\n\r  ',
        null,
        undefined,
        12345,
        true,
        false,
        {},
        [],
      ];

      for (const inv of invalidTokens) {
        const res = await runWithAuth({ bearer: user }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: inv,
              platform: 'ios',
            })
          )
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain('Token de push é obrigatório');
      }
    });

    it('EMP-BND-02: Enforces token length boundary (exactly 500 chars accepted, 501 chars rejected)', async () => {
      const user = await createSession('boundary-len-user', 'player');

      const token500 = 'T'.repeat(500);
      const token501 = 'T'.repeat(501);

      // 500 chars: valid boundary
      const res500 = await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: token500,
            platform: 'ios',
          })
        )
      );
      expect(res500.status).toBe(200);
      const json500 = await res500.json();
      expect(json500.token).toBe(token500);

      // 501 chars: rejected
      const res501 = await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: token501,
            platform: 'ios',
          })
        )
      );
      expect(res501.status).toBe(400);
      expect((await res501.json()).error).toContain('Token de push é obrigatório');
    });

    it('EMP-BND-03: SQL injection and control character payloads are safely handled as literal strings', async () => {
      const user = await createSession('sqli-test-user', 'player');

      const attackPayloads = [
        "'; DROP TABLE device_push_tokens; --",
        "' OR '1'='1",
        '<script>alert("xss")</script>',
        '${7*7}',
        'ExponentPushToken[\0\r\n\t_ctrl_chars]',
      ];

      for (const payload of attackPayloads) {
        const res = await runWithAuth({ bearer: user }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: payload,
              platform: 'android',
            })
          )
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.token).toBe(payload.trim());

        const active = await getActivePushTokens(['sqli-test-user']);
        expect(active.some((r) => r.token === payload.trim())).toBe(true);

        // Safe deactivation
        const delRes = await runWithAuth({ bearer: user }, () =>
          primaryDELETE(
            makeDeleteReq('http://localhost:3000/api/notifications/push-token', {
              token: payload,
            })
          )
        );
        expect(delRes.status).toBe(200);
      }
    });

    it('EMP-BND-04: Platform enum accepts case-insensitive valid values and rejects invalid platforms with 400', async () => {
      const user = await createSession('platform-user', 'player');

      // Valid case variants
      const validCases = [
        { raw: 'ios', expected: 'ios' },
        { raw: 'IOS', expected: 'ios' },
        { raw: '  iOS  ', expected: 'ios' },
        { raw: 'android', expected: 'android' },
        { raw: 'ANDROID', expected: 'android' },
        { raw: 'web', expected: 'web' },
        { raw: 'WEB', expected: 'web' },
      ];

      for (const item of validCases) {
        const res = await runWithAuth({ bearer: user }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: `ExponentPushToken[platform-${item.raw.trim().toLowerCase()}]`,
              platform: item.raw,
            })
          )
        );
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.platform).toBe(item.expected);
      }

      // Invalid platforms
      const invalidPlatforms = [
        'windows',
        'macos',
        'linux',
        'playstation',
        'symbian',
        'unknown',
        '',
        '   ',
        123,
        null,
      ];

      for (const inv of invalidPlatforms) {
        const res = await runWithAuth({ bearer: user }, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: 'ExponentPushToken[some-token]',
              platform: inv,
            })
          )
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain('Plataforma inválida');
      }
    });

    it('EMP-BND-05: Metadata truncation: deviceType > 100 chars and appVersion > 50 chars truncate cleanly without error', async () => {
      const user = await createSession('trunc-user', 'player');

      const longDeviceType = 'D'.repeat(150);
      const longAppVersion = 'V'.repeat(80);

      const res = await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: 'ExponentPushToken[metadata-truncation]',
            platform: 'ios',
            deviceType: longDeviceType,
            appVersion: longAppVersion,
          })
        )
      );

      expect(res.status).toBe(200);
      const active = await getActivePushTokens(['trunc-user']);
      expect(active).toHaveLength(1);
      expect(active[0].deviceType).toBe('D'.repeat(100));
      expect(active[0].appVersion).toBe('V'.repeat(50));
    });

    it('EMP-BND-06: Malformed request bodies return clean 400 bad request', async () => {
      const user = await createSession('malformed-body-user', 'player');

      const brokenBodies = [
        '{ "unclosed": json',
        'null',
        '"just a string"',
        '12345',
        '[]',
      ];

      for (const b of brokenBodies) {
        const res = await runWithAuth({ bearer: user }, () =>
          primaryPOST(
            new Request('http://localhost:3000/api/notifications/push-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: b,
            })
          )
        );
        expect(res.status).toBe(400);
      }
    });
  });

  /* -------------------------------------------------------------------------
   * Group 5: Authentication Precedence & Dual-Mode Matrix
   * ------------------------------------------------------------------------- */
  describe('Group 5: Authentication Precedence & Dual-Mode Matrix', () => {
    it('EMP-AUTH-01: Rejects requests with missing or empty authorization header and missing cookie', async () => {
      const resPost = await primaryPOST(
        makePostReq('http://localhost:3000/api/notifications/push-token', {
          token: 'ExponentPushToken[no-auth]',
          platform: 'ios',
        })
      );
      expect(resPost.status).toBe(401);

      const resDel = await primaryDELETE(
        makeDeleteReq('http://localhost:3000/api/notifications/push-token', {
          token: 'ExponentPushToken[no-auth]',
        })
      );
      expect(resDel.status).toBe(401);
    });

    it('EMP-AUTH-02: Rejects malformed Bearer formats (no token, Basic auth, whitespace only)', async () => {
      const malformedHeaders = [
        'Bearer',
        'Bearer ',
        'Bearer    ',
        'Basic dXNlcjpwYXNz',
        'Token some-token',
        'Bearer invalid.jwt.format',
      ];

      for (const h of malformedHeaders) {
        const res = await runWithAuth({}, () => {
          defaultHeadersMap.set('authorization', h);
          return primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: 'ExponentPushToken[malformed-auth]',
              platform: 'ios',
            })
          );
        });
        expect(res.status).toBe(401);
      }
    });

    it('EMP-AUTH-03: Valid cookie authenticates web client when Bearer header is absent', async () => {
      const userCookie = await createSession('web-cookie-player', 'player');

      const res = await runWithAuth({ cookie: userCookie }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: 'ExponentPushToken[web-cookie-token]',
            platform: 'web',
          })
        )
      );
      expect(res.status).toBe(200);

      const active = await getActivePushTokens(['web-cookie-player']);
      expect(active).toHaveLength(1);
      expect(active[0].token).toBe('ExponentPushToken[web-cookie-token]');
    });

    it('EMP-AUTH-04: Strict Precedence: Bearer header always overrides web cookie', async () => {
      const bearerUser = await createSession('precedence-bearer-user', 'player');
      const cookieUser = await createSession('precedence-cookie-user', 'player');

      const token = 'ExponentPushToken[precedence-device]';
      const res = await runWithAuth({ bearer: bearerUser, cookie: cookieUser }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token,
            platform: 'ios',
          })
        )
      );
      expect(res.status).toBe(200);

      const bearerActive = await getActivePushTokens(['precedence-bearer-user']);
      const cookieActive = await getActivePushTokens(['precedence-cookie-user']);
      expect(bearerActive).toHaveLength(1);
      expect(cookieActive).toHaveLength(0);
    });

    it('EMP-AUTH-05: Security Isolation: Invalid Bearer token does NOT downgrade or fall back to cookie', async () => {
      const cookieUser = await createSession('fallback-cookie-user', 'player');

      const headersMap = new Map<string, string>();
      headersMap.set('authorization', 'Bearer corrupt.expired.token');
      const cookiesMap = new Map<string, { value: string }>();
      cookiesMap.set(PLAYER_COOKIE_NAME, { value: cookieUser });

      const res = await headersStorage.run(headersMap, () =>
        cookiesStorage.run(cookiesMap, () =>
          primaryPOST(
            makePostReq('http://localhost:3000/api/notifications/push-token', {
              token: 'ExponentPushToken[isolated-test]',
              platform: 'ios',
            })
          )
        )
      );
      expect(res.status).toBe(401);

      const cookieActive = await getActivePushTokens(['fallback-cookie-user']);
      expect(cookieActive).toHaveLength(0);
    });
  });

  /* -------------------------------------------------------------------------
   * Group 6: Endpoint Alias Parity & Cross-Route Interoperability
   * ------------------------------------------------------------------------- */
  describe('Group 6: Endpoint Alias Parity (/api/push-tokens vs /api/notifications/push-token)', () => {
    it('EMP-PARITY-01: Full cross-route lifecycle: POST on alias, DELETE on primary', async () => {
      const user = await createSession('cross-route-user-1', 'player');
      const token = 'ExponentPushToken[alias-to-primary-token]';

      // 1. POST via /api/push-tokens
      const postRes = await runWithAuth({ bearer: user }, () =>
        aliasPOST(
          makePostReq('http://localhost:3000/api/push-tokens', {
            token,
            platform: 'ios',
            deviceType: 'iPhone 16 Pro',
            appVersion: '2.0.0',
          })
        )
      );
      expect(postRes.status).toBe(200);
      const postJson = await postRes.json();
      expect(postJson.ok).toBe(true);
      expect(postJson.token).toBe(token);

      expect(await getActivePushTokens(['cross-route-user-1'])).toHaveLength(1);

      // 2. DELETE via /api/notifications/push-token
      const delRes = await runWithAuth({ bearer: user }, () =>
        primaryDELETE(
          makeDeleteReq('http://localhost:3000/api/notifications/push-token', { token })
        )
      );
      expect(delRes.status).toBe(200);
      const delJson = await delRes.json();
      expect(delJson.deactivated).toBe(true);

      expect(await getActivePushTokens(['cross-route-user-1'])).toHaveLength(0);
    });

    it('EMP-PARITY-02: Full cross-route lifecycle: POST on primary, DELETE on alias', async () => {
      const user = await createSession('cross-route-user-2', 'player');
      const token = 'ExponentPushToken[primary-to-alias-token]';

      // 1. POST via /api/notifications/push-token
      const postRes = await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token,
            platform: 'android',
          })
        )
      );
      expect(postRes.status).toBe(200);

      // 2. DELETE via /api/push-tokens?token=...
      const delRes = await runWithAuth({ bearer: user }, () =>
        aliasDELETE(
          makeDeleteReq(`http://localhost:3000/api/push-tokens?token=${encodeURIComponent(token)}`)
        )
      );
      expect(delRes.status).toBe(200);
      expect((await delRes.json()).deactivated).toBe(true);

      expect(await getActivePushTokens(['cross-route-user-2'])).toHaveLength(0);
    });

    it('EMP-PARITY-03: Alias rejects unauthenticated requests identically to primary', async () => {
      const postRes = await aliasPOST(
        makePostReq('http://localhost:3000/api/push-tokens', {
          token: 'ExponentPushToken[unauth-alias]',
          platform: 'ios',
        })
      );
      expect(postRes.status).toBe(401);

      const delRes = await aliasDELETE(
        makeDeleteReq('http://localhost:3000/api/push-tokens', {
          token: 'ExponentPushToken[unauth-alias]',
        })
      );
      expect(delRes.status).toBe(401);
    });

    it('EMP-PARITY-04: Alias handles invalid bodies identically to primary', async () => {
      const user = await createSession('alias-val-user', 'player');

      const postRes = await runWithAuth({ bearer: user }, () =>
        aliasPOST(
          makePostReq('http://localhost:3000/api/push-tokens', {
            platform: 'ios',
          })
        )
      );
      expect(postRes.status).toBe(400);

      const delRes = await runWithAuth({ bearer: user }, () =>
        aliasDELETE(makeDeleteReq('http://localhost:3000/api/push-tokens', {}))
      );
      expect(delRes.status).toBe(400);
    });
  });

  /* -------------------------------------------------------------------------
   * Group 7: Token Varieties & Dead Token Cleanup Integration
   * ------------------------------------------------------------------------- */
  describe('Group 7: Diverse Token Formats & Token Repository Operations', () => {
    it('EMP-TOK-01: Accepts APNs 64-character hex tokens and FCM long tokens', async () => {
      const user = await createSession('diverse-tokens-user', 'player');

      const apnsHexToken = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
      const fcmToken = 'bk3RNwTe3H0:CI2k_HHwgUQFeRoQI5Ptu0_137_f3130d044baa45ca2414777d70cf8842';

      const resApns = await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: apnsHexToken,
            platform: 'ios',
          })
        )
      );
      expect(resApns.status).toBe(200);

      const resFcm = await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: fcmToken,
            platform: 'android',
          })
        )
      );
      expect(resFcm.status).toBe(200);

      const active = await getActivePushTokens(['diverse-tokens-user']);
      expect(active).toHaveLength(2);
      expect(active.map((r) => r.token)).toContain(apnsHexToken);
      expect(active.map((r) => r.token)).toContain(fcmToken);
    });

    it('EMP-TOK-02: deleteDevicePushTokens / reapDeadPushTokens permanently purges dead tokens from registry', async () => {
      const user = await createSession('purge-test-user', 'player');

      const token1 = 'ExponentPushToken[dead-token-1]';
      const token2 = 'ExponentPushToken[alive-token-2]';

      await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: token1,
            platform: 'ios',
          })
        )
      );
      await runWithAuth({ bearer: user }, () =>
        primaryPOST(
          makePostReq('http://localhost:3000/api/notifications/push-token', {
            token: token2,
            platform: 'android',
          })
        )
      );

      expect(await getActivePushTokens(['purge-test-user'])).toHaveLength(2);

      // Reap token1
      const deletedCount = await deleteDevicePushTokens([token1]);
      expect(deletedCount).toBe(1);

      const activeAfter = await getActivePushTokens(['purge-test-user']);
      expect(activeAfter).toHaveLength(1);
      expect(activeAfter[0].token).toBe(token2);
    });
  });
});
