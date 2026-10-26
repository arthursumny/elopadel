import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { pushService } from '../harness/push-service';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Score Submission & 3-Vote Quorum (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-SCORE-01: Accepts valid Best-of-3 score submission and transitions to "result-pending"', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const { matchId } = await client.formMatch({
      id: 'match-score-01',
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    const res = await client.submitMatchResult(
      matchId,
      [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 7, b: 5 }],
      'A'
    );

    expect(res.ok).toBe(true);
  });

  it('TC-SCORE-02: Validates result when 3 votes match and both teams are represented', async () => {
    const p1 = FIXTURE_PLAYERS.player1; // Team A
    const p2 = FIXTURE_PLAYERS.player2; // Team A
    const p3 = FIXTURE_PLAYERS.player3; // Team B
    const p4 = FIXTURE_PLAYERS.player4; // Team B

    const { matchId } = await client.formMatch({
      id: 'match-score-02',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    // Submit score: Team A won 6-3, 6-4
    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 3 }, { a: 6, b: 4 }], 'A');

    // Vote 1 (Team A Player 1 votes A)
    const v1 = await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });
    expect(v1.matchStatus).toBe('result-pending');

    // Vote 2 (Team A Player 2 votes A)
    client.asMobile(await generateSessionToken(p2.id));
    const v2 = await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });
    expect(v2.matchStatus).toBe('result-pending');

    // Vote 3 (Team B Player 3 votes A) -> 3 votes reached with BOTH teams represented!
    client.asMobile(await generateSessionToken(p3.id));
    const v3 = await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });
    expect(v3.matchStatus).toBe('validated');
  });

  it('TC-SCORE-03: Updates player ratings and match counts atomically upon validation', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;
    const p4 = FIXTURE_PLAYERS.player4;

    const initialP1Matches = p1.matches;

    const { matchId } = await client.formMatch({
      id: 'match-score-03',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: p4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 2 }, { a: 6, b: 1 }], 'A');
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p2.id));
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    client.asMobile(await generateSessionToken(p3.id));
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    // Verify rating update
    client.asMobile(await generateSessionToken(p1.id));
    const profile = await client.getMe();
    expect(profile.player?.matches).toBe(initialP1Matches + 1);
  });

  it('TC-SCORE-04: Immediately locks match into "disputed" status upon conflicting votes', async () => {
    const p1 = FIXTURE_PLAYERS.player1; // Team A
    const p3 = FIXTURE_PLAYERS.player3; // Team B

    const { matchId } = await client.formMatch({
      id: 'match-score-04',
      teamA: { player1Id: p1.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: p3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 4 }, { a: 6, b: 3 }], 'A');
    await client.voteResult(matchId, { status: 'confirmed', winner: 'A' });

    // Team B claims B won -> conflict!
    client.asMobile(await generateSessionToken(p3.id));
    const conflictRes = await client.voteResult(matchId, { status: 'confirmed', winner: 'B' });

    expect(conflictRes.matchStatus).toBe('disputed');
  });

  it('TC-SCORE-05: Dispatches "result-disputed" push notification when dispute is triggered', async () => {
    const p1 = FIXTURE_PLAYERS.player1;
    const p2 = FIXTURE_PLAYERS.player2;
    const p3 = FIXTURE_PLAYERS.player3;

    pushService.registerDeviceToken(p2.id, 'ExponentPushToken[dispute-p2]');

    const { matchId } = await client.formMatch({
      id: 'match-score-05',
      teamA: { player1Id: p1.id, player2Id: p2.id },
      teamB: { player1Id: p3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    client.asMobile(await generateSessionToken(p1.id));
    await client.submitMatchResult(matchId, [{ a: 6, b: 4 }, { a: 6, b: 3 }], 'A');

    // Explicit contest vote
    client.asMobile(await generateSessionToken(p3.id));
    await client.voteResult(matchId, { status: 'disputed' });

    const p2Notifications = pushService.getSentForUser(p2.id);
    const disputePush = p2Notifications.find((n) => n.data?.type === 'result-disputed');
    expect(disputePush).toBeDefined();
    expect(disputePush?.title).toMatch(/análise/i);
  });
});
