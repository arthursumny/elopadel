import assert from 'node:assert/strict';
import postgres from 'postgres';
import { afterAll, beforeAll, it } from 'vitest';

const OPT_IN = 'ALLOW_PROFILE_EDIT_DB_INTEGRATION';
const URL_ENV = 'PROFILE_EDIT_TEST_DATABASE_URL';
const HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
let sql: ReturnType<typeof postgres>;
let fixtureUserId: string;
let fixtureClubIds: string[] = [];
let fixtureMatchIds: string[] = [];

function validatedUrl() {
  const url = process.env[URL_ENV];
  if (process.env[OPT_IN] !== '1' || !url || process.env.DATABASE_URL !== url || process.env.NODE_ENV === 'production') {
    throw new Error(`${OPT_IN}=1 and matching ${URL_ENV}/DATABASE_URL are required; production is refused.`);
  }
  const parsed = new URL(url);
  if (!HOSTS.has(parsed.hostname) || parsed.pathname.slice(1) !== 'elo_padel_ui_audit_20261020' || parsed.port !== '15432') {
    throw new Error('Refusing DB integration target; expected loopback port 15432 and exact isolated database elo_padel_ui_audit_20261020.');
  }
  return url;
}

beforeAll(async () => {
  sql = postgres(validatedUrl(), { max: 4, prepare: false });
  const [database] = await sql<{ name: string }[]>`select current_database() as name`;
  assert.equal(database.name, 'elo_padel_ui_audit_20261020');
});

afterAll(async () => {
  if (!sql) return;
  if (fixtureUserId) {
    await sql`delete from match_participants where user_id = ${fixtureUserId}`;
    await sql`delete from match_searches where user_id = ${fixtureUserId}`;
    await sql`delete from matches where id in ${sql(fixtureMatchIds)}`;
    await sql`delete from ratings where user_id = ${fixtureUserId}`;
    await sql`delete from rank_states where user_id = ${fixtureUserId}`;
    await sql`delete from club_memberships where user_id = ${fixtureUserId}`;
    await sql`delete from users where id = ${fixtureUserId}`;
  }
  if (fixtureClubIds.length) await sql`delete from clubs where id in ${sql(fixtureClubIds)}`;
  await sql.end();
});

