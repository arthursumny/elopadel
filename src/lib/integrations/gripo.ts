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

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const availabilityCache = new Map<string, CacheEntry<GripoAvailabilityResponse>>();

export function clearGripoAvailabilityCache(): void {
  availabilityCache.clear();
}

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
  const cacheKey = `${clubId}:${date}`;
  const cached = availabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

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

  const result: GripoAvailabilityResponse = {
    date: raw.date || date,
    scheduleNotes: raw.schedule_notes,
    limitDateSchedule: raw.limit_date_schedule,
    courts,
  };

  availabilityCache.set(cacheKey, {
    data: result,
    expiresAt: Date.now() + 60_000,
  });

  return result;
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
 * Helper to normalize time strings to HH:MM format
 */
export function normalizeToHHMM(timeStr: string): string {
  const parts = timeStr.trim().split(':');
  const h = (parts[0] || '0').padStart(2, '0');
  const m = (parts[1] || '0').padStart(2, '0');
  return `${h}:${m}`;
}

export function parseTimeToMinutes(timeStr: string): number {
  const [h = '0', m = '0'] = timeStr.trim().split(':');
  return Number(h) * 60 + Number(m);
}

export function minutesToTimeString(minutes: number): string {
  const normMinutes = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normMinutes / 60);
  const m = normMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function calculateSlotDurationMinutes(startHour: string, endHour: string): number {
  const startMins = parseTimeToMinutes(startHour);
  const endMins = parseTimeToMinutes(endHour);
  const diff = endMins - startMins;
  return diff > 0 ? diff : diff + 1440;
}

