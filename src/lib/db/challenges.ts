import { and, eq, gt, inArray, notInArray } from 'drizzle-orm';
import { areCompetitivePlayersCompatible, areTeamSidesCompatible, normalizeCourtSide } from '@/lib/domain/matchmaking';
import type { CourtSide, MatchMode } from '@/lib/types';
import { getMatchDurationMinutes, getResultDeadline } from '@/lib/match-config';
import { categoryFromTier } from '@/lib/ranks';
import { db } from './index';
import { notifyMatchParticipants, notifyUsers } from './notifications';
import { clubs, matchChallengeMembers, matchChallenges, matchParticipants, matchRooms, matches, rankStates, ratings, roomParticipants, users } from './schema';

type ChallengePlayer = {
  id: string;
  displayName: string;
  rating: number;
  tier: string;
  suspendedUntil: Date | null;
};

export type CreateDirectChallengeInput = {
  createdById: string;
  partnerId: string;
  targetId: string;
  targetPartnerId: string;
  mode: MatchMode;
  startsAt: Date;
  city: string;
  clubId?: string;
  timezoneOffset: number;
  sidePreference: CourtSide;
};

export type DirectChallengeDecision = 'accept' | 'decline' | 'suggest' | 'cancel';

function participantKey(userIds: string[]) {
  return [...userIds].sort().join(':');
}

function teamPairKey(rows: Array<{ userId: string; team: string }>) {
  const ids = new Set(rows.map((row) => row.userId));
  if (ids.size !== 4) return '';
  const teams = ['A', 'B'].map((team) => rows.filter((row) => row.team === team).map((row) => row.userId).sort().join(','));
  if (teams.some((team) => team.split(',').filter(Boolean).length !== 2)) return '';
  return teams.sort().join('|');
}

function futureDate(value: Date) {
  return !Number.isNaN(value.getTime()) && value.getTime() > Date.now();
}

async function loadChallengePlayers(userIds: string[]) {
  if (!db || userIds.length === 0) return [] as ChallengePlayer[];
  const rows = await db.select({ id: users.id, displayName: users.displayName, rating: ratings.rating, tier: rankStates.tier, suspendedUntil: ratings.suspendedUntil })
    .from(users)
    .innerJoin(ratings, eq(ratings.userId, users.id))
    .innerJoin(rankStates, eq(rankStates.userId, users.id))
    .where(and(inArray(users.id, userIds), eq(users.role, 'player'), eq(users.isActive, true)));
  return rows;
}

async function countRecentRematches(userIds: string[], cutoff: Date, expectedTeams: string) {
  if (!db) return 0;
  const rows = await db.select({ matchId: matchParticipants.matchId, userId: matchParticipants.userId, team: matchParticipants.team })
    .from(matchParticipants)
    .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
    .where(and(inArray(matchParticipants.userId, userIds), eq(matches.mode, 'ranked'), gt(matches.createdAt, cutoff), notInArray(matches.status, ['cancelled', 'no-show'])));
  const byMatch = new Map<string, Array<{ userId: string; team: string }>>();
  for (const row of rows) byMatch.set(row.matchId, [...(byMatch.get(row.matchId) ?? []), row]);
  let count = 0;
  for (const participants of byMatch.values()) {
    if (participants.length === 4 && participantKey(participants.map((item) => item.userId)) === participantKey(userIds) && teamPairKey(participants) === expectedTeams) count += 1;
  }
  return count;
}

