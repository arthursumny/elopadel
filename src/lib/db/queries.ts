import { aliasedTable, and, desc, eq, gt, ilike, inArray, lt, ne, notInArray, or, sql } from 'drizzle-orm';
import { currentUserId } from '@/lib/auth';
import { resultVoteCounts } from '@/lib/domain/match';
import { categoryFromTier, RANKS, getRank } from '@/lib/ranks';
import { getMatchDurationMinutes, getResultDeadline } from '@/lib/match-config';
import type { ActiveMatchSearch, ActivityItem, AdminClub, AdminPlayer, Friend, FriendRequest, HistoryData, HistoryItem, LeaderboardEntry, MatchChallenge, MatchDetails, MatchSearchInvitation, MatchmakingPlayerOption, OpenRoom, Player, RoomInvitation, SeasonData, SeasonLeaderboardEntry } from '@/lib/types';
import { normalizeCourtSide } from '@/lib/domain/matchmaking';
import { resolveGripoClubId } from '@/lib/integrations/gripo';
import { db } from './index';
import { getPlayer } from '@/lib/runtime-store';
import { clubAccounts, clubMemberships, clubs, friendships, matchChallengeMembers, matchChallenges, matchParticipants, matchRooms, matchSearches, matches, ratingEvents, ratings, rankStates, roomInvitations, roomParticipants, seasonStats, seasons, users } from './schema';

