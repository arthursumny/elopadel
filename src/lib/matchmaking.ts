import type { OpenRoom } from './types';

export type MatchSearchPreferences = {
  dates: string[];
  from: string;
  to: string;
  city: string;
  clubId: string;
};

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

export function matchesSearchPreferences(room: OpenRoom, preferences: MatchSearchPreferences) {
  const startsAt = new Date(room.startsAt);
  if (Number.isNaN(startsAt.getTime())) return false;

  if (preferences.dates.length > 0 && !preferences.dates.includes(localDateKey(startsAt))) return false;

  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const from = preferences.from ? timeToMinutes(preferences.from) : null;
  const to = preferences.to ? timeToMinutes(preferences.to) : null;
  if (from !== null && startMinutes < from) return false;
  if (to !== null && startMinutes > to) return false;

  if (preferences.city && room.city.trim().toLocaleLowerCase() !== preferences.city.trim().toLocaleLowerCase()) return false;
  if (preferences.clubId && room.clubId !== preferences.clubId) return false;

  return true;
}
