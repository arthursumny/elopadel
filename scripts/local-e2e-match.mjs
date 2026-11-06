/**
 * Teste E2E de uma partida FRIENDLY no ambiente local, usando as 4 contas @teste1..4.
 * Exercita: busca → saguão/ready → formação (matchmaking) → aceite dos 4 →
 * presença na quadra → placar melhor de 3 → quórum de 3 votos → MMR.
 *
 * Uso: node scripts/local-e2e-match.mjs [baseUrl]
 * Obs.: o horário da partida é ajustado no banco (a janela de check-in exige
 * que a hora da quadra já tenha começado); isso só vale para ambiente local.
 */
import { execFileSync } from 'node:child_process';

const BASE = process.argv.slice(2).find((arg) => !arg.startsWith('--')) ?? 'http://127.0.0.1:3100';
const PASSWORD = 'elopadel123';
const USERS = [
  { email: 'teste1@elopadel.local', side: 'left' },
  { email: 'teste2@elopadel.local', side: 'left' },
  { email: 'teste3@elopadel.local', side: 'right' },
  { email: 'teste4@elopadel.local', side: 'right' },
];

const sql = (query) =>
  execFileSync('docker', ['exec', 'elopadel-db', 'psql', '-U', 'elo', '-d', 'elo_padel', '-tAc', query], {
    encoding: 'utf8',
  }).trim();

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
  console.log(`base: ${BASE}\n`);

  // Ambiente local: limpa partidas/buscas de execuções anteriores para o teste ser repetível.
  sql('truncate match_participants, match_searches, matches, match_rooms, rating_events, notifications, season_stats restart identity cascade');
  console.log('estado de partidas limpo (local)\n');

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

  let matchId = formedMatchId ?? sql(`select id from matches order by created_at desc limit 1`);
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
    const found = sql(`select id from matches order by created_at desc limit 1`);
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

  // Só no local: recua o horário da quadra para a janela de check-in estar aberta.
  sql(`update match_rooms set starts_at = now() - interval '2 minutes' where id = (select room_id from matches where id = '${matchId}')`);
  console.log('\nhorário da quadra ajustado para 2 minutos atrás (só ambiente local)');

  for (const session of sessions) {
    const attendance = await api(`/api/matches/${matchId}/attendance`, { token: session.token, method: 'POST' });
    step(`presença ${session.email}`, attendance);
  }

  const before = sql(`select round(r.rating::numeric, 1) from ratings r join match_participants p on p.user_id = r.user_id where p.match_id = '${matchId}' order by p.team, p.created_at`);
  console.log(`\nMMR antes: ${before.replace(/\n/g, ' | ')}`);

  // A API só aceita placar DEPOIS que a duração da quadra termina:
  // recua o início para 100 minutos atrás (90 de jogo + folga dentro da janela de resultado).
  sql(`update match_rooms set starts_at = now() - interval '100 minutes' where id = (select room_id from matches where id = '${matchId}')`);
  console.log('horário da quadra recuado 100 min (partida encerrada, janela de resultado aberta)');

  const byHandle = (email) => sql(`select id from users where email = '${email}'`);
  const teamOf = (email) => sql(`select team from match_participants where match_id = '${matchId}' and user_id = '${byHandle(email)}'`);
  const score = { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }], winner: 'A' };

  const teamA = sessions.filter((session) => teamOf(session.email) === 'A');
  const teamB = sessions.filter((session) => teamOf(session.email) === 'B');

  const submitted = await api(`/api/matches/${matchId}/result`, { token: teamA[0].token, method: 'POST', body: score });
  step(`placar enviado por ${teamA[0].email}`, submitted);

  // Quórum: 3 votos com as duas duplas representadas.
  const dispute = process.argv.includes('--dispute');
  const voters = dispute ? [teamA[0], teamA[1], teamB[0]] : [teamA[0], teamA[1], teamB[0]];
  const winners = dispute ? ['A', 'A', 'B'] : ['A', 'A', 'A'];
  for (const [index, voter] of voters.entries()) {
    const vote = await api(`/api/matches/${matchId}/confirm`, { token: voter.token, method: 'POST', body: { status: 'confirmed', winner: winners[index] } });
    step(`voto de ${voter.email} (vencedor ${winners[index]})`, vote);
  }

  const status = sql(`select status || ' | winner=' || coalesce(winner, '-') from matches where id = '${matchId}'`);
  const after = sql(`select round(r.rating::numeric, 1) from ratings r join match_participants p on p.user_id = r.user_id where p.match_id = '${matchId}' order by p.team, p.created_at`);
  const seasonPoints = sql(`select coalesce(sum(points), 0) from season_stats`);

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

main().catch((error) => {
  console.error(`\nFALHOU: ${error.message}`);
  process.exit(1);
});
