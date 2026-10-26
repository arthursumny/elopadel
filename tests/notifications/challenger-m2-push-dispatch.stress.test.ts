import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  type ExpoPushTicket,
  type NotificationInput,
} from '@/lib/notifications/push';
import {
  clearRuntimePushTokens,
  getActivePushTokens,
  upsertDevicePushToken,
  deactivateDevicePushToken,
  deleteDevicePushTokens,
} from '@/lib/notifications/tokens';
import { notifyUsers } from '@/lib/db/notifications';

describe('Milestone 2 Adversarial Stress Suite: Push Dispatch & Fault Tolerance', () => {
  beforeEach(() => {
    clearRuntimePushTokens();
    vi.restoreAllMocks();
    delete process.env.DISABLE_PUSH_NOTIFICATIONS;
    delete process.env.EXPO_ACCESS_TOKEN;
  });

  afterEach(() => {
    delete process.env.DISABLE_PUSH_NOTIFICATIONS;
    delete process.env.EXPO_ACCESS_TOKEN;
  });

  describe('1. High Volume Chunking Stress Harness (>250 tokens)', () => {
    it('TC-CHALLENGE-CHUNK-01: Dispatches >250 tokens producing exactly 3 chunks of [100, 100, 50]', async () => {
      const TOTAL_TOKENS = 250;
      const userIds: string[] = [];

      for (let i = 0; i < TOTAL_TOKENS; i++) {
        const uid = `bulk-user-${i}`;
        const token = `ExponentPushToken[bulk-token-${i.toString().padStart(4, '0')}]`;
        userIds.push(uid);
        await upsertDevicePushToken({
          userId: uid,
          token,
          platform: i % 2 === 0 ? 'ios' : 'android',
        });
      }

      const chunkRecordedSizes: number[] = [];
      const mockFetch = vi.fn().mockImplementation(async (url: string, options: RequestInit) => {
        expect(url).toBe(EXPO_PUSH_URL);
        const payload = JSON.parse(options.body as string) as ExpoPushMessage[];
        chunkRecordedSizes.push(payload.length);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: payload.map((msg, idx) => ({
              status: 'ok',
              id: `ticket-${chunkRecordedSizes.length}-${idx}`,
            })),
          }),
        };
      });

      const result = await dispatchPushNotifications(
        userIds,
        {
          type: 'match-formed',
          title: 'Grande Partida Encontrada',
          body: '250 jogadores notificados com sucesso',
          href: '/match/bulk-stress-1',
        },
        { fetchFn: mockFetch as any }
      );

      // Verify exactly 3 fetch calls occurred
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify exact chunk breakdown: 100, 100, 50
      expect(chunkRecordedSizes).toEqual([100, 100, 50]);

      // Verify result totals
      expect(result.success).toBe(true);
      expect(result.totalTokens).toBe(250);
      expect(result.sentCount).toBe(250);
      expect(result.failedCount).toBe(0);
      expect(result.reapedTokens).toHaveLength(0);
      expect(result.tickets).toHaveLength(250);

      // Verify chunk ordering and token integrity
      const chunk1Payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      const chunk2Payload = JSON.parse(mockFetch.mock.calls[1][1].body);
      const chunk3Payload = JSON.parse(mockFetch.mock.calls[2][1].body);

      expect(chunk1Payload[0].to).toBe('ExponentPushToken[bulk-token-0000]');
      expect(chunk1Payload[99].to).toBe('ExponentPushToken[bulk-token-0099]');
      expect(chunk2Payload[0].to).toBe('ExponentPushToken[bulk-token-0100]');
      expect(chunk2Payload[99].to).toBe('ExponentPushToken[bulk-token-0199]');
      expect(chunk3Payload[0].to).toBe('ExponentPushToken[bulk-token-0200]');
      expect(chunk3Payload[49].to).toBe('ExponentPushToken[bulk-token-0249]');
    });

    it('TC-CHALLENGE-CHUNK-02: Boundary thresholds verification for chunk sizes', () => {
      // 0 tokens
      expect(chunkArray([])).toEqual([]);

      // 1 token
      expect(chunkArray([1], 100)).toEqual([[1]]);

      // 99 tokens
      const arr99 = Array.from({ length: 99 }, (_, i) => i);
      const chunks99 = chunkArray(arr99, 100);
      expect(chunks99).toHaveLength(1);
      expect(chunks99[0]).toHaveLength(99);

      // 100 tokens (boundary)
      const arr100 = Array.from({ length: 100 }, (_, i) => i);
      const chunks100 = chunkArray(arr100, 100);
      expect(chunks100).toHaveLength(1);
      expect(chunks100[0]).toHaveLength(100);

      // 101 tokens (boundary + 1)
      const arr101 = Array.from({ length: 101 }, (_, i) => i);
      const chunks101 = chunkArray(arr101, 100);
      expect(chunks101).toHaveLength(2);
      expect(chunks101[0]).toHaveLength(100);
      expect(chunks101[1]).toHaveLength(1);

      // 200 tokens
      const arr200 = Array.from({ length: 200 }, (_, i) => i);
      const chunks200 = chunkArray(arr200, 100);
      expect(chunks200).toHaveLength(2);
      expect(chunks200[0]).toHaveLength(100);
      expect(chunks200[1]).toHaveLength(100);

      // 251 tokens
      const arr251 = Array.from({ length: 251 }, (_, i) => i);
      const chunks251 = chunkArray(arr251, 100);
      expect(chunks251).toHaveLength(3);
      expect(chunks251[0]).toHaveLength(100);
      expect(chunks251[1]).toHaveLength(100);
      expect(chunks251[2]).toHaveLength(51);

      // 305 tokens (4 chunks)
      const arr305 = Array.from({ length: 305 }, (_, i) => i);
      const chunks305 = chunkArray(arr305, 100);
      expect(chunks305).toHaveLength(4);
      expect(chunks305[0]).toHaveLength(100);
      expect(chunks305[1]).toHaveLength(100);
      expect(chunks305[2]).toHaveLength(100);
      expect(chunks305[3]).toHaveLength(5);
    });

    it('TC-CHALLENGE-CHUNK-03: Header injection: Bearer token is strictly included when EXPO_ACCESS_TOKEN is configured', async () => {
      process.env.EXPO_ACCESS_TOKEN = 'expo-secret-token-xyz-987';

      await upsertDevicePushToken({
        userId: 'auth-header-user',
        token: 'ExponentPushToken[header-test]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'ok', id: 't-auth' }],
        }),
      });

      await dispatchPushNotifications(
        ['auth-header-user'],
        {
          type: 'match-confirmed',
          title: 'Header Test',
          body: 'Verificando cabeçalho de autenticação Expo',
        },
        { fetchFn: mockFetch as any }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBe('Bearer expo-secret-token-xyz-987');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Accept']).toBe('application/json');
    });

    it('TC-CHALLENGE-CHUNK-04: Header omission: No Authorization header when EXPO_ACCESS_TOKEN is unset', async () => {
      delete process.env.EXPO_ACCESS_TOKEN;

      await upsertDevicePushToken({
        userId: 'no-auth-user',
        token: 'ExponentPushToken[no-auth-token]',
        platform: 'android',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'ok', id: 't-noauth' }],
        }),
      });

      await dispatchPushNotifications(
        ['no-auth-user'],
        {
          type: 'friend-request',
          title: 'Sem Token',
          body: 'Teste sem autenticação',
        },
        { fetchFn: mockFetch as any }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Authorization']).toBeUndefined();
    });
  });

  describe('2. Mixed Ticket Receipts & Selective Reaping Oracle', () => {
    it('TC-CHALLENGE-REAP-01: Reaps strictly DeviceNotRegistered while preserving all other error and success tokens', async () => {
      const tokens = [
        { id: 'u-ok-1', token: 'ExponentPushToken[device-ok-1]', expectedReap: false },
        { id: 'u-dead-1', token: 'ExponentPushToken[device-dead-1]', expectedReap: true },
        { id: 'u-rate-1', token: 'ExponentPushToken[device-rate-1]', expectedReap: false },
        { id: 'u-big-1', token: 'ExponentPushToken[device-big-1]', expectedReap: false },
        { id: 'u-cred-1', token: 'ExponentPushToken[device-cred-1]', expectedReap: false },
        { id: 'u-unknown-1', token: 'ExponentPushToken[device-unknown-1]', expectedReap: false },
        { id: 'u-nodetails-1', token: 'ExponentPushToken[device-nodetails-1]', expectedReap: false },
      ];

      for (const t of tokens) {
        await upsertDevicePushToken({
          userId: t.id,
          token: t.token,
          platform: 'ios',
        });
      }

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            { status: 'ok', id: 'ticket-ok-1' },
            {
              status: 'error',
              message: 'Device not registered',
              details: { error: 'DeviceNotRegistered' },
            },
            {
              status: 'error',
              message: 'Rate limit exceeded',
              details: { error: 'MessageRateExceeded' },
            },
            {
              status: 'error',
              message: 'Message too big',
              details: { error: 'MessageTooBig' },
            },
            {
              status: 'error',
              message: 'Invalid credentials',
              details: { error: 'InvalidCredentials' },
            },
            {
              status: 'error',
              message: 'Some other provider error',
              details: { error: 'UnknownError' },
            },
            {
              status: 'error',
              message: 'Error without details property',
            },
          ],
        }),
      });

      const userIds = tokens.map((t) => t.id);
      const result = await dispatchPushNotifications(
        userIds,
        {
          type: 'match-formed',
          title: 'Partida Teste Receipts',
          body: 'Avaliando seletividade do reaping',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(1);
      expect(result.failedCount).toBe(6);
      expect(result.reapedTokens).toEqual(['ExponentPushToken[device-dead-1]']);

      // Verify that ONLY u-dead-1 was deleted from active storage
      for (const t of tokens) {
        const active = await getActivePushTokens([t.id]);
        if (t.expectedReap) {
          expect(active).toHaveLength(0);
        } else {
          expect(active).toHaveLength(1);
          expect(active[0].token).toBe(t.token);
          expect(active[0].isEnabled).toBe(true);
        }
      }
    });

    it('TC-CHALLENGE-REAP-02: Multi-chunk mixed receipts aggregates dead tokens across all chunks', async () => {
      // Create 250 tokens in 3 chunks
      const TOTAL = 250;
      const deadTokenIndices = new Set([5, 45, 99, 105, 150, 199, 205, 249]); // 8 dead tokens across chunks

      for (let i = 0; i < TOTAL; i++) {
        await upsertDevicePushToken({
          userId: `multi-reap-user-${i}`,
          token: `ExponentPushToken[multi-token-${i}]`,
          platform: 'android',
        });
      }

      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        const chunk = JSON.parse(options.body as string) as ExpoPushMessage[];
        callCount++;

        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: chunk.map((msg, idx) => {
              const globalIndex = (callCount - 1) * 100 + idx;
              if (deadTokenIndices.has(globalIndex)) {
                return {
                  status: 'error',
                  message: 'Device not registered',
                  details: { error: 'DeviceNotRegistered' },
                };
              }
              if (globalIndex % 17 === 0) {
                return {
                  status: 'error',
                  message: 'Rate limit exceeded',
                  details: { error: 'MessageRateExceeded' },
                };
              }
              return { status: 'ok', id: `t-${globalIndex}` };
            }),
          }),
        };
      });

      const userIds = Array.from({ length: TOTAL }, (_, i) => `multi-reap-user-${i}`);
      const result = await dispatchPushNotifications(
        userIds,
        {
          type: 'match-confirmed',
          title: 'Multi-chunk Reap Test',
          body: 'Verificando agregação entre múltiplos chunks',
        },
        { fetchFn: mockFetch as any }
      );

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.reapedTokens).toHaveLength(8);

      for (const deadIdx of deadTokenIndices) {
        expect(result.reapedTokens).toContain(`ExponentPushToken[multi-token-${deadIdx}]`);
      }

      // Verify dead tokens are gone from storage
      for (let i = 0; i < TOTAL; i++) {
        const active = await getActivePushTokens([`multi-reap-user-${i}`]);
        if (deadTokenIndices.has(i)) {
          expect(active).toHaveLength(0);
        } else {
          expect(active).toHaveLength(1);
        }
      }
    });

    it('TC-CHALLENGE-REAP-03: Reaped token can be re-registered and re-activated idempotently', async () => {
      const deadToken = 'ExponentPushToken[resurrected-token]';
      await upsertDevicePushToken({
        userId: 'user-reinstall',
        token: deadToken,
        platform: 'ios',
      });

      // 1. First dispatch triggers reap
      const reapFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }],
        }),
      });

      const reapResult = await dispatchPushNotifications(
        ['user-reinstall'],
        { type: 'match-formed', title: 'T1', body: 'B1' },
        { fetchFn: reapFetch as any }
      );
      expect(reapResult.reapedTokens).toContain(deadToken);
      expect(await getActivePushTokens(['user-reinstall'])).toHaveLength(0);

      // 2. User reopens app / logs back in -> token is registered anew
      const reactivated = await upsertDevicePushToken({
        userId: 'user-reinstall',
        token: deadToken,
        platform: 'ios',
      });
      expect(reactivated.isEnabled).toBe(true);

      const activeAfter = await getActivePushTokens(['user-reinstall']);
      expect(activeAfter).toHaveLength(1);
      expect(activeAfter[0].token).toBe(deadToken);

      // 3. Second dispatch now delivers successfully
      const okFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'ok', id: 't-new-session' }],
        }),
      });

      const nextResult = await dispatchPushNotifications(
        ['user-reinstall'],
        { type: 'match-formed', title: 'T2', body: 'B2' },
        { fetchFn: okFetch as any }
      );
      expect(nextResult.sentCount).toBe(1);
      expect(nextResult.reapedTokens).toHaveLength(0);
    });
  });

  describe('3. Network Fault Injection & Non-Blocking Resilience', () => {
    it('TC-CHALLENGE-FAULT-01: fetch throwing TypeError (network unreachable / connection refused)', async () => {
      await upsertDevicePushToken({
        userId: 'fault-user-1',
        token: 'ExponentPushToken[fault-token-1]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const result = await dispatchPushNotifications(
        ['fault-user-1'],
        {
          type: 'match-formed',
          title: 'Offline Test',
          body: 'Conexão perdida',
        },
        { fetchFn: mockFetch as any }
      );

      // Must catch error gracefully without throwing
      expect(result.success).toBe(true);
      expect(result.sentCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.totalTokens).toBe(1);
    });

    it('TC-CHALLENGE-FAULT-02: HTTP 500 Internal Server Error handled without throwing', async () => {
      await upsertDevicePushToken({
        userId: 'fault-user-500',
        token: 'ExponentPushToken[fault-token-500]',
        platform: 'android',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => '{"error": "Internal Server Error"}',
      });

      const result = await dispatchPushNotifications(
        ['fault-user-500'],
        {
          type: 'match-ready-to-play',
          title: 'Serviço 500',
          body: 'Teste de falha de servidor',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(0);
      expect(result.reapedTokens).toHaveLength(0);
    });

    it('TC-CHALLENGE-FAULT-03: HTTP 502 Bad Gateway handled without throwing', async () => {
      await upsertDevicePushToken({
        userId: 'fault-user-502',
        token: 'ExponentPushToken[fault-token-502]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => '<html><body>Bad Gateway</body></html>',
      });

      const result = await dispatchPushNotifications(
        ['fault-user-502'],
        {
          type: 'attendance-update',
          title: 'Serviço 502',
          body: 'Teste de Bad Gateway',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(0);
    });

    it('TC-CHALLENGE-FAULT-04: HTTP 504 Gateway Timeout handled without throwing', async () => {
      await upsertDevicePushToken({
        userId: 'fault-user-504',
        token: 'ExponentPushToken[fault-token-504]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        text: async () => 'Gateway Timeout',
      });

      const result = await dispatchPushNotifications(
        ['fault-user-504'],
        {
          type: 'result-submitted',
          title: 'Timeout',
          body: 'Teste de timeout',
        },
        { fetchFn: mockFetch as any }
      );

      expect(result.sentCount).toBe(0);
    });

    it('TC-CHALLENGE-FAULT-05: Malformed JSON responses handled without crashing', async () => {
      await upsertDevicePushToken({
        userId: 'fault-user-malformed',
        token: 'ExponentPushToken[fault-token-malformed]',
        platform: 'ios',
      });

      // 1. Non-JSON response returning HTML
      const mockFetch1 = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      });

      const res1 = await dispatchPushNotifications(
        ['fault-user-malformed'],
        { type: 'result-vote', title: 'T', body: 'B' },
        { fetchFn: mockFetch1 as any }
      );
      expect(res1.sentCount).toBe(0);

      // 2. JSON response where data is null
      const mockFetch2 = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: null }),
      });

      const res2 = await dispatchPushNotifications(
        ['fault-user-malformed'],
        { type: 'result-vote', title: 'T', body: 'B' },
        { fetchFn: mockFetch2 as any }
      );
      expect(res2.sentCount).toBe(0);

      // 3. JSON response where data is a string
      const mockFetch3 = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: 'not an array' }),
      });

      const res3 = await dispatchPushNotifications(
        ['fault-user-malformed'],
        { type: 'result-vote', title: 'T', body: 'B' },
        { fetchFn: mockFetch3 as any }
      );
      expect(res3.sentCount).toBe(0);
    });

    it('TC-CHALLENGE-FAULT-06: Partial failure across chunks preserves successful chunk delivery', async () => {
      // 3 chunks: Chunk 1 fails (TypeError), Chunk 2 returns 502, Chunk 3 succeeds with 50 ok
      const TOTAL = 250;
      for (let i = 0; i < TOTAL; i++) {
        await upsertDevicePushToken({
          userId: `resilience-user-${i}`,
          token: `ExponentPushToken[resilience-token-${i}]`,
          platform: 'ios',
        });
      }

      let attempt = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        attempt++;
        if (attempt === 1) {
          throw new TypeError('Socket hang up on chunk 1');
        }
        if (attempt === 2) {
          return {
            ok: false,
            status: 502,
            text: async () => 'Bad Gateway on chunk 2',
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: Array.from({ length: 50 }, (_, i) => ({ status: 'ok', id: `t3-${i}` })),
          }),
        };
      });

      const userIds = Array.from({ length: TOTAL }, (_, i) => `resilience-user-${i}`);
      const result = await dispatchPushNotifications(
        userIds,
        {
          type: 'match-validated',
          title: 'Partida Validada',
          body: 'Resiliência parcial',
        },
        { fetchFn: mockFetch as any }
      );

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.sentCount).toBe(50);
      expect(result.totalTokens).toBe(250);
      expect(result.tickets).toHaveLength(50);
    });

    it('TC-CHALLENGE-FAULT-07: notifyUsers() never throws when push dispatch encounters network exceptions', async () => {
      await upsertDevicePushToken({
        userId: 'notify-fail-user',
        token: 'ExponentPushToken[notify-fail-token]',
        platform: 'ios',
      });

      // Spy on globalThis.fetch and throw
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Fatal network partition'));

      await expect(
        notifyUsers(['notify-fail-user'], {
          type: 'match-formed',
          title: 'Teste notifyUsers com falha de push',
          body: 'O fluxo de jogo nunca pode quebrar por falha externa',
          href: '/match/room-99',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('4. Comprehensive Event Formatter & Deep Link Parity Matrix (29 Events)', () => {
    type EventTestCase = {
      type: string;
      title: string;
      body: string;
      explicitHref?: string;
      expectedChannel: 'match-events' | 'invitations' | 'reminders';
      expectedDefaultLink: string;
    };

    const EVENT_TEST_CASES: EventTestCase[] = [
      // 1. Match Events
      {
        type: 'match-formed',
        title: 'Partida formada',
        body: 'Os quatro jogadores estão definidos. Confirme sua presença e reserve a quadra no Gripo.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'match-confirmed',
        title: 'Partida confirmada pelos quatro',
        body: 'Todos aceitaram jogar. No horário marcado, os quatro precisam confirmar presença na quadra.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'match-cancelled',
        title: 'Partida cancelada',
        body: 'Um dos jogadores não confirmou a partida. Todos podem iniciar uma nova busca.',
        explicitHref: '/matchmaking',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'match-ready-to-play',
        title: 'Os quatro estão na quadra',
        body: 'Todos confirmaram presença. A partida está liberada para começar.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'attendance-update',
        title: 'Presença confirmada',
        body: 'Jogador confirmou presença.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'result-window-open',
        title: 'Informe o resultado da partida',
        body: 'O tempo de jogo terminou. Envie o placar.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'result-submitted',
        title: 'Resultado aguardando confirmação',
        body: 'O placar foi enviado. Confirme o vencedor que você reconhece.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'result-vote',
        title: 'Voto registrado',
        body: 'Seu voto foi registrado. Ainda faltam confirmações.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'result-disputed',
        title: 'Resultado contestado',
        body: 'Um jogador contestou o resultado. O MMR está bloqueado até a análise do clube.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'match-validated',
        title: 'Partida validada',
        body: 'Resultado confirmado. O MMR, a patente e a temporada foram atualizados.',
        explicitHref: '/match/m-123',
        expectedChannel: 'match-events',
        expectedDefaultLink: '/matchmaking',
      },

      // 2. Invitation & Social Events
      {
        type: 'friend-request',
        title: 'Nova solicitação de amizade',
        body: 'Jogador quer adicionar você à rede competitiva.',
        explicitHref: '/friends',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/friends',
      },
      {
        type: 'friend-request-response',
        title: 'Solicitação aceita',
        body: 'Agora vocês são amigos na rede.',
        explicitHref: '/friends',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/friends',
      },
      {
        type: 'match-search-invitation',
        title: 'Convite para buscar uma partida',
        body: 'Você foi convidado para formar uma dupla na busca automática.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'match-search-invitation-response',
        title: 'Dupla pronta no saguão',
        body: 'Seu parceiro entrou no saguão.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'match-search-started',
        title: 'Busca iniciada',
        body: 'Os dois jogadores confirmaram. O sistema está procurando uma partida compatível.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'room-invitation',
        title: 'Convite para uma sala',
        body: 'Você recebeu um convite para formar uma dupla.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'room-invitation-response',
        title: 'Convite aceito',
        body: 'Seu parceiro aceitou o convite para a sala.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'room-joined',
        title: 'Jogador entrou na sua sala',
        body: 'Uma nova pessoa entrou na sala.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'direct-challenge',
        title: 'Novo desafio direto recebido',
        body: 'Você foi desafiado por outro jogador.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'direct-challenge-response',
        title: 'Desafio recusado',
        body: 'Um dos jogadores recusou o desafio direto.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'direct-challenge-suggestion',
        title: 'Novo horário sugerido',
        body: 'Um novo horário foi proposto para o desafio.',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },
      {
        type: 'direct-challenge-accepted',
        title: 'Aceite de desafio registrado',
        body: 'Um jogador aceitou o desafio direto (2/4).',
        explicitHref: '/matchmaking',
        expectedChannel: 'invitations',
        expectedDefaultLink: '/matchmaking',
      },

      // 3. Reminders & Lifecycle Events
      {
        type: 'match-reminder',
        title: 'Sua partida está chegando',
        body: 'Não esqueça da partida marcada para hoje.',
        explicitHref: '/match/m-123',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
      {
        type: 'room-expired',
        title: 'Sala encerrada',
        body: 'A sala não foi completada antes do horário marcado.',
        explicitHref: '/matchmaking',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
      {
        type: 'search-expired',
        title: 'Busca encerrada',
        body: 'A janela de disponibilidade terminou sem formar uma partida.',
        explicitHref: '/matchmaking',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
      {
        type: 'direct-challenge-expired',
        title: 'Desafio encerrado',
        body: 'O horário do desafio passou sem que os quatro jogadores confirmassem.',
        explicitHref: '/matchmaking',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
      {
        type: 'inactivity-penalty',
        title: 'Sua patente precisa de atividade',
        body: 'Você ficou 15 dias sem jogar e perdeu 25 pontos.',
        explicitHref: '/profile',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
      {
        type: 'profile-inactive',
        title: 'Perfil competitivo inativo',
        body: 'Seu perfil saiu da disputa entre jogadores ativos.',
        explicitHref: '/matchmaking',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
      {
        type: 'club-membership',
        title: 'Vínculo aprovado',
        body: 'O clube aprovou seu vínculo.',
        explicitHref: '/profile',
        expectedChannel: 'reminders',
        expectedDefaultLink: '/notifications',
      },
    ];

    it('TC-CHALLENGE-FORMAT-01: Verifies all 29 event types map to valid channels, titles, bodies, and deep links', () => {
      const token = 'ExponentPushToken[format-oracle-token]';

      for (const tc of EVENT_TEST_CASES) {
        // 1. Test with explicit href
        const payloadWithHref = formatPushPayload(token, {
          type: tc.type,
          title: tc.title,
          body: tc.body,
          href: tc.explicitHref,
          dedupeKey: `key-${tc.type}`,
        });

        expect(payloadWithHref.to).toBe(token);
        expect(payloadWithHref.title).toBe(tc.title);
        expect(payloadWithHref.body).toBe(tc.body);
        expect(payloadWithHref.channelId).toBe(tc.expectedChannel);
        expect(payloadWithHref.sound).toBe('default');
        expect(payloadWithHref.badge).toBe(1);
        expect(payloadWithHref.priority).toBe('high');
        expect(payloadWithHref.data.eventType).toBe(tc.type);
        expect(payloadWithHref.data.url).toBe(tc.explicitHref);
        expect(payloadWithHref.data.deepLink).toBe(tc.explicitHref);
        expect(payloadWithHref.data.dedupeKey).toBe(`key-${tc.type}`);

        // 2. Test with omitted href (fallback resolution)
        const payloadWithoutHref = formatPushPayload(token, {
          type: tc.type,
          title: tc.title,
          body: tc.body,
        });

        expect(payloadWithoutHref.channelId).toBe(tc.expectedChannel);
        expect(payloadWithoutHref.data.url).toBe(tc.expectedDefaultLink);
        expect(payloadWithoutHref.data.deepLink).toBe(tc.expectedDefaultLink);
      }
    });

    it('TC-CHALLENGE-FORMAT-02: End-to-end dispatch of all 29 event types delivers formatted payloads to Expo', async () => {
      await upsertDevicePushToken({
        userId: 'event-matrix-user',
        token: 'ExponentPushToken[event-matrix-token]',
        platform: 'ios',
      });

      const capturedMessages: ExpoPushMessage[] = [];
      const mockFetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        const msgs = JSON.parse(options.body as string) as ExpoPushMessage[];
        capturedMessages.push(...msgs);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: msgs.map((_, idx) => ({ status: 'ok', id: `ticket-${idx}` })),
          }),
        };
      });

      for (const tc of EVENT_TEST_CASES) {
        const result = await dispatchPushNotifications(
          ['event-matrix-user'],
          {
            type: tc.type,
            title: tc.title,
            body: tc.body,
            href: tc.explicitHref,
          },
          { fetchFn: mockFetch as any }
        );

        expect(result.sentCount).toBe(1);
        expect(result.success).toBe(true);
      }

      expect(mockFetch).toHaveBeenCalledTimes(EVENT_TEST_CASES.length);
      expect(capturedMessages).toHaveLength(EVENT_TEST_CASES.length);

      for (let i = 0; i < EVENT_TEST_CASES.length; i++) {
        const msg = capturedMessages[i];
        const tc = EVENT_TEST_CASES[i];
        expect(msg.data.eventType).toBe(tc.type);
        expect(msg.title).toBe(tc.title);
        expect(msg.body).toBe(tc.body);
        expect(msg.channelId).toBe(tc.expectedChannel);
        expect(msg.data.deepLink).toBe(tc.explicitHref);
      }
    });
  });

  describe('5. Concurrency, Edge Cases & Resilience', () => {
    it('TC-CHALLENGE-EDGE-01: Deduplicates userIds and strips empty/null values', async () => {
      await upsertDevicePushToken({
        userId: 'clean-user-1',
        token: 'ExponentPushToken[clean-token-1]',
        platform: 'ios',
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ status: 'ok', id: 't-clean' }],
        }),
      });

      const dirtyUserIds = [
        'clean-user-1',
        'clean-user-1',
        '',
        (null as unknown as string),
        (undefined as unknown as string),
        'clean-user-1',
      ];

      const result = await dispatchPushNotifications(
        dirtyUserIds,
        { type: 'match-formed', title: 'T', body: 'B' },
        { fetchFn: mockFetch as any }
      );

      expect(result.totalTokens).toBe(1);
      expect(result.sentCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const sentPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(sentPayload).toHaveLength(1);
    });

    it('TC-CHALLENGE-EDGE-02: Whitespace trimming in explicit deep link href', () => {
      expect(resolveDeepLink('match-formed', '   /match/uuid-spaced   ')).toBe('/match/uuid-spaced');
      expect(resolveDeepLink('friend-request', '   ')).toBe('/friends');
    });

    it('TC-CHALLENGE-CONCURRENCY-01: Handles 10 concurrent dispatches without state corruption', async () => {
      for (let i = 0; i < 10; i++) {
        await upsertDevicePushToken({
          userId: `concurrent-user-${i}`,
          token: `ExponentPushToken[concurrent-token-${i}]`,
          platform: 'ios',
        });
      }

      const mockFetch = vi.fn().mockImplementation(async (_url: string, options: RequestInit) => {
        const msgs = JSON.parse(options.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: msgs.map((_: any, idx: number) => ({ status: 'ok', id: `t-conc-${idx}` })),
          }),
        };
      });

      const promises = Array.from({ length: 10 }, (_, i) =>
        dispatchPushNotifications(
          [`concurrent-user-${i}`],
          {
            type: 'match-formed',
            title: `Partida ${i}`,
            body: `Corpo ${i}`,
          },
          { fetchFn: mockFetch as any }
        )
      );

      const results = await Promise.all(promises);
      for (const res of results) {
        expect(res.success).toBe(true);
        expect(res.sentCount).toBe(1);
      }
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });
  });
});
