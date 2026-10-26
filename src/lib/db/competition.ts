import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { applyRankPenalty, noShowPenalty } from '@/lib/domain/attendance';
import { canValidateResult, hasConflictingResult, validateBestOfThree, type Confirmation, type MatchResultInput } from '@/lib/domain/match';
import { areCompetitivePlayersCompatible } from '@/lib/domain/matchmaking';
import { calculateRatingUpdate, rankPointDelta, teamRating } from '@/lib/domain/rating';
import { categoryFromTier, RANKS } from '@/lib/ranks';
import { getMatchEnd, getMatchDurationMinutes, getResultDeadline } from '@/lib/match-config';
import type { MatchMode } from '@/lib/types';
import { db } from './index';
import { notifyMatchParticipants, notifyUsers } from './notifications';
import { auditLogs, matchParticipants, matchRooms, matchSearches, matches, ratingEvents, ratings, rankStates, roomInvitations, roomParticipants, seasonStats, seasons, users } from './schema';

async function loadCompetitivePlayers(userIds: string[]) {
  if (!db || userIds.length === 0) return [];
  const rows = await db.select({ id: users.id, rating: ratings.rating, tier: rankStates.tier }).from(users).innerJoin(ratings, eq(ratings.userId, users.id)).innerJoin(rankStates, eq(rankStates.userId, users.id)).where(and(sql`${users.id} in (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`, eq(users.isActive, true)));
  return rows.map((player) => ({ id: player.id, rating: player.rating, tier: player.tier }));
}

export async function createRoomRecord(input: { hostId: string; partnerId?: string; clubId: string; mode: MatchMode; kind: string; startsAt: Date; preferences?: string[] }) {
  if (!db) return null;
  if (input.mode === 'ranked' && await isRankedSuspended(input.hostId)) return null;
  if (input.partnerId === input.hostId) return { blocked: 'invalid-partner' as const };
  const playerIds = [input.hostId, ...(input.partnerId ? [input.partnerId] : [])];
  const players = await loadCompetitivePlayers(playerIds);
  if (players.length !== playerIds.length) return { blocked: 'partner-not-found' as const };
  if (input.mode === 'ranked' && (!areCompetitivePlayersCompatible(players) || (input.partnerId ? await isRankedSuspended(input.partnerId) : false))) return { blocked: 'incompatible' as const };
  const host = players.find((player) => player.id === input.hostId);
  const systemCategory = input.mode === 'ranked' ? categoryFromTier(host?.tier) || undefined : undefined;
  const [room] = await db.insert(matchRooms).values({ hostId: input.hostId, clubId: input.clubId, mode: input.mode, kind: input.kind, startsAt: input.startsAt, tierMin: systemCategory, tierMax: undefined, preferences: input.preferences ?? [] }).returning();
  await db.insert(roomParticipants).values({ roomId: room.id, userId: input.hostId, team: 'A', status: 'joined' });
  if (input.partnerId) {
    await db.insert(roomParticipants).values({ roomId: room.id, userId: input.partnerId, team: 'A', status: 'invited' });
    await db.insert(roomInvitations).values({ roomId: room.id, inviterId: input.hostId, inviteeId: input.partnerId, status: 'pending' }).onConflictDoUpdate({ target: [roomInvitations.roomId, roomInvitations.inviteeId], set: { status: 'pending', updatedAt: new Date() } });
    await notifyUsers([input.partnerId], { type: 'room-invitation', title: 'Convite para uma sala', body: 'Você recebeu um convite para formar uma dupla. Abra o matchmaking para responder.', href: '/matchmaking' });
  }
  return room;
}