export async function createDirectChallenge(input: CreateDirectChallengeInput) {
  if (!db) return { error: 'database-not-configured' as const };
  const userIds = [input.createdById, input.partnerId, input.targetId, input.targetPartnerId];
  if (userIds.some((id) => !id) || new Set(userIds).size !== 4) return { error: 'invalid-players' as const };
  if (!futureDate(input.startsAt) || !input.city.trim()) return { error: 'invalid-time' as const };

  const players = await loadChallengePlayers(userIds);
  if (players.length !== userIds.length) return { error: 'invalid-players' as const };
  if (input.clubId) {
    const [activeClub] = await db.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.id, input.clubId), eq(clubs.isActive, true))).limit(1);
    if (!activeClub) return { error: 'club-not-found' as const };
  }

  const playerById = new Map(players.map((player) => [player.id, player]));
  const competitivePlayers = userIds.map((id) => ({ id, rating: playerById.get(id)!.rating, tier: playerById.get(id)!.tier }));
  if (input.mode === 'ranked') {
    if (!areCompetitivePlayersCompatible(competitivePlayers)) return { error: 'incompatible' as const };
    if (players.some((player) => player.suspendedUntil && player.suspendedUntil > new Date())) return { error: 'suspended' as const };
  }

  const expectedTeams = teamPairKey([
    { userId: input.createdById, team: 'A' },
    { userId: input.partnerId, team: 'A' },
    { userId: input.targetId, team: 'B' },
    { userId: input.targetPartnerId, team: 'B' },
  ]);
  const key = participantKey(userIds);
  const [duplicate] = await db.select({ id: matchChallenges.id }).from(matchChallenges).where(and(eq(matchChallenges.participantKey, key), eq(matchChallenges.status, 'pending'))).limit(1);
  if (duplicate) return { error: 'duplicate' as const };
  if (input.mode === 'ranked') {
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    if (await countRecentRematches(userIds, cutoff, expectedTeams) >= 2) return { error: 'repeat-limit' as const };
  }

  const result = await db.transaction(async (tx) => {
    const now = new Date();
    const [created] = await tx.insert(matchChallenges).values({ createdById: input.createdById, participantKey: key, mode: input.mode, status: 'pending', startsAt: input.startsAt, city: input.city.trim(), clubId: input.clubId || null, timezoneOffset: input.timezoneOffset, matchId: null }).returning();
    await tx.insert(matchChallengeMembers).values([
      { challengeId: created.id, userId: input.createdById, team: 'A', acceptance: 'accepted', acceptedAt: now, sidePreference: normalizeCourtSide(input.sidePreference) },
      { challengeId: created.id, userId: input.partnerId, team: 'A', acceptance: 'pending', acceptedAt: null, sidePreference: 'any' },
      { challengeId: created.id, userId: input.targetId, team: 'B', acceptance: 'pending', acceptedAt: null, sidePreference: 'any' },
      { challengeId: created.id, userId: input.targetPartnerId, team: 'B', acceptance: 'pending', acceptedAt: null, sidePreference: 'any' },
    ]);
    return { challengeId: created.id, creatorName: playerById.get(input.createdById)?.displayName ?? 'Um jogador' };
  });

  await notifyUsers(userIds.filter((id) => id !== input.createdById), {
    type: 'direct-challenge',
    title: 'Você recebeu um desafio direto',
    body: `${result.creatorName} desafiou sua dupla. Confira o horário e aceite ou sugira outro no matchmaking.`,
    href: '/matchmaking',
    dedupeKey: `direct-challenge:${result.challengeId}`,
  });
  return { challengeId: result.challengeId, created: true as const };
}

