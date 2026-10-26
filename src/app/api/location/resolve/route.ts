import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { hashRateLimitIp, consumeRateLimit } from '@/lib/security/rate-limit';
import { isGeoapifyConfigured, issueLocationToken, resolveCoordinatesToActiveClubLocation, validateLocationMeasurement } from '@/lib/location';

const NO_STORE = { 'cache-control': 'no-store' };

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  return forwarded || realIp || 'unknown';
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return json({ error: 'Faça login para validar sua localização.' }, 401);
  if (!isGeoapifyConfigured()) return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);

  const body = await request.json().catch(() => null);
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
    return json({ location: { ...location, token: proof.token, expiresAt: proof.expiresAt } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'NOT_FOUND') return json({ error: 'Não encontramos uma cidade compatível com clubes ativos.' }, 422);
    return json({ error: 'A validação de localização está temporariamente indisponível.' }, 503);
  }
}