export async function joinRoomRecord(roomId: string, userId: string, partnerId?: string) {
  if (!db) return null;
  const [room] = await db.select().from(matchRooms).where(eq(matchRooms.id, roomId)).limit(1);
  if (!room || room.status !== 'open' || room.startsAt <= new Date()) return null;
  if (room.mode === 'ranked' && await isRankedSuspended(userId)) return { blocked: 'suspended' as const, room, slots: 0, matchId: null };
  if (partnerId && partnerId === userId) return { blocked: 'invalid-partner' as const, room, slots: 0, matchId: null };
  if (partnerId && room.mode === 'ranked' && await isRankedSuspended(partnerId)) return { blocked: 'incompatible' as const, room, slots: 0, matchId: null };
  if (partnerId && (await loadCompetitivePlayers([partnerId])).length !== 1) return { blocked: 'partner-not-found' as const, room, slots: 0, matchId: null };
  const currentParticipants = await db.select().from(roomParticipants).where(eq(roomParticipants.roomId, roomId)).orderBy(asc(roomParticipants.joinedAt));
  const currentIds = new Set(currentParticipants.map((participant) => participant.userId));
  const candidateIds = [userId, ...(partnerId ? [partnerId] : [])];
  if (candidateIds.some((candidateId) => currentIds.has(candidateId))) return { blocked: 'already-joined' as const, room, slots: Math.max(0, 4 - currentParticipants.length), matchId: null };
  if (candidateIds.length > 4 - currentParticipants.length) return null;
  const competitivePlayers = await loadCompetitivePlayers([...currentParticipants.map((participant) => participant.userId), ...candidateIds]);
  if (room.mode === 'ranked' && !areCompetitivePlayersCompatible(competitivePlayers)) return { blocked: 'incompatible' as const, room, slots: 4 - currentParticipants.length, matchId: null };

  const teamA = currentParticipants.filter((participant) => participant.team === 'A').length;
  const teamB = currentParticipants.filter((participant) => participant.team === 'B').length;
  let team: 'A' | 'B' | null = null;
  if (partnerId) {
    if (teamB + 2 <= 2) team = 'B';
    else if (teamA + 2 <= 2) team = 'A';
  } else if (teamA < 2) team = 'A';
  else if (teamB < 2) team = 'B';
  if (!team) return null;
  await db.insert(roomParticipants).values(candidateIds.map((candidateId) => ({ roomId, userId: candidateId, team, status: 'joined' })));
  if (partnerId) {
    await db.update(roomParticipants).set({ status: 'invited', updatedAt: new Date() }).where(and(eq(roomParticipants.roomId, roomId), eq(roomParticipants.userId, partnerId)));
    await db.insert(roomInvitations).values({ roomId, inviterId: userId, inviteeId: partnerId, status: 'pending' }).onConflictDoUpdate({ target: [roomInvitations.roomId, roomInvitations.inviteeId], set: { inviterId: userId, status: 'pending', updatedAt: new Date() } });
    await notifyUsers([partnerId], { type: 'room-invitation', title: 'Convite para uma sala', body: 'Você recebeu um convite para formar uma dupla. Abra o matchmaking para responder.', href: '/matchmaking' });
  }
  const participants = await db.select().from(roomParticipants).where(eq(roomParticipants.roomId, roomId)).orderBy(asc(roomParticipants.joinedAt));
  const matchId = await finalizeRoomIfReady(roomId);
  if (matchId) return { room, slots: 0, matchId };
  if (room.hostId !== userId) await notifyUsers([room.hostId], { type: 'room-joined', title: 'Jogador entrou na sua sala', body: 'Uma nova pessoa entrou na sala. Confira os participantes no matchmaking.', href: '/matchmaking' });
  return { room, slots: Math.max(0, 4 - participants.length), matchId: null };
}

export async function finalizeRoomIfReady(roomId: string) {
  if (!db) return null;
  const [room] = await db.select().from(matchRooms).where(eq(matchRooms.id, roomId)).limit(1);
  if (!room || !['open', 'full'].includes(room.status)) return null;
  const participants = await db.select().from(roomParticipants).where(eq(roomParticipants.roomId, roomId)).orderBy(asc(roomParticipants.joinedAt));
  if (participants.length !== 4 || participants.some((participant) => participant.status !== 'joined')) return null;
  if (participants.filter((participant) => participant.team === 'A').length !== 2 || participants.filter((participant) => participant.team === 'B').length !== 2) return null;
  const [existingMatch] = await db.select().from(matches).where(eq(matches.roomId, roomId)).limit(1);
  if (existingMatch) return existingMatch.id;
  const durationMinutes = room.durationMinutes || getMatchDurationMinutes();
  const [match] = await db.insert(matches).values({ roomId, mode: room.mode, status: 'confirming', resultDeadlineAt: getResultDeadline(room.startsAt, durationMinutes) }).onConflictDoNothing({ target: matches.roomId }).returning();
  if (!match) {
    const [concurrentMatch] = await db.select({ id: matches.id }).from(matches).where(eq(matches.roomId, roomId)).limit(1);
    return concurrentMatch?.id ?? null;
  }
  await db.insert(matchParticipants).values(participants.map((participant) => ({ matchId: match.id, userId: participant.userId, team: participant.team === 'B' ? 'B' : 'A', matchAcceptance: 'pending', confirmation: 'pending' })));
  await db.update(matchRooms).set({ status: 'full', updatedAt: new Date() }).where(eq(matchRooms.id, roomId));
  await notifyUsers(participants.map((participant) => participant.userId), { type: 'match-formed', title: 'Partida formada', body: 'Os quatro jogadores estão definidos. Confirme sua presença e reserve a quadra no Gripo.', href: `/match/${match.id}`, dedupeKey: `match-formed:${match.id}` });
  return match.id;
}

