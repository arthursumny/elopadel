import { SignJWT, jwtVerify } from 'jose';
import { and, eq } from 'drizzle-orm';
import { getAuthSecret } from '@/lib/auth';
import { db } from '@/lib/db';
import { clubs } from '@/lib/db/schema';
import { areCanonicalLocationsEqual, mapGeoapifyFeaturesToClubLocation, normalizeBrazilianState, normalizeBrazilCountry, normalizeLocationText, type CanonicalLocation } from '@/lib/location-domain';

export const LOCATION_TOKEN_TTL_SECONDS = 5 * 60;
/**
 * A confirmação serve para resolver a CIDADE da busca, não a quadra. Leituras de
 * navegador em desktop usam Wi-Fi/IP e costumam entregar 500 m a 5 km de erro,
 * então o limite aceita qualquer leitura suficiente para geocodificar a cidade.
 */
export const LOCATION_MAX_ACCURACY_METERS = 5_000;
export type LocationSource = 'gps' | 'manual';
const GEOAPIFY_REVERSE_URL = 'https://api.geoapify.com/v1/geocode/reverse';
const GEOAPIFY_TIMEOUT_MS = 5_000;

export class LocationServiceError extends Error {
  constructor(public code: 'UNAVAILABLE' | 'NOT_FOUND') {
    super(code);
  }
}

export type VerifiedLocation = CanonicalLocation & { expiresAt: string; source: LocationSource };
export type LocationMeasurement = { latitude: number; longitude: number; accuracy: number; timestamp: number };

export function validateLocationMeasurement(body: unknown, now = Date.now()): { valid: true; measurement: LocationMeasurement } | { valid: false; status: 400 | 422; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { valid: false, status: 400, error: 'Informe as coordenadas e os dados da captura.' };
  const value = body as Record<string, unknown>;
  const { latitude, longitude, accuracy, timestamp } = value;
  if ([latitude, longitude, accuracy, timestamp].some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    return { valid: false, status: 400, error: 'Os dados da localização são inválidos.' };
  }
  if ((latitude as number) < -90 || (latitude as number) > 90 || (longitude as number) < -180 || (longitude as number) > 180) {
    return { valid: false, status: 422, error: 'As coordenadas estão fora dos limites válidos.' };
  }
  if ((accuracy as number) < 0 || (accuracy as number) > LOCATION_MAX_ACCURACY_METERS) return { valid: false, status: 422, error: 'A localização está imprecisa. Ative a localização precisa do dispositivo ou informe sua cidade manualmente.' };
  if ((timestamp as number) > now + 30_000 || now - (timestamp as number) > 5 * 60_000) return { valid: false, status: 422, error: 'A localização precisa ter sido capturada nos últimos cinco minutos.' };
  return { valid: true, measurement: { latitude: latitude as number, longitude: longitude as number, accuracy: accuracy as number, timestamp: timestamp as number } };
}

export function isGeoapifyConfigured() {
  return Boolean(process.env.GEOAPIFY_API_KEY?.trim());
}

export async function reverseGeocodeCity(latitude: number, longitude: number, fetcher: typeof fetch = fetch): Promise<unknown> {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  if (!apiKey) throw new LocationServiceError('UNAVAILABLE');
  const url = new URL(GEOAPIFY_REVERSE_URL);
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('type', 'city');
  url.searchParams.set('lang', 'pt');
  url.searchParams.set('apiKey', apiKey);
  let response: Response;
  try {
    response = await fetcher(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(GEOAPIFY_TIMEOUT_MS) });
  } catch {
    throw new LocationServiceError('UNAVAILABLE');
  }
  if (!response.ok) throw new LocationServiceError('UNAVAILABLE');
  try {
    return await response.json();
  } catch {
    throw new LocationServiceError('UNAVAILABLE');
  }
}

