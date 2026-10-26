import crypto from 'crypto';

const GRIPO_API_BASE = 'https://api.gripo.com.br/app/v1';

export interface GripoSlot {
  date: string;
  hour: string;
  startHour: string;
  endHour: string;
  interval: number;
  available: boolean;
  availableToSchedule: boolean;
  courtId: number;
  courtName: string;
  scheduleGridId: number;
  priceInCents: number | null;
  hash: string;
  sport: string;
}

export interface GripoCourt {
  id: number;
  name: string;
  type?: string;
  place?: string;
  bgColor?: string;
  tags?: string[];
  hours: GripoSlot[];
}

export interface GripoAvailabilityResponse {
  date: string;
  courts: GripoCourt[];
  scheduleNotes?: string;
  limitDateSchedule?: string;
}

export interface GripoBookingParams {
  clubId: number;
  courtId: number;
  date: string; // YYYY-MM-DD
  startHour: string; // e.g. "17:30" or "17:30:00"
  endHour: string; // e.g. "19:00" or "19:00:00"
  notes?: string;
  sport?: string; // default "padel"
  paymentType?: 'link' | 'pix'; // default "link"
}

export interface GripoBookingResult {
  success: boolean;
  scheduleId?: number;
  courtName?: string;
  feedbackTitle?: string;
  message?: string;
  error?: string;
  raw?: unknown;
}

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

export function getGripoBaseHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Origin': 'https://gripo.app',
    'Referer': 'https://gripo.app/',
    'User-Agent':
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'X-Money-Contract': 'money-v4',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Resolve Gripo token:
 * 1. Static GRIPO_TOKEN if defined in env
 * 2. In-memory cached token (if not expired)
 * 3. Dynamic login via POST /auth/login with GRIPO_LOGIN and GRIPO_PASSWORD
 */
