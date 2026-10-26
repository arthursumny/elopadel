import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';
import { noShowPenalty, applyRankPenalty } from '@/lib/domain/attendance';

describe('Tier 2: Boundary & Corner Cases — Attendance & Penalty Boundaries (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-BND-ATT-01: Rejects check-in 1 second before match startsAt timestamp', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    // Exactly 1 second in future
    const oneSecondInFuture = new Date(Date.now() + 1000);

    const { matchId } = await client.formMatch({
      id: 'match-bnd-att-01',
      startsAt: oneSecondInFuture,
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    const res = await client.checkInAttendance(matchId);

    expect(res.ok).toBe(false);
    expect(res.status).toBe('too-early');
  });

  it('TC-BND-ATT-02: Accepts check-in at exactly match startsAt timestamp', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    // Exactly right now (or 1ms in past)
    const exactStartTime = new Date(Date.now() - 50);

    const { matchId } = await client.formMatch({
      id: 'match-bnd-att-02',
      startsAt: exactStartTime,
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    const res = await client.checkInAttendance(matchId);

    expect(res.ok).toBe(true);
    expect(res.status).toBe('1/4 present');
  });

  it('TC-BND-ATT-03: Repeated check-ins by the same player are idempotent and do not increment count', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const { matchId } = await client.formMatch({
      id: 'match-bnd-att-03',
      startsAt: new Date(Date.now() - 1000),
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));

    // First check-in
    const res1 = await client.checkInAttendance(matchId);
    expect(res1.status).toBe('1/4 present');

    // Second check-in by SAME player
    const res2 = await client.checkInAttendance(matchId);
    expect(res2.status).toBe('1/4 present');
  });

  it('TC-BND-ATT-04: Caps consecutive no-show suspension days at 30 days maximum', () => {
    const strike3 = noShowPenalty(3);
    expect(strike3.suspensionDays).toBe(30);

    const strike4 = noShowPenalty(4);
    expect(strike4.suspensionDays).toBe(30);

    const strike10 = noShowPenalty(10);
    expect(strike10.suspensionDays).toBe(30);
  });

  it('TC-BND-ATT-05: Preserves current points and division when penalty deduction is 0', () => {
    const noLoss = applyRankPenalty(5, 75, 0);
    expect(noLoss).toEqual({ tierOrder: 5, points: 75 });
  });
});