export async function resolveCoordinatesToActiveClubLocation(latitude: number, longitude: number): Promise<CanonicalLocation> {
  if (!db) throw new LocationServiceError('UNAVAILABLE');
  const activeClubs = await db.select({ city: clubs.city, state: clubs.state, country: clubs.country })
    .from(clubs)
    .where(eq(clubs.isActive, true));
  if (activeClubs.length === 0) throw new LocationServiceError('NOT_FOUND');
  const response = await reverseGeocodeCity(latitude, longitude);
  const location = mapGeoapifyFeaturesToClubLocation(response && typeof response === 'object' ? (response as { features?: unknown }).features : null, activeClubs);
  if (!location) throw new LocationServiceError('NOT_FOUND');
  return location;
}

export async function resolveFriendlyLocation(city: string, clubId?: string): Promise<CanonicalLocation | null> {
  if (!db) return null;
  const rows = await db.select({ id: clubs.id, city: clubs.city, state: clubs.state, country: clubs.country })
    .from(clubs)
    .where(clubId ? and(eq(clubs.id, clubId), eq(clubs.isActive, true)) : eq(clubs.isActive, true));
  const candidates = rows.filter((club) => normalizeLocationText(club.city) === normalizeLocationText(city))
    .map((club) => {
      const state = normalizeBrazilianState(club.state);
      if (!state || normalizeBrazilCountry(club.country) !== 'BR') return null;
      return { id: club.id, location: { city: club.city.trim(), state, country: club.country.trim() } };
    })
    .filter((candidate): candidate is { id: string; location: CanonicalLocation } => candidate !== null);
  if (clubId) return candidates.find((candidate) => candidate.id === clubId)?.location ?? null;
  if (candidates.length === 0) return null;
  const location = candidates[0]!.location;
  return candidates.every((candidate) => areCanonicalLocationsEqual(location, candidate.location)) ? location : null;
}

export async function isActiveClubAtLocation(location: CanonicalLocation, clubId?: string) {
  if (!db) return false;
  const rows = await db.select({ id: clubs.id, city: clubs.city, state: clubs.state, country: clubs.country })
    .from(clubs)
    .where(clubId ? and(eq(clubs.id, clubId), eq(clubs.isActive, true)) : eq(clubs.isActive, true));
  return rows.some((club) => (!clubId || club.id === clubId) && areCanonicalLocationsEqual(location, {
    city: club.city,
    state: normalizeBrazilianState(club.state) ?? '',
    country: club.country,
  }));
}

export async function issueLocationToken(userId: string, location: CanonicalLocation, now = Date.now(), source: LocationSource = 'gps') {
  const issuedAt = Math.floor(now / 1000);
  const expiresAt = issuedAt + LOCATION_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({ purpose: 'matchmaking-location', city: location.city, state: location.state, country: location.country, source })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(getAuthSecret());
  return { token, expiresAt: new Date(expiresAt * 1000).toISOString() };
}

export async function verifyLocationToken(token: string, userId: string, now = Date.now()): Promise<VerifiedLocation | null> {
  try {
    const { payload } = await jwtVerify(token, getAuthSecret(), { algorithms: ['HS256'], currentDate: new Date(now) });
    if (payload.purpose !== 'matchmaking-location' || payload.sub !== userId || typeof payload.iat !== 'number' || typeof payload.exp !== 'number') return null;
    if (payload.exp - payload.iat !== LOCATION_TOKEN_TTL_SECONDS || payload.iat > Math.floor(now / 1000) + 30) return null;
    if (typeof payload.city !== 'string' || !payload.city.trim() || typeof payload.state !== 'string' || typeof payload.country !== 'string') return null;
    const state = normalizeBrazilianState(payload.state);
    if (!state || normalizeBrazilCountry(payload.country) !== 'BR') return null;
    const source: LocationSource = payload.source === 'manual' ? 'manual' : 'gps';
    return { city: payload.city.trim(), state, country: payload.country.trim(), expiresAt: new Date(payload.exp * 1000).toISOString(), source };
  } catch {
    return null;
  }
}
