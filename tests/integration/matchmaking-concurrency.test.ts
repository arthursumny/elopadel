import assert from 'node:assert/strict';
import postgres from 'postgres';
import { it } from 'vitest';

const OPT_IN = 'ALLOW_MATCHMAKING_DB_INTEGRATION';
const URL_ENV = 'MATCHMAKING_TEST_DATABASE_URL';
const enabled = process.env[OPT_IN] === '1';
const HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function validatedUrl() {
  const url = process.env[URL_ENV];
  if (!enabled || !url || process.env.DATABASE_URL !== url || process.env.NODE_ENV === 'production') {
    throw new Error(`${OPT_IN}=1 and matching ${URL_ENV}/DATABASE_URL are required; production is refused.`);
  }
  const parsed = new URL(url);
  if (!HOSTS.has(parsed.hostname) || parsed.pathname.slice(1) !== 'elo_padel_matchmaking_test_20261026' || parsed.port !== '15433') {
    throw new Error('Refusing DB integration target; expected loopback port 15433 and exact isolated database elo_padel_matchmaking_test_20261026.');
  }
  return url;
}

it.skipIf(!enabled)('serializes four simultaneous searches into one match without duplicate players', async () => {
  const url = validatedUrl();
  const sql = postgres(url, { max: 5, prepare: false });
  let userIds: string[] = [];
  try {
    const [database] = await sql<{ name: string }[]>`select current_database() as name`;
    assert.equal(database!.name, 'elo_padel_matchmaking_test_20261026');

    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const users = await sql<{ id: string }[]>`
      insert into users (display_name, handle, city, state, country, role, is_active)
      values
        (${`Match Fixture A ${suffix}`}, ${`@mka${suffix}`}, ${`Match City ${suffix}`}, 'ZZ', 'Brasil', 'player', true),
        (${`Match Fixture B ${suffix}`}, ${`@mkb${suffix}`}, ${`Match City ${suffix}`}, 'ZZ', 'Brasil', 'player', true),
        (${`Match Fixture C ${suffix}`}, ${`@mkc${suffix}`}, ${`Match City ${suffix}`}, 'ZZ', 'Brasil', 'player', true),
        (${`Match Fixture D ${suffix}`}, ${`@mkd${suffix}`}, ${`Match City ${suffix}`}, 'ZZ', 'Brasil', 'player', true)
      returning id
    `;
    userIds = users.map(({ id }) => id);
    await sql`insert into ratings (user_id, rating, deviation, matches) select id, 1500, 50, 0 from users where id in ${sql(userIds)}`;
    await sql`insert into rank_states (user_id, tier, points, peak_tier) select id, '4ª II', 0, '4ª II' from users where id in ${sql(userIds)}`;

    // Import only after validating the dedicated target: db/index captures DATABASE_URL at module load.
    const { createMatchSearch } = await import('../../src/lib/db/matchmaking.ts');
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const results = await Promise.all(userIds.map((userId) => createMatchSearch({
      userId,
      partyType: 'solo',
      mode: 'friendly',
      dates: [date],
      from: '18:00',
      to: '21:00',
      city: `Match City ${suffix}`,
      state: 'SC',
      country: 'Brasil',
      timezoneOffset: 180,
      sidePreference: 'any',
    })));

    assert.equal(results.filter((result) => 'matched' in result && result.matched).length, 1);
    const matched = await sql<{ n: number }[]>`
      select count(*)::int as n from match_searches
      where user_id in ${sql(userIds)} and status = 'matched'
    `;
    assert.equal(matched[0]!.n, 4);
    const playerMatches = await sql<{ max_count: number; distinct_matches: number }[]>`
      select max(n)::int as max_count, count(*)::int as distinct_matches from (
        select mp.user_id, count(distinct mp.match_id)::int as n
        from match_participants mp where mp.user_id in ${sql(userIds)}
        group by mp.user_id
      ) participant_match_counts
    `;
    assert.equal(playerMatches[0]!.max_count, 1);
    assert.equal(playerMatches[0]!.distinct_matches, 4);
  } finally {
    if (userIds.length) {
      const participantMatches = await sql<{ match_id: string }[]>`select distinct match_id from match_participants where user_id in ${sql(userIds)}`;
      const matchIds = participantMatches.map(({ match_id }) => match_id);
      const rooms = matchIds.length ? await sql<{ room_id: string }[]>`select distinct room_id from matches where id in ${sql(matchIds)}` : [];
      const roomIds = rooms.map(({ room_id }) => room_id);
      await sql`delete from notifications where user_id in ${sql(userIds)}`;
      if (matchIds.length) await sql`delete from match_participants where match_id in ${sql(matchIds)}`;
      if (roomIds.length) await sql`delete from room_participants where room_id in ${sql(roomIds)}`;
      if (matchIds.length) await sql`delete from matches where id in ${sql(matchIds)}`;
      await sql`delete from match_searches where user_id in ${sql(userIds)}`;
      if (roomIds.length) await sql`delete from match_rooms where id in ${sql(roomIds)}`;
      await sql`delete from ratings where user_id in ${sql(userIds)}`;
      await sql`delete from rank_states where user_id in ${sql(userIds)}`;
      await sql`delete from users where id in ${sql(userIds)}`;
    }
    await sql.end();
  }
});

