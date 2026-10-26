export type CanonicalLocation = { city: string; state: string; country: string };
export type ActiveClubLocation = CanonicalLocation & { isActive?: boolean };

const STATE_NAMES: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const VALID_STATE_CODES = new Set(Object.values(STATE_NAMES));

export function normalizeLocationText(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

export function normalizeBrazilianState(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().toUpperCase();
  const suffixCode = clean.match(/^(?:BR[-_])?([A-Z]{2})$/)?.[1];
  if (suffixCode && VALID_STATE_CODES.has(suffixCode)) return suffixCode;
  return STATE_NAMES[normalizeLocationText(value)] ?? null;
}

export function normalizeBrazilCountry(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const country = normalizeLocationText(value);
  return ['br', 'brasil', 'brazil'].includes(country) ? 'BR' : null;
}

type GeoapifyProperties = {
  result_type?: unknown;
  country_code?: unknown;
  city?: unknown;
  state?: unknown;
  state_code?: unknown;
};

export type GeoapifyFeature = { properties?: GeoapifyProperties };

function locationFromFeature(feature: GeoapifyFeature): CanonicalLocation | null {
  const properties = feature.properties;
  if (!properties || properties.result_type !== 'city' || typeof properties.country_code !== 'string' || properties.country_code.toLowerCase() !== 'br') return null;
  if (typeof properties.city !== 'string' || !properties.city.trim()) return null;
  const byCode = normalizeBrazilianState(properties.state_code);
  const byName = normalizeBrazilianState(properties.state);
  if (!byCode && !byName) return null;
  if (byCode && byName && byCode !== byName) return null;
  return { city: properties.city.trim(), state: byCode ?? byName!, country: 'BR' };
}

/**
 * Matches reverse-geocoder city results only against active first-party club locations.
 * Counties/districts and cities unsupported by our club directory are never fallback locations.
 */
export function mapGeoapifyFeaturesToClubLocation(features: unknown, activeClubs: ActiveClubLocation[]): CanonicalLocation | null {
  if (!Array.isArray(features)) return null;
  const matches = new Map<string, CanonicalLocation>();
  for (const feature of features as GeoapifyFeature[]) {
    const providerLocation = locationFromFeature(feature);
    if (!providerLocation) continue;
    for (const club of activeClubs) {
      if (club.isActive === false || normalizeLocationText(club.city) !== normalizeLocationText(providerLocation.city)) continue;
      if (normalizeBrazilianState(club.state) !== providerLocation.state || normalizeBrazilCountry(club.country) !== 'BR') continue;
      const canonical = { city: club.city.trim(), state: providerLocation.state, country: club.country.trim() };
      matches.set(`${normalizeLocationText(canonical.city)}|${canonical.state}|BR`, canonical);
    }
  }
  return matches.size === 1 ? Array.from(matches.values())[0] ?? null : null;
}

export function areCanonicalLocationsEqual(a: CanonicalLocation | null | undefined, b: CanonicalLocation | null | undefined) {
  return Boolean(a && b
    && normalizeLocationText(a.city) === normalizeLocationText(b.city)
    && normalizeBrazilianState(a.state) === normalizeBrazilianState(b.state)
    && normalizeBrazilCountry(a.country) === normalizeBrazilCountry(b.country));
}

export function staleLocationReadiness(now: Date, readiness: {
  initiatorReady: boolean;
  initiatorExpiresAt: Date | null;
  partnerReady: boolean;
  partnerExpiresAt: Date | null;
}) {
  const isFresh = (ready: boolean, expiresAt: Date | null) => ready && expiresAt !== null && expiresAt.getTime() > now.getTime();
  return {
    initiator: readiness.initiatorReady && !isFresh(readiness.initiatorReady, readiness.initiatorExpiresAt),
    partner: readiness.partnerReady && !isFresh(readiness.partnerReady, readiness.partnerExpiresAt),
  };
}
