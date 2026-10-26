import { and, eq, gt, inArray, lt } from 'drizzle-orm';
import { applyRankPenalty } from '@/lib/domain/attendance';
import { inactiveRankPointLoss } from '@/lib/domain/rating';
import { getMatchEnd, getResultDeadline } from '@/lib/match-config';
import { RANKS } from '@/lib/ranks';
import { notifyMatchParticipants, notifyUsers } from './notifications';
import { lockMatchmakingQueue, reprocessMatchmakingQueue } from './matchmaking';
import { db } from './index';
import { auditLogs, matchChallengeMembers, matchChallenges, matchParticipants, matchRooms, matchSearches, matches, rankStates, ratings, roomParticipants, users } from './schema';

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SEARCH_MAX_AGE_IN_DAYS = 14;

function todayKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function formatStartsAt(value: Date) {
  return value.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

async function expireOpenRooms() {
  if (!db) return 0;
  const now = new Date();
  const candidates = await db.select({ id: matchRooms.id }).from(matchRooms).where(and(eq(matchRooms.status, 'open'), lt(matchRooms.startsAt, now)));
  let expired = 0;
  for (const candidate of candidates) {
    const [room] = await db.update(matchRooms).set({ status: 'cancelled', updatedAt: now }).where(and(eq(matchRooms.id, candidate.id), eq(matchRooms.status, 'open'))).returning({ id: matchRooms.id });
    if (!room) continue;
    expired += 1;
    const participants = await db.select({ userId: roomParticipants.userId }).from(roomParticipants).where(eq(roomParticipants.roomId, room.id));
    await notifyUsers(participants.map((participant) => participant.userId), { type: 'room-expired', title: 'Sala encerrada', body: 'A sala não foi completada antes do horário marcado e foi encerrada automaticamente.', href: '/matchmaking', dedupeKey: `room-expired:${room.id}` });
  }
  return expired;
}

async function expireMatchSearches() {
  if (!db) return 0;
  const now = new Date();
  const today = todayKey();
  const staleBefore = now.getTime() - SEARCH_MAX_AGE_IN_DAYS * DAY_IN_MS;
  const candidates = await db.select({ id: matchSearches.id, userId: matchSearches.userId, partnerId: matchSearches.partnerId, preferredDates: matchSearches.preferredDates, updatedAt: matchSearches.updatedAt }).from(matchSearches).where(inArray(matchSearches.status, ['lobby', 'searching', 'pending-partner']));
  let expired = 0;
  for (const candidate of candidates) {
    const dates = candidate.preferredDates ?? [];
    const allDatesPassed = dates.length === 0 || dates.every((date) => date < today);
    const tooOld = candidate.updatedAt.getTime() < staleBefore;
    if (!allDatesPassed && !tooOld) continue;
    const [search] = await db.transaction(async (tx) => {
      await lockMatchmakingQueue(tx);
      return tx.update(matchSearches).set({ status: 'expired', updatedAt: now }).where(and(eq(matchSearches.id, candidate.id), inArray(matchSearches.status, ['lobby', 'searching', 'pending-partner']))).returning({ id: matchSearches.id });
    });
    if (!search) continue;
    expired += 1;
    await notifyUsers([candidate.userId, candidate.partnerId ?? ''], { type: 'search-expired', title: 'Busca encerrada', body: 'A janela de disponibilidade terminou sem formar uma partida. Você pode iniciar uma nova busca.', href: '/matchmaking', dedupeKey: `search-expired:${search.id}` });
  }
  return expired;
}

async function expireDirectChallenges() {
  if (!db) return 0;
  const now = new Date();
  const candidates = await db.select({ id: matchChallenges.id }).from(matchChallenges).where(and(eq(matchChallenges.status, 'pending'), lt(matchChallenges.startsAt, now)));
  let expired = 0;
  for (const candidate of candidates) {
    const [challenge] = await db.update(matchChallenges).set({ status: 'expired', updatedAt: now }).where(and(eq(matchChallenges.id, candidate.id), eq(matchChallenges.status, 'pending'))).returning({ id: matchChallenges.id });
    if (!challenge) continue;
    expired += 1;
    const members = await db.select({ userId: matchChallengeMembers.userId }).from(matchChallengeMembers).where(eq(matchChallengeMembers.challengeId, challenge.id));
    await notifyUsers(members.map((member) => member.userId), { type: 'direct-challenge-expired', title: 'Desafio encerrado', body: 'O horário do desafio passou sem que os quatro jogadores confirmassem. Nenhuma partida foi criada.', href: '/matchmaking', dedupeKey: `direct-challenge-expired:${challenge.id}` });
  }
  return expired;
}

async function expireUnacceptedMatches() {
  if (!db) return 0;
  const now = new Date();
  const candidates = await db.select({ id: matches.id, roomId: matchRooms.id, startsAt: matchRooms.startsAt }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(eq(matches.status, 'confirming'), lt(matchRooms.startsAt, now)));
  let expired = 0;
  for (const candidate of candidates) {
    const [cancelled] = await db.update(matches).set({ status: 'cancelled', updatedAt: now }).where(and(eq(matches.id, candidate.id), eq(matches.status, 'confirming'))).returning({ id: matches.id });
    if (!cancelled) continue;
    expired += 1;
    await db.update(matchRooms).set({ status: 'cancelled', updatedAt: now }).where(eq(matchRooms.id, candidate.roomId));
    await db.update(matchSearches).set({ status: 'cancelled', updatedAt: now }).where(eq(matchSearches.roomId, candidate.roomId));
    await notifyMatchParticipants(candidate.id, { type: 'match-cancelled', title: 'Partida cancelada', body: 'Nem todos confirmaram a partida antes do horário marcado. Inicie uma nova busca quando quiser.', href: '/matchmaking', dedupeKey: `match-cancelled-unaccepted:${candidate.id}` });
  }
  return expired;
}

async function sendMatchReminders() {
  if (!db) return { day: 0, soon: 0 };
  const now = new Date();
  const until = new Date(now.getTime() + DAY_IN_MS);
  const upcoming = await db.select({ id: matches.id, startsAt: matchRooms.startsAt }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(inArray(matches.status, ['confirming', 'confirmed']), gt(matchRooms.startsAt, now), lt(matchRooms.startsAt, until)));
  let day = 0;
  let soon = 0;
  for (const match of upcoming) {
    const hoursUntil = (match.startsAt.getTime() - now.getTime()) / (60 * 60 * 1000);
    if (hoursUntil > 2) {
      await notifyMatchParticipants(match.id, { type: 'match-reminder', title: 'Sua partida está chegando', body: `Não esqueça da partida marcada para ${formatStartsAt(match.startsAt)}. Confirme sua presença e reserve a quadra no Gripo.`, href: `/match/${match.id}`, dedupeKey: `match-reminder-24h:${match.id}` });
      day += 1;
    } else if (hoursUntil > 0) {
      await notifyMatchParticipants(match.id, { type: 'match-reminder', title: 'Partida nas próximas horas', body: `Sua partida começa em breve, às ${match.startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`, href: `/match/${match.id}`, dedupeKey: `match-reminder-2h:${match.id}` });
      soon += 1;
    }
  }
  return { day, soon };
}

async function sendResultPrompts() {
  if (!db) return 0;
  const now = new Date();
  const candidates = await db.select({ id: matches.id, startsAt: matchRooms.startsAt, durationMinutes: matchRooms.durationMinutes, resultDeadlineAt: matches.resultDeadlineAt }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(eq(matches.status, 'confirmed'), lt(matchRooms.startsAt, now)));
  let sent = 0;
  for (const candidate of candidates) {
    const endAt = getMatchEnd(candidate.startsAt, candidate.durationMinutes);
    if (endAt > now) continue;
    const participants = await db.select({ attendance: matchParticipants.attendance }).from(matchParticipants).where(eq(matchParticipants.matchId, candidate.id));
    if (participants.length !== 4 || participants.some((participant) => !['claimed-present', 'present'].includes(participant.attendance))) continue;
    const deadline = candidate.resultDeadlineAt ?? getResultDeadline(candidate.startsAt, candidate.durationMinutes);
    if (deadline < now) continue;
    await notifyMatchParticipants(candidate.id, { type: 'result-window-open', title: 'Informe o resultado da partida', body: `O tempo de jogo terminou. Envie o placar até ${deadline.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}; depois os quatro jogadores votarão no vencedor.`, href: `/match/${candidate.id}`, dedupeKey: `result-window-open:${candidate.id}` });
    sent += 1;
  }
  return sent;
}

async function applyInactivity() {
  if (!db) return { penalized: 0, markedInactive: 0 };
  const now = new Date();
  const players = await db.select({ userId: users.id, rating: ratings, rank: rankStates }).from(users).innerJoin(ratings, eq(ratings.userId, users.id)).innerJoin(rankStates, eq(rankStates.userId, users.id)).where(and(eq(users.role, 'player'), eq(users.isActive, true), gt(ratings.matches, 0)));
  let penalized = 0;
  let markedInactive = 0;

  for (const player of players) {
    const lastPlayedAt = player.rating.lastPlayedAt ?? player.rating.updatedAt;
    const daysInactive = Math.max(0, Math.floor((now.getTime() - lastPlayedAt.getTime()) / DAY_IN_MS));
    const targetPenalty = inactiveRankPointLoss(daysInactive);
    const penaltyDelta = Math.max(0, targetPenalty - player.rating.inactivityPenalty);
    const nextInactive = daysInactive >= 60;
    const statusChanged = nextInactive !== player.rating.isInactive;
    if (penaltyDelta === 0 && !statusChanged) continue;

    await db.transaction(async (tx) => {
      if (penaltyDelta > 0) {
        const currentTierOrder = RANKS.find((item) => item.label === player.rank.tier)?.order ?? 0;
        const nextRank = applyRankPenalty(currentTierOrder, player.rank.points, penaltyDelta);
        await tx.update(rankStates).set({ tier: RANKS[nextRank.tierOrder]?.label ?? player.rank.tier, points: nextRank.points, updatedAt: now }).where(eq(rankStates.id, player.rank.id));
      }
      await tx.update(ratings).set({ inactivityPenalty: targetPenalty, isInactive: nextInactive, deviation: penaltyDelta > 0 ? Math.min(350, player.rating.deviation + 10) : player.rating.deviation, updatedAt: now }).where(eq(ratings.id, player.rating.id));
      await tx.insert(auditLogs).values({ action: penaltyDelta > 0 ? 'inactivity-penalty' : 'inactivity-status-change', entityType: 'user', entityId: player.userId, metadata: { daysInactive, pointsLoss: penaltyDelta, cumulativePenalty: targetPenalty, isInactive: nextInactive } });
    });

    if (penaltyDelta > 0) {
      penalized += 1;
      await notifyUsers([player.userId], { type: 'inactivity-penalty', title: 'Sua patente precisa de atividade', body: `Você ficou ${daysInactive} dias sem jogar e perdeu ${penaltyDelta} pontos por inatividade. Volte à quadra para recuperar o ritmo.`, href: '/profile', dedupeKey: `inactivity:${player.userId}:${lastPlayedAt.toISOString()}:${targetPenalty}` });
    }
    if (nextInactive && !player.rating.isInactive) {
      markedInactive += 1;
      await notifyUsers([player.userId], { type: 'profile-inactive', title: 'Perfil competitivo inativo', body: 'Seu perfil saiu da disputa entre jogadores ativos. Uma nova partida ranqueada reativa sua posição.', href: '/matchmaking', dedupeKey: `profile-inactive:${player.userId}:${lastPlayedAt.toISOString()}` });
    }
  }
  return { penalized, markedInactive };
}

export async function runMaintenance() {
  if (!db) throw new Error('O banco de dados não está configurado.');
  const expiredRooms = await expireOpenRooms();
  const expiredSearches = await expireMatchSearches();
  const matchmaking = await reprocessMatchmakingQueue();
  const expiredChallenges = await expireDirectChallenges();
  const expiredMatches = await expireUnacceptedMatches();
  const reminders = await sendMatchReminders();
  const resultPrompts = await sendResultPrompts();
  const inactivity = await applyInactivity();
  return { expiredRooms, expiredSearches, matchmaking, expiredChallenges, expiredMatches, reminders, resultPrompts, inactivity, ranAt: new Date().toISOString() };
}
