import { NextResponse } from 'next/server';
import { emailProviderConfigured } from '@/lib/email';
import { hashEmailToken, normalizeEmail, validateEmail, validatePassword } from '@/lib/security/email-tokens';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import {
  EmailAuthError,
  hashNewPassword,
  issueEmailVerificationToken,
  registerEmailAccount,
} from '../service';
import { sendVerificationEmail } from '../messages';

const GENERIC_REGISTER_RESPONSE = {
  ok: true as const,
  status: 'verification_required' as const,
  message: 'Enviamos um link de verificação para o seu email. Confirme para ativar a conta.',
};

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  const emailValidation = validateEmail(body.email);
  if (!emailValidation.ok) {
    return NextResponse.json({ error: emailValidation.error }, { status: 400 });
  }

  const passwordValidation = validatePassword(body.password);
  if (!passwordValidation.ok) {
    return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const handle = typeof body.handle === 'string' ? body.handle.trim() : '';
  const clubId = typeof body.clubId === 'string' && body.clubId.trim() ? body.clubId.trim() : undefined;

  if (!name || !city || !state || !category || !handle) {
    return NextResponse.json(
      { error: 'Nome, arroba, cidade, estado e categoria são obrigatórios para criar a conta.' },
      { status: 400 }
    );
  }

  if (!emailProviderConfigured()) {
    return NextResponse.json(
      { error: 'O envio de emails não está configurado. Tente novamente mais tarde.' },
      { status: 503 }
    );
  }

  const email = normalizeEmail(emailValidation.email);

  try {
    const allowed = await consumeRateLimit('register', hashEmailToken(email));
    if (!allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro agora. Tente novamente.' }, { status: 503 });
  }

  const passwordHash = await hashNewPassword(body.password);

  let registration;
  try {
    registration = await registerEmailAccount({
      email,
      passwordHash,
      name,
      handle,
      city,
      state,
      category,
      country: typeof body.country === 'string' ? body.country.trim() : undefined,
      clubId,
    });
  } catch (error) {
    if (error instanceof EmailAuthError) {
      const status = error.code === 'HANDLE_TAKEN' || error.code === 'EMAIL_TAKEN' ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: 'Não foi possível concluir o cadastro agora. Tente novamente.' }, { status: 503 });
  }

  try {
    const token = await issueEmailVerificationToken(registration.userId);
    await sendVerificationEmail(registration.email, token);
  } catch {
    // Keep the unverified account and latest token: the same email can be
    // registered again to re-issue a link, instead of destroying a pending account.
    return NextResponse.json(
      { error: 'Não foi possível enviar o email de verificação agora. Tente novamente.' },
      { status: 503 }
    );
  }

  return NextResponse.json(GENERIC_REGISTER_RESPONSE, { headers: { 'cache-control': 'no-store' } });
}
