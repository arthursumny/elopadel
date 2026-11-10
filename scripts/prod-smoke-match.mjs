/**
 * Smoke test E2E de uma partida FRIENDLY contra ambiente REMOTO (produção),
 * usando as 4 contas de teste @teste1..@teste4.
 *
 * ATENÇÃO: Esta é uma ferramenta de smoke de produção e EXIGE DATABASE_URL configurada.
 * A conexão direta ao banco via pacote 'postgres' é necessária para sincronizar os
 * horários da quadra (janela de check-in e de envio de resultado) sem depender de 'docker exec'.
 *
 * Diferenças em relação ao teste local (scripts/local-e2e-match.mjs):
 * (1) sql() usa o pacote 'postgres' e process.env.DATABASE_URL (encerra com await sql.end());
 * (2) Aceita URL base como 1º argumento (default: http://127.0.0.1:3100) e flag opcional --cleanup
 *     (ou --cleanup=users para remover também credenciais, ratings, rank_states e users);
 * (3) Não trunca a tabela inteira: remove apenas registros ligados às 4 contas @teste1..@teste4;
 * (4) Mantém as mensagens em português e o mesmo resumo final.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." node scripts/prod-smoke-match.mjs [baseUrl]
 *   DATABASE_URL="postgresql://..." node scripts/prod-smoke-match.mjs [baseUrl] --dispute
 *   DATABASE_URL="postgresql://..." node scripts/prod-smoke-match.mjs [baseUrl] --cleanup
 *   DATABASE_URL="postgresql://..." node scripts/prod-smoke-match.mjs [baseUrl] --cleanup=users
 */
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  console.error('ERRO: A variável de ambiente DATABASE_URL é obrigatória para o smoke de produção.');
  process.exit(1);
}

const args = process.argv.slice(2);
const BASE = args.find((arg) => !arg.startsWith('--')) ?? 'http://127.0.0.1:3100';
const isCleanupUsers = args.includes('--cleanup=users');
const isCleanupOnly = args.includes('--cleanup') || isCleanupUsers;
const dispute = args.includes('--dispute');

const PASSWORD = process.env.SMOKE_PASSWORD ?? process.env.LOCAL_SEED_PASSWORD ?? 'elopadel123';
const TEST_HANDLES = ['@teste1', '@teste2', '@teste3', '@teste4'];
const USERS = [
  { handle: '@teste1', email: 'teste1@elopadel.local', side: 'left' },
  { handle: '@teste2', email: 'teste2@elopadel.local', side: 'left' },
  { handle: '@teste3', email: 'teste3@elopadel.local', side: 'right' },
  { handle: '@teste4', email: 'teste4@elopadel.local', side: 'right' },
];
const TEST_EMAILS = USERS.map((u) => u.email);

const client = postgres(process.env.DATABASE_URL, { prepare: false });

async function sql(stringsOrQuery, ...values) {
  let rows;
  if (Array.isArray(stringsOrQuery) && stringsOrQuery.raw) {
    rows = await client(stringsOrQuery, ...values);
  } else {
    rows = await client.unsafe(stringsOrQuery);
  }
  if (!rows || rows.length === 0) return '';
  return rows.map((r) => Object.values(r).join('|')).join('\n');
}

sql.unsafe = (query, queryArgs) => client.unsafe(query, queryArgs);
sql.end = (options) => client.end(options);
sql.client = client;

