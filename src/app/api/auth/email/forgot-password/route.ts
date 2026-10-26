import { NextResponse } from 'next/server';
import { emailProviderConfigured } from '@/lib/email';
import { hashEmailToken, normalizeEmail, validateEmail } from '@/lib/security/email-tokens';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { createPasswordResetForEmail, revokeEmailToken } from '../service';
import { sendPasswordResetEmail } from '../messages';

const GENERIC_MESSAGE = 'Se este email estiver cadastrado, enviaremos instruções para redefinir a senha.';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (!emailProviderConfigured()) {
    return NextResponse.json(
      { error: 'O envio de emails não está configurado. Tente novamente mais tarde.' },
      { status: 503 }
    );
  }

  const emailValidation = validateEmail(body.email);
  // Invalid/unknown emails receive the same generic answer to avoid account enumeration.
  if (!emailValidation.ok) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE }, { headers: { 'cache-control': 'no-store' } });
  }

  const email = normalizeEmail(emailValidation.email);

  try {
    const allowed = await consumeRateLimit('forgotPassword', hashEmailToken(email));
    if (!allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível processar a solicitação agora.' }, { status: 503 });
  }

  let reset: { token: string } | null = null;
  try {
    reset = await createPasswordResetForEmail(email);
  } catch {
    return NextResponse.json({ error: 'Não foi possível processar a solicitação agora.' }, { status: 503 });
  }

  if (reset) {
    try {
      await sendPasswordResetEmail(email, reset.token);
    } catch {
      await revokeEmailToken(reset.token, 'password_reset').catch(() => undefined);
      return NextResponse.json(
        { error: 'Não foi possível enviar o email de recuperação agora. Tente novamente.' },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE }, { headers: { 'cache-control': 'no-store' } });
}