export async function getGripoAuthToken(forceRefresh = false): Promise<string | null> {
  const envToken = process.env.GRIPO_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  const now = Date.now();
  if (!forceRefresh && cachedToken && cachedTokenExpiresAt > now) {
    return cachedToken;
  }

  const login = process.env.GRIPO_LOGIN?.trim();
  const password = process.env.GRIPO_PASSWORD?.trim();

  if (!login || !password) {
    return null;
  }

  try {
    const deviceId = crypto.randomUUID();
    const response = await fetch(`${GRIPO_API_BASE}/auth/login`, {
      method: 'POST',
      headers: getGripoBaseHeaders(),
      body: JSON.stringify({
        login,
        password,
        device: deviceId,
        platform: 'web',
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('[GripoIntegration] Login falhou:', response.status, errData);
      return null;
    }

    const data = (await response.json()) as { token?: string };
    if (data.token) {
      cachedToken = data.token;
      // Cache token for 24 hours
      cachedTokenExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
      return cachedToken;
    }

    return null;
  } catch (error) {
    console.error('[GripoIntegration] Erro ao autenticar no Gripo:', error);
    return null;
  }
}

export function clearGripoCachedToken(): void {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
}

/**
 * Fetch available court slots for a club on a given date (YYYY-MM-DD).
 */
export async function fetchGripoAvailability(
  clubId: number,
  date: string
): Promise<GripoAvailabilityResponse> {
  const headers = getGripoBaseHeaders();
  const response = await fetch(`${GRIPO_API_BASE}/schedule/available`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      club_id: clubId,
      date,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Falha ao consultar disponibilidade no Gripo (${response.status}): ${errorText}`
    );
  }

  interface RawGripoSlot {
    date: string;
    hour: string;
    start_hour: string;
    end_hour: string;
    interval?: number;
    available?: boolean;
    available_to_schedule?: boolean;
    court_id: number;
    court: string;
    schedule_grid_id: number;
    price?: number | null;
    hash: string;
    sport?: string;
  }

  interface RawGripoCourt {
    id: number;
    name: string;
    type?: string;
    place?: string;
    bg_color?: string;
    tags?: Array<{ id: string; name: string }>;
    hours?: RawGripoSlot[];
  }

  interface RawResponse {
    date: string;
    schedule_notes?: string;
    limit_date_schedule?: string;
    courts?: RawGripoCourt[];
  }

  const raw = (await response.json()) as RawResponse;

  const courts: GripoCourt[] = (raw.courts || []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    place: c.place,
    bgColor: c.bg_color,
    tags: (c.tags || []).map((t) => t.name || t.id),
    hours: (c.hours || []).map((h) => ({
      date: h.date,
      hour: h.hour,
      startHour: h.start_hour,
      endHour: h.end_hour,
      interval: h.interval || 90,
      available: Boolean(h.available),
      availableToSchedule: Boolean(h.available_to_schedule),
      courtId: h.court_id,
      courtName: h.court,
      scheduleGridId: h.schedule_grid_id,
      priceInCents: h.price ?? null,
      hash: h.hash,
      sport: h.sport || 'padel',
    })),
  }));

  return {
    date: raw.date || date,
    scheduleNotes: raw.schedule_notes,
    limitDateSchedule: raw.limit_date_schedule,
    courts,
  };
}

/**
 * Helper to normalize time strings to HH:MM:SS format
 */
function normalizeTime(timeStr: string): string {
  const parts = timeStr.trim().split(':');
  if (parts.length === 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  if (parts.length === 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
  }
  return timeStr;
}

/**
 * Find an available slot closest to the requested hour
 */
export async function findMatchingGripoSlot(
  clubId: number,
  date: string,
  targetHour: string
): Promise<GripoSlot | null> {
  const normalizedTarget = normalizeTime(targetHour).slice(0, 5); // "HH:MM"
  const availability = await fetchGripoAvailability(clubId, date);

  for (const court of availability.courts) {
    for (const slot of court.hours) {
      if (slot.available && slot.availableToSchedule) {
        const slotStart = normalizeTime(slot.startHour).slice(0, 5);
        if (slotStart === normalizedTarget) {
          return slot;
        }
      }
    }
  }

  // If no exact match, return first available slot
  for (const court of availability.courts) {
    for (const slot of court.hours) {
      if (slot.available && slot.availableToSchedule) {
        return slot;
      }
    }
  }

  return null;
}

/**
 * Automate court reservation on Gripo
 */
export async function confirmGripoBooking(
  params: GripoBookingParams
): Promise<GripoBookingResult> {
  const token = await getGripoAuthToken();

  if (!token) {
    return {
      success: false,
      error:
        'Credenciais do Gripo não configuradas no servidor (GRIPO_LOGIN / GRIPO_PASSWORD ou GRIPO_TOKEN). Configure para permitir reservas automatizadas.',
    };
  }

  const startHourNorm = normalizeTime(params.startHour);
  const endHourNorm = normalizeTime(params.endHour);
  const dateNorm = params.date;

  const payload = {
    club_id: params.clubId,
    court_id: params.courtId,
    restricted_hash: null,
    coach_id: null,
    date: dateNorm,
    start_hour: startHourNorm,
    start_datetime: `${dateNorm} ${startHourNorm}`,
    end_hour: endHourNorm,
    end_datetime: `${dateNorm} ${endHourNorm}`,
    notes: params.notes || 'Elo Padel - Reserva Automática',
    sport: params.sport || 'padel',
    payment_type: params.paymentType || 'link',
    marketing_attribution: null,
  };

  const doRequest = async (authToken: string) => {
    return fetch(`${GRIPO_API_BASE}/schedule/confirm`, {
      method: 'POST',
      headers: getGripoBaseHeaders(authToken),
      body: JSON.stringify(payload),
    });
  };

  let response = await doRequest(token);

  // If 401 Unauthorized, token might have expired. Try to refresh once.
  if (response.status === 401) {
    clearGripoCachedToken();
    const freshToken = await getGripoAuthToken(true);
    if (freshToken) {
      response = await doRequest(freshToken);
    }
  }

  interface GripoConfirmResponse {
    error?: string;
    code?: number | string;
    feedback?: { message?: string };
    title?: string;
    schedule?: {
      id?: number;
      club_id?: number;
      court?: { name?: string };
    };
  }

  const data = (await response.json().catch(() => ({}))) as GripoConfirmResponse;

  if (!response.ok || data.error) {
    const errorMsg =
      data.error ||
      data.feedback?.message ||
      data.title ||
      `Erro na reserva no Gripo (HTTP ${response.status})`;
    return {
      success: false,
      error: errorMsg,
      raw: data,
    };
  }

  return {
    success: true,
    scheduleId: data.schedule?.id,
    courtName: data.schedule?.court?.name,
    feedbackTitle: data.title,
    message: data.feedback?.message || 'Reserva confirmada com sucesso no Gripo!',
    raw: data,
  };
}

/**
 * Resolve Gripo club numeric ID from URL, slug or stored club properties
 */
export function resolveGripoClubId(gripoUrlOrName?: string | null): number | null {
  if (!gripoUrlOrName) return null;

  const text = gripoUrlOrName.toLowerCase();

  // Known Joaçaba clubs
  if (text.includes('padel-joacaba') || text.includes('padel joaçaba') || text.includes('padel joacaba')) {
    return 31;
  }
  if (text.includes('racket-center') || text.includes('racket center')) {
    return 122;
  }

  // Check if numeric query parameter or direct id
  const idMatch = text.match(/club[_-]?id[=:](\d+)/i) || text.match(/\/(\d+)(\/|$)/);
  if (idMatch && idMatch[1]) {
    const parsed = parseInt(idMatch[1], 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}