async function cleanupTestData({ deleteUsers = false } = {}) {
  const byTable = {
    rating_events: 0,
    match_participants: 0,
    matches: 0,
    match_searches: 0,
    room_invitations: 0,
    room_participants: 0,
    match_rooms: 0,
    notifications: 0,
    season_stats: 0,
  };

  if (deleteUsers) {
    Object.assign(byTable, {
      email_credentials: 0,
      ratings: 0,
      rank_states: 0,
      auth_tokens: 0,
      player_session_versions: 0,
      device_push_tokens: 0,
      club_memberships: 0,
      friendships: 0,
      audit_logs: 0,
      users: 0,
    });
  }

  // 1. Encontra os IDs dos usuários de teste
  const userRows = await client`
    SELECT id, handle FROM users
    WHERE handle = ANY(${TEST_HANDLES}) OR email = ANY(${TEST_EMAILS})
  `;
  const userIds = userRows.map((r) => r.id);

  if (userIds.length === 0) {
    return { byTable, total: 0, userIds: [] };
  }

  // 2. Encontra partidas vinculadas a esses usuários
  const matchRows = await client`
    SELECT DISTINCT id FROM matches
    WHERE result_submitted_by = ANY(${userIds})
       OR id IN (SELECT match_id FROM match_participants WHERE user_id = ANY(${userIds}))
       OR room_id IN (SELECT id FROM match_rooms WHERE host_id = ANY(${userIds}))
  `;
  const matchIds = matchRows.map((r) => r.id);

  // 3. Encontra salas vinculadas a esses usuários e partidas
  const roomRows = await client`
    SELECT DISTINCT id FROM match_rooms
    WHERE host_id = ANY(${userIds})
       OR id IN (SELECT room_id FROM room_participants WHERE user_id = ANY(${userIds}))
       OR id IN (SELECT room_id FROM match_searches WHERE (user_id = ANY(${userIds}) OR partner_id = ANY(${userIds})) AND room_id IS NOT NULL)
       ${matchIds.length > 0 ? client`OR id IN (SELECT room_id FROM matches WHERE id = ANY(${matchIds}))` : client``}
  `;
  const roomIds = roomRows.map((r) => r.id);

  // Se houver mais partidas referenciando essas salas, inclui-as
  if (roomIds.length > 0) {
    const extraMatches = await client`
      SELECT DISTINCT id FROM matches WHERE room_id = ANY(${roomIds})
    `;
    for (const r of extraMatches) {
      if (!matchIds.includes(r.id)) matchIds.push(r.id);
    }
  }

  // Deleção respeitando chaves estrangeiras:
  const resRatingEvents = await client`
    DELETE FROM rating_events
    WHERE user_id = ANY(${userIds})
      ${matchIds.length > 0 ? client`OR match_id = ANY(${matchIds})` : client``}
  `;
  byTable.rating_events = resRatingEvents.count;

  const resMatchParticipants = await client`
    DELETE FROM match_participants
    WHERE user_id = ANY(${userIds})
      ${matchIds.length > 0 ? client`OR match_id = ANY(${matchIds})` : client``}
  `;
  byTable.match_participants = resMatchParticipants.count;

  if (matchIds.length > 0) {
    const resMatches = await client`DELETE FROM matches WHERE id = ANY(${matchIds})`;
    byTable.matches = resMatches.count;
  }

  const resMatchSearches = await client`
    DELETE FROM match_searches
    WHERE user_id = ANY(${userIds})
       OR partner_id = ANY(${userIds})
       ${roomIds.length > 0 ? client`OR room_id = ANY(${roomIds})` : client``}
  `;
  byTable.match_searches = resMatchSearches.count;

  try {
    const resInvites = await client`
      DELETE FROM room_invitations
      WHERE inviter_id = ANY(${userIds})
         OR invitee_id = ANY(${userIds})
         ${roomIds.length > 0 ? client`OR room_id = ANY(${roomIds})` : client``}
    `;
    byTable.room_invitations = resInvites.count;
  } catch {}

  try {
    const resRoomParticipants = await client`
      DELETE FROM room_participants
      WHERE user_id = ANY(${userIds})
         ${roomIds.length > 0 ? client`OR room_id = ANY(${roomIds})` : client``}
    `;
    byTable.room_participants = resRoomParticipants.count;
  } catch {}

  if (roomIds.length > 0) {
    const resRooms = await client`DELETE FROM match_rooms WHERE id = ANY(${roomIds})`;
    byTable.match_rooms = resRooms.count;
  }

  const resNotifications = await client`
    DELETE FROM notifications WHERE user_id = ANY(${userIds})
  `;
  byTable.notifications = resNotifications.count;

  const resSeasonStats = await client`
    DELETE FROM season_stats WHERE user_id = ANY(${userIds})
  `;
  byTable.season_stats = resSeasonStats.count;

  if (deleteUsers) {
    const resEmailCreds = await client`DELETE FROM email_credentials WHERE user_id = ANY(${userIds})`;
    byTable.email_credentials = resEmailCreds.count;

    const resRatings = await client`DELETE FROM ratings WHERE user_id = ANY(${userIds})`;
    byTable.ratings = resRatings.count;

    const resRankStates = await client`DELETE FROM rank_states WHERE user_id = ANY(${userIds})`;
    byTable.rank_states = resRankStates.count;

    try {
      const resAuth = await client`DELETE FROM auth_tokens WHERE user_id = ANY(${userIds})`;
      byTable.auth_tokens = resAuth.count;
    } catch {}

    try {
      const resSessionVersions = await client`DELETE FROM player_session_versions WHERE user_id = ANY(${userIds})`;
      byTable.player_session_versions = resSessionVersions.count;
    } catch {}

    try {
      const resPush = await client`DELETE FROM device_push_tokens WHERE user_id = ANY(${userIds})`;
      byTable.device_push_tokens = resPush.count;
    } catch {}

    try {
      const resMemberships = await client`DELETE FROM club_memberships WHERE user_id = ANY(${userIds})`;
      byTable.club_memberships = resMemberships.count;
    } catch {}

    try {
      const resFriendships = await client`DELETE FROM friendships WHERE requester_id = ANY(${userIds}) OR addressee_id = ANY(${userIds})`;
      byTable.friendships = resFriendships.count;
    } catch {}

    try {
      const resAudit = await client`DELETE FROM audit_logs WHERE actor_id = ANY(${userIds})`;
      byTable.audit_logs = resAudit.count;
    } catch {}

    const resUsers = await client`DELETE FROM users WHERE id = ANY(${userIds})`;
    byTable.users = resUsers.count;
  }

  const total = Object.values(byTable).reduce((sum, n) => sum + n, 0);
  return { byTable, total, userIds };
}

