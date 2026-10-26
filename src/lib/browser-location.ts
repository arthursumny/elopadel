export type BrowserLocationMeasurement = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

export type BrowserLocationProof = {
  city: string;
  state: string;
  country: string;
  token: string;
  expiresAt: string;
  resolvedAt: number;
};

export type LocationClub = { id: string; city: string; state: string };

function normalizeLocality(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

export function clubsForBrowserLocation<T extends LocationClub>(clubs: readonly T[], location: Pick<BrowserLocationProof, 'city' | 'state'>) {
  return clubs.filter((club) => normalizeLocality(club.city) === normalizeLocality(location.city) && club.state.trim().toUpperCase() === location.state.trim().toUpperCase());
}

export function clubIdForBrowserLocation<T extends LocationClub>(clubId: string, location: Pick<BrowserLocationProof, 'city' | 'state'>, clubs: readonly T[]) {
  return clubsForBrowserLocation(clubs, location).some((club) => club.id === clubId) ? clubId : '';
}

type GeolocationLike = Pick<Geolocation, 'getCurrentPosition'>;

export class BrowserLocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserLocationError';
  }
}

const LOCATION_MAX_AGE_MS = 5 * 60_000;
const LOCATION_MAX_ACCURACY_METERS = 100;
const GEOLOCATION_TIMEOUT_MS = 10_000;

function browserGeolocation() {
  if (typeof navigator === 'undefined') return undefined;
  return navigator.geolocation;
}

function browserIsSecureContext() {
  return typeof window === 'undefined' || typeof window.isSecureContext !== 'boolean' || window.isSecureContext;
}

function capturePosition(geolocation: GeolocationLike): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: GEOLOCATION_TIMEOUT_MS,
    });
  });
}

function geolocationError(error: unknown) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (code === 1) return new BrowserLocationError('A permissão de localização foi negada. Libere o acesso à localização nas configurações do navegador e tente novamente.');
  if (code === 3) return new BrowserLocationError('Não foi possível obter sua localização a tempo. Confira o sinal de GPS e tente novamente.');
  return new BrowserLocationError('Não foi possível obter sua localização. Ative o GPS e tente novamente.');
}

export async function resolveCurrentBrowserLocation({
  geolocation = browserGeolocation(),
  fetcher = fetch,
  now = Date.now,
  secureContext = browserIsSecureContext(),
}: {
  geolocation?: GeolocationLike;
  fetcher?: typeof fetch;
  now?: () => number;
  secureContext?: boolean;
} = {}): Promise<BrowserLocationProof> {
  if (!secureContext) throw new BrowserLocationError('A localização só funciona em uma conexão segura (HTTPS). Abra o app por HTTPS e tente novamente.');
  if (!geolocation) throw new BrowserLocationError('Este navegador não oferece localização. Abra o app em um navegador compatível e tente novamente.');

  let position: GeolocationPosition;
  try {
    position = await capturePosition(geolocation);
  } catch (error) {
    throw geolocationError(error);
  }

  const { latitude, longitude, accuracy } = position.coords;
  const timestamp = position.timestamp;
  const capturedAt = now();
  if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    || accuracy < 0 || accuracy > LOCATION_MAX_ACCURACY_METERS) {
    throw new BrowserLocationError('A localização está imprecisa. Ative a localização precisa ou tente novamente em um local aberto.');
  }
  if (timestamp > capturedAt + 30_000 || capturedAt - timestamp > LOCATION_MAX_AGE_MS) {
    throw new BrowserLocationError('A localização recebida está desatualizada. Tente novamente para confirmar sua posição atual.');
  }

  let response: Response;
  try {
    response = await fetcher('/api/location/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ latitude, longitude, accuracy, timestamp }),
    });
  } catch {
    throw new BrowserLocationError('Não foi possível validar sua localização. Confira sua conexão e tente novamente.');
  }

  const data = await response.json().catch(() => ({})) as {
    location?: Omit<BrowserLocationProof, 'resolvedAt'>;
    error?: string;
  };
  if (!response.ok || !data.location?.token || !data.location.city || !data.location.state || !data.location.expiresAt) {
    throw new BrowserLocationError(data.error || 'Não foi possível validar sua cidade. Confira sua conexão e tente novamente.');
  }

  return { ...data.location, resolvedAt: now() };
}

export function isBrowserLocationProofFresh(proof: BrowserLocationProof | null | undefined, now = Date.now()) {
  if (!proof || !Number.isFinite(proof.resolvedAt) || now < proof.resolvedAt) return false;
  const expiresAt = Date.parse(proof.expiresAt);
  return now - proof.resolvedAt < LOCATION_MAX_AGE_MS && Number.isFinite(expiresAt) && expiresAt > now;
}
