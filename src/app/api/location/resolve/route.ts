import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { hashRateLimitIp, consumeRateLimit } from '@/lib/security/rate-limit';
import { isGeoapifyConfigured, issueLocationToken, resolveCoordinatesToActiveClubLocation, resolveFriendlyLocation, validateLocationMeasurement } from '@/lib/location';

const NO_STORE = { 'cache-control': 'no-store' };
const MAX_CITY_LENGTH = 120;

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'unknown';
}

function hasCityField(body: unknown): boolean {
  return Boolean(body) && typeof body === 'object' && !Array.isArray(body) && 'city' in (body as Record<string, unknown>);
}

function manualCity(body: unknown): string | null {
  if (!hasCityField(body)) return null;
  const value = body as Record<string, unknown>;
  // Coordenadas e cidade no mesmo payload são ambíguas: exigimos um fluxo por vez.
  if (value.latitude !== undefined || value.longitude !== undefined) return null;
  if (typeof value.city !== 'string') return null;
  const city = value.city.trim();
  if (!city || city.length > MAX_CITY_LENGTH) return null;
  return city;
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return json({ error: 'Faça login para validar sua localização.' }, 401);

  const body = await request.json().catch(() => null);

  // Fluxo manual: o jogador escolhe a cidade entre as que têm clubes ativos.
  // Não depende do Geoapify e é marcado como 'manual' no token.
  if (hasCityField(body)) {
    const city = manualCity(body);
    if (!city) return json({ error: 'Informe uma cidade válida.' }, 400);

    let allowed: boolean;
    try {
      allowed = await consumeRateLimit('locationResolve', hashRateLimitIp(clientIp(request.headers)));
    } catch {
      return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);
    }
    if (!allowed) return json({ error: 'Muitas validações de localização. Aguarde antes de tentar novamente.' }, 429);

    try {
      const location = await resolveFriendlyLocation(city);
      if (!location) return json({ error: 'Não encontramos uma cidade com clubes ativos com esse nome.' }, 422);
      const proof = await issueLocationToken(userId, location, Date.now(), 'manual');
      return json({ location: { ...location, token: proof.token, expiresAt: proof.expiresAt, source: 'manual' } });
    } catch {
      return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);
    }
  }

  if (!isGeoapifyConfigured()) return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);

  const parsed = validateLocationMeasurement(body);
  if (!parsed.valid) return json({ error: parsed.error }, parsed.status);

  let allowed: boolean;
  try {
    allowed = await consumeRateLimit('locationResolve', hashRateLimitIp(clientIp(request.headers)));
  } catch {
    return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);
  }
  if (!allowed) return json({ error: 'Muitas validações de localização. Aguarde antes de tentar novamente.' }, 429);

  try {
    const { latitude, longitude } = parsed.measurement;
    const location = await resolveCoordinatesToActiveClubLocation(latitude, longitude);
    const proof = await issueLocationToken(userId, location);
    return json({ location: { ...location, token: proof.token, expiresAt: proof.expiresAt, source: 'gps' } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'NOT_FOUND') return json({ error: 'Não encontramos uma cidade compatível com clubes ativos.' }, 422);
    return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);
  }
}
