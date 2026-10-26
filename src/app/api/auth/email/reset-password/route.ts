import { NextResponse } from 'next/server';
import { hashEmailToken, validatePassword } from '@/lib/security/email-tokens';
import { consumeRateLimit } from '@/lib/security/rate-limit';
import { EmailAuthError, hashNewPassword, resetEmailPassword } from '../service';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === 'string' ? body.token.trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Token de recuperação obrigatório.' }, { status: 400 });
  }

  const passwordValidation = validatePassword(body.password);
  if (!passwordValidation.ok) {
    return NextResponse.json({ error: passwordValidation.error }, { status: 400 });
  }

  try {
    const allowed = await consumeRateLimit('resetPassword', hashEmailToken(token));
    if (!allowed) {
      return NextResponse.json({ error: 'Muitas tentativas. Aguarde e tente novamente.' }, { status: 429 });
    }
  } catch {
    return NextResponse.json({ error: 'Não foi possível redefinir a senha agora. Tente novamente.' }, { status: 503 });
  }

  try {
    const passwordHash = await hashNewPassword(body.password);
    await resetEmailPassword(token, passwordHash);
  } catch (error) {
    if (error instanceof EmailAuthError) {
      const status = error.code === 'INACTIVE' ? 403 : 400;
      return NextResponse.json({ error: error.message, code: error.code }, { status });
    }
    return NextResponse.json({ error: 'Não foi possível redefinir a senha agora. Tente novamente.' }, { status: 503 });
  }

  return NextResponse.json(
    { ok: true, message: 'Senha atualizada. Faça login com a nova senha.' },
    { headers: { 'cache-control': 'no-store' } }
  );
}