async function api(path, { token, method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: response.status, data };
}

const step = (label, result) => {
  const ok = result.status < 400;
  console.log(`${ok ? '✓' : '✗'} ${label} [${result.status}] ${JSON.stringify(result.data).slice(0, 180)}`);
  if (!ok) throw new Error(`falhou em "${label}"`);
  return result.data;
};

async function main() {
  if (isCleanupOnly) {
    console.log(`base: ${BASE}`);
    console.log(`modo: cleanup (${isCleanupUsers ? 'com remoção de usuários' : 'apenas dados de partidas'})\n`);
    const cleanup = await cleanupTestData({ deleteUsers: isCleanupUsers });
    console.log('Linhas apagadas por tabela:');
    for (const [table, count] of Object.entries(cleanup.byTable)) {
      console.log(`  - ${table}: ${count}`);
    }
    console.log(`\nTotal de linhas apagadas: ${cleanup.total}`);
    return;
  }

  console.log(`base: ${BASE}\n`);

  // Ambiente de produção: limpa apenas os dados ligados às 4 contas de teste antes de começar.
  await cleanupTestData({ deleteUsers: false });
  console.log('estado de partidas limpo (produção)\n');

  const sessions = [];
  for (const user of USERS) {
    const login = await api('/api/auth/email/login', { method: 'POST', body: { email: user.email, password: PASSWORD } });
    const data = step(`login ${user.email}`, login);
    sessions.push({ ...user, token: data.token });
  }

  const today = new Date().toISOString().slice(0, 10);
  const searches = [];
  let formedMatchId = null;
  for (const session of sessions) {
    const search = await api('/api/matchmaking/search', {
      token: session.token,
      method: 'POST',
      body: {
        partyType: 'solo',
        mode: 'friendly',
        city: 'Joaçaba',
        dates: [today],
        from: '18:00',
        to: '23:59',
        sidePreference: session.side,
        replace: true,
      },
    });
    const data = step(`busca ${session.email}`, search);
    if (data.matched) {
      formedMatchId = data.matchId;
      console.log('  → a partida foi formada neste próprio pedido de busca');
      break;
    }
    searches.push({ session, searchId: data.search?.id ?? data.searchId });
  }

  let matchId = formedMatchId;
  if (!matchId) {
    const found = (await sql(`
      select m.id from matches m
      join match_participants p on p.match_id = m.id
      where p.user_id in (select id from users where handle in ('@teste1', '@teste2', '@teste3', '@teste4'))
      order by m.created_at desc limit 1
    `)).trim();
    if (found) matchId = found;
  }

  if (!matchId) {
    for (const { session, searchId } of searches) {
      const ready = await api('/api/matchmaking/search/ready', {
        token: session.token,
        method: 'POST',
        body: { searchId, ready: true, sidePreference: session.side },
      });
      const data = step(`ready ${session.email}`, ready);
      if (data.matchId) matchId = data.matchId;
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (matchId) break;
    const found = (await sql(`
      select m.id from matches m
      join match_participants p on p.match_id = m.id
      where p.user_id in (select id from users where handle in ('@teste1', '@teste2', '@teste3', '@teste4'))
      order by m.created_at desc limit 1
    `)).trim();
    if (found) {
      matchId = found;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!matchId) throw new Error('nenhuma partida foi formada');
  console.log(`\npartida formada: ${matchId}`);

  for (const session of sessions) {
    const accept = await api(`/api/matches/${matchId}/acceptance`, {
      token: session.token,
      method: 'POST',
      body: { decision: 'accept' },
    });
    step(`aceite ${session.email}`, accept);
  }

  // Recua o horário da quadra para a janela de check-in estar aberta.
  await sql(`update match_rooms set starts_at = now() - interval '2 minutes' where id = (select room_id from matches where id = '${matchId}')`);
  console.log('\nhorário da quadra ajustado para 2 minutos atrás');

  for (const session of sessions) {
    const attendance = await api(`/api/matches/${matchId}/attendance`, { token: session.token, method: 'POST' });
    step(`presença ${session.email}`, attendance);
  }

  const before = await sql(`select round(r.rating::numeric, 1) from ratings r join match_participants p on p.user_id = r.user_id where p.match_id = '${matchId}' order by p.team, p.created_at`);
  console.log(`\nMMR antes: ${before.replace(/\n/g, ' | ')}`);

  // A API só aceita placar DEPOIS que a duração da quadra termina:
  // recua o início para 100 minutos atrás (90 de jogo + folga dentro da janela de resultado).
  await sql(`update match_rooms set starts_at = now() - interval '100 minutes' where id = (select room_id from matches where id = '${matchId}')`);
  console.log('horário da quadra recuado 100 min (partida encerrada, janela de resultado aberta)');

  const byHandle = async (email) => (await sql(`select id from users where email = '${email}'`)).trim();
  const teamOf = async (email) => (await sql(`select team from match_participants where match_id = '${matchId}' and user_id = '${await byHandle(email)}'`)).trim();
  const score = { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }], winner: 'A' };

  const teamA = [];
  const teamB = [];
  for (const session of sessions) {
    const team = await teamOf(session.email);
    if (team === 'A') teamA.push(session);
    else if (team === 'B') teamB.push(session);
  }

  const submitted = await api(`/api/matches/${matchId}/result`, { token: teamA[0].token, method: 'POST', body: score });
  step(`placar enviado por ${teamA[0].email}`, submitted);

  // Quórum: 3 votos com as duas duplas representadas.
  const voters = dispute ? [teamA[0], teamA[1], teamB[0]] : [teamA[0], teamA[1], teamB[0]];
  const winners = dispute ? ['A', 'A', 'B'] : ['A', 'A', 'A'];
  for (const [index, voter] of voters.entries()) {
    const vote = await api(`/api/matches/${matchId}/confirm`, { token: voter.token, method: 'POST', body: { status: 'confirmed', winner: winners[index] } });
    step(`voto de ${voter.email} (vencedor ${winners[index]})`, vote);
  }

  const status = await sql(`select status || ' | winner=' || coalesce(winner, '-') from matches where id = '${matchId}'`);
  const after = await sql(`select round(r.rating::numeric, 1) from ratings r join match_participants p on p.user_id = r.user_id where p.match_id = '${matchId}' order by p.team, p.created_at`);
  const seasonPoints = await sql(`select coalesce(sum(points), 0) from season_stats where user_id in (select user_id from match_participants where match_id = '${matchId}')`);

  console.log(`\nstatus da partida: ${status}`);
  console.log(`MMR depois: ${after.replace(/\n/g, ' | ')}`);
  console.log(`pontos de temporada somados: ${seasonPoints}`);

  if (dispute) {
    if (!status.startsWith('disputed')) throw new Error(`esperava status disputed, veio: ${status}`);
    if (after !== before) throw new Error('MMR mudou mesmo com resultado contestado');
    console.log('\nE2E OK (contestação): votos divergentes travaram a partida como "disputed" e o MMR ficou congelado.');
    return;
  }
  if (!status.startsWith('validated')) throw new Error(`partida não foi validada (status: ${status})`);
  if (after === before) throw new Error('MMR não mudou após a validação');
  console.log('\nE2E OK: partida formada, confirmada, presença registrada, placar validado por 3 votos e MMR atualizado.');
  console.log(`id da partida: ${matchId}`);
}

main()
  .catch((error) => {
    console.error(`\nFALHOU: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
