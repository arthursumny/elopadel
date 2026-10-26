'use client';

import { ArrowRight, LockKeyhole } from 'lucide-react';
import { useState } from 'react';

export function AdminLoginForm() {
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const response = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key }) });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error ?? 'Não foi possível entrar.');
    window.location.href = '/admin';
  }

  return <main className="app-gradient grid min-h-screen place-items-center px-5"><form onSubmit={submit} className="glass w-full max-w-md rounded-3xl p-7 sm:p-9"><p className="eyebrow">Acesso restrito</p><h1 className="mt-3 text-3xl font-black tracking-[-.05em]">Painel administrativo.</h1><p className="mt-3 text-sm leading-relaxed text-white/40">Use a chave administrativa configurada no ambiente de produção.</p><label className="mt-8 block"><span className="mb-2 block text-xs font-bold text-white/55">Chave administrativa</span><div className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3.5 focus-within:border-lime/40"><LockKeyhole size={17} className="text-white/35" /><input autoFocus required type="password" value={key} onChange={(event) => setKey(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none" /></div></label>{error && <p className="mt-4 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}<button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-50">{loading ? 'Entrando...' : 'Entrar'} <ArrowRight size={15} /></button></form></main>;
}
