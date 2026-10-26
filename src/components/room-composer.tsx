'use client';

import { CalendarDays, Check, Clock3, MapPin, Sparkles, UserRoundPlus, Users, X } from 'lucide-react';
import { useState } from 'react';
import { PlayerPicker } from '@/components/player-picker';
import type { MatchmakingPlayerOption } from '@/lib/types';

type Club = { id: string; name: string; city: string; state: string; country: string };

export function RoomComposer({ clubs, players, open, onClose, onCreated }: { clubs: Club[]; players: MatchmakingPlayerOption[]; open: boolean; onClose: () => void; onCreated: (message: string) => void }) {
  const [clubId, setClubId] = useState(clubs[0]?.id ?? '');
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [time, setTime] = useState('19:00');
  const [mode, setMode] = useState<'ranked' | 'friendly'>('ranked');
  const [partyType, setPartyType] = useState<'solo' | 'duo'>('solo');
  const [partnerId, setPartnerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (partyType === 'duo' && !partnerId) return setError('Escolha o parceiro da sua dupla.');
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clubId, partnerId: partyType === 'duo' ? partnerId : undefined, startsAt: new Date(`${date}T${time}:00`).toISOString(), mode, kind: 'open-room', preferences: [partyType === 'duo' ? 'Dupla já formada' : 'Buscando parceiro', 'Duplas equilibradas'] }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? 'Não foi possível criar a sala.');
      onCreated(data.message ?? 'Sala criada.');
    } catch {
      setError('Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-black/70 px-4 py-6 backdrop-blur-sm"><form onSubmit={submit} className="glass w-full max-w-lg rounded-3xl p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="eyebrow">Nova sala</p><h2 className="mt-2 text-2xl font-black">Monte sua próxima partida.</h2><p className="mt-2 text-xs text-white/40">Você pode começar sozinho ou já levar seu parceiro. Os demais jogadores entram conforme a compatibilidade.</p></div><button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-white/[.06] text-white/45 hover:text-white" aria-label="Fechar criação de sala"><X size={16} /></button></div>
    <div className="mt-7 space-y-4">
      <div><span className="mb-2 block text-xs font-bold text-white/55">Como quer começar?</span><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setPartyType('solo'); setPartnerId(''); }} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold ${partyType === 'solo' ? 'border-lime/40 bg-lime/10 text-lime' : 'border-white/[.1] bg-white/[.035] text-white/45'}`}><UserRoundPlus size={15} /> Sozinho</button><button type="button" onClick={() => setPartyType('duo')} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold ${partyType === 'duo' ? 'border-lime/40 bg-lime/10 text-lime' : 'border-white/[.1] bg-white/[.035] text-white/45'}`}><Users size={15} /> Com parceiro</button></div></div>
      {partyType === 'duo' && <PlayerPicker options={players} value={partnerId} onChange={setPartnerId} label="Parceiro da dupla" helper="Busque qualquer jogador ativo; amigos aparecem primeiro." />}
      <label className="block"><span className="mb-2 block text-xs font-bold text-white/55">Clube</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><MapPin size={15} className="text-lime" /><select value={clubId} onChange={(event) => setClubId(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none"><option value="" className="bg-[#121820]">Selecione um clube</option>{clubs.map((club) => <option key={club.id} value={club.id} className="bg-[#121820]">{club.name} — {club.city}, {club.state}</option>)}</select></span></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="mb-2 block text-xs font-bold text-white/55">Data</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><CalendarDays size={15} className="text-cyan" /><input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setDate(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none" /></span></label><label className="block"><span className="mb-2 block text-xs font-bold text-white/55">Horário</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><Clock3 size={15} className="text-cyan" /><input type="time" value={time} onChange={(event) => setTime(event.target.value)} className="w-full bg-transparent text-sm text-white outline-none" /></span></label></div>
      <div><span className="mb-2 block text-xs font-bold text-white/55">Tipo</span><div className="flex gap-1 rounded-xl border border-white/[.1] bg-white/[.035] p-1">{(['ranked', 'friendly'] as const).map((option) => <button type="button" key={option} onClick={() => setMode(option)} className={`flex-1 rounded-lg px-2 py-2 text-[11px] font-bold ${mode === option ? 'bg-white/[.1] text-white' : 'text-white/35'}`}>{option === 'ranked' ? 'Ranqueada' : 'Amistosa'}</button>)}</div></div>
      <div className="rounded-2xl border border-cyan/15 bg-cyan/[.04] p-4"><div className="flex items-center gap-2 text-xs font-bold text-cyan"><Sparkles size={15} /> Nível definido automaticamente</div><p className="mt-2 text-[11px] leading-relaxed text-white/40">Você não escolhe a categoria da sala. Em partidas ranqueadas, o sistema usa a patente e o MMR atuais dos jogadores para definir a compatibilidade.</p></div>
    </div>
    {error && <p className="mt-4 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}
    <button disabled={loading || !clubId || (partyType === 'duo' && !partnerId)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-50">{loading ? 'Criando sala...' : <><Check size={15} /> Criar sala aberta</>}</button>
  </form></div>;
}
