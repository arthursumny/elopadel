import { NextResponse } from 'next/server';
import { isValidPublicHandle, normalizePublicHandle } from '@/lib/handles';
import { isPublicHandleAvailable } from '@/lib/handle-availability';
import { consumeRateLimit, hashRateLimitIp } from '@/lib/security/rate-limit';

const NO_STORE = { 'cache-control': 'no-store' };

function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function clientIp(headers: Headers): string {
  // Trust forwarded address headers only when the deployment proxy overwrites
  // them. They are caller-controlled when the application is directly exposed.
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headers.get('x-real-ip')?.trim();
  // Without either header, all requests share one bucket; the app cannot read a
  // socket peer address from the Web Request API used by this Route Handler.
  return forwarded || realIp || 'unknown';
}

export async function GET(request: Request) {
  const handle = normalizePublicHandle(new URL(request.url).searchParams.get('handle') ?? '');
  if (!isValidPublicHandle(handle)) {
    return json({ error: 'Escolha uma arroba válida e não reservada.' }, 400);
  }

  let allowed: boolean;
  try {
    allowed = await consumeRateLimit('handleAvailability', hashRateLimitIp(clientIp(request.headers)));
  } catch {
    return json({ error: 'Verificação temporariamente indisponível. Tente novamente.' }, 503);
  }
  if (!allowed) {
    return json({ error: 'Muitas verificações. Aguarde um minuto e tente novamente.' }, 429);
  }

  try {
    const available = await isPublicHandleAvailable(handle);
    return json({ handle, available });
  } catch {
    return json({ error: 'Verificação temporariamente indisponível. Tente novamente.' }, 503);
  }
}
