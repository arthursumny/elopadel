import { initialRankForCategory, ratingMidpointForRank, type InitialCategory } from './ranks';
import { normalizePublicHandle } from './handles';
import type { LeaderboardEntry, OpenRoom, Player } from './types';

type OtpRecord = { code: string; expiresAt: number; attempts: number };

const otpStore = new Map<string, OtpRecord>();
const players = new Map<string, Player>();
const runtimeRooms = new Map<string, OpenRoom>();

export function issueOtp(phone: string) {
  const normalized = phone.replace(/\D/g, '');
  const code = process.env.NODE_ENV === 'production' ? String(Math.floor(100000 + Math.random() * 900000)) : '123456';
  otpStore.set(normalized, { code, expiresAt: Date.now() + 10 * 60 * 1000, attempts: 0 });
  return { code, expiresAt: Date.now() + 10 * 60 * 1000 };
}

export function verifyOtp(phone: string, code: string) {
  const normalized = phone.replace(/\D/g, '');
  const record = otpStore.get(normalized);
  if (!record || record.expiresAt < Date.now() || record.attempts >= 5 || record.code !== code) {
    if (record) record.attempts += 1;
    return false;
  }
  otpStore.delete(normalized);
  return true;
}

export function getPlayer(id: string) {
  return players.get(id) ?? null;
}

export function getPlayerByPhone(phone: string): Player | null {
  const normalized = phone.replace(/\D/g, '');
  if (!normalized) return null;
  for (const player of players.values()) {
    if (player.phone && player.phone.replace(/\D/g, '') === normalized) {
      return player;
    }
  }
  return null;
}

export function getPlayerByHandle(handle: string): Player | null {
  const normalized = normalizePublicHandle(handle).toLowerCase();
  if (!normalized) return null;
  for (const player of players.values()) {
    if (player.handle.toLowerCase() === normalized) {
      return player;
    }
  }
  return null;
}

export function createPlayer(input: { phone: string; displayName: string; handle: string; city: string; state: string; category: InitialCategory; club?: string }) {
  const id = `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const initialRank = initialRankForCategory(input.category);

  const player: Player = {
    id,
    displayName: input.displayName,
    handle: normalizePublicHandle(input.handle),
    initials: input.displayName.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
    city: input.city,
    state: input.state,
    country: 'Brasil',
    phone: input.phone ? input.phone.replace(/\D/g, '') : undefined,
    club: input.club ?? 'Clube ainda não definido',
    rating: { rating: ratingMidpointForRank(initialRank), deviation: 350, volatility: 0.06, matches: 0, provisional: true },
    rank: { tier: initialRank, points: 50, maxPoints: 100, peakLabel: initialRank.label },
    seasonPoints: 0,
    globalPosition: 0,
    cityPosition: 0,
    clubPosition: 0,
    streak: 0,
    lastPlayed: 'Ainda não jogou',
  };
  players.set(id, player);
  return player;
}


export function listRooms() {
  return Array.from(runtimeRooms.values());
}

export function joinRoom(id: string) {
  const room = runtimeRooms.get(id);
  if (!room || room.slots <= 0) return null;
  const updated = { ...room, slots: room.slots - 1 };
  runtimeRooms.set(id, updated);
  return updated;
}

export function listLeaderboard(): LeaderboardEntry[] {
  return [];
}
