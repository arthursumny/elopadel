'use client';

import { Building2, Check } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/dialog';

export function ClubRegisterForm() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');
    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    try {
      const response = await fetch('/api/admin/clubs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.fromEntries(form.entries())) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? 'Não foi possível cadastrar o clube.');
      setMessage(`${data.club.name} foi cadastrado. Login: ${data.account.email}`);
      formElement.reset();
      window.setTimeout(() => window.location.reload(), 800);
    } catch {
      setError('Não foi possível conectar ao servidor. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-xl border border-white/[.1] bg-white/[.04] px-4 py-3 text-xs font-bold text-white/70 transition hover:border-lime/25 hover:text-lime"
      >
        <Building2 size={14} aria-hidden="true" /> Cadastrar clube
      </button>

      <Dialog
        open={open}
        onClose={() => { if (!loading) setOpen(false); }}
        eyebrow="Expansão da rede"
        title="Cadastrar clube"
        description="O clube entra no catálogo e recebe um acesso próprio para decidir sobre solicitações de vínculo."
        size="md"
        closeOnBackdrop={false}
        closeLabel="Fechar cadastro de clube"
      >
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-white/70">Nome do clube</span><input name="name" required placeholder="Ex.: Padel House" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
            <label><span className="mb-2 block text-xs font-bold text-white/70">Cidade</span><input name="city" required placeholder="Ex.: São Paulo" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
            <label><span className="mb-2 block text-xs font-bold text-white/70">Estado / UF</span><input name="state" required placeholder="SP" maxLength={80} className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm uppercase text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
            <label><span className="mb-2 block text-xs font-bold text-white/70">País</span><input name="country" required defaultValue="Brasil" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none focus:border-lime/40" /></label>
            <label><span className="mb-2 block text-xs font-bold text-white/70">Região <span className="font-normal text-meta">(opcional)</span></span><input name="region" placeholder="Ex.: Sul" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
            <label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-white/70">Link do Gripo <span className="font-normal text-meta">(opcional)</span></span><input name="gripoUrl" type="url" placeholder="https://..." className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
            <label><span className="mb-2 block text-xs font-bold text-white/70">E-mail de acesso</span><input name="email" type="email" required placeholder="clube@exemplo.com" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
            <label><span className="mb-2 block text-xs font-bold text-white/70">Senha inicial</span><input name="password" type="password" required minLength={8} placeholder="Mínimo de 8 caracteres" className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-4 py-3 text-sm text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>
          </div>

          {error && <p role="alert" className="rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-sm font-semibold text-coral">{error}</p>}
          {message && <p role="status" className="flex items-center gap-2 rounded-xl border border-lime/20 bg-lime/[.06] p-3 text-sm font-semibold text-lime"><Check size={15} aria-hidden="true" /> {message}</p>}

          <button type="submit" disabled={loading} aria-busy={loading} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-50">
            {loading ? 'Cadastrando...' : <><Check size={15} aria-hidden="true" /> Salvar clube e acesso</>}
          </button>
        </form>
      </Dialog>
    </>
  );
}
