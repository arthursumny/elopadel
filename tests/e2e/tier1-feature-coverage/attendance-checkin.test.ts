import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';
import { noShowPenalty, applyRankPenalty } from '@/lib/domain/attendance';

describe('Tier 1: Feature Coverage — Attendance Check-in Window & Penalties (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-ATTEND-01: Rejects check-in before match start time (409 too-early)', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const futureMatchTime = new Date(Date.now() + 3600 * 1000); // 1 hour in future

    const { matchId } = await client.formMatch({
      id: 'match-checkin-01',
      startsAt: futureMatchTime,
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    const res = await client.checkInAttendance(matchId);

    expect(res.ok).toBe(false);
    expect(res.code).toBe(409);
    expect(res.status).toBe('too-early');
    expect(res.error).toMatch(/start time/i);
  });

  it('TC-ATTEND-02: Accepts check-in when match start time has arrived', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const pastMatchTime = new Date(Date.now() - 5 * 60 * 1000); // Started 5 mins ago

    const { matchId } = await client.formMatch({
      id: 'match-checkin-02',
      startsAt: pastMatchTime,
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    const res = await client.checkInAttendance(matchId);

    expect(res.ok).toBe(true);
    expect(res.status).toBe('1/4 present');
  });

  it('TC-ATTEND-03: Dispatches "match-ready-to-play" push notification when 4/4 check in', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    pushService.registerDeviceToken(p1.id, 'ExponentPushToken[attend-p1]');
    pushService.registerDeviceToken(p2.id, 'ExponentPushToken[attend-p2]');

    const pastMatchTime = new Date(Date.now() - 10 * 60 * 1000);
    const { matchId } = await client.formMatch({
      id: 'match-checkin-03',
      startsAt: pastMatchTime,
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    await client.checkInAttendance(matchId);

    client.asMobile(await generateSessionToken(p2.id));
    await client.checkInAttendance(matchId);

    client.asMobile(await generateSessionToken(p3.id));
    await client.checkInAttendance(matchId);

    client.asMobile(await generateSessionToken(p4.id));
    const res4 = await client.checkInAttendance(matchId);

    expect(res4.ok).toBe(true);
    expect(res4.status).toBe('4/4 present');

    const p1Notifications = pushService.getSentForUser(p1.id);
    const readyPush = p1Notifications.find((n) => n.data?.type === 'match-ready-to-play');
    expect(readyPush).toBeDefined();
    expect(readyPush?.title).toMatch(/estão na quadra/i);
  });

  it('TC-ATTEND-04: Enforces escalating penalties for no-show strikes', () => {
    const strike1 = noShowPenalty(1);
    expect(strike1).toEqual({ mmrLoss: 100, pointsLoss: 25, suspensionDays: 1 });

    const strike2 = noShowPenalty(2);
    expect(strike2.mmrLoss).toBeGreaterThan(strike1.mmrLoss);
    expect(strike2.suspensionDays).toBe(7);

    const strike3 = noShowPenalty(3);
    expect(strike3.mmrLoss).toBeGreaterThan(strike2.mmrLoss);
    expect(strike3.suspensionDays).toBe(30);
  });

  it('TC-ATTEND-05: Calculates division demotion correctly upon rank point loss from penalty', () => {
    // Player in tier order 4 with 10 points losing 25 points -> drops to tier order 3 with 85 points
    const demotionResult = applyRankPenalty(4, 10, 25);
    expect(demotionResult).toEqual({ tierOrder: 3, points: 85 });

    // Player at base tier order 0 losing points floors at tier 0 with 0 points
    const floorResult = applyRankPenalty(0, 10, 25);
    expect(floorResult).toEqual({ tierOrder: 0, points: 0 });
  });
});
