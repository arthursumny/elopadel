import { NextResponse } from 'next/server';
import { consumeOnboardingToken, createSession, isTokenConsumed, setSessionCookie, verifyOnboardingToken } from '@/lib/auth';
import { isValidPublicHandle, normalizePublicHandle } from '@/lib/handles';
import { createSocialProfile } from '../service';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const onboardingToken = typeof body.onboardingToken === 'string' ? body.onboardingToken.trim() : '';

  if (!onboardingToken) {
    return NextResponse.json({ error: 'Token de onboarding obrigatório.' }, { status: 400 });
  }

  const payload = await verifyOnboardingToken(onboardingToken);
  if (!payload) {
    return NextResponse.json({ error: 'Token de onboarding inválido ou expirado.' }, { status: 401 });
  }

  // 1. Replay Protection: Check if token has already been consumed
  const tokenId = payload.jti ?? onboardingToken;
  if (isTokenConsumed(tokenId)) {
    return NextResponse.json({ error: 'Token de onboarding já utilizado ou expirado.' }, { status: 401 });
  }

  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : typeof body.displayName === 'string' && body.displayName.trim()
    ? body.displayName.trim()
    : payload.name?.trim();

  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const rawHandle = typeof body.handle === 'string' ? body.handle.trim() : '';
  const handle = normalizePublicHandle(rawHandle);

  if (!name || !city || !state || !category) {
    return NextResponse.json({ error: 'Nome, cidade, estado e categoria são obrigatórios para concluir o cadastro.' }, { status: 400 });
  }

  if (!isValidPublicHandle(handle)) {
    return NextResponse.json({ error: 'Escolha uma arroba de 3 a 20 caracteres: letras, números, ponto ou sublinhado.' }, { status: 400 });
  }

  try {
    const user = await createSocialProfile({
      provider: payload.provider,
      providerAccountId: payload.sub,
      email: payload.email,
      avatarUrl: payload.avatarUrl,
      name,
      handle,
      city,
      state,
      category,
      country: typeof body.country === 'string' ? body.country.trim() : 'Brasil',
      clubId: typeof body.clubId === 'string' ? body.clubId.trim() : undefined,
    });

    // 2. Consume token on successful profile creation
    consumeOnboardingToken(tokenId);

    const sessionToken = await createSession(user.id);
    await setSessionCookie(user.id, sessionToken);

    return NextResponse.json({
      ok: true,
      status: 'authenticated',
      token: sessionToken,
      user,
      player: user,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'ALREADY_REGISTERED') {
        return NextResponse.json({ error: 'Esta conta social já concluiu o cadastro.' }, { status: 409 });
      }
      if (error.message === 'EMAIL_TAKEN') {
        return NextResponse.json({ error: 'Este email já está vinculado a outra conta. Faça login ou use outro email.' }, { status: 409 });
      }
      if (error.message === 'HANDLE_TAKEN') {
        return NextResponse.json({ error: 'Essa arroba já está em uso. Escolha outra.' }, { status: 409 });
      }
      if (error.message === 'INVALID_HANDLE') {
        return NextResponse.json({ error: 'Escolha uma arroba de 3 a 20 caracteres: letras, números, ponto ou sublinhado.' }, { status: 400 });
      }
    }
    return NextResponse.json({ error: 'Não foi possível concluir seu cadastro social agora. Tente novamente.' }, { status: 503 });
  }
}
