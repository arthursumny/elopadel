import { describe, expect, it, beforeEach } from 'vitest';
import { OpaqueBoxClient } from '../harness/client';
import { generateSessionToken } from '../fixtures/auth';
import { FIXTURE_PLAYERS } from '../fixtures/players';

describe('Tier 1: Feature Coverage — Geographic Leaderboards (R1)', () => {
  let client: OpaqueBoxClient;

  beforeEach(() => {
    client = new OpaqueBoxClient('mobile');
  });

  it('TC-RANK-01: Returns global leaderboard sorted descending by MMR rating', async () => {
    const res = await client.getLeaderboard('global');

    expect(res.ok).toBe(true);
    expect(res.entries.length).toBeGreaterThanOrEqual(4);

    // Verify descending order
    for (let i = 0; i < res.entries.length - 1; i++) {
      expect(res.entries[i].rating).toBeGreaterThanOrEqual(res.entries[i + 1].rating);
      expect(res.entries[i].rankPosition).toBe(i + 1);
    }
  });

  it('TC-RANK-02: Filters leaderboard by State (UF) with recalculated local positions', async () => {
    const res = await client.getLeaderboard('state', 'SC');

    expect(res.ok).toBe(true);
    expect(res.entries.every((e) => e.state === 'SC')).toBe(true);
    expect(res.entries[0].rankPosition).toBe(1);
  });

  it('TC-RANK-03: Filters leaderboard by City with recalculated local positions', async () => {
    const res = await client.getLeaderboard('city', 'Joaçaba');

    expect(res.ok).toBe(true);
    expect(res.entries.every((e) => e.city.toLowerCase() === 'joaçaba')).toBe(true);
  });

  it('TC-RANK-04: Filters leaderboard by Club ID with recalculated club positions', async () => {
    const clubId = 'club-joacaba-001';
    const res = await client.getLeaderboard('club', clubId);

    expect(res.ok).toBe(true);
    expect(res.entries.every((e) => e.clubId === clubId)).toBe(true);
  });

  it('TC-RANK-05: Returns pinned ranking position for the authenticated user', async () => {
    const p3 = FIXTURE_PLAYERS.player3;
    client.asMobile(await generateSessionToken(p3.id));

    const res = await client.getLeaderboard('city', 'Joaçaba');

    expect(res.ok).toBe(true);
    expect(res.currentUserRank).toBeDefined();
    expect(typeof res.currentUserRank).toBe('number');
    expect(res.currentUserRank).toBeGreaterThan(0);
  });
});
