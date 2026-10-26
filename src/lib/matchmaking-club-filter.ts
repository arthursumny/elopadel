export type ClubForCity = { id: string; name: string; city: string };

export function clubsForCity<T extends ClubForCity>(clubs: readonly T[], city: string): T[] {
  const selectedCity = city.trim();
  if (!selectedCity) return [...clubs];
  return clubs.filter((club) => club.city.trim() === selectedCity);
}

export function clubIdForCity<T extends ClubForCity>(clubId: string, city: string, clubs: readonly T[]): string {
  if (!clubId) return '';
  return clubsForCity(clubs, city).some((club) => club.id === clubId) ? clubId : '';
}