export function isSandCourt(court: GripoCourt): boolean {
  const norm = (str?: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const name = norm(court.name);
  const type = norm(court.type);
  const tagsStr = (court.tags || []).map(norm).join(' ');

  const sandKeywords = ['beach', 'areia', 'futevolei', 'volei', 'sand'];
  return sandKeywords.some(
    (k) => name.includes(k) || type.includes(k) || tagsStr.includes(k)
  );
}

export function isRealPadelCourt(court: GripoCourt): boolean {
  if (isSandCourt(court)) {
    return false;
  }

  const norm = (str?: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const name = norm(court.name);
  const type = norm(court.type);

  const isGlass =
    type === 'vidro' ||
    type === 'glass' ||
    type.includes('vidro') ||
    type.includes('glass');
  const hasPadel = name.includes('padel');

  return isGlass || hasPadel;
}

export function getCourtQualityScore(court: GripoCourt): number {
  if (isSandCourt(court)) {
    return -1000;
  }

  const norm = (str?: string) =>
    (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const name = norm(court.name);
  const type = norm(court.type);

  let score = 0;
  const isGlass =
    type === 'vidro' ||
    type === 'glass' ||
    type.includes('vidro') ||
    type.includes('glass');
  const hasPadel = name.includes('padel');

  if (isGlass) score += 100;
  if (hasPadel) score += 100;

  return score;
}

export interface BestSlotResult {
  courtId: number;
  courtName: string;
  startHour: string;
  endHour: string;
  totalPriceCents: number | null;
  slotIds: string[];
}

export interface SelectBestSlotOptions {
  startTime: string;
  durationMinutes: number;
  sport?: string;
  allowNonPadelCourts?: boolean;
  windowStart?: string;
  windowEnd?: string;
}

/**
 * Pure function to select the best slot matching duration and court preferences.
 */
export function selectBestSlot(
  availability: GripoAvailabilityResponse,
  params: SelectBestSlotOptions
): BestSlotResult | null {
  const requestedStartHHMM = normalizeToHHMM(params.startTime);
  const requestedStartMins = parseTimeToMinutes(requestedStartHHMM);
  const duration = params.durationMinutes;
  const allowNonPadel = params.allowNonPadelCourts ?? false;

  if (duration <= 0 || !availability?.courts?.length) {
    return null;
  }

  const hasWindow = params.windowStart !== undefined || params.windowEnd !== undefined;
  const wStartMins = params.windowStart ? parseTimeToMinutes(normalizeToHHMM(params.windowStart)) : null;
  const wEndMins = params.windowEnd ? parseTimeToMinutes(normalizeToHHMM(params.windowEnd)) : null;

  interface Candidate {
    courtId: number;
    courtName: string;
    startHour: string;
    endHour: string;
    totalPriceCents: number | null;
    slotIds: string[];
    courtScore: number;
    offsetMinutes: number;
  }

  const candidates: Candidate[] = [];
  const seenCandidates = new Set<string>();

  for (const court of availability.courts) {
    if (!allowNonPadel && !isRealPadelCourt(court)) {
      continue;
    }

    const courtScore = getCourtQualityScore(court);

    // Filter slots by availability and sport
    const validSlots = (court.hours || []).filter((s) => {
      if (!s.available || !s.availableToSchedule) return false;
      if (params.sport && s.sport) {
        if (s.sport.trim().toLowerCase() !== params.sport.trim().toLowerCase()) {
          return false;
        }
      }
      return true;
    });

    if (validSlots.length === 0) {
      continue;
    }

    let possibleStartMins: number[];
    if (hasWindow) {
      const allStarts = Array.from(
        new Set(validSlots.map((s) => parseTimeToMinutes(normalizeToHHMM(s.startHour))))
      ).sort((a, b) => a - b);

      possibleStartMins = allStarts.filter((startM) => {
        if (wStartMins !== null && startM < wStartMins) return false;
        if (wEndMins !== null && startM + duration > wEndMins) return false;
        return true;
      });
    } else {
      const offsets = [0, 30, 60, 90, 120];
      possibleStartMins = offsets.map((off) => requestedStartMins + off);
    }

    for (const candidateStartMins of possibleStartMins) {
      const targetEndMins = candidateStartMins + duration;
      let cursorMins = candidateStartMins;
      let cursorStr = minutesToTimeString(cursorMins);
      const matchedSlots: GripoSlot[] = [];

      while (cursorMins < targetEndMins) {
        const nextSlot = validSlots.find(
          (s) => normalizeToHHMM(s.startHour) === cursorStr
        );

        if (!nextSlot) {
          break; // Contiguity broken
        }

        matchedSlots.push(nextSlot);
        const slotDur = calculateSlotDurationMinutes(nextSlot.startHour, nextSlot.endHour);
        if (slotDur <= 0) {
          break;
        }

        cursorMins += slotDur;
        cursorStr = normalizeToHHMM(nextSlot.endHour);
      }

      if (cursorMins >= targetEndMins && matchedSlots.length > 0) {
        const candidateStartStr = normalizeToHHMM(matchedSlots[0].startHour);
        const candidateEndStr = normalizeToHHMM(matchedSlots[matchedSlots.length - 1].endHour);
        const actualStartMins = parseTimeToMinutes(candidateStartStr);
        const actualEndMins = cursorMins;

        if (wStartMins !== null && actualStartMins < wStartMins) {
          continue;
        }
        if (wEndMins !== null && actualEndMins > wEndMins) {
          continue;
        }

        const candidateKey = `${court.id}:${candidateStartStr}:${candidateEndStr}`;
        if (seenCandidates.has(candidateKey)) {
          continue;
        }
        seenCandidates.add(candidateKey);

        let hasPrice = false;
        let totalPrice = 0;
        for (const s of matchedSlots) {
          if (typeof s.priceInCents === 'number') {
            hasPrice = true;
            totalPrice += s.priceInCents;
          }
        }

        const slotIds = matchedSlots.map((s) =>
          s.hash || String((s as unknown as { id?: string | number }).id ?? s.scheduleGridId ?? '')
        );

        const offsetMinutes = Math.abs(actualStartMins - requestedStartMins);

        candidates.push({
          courtId: court.id,
          courtName: court.name,
          startHour: candidateStartStr,
          endHour: candidateEndStr,
          totalPriceCents: hasPrice ? totalPrice : null,
          slotIds,
          courtScore,
          offsetMinutes,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Score sorting:
  // 1. preferir quadras 'de padel de verdade' (courtScore maior)
  // 2. depois preferir o início mais próximo do horário pedido (offsetMinutes menor)
  // 3. em empate, preferir o menor preço total
  // 4. em empate, preferir início mais cedo
  // 5. menor id da quadra
  candidates.sort((a, b) => {
    if (b.courtScore !== a.courtScore) {
      return b.courtScore - a.courtScore;
    }
    if (a.offsetMinutes !== b.offsetMinutes) {
      return a.offsetMinutes - b.offsetMinutes;
    }
    if (a.totalPriceCents !== null && b.totalPriceCents !== null) {
      if (a.totalPriceCents !== b.totalPriceCents) {
        return a.totalPriceCents - b.totalPriceCents;
      }
    } else if (a.totalPriceCents !== null) {
      return -1;
    } else if (b.totalPriceCents !== null) {
      return 1;
    }
    const aStart = parseTimeToMinutes(a.startHour);
    const bStart = parseTimeToMinutes(b.startHour);
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    return a.courtId - b.courtId;
  });

  const best = candidates[0];
  return {
    courtId: best.courtId,
    courtName: best.courtName,
    startHour: best.startHour,
    endHour: best.endHour,
    totalPriceCents: best.totalPriceCents,
    slotIds: best.slotIds,
  };
}

export interface FindBestSlotForMatchOptions extends SelectBestSlotOptions {
  clubId: number;
  date: string;
}

export const gripoApi = {
  fetchGripoAvailability,
};

/**
 * Find the best court slot for a match from Gripo availability.
 */
export async function findBestSlotForMatch(
  params: FindBestSlotForMatchOptions
): Promise<BestSlotResult | null> {
  const cacheKey = `${params.clubId}:${params.date}`;
  let availability: GripoAvailabilityResponse;

  const cached = availabilityCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    availability = cached.data;
  } else {
    availability = await gripoApi.fetchGripoAvailability(params.clubId, params.date);
    availabilityCache.set(cacheKey, {
      data: availability,
      expiresAt: Date.now() + 60_000,
    });
  }

  return selectBestSlot(availability, {
    startTime: params.startTime,
    durationMinutes: params.durationMinutes,
    sport: params.sport,
    allowNonPadelCourts: params.allowNonPadelCourts,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
  });
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
 * Resolve Gripo club numeric ID from URL, slug or stored club properties.
 *
 * NOTA: Esta função atua apenas como fallback heurístico. O caminho preferencial
 * passa a ser a coluna `clubs.gripoClubId` vinda do sync com a API do Gripo.
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

/**
 * Resolve o ID numérico do clube no Gripo a partir dos dados do registro.
 * Retorna preferencialmente o `gripoClubId` numérico persistido; quando ausente,
 * utiliza como fallback a heurística baseada em `gripoUrl`.
 */
export function resolveGripoClubIdFromRecord(club?: {
  gripoClubId?: number | null;
  gripoUrl?: string | null;
} | null): number | null {
  if (!club) return null;

  if (typeof club.gripoClubId === 'number' && !Number.isNaN(club.gripoClubId) && club.gripoClubId > 0) {
    return club.gripoClubId;
  }

  return resolveGripoClubId(club.gripoUrl);
}