export async function decideRoomInvitation(invitationId: string, userId: string, decision: 'accept' | 'decline') {
  if (!db) return null;
  const [invitation] = await db.select({ invitation: roomInvitations, room: matchRooms }).from(roomInvitations).innerJoin(matchRooms, eq(matchRooms.id, roomInvitations.roomId)).where(and(eq(roomInvitations.id, invitationId), eq(roomInvitations.inviteeId, userId), eq(roomInvitations.status, 'pending'))).limit(1);
  if (!invitation || invitation.room.status !== 'open' || invitation.room.startsAt <= new Date()) return null;
  await db.transaction(async (tx) => {
    await tx.update(roomInvitations).set({ status: decision === 'accept' ? 'accepted' : 'declined', updatedAt: new Date() }).where(eq(roomInvitations.id, invitationId));
    if (decision === 'accept') await tx.update(roomParticipants).set({ status: 'joined', updatedAt: new Date() }).where(and(eq(roomParticipants.roomId, invitation.invitation.roomId), eq(roomParticipants.userId, userId), eq(roomParticipants.status, 'invited')));
    else await tx.delete(roomParticipants).where(and(eq(roomParticipants.roomId, invitation.invitation.roomId), eq(roomParticipants.userId, userId), eq(roomParticipants.status, 'invited')));
  });
  const matchId = decision === 'accept' ? await finalizeRoomIfReady(invitation.invitation.roomId) : null;
  if (decision === 'decline' || !matchId) await notifyUsers([invitation.invitation.inviterId], { type: 'room-invitation-response', title: decision === 'accept' ? 'Convite aceito' : 'Convite recusado', body: decision === 'accept' ? 'Seu parceiro aceitou o convite para a sala.' : 'O convite para a sala foi recusado.', href: '/matchmaking' });
  return { roomId: invitation.invitation.roomId, matchId };
}

export async function isRankedSuspended(userId: string) {
  if (!db) return false;
  const [rating] = await db.select({ suspendedUntil: ratings.suspendedUntil }).from(ratings).where(eq(ratings.userId, userId)).limit(1);
  return Boolean(rating?.suspendedUntil && rating.suspendedUntil > new Date());
}

export async function decideMatchAcceptance(matchId: string, userId: string, decision: 'accept' | 'decline') {
  if (!db) return null;
  const result = await db.transaction(async (tx) => {
    const [matchRow] = await tx.select({ match: matches, room: matchRooms }).from(matches).leftJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(eq(matches.id, matchId)).limit(1);
    if (!matchRow || !['confirming', 'confirmed'].includes(matchRow.match.status) || !matchRow.room || matchRow.room.startsAt <= new Date()) return null;
    const [participant] = await tx.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))).limit(1);
    if (!participant) return null;
    const now = new Date();
    if (decision === 'decline') {
      await tx.update(matchParticipants).set({ matchAcceptance: 'declined', matchAcceptedAt: null, updatedAt: now }).where(eq(matchParticipants.id, participant.id));
      await tx.update(matches).set({ status: 'cancelled', updatedAt: now }).where(and(eq(matches.id, matchId), inArray(matches.status, ['confirming', 'confirmed'])));
      await tx.update(matchRooms).set({ status: 'cancelled', updatedAt: now }).where(eq(matchRooms.id, matchRow.room.id));
      await tx.update(matchSearches).set({ status: 'cancelled', updatedAt: now }).where(eq(matchSearches.roomId, matchRow.room.id));
      return { status: 'cancelled' as const, acceptedCount: 0, declined: true as const };
    }
    await tx.update(matchParticipants).set({ matchAcceptance: 'accepted', matchAcceptedAt: now, updatedAt: now }).where(eq(matchParticipants.id, participant.id));
    const participants = await tx.select({ matchAcceptance: matchParticipants.matchAcceptance }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
    const acceptedCount = participants.filter((item) => item.matchAcceptance === 'accepted').length;
    const allAccepted = participants.length === 4 && acceptedCount === 4;
    if (allAccepted) await tx.update(matches).set({ status: 'confirmed', updatedAt: now }).where(and(eq(matches.id, matchId), eq(matches.status, 'confirming')));
    return { status: allAccepted ? 'confirmed' as const : 'confirming' as const, acceptedCount, declined: false as const };
  });
  if (!result) return null;
  const [participantUsers] = await Promise.all([db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId))]);
  const userIds = participantUsers.map((participant) => participant.userId);
  if (result.declined) {
    await notifyUsers(userIds, { type: 'match-cancelled', title: 'Partida cancelada', body: 'Um dos jogadores não confirmou a partida. Todos podem iniciar uma nova busca.', href: '/matchmaking', dedupeKey: `match-cancelled:${matchId}` });
  } else if (result.status === 'confirmed') {
    await notifyUsers(userIds, { type: 'match-confirmed', title: 'Partida confirmada pelos quatro', body: 'Todos aceitaram jogar. No horário marcado, os quatro precisam confirmar presença na quadra.', href: `/match/${matchId}`, dedupeKey: `match-confirmed:${matchId}` });
  }
  return result;
}

