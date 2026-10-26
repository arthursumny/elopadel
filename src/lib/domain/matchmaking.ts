import { RANKS } from '@/lib/ranks';
import { areCanonicalLocationsEqual, normalizeBrazilCountry, normalizeBrazilianState, normalizeLocationText, type CanonicalLocation } from '@/lib/location-domain';
import type { CourtSide } from '@/lib/types';

export type CompetitivePlayer = {
  id: string;
  rating: number;
  tier: string;
  sidePreference?: CourtSide;
};

export type MatchmakingParty = {
  id: string;
  partyType: 'solo' | 'duo';
  dates: string[];
  from: string;
  to: string;
  city: string;
  state?: string;
  country?: string;
  clubId: string | null;
  tier: string;
  mode: 'ranked' | 'friendly';
  timezoneOffset?: number;
  createdAt: Date;
  members: CompetitivePlayer[];
};

export type AvailabilityOverlap = {
  date: string;
  from: string;
  to: string;
  clubId: string | null;
};

function rankOrder(tier: string) {
  return RANKS.find((rank) => rank.label === tier)?.order ?? 4;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function minutesToTime(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function areCompetitivePlayersCompatible(players: CompetitivePlayer[], ratingTolerance = 300) {
  if (players.length < 2) return true;
  const ratings = players.map((player) => player.rating);
  const orders = players.map((player) => rankOrder(player.tier));
  return Math.max(...ratings) - Math.min(...ratings) <= ratingTolerance && Math.max(...orders) - Math.min(...orders) <= 2;
}

export function getRatingTolerance(parties: MatchmakingParty[], now: Date) {
  if (parties.length === 0) return 300;
  // The youngest member of the candidate party determines how long it has waited.
  const youngestParty = Math.max(...parties.map((party) => party.createdAt.getTime()));
  const waitedMinutes = Math.max(0, now.getTime() - youngestParty) / 60_000;
  if (waitedMinutes >= 5) return 600;
  if (waitedMinutes >= 2) return 450;
  return 300;
}

export function normalizeCourtSide(value: unknown): CourtSide {
  return value === 'left' || value === 'right' ? value : 'any';
}

export function areTeamSidesCompatible(players: CompetitivePlayer[]) {
  if (players.length !== 2) return false;
  const sides = players.map((player) => normalizeCourtSide(player.sidePreference));
  return !(sides.every((side) => side === 'left') || sides.every((side) => side === 'right'));
}

export function findAvailabilityOverlap(parties: MatchmakingParty[], minimumDurationMinutes = 0, notBefore?: Date): AvailabilityOverlap | null {
  if (parties.length === 0) return null;
  const commonDates = parties.reduce<string[]>((dates, party) => dates.filter((date) => party.dates.includes(date)), [...parties[0].dates]).sort();
  if (commonDates.length === 0) return null;

  const fromValues = parties.map((party) => timeToMinutes(party.from));
  const toValues = parties.map((party) => timeToMinutes(party.to));
  if (fromValues.some((value) => value === null) || toValues.some((value) => value === null)) return null;
  const from = Math.max(...fromValues as number[]);
  const to = Math.min(...toValues as number[]);
  if (to - from < minimumDurationMinutes) return null;

  const clubIds = Array.from(new Set(parties.map((party) => party.clubId).filter((clubId): clubId is string => Boolean(clubId))));
  if (clubIds.length > 1) return null;
  const city = normalizeLocationText(parties[0].city);
  const canonicalLocation = (party: MatchmakingParty): CanonicalLocation | null => party.state && party.country
    ? { city: party.city, state: party.state, country: party.country }
    : null;
  const firstLocation = canonicalLocation(parties[0]);
  if (!firstLocation || parties.some((party) => normalizeLocationText(party.city) !== city || !areCanonicalLocationsEqual(canonicalLocation(party), firstLocation))) return null;

  const offset = parties[0].timezoneOffset ?? 180;
  const localNow = notBefore ? new Date(notBefore.getTime() - offset * 60_000) : null;
  const localDate = localNow?.toISOString().slice(0, 10);
  const earliestLocalMinute = localNow ? localNow.getUTCHours() * 60 + localNow.getUTCMinutes() + 1 : from;
  let selectedFrom = from;
  const date = commonDates.find((candidateDate) => {
    const candidateFrom = candidateDate === localDate ? Math.max(from, earliestLocalMinute) : from;
    if (to - candidateFrom < minimumDurationMinutes) return false;
    selectedFrom = candidateFrom;
    if (!notBefore) return true;
    const absoluteOffset = Math.abs(offset);
    const hours = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
    const minutes = String(absoluteOffset % 60).padStart(2, '0');
    const sign = offset <= 0 ? '+' : '-';
    const startsAt = new Date(`${candidateDate}T${minutesToTime(candidateFrom)}:00${sign}${hours}:${minutes}`);
    return !Number.isNaN(startsAt.getTime()) && startsAt > notBefore;
  });
  if (!date) return null;
  return { date, from: minutesToTime(selectedFrom), to: minutesToTime(to), clubId: clubIds[0] ?? null };
}

export function findMatchmakingGroup(parties: MatchmakingParty[], options: { now?: Date; minimumDurationMinutes?: number } = {}) {
  const now = options.now ?? new Date();
  const available = parties.filter((party) => party.members.length === (party.partyType === 'duo' ? 2 : 1)
    && Boolean(normalizeBrazilianState(party.state) && normalizeBrazilCountry(party.country) === 'BR'))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const patterns = [[2, 2], [1, 1, 2], [1, 1, 1, 1]];
  const partitions = new Map<string, MatchmakingParty[]>();
  for (const party of available) {
    const key = [normalizeLocationText(party.city), normalizeBrazilianState(party.state), normalizeBrazilCountry(party.country), party.mode].join('|');
    const partition = partitions.get(key);
    if (partition) partition.push(party);
    else partitions.set(key, [party]);
  }
  const partitionList = Array.from(partitions.values());
  const lowerBounds = [0, 300, 450];
  const upperBounds = [300, 450, 600];
  const minimumDurationMinutes = options.minimumDurationMinutes ?? 0;

  for (let ratingBand = 0; ratingBand < upperBounds.length; ratingBand += 1) {
    const lowerBound = lowerBounds[ratingBand]!;
    const upperBound = upperBounds[ratingBand]!;
    const best: { parties: MatchmakingParty[]; ratingDifference: number; patternOrder: number }[] = [];

    patternLoop: for (let patternOrder = 0; patternOrder < patterns.length; patternOrder += 1) {
      const pattern = patterns[patternOrder]!;
      const requiredDuos = pattern.filter((size) => size === 2).length;
      const requiredSolos = pattern.filter((size) => size === 1).length;

      for (const partition of partitionList) {
        if (partition.filter((party) => party.members.length === 2).length < requiredDuos
          || partition.filter((party) => party.members.length === 1).length < requiredSolos) continue;

        function visit(start: number, selected: MatchmakingParty[], totalPlayers: number) {
          const selectedMembers = selected.flatMap((party) => party.members);
          const ratings = selectedMembers.map((member) => member.rating);
          const partialDifference = ratings.length ? Math.max(...ratings) - Math.min(...ratings) : 0;
          if (partialDifference > upperBound) return;
          if (selected.length > 0 && partialDifference > getRatingTolerance(selected, now)) return;
          if (best[0] && partialDifference >= best[0].ratingDifference) return;

          if (totalPlayers === 4) {
            const members = selectedMembers;
            if (selected.length !== pattern.length || (ratingBand > 0 && partialDifference <= lowerBound) || partialDifference > upperBound) return;
            if (getRatingTolerance(selected, now) < upperBound) return;
            if (!areCompetitivePlayersCompatible(members, upperBound)) return;
            if (Object.keys(buildTeamAssignments(selected)).length !== 4) return;
            best[0] = { parties: selected, ratingDifference: partialDifference, patternOrder };
            if (partialDifference === 0 && patternOrder === 0) return;
            return;
          }
          if (totalPlayers > 4 || selected.length >= pattern.length) return;

          const selectedDuos = selected.filter((party) => party.members.length === 2).length;
          const selectedSolos = selected.length - selectedDuos;
          for (let index = start; index < partition.length; index += 1) {
            const candidate = partition[index]!;
            if (candidate.members.length === 2 && selectedDuos >= requiredDuos) continue;
            if (candidate.members.length === 1 && selectedSolos >= requiredSolos) continue;
            if (selected.some((party) => party.members.some((member) => candidate.members.some((other) => other.id === member.id)))) continue;

            const next = [...selected, candidate];
            const nextMembers = next.flatMap((party) => party.members);
            const nextOrders = nextMembers.map((member) => rankOrder(member.tier));
            if (Math.max(...nextOrders) - Math.min(...nextOrders) > 2) continue;
            if (!findAvailabilityOverlap(next, minimumDurationMinutes, now)) continue;
            if (next.some((party) => party.partyType === 'duo' && !areTeamSidesCompatible(party.members))) continue;

            const nextSoloMembers = next.filter((party) => party.partyType === 'solo').flatMap((party) => party.members);
            if (requiredDuos === 1 && selectedDuos + Number(candidate.members.length === 2) === 1
              && selectedSolos + Number(candidate.members.length === 1) === 2
              && !areTeamSidesCompatible(nextSoloMembers)) continue;
            if (requiredDuos === 0) {
              const forcedLeft = nextMembers.filter((member) => normalizeCourtSide(member.sidePreference) === 'left').length;
              const forcedRight = nextMembers.filter((member) => normalizeCourtSide(member.sidePreference) === 'right').length;
              if (forcedLeft > 2 || forcedRight > 2) continue;
            }

            visit(index + 1, next, totalPlayers + candidate.members.length);
            if (best[0]?.ratingDifference === 0 && best[0].patternOrder === 0) return;
          }
        }

        visit(0, [], 0);
        if (best[0]?.ratingDifference === 0 && best[0].patternOrder === 0) break patternLoop;
      }
    }

    if (best[0]) return best[0].parties;
  }
  return null;
}

function duoTeamAssignments(parties: MatchmakingParty[]) {
  const assignments: Record<string, 'A' | 'B'> = {};
  const duo = parties.find((party) => party.members.length === 2);
  if (!duo) return null;
  const opponents = parties.filter((party) => party !== duo).flatMap((party) => party.members);
  if (!areTeamSidesCompatible(duo.members) || !areTeamSidesCompatible(opponents)) return null;
  for (const member of duo.members) assignments[member.id] = 'A';
  for (const party of parties) {
    if (party === duo) continue;
    for (const member of party.members) assignments[member.id] = 'B';
  }
  return assignments;
}

export function buildTeamAssignments(parties: MatchmakingParty[]) {
  if (parties.length === 2 && parties.every((party) => party.members.length === 2)) {
    if (!areTeamSidesCompatible(parties[0].members) || !areTeamSidesCompatible(parties[1].members)) return {};
    return Object.fromEntries(parties.flatMap((party, index) => party.members.map((member) => [member.id, index === 0 ? 'A' : 'B']))) as Record<string, 'A' | 'B'>;
  }

  const duoParties = parties.filter((party) => party.partyType === 'duo');
  if (duoParties.length > 0) {
    if (duoParties.length > 1) return {};
    return duoTeamAssignments(parties) ?? {};
  }

  const members = parties.flatMap((party) => party.members);
  let best: { difference: number; assignments: Record<string, 'A' | 'B'> } | null = null;
  for (let first = 0; first < members.length; first += 1) {
    for (let second = first + 1; second < members.length; second += 1) {
      const teamA = [members[first], members[second]];
      const teamAIds = new Set(teamA.map((member) => member.id));
      const teamB = members.filter((member) => !teamAIds.has(member.id));
      if (teamB.length !== 2) continue;
      if (!areTeamSidesCompatible(teamA) || !areTeamSidesCompatible(teamB)) continue;
      const difference = Math.abs(teamA.reduce((sum, member) => sum + member.rating, 0) - teamB.reduce((sum, member) => sum + member.rating, 0));
      if (!best || difference < best.difference) best = { difference, assignments: Object.fromEntries([...teamA.map((member) => [member.id, 'A']), ...teamB.map((member) => [member.id, 'B'])]) as Record<string, 'A' | 'B'> };
    }
  }
  return best?.assignments ?? {};
}
