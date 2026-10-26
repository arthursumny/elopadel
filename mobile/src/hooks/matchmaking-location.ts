import * as Location from 'expo-location';
import { matchmakingApi } from '../api/matchmaking';
import type { MatchmakingClub } from '../api/types';

const LOCATION_MAX_AGE_MS = 5 * 60_000;
const LOCATION_MAX_ACCURACY_METERS = 100;
const LOCATION_TIMEOUT_MS = 10_000;

export type MatchmakingLocationProof = {
  city: string;
  state: string;
  country: string;
  token: string;
  expiresAt: string;
  resolvedAt: number;
};

export class MatchmakingLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchmakingLocationError';
  }
}

function normalizeLocality(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function clubsForMatchmakingLocation(clubs: readonly MatchmakingClub[], location: Pick<MatchmakingLocationProof, 'city' | 'state'>) {
  return clubs.filter((club) => normalizeLocality(club.city) === normalizeLocality(location.city) && club.state.trim().toUpperCase() === location.state.trim().toUpperCase());
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new MatchmakingLocationError('Não foi possível obter sua localização a tempo. Confira o sinal de GPS e tente novamente.')), timeoutMs);
  });
  return Promise.race([promise, timedOut]).finally(() => clearTimeout(timeout!));
}

export function isMatchmakingLocationProofFresh(proof: MatchmakingLocationProof | null | undefined, now = Date.now()) {
  if (!proof || !Number.isFinite(proof.resolvedAt) || now < proof.resolvedAt) return false;
  const expiresAt = Date.parse(proof.expiresAt);
  return now - proof.resolvedAt < LOCATION_MAX_AGE_MS && Number.isFinite(expiresAt) && expiresAt > now;
}

export async function resolveCurrentMatchmakingLocation(now = Date.now): Promise<MatchmakingLocationProof> {
  let position: Location.LocationObject;
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      throw new MatchmakingLocationError('Permita o acesso à localização durante o uso do app nas configurações do aparelho e tente novamente.');
    }
    position = await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), LOCATION_TIMEOUT_MS);
  } catch (error) {
    if (error instanceof MatchmakingLocationError) throw error;
    throw new MatchmakingLocationError('Não foi possível obter sua localização. Ative o GPS e tente novamente.');
  }

  const { latitude, longitude, accuracy } = position.coords;
  const timestamp = position.timestamp;
  const capturedAt = now();
  if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    || accuracy === null || accuracy < 0 || accuracy > LOCATION_MAX_ACCURACY_METERS) {
    throw new MatchmakingLocationError('A localização está imprecisa. Ative a localização precisa ou tente novamente em um local aberto.');
  }
  if (timestamp > capturedAt + 30_000 || capturedAt - timestamp > LOCATION_MAX_AGE_MS) {
    throw new MatchmakingLocationError('A localização recebida está desatualizada. Tente novamente para confirmar sua posição atual.');
  }

  try {
    const result = await matchmakingApi.resolveLocation({ latitude, longitude, accuracy, timestamp });
    return { ...result.location, resolvedAt: now() };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new MatchmakingLocationError(message || 'Não foi possível validar sua cidade. Confira sua conexão e tente novamente.');
  }
}
