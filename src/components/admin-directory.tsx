'use client';

import { Building2, Check, Edit3, ExternalLink, Mail, MapPin, Phone, Search, ShieldCheck, UserRound, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { AdminClub, AdminPlayer } from '@/lib/types';
import { Dialog } from '@/components/dialog';

type DirectoryTab = 'players' | 'clubs';
type Feedback = { kind: 'success' | 'error'; text: string } | null;

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone;
}

export function AdminDirectory({ initialPlayers, initialClubs }: { initialPlayers: AdminPlayer[]; initialClubs: AdminClub[] }) {
  const [tab, setTab] = useState<DirectoryTab>('players');
  const [players, setPlayers] = useState(initialPlayers);
  const [clubs, setClubs] = useState(initialClubs);
  const [query, setQuery] = useState('');
  const [editingPlayer, setEditingPlayer] = useState<AdminPlayer | null>(null);
  const [editingClub, setEditingClub] = useState<AdminClub | null>(null);
  const [savingId, setSavingId] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const filteredPlayers = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return players;
    return players.filter((player) => [player.displayName, player.handle, player.phone, player.city, player.state, player.tier, player.club ?? ''].some((value) => value.toLowerCase().includes(term)));
  }, [players, query]);

  const filteredClubs = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return clubs;
    return clubs.filter((club) => [club.name, club.city, club.state, club.country, club.email ?? ''].some((value) => value.toLowerCase().includes(term)));
  }, [clubs, query]);

  function closeEditors() {
    if (savingId) return;
    setEditingPlayer(null);
    setEditingClub(null);
  }

  async function savePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingPlayer) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSavingId(editingPlayer.id);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/users/${editingPlayer.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          displayName: formData.get('displayName'),
          phone: formData.get('phone'),
          city: formData.get('city'),
          state: formData.get('state'),
          country: formData.get('country'),
          isActive: formData.get('isActive') === 'on',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setFeedback({ kind: 'error', text: data.error ?? 'Não foi possível salvar o jogador.' });
      setPlayers((current) => current.map((player) => player.id === editingPlayer.id ? { ...player, ...data.user } : player));
      setEditingPlayer(null);
      setFeedback({ kind: 'success', text: 'Jogador atualizado.' });
    } catch {
      setFeedback({ kind: 'error', text: 'Não foi possível conectar ao servidor.' });
    } finally {
      setSavingId('');
    }
  }

  async function saveClub(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingClub) return;
    const form = event.currentTarget;
    const formData = new FormData(form);
    setSavingId(editingClub.id);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/clubs/${editingClub.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          city: formData.get('city'),
          region: formData.get('region'),
          state: formData.get('state'),
          country: formData.get('country'),
          address: formData.get('address'),
          gripoUrl: formData.get('gripoUrl'),
          email: formData.get('email'),
          password: formData.get('password'),
          isActive: formData.get('isActive') === 'on',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setFeedback({ kind: 'error', text: data.error ?? 'Não foi possível salvar o clube.' });
      setClubs((current) => current.map((club) => club.id === editingClub.id ? { ...club, ...data.club } : club));
      setEditingClub(null);
      setFeedback({ kind: 'success', text: 'Clube e acesso atualizados.' });
    } catch {
      setFeedback({ kind: 'error', text: 'Não foi possível conectar ao servidor.' });
    } finally {
      setSavingId('');
    }
  }

  const visibleCount = tab === 'players' ? filteredPlayers.length : filteredClubs.length;

  return <section className="glass overflow-hidden rounded-2xl">
    <div className="border-b border-white/[.07] px-5 py-5 sm:px-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="eyebrow">Gestão da rede</p>
          <h2 className="mt-2 text-2xl font-black tracking-[-.04em]">Jogadores e clubes.</h2>
          <p className="mt-2 max-w-xl text-xs leading-relaxed text-soft">Consulte os cadastros criados pela plataforma e corrija dados sem alterar histórico, MMR ou patente.</p>
        </div>
        <div className="flex w-full gap-1 rounded-xl border border-white/[.07] bg-white/[.025] p-1 lg:w-auto">
          <button onClick={() => { setTab('players'); setQuery(''); }} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-bold transition lg:flex-none ${tab === 'players' ? 'bg-white/[.1] text-white' : 'text-meta hover:text-white/70'}`}><UserRound size={14} /> Jogadores <span className="text-meta">{players.length}</span></button>
          <button onClick={() => { setTab('clubs'); setQuery(''); }} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-bold transition lg:flex-none ${tab === 'clubs' ? 'bg-white/[.1] text-white' : 'text-meta hover:text-white/70'}`}><Building2 size={14} /> Clubes <span className="text-meta">{clubs.length}</span></button>
        </div>
      </div>
      <div className="mt-5 flex items-center gap-3 rounded-xl border border-white/[.08] bg-black/10 px-3.5 py-3"><Search size={15} className="shrink-0 text-meta" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tab === 'players' ? 'Buscar por nome, celular, cidade ou patente...' : 'Buscar por nome, cidade ou e-mail...'} className="w-full bg-transparent text-xs text-white outline-none placeholder:text-soft" /><span className="shrink-0 text-[11px] text-soft">{visibleCount} exibidos</span></div>
    </div>

    {feedback && <div className={`mx-5 mt-5 flex items-center gap-2 rounded-xl border px-3.5 py-3 text-xs font-semibold sm:mx-6 ${feedback.kind === 'success' ? 'border-lime/20 bg-lime/[.06] text-lime' : 'border-coral/20 bg-coral/[.06] text-coral'}`}>{feedback.kind === 'success' ? <Check size={15} /> : <X size={15} />} {feedback.text}</div>}

    {tab === 'players' ? <div className="divide-y divide-white/[.06]">
      {filteredPlayers.length === 0 ? <EmptyState icon={UserRound} title="Nenhum jogador encontrado." detail="Novos jogadores aparecerão aqui depois de criarem a própria conta." /> : filteredPlayers.map((player) => <div key={player.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-xs font-black text-lime">{initials(player.displayName)}</span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold text-white/80">{player.displayName}</p><StatusBadge active={player.isActive} /></div><p className="mt-1 truncate text-[11px] text-meta">{player.handle} • {formatPhone(player.phone)} • {player.city}, {player.state}</p></div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[11px] sm:w-44"><span className="text-meta">Patente</span><strong className="text-right text-lime">{player.tier}</strong><span className="text-meta">MMR / jogos</span><strong className="text-right text-white/65">{Math.round(player.rating)} / {player.matches}</strong><span className="text-meta">Clube</span><strong className="truncate text-right text-white/70">{player.club ?? 'Sem clube'}</strong></div>
        <button onClick={() => setEditingPlayer(player)} aria-label={`Editar ${player.displayName}`} className="flex items-center justify-center gap-2 rounded-lg border border-white/[.1] px-3 py-2 text-[11px] font-bold text-white/65 transition hover:border-lime/25 hover:text-lime sm:w-auto"><Edit3 size={13} /> Editar</button>
      </div>)}
    </div> : <div className="divide-y divide-white/[.06]">
      {filteredClubs.length === 0 ? <EmptyState icon={Building2} title="Nenhum clube encontrado." detail="Cadastre o primeiro clube no botão acima para criar também o acesso dele." /> : filteredClubs.map((club) => <div key={club.id} className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan/10 text-cyan"><Building2 size={18} /></span>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-bold text-white/80">{club.name}</p><StatusBadge active={club.isActive} /></div><p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-meta"><MapPin size={11} /> {club.city}, {club.state} • {club.country}</p></div>
        <div className="min-w-0 text-left sm:w-56 sm:text-right"><p className="flex items-center gap-1.5 truncate text-[11px] font-semibold text-white/60 sm:justify-end"><Mail size={12} className="text-cyan" /> {club.email ?? 'Acesso não configurado'}</p><p className="mt-1 truncate text-[11px] text-meta">{club.gripoUrl ? <a href={club.gripoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-cyan">Link do Gripo <ExternalLink size={10} /></a> : 'Sem link do Gripo'}</p></div>
        <button onClick={() => setEditingClub(club)} aria-label={`Editar ${club.name}`} className="flex items-center justify-center gap-2 rounded-lg border border-white/[.1] px-3 py-2 text-[11px] font-bold text-white/65 transition hover:border-cyan/25 hover:text-cyan sm:w-auto"><Edit3 size={13} /> Editar</button>
      </div>)}
    </div>}

    {editingPlayer && <Dialog open onClose={closeEditors} eyebrow="Edição administrativa" title="Editar jogador" description={`${editingPlayer.handle} • dados do perfil competitivo`} size="lg" closeOnBackdrop={false} closeLabel="Fechar edição">
      <form key={editingPlayer.id} onSubmit={savePlayer} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome de exibição" name="displayName" defaultValue={editingPlayer.displayName} required /><Field label="Celular de acesso" name="phone" defaultValue={formatPhone(editingPlayer.phone)} required /><Field label="Cidade" name="city" defaultValue={editingPlayer.city} required /><Field label="Estado / UF" name="state" defaultValue={editingPlayer.state} required maxLength={80} /><Field label="País" name="country" defaultValue={editingPlayer.country} required /></div>
        <label className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.025] p-3.5"><input type="checkbox" name="isActive" defaultChecked={editingPlayer.isActive} className="h-4 w-4 accent-lime" /><span><span className="block text-xs font-bold text-white/70">Jogador ativo</span><span className="mt-1 block text-[11px] text-meta">Contas inativas deixam de aparecer nos rankings e matchmaking.</span></span></label>
        <EditorActions busy={savingId === editingPlayer.id} onCancel={closeEditors} label="Salvar jogador" />
      </form>
    </Dialog>}

    {editingClub && <Dialog open onClose={closeEditors} eyebrow="Edição administrativa" title="Editar clube" description="Informações públicas e acesso operacional" size="lg" closeOnBackdrop={false} closeLabel="Fechar edição">
      <form key={editingClub.id} onSubmit={saveClub} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Nome do clube" name="name" defaultValue={editingClub.name} required wide /><Field label="Cidade" name="city" defaultValue={editingClub.city} required /><Field label="Estado / UF" name="state" defaultValue={editingClub.state} required maxLength={80} /><Field label="País" name="country" defaultValue={editingClub.country} required /><Field label="Região" name="region" defaultValue={editingClub.region ?? ''} /><Field label="Endereço" name="address" defaultValue={editingClub.address ?? ''} wide /><Field label="Link do Gripo" name="gripoUrl" type="url" defaultValue={editingClub.gripoUrl ?? ''} wide /></div>
        <div className="rounded-xl border border-cyan/15 bg-cyan/[.04] p-4"><div className="flex items-center gap-2 text-xs font-bold text-cyan"><ShieldCheck size={14} /> Acesso do clube</div><div className="mt-3 grid gap-4 sm:grid-cols-2"><Field label="E-mail de acesso" name="email" type="email" defaultValue={editingClub.email ?? ''} required /><Field label="Nova senha (opcional)" name="password" type="password" placeholder="Deixe em branco para manter" minLength={8} /></div></div>
        <label className="flex items-center gap-3 rounded-xl border border-white/[.08] bg-white/[.025] p-3.5"><input type="checkbox" name="isActive" defaultChecked={editingClub.isActive} className="h-4 w-4 accent-lime" /><span><span className="block text-xs font-bold text-white/70">Clube ativo</span><span className="mt-1 block text-[11px] text-meta">Clubes inativos não aparecem para os jogadores e não conseguem acessar o painel.</span></span></label>
        <EditorActions busy={savingId === editingClub.id} onCancel={closeEditors} label="Salvar clube e acesso" />
      </form>
    </Dialog>}
  </section>;
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide ${active ? 'bg-lime/10 text-lime' : 'bg-white/[.08] text-meta'}`}>{active ? 'Ativo' : 'Inativo'}</span>;
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof UserRound; title: string; detail: string }) {
  return <div className="px-5 py-14 text-center sm:px-6"><Icon className="mx-auto text-soft" size={25} /><p className="mt-4 text-sm font-bold text-white/70">{title}</p><p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-meta">{detail}</p></div>;
}

function Field({ label, name, defaultValue, placeholder, type = 'text', required = false, maxLength, minLength, wide = false }: { label: string; name: string; defaultValue?: string; placeholder?: string; type?: string; required?: boolean; maxLength?: number; minLength?: number; wide?: boolean }) {
  return <label className={wide ? 'sm:col-span-2' : ''}><span className="mb-2 block text-[11px] font-bold text-white/70">{label}</span><input name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} required={required} maxLength={maxLength} minLength={minLength} className="w-full rounded-xl border border-white/[.1] bg-white/[.035] px-3.5 py-3 text-xs text-white outline-none placeholder:text-meta focus:border-lime/40" /></label>;
}

function EditorActions({ busy, onCancel, label }: { busy: boolean; onCancel: () => void; label: string }) {
  return <div className="flex flex-col-reverse gap-2 border-t border-white/[.07] pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={busy} className="rounded-xl border border-white/[.1] px-4 py-3 text-xs font-bold text-white/65 hover:text-white disabled:opacity-40">Cancelar</button><button disabled={busy} className="flex items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-xs font-black text-ink disabled:opacity-50">{busy ? 'Salvando...' : <><Check size={14} /> {label}</>}</button></div>;
}