it.skipIf(!enabled)('maintenance reprocesses an already-waiting matchmaking queue', async () => {
  const sql = postgres(validatedUrl(), { max: 4, prepare: false });
  let userIds: string[] = [];
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const city = `Maintenance Match City ${suffix}`;
    const users = await sql<{ id: string }[]>`
      insert into users (display_name, handle, city, state, country, role, is_active)
      values
        (${`Queue Fixture A ${suffix}`}, ${`@qka${suffix}`}, ${city}, 'ZZ', 'Brasil', 'player', true),
        (${`Queue Fixture B ${suffix}`}, ${`@qkb${suffix}`}, ${city}, 'ZZ', 'Brasil', 'player', true),
        (${`Queue Fixture C ${suffix}`}, ${`@qkc${suffix}`}, ${city}, 'ZZ', 'Brasil', 'player', true),
        (${`Queue Fixture D ${suffix}`}, ${`@qkd${suffix}`}, ${city}, 'ZZ', 'Brasil', 'player', true)
      returning id
    `;
    userIds = users.map(({ id }) => id);
    await sql`insert into ratings (user_id, rating, deviation, matches) select id, 1500, 50, 0 from users where id in ${sql(userIds)}`;
    await sql`insert into rank_states (user_id, tier, points, peak_tier) select id, '4ª II', 0, '4ª II' from users where id in ${sql(userIds)}`;
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await sql`
      insert into match_searches (user_id, party_type, mode, status, preferred_dates, time_from, time_to, city, state, country, timezone_offset, side_preference, tier)
      select id, 'solo', 'friendly', 'searching', ${sql.json([date])}, '18:00', '21:00', ${city}, 'SC', 'Brasil', 180, 'any', '4ª'
      from users where id in ${sql(userIds)}
    `;

    const { runMaintenance } = await import('../../src/lib/db/maintenance.ts');
    const maintenance = await runMaintenance();
    assert.equal(maintenance.matchmaking.processedMatches, 1);
    const matched = await sql<{ n: number }[]>`select count(*)::int as n from match_searches where user_id in ${sql(userIds)} and status = 'matched'`;
    assert.equal(matched[0]!.n, 4);
  } finally {
    if (userIds.length) {
      const matchIdsRows = await sql<{ match_id: string }[]>`select distinct match_id from match_participants where user_id in ${sql(userIds)}`;
      const matchIds = matchIdsRows.map(({ match_id }) => match_id);
      const rooms = matchIds.length ? await sql<{ room_id: string }[]>`select distinct room_id from matches where id in ${sql(matchIds)}` : [];
      const roomIds = rooms.map(({ room_id }) => room_id);
      await sql`delete from notifications where user_id in ${sql(userIds)}`;
      if (matchIds.length) await sql`delete from match_participants where match_id in ${sql(matchIds)}`;
      if (roomIds.length) await sql`delete from room_participants where room_id in ${sql(roomIds)}`;
      if (matchIds.length) await sql`delete from matches where id in ${sql(matchIds)}`;
      await sql`delete from match_searches where user_id in ${sql(userIds)}`;
      if (roomIds.length) await sql`delete from match_rooms where id in ${sql(roomIds)}`;
      await sql`delete from ratings where user_id in ${sql(userIds)}`;
      await sql`delete from rank_states where user_id in ${sql(userIds)}`;
      await sql`delete from users where id in ${sql(userIds)}`;
    }
    await sql.end();
  }
});