export async function markPlayerPresent(matchId: string, userId: string) {
  if (!db) return null;
  const [matchRow] = await db.select({ match: matches, room: matchRooms }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(eq(matches.id, matchId)).limit(1);
  const now = new Date();
  if (!matchRow || matchRow.match.status !== 'confirmed' || matchRow.room.startsAt > now || getMatchEnd(matchRow.room.startsAt, matchRow.room.durationMinutes) < now) return null;
  const [participant] = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))).limit(1);
  if (!participant || participant.matchAcceptance !== 'accepted' || participant.attendance === 'absent' || participant.attendance === 'excused') return null;
  const [updated] = await db.update(matchParticipants).set({ attendance: 'claimed-present', attendanceAt: now, updatedAt: now }).where(eq(matchParticipants.id, participant.id)).returning();
  const presence = await db.select({ attendance: matchParticipants.attendance }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  if (presence.length === 4 && presence.every((item) => ['claimed-present', 'present'].includes(item.attendance))) await notifyMatchParticipants(matchId, { type: 'match-ready-to-play', title: 'Os quatro estão na quadra', body: 'Todos confirmaram presença. A partida está liberada para começar.', href: `/match/${matchId}`, dedupeKey: `match-ready-to-play:${matchId}` });
  return updated ? { status: 'claimed-present' as const } : null;
}

