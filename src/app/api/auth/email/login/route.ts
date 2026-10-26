import { NextResponse } from 'next/server';
import { createSession, setSessionCookie } from '@/lib/auth';
import { hashEmailToken, normalizeEmail, validateEmail } from '@/lib/security/email-tokens';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { EmailAuthError, authenticateEmailAccount } from '../service';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const emailValidation = validateEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';

  if (!emailValidation.ok || !password) {
    return NextResponse.json({ error: 'Informe email e senha.' }, { status: 400 });
  }

  const email = normalizeEmail(emailValidation.email);

  try {
    const allowed = await consumeRateLimit('login', hashEmailToken(email));
    if (!allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente novamente.' }, { status: 503 });
  }

  let authentication;
  try {
    authentication = await authenticateEmailAccount(email, password);
  } catch (error) {
    if (error instanceof EmailAuthError) {
      if (error.code === 'INVALID_CREDENTIALS') {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error.code === 'EMAIL_NOT_VERIFIED' || error.code === 'INACTIVE') {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
    }
    return NextResponse.json({ error: 'Não foi possível entrar agora. Tente novamente.' }, { status: 503 });
  }

  const profile = authentication.profile;
  let token: string;
  try {
    // Use the version captured alongside the credential snapshot for both the
    // response token and the cookie.
    token = await createSession(profile.id, 'player', { sessionVersion: authentication.sessionVersion });
    await setSessionCookie(profile.id, token);
  } catch {
    return NextResponse.json({ error: 'Não foi possível criar sua sessão agora. Tente novamente.' }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    status: 'authenticated',
    token,
    user: profile,
    player: profile,
  }, { headers: { 'cache-control': 'no-store' } });
}