export async function decideDirectChallenge(challengeId: string, userId: string, decision: DirectChallengeDecision, suggestedStartsAt?: Date, sidePreference?: CourtSide) {
  if (!db) return { error: 'database-not-configured' as const };
  if (decision === 'suggest' && (!suggestedStartsAt || !futureDate(suggestedStartsAt))) return { error: 'invalid-time' as const };

  const result = await db.transaction(async (tx) => {
    const [challenge] = await tx.select().from(matchChallenges).where(eq(matchChallenges.id, challengeId)).limit(1);
    const members = await tx.select().from(matchChallengeMembers).where(eq(matchChallengeMembers.challengeId, challengeId));
    if (!challenge || members.length !== 4) return { error: 'not-found' as const };
    const current = members.find((member) => member.userId === userId);
    if (!current) return { error: 'not-allowed' as const };
    const userIds = members.map((member) => member.userId);
    const now = new Date();

    if (decision === 'cancel') {
      if (challenge.createdById !== userId) return { error: 'not-allowed' as const };
      const [cancelled] = await tx.update(matchChallenges).set({ status: 'cancelled', updatedAt: now }).where(and(eq(matchChallenges.id, challengeId), eq(matchChallenges.status, 'pending'))).returning({ id: matchChallenges.id });
      if (!cancelled) return { error: 'already-decided' as const };
      return { status: 'cancelled' as const, challengeId, userIds, acceptedCount: 0 };
    }

    if (challenge.status !== 'pending') return { error: 'already-decided' as const };

    if (decision === 'decline') {
      await tx.update(matchChallengeMembers).set({ acceptance: 'declined', acceptedAt: null, updatedAt: now }).where(eq(matchChallengeMembers.id, current.id));
      const [declined] = await tx.update(matchChallenges).set({ status: 'declined', updatedAt: now }).where(and(eq(matchChallenges.id, challengeId), eq(matchChallenges.status, 'pending'))).returning({ id: matchChallenges.id });
      if (!declined) return { error: 'already-decided' as const };
      return { status: 'declined' as const, challengeId, userIds, acceptedCount: 0 };
    }

    if (decision === 'suggest') {
      if (challenge.createdById === userId) return { error: 'not-allowed' as const };
      const nextSide = sidePreference ? normalizeCourtSide(sidePreference) : normalizeCourtSide(current.sidePreference);
      await tx.update(matchChallengeMembers).set({ acceptance: 'pending', acceptedAt: null, updatedAt: now }).where(eq(matchChallengeMembers.challengeId, challengeId));
      await tx.update(matchChallengeMembers).set({ acceptance: 'accepted', acceptedAt: now, sidePreference: nextSide, updatedAt: now }).where(eq(matchChallengeMembers.id, current.id));
      await tx.update(matchChallenges).set({ startsAt: suggestedStartsAt!, updatedAt: now }).where(and(eq(matchChallenges.id, challengeId), eq(matchChallenges.status, 'pending')));
      return { status: 'suggested' as const, challengeId, userIds, acceptedCount: 1 };
    }

    const nextSide = sidePreference ? normalizeCourtSide(sidePreference) : normalizeCourtSide(current.sidePreference);
    const hypothetical = members.map((member) => member.id === current.id ? { ...member, acceptance: 'accepted', sidePreference: nextSide } : member);
    const acceptedCount = hypothetical.filter((member) => member.acceptance === 'accepted').length;
    if (acceptedCount === 4) {
      const playerRows = await tx.select({ id: users.id, rating: ratings.rating, tier: rankStates.tier, suspendedUntil: ratings.suspendedUntil }).from(users).innerJoin(ratings, eq(ratings.userId, users.id)).innerJoin(rankStates, eq(rankStates.userId, users.id)).where(and(inArray(users.id, userIds), eq(users.role, 'player'), eq(users.isActive, true)));
      if (playerRows.length !== 4) return { error: 'invalid-players' as const };
      const playersById = new Map(playerRows.map((player) => [player.id, player]));
      if (challenge.mode === 'ranked') {
        if (!areCompetitivePlayersCompatible(userIds.map((id) => ({ id, rating: playersById.get(id)!.rating, tier: playersById.get(id)!.tier })))) return { error: 'incompatible' as const };
        if (playerRows.some((player) => player.suspendedUntil && player.suspendedUntil > now)) return { error: 'suspended' as const };
      }
      const teamA = hypothetical.filter((member) => member.team === 'A').map((member) => ({ id: member.userId, rating: playersById.get(member.userId)!.rating, tier: playersById.get(member.userId)!.tier, sidePreference: normalizeCourtSide(member.sidePreference) }));
      const teamB = hypothetical.filter((member) => member.team === 'B').map((member) => ({ id: member.userId, rating: playersById.get(member.userId)!.rating, tier: playersById.get(member.userId)!.tier, sidePreference: normalizeCourtSide(member.sidePreference) }));
      if (!areTeamSidesCompatible(teamA) || !areTeamSidesCompatible(teamB)) return { error: 'side-incompatible' as const };

      const [claimed] = await tx.update(matchChallenges).set({ status: 'forming', updatedAt: now }).where(and(eq(matchChallenges.id, challengeId), eq(matchChallenges.status, 'pending'))).returning({ id: matchChallenges.id });
      if (!claimed) return { error: 'already-decided' as const };
      await tx.update(matchChallengeMembers).set({ acceptance: 'accepted', acceptedAt: now, sidePreference: nextSide, updatedAt: now }).where(eq(matchChallengeMembers.id, current.id));

      const durationMinutes = getMatchDurationMinutes();
      const [room] = await tx.insert(matchRooms).values({ hostId: challenge.createdById, clubId: challenge.clubId, mode: challenge.mode, kind: 'direct-challenge', status: 'full', startsAt: challenge.startsAt, durationMinutes, tierMin: challenge.mode === 'ranked' ? categoryFromTier(playersById.get(challenge.createdById)?.tier) || null : null, preferences: ['Desafio direto', 'Duplas escolhidas'] }).returning();
      await tx.insert(roomParticipants).values(hypothetical.map((member) => ({ roomId: room.id, userId: member.userId, team: member.team, status: 'joined' })));
      const [match] = await tx.insert(matches).values({ roomId: room.id, mode: challenge.mode, status: 'confirmed', resultDeadlineAt: getResultDeadline(challenge.startsAt, durationMinutes) }).returning();
      await tx.insert(matchParticipants).values(hypothetical.map((member) => ({ matchId: match.id, userId: member.userId, team: member.team, matchAcceptance: 'accepted', matchAcceptedAt: now, confirmation: 'pending' })));
      await tx.update(matchChallenges).set({ status: 'matched', matchId: match.id, updatedAt: now }).where(eq(matchChallenges.id, challengeId));
      return { status: 'matched' as const, challengeId, userIds, acceptedCount: 4, matchId: match.id };
    }

    await tx.update(matchChallengeMembers).set({ acceptance: 'accepted', acceptedAt: now, sidePreference: nextSide, updatedAt: now }).where(eq(matchChallengeMembers.id, current.id));
    return { status: 'accepted' as const, challengeId, userIds, acceptedCount };
  });

  if ('error' in result) return result;
  if (result.status === 'matched') {
    await notifyMatchParticipants(result.matchId, { type: 'match-formed', title: 'Desafio confirmado — confirme presença', body: 'Os quatro aceitaram o desafio. No dia e horário marcados, todos precisam confirmar presença na quadra.', href: `/match/${result.matchId}`, dedupeKey: `match-formed:${result.matchId}` });
  } else if (result.status === 'declined' || result.status === 'cancelled') {
    await notifyUsers(result.userIds, { type: 'direct-challenge-response', title: result.status === 'declined' ? 'Desafio recusado' : 'Desafio cancelado', body: result.status === 'declined' ? 'Um dos jogadores recusou o desafio direto. Nenhuma partida foi criada.' : 'O desafio direto foi cancelado.', href: '/matchmaking', dedupeKey: `direct-challenge-${result.status}:${result.challengeId}` });
  } else if (result.status === 'suggested') {
    await notifyUsers(result.userIds.filter((id) => id !== userId), { type: 'direct-challenge-suggestion', title: 'Novo horário sugerido', body: 'Um novo horário foi proposto para o desafio. Abra o matchmaking para aceitar ou sugerir novamente.', href: '/matchmaking', dedupeKey: `direct-challenge-suggestion:${result.challengeId}:${suggestedStartsAt!.toISOString()}` });
  } else {
    await notifyUsers(result.userIds.filter((id) => id !== userId), { type: 'direct-challenge-accepted', title: 'Aceite de desafio registrado', body: `Um jogador aceitou o desafio direto (${result.acceptedCount}/4).`, href: '/matchmaking', dedupeKey: `direct-challenge-accepted:${result.challengeId}:${result.acceptedCount}:${userId}` });
  }
  return result;
}
