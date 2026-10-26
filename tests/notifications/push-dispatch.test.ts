import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  dispatchPushNotifications,
  formatPushPayload,
  resolveAndroidChannel,
  resolveDeepLink,
  isExpoPushToken,
  chunkArray,
  sendExpoPushMessages,
  reapDeadTokens,
  EXPO_PUSH_URL,
  type ExpoPushMessage,
} from '@/lib/notifications/push';
import {
  clearRuntimePushTokens,
  getActivePushTokens,
  upsertDevicePushToken,
  deactivateDevicePushToken,
} from '@/lib/notifications/tokens';
import { notifyUsers } from '@/lib/db/notifications';

describe('Push Notifications Dispatch Pipeline', () => {
  beforeEach(() => {
    clearRuntimePushTokens();
    vi.restoreAllMocks();
    delete process.env.DISABLE_PUSH_NOTIFICATIONS;
  });

  afterEach(() => {
    delete process.env.DISABLE_PUSH_NOTIFICATIONS;
  });

  describe('1. Channel and Deep Link Mapping', () => {
    it('TC-CHAN-01: Maps match-critical events to match-events channel', () => {
      const matchEvents = [
        'match-formed',
        'match-confirmed',
        'match-cancelled',
        'match-ready-to-play',
        'attendance-update',
        'result-window-open',
        'result-submitted',
        'result-vote',
        'result-disputed',
        'match-validated',
      ];

      for (const event of matchEvents) {
        expect(resolveAndroidChannel(event)).toBe('match-events');
      }
    });

    it('TC-CHAN-02: Maps social and partner invites to invitations channel', () => {
      const invitationEvents = [
        'friend-request',
        'friend-request-response',
        'match-search-invitation',
        'match-search-invitation-response',
        'match-search-started',
        'room-invitation',
        'room-invitation-response',
        'room-joined',
        'direct-challenge',
        'direct-challenge-response',
        'direct-challenge-suggestion',
        'direct-challenge-accepted',
      ];

      for (const event of invitationEvents) {
        expect(resolveAndroidChannel(event)).toBe('invitations');
      }
    });

    it('TC-CHAN-03: Maps reminders and maintenance to reminders channel', () => {
      const reminderEvents = [
        'match-reminder',
        'room-expired',
        'search-expired',
        'direct-challenge-expired',
        'inactivity-penalty',
        'profile-inactive',
        'club-membership',
        'unknown-event-type',
      ];

      for (const event of reminderEvents) {
        expect(resolveAndroidChannel(event)).toBe('reminders');
      }
    });

    it('TC-LINK-01: Resolves deep links correctly preserving explicit href or default fallbacks', () => {
      expect(resolveDeepLink('match-formed', '/match/uuid-123')).toBe('/match/uuid-123');
      expect(resolveDeepLink('match-formed', null)).toBe('/matchmaking');
      expect(resolveDeepLink('friend-request', null)).toBe('/friends');
      expect(resolveDeepLink('match-reminder', null)).toBe('/notifications');
    });
  });

  describe('2. Expo Push Token Validation', () => {
    it('TC-TOKEN-VAL-01: Validates official Expo Push token formats', () => {
      expect(isExpoPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
      expect(isExpoPushToken('ExpoPushToken[1234567890abcdef]')).toBe(true);
      expect(isExpoPushToken('ExponentPushToken[ios-token-alpha-1]')).toBe(true);
      expect(isExpoPushToken('ExponentPushToken[android_token+1]')).toBe(true);
    });

    it('TC-TOKEN-VAL-02: Rejects invalid tokens', () => {
      expect(isExpoPushToken('')).toBe(false);
      expect(isExpoPushToken('   ')).toBe(false);
      expect(isExpoPushToken('raw-apns-device-token')).toBe(false);
      expect(isExpoPushToken('fcm:token:without:brackets')).toBe(false);
      expect(isExpoPushToken(null)).toBe(false);
      expect(isExpoPushToken(undefined)).toBe(false);
      expect(isExpoPushToken(12345)).toBe(false);
    });
  });

  describe('3. Payload Formatting', () => {
    it('TC-FORMAT-01: Formats Expo push message correctly with required fields', () => {
      const payload = formatPushPayload('ExponentPushToken[test-123]', {
        type: 'match-formed',
        title: 'Partida encontrada!',
        body: 'Confirme sua presença na quadra.',
        href: '/match/room-456',
        dedupeKey: 'match-456',
      });

      expect(payload).toEqual({
        to: 'ExponentPushToken[test-123]',
        title: 'Partida encontrada!',
        body: 'Confirme sua presença na quadra.',
        sound: 'default',
        badge: 1,
        channelId: 'match-events',
        priority: 'high',
        data: {
          url: '/match/room-456',
          deepLink: '/match/room-456',
          eventType: 'match-formed',
          type: 'match-formed',
          href: '/match/room-456',
          dedupeKey: 'match-456',
        },
      });
    });
  });

  describe('4. Array Chunking (Batch size <= 100)', () => {
    it('TC-CHUNK-01: Correctly chunks arrays into batches of up to 100', () => {
      expect(chunkArray([])).toEqual([]);

      const items50 = Array.from({ length: 50 }, (_, i) => `item-${i}`);
      const chunks50 = chunkArray(items50, 100);
      expect(chunks50).toHaveLength(1);
      expect(chunks50[0]).toHaveLength(50);

      const items100 = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const chunks100 = chunkArray(items100, 100);
      expect(chunks100).toHaveLength(1);
      expect(chunks100[0]).toHaveLength(100);

      const items250 = Array.from({ length: 250 }, (_, i) => `item-${i}`);
      const chunks250 = chunkArray(items250, 100);
      expect(chunks250).toHaveLength(3);
      expect(chunks250[0]).toHaveLength(100);
      expect(chunks250[1]).toHaveLength(100);
      expect(chunks250[2]).toHaveLength(50);
    });
  });

  describe('5. Push Dispatch Execution', () => {
    it('TC-DISP-01: Skips fetch call when target users have no active tokens', async () => {
      const mockFetch = vi.fn();

      const result = await dispatchPushNotifications(
        ['user-without-tokens'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.totalTokens).toBe(0);
      expect(result.sentCount).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('TC-DISP-02: Skips tokens for users when tokens are disabled', async () => {
      await upsertDevicePushToken({
        userId: 'user-disabled',
        token: 'ExponentPushToken[disabled-token]',
        platform: 'ios',
      });
      await deactivateDevicePushToken('user-disabled', 'ExponentPushToken[disabled-token]');

      const mockFetch = vi.fn();

      const result = await dispatchPushNotifications(
        ['user-disabled'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.totalTokens).toBe(0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('TC-DISP-03: Successfully sends message to active token via Expo Push API', async () => {
      await upsertDevicePushToken({
        userId: 'user-active-1',
        token: 'ExponentPushToken[active-token-1]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'ok', id: 'ticket-uuid-1' }],
        }),
      });

      const result = await dispatchPushNotifications(
        ['user-active-1'],
        {
          type: 'match-formed',
          title: 'Partida Formada',
          body: 'Acesse o saguão',
          href: '/match/123',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(1);
      expect(result.sentCount).toBe(1);
      expect(result.failedCount).toBe(0);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(EXPO_PUSH_URL);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(options.body);
      expect(body).toHaveLength(1);
      expect(body[0].to).toBe('ExponentPushToken[active-token-1]');
      expect(body[0].channelId).toBe('match-events');
      expect(body[0].data.url).toBe('/match/123');
    });

    it('TC-DISP-04: Dispatches to multiple devices for same user and across users', async () => {
      await upsertDevicePushToken({
        userId: 'user-multi-1',
        token: 'ExponentPushToken[multi-ios]',
        platform: 'ios',
      });
      await upsertDevicePushToken({
        userId: 'user-multi-1',
        token: 'ExponentPushToken[multi-android]',
        platform: 'android',
      });
      await upsertDevicePushToken({
        userId: 'user-multi-2',
        token: 'ExponentPushToken[user2-phone]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: 'ok', id: 't-1' },
            { status: 'ok', id: 't-2' },
            { status: 'ok', id: 't-3' },
          ],
        }),
      });

      const result = await dispatchPushNotifications(
        ['user-multi-1', 'user-multi-2'],
        {
          type: 'friend-request',
          title: 'Nova solicitação de amizade',
          body: 'Jogador quer adicionar você.',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.totalTokens).toBe(3);
      expect(result.sentCount).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('TC-DISP-05: Chunks push notifications when token count > 100', async () => {
      // Register 105 tokens across users
      for (let i = 0; i < 105; i++) {
        await upsertDevicePushToken({
          userId: `bulk-user-${i}`,
          token: `ExponentPushToken[bulk-token-${i}]`,
          platform: 'ios',
        });
      }

      const mockFetch = vi.fn().mockImplementation(async (_url, options) => {
        const chunk = JSON.parse(options.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: chunk.map((_: any, idx: number) => ({ status: 'ok', id: `t-${idx}` })),
          }),
        };
      });

      const userIds = Array.from({ length: 105 }, (_, i) => `bulk-user-${i}`);
      const result = await dispatchPushNotifications(
        userIds,
        {
          type: 'match-reminder',
          title: 'Lembrete de Partida',
          body: 'Sua partida começará em 2h.',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.totalTokens).toBe(105);
      expect(result.sentCount).toBe(105);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // First batch: 100 items, second batch: 5 items
      const firstBatch = JSON.parse(mockFetch.mock.calls[0][1].body);
      const secondBatch = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(firstBatch).toHaveLength(100);
      expect(secondBatch).toHaveLength(5);
    });

    it('TC-DISP-06: DISABLE_PUSH_NOTIFICATIONS=true suppresses all dispatches', async () => {
      process.env.DISABLE_PUSH_NOTIFICATIONS = 'true';

      await upsertDevicePushToken({
        userId: 'user-suppressed',
        token: 'ExponentPushToken[suppressed-token]',
        platform: 'ios',
      });

      const mockFetch = vi.fn();
      const result = await dispatchPushNotifications(
        ['user-suppressed'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.totalTokens).toBe(0);
    });
  });

  describe('6. Ticket Processing & Dead Token Reaping', () => {
    it('TC-REAP-01: Automatically reaps tokens when ticket error is DeviceNotRegistered', async () => {
      const deadToken = 'ExponentPushToken[dead-unregistered-device]';
      await upsertDevicePushToken({
        userId: 'user-uninstalled-app',
        token: deadToken,
        platform: 'ios',
      });

      expect(await getActivePushTokens(['user-uninstalled-app'])).toHaveLength(1);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              status: 'error',
              message: 'The device cannot receive push notifications',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
      });

      const result = await dispatchPushNotifications(
        ['user-uninstalled-app'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.failedCount).toBe(1);
      expect(result.reapedTokens).toContain(deadToken);

      // Verify the dead token has been reaped and is no longer active
      const activeAfter = await getActivePushTokens(['user-uninstalled-app']);
      expect(activeAfter).toHaveLength(0);
    });

    it('TC-REAP-02: Transient errors (MessageRateExceeded) do NOT reap the token', async () => {
      const rateLimitedToken = 'ExponentPushToken[rate-limited-token]';
      await upsertDevicePushToken({
        userId: 'user-rate-limited',
        token: rateLimitedToken,
        platform: 'android',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              status: 'error',
              message: 'Rate limit exceeded',
              details: { error: 'MessageRateExceeded' },
            },
          ],
        }),
      });

      const result = await dispatchPushNotifications(
        ['user-rate-limited'],
        {
          type: 'match-reminder',
          title: 'Lembrete',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.failedCount).toBe(1);
      expect(result.reapedTokens).toHaveLength(0);

      // Token is NOT deleted
      const activeAfter = await getActivePushTokens(['user-rate-limited']);
      expect(activeAfter).toHaveLength(1);
    });

    it('TC-REAP-03: Mixed batch reaping correctly isolates only DeviceNotRegistered tokens', async () => {
      const token1 = 'ExponentPushToken[mixed-ok-1]';
      const tokenDead = 'ExponentPushToken[mixed-dead-2]';
      const token3 = 'ExponentPushToken[mixed-ok-3]';

      await upsertDevicePushToken({ userId: 'u1', token: token1, platform: 'ios' });
      await upsertDevicePushToken({ userId: 'u2', token: tokenDead, platform: 'ios' });
      await upsertDevicePushToken({ userId: 'u3', token: token3, platform: 'android' });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: 'ok', id: 't1' },
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
            { status: 'ok', id: 't3' },
          ],
        }),
      });

      const result = await dispatchPushNotifications(
        ['u1', 'u2', 'u3'],
        {
          type: 'match-confirmed',
          title: 'Partida Confirmada',
          body: 'Prepare-se para o jogo',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(2);
      expect(result.failedCount).toBe(1);
      expect(result.reapedTokens).toEqual([tokenDead]);

      expect(await getActivePushTokens(['u1'])).toHaveLength(1);
      expect(await getActivePushTokens(['u2'])).toHaveLength(0);
      expect(await getActivePushTokens(['u3'])).toHaveLength(1);
    });
  });

  describe('7. Fault Tolerance & Non-Blocking Resilience', () => {
    it('TC-FAULT-01: Network fetch failure does not throw and returns failed result', async () => {
      await upsertDevicePushToken({
        userId: 'user-network-err',
        token: 'ExponentPushToken[network-err-token]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockRejectedValue(new Error('Network connection reset'));

      const result = await dispatchPushNotifications(
        ['user-network-err'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      // Never throws; returns gracefully
      expect(result.success).toBe(true);
      expect(result.sentCount).toBe(0);
    });

    it('TC-FAULT-02: HTTP 500 error from Expo API is handled gracefully', async () => {
      await upsertDevicePushToken({
        userId: 'user-500',
        token: 'ExponentPushToken[user-500-token]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const result = await dispatchPushNotifications(
        ['user-500'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(0);
    });

    it('TC-FAULT-03: Malformed JSON from Expo API is handled gracefully', async () => {
      await upsertDevicePushToken({
        userId: 'user-json-err',
        token: 'ExponentPushToken[user-json-err]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON');
        },
      });

      const result = await dispatchPushNotifications(
        ['user-json-err'],
        {
          type: 'match-formed',
          title: 'Partida',
          body: 'Teste',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(0);
    });
  });

  describe('8. Integration into notifyUsers()', () => {
    it('TC-NOTIFY-01: Calling notifyUsers executes push dispatch safely without throwing', async () => {
      await upsertDevicePushToken({
        userId: 'player-notify-int',
        token: 'ExponentPushToken[notify-int-token]',
        platform: 'ios',
      });

      // Stub global fetch
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'ok', id: 'ticket-int-1' }],
        }),
      } as any);

      await expect(
        notifyUsers(['player-notify-int'], {
          type: 'match-ready-to-play',
          title: 'Todos na quadra',
          body: 'Inicie a partida agora!',
          href: '/match/room-99',
        })
      ).resolves.not.toThrow();

      expect(fetchSpy).toHaveBeenCalled();
    });
  });
});
