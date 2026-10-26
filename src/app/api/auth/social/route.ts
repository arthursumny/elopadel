import { NextResponse } from 'next/server';
import { createOnboardingToken, createSession, setSessionCookie } from '@/lib/auth';
import { findEmailUserProfileByEmail, getEmailCredentialStatus } from '../email/service';
import { findUserByEmail, findUserByOAuth, googleAudienceConfigured, linkOAuthAccount, verifySocialToken } from './service';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const provider = body.provider === 'google' ? 'google' : null;
  const token = typeof body.idToken === 'string' && body.idToken.trim()
    ? body.idToken.trim()
    : typeof body.token === 'string' && body.token.trim()
    ? body.token.trim()
    : typeof body.identityToken === 'string' && body.identityToken.trim()
    ? body.identityToken.trim()
    : null;

  if (!provider) {
    return NextResponse.json({ error: 'Provedor social inválido. Apenas o Google é suportado.' }, { status: 400 });
  }

  if (!googleAudienceConfigured()) {
    return NextResponse.json({ error: 'A autenticação com Google não está configurada.' }, { status: 503 });
  }

  if (!token) {
    return NextResponse.json({ error: 'Token de autenticação social obrigatório.' }, { status: 400 });
  }

  let socialProfile;
  try {
    socialProfile = await verifySocialToken({
      provider,
      token,
      rawFullName: body.rawFullName,
    });
  } catch (error) {
    const message = error instanceof Error && error.message === 'GOOGLE_AUDIENCE_NOT_CONFIGURED'
      ? 'A autenticação com Google não está configurada.'
      : error instanceof Error
      ? error.message
      : 'Falha na validação do token social.';
    const status = error instanceof Error && error.message === 'GOOGLE_AUDIENCE_NOT_CONFIGURED' ? 503 : 401;
    return NextResponse.json({ error: message }, { status });
  }

  // 1. Existing OAuth Account
  const existingOAuthUser = await findUserByOAuth(provider, socialProfile.sub);
  if (existingOAuthUser) {
    if (!existingOAuthUser.isActive) {
      return NextResponse.json({ error: 'Esta conta está desativada.' }, { status: 403 });
    }
    const sessionToken = await createSession(existingOAuthUser.id);
    await setSessionCookie(existingOAuthUser.id, sessionToken);
    return NextResponse.json({
      ok: true,
      status: 'authenticated',
      token: sessionToken,
      user: existingOAuthUser,
      player: existingOAuthUser,
    });
  }

  // 2. Existing User matched by verified email
  if (socialProfile.email && socialProfile.emailVerified === true) {
    const existingEmailUser = await findUserByEmail(socialProfile.email)
      ?? await findEmailUserProfileByEmail(socialProfile.email);

    if (existingEmailUser) {
      if (!existingEmailUser.isActive) {
        return NextResponse.json({ error: 'Esta conta está desativada.' }, { status: 403 });
      }

      // Never auto-link a Google identity to an email/password account whose
      // email was not verified: an attacker could register the victim's email
      // and then inherit the account through Google.
      const credential = await getEmailCredentialStatus(existingEmailUser.id);
      if (credential.exists && !credential.verified) {
        return NextResponse.json({
          error: 'Este email já possui um cadastro aguardando verificação. Confirme seu email antes de entrar com Google.',
          code: 'EMAIL_UNVERIFIED',
        }, { status: 409 });
      }

      try {
        await linkOAuthAccount({
          userId: existingEmailUser.id,
          provider,
          providerAccountId: socialProfile.sub,
          email: socialProfile.email,
        });
      } catch (error) {
        if (error instanceof Error && (
          error.message === 'ACCOUNT_ALREADY_LINKED' ||
          error.message === 'PROVIDER_ALREADY_LINKED' ||
          error.message === 'EMAIL_ALREADY_IN_USE'
        )) {
          return NextResponse.json({
            error: 'Não foi possível vincular esta conta Google ao perfil existente. Entre com email e senha ou use outra conta Google.',
            code: error.message,
          }, { status: 409 });
        }
        return NextResponse.json({ error: 'Não foi possível entrar com Google agora. Tente novamente.' }, { status: 503 });
      }
      const sessionToken = await createSession(existingEmailUser.id);
      await setSessionCookie(existingEmailUser.id, sessionToken);
      return NextResponse.json({
        ok: true,
        status: 'authenticated',
        linked: true,
        token: sessionToken,
        user: existingEmailUser,
        player: existingEmailUser,
      });
    }
  }

  // 3. New User -> Needs Onboarding. New identities require a verified email;
  // otherwise we would persist an email the provider has not proven.
  const verifiedEmail = socialProfile.email;
  if (!verifiedEmail || socialProfile.emailVerified !== true) {
    return NextResponse.json({
      error: 'Sua conta Google precisa ter um email verificado para criar um perfil no Elo Padel.',
      code: 'GOOGLE_EMAIL_UNVERIFIED',
    }, { status: 401 });
  }

  const onboardingToken = await createOnboardingToken({
    provider,
    sub: socialProfile.sub,
    emailVerified: true,
    email: verifiedEmail,
    name: socialProfile.name,
    avatarUrl: socialProfile.avatarUrl,
  });

  return NextResponse.json({
    ok: true,
    status: 'needs_onboarding',
    onboardingToken,
    email: verifiedEmail,
    name: socialProfile.name,
    suggestedName: socialProfile.name,
    profile: {
      email: verifiedEmail,
      suggestedName: socialProfile.name,
      avatarUrl: socialProfile.avatarUrl,
    },
  });
}