export async function resolveClubAttendance(matchId: string, clubId: string, decision: 'confirm-no-show' | 'all-present' | 'excuse', absentUserIds: string[]) {
  if (!db) return null;
  const [matchRow] = await db.select({ match: matches, clubId: matchRooms.clubId, startsAt: matchRooms.startsAt, durationMinutes: matchRooms.durationMinutes }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(eq(matches.id, matchId), eq(matchRooms.clubId, clubId))).limit(1);
  if (!matchRow || !['confirmed', 'result-pending'].includes(matchRow.match.status) || matchRow.startsAt > new Date()) return null;
  const participants = await db.select({ participant: matchParticipants, rating: ratings, rank: rankStates }).from(matchParticipants).innerJoin(ratings, eq(ratings.userId, matchParticipants.userId)).innerJoin(rankStates, eq(rankStates.userId, matchParticipants.userId)).where(eq(matchParticipants.matchId, matchId));
  if (participants.length !== 4) return null;
  const selected = new Set(absentUserIds);
  const absent = participants.filter(({ participant }) => selected.has(participant.userId));
  if (decision !== 'all-present' && absent.length === 0) return null;
  if (absent.some(({ participant }) => participant.attendance === 'present')) return null;
  const now = new Date();
  const ranked = matchRow.match.mode === 'ranked';
  const penalties: Array<{ userId: string; mmrLoss: number; suspensionDays: number }> = [];
  const result = await db.transaction(async (tx) => {
    const [lockedMatch] = await tx.update(matches).set({ status: 'attendance-processing', updatedAt: now }).where(and(eq(matches.id, matchId), eq(matches.status, matchRow.match.status))).returning();
    if (!lockedMatch) return null;
    for (const { participant } of participants) {
      const nextAttendance = decision === 'confirm-no-show' && selected.has(participant.userId) ? 'absent' : decision === 'excuse' && selected.has(participant.userId) ? 'excused' : 'present';
      await tx.update(matchParticipants).set({ attendance: nextAttendance, attendanceAt: now, updatedAt: now }).where(eq(matchParticipants.id, participant.id));
    }
    if (decision === 'confirm-no-show') {
      for (const { participant, rating, rank } of absent) {
        const penalty = noShowPenalty(rating.noShowCount + 1);
        const nextRating = Math.max(400, rating.rating - penalty.mmrLoss);
        const currentSuspension = rating.suspendedUntil && rating.suspendedUntil > now ? rating.suspendedUntil : now;
        const suspendedUntil = new Date(currentSuspension.getTime() + penalty.suspensionDays * 24 * 60 * 60 * 1000);
        await tx.update(ratings).set({ rating: ranked ? nextRating : rating.rating, deviation: ranked ? Math.min(350, rating.deviation + 15) : rating.deviation, noShowCount: rating.noShowCount + 1, suspendedUntil, updatedAt: now }).where(eq(ratings.id, rating.id));
        if (ranked) {
          const currentTierOrder = RANKS.find((item) => item.label === rank.tier)?.order ?? 4;
          const nextRank = applyRankPenalty(currentTierOrder, rank.points, penalty.pointsLoss);
          await tx.update(rankStates).set({ tier: RANKS[nextRank.tierOrder]?.label ?? rank.tier, points: nextRank.points, updatedAt: now }).where(eq(rankStates.id, rank.id));
          await tx.insert(ratingEvents).values({ matchId, userId: participant.userId, beforeRating: rating.rating, afterRating: nextRating, delta: nextRating - rating.rating, policyVersion: 'no-show-penalty-v1' });
        }
        penalties.push({ userId: participant.userId, mmrLoss: ranked ? penalty.mmrLoss : 0, suspensionDays: penalty.suspensionDays });
      }
    }
    const nextStatus = decision === 'confirm-no-show' ? 'no-show' : decision === 'excuse' ? 'cancelled' : matchRow.match.status === 'disputed' ? 'disputed' : matchRow.match.winner && matchRow.match.sets ? 'result-pending' : 'confirmed';
    await tx.update(matches).set({ status: nextStatus, updatedAt: now }).where(eq(matches.id, matchId));
    await tx.insert(auditLogs).values({ action: 'club-attendance-decision', entityType: 'match', entityId: matchId, metadata: { clubId, decision, absentUserIds, penalties } });
    return { status: nextStatus, penalties };
  });
  if (result) {
    const title = decision === 'confirm-no-show' ? 'Comparecimento encerrado' : decision === 'excuse' ? 'Ausência abonada' : 'Comparecimento confirmado';
    const body = decision === 'confirm-no-show' ? 'O clube registrou a ausência e a partida foi encerrada conforme as regras.' : decision === 'excuse' ? 'O clube abonou a ausência e a partida não altera o ranking.' : 'O clube confirmou o comparecimento dos quatro jogadores.';
    await notifyMatchParticipants(matchId, { type: 'attendance-update', title, body, href: `/match/${matchId}`, dedupeKey: `attendance:${matchId}:${decision}:${result.status}` });
  }
  return result;
}

