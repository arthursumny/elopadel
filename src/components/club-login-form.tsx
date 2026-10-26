'use client';

import { ArrowRight, Building2, LockKeyhole } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export function ClubLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const response = await fetch('/api/auth/club-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error ?? 'Não foi possível entrar.');
    window.location.href = '/club';
  }

  return <main className="app-gradient grid min-h-screen place-items-center px-5"><form onSubmit={submit} className="glass w-full max-w-md rounded-3xl p-7 sm:p-9"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan/15 text-cyan"><Building2 size={20} /></div><p className="eyebrow mt-8">Acesso do clube</p><h1 className="mt-3 text-3xl font-black tracking-[-.05em]">Decisões da sua comunidade.</h1><p className="mt-3 text-sm leading-relaxed text-white/40">Aprove solicitações de vínculo e acompanhe as decisões do seu clube.</p><label className="mt-8 block"><span className="mb-2 block text-xs font-bold text-white/55">E-mail do clube</span><input autoFocus required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="clube@exemplo.com" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/20 focus:border-cyan/40" /></label><label className="mt-4 block"><span className="mb-2 block text-xs font-bold text-white/55">Senha</span><div className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3.5 focus-within:border-cyan/40"><LockKeyhole size={17} className="text-white/35" /><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none" /></div></label>{error && <p className="mt-4 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}<button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-cyan py-3.5 text-xs font-black text-ink disabled:opacity-50">{loading ? 'Entrando...' : 'Entrar como clube'} <ArrowRight size={15} /></button><Link href="/login" className="mt-5 block text-center text-xs font-bold text-white/35 hover:text-white">Sou jogador</Link></form></main>;
}