function hasDatabase() {
  return Boolean(db);
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function rankOrder(label: string) {
  return RANKS.find((rank) => rank.label === label)?.order ?? 4;
}

export async function loadCurrentPlayer(): Promise<Player> {
  if (!hasDatabase()) {
    const userId = await currentUserId();
    const runtimePlayer = userId ? getPlayer(userId) : null;
    if (runtimePlayer) return runtimePlayer;
    return { id: 'anonymous', displayName: 'Jogador', handle: '@jogador', initials: 'JO', city: '', state: '', country: 'Brasil', phone: '', club: 'Clube ainda não definido', rating: { rating: 1500, deviation: 350, volatility: 0.06, matches: 0, provisional: true }, rank: { tier: getRank('5ª III'), points: 0, maxPoints: 100, peakLabel: '5ª III' }, seasonPoints: 0, globalPosition: 0, cityPosition: 0, clubPosition: 0, streak: 0, lastPlayed: 'Ainda não jogou' };
  }
  const userId = await currentUserId();
  if (!userId) throw new Error('Jogador não autenticado.');
  const [user] = await db!.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error('Jogador não encontrado.');
  const [rating] = await db!.select().from(ratings).where(eq(ratings.userId, user.id)).limit(1);
  const [rankState] = await db!.select().from(rankStates).where(eq(rankStates.userId, user.id)).limit(1);
  const [membership] = await db!.select({ name: clubs.name }).from(clubMemberships).innerJoin(clubs, and(eq(clubs.id, clubMemberships.clubId), eq(clubs.isActive, true))).where(and(eq(clubMemberships.userId, user.id), eq(clubMemberships.status, 'approved'), eq(clubMemberships.isPrimary, true))).limit(1);
  const rank = rankState?.tier ?? '5ª II';
  const pointValue = rankState?.points ?? 0;
  const playerRating = rating?.rating ?? 1500;
  const playerDeviation = rating?.deviation ?? 350;
  const lastPlayedAt = rating?.lastPlayedAt ?? (rating?.matches ? rating.updatedAt : null);
  const rankings = await loadLeaderboard();
  const selfEntry = rankings.find((entry) => entry.handle === user.handle);
  const [activeSeason] = await db!.select({ id: seasons.id }).from(seasons).where(eq(seasons.status, 'active')).limit(1);
  const [seasonStat] = activeSeason ? await db!.select({ points: seasonStats.points }).from(seasonStats).where(and(eq(seasonStats.seasonId, activeSeason.id), eq(seasonStats.userId, user.id))).limit(1) : [];
  const cityPosition = rankings.filter((entry) => entry.city === user.city).findIndex((entry) => entry.handle === user.handle) + 1;
  const clubPosition = membership?.name ? rankings.filter((entry) => entry.club === membership.name).findIndex((entry) => entry.handle === user.handle) + 1 : 0;
  return {
    id: user.id,
    displayName: user.displayName,
    handle: user.handle,
    initials: initials(user.displayName),
    city: user.city,
    state: user.state,
    country: user.country,
    phone: user.phone ?? undefined,
    club: membership?.name ?? 'Clube ainda não definido',
    rating: { rating: playerRating, deviation: playerDeviation, volatility: rating?.volatility ?? 0.06, matches: rating?.matches ?? 0, provisional: (rating?.provisionalMatches ?? 0) < 5, isInactive: rating?.isInactive ?? false },
    rank: { tier: getRank(rank), points: pointValue, maxPoints: 100, peakLabel: rankState?.peakTier ?? rank, promotion: rankOrder(rank) < RANKS.length - 1 ? { wins: rankState?.promotionWins ?? 0, losses: rankState?.promotionLosses ?? 0, needed: 2 } : undefined },
    seasonPoints: seasonStat?.points ?? 0,
    globalPosition: selfEntry?.position ?? 0,
    cityPosition: cityPosition || 0,
    clubPosition: clubPosition || 0,
    streak: 0,
    lastPlayed: lastPlayedAt ? new Date(lastPlayedAt).toLocaleDateString('pt-BR') : 'Ainda não jogou',
  };
}

export async function loadOpenRooms(): Promise<OpenRoom[]> {
  if (!hasDatabase()) return [];
  const rows = await db!.select({ room: matchRooms, clubName: clubs.name, clubCity: clubs.city, hostName: users.displayName, hostTier: rankStates.tier, matchId: matches.id }).from(matchRooms).leftJoin(clubs, eq(matchRooms.clubId, clubs.id)).leftJoin(users, eq(matchRooms.hostId, users.id)).leftJoin(rankStates, eq(rankStates.userId, matchRooms.hostId)).leftJoin(matches, eq(matches.roomId, matchRooms.id)).where(and(eq(matchRooms.status, 'open'), gt(matchRooms.startsAt, new Date()))).orderBy(matchRooms.startsAt).limit(30);
  return Promise.all(rows.map(async ({ room, clubName, clubCity, hostName, hostTier, matchId }) => {
    const participants = await db!.select({ id: roomParticipants.id }).from(roomParticipants).where(eq(roomParticipants.roomId, room.id));
    const startsAt = new Date(room.startsAt);
    const systemTier = room.mode === 'ranked' ? categoryFromTier(hostTier ?? undefined) || 'Nível em definição' : 'Todos os níveis';
    return { id: room.id, clubId: room.clubId ?? undefined, title: `${room.mode === 'ranked' ? 'Ranqueada' : 'Amistosa'} • ${startsAt.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, club: clubName ?? 'Clube a definir', city: clubCity ?? 'Local a definir', startsAt: startsAt.toISOString(), date: startsAt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }), time: startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), mode: room.mode as OpenRoom['mode'], tier: systemTier, slots: Math.max(0, 4 - participants.length), totalSlots: 4, host: hostName ?? 'Jogador', distance: '—', tags: room.preferences ?? [], matchId: matchId ?? undefined };
  }));
}

export async function loadLeaderboard(): Promise<LeaderboardEntry[]> {
  if (!hasDatabase()) return [];
  const rows = await db!.select({ user: users, rating: ratings, rank: rankStates, club: clubs.name }).from(users).innerJoin(ratings, eq(ratings.userId, users.id)).innerJoin(rankStates, eq(rankStates.userId, users.id)).leftJoin(clubMemberships, and(eq(clubMemberships.userId, users.id), eq(clubMemberships.status, 'approved'), eq(clubMemberships.isPrimary, true))).leftJoin(clubs, and(eq(clubs.id, clubMemberships.clubId), eq(clubs.isActive, true))).where(eq(users.isActive, true)).orderBy(desc(sql`case when ${ratings.isInactive} then 0 else 1 end`), desc(sql`${ratings.rating} - (${ratings.deviation} * 0.25)`));
  return rows.map(({ user, rating, rank, club }, index) => ({ position: index + 1, player: user.displayName, handle: user.handle, initials: initials(user.displayName), club: club ?? 'Sem clube', city: user.city, state: user.state, tier: rank.tier, points: rank.points, delta: Math.round(rating.rating - 1500), active: user.isActive && !rating.isInactive }));
}

export async function loadClubs() {
  if (!hasDatabase()) return [];
  return db!.select({ id: clubs.id, name: clubs.name, city: clubs.city, state: clubs.state, country: clubs.country, gripoUrl: clubs.gripoUrl }).from(clubs).where(eq(clubs.isActive, true)).orderBy(clubs.state, clubs.city, clubs.name);
}

export async function searchPlayers(userId: string, query: string): Promise<MatchmakingPlayerOption[]> {
  if (!hasDatabase()) return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const pattern = `%${trimmed}%`;
  const rows = await db!.select({ id: users.id, displayName: users.displayName, handle: users.handle, city: users.city, tier: rankStates.tier, rating: ratings.rating }).from(users).leftJoin(rankStates, eq(rankStates.userId, users.id)).leftJoin(ratings, eq(ratings.userId, users.id)).where(and(eq(users.role, 'player'), eq(users.isActive, true), ne(users.id, userId), or(ilike(users.handle, pattern), ilike(users.displayName, pattern)))).orderBy(users.displayName).limit(20);
  const playerIds = rows.map((player) => player.id);
  const relationRows = playerIds.length > 0
    ? await db!.select().from(friendships).where(and(or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)), or(inArray(friendships.requesterId, playerIds), inArray(friendships.addresseeId, playerIds))))
    : [];
  const relationships = new Map<string, MatchmakingPlayerOption['relationship']>();
  for (const relation of relationRows) {
    const targetId = relation.requesterId === userId ? relation.addresseeId : relation.requesterId;
    relationships.set(targetId, relation.status === 'accepted' ? 'accepted' : relation.status === 'pending' ? (relation.requesterId === userId ? 'pending' : 'incoming') : 'none');
  }
  return rows.map((player) => ({ id: player.id, displayName: player.displayName, handle: player.handle, city: player.city, tier: player.tier ?? '6ª III', rating: player.rating ?? 1500, relationship: relationships.get(player.id) ?? 'none' }));
}

export async function loadFriends(userId: string): Promise<Friend[]> {
  if (!hasDatabase()) return [];
  const relationRows = await db!.select().from(friendships).where(and(eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))).orderBy(desc(friendships.createdAt));
  const playerIds = Array.from(new Set(relationRows.map((relation) => relation.requesterId === userId ? relation.addresseeId : relation.requesterId)));
  if (playerIds.length === 0) return [];
  const players = await db!.select({ id: users.id, displayName: users.displayName, handle: users.handle, city: users.city, tier: rankStates.tier, rating: ratings.rating }).from(users).leftJoin(rankStates, eq(rankStates.userId, users.id)).leftJoin(ratings, eq(ratings.userId, users.id)).where(and(inArray(users.id, playerIds), eq(users.role, 'player'), eq(users.isActive, true)));
  const playersById = new Map(players.map((player) => [player.id, player]));
  const mapped = relationRows.map((relation): Friend | null => {
    const playerId = relation.requesterId === userId ? relation.addresseeId : relation.requesterId;
    const player = playersById.get(playerId);
    if (!player) return null;
    return { id: player.id, displayName: player.displayName, handle: player.handle, city: player.city, tier: player.tier ?? '6ª III', rating: player.rating ?? 1500, relationship: 'accepted', friendshipId: relation.id, createdAt: relation.createdAt.toISOString() };
  });
  return mapped.filter((friend): friend is Friend => friend !== null);
}

export async function loadPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
  if (!hasDatabase()) return [];
  const rows = await db!.select({ friendship: friendships, player: users, tier: rankStates.tier, rating: ratings.rating }).from(friendships).innerJoin(users, eq(users.id, friendships.requesterId)).leftJoin(rankStates, eq(rankStates.userId, users.id)).leftJoin(ratings, eq(ratings.userId, users.id)).where(and(eq(friendships.addresseeId, userId), eq(friendships.status, 'pending'), eq(users.role, 'player'), eq(users.isActive, true))).orderBy(desc(friendships.createdAt));
  return rows.map(({ friendship, player, tier, rating }) => ({ id: friendship.id, playerId: player.id, displayName: player.displayName, handle: player.handle, city: player.city, tier: tier ?? '6ª III', rating: rating ?? 1500, relationship: 'incoming' as const, createdAt: friendship.createdAt.toISOString() }));
}

export async function loadActiveMatchSearch(userId: string): Promise<ActiveMatchSearch | null> {
  if (!hasDatabase()) return null;
  const searchInitiator = aliasedTable(users, 'search_initiator');
  const searchPartner = aliasedTable(users, 'search_partner');
  const [row] = await db!.select({ search: matchSearches, matchId: matches.id, currentTier: rankStates.tier, initiatorName: searchInitiator.displayName, initiatorHandle: searchInitiator.handle, partnerName: searchPartner.displayName, partnerHandle: searchPartner.handle }).from(matchSearches).leftJoin(matchRooms, eq(matchRooms.id, matchSearches.roomId)).leftJoin(matches, eq(matches.roomId, matchRooms.id)).leftJoin(rankStates, eq(rankStates.userId, matchSearches.userId)).leftJoin(searchInitiator, eq(searchInitiator.id, matchSearches.userId)).leftJoin(searchPartner, eq(searchPartner.id, matchSearches.partnerId)).where(and(or(eq(matchSearches.userId, userId), eq(matchSearches.partnerId, userId)), inArray(matchSearches.status, ['lobby', 'searching', 'matched']))).orderBy(desc(matchSearches.updatedAt)).limit(1);
  if (!row) return null;
  const isInitiator = row.search.userId === userId;
  return { id: row.search.id, partyType: row.search.partyType === 'duo' ? 'duo' : 'solo', partnerId: row.search.partnerId ?? undefined, partnerName: (isInitiator ? row.partnerName : row.initiatorName) ?? undefined, partnerHandle: (isInitiator ? row.partnerHandle : row.initiatorHandle) ?? undefined, dates: row.search.preferredDates ?? [], from: row.search.timeFrom, to: row.search.timeTo, city: row.search.city, clubId: row.search.clubId ?? undefined, sidePreference: normalizeCourtSide(isInitiator ? row.search.sidePreference : row.search.partnerSidePreference), partnerSidePreference: row.search.partyType === 'duo' ? normalizeCourtSide(isInitiator ? row.search.partnerSidePreference : row.search.sidePreference) : undefined, myReady: isInitiator ? row.search.initiatorReady : row.search.partnerReady, partnerReady: isInitiator ? row.search.partnerReady : row.search.initiatorReady, tier: row.search.mode === 'friendly' ? '' : categoryFromTier(row.currentTier ?? undefined), mode: row.search.mode === 'friendly' ? 'friendly' : 'ranked', status: row.search.status === 'matched' ? 'matched' : row.search.status === 'lobby' ? 'lobby' : 'searching', matchId: row.matchId ?? undefined };
}

export async function loadPendingMatchSearchInvitations(userId: string): Promise<MatchSearchInvitation[]> {
  if (!hasDatabase()) return [];
  const [incoming, outgoing] = await Promise.all([
    db!.select({ id: matchSearches.id, dates: matchSearches.preferredDates, from: matchSearches.timeFrom, to: matchSearches.timeTo, city: matchSearches.city, mode: matchSearches.mode, createdAt: matchSearches.createdAt, player: users.displayName, playerHandle: users.handle, clubName: clubs.name, hostTier: rankStates.tier }).from(matchSearches).innerJoin(users, eq(users.id, matchSearches.userId)).leftJoin(clubs, eq(clubs.id, matchSearches.clubId)).leftJoin(rankStates, eq(rankStates.userId, matchSearches.userId)).where(and(eq(matchSearches.partnerId, userId), eq(matchSearches.status, 'pending-partner'))).orderBy(desc(matchSearches.createdAt)),
    db!.select({ id: matchSearches.id, dates: matchSearches.preferredDates, from: matchSearches.timeFrom, to: matchSearches.timeTo, city: matchSearches.city, mode: matchSearches.mode, createdAt: matchSearches.createdAt, player: users.displayName, playerHandle: users.handle, clubName: clubs.name, hostTier: rankStates.tier }).from(matchSearches).innerJoin(users, eq(users.id, matchSearches.partnerId)).leftJoin(clubs, eq(clubs.id, matchSearches.clubId)).leftJoin(rankStates, eq(rankStates.userId, matchSearches.userId)).where(and(eq(matchSearches.userId, userId), eq(matchSearches.status, 'pending-partner'))).orderBy(desc(matchSearches.createdAt)),
  ]);
  return [
    ...incoming.map((item) => ({ id: item.id, direction: 'incoming' as const, player: item.player, playerHandle: item.playerHandle, dates: item.dates ?? [], from: item.from, to: item.to, city: item.city, club: item.clubName ?? 'Qualquer clube', mode: item.mode === 'friendly' ? 'friendly' as const : 'ranked' as const, tier: item.mode === 'friendly' ? '' : categoryFromTier(item.hostTier ?? undefined) || 'Nível em definição', createdAt: item.createdAt.toISOString() })),
    ...outgoing.map((item) => ({ id: item.id, direction: 'outgoing' as const, player: item.player, playerHandle: item.playerHandle, dates: item.dates ?? [], from: item.from, to: item.to, city: item.city, club: item.clubName ?? 'Qualquer clube', mode: item.mode === 'friendly' ? 'friendly' as const : 'ranked' as const, tier: item.mode === 'friendly' ? '' : categoryFromTier(item.hostTier ?? undefined) || 'Nível em definição', createdAt: item.createdAt.toISOString() })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadPendingMatchChallenges(userId: string): Promise<MatchChallenge[]> {
  if (!hasDatabase()) return [];
  const ownChallenges = await db!.select({ id: matchChallenges.id })
    .from(matchChallengeMembers)
    .innerJoin(matchChallenges, eq(matchChallenges.id, matchChallengeMembers.challengeId))
    .where(and(eq(matchChallengeMembers.userId, userId), eq(matchChallenges.status, 'pending'), gt(matchChallenges.startsAt, new Date())))
    .orderBy(matchChallenges.startsAt)
    .limit(20);
  const challengeIds = ownChallenges.map((challenge) => challenge.id);
  if (challengeIds.length === 0) return [];
  const rows = await db!.select({ challenge: matchChallenges, member: matchChallengeMembers, player: users, clubName: clubs.name })
    .from(matchChallengeMembers)
    .innerJoin(matchChallenges, eq(matchChallenges.id, matchChallengeMembers.challengeId))
    .innerJoin(users, eq(users.id, matchChallengeMembers.userId))
    .leftJoin(clubs, eq(clubs.id, matchChallenges.clubId))
    .where(inArray(matchChallengeMembers.challengeId, challengeIds))
    .orderBy(matchChallenges.startsAt, matchChallengeMembers.createdAt);
  const grouped = new Map<string, Array<(typeof rows)[number]>>();
  for (const row of rows) grouped.set(row.challenge.id, [...(grouped.get(row.challenge.id) ?? []), row]);
  return Array.from(grouped.values()).map((items) => {
    const first = items[0]!;
    const mine = items.find((item) => item.member.userId === userId)?.member;
    return {
      id: first.challenge.id,
      direction: first.challenge.createdById === userId ? 'outgoing' : 'incoming',
      mode: first.challenge.mode === 'friendly' ? 'friendly' : 'ranked',
      startsAt: first.challenge.startsAt.toISOString(),
      city: first.challenge.city,
      club: first.clubName ?? 'Qualquer clube',
      clubId: first.challenge.clubId ?? undefined,
      acceptedCount: items.filter((item) => item.member.acceptance === 'accepted').length,
      myAcceptance: (mine?.acceptance === 'accepted' || mine?.acceptance === 'declined' ? mine.acceptance : 'pending') as MatchChallenge['myAcceptance'],
      mySidePreference: normalizeCourtSide(mine?.sidePreference),
      participants: items.map((item) => ({
        id: item.member.id,
        userId: item.member.userId,
        name: item.player.displayName,
        handle: item.player.handle,
        team: item.member.team === 'B' ? 'B' : 'A',
        acceptance: item.member.acceptance === 'accepted' || item.member.acceptance === 'declined' ? item.member.acceptance : 'pending',
        sidePreference: normalizeCourtSide(item.member.sidePreference),
        isCurrentPlayer: item.member.userId === userId,
      })),
      matchId: first.challenge.matchId ?? undefined,
    };
  });
}

export async function loadPendingRoomInvitations(userId: string): Promise<RoomInvitation[]> {
  if (!hasDatabase()) return [];
  const rows = await db!.select({ invitation: roomInvitations, inviterName: users.displayName, clubName: clubs.name, clubCity: clubs.city, startsAt: matchRooms.startsAt, mode: matchRooms.mode, hostTier: rankStates.tier }).from(roomInvitations).innerJoin(matchRooms, eq(matchRooms.id, roomInvitations.roomId)).innerJoin(users, eq(users.id, roomInvitations.inviterId)).leftJoin(clubs, eq(clubs.id, matchRooms.clubId)).leftJoin(rankStates, eq(rankStates.userId, matchRooms.hostId)).where(and(eq(roomInvitations.inviteeId, userId), eq(roomInvitations.status, 'pending'), gt(matchRooms.startsAt, new Date()))).orderBy(matchRooms.startsAt).limit(20);
  return rows.map(({ invitation, inviterName, clubName, clubCity, startsAt, mode, hostTier }) => ({ id: invitation.id, roomId: invitation.roomId, inviter: inviterName, club: clubName ?? 'Clube a definir', city: clubCity ?? 'Local a definir', startsAt: startsAt.toISOString(), mode: mode === 'friendly' ? 'friendly' : 'ranked', tier: mode === 'friendly' ? 'Todos os níveis' : categoryFromTier(hostTier ?? undefined) || 'Nível em definição' }));
}

export async function loadClubDashboard(clubId: string) {
  if (!hasDatabase()) return { club: null, pendingMemberships: [], disputedMatches: [], attendanceMatches: [] };
  const [club] = await db!.select({ id: clubs.id, name: clubs.name, city: clubs.city, state: clubs.state, country: clubs.country }).from(clubs).where(eq(clubs.id, clubId)).limit(1);
  const pendingRows = await db!.select({ id: clubMemberships.id, name: users.displayName, phone: users.phone, city: users.city, state: users.state, createdAt: clubMemberships.createdAt }).from(clubMemberships).innerJoin(users, eq(users.id, clubMemberships.userId)).where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.status, 'pending'))).orderBy(desc(clubMemberships.createdAt));
  const pendingMemberships = pendingRows.map((m) => ({ ...m, phone: m.phone ?? '' }));
  const disputedRows = await db!.select({ id: matches.id, startsAt: matchRooms.startsAt, winner: matches.winner, sets: matches.sets, updatedAt: matches.updatedAt }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(eq(matchRooms.clubId, clubId), eq(matches.status, 'disputed'))).orderBy(desc(matches.updatedAt)).limit(20);
  const disputedMatches = await Promise.all(disputedRows.map(async (match) => {
    const votes = await db!.select({ name: users.displayName, team: matchParticipants.team, confirmation: matchParticipants.confirmation, resultWinner: matchParticipants.resultWinner }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.matchId, match.id)).orderBy(matchParticipants.createdAt);
    const resultVotes = resultVoteCounts(votes.map((vote) => ({ playerId: vote.name, team: vote.team as 'A' | 'B', status: vote.confirmation as 'confirmed' | 'disputed', winner: vote.resultWinner as 'A' | 'B' | null })));
    return { id: match.id, startsAt: match.startsAt.toISOString(), winner: match.winner as 'A' | 'B' | null, sets: match.sets ?? [], resultVotes, votes: votes.map((vote) => ({ name: vote.name, team: vote.team as 'A' | 'B', confirmation: vote.confirmation, winner: vote.resultWinner as 'A' | 'B' | null })) };
  }));
  const attendanceRows = await db!.select({ id: matches.id, startsAt: matchRooms.startsAt, status: matches.status, mode: matches.mode, winner: matches.winner, sets: matches.sets }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(eq(matchRooms.clubId, clubId), lt(matchRooms.startsAt, new Date()), notInArray(matches.status, ['validated', 'cancelled', 'no-show']))).orderBy(desc(matchRooms.startsAt)).limit(20);
  const attendanceMatches = (await Promise.all(attendanceRows.map(async (match) => {
    const participants = await db!.select({ userId: matchParticipants.userId, name: users.displayName, team: matchParticipants.team, attendance: matchParticipants.attendance }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.matchId, match.id)).orderBy(matchParticipants.createdAt);
    return { id: match.id, startsAt: match.startsAt.toISOString(), status: match.status, mode: match.mode, winner: match.winner as 'A' | 'B' | null, sets: match.sets ?? [], participants: participants.map((participant) => ({ ...participant, team: participant.team as 'A' | 'B' })) };
  }))).filter((match) => match.participants.some((participant) => !['present', 'absent', 'excused'].includes(participant.attendance)));
  return { club, pendingMemberships, disputedMatches, attendanceMatches };
}

export async function loadAdminOverview() {
  if (!hasDatabase()) return { players: 0, clubs: 0, rooms: 0, pendingMemberships: 0, disputedMatches: 0, recentMemberships: [] };
  const [[playerCount], [clubCount], [roomCount], [pendingCount], [disputedCount]] = await Promise.all([
    db!.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isActive, true)),
    db!.select({ count: sql<number>`count(*)` }).from(clubs).where(eq(clubs.isActive, true)),
    db!.select({ count: sql<number>`count(*)` }).from(matches).where(eq(matches.status, 'confirming')),
    db!.select({ count: sql<number>`count(*)` }).from(clubMemberships).where(eq(clubMemberships.status, 'pending')),
    db!.select({ count: sql<number>`count(*)` }).from(matches).where(eq(matches.status, 'disputed')),
  ]);
  const recentMemberships = await db!.select({ id: clubMemberships.id, name: users.displayName, phone: users.phone, club: clubs.name, status: clubMemberships.status, createdAt: clubMemberships.createdAt }).from(clubMemberships).innerJoin(users, eq(users.id, clubMemberships.userId)).innerJoin(clubs, eq(clubs.id, clubMemberships.clubId)).orderBy(desc(clubMemberships.createdAt)).limit(8);
  return { players: Number(playerCount?.count ?? 0), clubs: Number(clubCount?.count ?? 0), rooms: Number(roomCount?.count ?? 0), pendingMemberships: Number(pendingCount?.count ?? 0), disputedMatches: Number(disputedCount?.count ?? 0), recentMemberships };
}

export async function loadAdminDirectory(): Promise<{ players: AdminPlayer[]; clubs: AdminClub[] }> {
  if (!hasDatabase()) return { players: [], clubs: [] };

  const [playerRows, clubRows] = await Promise.all([
    db!.select({
      id: users.id,
      displayName: users.displayName,
      handle: users.handle,
      phone: users.phone,
      city: users.city,
      state: users.state,
      country: users.country,
      isActive: users.isActive,
      tier: rankStates.tier,
      points: rankStates.points,
      rating: ratings.rating,
      matches: ratings.matches,
      provisionalMatches: ratings.provisionalMatches,
      club: clubs.name,
    })
      .from(users)
      .leftJoin(ratings, eq(ratings.userId, users.id))
      .leftJoin(rankStates, eq(rankStates.userId, users.id))
      .leftJoin(clubMemberships, and(eq(clubMemberships.userId, users.id), eq(clubMemberships.isPrimary, true)))
      .leftJoin(clubs, eq(clubs.id, clubMemberships.clubId))
      .orderBy(desc(users.createdAt)),
    db!.select({
      id: clubs.id,
      name: clubs.name,
      city: clubs.city,
      region: clubs.region,
      state: clubs.state,
      country: clubs.country,
      address: clubs.address,
      gripoUrl: clubs.gripoUrl,
      isActive: clubs.isActive,
      email: clubAccounts.email,
    })
      .from(clubs)
      .leftJoin(clubAccounts, eq(clubAccounts.clubId, clubs.id))
      .orderBy(desc(clubs.createdAt)),
  ]);

  return {
    players: playerRows.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      handle: player.handle,
      phone: player.phone ?? '',
      city: player.city,
      state: player.state,
      country: player.country,
      isActive: player.isActive,
      tier: player.tier ?? '6ª III',
      points: player.points ?? 50,
      rating: Number(player.rating ?? 1100),
      matches: player.matches ?? 0,
      provisional: (player.provisionalMatches ?? 0) < 5,
      club: player.club ?? null,
    })),
    clubs: clubRows,
  };
}

function fallbackHistory(): HistoryData {
  return { items: [], total: 0, wins: 0, mmrDelta: 0 };
}

export async function loadHistory(): Promise<HistoryData> {
  if (!hasDatabase()) return fallbackHistory();
  const userId = await currentUserId();
  if (!userId) return fallbackHistory();
  const rows = await db!.select({ match: matches, participant: matchParticipants }).from(matchParticipants).innerJoin(matches, eq(matches.id, matchParticipants.matchId)).where(eq(matchParticipants.userId, userId)).orderBy(desc(matches.createdAt));
  const items = await Promise.all(rows.map(async ({ match, participant }) => {
    const players = await db!.select({ team: matchParticipants.team, name: users.displayName }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).where(eq(matchParticipants.matchId, match.id));
    const opponents = players.filter((player) => player.team !== participant.team).map((player) => player.name).join(' / ');
    const [location] = match.roomId ? await db!.select({ club: clubs.name }).from(matchRooms).leftJoin(clubs, eq(clubs.id, matchRooms.clubId)).where(eq(matchRooms.id, match.roomId)).limit(1) : [];
    const [event] = await db!.select({ delta: ratingEvents.delta }).from(ratingEvents).where(and(eq(ratingEvents.matchId, match.id), eq(ratingEvents.userId, userId))).limit(1);
    const won = match.winner === participant.team;
    const sets = (match.sets ?? []).map((set) => participant.team === 'A' ? `${set.a}–${set.b}` : `${set.b}–${set.a}`).join(', ');
    const noShow = match.status === 'no-show';
    const pending = match.status !== 'validated' && !noShow;
    const friendly = match.mode === 'friendly';
    const absent = participant.attendance === 'absent';
    return { id: match.id, date: new Date(match.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), result: noShow ? absent ? 'Falta confirmada' : 'Partida cancelada' : pending ? 'Aguardando confirmação' : won ? 'Vitória' : 'Derrota', score: sets || 'Placar pendente', opponent: opponents || 'Adversários da sala', club: location?.club ?? 'Clube não informado', delta: friendly || !event ? null : Math.round(event.delta), tone: noShow ? absent ? 'loss' : 'pending' : pending ? 'pending' : friendly ? 'friendly' : won ? 'win' : 'loss', label: noShow ? 'Não comparecimento' : friendly ? 'Amistosa' : pending ? 'Pendente' : 'Ranqueada' } satisfies HistoryItem;
  }));
  return { items, total: items.length, wins: items.filter((item) => item.result === 'Vitória').length, mmrDelta: items.reduce((sum, item) => sum + (item.delta ?? 0), 0) };
}

export async function loadActivities(): Promise<ActivityItem[]> {
  if (!hasDatabase()) return [];
  const history = await loadHistory();
  return history.items.slice(0, 5).map((item) => ({ id: item.id, type: item.tone === 'win' ? 'win' : item.tone === 'loss' ? 'achievement' : 'room', title: item.result, description: `${item.score} contra ${item.opponent}`, time: item.date, icon: item.tone === 'win' ? 'arrow' : item.tone === 'friendly' ? 'calendar' : 'zap' }));
}

export async function loadMatchDetails(matchId: string): Promise<MatchDetails | null> {
  if (!hasDatabase()) return null;
  const [match] = await db!.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  if (!match) return null;
  const [room] = match.roomId ? await db!.select({ startsAt: matchRooms.startsAt, durationMinutes: matchRooms.durationMinutes, club: clubs.name, city: clubs.city, gripoUrl: clubs.gripoUrl }).from(matchRooms).leftJoin(clubs, eq(clubs.id, matchRooms.clubId)).where(eq(matchRooms.id, match.roomId)).limit(1) : [];
  const userId = await currentUserId();
  const participants = await db!.select({ participant: matchParticipants, user: users, rank: rankStates }).from(matchParticipants).innerJoin(users, eq(users.id, matchParticipants.userId)).innerJoin(rankStates, eq(rankStates.userId, matchParticipants.userId)).where(eq(matchParticipants.matchId, matchId)).orderBy(matchParticipants.createdAt);
  const resultVotes = resultVoteCounts(participants.map(({ participant }) => ({ playerId: participant.userId, team: participant.team as 'A' | 'B', status: participant.confirmation as 'confirmed' | 'disputed', winner: participant.resultWinner as 'A' | 'B' | null })));
  const startsAt = room?.startsAt ?? match.createdAt;
  const durationMinutes = room?.durationMinutes ?? getMatchDurationMinutes();
  const acceptedCount = participants.filter(({ participant }) => participant.matchAcceptance === 'accepted').length;
  const attendanceCount = participants.filter(({ participant }) => ['claimed-present', 'present'].includes(participant.attendance)).length;
  const gripoClubId = resolveGripoClubId(room?.gripoUrl ?? room?.club);
  return { id: match.id, mode: match.mode as MatchDetails['mode'], status: match.status as MatchDetails['status'], startsAt: startsAt.toISOString(), durationMinutes, resultDeadlineAt: (match.resultDeadlineAt ?? getResultDeadline(startsAt, durationMinutes)).toISOString(), acceptedCount, attendanceCount, club: room?.club ?? 'Clube não informado', city: room?.city ?? 'Local não informado', gripoUrl: room?.gripoUrl ?? process.env.GRIPO_DEFAULT_URL ?? 'https://gripo.app', gripoClubId, winner: match.winner as 'A' | 'B' | undefined, sets: match.sets ?? [], resultVotes, participants: participants.map(({ participant, user, rank }) => ({ id: participant.id, userId: participant.userId, name: user.displayName, handle: user.handle, team: participant.team as 'A' | 'B', tier: rank.tier, matchAcceptance: participant.matchAcceptance, confirmation: participant.confirmation, resultWinner: participant.resultWinner as 'A' | 'B' | null, attendance: participant.attendance, isCurrentPlayer: participant.userId === userId })) };
}

export async function loadSeason(): Promise<SeasonData> {
  if (!hasDatabase()) return { active: false, name: 'Nenhuma temporada ativa', startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), points: 0, wins: 0, matches: 0, position: 0, leaderboard: [] };
  const [season] = await db!.select().from(seasons).where(eq(seasons.status, 'active')).orderBy(desc(seasons.startsAt)).limit(1);
  const userId = await currentUserId();
  if (!season) return { active: false, name: 'Nenhuma temporada ativa', startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), points: 0, wins: 0, matches: 0, position: 0, leaderboard: [] };
  const [ownStats] = userId ? await db!.select().from(seasonStats).where(and(eq(seasonStats.seasonId, season.id), eq(seasonStats.userId, userId))).limit(1) : [];
  const rows = await db!.select({ stats: seasonStats, user: users, rank: rankStates }).from(seasonStats).innerJoin(users, eq(users.id, seasonStats.userId)).innerJoin(rankStates, eq(rankStates.userId, seasonStats.userId)).where(eq(seasonStats.seasonId, season.id)).orderBy(desc(seasonStats.points), desc(seasonStats.wins));
  const leaderboard: SeasonLeaderboardEntry[] = rows.map(({ stats, user, rank }, index) => ({ position: index + 1, name: user.displayName, initials: initials(user.displayName), tier: rank.tier, points: stats.points, isCurrentPlayer: user.id === userId }));
  return { active: true, name: season.name, startsAt: season.startsAt.toISOString(), endsAt: season.endsAt.toISOString(), points: ownStats?.points ?? 0, wins: ownStats?.wins ?? 0, matches: ownStats?.matches ?? 0, position: leaderboard.find((entry) => entry.isCurrentPlayer)?.position ?? 0, leaderboard };
}
