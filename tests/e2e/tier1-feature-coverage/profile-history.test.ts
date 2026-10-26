import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Mobile Data Parity APIs (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-PARITY-01: GET /api/me returns full profile for mobile client with Bearer token', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const token = await generateSessionToken(player.id);
    client.asMobile(token);

    const res = await client.getMe();

    expect(res.ok).toBe(true);
    expect(res.player).toBeDefined();
    expect(res.player?.id).toBe(player.id);
    expect(res.player?.handle).toBe(player.handle);
    expect(res.player?.rating).toBe(player.rating);
    expect(res.player?.tier).toBe(player.tier);
    expect(res.player?.points).toBe(player.points);
    expect(res.player?.city).toBe(player.city);
    expect(res.player?.clubId).toBe(player.clubId);
  });

  it('TC-PARITY-02: GET /api/me returns full profile for web client with Cookie', async () => {
    const player = FIXTURE_PLAYERS.player2;
    const cookie = await generateSessionToken(player.id);
    client.asWeb(cookie);

    const res = await client.getMe();

    expect(res.ok).toBe(true);
    expect(res.player?.id).toBe(player.id);
    expect(res.player?.displayName).toBe(player.displayName);
  });

  it('TC-PARITY-03: GET /api/me returns 401 when no token or cookie is provided', async () => {
    const clientUnauth = new OpaqueBoxClient('mobile');
    const res = await clientUnauth.getMe();

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it('TC-PARITY-04: GET /api/history returns match history for authenticated player', async () => {
    const player = FIXTURE_PLAYERS.player1;
    const token = await generateSessionToken(player.id);
    client.asMobile(token);

    // Form and record a match for player1
    await client.formMatch({
      id: 'match-hist-1',
      teamA: { player1Id: player.id, player2Id: FIXTURE_PLAYERS.player2.id },
      teamB: { player1Id: FIXTURE_PLAYERS.player3.id, player2Id: FIXTURE_PLAYERS.player4.id },
    });

    const res = await client.getHistory();

    expect(res.ok).toBe(true);
    expect(Array.isArray(res.history)).toBe(true);
    expect(res.history.length).toBeGreaterThanOrEqual(1);
    expect(res.history[0].id).toBe('match-hist-1');
  });

  it('TC-PARITY-05: GET /api/season returns active season details and user stats', async () => {
    const player = FIXTURE_PLAYERS.player3;
    const token = await generateSessionToken(player.id);
    client.asMobile(token);

    const res = await client.getSeason();

    expect(res.ok).toBe(true);
    expect(res.season).toBeDefined();
    expect(res.season.status).toBe('active');
    expect(res.season.daysRemaining).toBeGreaterThan(0);
    expect(res.season.userStats.tier).toBe(player.tier);
  });
});
