import { describe, expect, it, beforeEach } from 'vitest';
import { pushService } from '../harness/push-service';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Push Notification Dispatch Pipeline (R3)', () => {
  beforeEach(() => {
    pushService.clear();
  });

  it('TC-DISPATCH-01: Dispatches high-priority push notification with Expo format for match-formed event', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const token = 'ExponentPushToken[dispatch-formed-01]';
    pushService.registerDeviceToken(player.id, token, 'ios');

    const res = await pushService.dispatchEventToUsers([player.id], {
      type: 'match-formed',
      title: 'Partida encontrada — confirme',
      body: 'Encontramos quatro jogadores compatíveis.',
      data: { matchId: 'm-101', deepLink: '/match/m-101' },
      channelId: 'match-events',
    });

    expect(res.sentCount).toBe(1);
    expect(res.tickets[0].status).toBe('ok');

    const sent = pushService.getAllSent()[0];
    expect(sent.to).toBe(token);
    expect(sent.priority).toBe('high');
    expect(sent.channelId).toBe('match-events');
    expect(sent.data?.type).toBe('match-formed');
  });

  it('TC-DISPATCH-02: Dispatches invitation notification on invitations channel for duo partner invite', async () => {
    const player = FIXTURE_PLAYERS.player2;
    const token = 'ExponentPushToken[dispatch-invite-02]';
    pushService.registerDeviceToken(player.id, token, 'android');

    await pushService.dispatchEventToUsers([player.id], {
      type: 'match-search-invitation',
      title: 'Convite para buscar uma partida',
      body: 'Carlos convidou você para formar uma dupla.',
      data: { inviterId: FIXTURE_PLAYERS.player1.id, deepLink: '/matchmaking' },
      channelId: 'invitations',
    });

    const sent = pushService.getAllSent()[0];
    expect(sent.channelId).toBe('invitations');
    expect(sent.data?.type).toBe('match-search-invitation');
  });

  it('TC-DISPATCH-03: Dispatches reminder notification for match check-in window', async () => {
    const player = FIXTURE_PLAYERS.player3;
    const token = 'ExponentPushToken[dispatch-remind-03]';
    pushService.registerDeviceToken(player.id, token, 'ios');

    await pushService.dispatchEventToUsers([player.id], {
      type: 'match-reminder',
      title: 'Partida nas próximas horas',
      body: 'Sua partida começa em breve. Não esqueça do check-in.',
      data: { matchId: 'm-103', deepLink: '/match/m-103' },
      channelId: 'reminders',
    });

    const sent = pushService.getAllSent()[0];
    expect(sent.channelId).toBe('reminders');
    expect(sent.data?.type).toBe('match-reminder');
  });

  it('TC-DISPATCH-04: Dispatches validation notification with MMR updates to all participants', async () => {
    const players = [FIXTURE_PLAYERS.player1, FIXTURE_PLAYERS.player2, FIXTURE_PLAYERS.player3, FIXTURE_PLAYERS.player4];
    for (const p of players) {
      pushService.registerDeviceToken(p.id, `ExponentPushToken[val-${p.id}]`);
    }

    const res = await pushService.dispatchEventToUsers(players.map((p) => p.id), {
      type: 'match-validated',
      title: 'Partida validada',
      body: 'Resultado confirmado! Seu MMR e patente foram atualizados.',
      data: { matchId: 'm-104', winner: 'A' },
      channelId: 'match-events',
    });

    expect(res.sentCount).toBe(4);
    expect(res.tickets.every((t) => t.status === 'ok')).toBe(true);
  });

  it('TC-DISPATCH-05: Automatically deletes dead push token when Expo returns DeviceNotRegistered', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const deadToken = 'ExponentPushToken[dead-uninstalled-device]';
    pushService.registerDeviceToken(player.id, deadToken);

    // Simulate dead token in Expo push service
    pushService.simulateDeviceNotRegistered(deadToken);

    const res = await pushService.dispatchEventToUsers([player.id], {
      type: 'match-formed',
      title: 'Teste dead token',
      body: 'Mensagem para aparelho desinstalado',
    });

    expect(res.tickets[0].status).toBe('error');
    expect((res.tickets[0] as any).details?.error).toBe('DeviceNotRegistered');

    // Dead token should now be pruned from registry
    const remainingTokens = pushService.getTokensForUser(player.id);
    expect(remainingTokens).not.toContain(deadToken);
  });
});
