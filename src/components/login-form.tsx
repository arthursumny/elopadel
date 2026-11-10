'use client';

import {
  ArrowRight,
  Check,
  ChevronLeft,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Brand } from '@/components/app-shell';
import { resolveAppRedirect } from '@/lib/auth-redirect';
import { confirmEmailWithPassword } from '@/lib/email-auth-client';
import { isValidPublicHandle, normalizeHandleInput } from '@/lib/handles';
import { INITIAL_CATEGORY_OPTIONS } from '@/lib/ranks';
import { HandleField } from '@/components/handle-field';
import { canSubmitHandle } from '@/lib/handle-availability-ui';
import { useHandleAvailability } from '@/lib/use-handle-availability';

type Club = { id: string; name: string; city: string; state: string };
type City = { city: string; state: string; country: string; clubCount: number };
type AuthView = 'booting' | 'login' | 'register' | 'forgot' | 'google-profile' | 'verify' | 'reset';
type LinkState = 'idle' | 'ready' | 'loading' | 'success' | 'error';

const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;

const fieldClass =
  'w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/20 transition focus:border-lime/40 focus-visible:ring-2 focus-visible:ring-lime/20';
const labelClass = 'mb-2 block text-xs font-bold text-white/55';

export function LoginForm() {
  const [view, setView] = useState<AuthView>('booting');
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [category, setCategory] = useState('');
  const [clubId, setClubId] = useState('');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [cities, setCities] = useState<City[]>([]);

  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);

  const [onboardingToken, setOnboardingToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string | null>(null);
  const [isMobileMode, setIsMobileMode] = useState(false);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [registerSent, setRegisterSent] = useState(false);
  const handleCheck = useHandleAvailability({
    value: handle,
    enabled: (view === 'register' && !registerSent) || view === 'google-profile',
  });
  const handleCanSubmit = canSubmitHandle(handleCheck.state, handleCheck.normalized);

  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetState, setResetState] = useState<LinkState>('idle');

  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyPasswordConfirm, setVerifyPasswordConfirm] = useState('');
  const [showVerifyPassword, setShowVerifyPassword] = useState(false);
  const [verifyState, setVerifyState] = useState<LinkState>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const bootHandledRef = useRef(false);

  useEffect(() => {
    if (bootHandledRef.current) return;
    bootHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    setIsMobileMode(params.get('mobile') === '1');

    const emailToken = params.get('emailToken');
    const resetTokenParam = params.get('resetToken');

    if (emailToken) {
      // Remove the token from the address bar before it is used or rendered.
      // Confirmation requires the visitor to define the account password.
      clearLinkTokenFromUrl();
      setVerifyToken(emailToken);
      setVerifyState('ready');
      setView('verify');
      return;
    }

    if (resetTokenParam) {
      clearLinkTokenFromUrl();
      setResetToken(resetTokenParam);
      setResetState('ready');
      setView('reset');
      return;
    }

    setView('login');
  }, []);

  useEffect(() => {
    fetch('/api/clubs')
      .then((res) => res.json())
      .then((data) => {
        setClubs(data.clubs ?? []);
        setCities(data.cities ?? []);
      })
      .catch(() => undefined);

    fetch('/api/auth/config')
      .then((res) => res.json())
      .then((data) => {
        const clientId = data.googleClientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (clientId) {
          setGoogleClientId(clientId);
          initGoogleSignIn(clientId);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    renderGoogleButton();
  }, [googleClientId, view]);

  function initGoogleSignIn(clientId: string) {
    if (typeof window === 'undefined') return;

    function setupGSI() {
      const googleId = (window as any).google?.accounts?.id;
      if (!googleId) return;

      const isMobile = new URLSearchParams(window.location.search).get('mobile') === '1';
      googleId.initialize({
        client_id: clientId,
        callback: handleGoogleCredentialResponse,
        auto_select: isMobile,
      });
      renderGoogleButton();

      if (isMobile) {
        try {
          googleId.prompt();
        } catch {}
      }
    }

    if ((window as any).google?.accounts?.id) {
      setupGSI();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-elo-gsi="true"]');
    if (existing) {
      existing.addEventListener('load', setupGSI, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.eloGsi = 'true';
    script.onload = setupGSI;
    document.body.appendChild(script);
  }

  function renderGoogleButton() {
    if (!googleBtnRef.current) return;
    const googleId = (window as any).google?.accounts?.id;
    if (!googleId) return;

    googleBtnRef.current.innerHTML = '';
    const availableWidth = googleBtnRef.current.clientWidth || 320;
    googleId.renderButton(googleBtnRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      logo_alignment: 'left',
      width: Math.min(400, Math.max(200, Math.floor(availableWidth))),
    });
  }

  async function handleGoogleCredentialResponse(response: { credential?: string }) {
    if (!response.credential) return;
    setLoading(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/auth/social', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', idToken: response.credential }),
      });
      const data = await res.json().catch(() => ({}));
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? 'Falha ao autenticar com a conta Google.');
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const rawRedirect = params.get('redirect_uri');
      const redirectUri = resolveAppRedirect(rawRedirect);

      if (rawRedirect && !redirectUri) {
        setError('O destino de retorno deste acesso não é permitido. Entre pelo site para continuar.');
      }

      if (data.status === 'authenticated' && data.token) {
        if (redirectUri) {
          redirectTo(redirectUri, { token: data.token });
          return;
        }

        window.location.href = '/';
        return;
      }

      if (data.status === 'needs_onboarding') {
        if (redirectUri && data.onboardingToken) {
          redirectTo(redirectUri, {
            onboardingToken: data.onboardingToken,
            ...(data.name ? { name: data.name } : {}),
            ...(data.email ? { email: data.email } : {}),
          });
          return;
        }

        setOnboardingToken(data.onboardingToken);
        if (data.name) setName(data.name);
        if (data.email) setUserEmail(data.email);
        setView('google-profile');
        setMessage('Conta Google verificada! Complete seu perfil para começar a jogar.');
      }
    } catch {
      setLoading(false);
      setError('Erro de conexão ao autenticar com o Google.');
    }
  }

  async function finishSocialSignup() {
    const normalizedHandle = normalizeHandleInput(handle);
    const publicHandle = normalizedHandle ? `@${normalizedHandle}` : '';
    if (!name || !normalizedHandle || !city || !state || !category) {
      setError('Complete seu nome, sua arroba, cidade, estado e categoria.');
      return;
    }
    if (!isValidPublicHandle(publicHandle)) {
      setError('Escolha uma arroba com 3 a 20 caracteres: letras, números, ponto ou sublinhado.');
      return;
    }
    if (!handleCanSubmit) {
      setError(handleCheck.state.status === 'taken' ? 'Essa arroba já está em uso. Escolha outra.' : 'Aguarde a verificação da arroba antes de continuar.');
      return;
    }

    setLoading(true);
    setError('');
    const response = await fetch('/api/auth/social/onboarding', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        onboardingToken,
        name,
        handle: normalizedHandle,
        city,
        state,
        category,
        clubId: clubId || undefined,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? 'Falha ao concluir cadastro.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const redirectUri = resolveAppRedirect(params.get('redirect_uri'));
    if (redirectUri && data.token) {
      redirectTo(redirectUri, { token: data.token });
      return;
    }
    window.location.href = '/';
  }

  async function handleEmailLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    const email = loginEmail.trim();
    if (!email || !loginPassword) {
      setError('Informe seu email e sua senha.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/email/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password: loginPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível entrar agora. Tente novamente.');
        return;
      }

      if (!data.token) {
        setError('Não foi possível concluir o acesso. Tente novamente.');
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const redirectUri = resolveAppRedirect(params.get('redirect_uri'));
      if (redirectUri) {
        redirectTo(redirectUri, { token: data.token });
        return;
      }

      window.location.href = '/';
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitRegistration();
  }

  async function submitRegistration() {
    setError('');
    setMessage('');

    const email = registerEmail.trim();
    const normalizedHandle = normalizeHandleInput(handle);
    const publicHandle = normalizedHandle ? `@${normalizedHandle}` : '';

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Informe um email válido.');
      return;
    }
    if (registerPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (registerPassword.length > PASSWORD_MAX_LENGTH) {
      setError(`A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
      return;
    }
    if (registerPassword !== registerPasswordConfirm) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }
    if (!name.trim() || !normalizedHandle || !city || !state || !category) {
      setError('Complete seu nome, sua arroba, cidade, estado e categoria.');
      return;
    }
    if (!isValidPublicHandle(publicHandle)) {
      setError('Escolha uma arroba com 3 a 20 caracteres: letras, números, ponto ou sublinhado.');
      return;
    }
    if (!registerSent && !handleCanSubmit) {
      setError(handleCheck.state.status === 'taken' ? 'Essa arroba já está em uso. Escolha outra.' : 'Aguarde a verificação da arroba antes de continuar.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/email/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password: registerPassword,
          name: name.trim(),
          handle: normalizedHandle,
          city,
          state,
          category,
          clubId: clubId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível concluir o cadastro agora. Tente novamente.');
        return;
      }

      setRegisterSent(true);
      setMessage(data.message ?? 'Enviamos um link de verificação para o seu email. Confirme para ativar a conta.');
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!forgotEmail.trim()) {
      setError('Informe o email da sua conta.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/email/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Não foi possível processar a solicitação agora.');
        return;
      }

      setForgotSent(true);
      setMessage(
        data.message ??
          'Se este email estiver cadastrado, enviaremos instruções para redefinir a senha.'
      );
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!resetToken) {
      setError('Link de recuperação inválido. Solicite um novo email.');
      return;
    }
    if (resetPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (resetPassword.length > PASSWORD_MAX_LENGTH) {
      setError(`A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
      return;
    }
    if (resetPassword !== resetPasswordConfirm) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/email/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password: resetPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'TOKEN_INVALID' || data.code === 'TOKEN_EXPIRED') {
          setResetToken(null);
          setResetState('error');
          setMessage(data.error ?? 'Link de recuperação inválido ou expirado. Solicite um novo.');
          return;
        }
        setError(data.error ?? 'Não foi possível redefinir a senha agora. Tente novamente.');
        return;
      }

      setResetToken(null);
      setResetState('success');
      setMessage(data.message ?? 'Senha atualizada. Faça login com a nova senha.');
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (!verifyToken) {
      setVerifyState('error');
      setVerifyMessage('Link de verificação inválido ou já utilizado. Solicite um novo cadastro.');
      return;
    }
    if (verifyPassword.length < PASSWORD_MIN_LENGTH) {
      setError(`A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`);
      return;
    }
    if (verifyPassword.length > PASSWORD_MAX_LENGTH) {
      setError(`A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`);
      return;
    }
    if (verifyPassword !== verifyPasswordConfirm) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }

    setVerifyState('loading');
    try {
      const result = await confirmEmailWithPassword(verifyToken, verifyPassword);
      if (!result.ok) {
        if (result.code === 'TOKEN_INVALID' || result.code === 'TOKEN_EXPIRED') {
          setVerifyToken(null);
          setVerifyPassword('');
          setVerifyPasswordConfirm('');
          setVerifyState('error');
          setVerifyMessage(result.error);
          return;
        }
        setVerifyState('ready');
        setError(result.error);
        return;
      }

      setVerifyToken(null);
      setVerifyPassword('');
      setVerifyPasswordConfirm('');
      setVerifyState('success');
      setVerifyMessage(result.message);
    } catch {
      setVerifyState('ready');
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    }
  }

  function redirectTo(baseUrl: string, params: Record<string, string>) {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const finalUrl = url.toString();
    setRedirectTarget(finalUrl);
    window.location.href = finalUrl;
  }

  function openView(next: AuthView) {
    setView(next);
    setError('');
    setMessage('');
    setRedirectTarget(null);
    if (next === 'register') setRegisterSent(false);
    if (next === 'forgot') setForgotSent(false);
  }

  const header = viewHeader(view, isMobileMode, Boolean(googleClientId));

  return (
    <main className="app-gradient min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[.9fr_1.1fr]">
        <section className="relative hidden overflow-hidden border-r border-white/[.07] px-12 py-10 lg:flex lg:flex-col">
          <Image
            src="/login-hero.jpg"
            alt="Quadra de padel"
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/35 to-black/90" />
          <div className="relative z-10">
            <Brand />
          </div>
          <div className="relative z-10 mt-auto max-w-md">
            <p className="eyebrow">Competitividade em outro nível</p>
            <h1 className="mt-3 text-4xl font-black leading-[.98] tracking-[-.06em] text-white xl:text-5xl">
              Jogue no seu nível. Suba no ranking.
            </h1>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/50">
              Partidas equilibradas por nível real e um ranking que só sobe com vitória.
            </p>
          </div>
        </section>

        <section className="flex flex-col px-5 py-8 sm:px-10 lg:justify-center lg:px-20">
          <div className="lg:hidden"><Brand /></div>
          <div className="mx-auto mt-14 w-full max-w-md lg:mt-0">
            <div className="mb-8">
              <p className="eyebrow">{header.eyebrow}</p>
              <h2 className="mt-3 text-3xl font-black tracking-[-.05em]">{header.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/40">{header.description}</p>
            </div>

            {redirectTarget ? (
              <div className="space-y-6 py-6 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-lime/20 text-lime">
                  <Check className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-white">Acesso autorizado</h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/60">
                    Retornando ao aplicativo Elo Padel. Se ele não abrir automaticamente, use o botão abaixo.
                  </p>
                </div>
                <a
                  href={redirectTarget}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-lime py-4 text-xs font-black text-black shadow-lg transition hover:bg-lime/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40"
                >
                  Abrir aplicativo Elo Padel
                </a>
              </div>
            ) : (
              <>
                {view === 'booting' && (
                  <div className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.03] p-5 text-sm text-white/50">
                    <Sparkles className="h-4 w-4 animate-pulse text-lime" />
                    Preparando seu acesso...
                  </div>
                )}

                {(view === 'login' || view === 'register') && (
                  <>
                    <div
                      role="group"
                      aria-label="Escolha como acessar"
                      className="grid grid-cols-2 gap-1 rounded-xl border border-white/[.08] bg-white/[.03] p-1"
                    >
                      <button
                        type="button"
                        aria-pressed={view === 'login'}
                        onClick={() => openView('login')}
                        className={`rounded-lg px-3 py-2.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30 ${
                          view === 'login'
                            ? 'bg-white text-ink shadow-sm'
                            : 'text-white/45 hover:text-white'
                        }`}
                      >
                        Entrar
                      </button>
                      <button
                        type="button"
                        aria-pressed={view === 'register'}
                        onClick={() => openView('register')}
                        className={`rounded-lg px-3 py-2.5 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30 ${
                          view === 'register'
                            ? 'bg-white text-ink shadow-sm'
                            : 'text-white/45 hover:text-white'
                        }`}
                      >
                        Criar conta
                      </button>
                    </div>

                    {googleClientId && (
                      <>
                        <div className="mt-6 flex flex-col items-center justify-center gap-3">
                          <div ref={googleBtnRef} className="flex min-h-[44px] w-full justify-center" style={{ colorScheme: 'normal' }} />
                        </div>

                        <div className="my-6 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.16em] text-white/25">
                          <span className="h-px flex-1 bg-white/[.08]" />
                          ou use seu email
                          <span className="h-px flex-1 bg-white/[.08]" />
                        </div>
                      </>
                    )}
                    {!googleClientId && <div className="h-6" aria-hidden="true" />}
                  </>
                )}

                {view === 'login' && (
                  <form onSubmit={handleEmailLogin} className="space-y-4" noValidate>
                    <div>
                      <label htmlFor="login-email" className={labelClass}>Email</label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                        <input
                          id="login-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          spellCheck={false}
                          required
                          value={loginEmail}
                          onChange={(event) => setLoginEmail(event.target.value)}
                          placeholder="voce@email.com"
                          aria-describedby="login-email-hint"
                          className={`${fieldClass} pl-11`}
                        />
                      </div>
                      <p id="login-email-hint" className="mt-2 text-[10px] leading-relaxed text-white/30">
                        Use o mesmo email confirmado no seu cadastro.
                      </p>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <label htmlFor="login-password" className="block text-xs font-bold text-white/55">Senha</label>
                        <button
                          type="button"
                          onClick={() => openView('forgot')}
                          className="text-[11px] font-bold text-cyan transition hover:text-cyan/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/30"
                        >
                          Esqueci minha senha
                        </button>
                      </div>
                      <div className="relative">
                        <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25" />
                        <input
                          id="login-password"
                          type={showLoginPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          required
                          value={loginPassword}
                          onChange={(event) => setLoginPassword(event.target.value)}
                          placeholder="Sua senha"
                          className={`${fieldClass} pl-11 pr-12`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((value) => !value)}
                          aria-label={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          aria-pressed={showLoginPassword}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/35 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                        >
                          {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      aria-busy={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
                    >
                      {loading ? 'Entrando...' : 'Entrar com email'} <ArrowRight size={15} />
                    </button>

                  </form>
                )}

                {view === 'register' && (
                  <>
                    {registerSent ? (
                      <div className="space-y-5">
                        <div className="rounded-2xl border border-lime/20 bg-lime/[.06] p-5">
                          <div className="flex items-center gap-2 text-lime">
                            <Mail className="h-4 w-4" />
                            <p className="text-xs font-black uppercase tracking-[.12em]">Confirme seu email</p>
                          </div>
                          <h3 className="mt-3 text-lg font-black leading-snug text-white">
                            Enviamos um link para {registerEmail.trim()}
                          </h3>
                          <p className="mt-2 text-xs leading-relaxed text-white/50">
                            Abra o link para definir sua senha de acesso e ativar a conta. Se não encontrar
                            a mensagem, confira a caixa de spam.
                          </p>
                        </div>

                        <p className="rounded-xl border border-white/[.08] bg-white/[.025] p-3 text-[11px] leading-relaxed text-white/35">
                          Reenviar o link usa os mesmos dados deste cadastro. Sua senha de acesso será
                          definida por você ao confirmar o email.
                        </p>

                        <button
                          type="button"
                          onClick={() => void submitRegistration()}
                          disabled={loading}
                          aria-busy={loading}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/[.12] bg-white/[.04] py-3.5 text-xs font-black text-white transition hover:border-lime/30 hover:bg-white/[.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30 disabled:opacity-50"
                        >
                          {loading ? 'Reenviando...' : 'Reenviar link de verificação'}
                        </button>

                        <button
                          type="button"
                          onClick={() => openView('login')}
                          className="flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                        >
                          Já confirmei, quero entrar <ArrowRight size={14} />
                        </button>
                      </div>
                    ) : (
                      <form id="email-register-form" onSubmit={handleRegister} className="space-y-4" noValidate>
                        <div className="rounded-xl border border-cyan/15 bg-cyan/[.05] p-3 text-[11px] leading-relaxed text-white/45">
                          Crie sua conta com email e senha. Você receberá um link para confirmar o endereço e definir a senha de acesso.
                        </div>

                        <div>
                          <label htmlFor="register-email" className={labelClass}>Email</label>
                          <input
                            id="register-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            required
                            value={registerEmail}
                            onChange={(event) => setRegisterEmail(event.target.value)}
                            placeholder="voce@email.com"
                            className={fieldClass}
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <label htmlFor="register-password" className={labelClass}>Senha inicial</label>
                            <div className="relative">
                              <input
                                id="register-password"
                                type={showRegisterPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                                required
                                value={registerPassword}
                                onChange={(event) => setRegisterPassword(event.target.value)}
                                placeholder="Mínimo de 10 caracteres"
                                className={`${fieldClass} pr-12`}
                              />
                              <button
                                type="button"
                                onClick={() => setShowRegisterPassword((value) => !value)}
                                aria-label={showRegisterPassword ? 'Ocultar senha' : 'Mostrar senha'}
                                aria-pressed={showRegisterPassword}
                                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/35 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                              >
                                {showRegisterPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                          <div>
                            <label htmlFor="register-password-confirm" className={labelClass}>Repita a senha inicial</label>
                            <input
                              id="register-password-confirm"
                              type={showRegisterPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              value={registerPasswordConfirm}
                              onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                              placeholder="Repita a senha"
                              className={fieldClass}
                            />
                          </div>
                        </div>
                        <p className="text-[10px] leading-relaxed text-white/30">
                          De {PASSWORD_MIN_LENGTH} a {PASSWORD_MAX_LENGTH} caracteres. A senha definitiva
                          será definida por você ao confirmar o email.
                        </p>

                        <div className="border-t border-white/[.07] pt-4">
                          <p className="text-[10px] font-black uppercase tracking-[.16em] text-lime/80">Perfil competitivo</p>
                          <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                            Estes dados aparecem no seu perfil e nos convites de partida.
                          </p>
                        </div>

                        <ProfileFields
                          idPrefix="register"
                          autoFocusName
                          name={name}
                          setName={setName}
                          handle={handle}
                          setHandle={setHandle}
                          handleAvailability={handleCheck.state}
                          onRetryHandle={handleCheck.retry}
                          city={city}
                          setCity={setCity}
                          state={state}
                          setState={setState}
                          category={category}
                          setCategory={setCategory}
                          clubId={clubId}
                          setClubId={setClubId}
                          clubs={clubs}
                          cities={cities}
                        />

                        <button
                          type="submit"
                          disabled={loading || (!registerSent && !handleCanSubmit)}
                          aria-busy={loading}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
                        >
                          {loading ? 'Criando conta...' : 'Criar conta'} <ArrowRight size={15} />
                        </button>
                      </form>
                    )}
                  </>
                )}

                {view === 'forgot' && (
                  <div className="space-y-5">
                    {forgotSent ? (
                      <div className="rounded-2xl border border-cyan/20 bg-cyan/[.06] p-5">
                        <div className="flex items-center gap-2 text-cyan">
                          <Mail className="h-4 w-4" />
                          <p className="text-xs font-black uppercase tracking-[.12em]">Verifique seu email</p>
                        </div>
                        <p className="mt-3 text-sm leading-relaxed text-white/55">
                          Se este email estiver cadastrado, enviaremos instruções para redefinir a senha.
                          O link expira em 1 hora.
                        </p>
                      </div>
                    ) : (
                      <form onSubmit={handleForgotPassword} className="space-y-4" noValidate>
                        <p className="rounded-xl border border-white/[.08] bg-white/[.025] p-3 text-[11px] leading-relaxed text-white/40">
                          Informe o email da sua conta. Enviaremos um link para você criar uma nova senha.
                        </p>
                        <div>
                          <label htmlFor="forgot-email" className={labelClass}>Email da conta</label>
                          <input
                            id="forgot-email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            required
                            value={forgotEmail}
                            onChange={(event) => setForgotEmail(event.target.value)}
                            placeholder="voce@email.com"
                            className={fieldClass}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading}
                          aria-busy={loading}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
                        >
                          {loading ? 'Enviando...' : 'Enviar link de recuperação'} <ArrowRight size={15} />
                        </button>
                      </form>
                    )}

                    <button
                      type="button"
                      onClick={() => openView('login')}
                      className="flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                    >
                      <ChevronLeft size={14} /> Voltar para o login
                    </button>
                  </div>
                )}

                {view === 'google-profile' && (
                  <ProfileStep
                    name={name}
                    setName={setName}
                    handle={handle}
                    setHandle={setHandle}
                    handleAvailability={handleCheck.state}
                    onRetryHandle={handleCheck.retry}
                    handleCanSubmit={handleCanSubmit}
                    city={city}
                    setCity={setCity}
                    state={state}
                    setState={setState}
                    category={category}
                    setCategory={setCategory}
                    clubId={clubId}
                    setClubId={setClubId}
                    clubs={clubs}
                    cities={cities}
                    loading={loading}
                    userEmail={userEmail}
                    onContinue={finishSocialSignup}
                    onBack={() => {
                      setOnboardingToken(null);
                      setUserEmail(null);
                      openView('login');
                    }}
                  />
                )}

                {view === 'verify' && (
                  <>
                    {verifyState === 'success' || verifyState === 'error' ? (
                      <LinkResult
                        state={verifyState}
                        title={verifyState === 'success' ? 'Email confirmado' : 'Não foi possível confirmar'}
                        message={verifyMessage}
                        onContinue={() => openView('login')}
                      />
                    ) : (
                      <form onSubmit={handleVerifyEmail} className="space-y-4" noValidate>
                        <div className="rounded-xl border border-cyan/15 bg-cyan/[.05] p-3 text-[11px] leading-relaxed text-white/50">
                          Confirme o endereço e defina a senha de acesso. A senha criada nesta etapa será a
                          senha definitiva da conta e substitui a senha informada no cadastro.
                        </div>

                        <div>
                          <label htmlFor="verify-password" className={labelClass}>Senha de acesso</label>
                          <div className="relative">
                            <input
                              id="verify-password"
                              type={showVerifyPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              value={verifyPassword}
                              onChange={(event) => setVerifyPassword(event.target.value)}
                              placeholder="Mínimo de 10 caracteres"
                              aria-describedby="verify-password-hint"
                              className={`${fieldClass} pr-12`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowVerifyPassword((value) => !value)}
                              aria-label={showVerifyPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              aria-pressed={showVerifyPassword}
                              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/35 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                            >
                              {showVerifyPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <p id="verify-password-hint" className="mt-2 text-[10px] leading-relaxed text-white/30">
                            De {PASSWORD_MIN_LENGTH} a {PASSWORD_MAX_LENGTH} caracteres. Você usará esta senha para entrar.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="verify-password-confirm" className={labelClass}>Repita a senha</label>
                          <input
                            id="verify-password-confirm"
                            type={showVerifyPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            value={verifyPasswordConfirm}
                            onChange={(event) => setVerifyPasswordConfirm(event.target.value)}
                            placeholder="Repita a senha"
                            className={fieldClass}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={verifyState === 'loading'}
                          aria-busy={verifyState === 'loading'}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
                        >
                          {verifyState === 'loading' ? 'Confirmando...' : 'Confirmar email e ativar conta'}{' '}
                          <ArrowRight size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openView('login')}
                          className="flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                        >
                          <ChevronLeft size={14} /> Voltar para o login
                        </button>
                      </form>
                    )}
                  </>
                )}

                {view === 'reset' && (
                  <div className="space-y-5">
                    {resetState === 'success' ? (
                      <LinkResult
                        state="success"
                        title="Senha atualizada"
                        message={message || 'Sua nova senha já está valendo. Entre para continuar.'}
                        onContinue={() => openView('login')}
                      />
                    ) : resetState === 'error' ? (
                      <LinkResult
                        state="error"
                        title="Link expirado ou inválido"
                        message={message || 'Solicite um novo link para redefinir sua senha.'}
                        continueLabel="Solicitar novo link"
                        onContinue={() => openView('forgot')}
                      />
                    ) : (
                      <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
                        <p className="rounded-xl border border-cyan/15 bg-cyan/[.05] p-3 text-[11px] leading-relaxed text-white/45">
                          Escolha uma nova senha com pelo menos {PASSWORD_MIN_LENGTH} caracteres. O link é de uso único.
                        </p>

                        <div>
                          <label htmlFor="reset-password" className={labelClass}>Nova senha</label>
                          <div className="relative">
                            <input
                              id="reset-password"
                              type={showResetPassword ? 'text' : 'password'}
                              autoComplete="new-password"
                              required
                              value={resetPassword}
                              onChange={(event) => setResetPassword(event.target.value)}
                              placeholder="Mínimo de 10 caracteres"
                              className={`${fieldClass} pr-12`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowResetPassword((value) => !value)}
                              aria-label={showResetPassword ? 'Ocultar senha' : 'Mostrar senha'}
                              aria-pressed={showResetPassword}
                              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 text-white/35 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                            >
                              {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label htmlFor="reset-password-confirm" className={labelClass}>Repita a nova senha</label>
                          <input
                            id="reset-password-confirm"
                            type={showResetPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            required
                            value={resetPasswordConfirm}
                            onChange={(event) => setResetPasswordConfirm(event.target.value)}
                            placeholder="Repita a senha"
                            className={fieldClass}
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          aria-busy={loading}
                          className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
                        >
                          {loading ? 'Salvando...' : 'Salvar nova senha'} <ArrowRight size={15} />
                        </button>

                        <button
                          type="button"
                          onClick={() => openView('login')}
                          className="flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-white/45 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
                        >
                          <ChevronLeft size={14} /> Voltar para o login
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}

            {message && view !== 'reset' && (
              <p
                role="status"
                className="mt-4 rounded-xl border border-cyan/15 bg-cyan/[.05] p-3 text-center text-xs font-semibold leading-relaxed text-cyan"
              >
                {message}
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-coral/20 bg-coral/[.07] p-3 text-center text-xs font-semibold leading-relaxed text-coral"
              >
                {error}
              </p>
            )}

            <div className="mt-8 border-t border-white/[.07] pt-6">
              <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/30">
                <Check size={14} className="mt-0.5 shrink-0 text-lime" />
                Ao continuar, você concorda com os termos de uso e permite que o Elo Padel use seu perfil para formar partidas equilibradas.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function viewHeader(view: AuthView, isMobileMode: boolean, googleAvailable: boolean) {
  if (view === 'booting') {
    return {
      eyebrow: 'Acesso seguro',
      title: 'Preparando seu acesso',
      description: 'Estamos validando o link e carregando as opções de entrada.',
    };
  }
  if (view === 'register') {
    return {
      eyebrow: isMobileMode ? 'Aplicativo Mobile' : 'Novo jogador',
      title: 'Crie sua conta',
      description: 'Cadastre seu perfil competitivo, confirme o email e comece a jogar.',
    };
  }
  if (view === 'forgot') {
    return {
      eyebrow: 'Recuperar acesso',
      title: 'Esqueceu a senha?',
      description: 'Informe seu email e enviaremos um link para criar uma nova senha.',
    };
  }
  if (view === 'verify') {
    return {
      eyebrow: 'Confirmação de email',
      title: 'Confirme seu email',
      description: 'Defina a senha de acesso da conta para ativar seu cadastro.',
    };
  }
  if (view === 'reset') {
    return {
      eyebrow: 'Recuperar acesso',
      title: 'Defina uma nova senha',
      description: 'Crie uma senha nova para voltar a entrar no Elo Padel.',
    };
  }
  if (view === 'google-profile') {
    return {
      eyebrow: 'Conta Google verificada',
      title: 'Complete seu perfil',
      description: 'Falta pouco para liberar seu acesso e começar sua carreira na quadra.',
    };
  }
  return {
    eyebrow: isMobileMode ? 'Aplicativo Mobile' : 'Acesso Oficial',
    title: isMobileMode ? 'Conectar ao Elo Padel' : 'Entrar no Elo Padel',
    description: googleAvailable ? 'Use sua conta Google ou entre com email e senha.' : 'Entre com email e senha.',
  };
}

function clearLinkTokenFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('emailToken');
  url.searchParams.delete('resetToken');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, '', next);
}

function LinkResult({
  state,
  title,
  message,
  onContinue,
  continueLabel,
}: {
  state: LinkState;
  title: string;
  message: string;
  onContinue: () => void;
  continueLabel?: string;
}) {
  return (
    <div className="space-y-6 py-2 text-center" role="status" aria-live="polite">
      <div
        className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${
          state === 'success'
            ? 'bg-lime/20 text-lime'
            : state === 'error'
            ? 'bg-coral/15 text-coral'
            : 'bg-white/[.05] text-white/50'
        }`}
      >
        {state === 'success' ? (
          <Check className="h-7 w-7" />
        ) : state === 'error' ? (
          <X className="h-7 w-7" />
        ) : (
          <ShieldCheck className="h-7 w-7 animate-pulse" />
        )}
      </div>
      <div>
        <h3 className="text-xl font-black text-white">{title}</h3>
        <p className="mt-2 text-xs leading-relaxed text-white/50">{message}</p>
      </div>
      <button
        type="button"
        onClick={onContinue}
        disabled={state === 'loading'}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
      >
        {continueLabel ?? (state === 'success' ? 'Entrar com email' : 'Voltar para o login')}{' '}
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

function ProfileStep({
  name,
  setName,
  handle,
  setHandle,
  handleAvailability,
  onRetryHandle,
  handleCanSubmit,
  city,
  setCity,
  state,
  setState,
  category,
  setCategory,
  clubId,
  setClubId,
  clubs,
  cities,
  loading,
  userEmail,
  onContinue,
  onBack,
}: {
  name: string;
  setName: (value: string) => void;
  handle: string;
  setHandle: (value: string) => void;
  handleAvailability: import('@/lib/handle-availability-ui').HandleAvailabilityState;
  onRetryHandle: () => void;
  handleCanSubmit: boolean;
  city: string;
  setCity: (value: string) => void;
  state: string;
  setState: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  clubId: string;
  setClubId: (value: string) => void;
  clubs: Club[];
  cities: City[];
  loading: boolean;
  userEmail?: string | null;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-lime/15 bg-lime/[.05] p-3 text-xs leading-relaxed text-white/55">
        <span className="font-bold text-lime">Conta Google: {userEmail ?? name}</span>. Complete seu perfil competitivo para começar sua carreira.
      </div>
      <ProfileFields
        idPrefix="google"
        autoFocusName
        name={name}
        setName={setName}
        handle={handle}
        setHandle={setHandle}
        handleAvailability={handleAvailability}
        onRetryHandle={onRetryHandle}
        city={city}
        setCity={setCity}
        state={state}
        setState={setState}
        category={category}
        setCategory={setCategory}
        clubId={clubId}
        setClubId={setClubId}
        clubs={clubs}
        cities={cities}
      />
      <button
        type="button"
        disabled={!name || !handle || !city || !state || !category || loading || !handleCanSubmit}
        onClick={onContinue}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink transition hover:bg-lime-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/40 disabled:opacity-50"
      >
        {loading ? 'Salvando...' : 'Concluir cadastro e entrar'} <ArrowRight size={15} />
      </button>
      <button
        type="button"
        onClick={onBack}
        className="flex w-full items-center justify-center gap-2 py-2 text-xs font-bold text-white/35 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/30"
      >
        <ChevronLeft size={14} /> Voltar para o login
      </button>
    </div>
  );
}

function ProfileFields({
  idPrefix,
  autoFocusName,
  name,
  setName,
  handle,
  setHandle,
  handleAvailability,
  onRetryHandle,
  city,
  setCity,
  state,
  setState,
  category,
  setCategory,
  clubId,
  setClubId,
  clubs,
  cities,
}: {
  idPrefix: string;
  autoFocusName?: boolean;
  name: string;
  setName: (value: string) => void;
  handle: string;
  setHandle: (value: string) => void;
  handleAvailability: import('@/lib/handle-availability-ui').HandleAvailabilityState;
  onRetryHandle: () => void;
  city: string;
  setCity: (value: string) => void;
  state: string;
  setState: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  clubId: string;
  setClubId: (value: string) => void;
  clubs: Club[];
  cities: City[];
}) {
  const selectedCategory = INITIAL_CATEGORY_OPTIONS.find((option) => option.value === category);

  return (
    <>
      <label className="block" htmlFor={`${idPrefix}-name`}>
        <span className={labelClass}>Como devemos chamar você?</span>
        <input
          id={`${idPrefix}-name`}
          autoFocus={autoFocusName}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nome de exibição"
          autoComplete="name"
          className={fieldClass}
        />
      </label>

      <HandleField
        idPrefix={idPrefix}
        value={handle}
        onChange={setHandle}
        availability={handleAvailability}
        onRetry={onRetryHandle}
      />

      <div className="space-y-4">
        <label className="block" htmlFor={`${idPrefix}-city`}>
          <span className={labelClass}>Cidade (disponível no Gripo)</span>
          <select
            id={`${idPrefix}-city`}
            value={city && state ? `${city}__${state}` : ''}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                setCity('');
                setState('');
                setClubId('');
                return;
              }
              const [cityName, cityState] = value.split('__');
              setCity(cityName);
              setState(cityState);
              const cityClubs = clubs.filter(
                (club) => club.city.toLowerCase() === cityName.toLowerCase() && club.state === cityState
              );
              setClubId(cityClubs.length === 1 ? cityClubs[0].id : '');
            }}
            className={fieldClass}
          >
            <option value="" className="bg-[#121820]">Selecione sua cidade</option>
            {cities.map((item) => (
              <option key={`${item.city}__${item.state}`} value={`${item.city}__${item.state}`} className="bg-[#121820]">
                {item.city} - {item.state} ({item.clubCount} {item.clubCount === 1 ? 'clube ativo' : 'clubes ativos'})
              </option>
            ))}
          </select>
        </label>

        <label className="block" htmlFor={`${idPrefix}-club`}>
          <span className={labelClass}>
            Clube Principal <span className="font-normal text-white/25">(opcional)</span>
          </span>
          <select
            id={`${idPrefix}-club`}
            value={clubId}
            onChange={(event) => {
              const id = event.target.value;
              setClubId(id);
              const club = clubs.find((item) => item.id === id);
              if (club) {
                setCity(club.city);
                setState(club.state);
              }
            }}
            className={fieldClass}
          >
            <option value="" className="bg-[#121820]">
              {city ? `Escolha um clube em ${city}` : 'Escolha seu clube de preferência'}
            </option>
            {(city
              ? clubs.filter(
                  (club) =>
                    club.city.toLowerCase() === city.toLowerCase() &&
                    club.state.toUpperCase() === state.toUpperCase()
                )
              : clubs
            ).map((club) => (
              <option key={club.id} value={club.id} className="bg-[#121820]">
                {club.name} — {club.city}/{club.state}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block" htmlFor={`${idPrefix}-category`}>
        <span className={labelClass}>Qual categoria representa seu nível?</span>
        <select
          id={`${idPrefix}-category`}
          required
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={fieldClass}
        >
          <option value="" className="bg-[#121820]">Selecione sua categoria</option>
          {INITIAL_CATEGORY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value} className="bg-[#121820]">
              {option.label}
            </option>
          ))}
        </select>
        {selectedCategory && (
          <p className="mt-2 rounded-lg border border-cyan/15 bg-cyan/[.05] px-3 py-2 text-[10px] leading-relaxed text-white/45">
            Você começa em <span className="font-black text-cyan">{selectedCategory.startingTier}</span> com patente provisória. O MMR se ajusta conforme seus resultados.
          </p>
        )}
      </label>
    </>
  );
}
