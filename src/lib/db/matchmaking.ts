import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { areCompetitivePlayersCompatible, areTeamSidesCompatible, buildTeamAssignments, findAvailabilityOverlap, findMatchmakingGroup, normalizeCourtSide, type CompetitivePlayer, type MatchmakingParty } from '@/lib/domain/matchmaking';
import type { CourtSide } from '@/lib/types';
import { getMatchDurationMinutes, getResultDeadline } from '@/lib/match-config';
import { areCanonicalLocationsEqual, staleLocationReadiness } from '@/lib/location-domain';
import type { VerifiedLocation } from '@/lib/location';
import { categoryFromTier } from '@/lib/ranks';
import { isRankedSuspended } from './competition';
import { db } from './index';
import { notifyMatchParticipants, notifyUsers } from './notifications';
import { matchParticipants, matchRooms, matchSearches, matches, rankStates, ratings, roomParticipants, users } from './schema';

export type CreateMatchSearchInput = {
  userId: string;
  partnerId?: string;
  partyType: 'solo' | 'duo';
  mode: 'ranked' | 'friendly';
  dates: string[];
  from: string;
  to: string;
  city: string;
  state?: string;
  country?: string;
  clubId?: string;
  timezoneOffset: number;
  sidePreference: CourtSide;
  replace?: boolean;
};

type SearchPlayer = CompetitivePlayer & { city: string };

type MatchmakingTransaction = Parameters<Parameters<NonNullable<typeof db>['transaction']>[0]>[0];
type MatchmakingResult = { matched: boolean; matchId?: string; searchIds?: string[] };
const MATCHMAKING_LOCK_KEY = 1_947_320_611;
const MATCHMAKING_BATCH_LIMIT = 50;

