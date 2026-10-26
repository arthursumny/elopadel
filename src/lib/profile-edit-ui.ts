export type ProfileClubStatus = 'none' | 'pending' | 'approved';

export type ProfileEditSnapshot = {
  city: string;
  state: string;
  country: string;
  clubId: string | null;
  clubStatus: ProfileClubStatus;
  currentClub: { id: string; name: string } | null;
};

export type ProfileCity = { city: string; state: string; country: string; clubCount: number };
export type ProfileClub = { id: string; name: string; city: string; state: string; country: string };
export type ProfileLocation = { city: string; state: string; country: string };

export function locationKey(location: ProfileLocation): string {
  return [location.city, location.state, location.country].map((part) => encodeURIComponent(part)).join('|');
}

export function parseLocationKey(value: string): ProfileLocation | null {
  const parts = value.split('|');
  if (parts.length !== 3) return null;
  try {
    return { city: decodeURIComponent(parts[0]), state: decodeURIComponent(parts[1]), country: decodeURIComponent(parts[2]) };
  } catch {
    return null;
  }
}

export function locationLabel(location: ProfileLocation): string {
  return `${location.city} - ${location.state}${location.country && location.country !== 'Brasil' ? `, ${location.country}` : ''}`;
}

export function buildLocationOptions(cities: readonly ProfileCity[], current: ProfileLocation): ProfileCity[] {
  const options = [...cities];
  if (!options.some((option) => locationKey(option) === locationKey(current))) {
    options.push({ ...current, clubCount: 0 });
  }
  return options.sort((a, b) => {
    if (a.state !== b.state) return a.state.localeCompare(b.state);
    return a.city.localeCompare(b.city);
  });
}

export function clubsForLocation<T extends ProfileClub>(clubs: readonly T[], location: ProfileLocation): T[] {
  return clubs.filter((club) =>
    club.city === location.city && club.state === location.state && club.country === location.country,
  );
}

export function clubIdForLocation(clubId: string, location: ProfileLocation, clubs: readonly ProfileClub[]): string {
  if (!clubId) return '';
  return clubsForLocation(clubs, location).some((club) => club.id === clubId) ? clubId : '';
}

export function clubNameFor(snapshot: Pick<ProfileEditSnapshot, 'clubId' | 'clubStatus' | 'currentClub'>, clubs: readonly ProfileClub[]): string | null {
  if (snapshot.clubStatus !== 'pending' || !snapshot.clubId) return null;
  return clubs.find((club) => club.id === snapshot.clubId)?.name ?? null;
}