export async function submitMatchResult(matchId: string, userId: string, result: MatchResultInput) {
  if (!db || !validateBestOfThree(result)) return null;
  const updated = await db.transaction(async (tx) => {
    const [matchRow] = await tx.select({ match: matches, room: matchRooms }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(eq(matches.id, matchId)).limit(1);
    const now = new Date();
    const resultDeadlineAt = matchRow?.match.resultDeadlineAt ?? (matchRow ? getResultDeadline(matchRow.room.startsAt, matchRow.room.durationMinutes) : null);
    if (!matchRow || !['confirmed', 'result-pending'].includes(matchRow.match.status) || matchRow.room.startsAt > now || getMatchEnd(matchRow.room.startsAt, matchRow.room.durationMinutes) > now || (resultDeadlineAt && resultDeadlineAt < now)) return null;
    const [participant] = await tx.select({ id: matchParticipants.id }).from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))).limit(1);
    if (!participant) return null;
    const matchParticipantsRows = await tx.select({ matchAcceptance: matchParticipants.matchAcceptance, attendance: matchParticipants.attendance }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
    if (matchParticipantsRows.length !== 4 || matchParticipantsRows.some((item) => item.matchAcceptance !== 'accepted' || !['claimed-present', 'present'].includes(item.attendance))) return null;
    const [nextMatch] = await tx.update(matches).set({ sets: result.sets, winner: result.winner, resultSubmittedBy: userId, status: 'result-pending', updatedAt: new Date() }).where(and(eq(matches.id, matchId), inArray(matches.status, ['confirmed', 'result-pending']))).returning();
    await tx.update(matchParticipants).set({ confirmation: 'pending', resultWinner: null, attendance: 'present', attendanceAt: new Date(), updatedAt: new Date() }).where(eq(matchParticipants.matchId, matchId));
    return nextMatch ?? null;
  });
  if (updated) await notifyMatchParticipants(matchId, { type: 'result-submitted', title: 'Resultado aguardando confirmação', body: 'O placar foi enviado. Confirme o vencedor que você reconhece para liberar a atualização do ranking.', href: `/match/${matchId}`, dedupeKey: `result-submitted:${matchId}:${updated.updatedAt.toISOString()}` });
  return updated;
}