export async function lockMatchmakingQueue(tx: MatchmakingTransaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(${MATCHMAKING_LOCK_KEY})`);
}

async function loadSearchPlayers(userIds: string[]) {
  if (!db || userIds.length === 0) return new Map<string, SearchPlayer>();
  const rows = await db.select({ id: users.id, city: users.city, rating: ratings.rating, tier: rankStates.tier }).from(users).innerJoin(ratings, eq(ratings.userId, users.id)).innerJoin(rankStates, eq(rankStates.userId, users.id)).where(and(inArray(users.id, userIds), eq(users.isActive, true)));
  return new Map(rows.map((player) => [player.id, { id: player.id, city: player.city, rating: player.rating, tier: player.tier }]));
}

function toDateWithOffset(date: string, time: string, timezoneOffset: number) {
  const absoluteOffset = Math.abs(timezoneOffset);
  const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const minutes = String(absoluteOffset % 60).padStart(2, '0');
  const sign = timezoneOffset <= 0 ? '+' : '-';
  return new Date(`${date}T${time}:00${sign}${hours}:${minutes}`);
}

async function tryMatchmaking(tx: MatchmakingTransaction, timezoneOffset: number): Promise<MatchmakingResult> {
  const now = new Date();
  const activeRows = await tx.select().from(matchSearches).where(eq(matchSearches.status, 'searching'));
  const activeUserIds = Array.from(new Set(activeRows.flatMap((search) => [search.userId, ...(search.partnerId ? [search.partnerId] : [])])));
  if (activeUserIds.length === 0) return { matched: false };
  const activePlayersRows = await tx.select({ id: users.id, city: users.city, rating: ratings.rating, tier: rankStates.tier }).from(users).innerJoin(ratings, eq(ratings.userId, users.id)).innerJoin(rankStates, eq(rankStates.userId, users.id)).where(and(inArray(users.id, activeUserIds), eq(users.isActive, true)));
  const activePlayers = new Map(activePlayersRows.map((player) => [player.id, player]));
  const parties: MatchmakingParty[] = activeRows.map((search): MatchmakingParty => ({ id: search.id, partyType: search.partyType === 'duo' ? 'duo' : 'solo', dates: search.preferredDates ?? [], from: search.timeFrom, to: search.timeTo, city: search.city, state: search.state ?? undefined, country: search.country ?? undefined, clubId: search.clubId, tier: categoryFromTier(activePlayers.get(search.userId)?.tier) || '', mode: search.mode === 'friendly' ? 'friendly' : 'ranked', timezoneOffset: search.timezoneOffset, createdAt: search.updatedAt, members: [{ id: search.userId, sidePreference: normalizeCourtSide(search.sidePreference), ...activePlayers.get(search.userId) }, ...(search.partnerId ? [{ id: search.partnerId, sidePreference: normalizeCourtSide(search.partnerSidePreference), ...activePlayers.get(search.partnerId) }] : [])].filter((player): player is SearchPlayer & { sidePreference: CourtSide } => Boolean(player.rating !== undefined && player.tier !== undefined)).map((player) => ({ id: player.id, rating: player.rating, tier: player.tier, sidePreference: player.sidePreference })) })).filter((party) => party.members.length === (party.partyType === 'duo' ? 2 : 1));
  const durationMinutes = getMatchDurationMinutes();
  const group = findMatchmakingGroup(parties, { now, minimumDurationMinutes: durationMinutes });
  if (!group) return { matched: false };

  const overlap = findAvailabilityOverlap(group, durationMinutes, now);
  const assignments = buildTeamAssignments(group);
  const members = group.flatMap((party) => party.members);
  if (!overlap || Object.keys(assignments).length !== 4 || new Set(members.map((member) => member.id)).size !== 4) return { matched: false };
  const startsAt = toDateWithOffset(overlap.date, overlap.from, group[0]?.timezoneOffset ?? timezoneOffset);
  if (Number.isNaN(startsAt.getTime()) || startsAt <= now) return { matched: false };

  const groupIds = group.map((party) => party.id);
  const claimed = await tx.update(matchSearches).set({ status: 'matching', updatedAt: now }).where(and(eq(matchSearches.status, 'searching'), inArray(matchSearches.id, groupIds))).returning({ id: matchSearches.id });
  if (claimed.length !== groupIds.length) throw new Error('A busca mudou durante a claim; a transação de matchmaking deve ser revertida.');

  const [room] = await tx.insert(matchRooms).values({ hostId: members[0].id, clubId: overlap.clubId, mode: group[0].mode, kind: 'auto-match', status: 'full', startsAt, durationMinutes, tierMin: group[0].mode === 'ranked' ? categoryFromTier(members[0]?.tier) || null : null, preferences: ['Busca automática', group.length > 1 ? 'Disponibilidade em comum' : ''] }).returning();
  await tx.insert(roomParticipants).values(members.map((member) => ({ roomId: room.id, userId: member.id, team: assignments[member.id], status: 'joined' })));
  const [match] = await tx.insert(matches).values({ roomId: room.id, mode: group[0].mode, status: 'confirming', resultDeadlineAt: getResultDeadline(startsAt, durationMinutes) }).returning();
  await tx.insert(matchParticipants).values(members.map((member) => ({ matchId: match.id, userId: member.id, team: assignments[member.id], matchAcceptance: 'pending', confirmation: 'pending' })));
  await tx.update(matchSearches).set({ status: 'matched', roomId: room.id, updatedAt: now }).where(and(eq(matchSearches.status, 'matching'), inArray(matchSearches.id, groupIds)));
  return { matched: true, matchId: match.id, searchIds: groupIds };
}

async function processMatchmakingQueue(tx: MatchmakingTransaction, timezoneOffset: number, budget = MATCHMAKING_BATCH_LIMIT) {
  const results: MatchmakingResult[] = [];
  for (let count = 0; count < budget; count += 1) {
    const result = await tryMatchmaking(tx, timezoneOffset);
    if (!result.matched) return { results, budgetExhausted: false };
    results.push(result);
  }
  return { results, budgetExhausted: true };
}

async function notifyFormedMatches(results: MatchmakingResult[]) {
  for (const result of results) {
    if (result.matched && result.matchId) await notifyMatchParticipants(result.matchId, { type: 'match-formed', title: 'Partida encontrada — confirme', body: 'Encontramos quatro jogadores compatíveis. Abra a partida e confirme que você vai jogar.', href: `/match/${result.matchId}`, dedupeKey: `match-formed:${result.matchId}` });
  }
}

export async function createMatchSearch(input: CreateMatchSearchInput) {
  if (!db) return { error: 'O banco de dados não está configurado.' } as const;
  if (!input.city.trim() || !input.state?.trim() || !input.country?.trim()) return { error: 'Valide cidade, estado e país antes de iniciar a busca.' } as const;
  const canonicalState = input.state.trim();
  const canonicalCountry = input.country.trim();
  if (input.partyType === 'duo' && (!input.partnerId || input.partnerId === input.userId)) return { error: 'Escolha um parceiro diferente de você.' } as const;

  const userIds = [input.userId, ...(input.partnerId ? [input.partnerId] : [])];
  const players = await loadSearchPlayers(userIds);
  if (players.size !== userIds.length) return { error: 'Não foi possível encontrar todos os jogadores selecionados.' } as const;
  if (input.mode === 'ranked' && (!areCompetitivePlayersCompatible(userIds.map((id) => players.get(id)!)) || (await Promise.all(userIds.map((id) => isRankedSuspended(id)))).some(Boolean))) return { error: 'Os jogadores selecionados não têm ranking compatível ou estão suspensos para partidas ranqueadas.' } as const;
  const systemCategory = input.mode === 'ranked' ? categoryFromTier(players.get(input.userId)?.tier) || null : null;

  const result = await db.transaction(async (tx) => {
    await lockMatchmakingQueue(tx);
    const existingRows = await tx.select().from(matchSearches).where(and(
      inArray(matchSearches.status, ['lobby', 'searching', 'pending-partner']),
      or(inArray(matchSearches.userId, userIds), inArray(matchSearches.partnerId, userIds)),
    ));
    const ownedByCurrentUser = existingRows.filter((search) => search.userId === input.userId);
    if (existingRows.some((search) => search.userId !== input.userId)) return { error: 'Você ou seu parceiro já está em outra busca ativa.' } as const;
    const existingSearchIds = Array.from(new Set(ownedByCurrentUser.map((search) => search.id)));
    if (existingSearchIds.length > 0 && !input.replace) return { error: 'Você ou seu parceiro já está buscando uma partida.' } as const;
    const now = new Date();
    if (existingSearchIds.length > 0) await tx.update(matchSearches).set({ status: 'cancelled', updatedAt: now }).where(inArray(matchSearches.id, existingSearchIds));
    const [created] = await tx.insert(matchSearches).values({ userId: input.userId, partnerId: input.partnerId, partyType: input.partyType, mode: input.mode, status: input.partyType === 'duo' ? 'pending-partner' : 'searching', preferredDates: input.dates, timeFrom: input.from, timeTo: input.to, city: input.city.trim(), state: canonicalState, country: canonicalCountry, clubId: input.clubId || null, timezoneOffset: input.timezoneOffset, sidePreference: normalizeCourtSide(input.sidePreference), partnerSidePreference: 'any', initiatorReady: input.partyType === 'solo', partnerReady: false, tier: systemCategory }).returning();
    if (input.partyType === 'duo') return { searchId: created.id, matched: false as const, invited: true as const };
    const { results, budgetExhausted } = await processMatchmakingQueue(tx, input.timezoneOffset);
    const ownMatch = results.find((match) => match.searchIds?.includes(created.id));
    return { searchId: created.id, matched: Boolean(ownMatch), ...(ownMatch?.matchId ? { matchId: ownMatch.matchId } : {}), formedMatches: results, budgetExhausted };
  });
  if ('error' in result) return result;
  if ('invited' in result && result.invited) {
    if (input.partnerId) await notifyUsers([input.partnerId], { type: 'match-search-invitation', title: 'Convite para buscar uma partida', body: 'Você foi convidado para formar uma dupla na busca automática. Aceite o convite no matchmaking para entrar na fila.', href: '/matchmaking', dedupeKey: `match-search-invitation:${result.searchId}` });
    return result;
  }
  await notifyFormedMatches('formedMatches' in result ? result.formedMatches : []);
  const { formedMatches: _formedMatches, budgetExhausted: _budgetExhausted, ...publicResult } = result;
  return publicResult;
}

export async function decideMatchSearchInvitation(searchId: string, userId: string, decision: 'accept' | 'decline') {
  if (!db) return null;
  const [pending] = await db.select().from(matchSearches).where(and(eq(matchSearches.id, searchId), eq(matchSearches.partnerId, userId), eq(matchSearches.status, 'pending-partner'))).limit(1);
  if (!pending) return null;
  if (decision === 'accept' && pending.mode !== 'friendly') {
    const players = await loadSearchPlayers([pending.userId, userId]);
    if (players.size !== 2 || !areCompetitivePlayersCompatible(Array.from(players.values())) || (await Promise.all([pending.userId, userId].map((id) => isRankedSuspended(id)))).some(Boolean)) return { blocked: 'incompatible' as const };
  }

  const result = await db.transaction(async (tx) => {
    await lockMatchmakingQueue(tx);
    const [current] = await tx.select().from(matchSearches).where(and(eq(matchSearches.id, searchId), eq(matchSearches.partnerId, userId), eq(matchSearches.status, 'pending-partner'))).limit(1);
    if (!current) return null;
    if (decision === 'decline') {
      await tx.update(matchSearches).set({ status: 'declined', updatedAt: new Date() }).where(eq(matchSearches.id, searchId));
      return { decision, inviterId: current.userId, matchId: null, matched: false as const };
    }
    const [activated] = await tx.update(matchSearches).set({ status: 'lobby', initiatorReady: false, partnerReady: false, updatedAt: new Date() }).where(and(eq(matchSearches.id, searchId), eq(matchSearches.status, 'pending-partner'))).returning({ id: matchSearches.id });
    if (!activated) return null;
    return { decision, inviterId: current.userId, matchId: null, matched: false as const, lobby: true as const };
  });
  if (!result) return null;
  await notifyUsers([result.inviterId], { type: 'match-search-invitation-response', title: result.decision === 'accept' ? 'Dupla pronta no saguão' : 'Convite de busca recusado', body: result.decision === 'accept' ? 'Seu parceiro entrou no saguão. Agora os dois precisam confirmar que querem buscar a partida.' : 'O convite para buscar uma partida em dupla foi recusado.', href: '/matchmaking', dedupeKey: `match-search-invitation-response:${searchId}:${result.decision}` });
  return result;
}

export async function setMatchSearchReady(searchId: string, userId: string, ready: boolean, sidePreference: CourtSide, verifiedLocation?: VerifiedLocation) {
  if (!db) return null;
  const [search] = await db.select().from(matchSearches).where(and(eq(matchSearches.id, searchId), inArray(matchSearches.status, ['lobby']), or(eq(matchSearches.userId, userId), eq(matchSearches.partnerId, userId)))).limit(1);
  if (!search || !search.partnerId) return null;
  const partnerId = search.partnerId;

  const result = await db.transaction(async (tx) => {
    await lockMatchmakingQueue(tx);
    const [current] = await tx.select().from(matchSearches).where(and(eq(matchSearches.id, searchId), eq(matchSearches.status, 'lobby'))).limit(1);
    if (!current || (current.userId !== userId && current.partnerId !== userId)) return null;
    const storedLocation = current.state && current.country ? { city: current.city, state: current.state, country: current.country } : null;
    if (ready && current.mode === 'ranked' && !areCanonicalLocationsEqual(verifiedLocation, storedLocation)) return { blocked: 'location' as const };
    const now = new Date();
    const locationExpiresAt = ready && current.mode === 'ranked' && verifiedLocation ? new Date(verifiedLocation.expiresAt) : null;
    if (ready && current.mode === 'ranked' && (!locationExpiresAt || !Number.isFinite(locationExpiresAt.getTime()) || locationExpiresAt.getTime() <= now.getTime())) return { blocked: 'location' as const };
    const isInitiator = current.userId === userId;
    const nextValues = isInitiator
      ? { initiatorReady: ready, initiatorLocationExpiresAt: ready ? locationExpiresAt : null, sidePreference: normalizeCourtSide(sidePreference), updatedAt: now }
      : { partnerReady: ready, partnerLocationExpiresAt: ready ? locationExpiresAt : null, partnerSidePreference: normalizeCourtSide(sidePreference), updatedAt: now };
    const [updated] = await tx.update(matchSearches).set(nextValues).where(and(eq(matchSearches.id, searchId), eq(matchSearches.status, 'lobby'))).returning();
    if (!updated) return null;
    if (!updated.initiatorReady || !updated.partnerReady) return { search: updated, started: false as const, matched: false as const, matchId: null };

    if (updated.mode !== 'friendly') {
      const stale = staleLocationReadiness(now, {
        initiatorReady: updated.initiatorReady,
        initiatorExpiresAt: updated.initiatorLocationExpiresAt,
        partnerReady: updated.partnerReady,
        partnerExpiresAt: updated.partnerLocationExpiresAt,
      });
      if (stale.initiator || stale.partner) {
        const staleReadiness = {
          ...(stale.initiator ? { initiatorReady: false, initiatorLocationExpiresAt: null } : {}),
          ...(stale.partner ? { partnerReady: false, partnerLocationExpiresAt: null } : {}),
          updatedAt: now,
        };
        const [cleaned] = await tx.update(matchSearches).set(staleReadiness).where(and(eq(matchSearches.id, searchId), eq(matchSearches.status, 'lobby'))).returning();
        return cleaned ? { blocked: 'location-expired' as const } : null;
      }
    }

    const updatedPartnerId = updated.partnerId;
    if (!updatedPartnerId) return null;
    const players = await loadSearchPlayers([updated.userId, updatedPartnerId]);
    const parties: MatchmakingParty = {
      id: updated.id,
      partyType: 'duo',
      dates: updated.preferredDates ?? [],
      from: updated.timeFrom,
      to: updated.timeTo,
      city: updated.city,
      state: updated.state ?? undefined,
      country: updated.country ?? undefined,
      clubId: updated.clubId,
      tier: categoryFromTier(players.get(updated.userId)?.tier) || '',
      mode: updated.mode === 'friendly' ? 'friendly' : 'ranked',
      timezoneOffset: updated.timezoneOffset,
      createdAt: now,
      members: [
        { id: updated.userId, rating: players.get(updated.userId)?.rating ?? 0, tier: players.get(updated.userId)?.tier ?? '', sidePreference: normalizeCourtSide(updated.sidePreference) },
        { id: updatedPartnerId, rating: players.get(updatedPartnerId)?.rating ?? 0, tier: players.get(updatedPartnerId)?.tier ?? '', sidePreference: normalizeCourtSide(updated.partnerSidePreference) },
      ],
    };
    if (players.size !== 2 || !areCompetitivePlayersCompatible(parties.members) || !areTeamSidesCompatible(parties.members)) return { blocked: 'incompatible' as const };
    const [activated] = await tx.update(matchSearches).set({ status: 'searching', updatedAt: now }).where(and(eq(matchSearches.id, searchId), eq(matchSearches.status, 'lobby'))).returning({ id: matchSearches.id });
    if (!activated) return null;
    const { results, budgetExhausted } = await processMatchmakingQueue(tx, updated.timezoneOffset);
    const ownMatch = results.find((match) => match.searchIds?.includes(updated.id));
    return { search: { ...updated, status: 'searching' }, started: true as const, matched: Boolean(ownMatch), ...(ownMatch?.matchId ? { matchId: ownMatch.matchId } : {}), formedMatches: results, budgetExhausted };
  });
  if (!result) return null;
  if ('blocked' in result) return result;
  const usersToNotify = [search.userId, partnerId];
  if (result.started) await notifyUsers(usersToNotify, { type: 'match-search-started', title: 'Busca iniciada', body: 'Os dois jogadores confirmaram. O sistema está procurando uma partida compatível.', href: '/matchmaking', dedupeKey: `match-search-started:${searchId}` });
  await notifyFormedMatches('formedMatches' in result ? result.formedMatches : []);
  if ('formedMatches' in result) {
    const { formedMatches: _formedMatches, budgetExhausted: _budgetExhausted, ...publicResult } = result;
    return publicResult;
  }
  return result;
}

export async function cancelMatchSearch(userId: string, searchId?: string) {
  if (!db) return false;
  const filters = [inArray(matchSearches.status, ['lobby', 'searching', 'pending-partner']), or(eq(matchSearches.userId, userId), eq(matchSearches.partnerId, userId))];
  if (searchId) filters.push(eq(matchSearches.id, searchId));
  const result = await db.transaction(async (tx) => {
    await lockMatchmakingQueue(tx);
    return tx.update(matchSearches).set({ status: 'cancelled', updatedAt: new Date() }).where(and(...filters)).returning({ id: matchSearches.id });
  });
  return result.length > 0;
}

/** Reprocesses the current queue from a backend maintenance job; never called from read/polling paths. */
export async function reprocessMatchmakingQueue() {
  if (!db) return { processedMatches: 0, budgetExhausted: false };
  const result = await db.transaction(async (tx) => {
    await lockMatchmakingQueue(tx);
    return processMatchmakingQueue(tx, MATCHMAKING_BATCH_LIMIT);
  });
  await notifyFormedMatches(result.results);
  return { processedMatches: result.results.length, budgetExhausted: result.budgetExhausted };
}
