import { describe, expect, it } from 'vitest';
import { areTeamSidesCompatible, buildTeamAssignments, findAvailabilityOverlap, findMatchmakingGroup, getRatingTolerance, type MatchmakingParty } from './matchmaking';

function party(id: string, memberIds: string[], dates = ['2026-09-01'], from = '18:00', to = '20:00'): MatchmakingParty {
  return { id, partyType: memberIds.length === 2 ? 'duo' : 'solo', dates, from, to, city: 'Joaçaba', state: 'SC', country: 'Brasil', clubId: 'club-1', tier: '4ª', mode: 'ranked', createdAt: new Date(`2026-08-29T${String(10 + Number(id.slice(-1) || 0)).padStart(2, '0')}:00:00Z`), members: memberIds.map((memberId, index) => ({ id: memberId, rating: 1500 + index * 20, tier: '4ª II' })) };
}

describe('matchmaking availability', () => {
  const now = new Date('2026-08-29T09:00:00Z');

  it('finds the common date and time window', () => {
    expect(findAvailabilityOverlap([party('p1', ['a']), party('p2', ['b'], ['2026-09-01', '2026-09-02'], '19:00', '21:00')])).toMatchObject({ date: '2026-09-01', from: '19:00', to: '20:00', clubId: 'club-1' });
  });

  it('requires enough common time for the configured match duration', () => {
    expect(findAvailabilityOverlap([party('p1', ['a'], ['2026-09-01'], '18:00', '19:00'), party('p2', ['b'], ['2026-09-01'], '18:30', '20:00')], 90)).toBeNull();
    expect(findAvailabilityOverlap([party('p1', ['a']), party('p2', ['b'])], 90)).not.toBeNull();
  });

  it('moves a same-day start forward when the beginning of the overlap has passed', () => {
    const overlap = findAvailabilityOverlap([party('p1', ['a']), party('p2', ['b'])], 90, new Date('2026-09-01T21:00:00Z'));
    expect(overlap).toMatchObject({ date: '2026-09-01', from: '18:01', to: '20:00' });
  });

  it('groups a duo with two solo players', () => {
    const group = findMatchmakingGroup([party('p1', ['a', 'b']), party('p2', ['c']), party('p3', ['d'])], { now });
    expect(group?.map((item) => item.id)).toEqual(['p1', 'p2', 'p3']);
    expect(buildTeamAssignments(group ?? [])).toEqual({ a: 'A', b: 'A', c: 'B', d: 'B' });
  });

  it('does not group parties without common availability', () => {
    expect(findMatchmakingGroup([party('p1', ['a']), party('p2', ['b']), party('p3', ['c']), party('p4', ['d'], ['2026-09-02'])], { now })).toBeNull();
  });

  it('requires a duo to be able to occupy both sides of the court', () => {
    const leftOnly = { ...party('p1', ['a', 'b']), members: party('p1', ['a', 'b']).members.map((member) => ({ ...member, sidePreference: 'left' as const })) };
    const flexible = { ...party('p2', ['c', 'd']), members: party('p2', ['c', 'd']).members.map((member) => ({ ...member, sidePreference: 'any' as const })) };

    expect(areTeamSidesCompatible(leftOnly.members)).toBe(false);
    expect(buildTeamAssignments([leftOnly, flexible])).toEqual({});
    expect(findMatchmakingGroup([leftOnly, flexible], { now })).toBeNull();
  });
});

