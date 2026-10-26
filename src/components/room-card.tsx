'use client';

import { CalendarDays, Check, ChevronRight, Clock3, MapPin, UserRoundPlus, Users, X, Zap } from 'lucide-react';
import { useState } from 'react';
import { PlayerPicker } from '@/components/player-picker';
import type { MatchmakingPlayerOption, OpenRoom } from '@/lib/types';

export function RoomCard({ room, compact = false, partnerOptions = [] }: { room: OpenRoom; compact?: boolean; partnerOptions?: MatchmakingPlayerOption[] }) {
  const ranked = room.mode === 'ranked';
  const [joined, setJoined] = useState(false);
  const [joinedPartySize, setJoinedPartySize] = useState(1);
  const [joinOpen, setJoinOpen] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const slotsLeft = joined ? Math.max(0, room.slots - joinedPartySize) : room.slots;

  async function enterRoom(partnerId?: string) {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/rooms/${room.id}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(partnerId ? { partnerId } : {}) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? 'Não foi possível entrar na sala.');
      if (data.matchId) return window.location.assign(`/match/${data.matchId}`);
      setJoined(true);
      setJoinedPartySize(partnerId ? 2 : 1);
      setJoinOpen(false);
    } catch {
      setError('Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }

  function openJoin() {
    setError('');
    setJoinOpen(true);
  }

  return <>
    <article className="glass group rounded-2xl p-4 transition hover:-translate-y-0.5 hover:shadow-glow sm:p-5"><div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-start gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${ranked ? 'bg-lime/10 text-lime' : 'bg-cyan/10 text-cyan'}`}><CalendarDays size={18} /></div><div className="min-w-0"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-bold text-white/90">{room.title}</h3>{ranked && <span className="hidden rounded-md bg-lime/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-lime sm:inline">Ranqueada</span>}</div><p className="mt-1 flex items-center gap-1.5 text-xs text-white/40"><MapPin size={12} /> {room.club} <span className="text-white/15">•</span> {room.distance}</p></div></div><span className="shrink-0 rounded-lg border border-white/[.08] px-2 py-1 text-[10px] font-bold text-white/55">{room.tier}</span></div><div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[.06] pt-4 text-xs text-white/50"><span className="flex items-center gap-1.5"><Clock3 size={13} className="text-cyan" /> {room.date}, {room.time}</span><span className="flex items-center gap-1.5"><Users size={13} className="text-lime" /> {slotsLeft} de {room.totalSlots} vagas</span></div><div className="mt-4 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/[.08] text-[9px] font-bold text-white/60">{room.host.split(' ').map((part) => part[0]).join('')}</span><span className="truncate text-[11px] text-white/35">Criada por <strong className="font-semibold text-white/60">{room.host}</strong></span></div><button disabled={joined || loading || slotsLeft <= 0} onClick={openJoin} className={`flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${joined ? 'text-lime' : 'text-lime hover:bg-lime/10'} disabled:cursor-default disabled:opacity-80`}>{joined ? <><Check size={14} /> {selectedPartnerId ? 'Convite enviado' : 'Você entrou'}</> : loading ? 'Entrando...' : compact ? 'Ver sala' : 'Entrar na sala'} {!joined && <ChevronRight size={14} />}</button></div>{error && <p className="mt-3 rounded-lg border border-coral/20 bg-coral/[.06] px-3 py-2 text-[11px] font-semibold text-coral">{error}</p>}{ranked && !compact && <div className="mt-4 flex items-center gap-2 text-[10px] text-white/30"><Zap size={12} className="text-lime" /> O app encontra jogadores parecidos; a quadra é reservada no clube.</div>}</article>

    {joinOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={`join-room-${room.id}`}><div className="glass w-full max-w-md rounded-3xl p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow">Entrar na sala</p><h2 id={`join-room-${room.id}`} className="mt-2 text-xl font-black">Você vem sozinho ou em dupla?</h2><p className="mt-2 text-xs leading-relaxed text-white/40">Ao convidar um parceiro, a vaga dele fica reservada até que ele aceite o convite.</p></div><button type="button" onClick={() => setJoinOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.06] text-white/45 hover:text-white" aria-label="Fechar entrada na sala"><X size={16} /></button></div><button type="button" disabled={loading} onClick={() => enterRoom()} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[.1] bg-white/[.04] py-3.5 text-xs font-black text-white/75 hover:border-lime/30 hover:text-lime"><UserRoundPlus size={15} /> Entrar sozinho</button><div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[.15em] text-white/25"><span className="h-px flex-1 bg-white/[.08]" /> ou <span className="h-px flex-1 bg-white/[.08]" /></div><PlayerPicker options={partnerOptions} value={selectedPartnerId} onChange={setSelectedPartnerId} label="Convidar parceiro" helper="Busque por @handle ou nome; a vaga fica reservada até ele aceitar." />{error && <p className="mt-4 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}<button type="button" disabled={loading || !selectedPartnerId} onClick={() => enterRoom(selectedPartnerId)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-50">{loading ? 'Enviando convite...' : <><Users size={15} /> Entrar e enviar convite</>}</button></div></div>}
  </>;
}