it('persists profile/membership policy under concurrency without touching MMR or history', async () => {
  validatedUrl();
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clubRows = await sql<{ id: string }[]>`
    insert into clubs (name, city, state, country, is_active) values
      (${`Profile Test A ${suffix}`}, ${`City ${suffix}`}, 'ZZ', 'Brasil', true),
      (${`Profile Test B ${suffix}`}, ${`City ${suffix}`}, 'ZZ', 'Brasil', true),
      (${`Profile Test C ${suffix}`}, ${`City ${suffix}`}, 'ZZ', 'Brasil', true),
      (${`Profile Test D ${suffix}`}, ${`City ${suffix}`}, 'ZZ', 'Brasil', true),
      (${`Profile Test Inactive ${suffix}`}, ${`City ${suffix}`}, 'ZZ', 'Brasil', false),
      (${`Profile Test Other State ${suffix}`}, ${`City ${suffix}`}, 'YY', 'Brasil', true)
    returning id
  `;
  fixtureClubIds = clubRows.map(({ id }) => id);
  const [clubA, clubB, clubC, clubD, inactiveClub, otherStateClub] = fixtureClubIds;
  const [user] = await sql<{ id: string }[]>`
    insert into users (display_name, handle, city, state, country, role, is_active)
    values (${`Profile Fixture ${suffix}`}, ${`@profile${suffix}`}, ${`City ${suffix}`}, 'ZZ', 'Brasil', 'player', true) returning id
  `;
  fixtureUserId = user.id;
  await sql`insert into ratings (user_id, rating, deviation, matches) values (${user.id}, 1712.5, 62, 11)`;
  await sql`insert into rank_states (user_id, tier, points, peak_tier) values (${user.id}, '4ª II', 42, '4ª I')`;
  const [match] = await sql<{ id: string }[]>`insert into matches (mode, status, winner, sets) values ('ranked', 'completed', 'A', '[{"a":6,"b":3}]') returning id`;
  fixtureMatchIds = [match.id];
  await sql`insert into match_participants (match_id, user_id, team, confirmation, attendance) values (${match.id}, ${user.id}, 'A', 'confirmed', 'present')`;
  await sql`insert into match_searches (user_id, preferred_dates, time_from, time_to, city, status) values (${user.id}, '["2030-01-01"]', '10:00', '12:00', ${`City ${suffix}`}, 'searching')`;
  await sql`insert into club_memberships (user_id, club_id, status, is_primary) values (${user.id}, ${clubA}, 'approved', true), (${user.id}, ${clubB}, 'rejected', false), (${user.id}, ${clubD}, 'approved', false)`;

  const initialRatings = await sql`select to_jsonb(r) from ratings r where user_id = ${user.id}`;
  const initialRanks = await sql`select to_jsonb(r) from rank_states r where user_id = ${user.id}`;
  const initialMatches = await sql`select to_jsonb(m) from matches m where id = ${match.id}`;
  const initialParticipants = await sql`select to_jsonb(p) from match_participants p where match_id = ${match.id} and user_id = ${user.id}`;
  const initialSearches = await sql`select to_jsonb(s) from match_searches s where user_id = ${user.id}`;
  const { saveProfileEdit, loadProfileEdit } = await import('../../src/lib/profile-edit.ts');
  const { loadLeaderboard } = await import('../../src/lib/db/queries.ts');
  const input = (clubId: string | null, city = `City ${suffix}`, state = 'ZZ') => ({ city, state, country: 'Brasil', clubId });

  await assert.rejects(saveProfileEdit(user.id, input(null, `Missing ${suffix}`)), { code: 'INVALID_LOCATION' });
  await assert.rejects(saveProfileEdit(user.id, input(inactiveClub)), { code: 'INVALID_CLUB' });
  await assert.rejects(saveProfileEdit(user.id, input(otherStateClub)), { code: 'INVALID_CLUB' });

  await saveProfileEdit(user.id, input(clubB)); // Reopens rejected request, retains approved primary.
  const reopened = await sql<{ id: string; status: string }[]>`select id, status from club_memberships where user_id = ${user.id} and club_id = ${clubB}`;
  assert.equal(reopened.length, 1);
  assert.equal(reopened[0]!.status, 'pending');
  const pendingId = reopened[0]!.id;
  await saveProfileEdit(user.id, input(clubB)); // Idempotent reuse.
  assert.equal((await sql`select id from club_memberships where user_id = ${user.id} and club_id = ${clubB}`)[0]!.id, pendingId);
  assert.equal((await sql`select count(*)::int n from club_memberships where user_id = ${user.id} and status = 'pending'`)[0]!.n, 1);
  assert.equal((await sql`select is_primary from club_memberships where user_id = ${user.id} and club_id = ${clubA}`)[0]!.is_primary, true);

  await Promise.all([saveProfileEdit(user.id, input(clubC)), saveProfileEdit(user.id, input(clubB))]);
  const pendingAfterRace = await sql<{ n: number }[]>`select count(*)::int n from club_memberships where user_id = ${user.id} and status = 'pending'`;
  const primariesAfterRace = await sql<{ n: number }[]>`select count(*)::int n from club_memberships where user_id = ${user.id} and status = 'approved' and is_primary`;
  assert.ok(pendingAfterRace[0]!.n <= 1);
  assert.equal(primariesAfterRace[0]!.n, 1);

  await saveProfileEdit(user.id, input(null));
  assert.equal((await sql`select count(*)::int n from club_memberships where user_id = ${user.id} and status = 'pending'`)[0]!.n, 0);
  assert.equal((await sql`select count(*)::int n from club_memberships where user_id = ${user.id} and status = 'approved'`)[0]!.n, 2);
  assert.equal((await sql`select count(*)::int n from club_memberships where user_id = ${user.id} and status = 'approved' and is_primary`)[0]!.n, 0);
  assert.equal((await loadLeaderboard()).find((entry) => entry.handle === `@profile${suffix}`)?.club, 'Sem clube', 'leaderboard must not fall back to an approved non-primary club');
  const switched = await saveProfileEdit(user.id, input(clubD));
  assert.equal(switched.clubStatus, 'approved');
  assert.equal(switched.currentClub?.id, clubD);
  assert.equal((await sql`select is_primary from club_memberships where user_id = ${user.id} and club_id = ${clubA}`)[0]!.is_primary, false);
  assert.equal((await sql`select is_primary from club_memberships where user_id = ${user.id} and club_id = ${clubD}`)[0]!.is_primary, true);
  assert.equal((await loadProfileEdit(user.id)).clubId, clubD);
  assert.equal((await loadLeaderboard()).find((entry) => entry.handle === `@profile${suffix}`)?.club, `Profile Test D ${suffix}`);

  const finalRatings = await sql`select to_jsonb(r) from ratings r where user_id = ${user.id}`;
  const finalRanks = await sql`select to_jsonb(r) from rank_states r where user_id = ${user.id}`;
  assert.deepEqual(finalRatings, initialRatings, 'profile editing must not change rating records');
  assert.deepEqual(finalRanks, initialRanks, 'profile editing must not change rank-state records');
  assert.deepEqual(await sql`select to_jsonb(m) from matches m where id = ${match.id}`, initialMatches, 'profile editing must not change match history');
  assert.deepEqual(await sql`select to_jsonb(p) from match_participants p where match_id = ${match.id} and user_id = ${user.id}`, initialParticipants, 'profile editing must not change participant history');
  assert.deepEqual(await sql`select to_jsonb(s) from match_searches s where user_id = ${user.id}`, initialSearches, 'profile editing must not change saved search records');
});