it.skipIf(!enabled)('prevents one player from opening two concurrent searches', async () => {
  const sql = postgres(validatedUrl(), { max: 4, prepare: false });
  let userIds: string[] = [];
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const [user] = await sql<{ id: string }[]>`
      insert into users (display_name, handle, city, state, country, role, is_active)
      values (${`Duplicate Search ${suffix}`}, ${`@dps${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true)
      returning id
    `;
    userIds = [user!.id];
    await sql`insert into ratings (user_id, rating, deviation, matches) values (${user!.id}, 1500, 50, 0)`;
    await sql`insert into rank_states (user_id, tier, points, peak_tier) values (${user!.id}, '4ª II', 0, '4ª II')`;

    const { createMatchSearch } = await import('../../src/lib/db/matchmaking.ts');
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const input = {
      userId: user!.id,
      partyType: 'solo' as const,
      mode: 'friendly' as const,
      dates: [date],
      from: '18:00',
      to: '21:00',
      city: 'Joaçaba',
      state: 'SC',
      country: 'Brasil',
      timezoneOffset: 180,
      sidePreference: 'any' as const,
    };
    const results = await Promise.all([createMatchSearch(input), createMatchSearch(input)]);
    assert.equal(results.filter((result) => 'searchId' in result).length, 1);
    assert.equal(results.filter((result) => 'error' in result).length, 1);
    const active = await sql<{ count: number }[]>`
      select count(*)::int as count from match_searches where user_id = ${user!.id} and status in ('lobby', 'searching', 'pending-partner')
    `;
    assert.equal(active[0]!.count, 1);
  } finally {
    if (userIds.length) {
      await sql`delete from notifications where user_id in ${sql(userIds)}`;
      await sql`delete from match_searches where user_id in ${sql(userIds)} or partner_id in ${sql(userIds)}`;
      await sql`delete from ratings where user_id in ${sql(userIds)}`;
      await sql`delete from rank_states where user_id in ${sql(userIds)}`;
      await sql`delete from users where id in ${sql(userIds)}`;
    }
    await sql.end();
  }
});

it.skipIf(!enabled)('forms two city-isolated matches for eight players without requiring a selected club', async () => {
  const sql = postgres(validatedUrl(), { max: 6, prepare: false });
  let userIds: string[] = [];
  let clubIds: string[] = [];
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const clubRows = await sql<{ id: string }[]>`
      insert into clubs (name, city, state, country, is_active)
      values
        (${`Joaçaba Club A ${suffix}`}, 'Joaçaba', 'SC', 'Brasil', true),
        (${`Joaçaba Club B ${suffix}`}, 'Joaçaba', 'SC', 'Brasil', true)
      returning id
    `;
    clubIds = clubRows.map(({ id }) => id);
    const users = await sql<{ id: string }[]>`
      insert into users (display_name, handle, city, state, country, role, is_active)
      values
        (${`Joaçaba A ${suffix}`}, ${`@ja${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Joaçaba B ${suffix}`}, ${`@jb${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Joaçaba C ${suffix}`}, ${`@jc${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Joaçaba D ${suffix}`}, ${`@jd${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Chapecó A ${suffix}`}, ${`@ca${suffix}`}, 'Chapecó', 'SC', 'Brasil', 'player', true),
        (${`Chapecó B ${suffix}`}, ${`@cb${suffix}`}, 'Chapecó', 'SC', 'Brasil', 'player', true),
        (${`Chapecó C ${suffix}`}, ${`@cc${suffix}`}, 'Chapecó', 'SC', 'Brasil', 'player', true),
        (${`Chapecó D ${suffix}`}, ${`@cd${suffix}`}, 'Chapecó', 'SC', 'Brasil', 'player', true)
      returning id
    `;
    userIds = users.map(({ id }) => id);
    await sql`insert into ratings (user_id, rating, deviation, matches) select id, 1500, 50, 0 from users where id in ${sql(userIds)}`;
    await sql`insert into rank_states (user_id, tier, points, peak_tier) select id, '4ª II', 0, '4ª II' from users where id in ${sql(userIds)}`;

    const { createMatchSearch } = await import('../../src/lib/db/matchmaking.ts');
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await Promise.all(users.map((user, index) => createMatchSearch({
      userId: user.id,
      partyType: 'solo',
      mode: 'friendly',
      dates: [date],
      from: '18:00',
      to: '21:00',
      city: index < 4 ? 'Joaçaba' : 'Chapecó',
      state: 'SC',
      country: 'Brasil',
      timezoneOffset: 180,
      sidePreference: 'any',
    })));

    const matchesByCity = await sql<{ city: string; club_id: string | null; player_count: number; match_count: number }[]>`
      select min(search.city) as city, mr.club_id,
        count(distinct mp.user_id)::int as player_count,
        count(distinct m.id)::int as match_count
      from matches m
      join match_rooms mr on mr.id = m.room_id
      join match_participants mp on mp.match_id = m.id
      join match_searches search on search.room_id = mr.id
      where mp.user_id in ${sql(userIds)}
      group by m.id, mr.club_id
    `;
    assert.equal(matchesByCity.length, 2);
    assert.deepEqual(matchesByCity.map(({ city }) => city).sort(), ['Chapecó', 'Joaçaba']);
    assert.ok(matchesByCity.every((match) => match.player_count === 4 && match.club_id === null));
    const participation = await sql<{ distinct_matches: number; max_matches_per_player: number }[]>`
      select
        (select count(distinct match_id)::int from match_participants where user_id in ${sql(userIds)}) as distinct_matches,
        (select max(n)::int from (
          select user_id, count(distinct match_id)::int as n
          from match_participants where user_id in ${sql(userIds)} group by user_id
        ) counts) as max_matches_per_player
    `;
    assert.equal(participation[0]!.distinct_matches, 2);
    assert.equal(participation[0]!.max_matches_per_player, 1);
  } finally {
    if (userIds.length) {
      const participantMatches = await sql<{ match_id: string }[]>`select distinct match_id from match_participants where user_id in ${sql(userIds)}`;
      const matchIds = participantMatches.map(({ match_id }) => match_id);
      const rooms = matchIds.length ? await sql<{ room_id: string }[]>`select distinct room_id from matches where id in ${sql(matchIds)}` : [];
      const roomIds = rooms.map(({ room_id }) => room_id);
      await sql`delete from notifications where user_id in ${sql(userIds)}`;
      if (matchIds.length) await sql`delete from match_participants where match_id in ${sql(matchIds)}`;
      if (roomIds.length) await sql`delete from room_participants where room_id in ${sql(roomIds)}`;
      if (matchIds.length) await sql`delete from matches where id in ${sql(matchIds)}`;
      await sql`delete from match_searches where user_id in ${sql(userIds)} or partner_id in ${sql(userIds)}`;
      if (roomIds.length) await sql`delete from match_rooms where id in ${sql(roomIds)}`;
      await sql`delete from ratings where user_id in ${sql(userIds)}`;
      await sql`delete from rank_states where user_id in ${sql(userIds)}`;
      await sql`delete from users where id in ${sql(userIds)}`;
    }
    if (clubIds.length) await sql`delete from clubs where id in ${sql(clubIds)}`;
    await sql.end();
  }
});

it.skipIf(!enabled)('clears only stale duo readiness and restarts the search-age clock on activation', async () => {
  const sql = postgres(validatedUrl(), { max: 5, prepare: false });
  let userIds: string[] = [];
  try {
    const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const users = await sql<{ id: string }[]>`
      insert into users (display_name, handle, city, state, country, role, is_active)
      values
        (${`Duo Initiator ${suffix}`}, ${`@di${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Duo Partner ${suffix}`}, ${`@dp${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Solo A ${suffix}`}, ${`@sa${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true),
        (${`Solo B ${suffix}`}, ${`@sb${suffix}`}, 'Joaçaba', 'SC', 'Brasil', 'player', true)
      returning id
    `;
    userIds = users.map(({ id }) => id);
    const [initiator, partner, soloA, soloB] = userIds;
    await sql`
      insert into ratings (user_id, rating, deviation, matches)
      values (${initiator}, 1400, 50, 0), (${partner}, 1420, 50, 0), (${soloA}, 1600, 50, 0), (${soloB}, 1800, 50, 0)
    `;
    await sql`insert into rank_states (user_id, tier, points, peak_tier) select id, '4ª II', 0, '4ª II' from users where id in ${sql(userIds)}`;
    const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const old = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const expired = new Date(Date.now() - 60_000);
    const [duo] = await sql<{ id: string }[]>`
      insert into match_searches (
        user_id, partner_id, party_type, mode, status, preferred_dates, time_from, time_to,
        city, state, country, timezone_offset, side_preference, partner_side_preference,
        initiator_ready, partner_ready, initiator_location_expires_at, created_at, updated_at, tier
      ) values (
        ${initiator}, ${partner}, 'duo', 'ranked', 'lobby', ${sql.json([date])}, '18:00', '21:00',
        'Joaçaba', 'SC', 'Brasil', 180, 'any', 'any', true, false, ${expired}, ${old}, ${old}, '4ª'
      ) returning id
    `;
    await sql`
      insert into match_searches (
        user_id, party_type, mode, status, preferred_dates, time_from, time_to,
        city, state, country, timezone_offset, side_preference, tier, created_at, updated_at
      ) values
        (${soloA}, 'solo', 'ranked', 'searching', ${sql.json([date])}, '18:00', '21:00', 'Joaçaba', 'SC', 'Brasil', 180, 'any', '4ª', ${old}, ${old}),
        (${soloB}, 'solo', 'ranked', 'searching', ${sql.json([date])}, '18:00', '21:00', 'Joaçaba', 'SC', 'Brasil', 180, 'any', '4ª', ${old}, ${old})
    `;

    const { setMatchSearchReady } = await import('../../src/lib/db/matchmaking.ts');
    const freshLocation = { city: 'Joaçaba', state: 'SC', country: 'Brasil', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    const staleAttempt = await setMatchSearchReady(duo!.id, partner!, true, 'any', freshLocation);
    assert.deepEqual(staleAttempt, { blocked: 'location-expired' });
    const afterCleanup = await sql<{ initiator_ready: boolean; partner_ready: boolean; initiator_location_expires_at: Date | null; partner_location_expires_at: Date | null; status: string }[]>`
      select initiator_ready, partner_ready, initiator_location_expires_at, partner_location_expires_at, status
      from match_searches where id = ${duo!.id}
    `;
    assert.equal(afterCleanup[0]!.initiator_ready, false);
    assert.equal(afterCleanup[0]!.partner_ready, true);
    assert.equal(afterCleanup[0]!.initiator_location_expires_at, null);
    assert.ok(afterCleanup[0]!.partner_location_expires_at instanceof Date);
    assert.ok(afterCleanup[0]!.partner_location_expires_at!.getTime() > Date.now());
    assert.equal(afterCleanup[0]!.status, 'lobby');

    const activated = await setMatchSearchReady(duo!.id, initiator!, true, 'any', freshLocation);
    assert.equal(activated?.started, true);
    assert.equal(activated?.matched, false, 'the newly activated duo must use its fresh wait clock and stay within the 300-point band');
    const persisted = await sql<{ status: string; created_at: Date; updated_at: Date; initiator_location_expires_at: Date | null; partner_location_expires_at: Date | null }[]>`
      select status, created_at, updated_at, initiator_location_expires_at, partner_location_expires_at
      from match_searches where id = ${duo!.id}
    `;
    assert.equal(persisted[0]!.status, 'searching');
    assert.ok(persisted[0]!.created_at.getTime() < Date.now() - 60 * 60 * 1000);
    assert.ok(persisted[0]!.updated_at.getTime() > Date.now() - 60_000);
    assert.ok(persisted[0]!.initiator_location_expires_at!.getTime() > Date.now());
    assert.ok(persisted[0]!.partner_location_expires_at!.getTime() > Date.now());
  } finally {
    if (userIds.length) {
      const participantMatches = await sql<{ match_id: string }[]>`select distinct match_id from match_participants where user_id in ${sql(userIds)}`;
      const matchIds = participantMatches.map(({ match_id }) => match_id);
      const rooms = matchIds.length ? await sql<{ room_id: string }[]>`select distinct room_id from matches where id in ${sql(matchIds)}` : [];
      const roomIds = rooms.map(({ room_id }) => room_id);
      await sql`delete from notifications where user_id in ${sql(userIds)}`;
      if (matchIds.length) await sql`delete from match_participants where match_id in ${sql(matchIds)}`;
      if (roomIds.length) await sql`delete from room_participants where room_id in ${sql(roomIds)}`;
      if (matchIds.length) await sql`delete from matches where id in ${sql(matchIds)}`;
      await sql`delete from match_searches where user_id in ${sql(userIds)} or partner_id in ${sql(userIds)}`;
      if (roomIds.length) await sql`delete from match_rooms where id in ${sql(roomIds)}`;
      await sql`delete from ratings where user_id in ${sql(userIds)}`;
      await sql`delete from rank_states where user_id in ${sql(userIds)}`;
      await sql`delete from users where id in ${sql(userIds)}`;
    }
    await sql.end();
  }
});