describe('progressive matchmaking', () => {
  const now = new Date('2026-08-29T08:00:00Z');
  const withAge = (players: MatchmakingParty[], minutes: number) => players.map((item) => ({ ...item, createdAt: new Date(now.getTime() - minutes * 60_000) }));
  const solos = (ratings: number[], city = 'Joaçaba') => ratings.map((rating, index) => ({
    ...party(`p${index + 1}`, [`u${index + 1}`]), city,
    members: [{ id: `u${index + 1}`, rating, tier: '4ª II' }],
  }));

  it('uses the 300/450/600 thresholds at 0, 2 and 5 minutes and caps at 600', () => {
    const fourHundredApart = solos([1400, 1500, 1600, 1800]);
    expect(getRatingTolerance(withAge(fourHundredApart, 0), now)).toBe(300);
    expect(findMatchmakingGroup(withAge(fourHundredApart, 0), { now })).toBeNull();
    expect(getRatingTolerance(withAge(fourHundredApart, 2), now)).toBe(450);
    expect(findMatchmakingGroup(withAge(fourHundredApart, 2), { now })?.length).toBe(4);

    const sixHundredApart = solos([1400, 1500, 1600, 2000]);
    expect(getRatingTolerance(withAge(sixHundredApart, 5), now)).toBe(600);
    expect(findMatchmakingGroup(withAge(sixHundredApart, 5), { now })?.length).toBe(4);
    expect(getRatingTolerance(withAge(sixHundredApart, 60), now)).toBe(600);
    expect(findMatchmakingGroup(withAge(solos([1400, 1500, 1600, 2001]), 60), { now })).toBeNull();
  });

  it('lets the newest party limit an expanded rating band', () => {
    const parties = withAge(solos([1400, 1500, 1600, 1800]), 5);
    parties[3] = { ...parties[3]!, createdAt: new Date(now.getTime() - 60_000) };
    expect(getRatingTolerance(parties, now)).toBe(300);
    expect(findMatchmakingGroup(parties, { now })).toBeNull();
  });

  it('never crosses cities, even when the rating and availability otherwise match', () => {
    const parties = withAge(solos([1500, 1520, 1540, 1560]), 0);
    parties[3] = { ...parties[3]!, city: 'Luzerna' };
    expect(findMatchmakingGroup(parties, { now })).toBeNull();
  });

  it('never crosses UF and excludes legacy parties without canonical locality from ranked matching', () => {
    const parties = withAge(solos([1500, 1520, 1540, 1560]), 0);
    parties[3] = { ...parties[3]!, state: 'RS' };
    expect(findMatchmakingGroup(parties, { now })).toBeNull();
    expect(findMatchmakingGroup(parties.map(({ state: _state, country: _country, ...legacy }) => legacy), { now })).toBeNull();
  });

  it('continues searching independent location partitions when an earlier partition has no match', () => {
    const stalePartition = withAge(solos([1500, 1510, 1520, 1530]), 0).map((item, index) => ({
      ...item,
      dates: [`2026-09-0${index + 1}`],
    }));
    const eligiblePartition = withAge(solos([1500, 1510, 1520, 1530], 'Chapecó'), 0);
    const group = findMatchmakingGroup([...stalePartition, ...eligiblePartition], { now });
    expect(group?.every((item) => item.city === 'Chapecó')).toBe(true);
  });

  it('finds a compatible group after more than five thousand earlier combinations are impossible', () => {
    const unavailableParties = Array.from({ length: 32 }, (_, index) => ({
      ...party(`stale-${index}`, [`stale-user-${index}`]),
      createdAt: new Date(now.getTime() - 10 * 60_000),
      dates: [new Date(Date.UTC(2026, 9, 10 + index)).toISOString().slice(0, 10)],
    }));
    const eligibleDate = '2026-12-15';
    const eligibleParties = Array.from({ length: 4 }, (_, index) => ({
      ...party(`eligible-${index}`, [`eligible-user-${index}`], [eligibleDate]),
      createdAt: new Date(now.getTime() - 10 * 60_000),
    }));

    const group = findMatchmakingGroup([...unavailableParties, ...eligibleParties], { now });
    expect(group?.map((item) => item.id)).toEqual(['eligible-0', 'eligible-1', 'eligible-2', 'eligible-3']);
  });

  it('prefers a smaller rating gap over an earlier, wider eligible combination', () => {
    const parties = withAge(solos([1500, 1500, 1500, 1900, 2200, 2250, 2300, 2500]), 5);
    const group = findMatchmakingGroup(parties, { now });
    expect(group?.flatMap((item) => item.members.map((member) => member.id))).toEqual(['u5', 'u6', 'u7', 'u8']);
  });

  it('keeps a fixed duo together when forming teams', () => {
    const duo = party('p1', ['a', 'b']);
    const solosParties = [party('p2', ['c']), party('p3', ['d'])];
    const assignments = buildTeamAssignments([duo, ...solosParties]);
    expect(assignments.a).toBe(assignments.b);
    expect(assignments.c).toBe(assignments.d);
    expect(assignments.a).not.toBe(assignments.c);
  });
});