export async function confirmMatchResult(matchId: string, userId: string, status: 'confirmed' | 'disputed', winner?: 'A' | 'B') {
  if (!db) return null;
  const [matchRow] = await db.select({ match: matches, room: matchRooms }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(eq(matches.id, matchId)).limit(1);
  const now = new Date();
  const resultDeadlineAt = matchRow?.match.resultDeadlineAt ?? (matchRow ? getResultDeadline(matchRow.room.startsAt, matchRow.room.durationMinutes) : null);
  if (!matchRow || matchRow.match.status !== 'result-pending' || (resultDeadlineAt && resultDeadlineAt < now)) return null;
  const match = matchRow.match;
  if (status === 'confirmed' && !winner) return null;
  const [participant] = await db.select().from(matchParticipants).where(and(eq(matchParticipants.matchId, matchId), eq(matchParticipants.userId, userId))).limit(1);
  if (!participant) return null;
  await db.update(matchParticipants).set({ confirmation: status, resultWinner: status === 'confirmed' ? winner : null, updatedAt: new Date() }).where(eq(matchParticipants.id, participant.id));
  if (status === 'disputed') {
    await db.update(matches).set({ status: 'disputed', updatedAt: new Date() }).where(eq(matches.id, matchId));
    await notifyMatchParticipants(matchId, { type: 'result-disputed', title: 'Resultado contestado', body: 'Um jogador contestou o resultado. O MMR está bloqueado até a análise do clube.', href: `/match/${matchId}`, dedupeKey: `result-disputed:${matchId}` }, userId);
    return { status: 'disputed' as const, reason: 'explicit-dispute' as const };
  }
  const confirmations = await db.select().from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  const normalized: Confirmation[] = confirmations.map((item) => ({ playerId: item.userId, team: item.team as 'A' | 'B', status: item.confirmation as 'confirmed' | 'disputed', winner: item.resultWinner as 'A' | 'B' | null }));
  const submittedWinner = match.winner === 'A' || match.winner === 'B' ? match.winner : undefined;
  if (hasConflictingResult(normalized, submittedWinner)) {
    await db.update(matches).set({ status: 'disputed', updatedAt: new Date() }).where(eq(matches.id, matchId));
    await notifyMatchParticipants(matchId, { type: 'result-disputed', title: 'Resultado em análise', body: 'Os votos dos jogadores divergem. O clube precisa analisar a partida antes de atualizar o ranking.', href: `/match/${matchId}`, dedupeKey: `result-conflict:${matchId}` }, userId);
    return { status: 'disputed' as const, reason: 'winner-conflict' as const };
  }
  if (match.status === 'disputed' || normalized.some((confirmation) => confirmation.status === 'disputed')) return { status: 'disputed' as const, reason: 'existing-dispute' as const };
  if (!canValidateResult(normalized, submittedWinner)) {
    await notifyMatchParticipants(matchId, { type: 'result-vote', title: 'Voto registrado', body: 'Seu voto foi registrado. Ainda faltam confirmações para validar o resultado.', href: `/match/${matchId}` }, userId);
    return { status: 'result-pending' as const };
  }
  const applied = await applyValidatedMatch(matchId);
  if (applied) await notifyMatchParticipants(matchId, { type: 'match-validated', title: 'Partida validada', body: 'Resultado confirmado. O MMR, a patente e a temporada foram atualizados.', href: `/match/${matchId}`, dedupeKey: `match-validated:${matchId}` });
  return { status: applied ? 'validated' as const : 'result-pending' as const };
}

async function applyValidatedMatch(matchId: string) {
  if (!db) return false;
  const [match] = await db.update(matches).set({ status: 'processing', updatedAt: new Date() }).where(and(eq(matches.id, matchId), eq(matches.status, 'result-pending'))).returning();
  if (!match || !match.winner || !match.sets) return false;
  const participants = await db.select({ participant: matchParticipants, rating: ratings, rank: rankStates }).from(matchParticipants).innerJoin(ratings, eq(ratings.userId, matchParticipants.userId)).innerJoin(rankStates, eq(rankStates.userId, matchParticipants.userId)).where(eq(matchParticipants.matchId, matchId));
  const teamA = participants.filter(({ participant }) => participant.team === 'A').map(({ rating }) => ({ ...rating, provisional: rating.provisionalMatches < 5 }));
  const teamB = participants.filter(({ participant }) => participant.team === 'B').map(({ rating }) => ({ ...rating, provisional: rating.provisionalMatches < 5 }));
  if (teamA.length !== 2 || teamB.length !== 2) {
    await db.update(matches).set({ status: 'result-pending', updatedAt: new Date() }).where(eq(matches.id, matchId));
    return false;
  }
  const teamARating = teamRating(teamA);
  const teamBRating = teamRating(teamB);
  const update = calculateRatingUpdate(teamARating, teamBRating, match.winner as 'A' | 'B');
  const expectedForA = update.expectedWinner;
  const [activeSeason] = await db.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
  await db.transaction(async (tx) => {
    for (const { participant, rating, rank } of participants) {
      const won = participant.team === match.winner;
      const delta = won ? update.winnerDelta : -update.loserDelta;
      const pointsDelta = rankPointDelta(participant.team === 'A' ? expectedForA : 1 - expectedForA, won, rating.rating, 1100 + (RANKS.find((item) => item.label === rank.tier)?.order ?? 4) * 100);
      let nextTier = RANKS.find((item) => item.label === rank.tier)?.order ?? 4;
      let nextPoints = Math.max(0, rank.points + pointsDelta);
      if (nextPoints >= 100 && nextTier < RANKS.length - 2) { nextTier += 1; nextPoints -= 100; }
      if (nextPoints === 0 && pointsDelta < 0 && nextTier > 0 && rank.points === 0) { nextTier -= 1; nextPoints = 70; }
      const tierLabel = RANKS[nextTier]?.label ?? rank.tier;
      await tx.update(ratings).set({ rating: rating.rating + delta, deviation: Math.max(40, rating.deviation * 0.98), matches: sql`${ratings.matches} + 1`, provisionalMatches: sql`least(5, ${ratings.provisionalMatches} + 1)`, lastPlayedAt: new Date(), inactivityPenalty: 0, isInactive: false, updatedAt: new Date() }).where(eq(ratings.id, rating.id));
      await tx.update(rankStates).set({ tier: tierLabel, points: nextPoints, peakTier: nextTier > (RANKS.find((item) => item.label === rank.peakTier)?.order ?? 0) ? tierLabel : rank.peakTier, updatedAt: new Date() }).where(eq(rankStates.id, rank.id));
      await tx.insert(ratingEvents).values({ matchId, userId: participant.userId, beforeRating: rating.rating, afterRating: rating.rating + delta, delta, policyVersion: 'glicko-doubles-v1' });
      if (activeSeason) {
        const seasonDelta = Math.max(0, 20 + pointsDelta);
        await tx.insert(seasonStats).values({ seasonId: activeSeason.id, userId: participant.userId, points: seasonDelta, wins: won ? 1 : 0, matches: 1 }).onConflictDoUpdate({ target: [seasonStats.seasonId, seasonStats.userId], set: { points: sql`${seasonStats.points} + ${seasonDelta}`, wins: sql`${seasonStats.wins} + ${won ? 1 : 0}`, matches: sql`${seasonStats.matches} + 1`, updatedAt: new Date() } });
      }
    }
    await tx.update(matches).set({ status: 'validated', validatedAt: new Date(), updatedAt: new Date() }).where(eq(matches.id, matchId));
  });
  return true;
}
