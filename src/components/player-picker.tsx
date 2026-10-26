'use client';

import Link from 'next/link';
import { Check, Search, UserPlus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { MatchmakingPlayerOption } from '@/lib/types';

export function PlayerPicker({ options, value, onChange, label, helper }: { options: MatchmakingPlayerOption[]; value: string; onChange: (value: string) => void; label: string; helper: string }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(options);
  const [selectedPlayer, setSelectedPlayer] = useState<MatchmakingPlayerOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!query.trim()) setResults(options);
    if (!value) setSelectedPlayer(null);
    const option = options.find((item) => item.id === value);
    if (option) setSelectedPlayer(option);
  }, [options, query, value]);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    setError('');
    if (!trimmed) return setResults(options);
    if (trimmed.length < 2) return setError('Digite pelo menos 2 caracteres.');
    setLoading(true);
    const response = await fetch(`/api/players/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setLoading(false);
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível buscar jogadores.');
    setResults(data.players ?? []);
  }

  function selectPlayer(player: MatchmakingPlayerOption) {
    setSelectedPlayer(player);
    onChange(player.id);
  }

  function clearSelection() {
    setSelectedPlayer(null);
    onChange('');
  }

  const selected = results.find((item) => item.id === value) ?? options.find((item) => item.id === value) ?? selectedPlayer;
  return <div><span className="mb-2 block text-xs font-bold text-white/55">{label}</span><form onSubmit={search} className="flex gap-2"><span className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3 focus-within:border-lime/35"><Search size={15} className="shrink-0 text-lime" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por @handle ou nome" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" /></span><button type="submit" disabled={loading} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-white/[.1] bg-white/[.05] text-white/60 hover:border-lime/30 hover:text-lime disabled:opacity-50" aria-label="Buscar jogador"><Search size={16} /></button></form>{selected && <div className="mt-2 flex items-center gap-3 rounded-xl border border-lime/20 bg-lime/[.06] px-3 py-2.5"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lime/15 text-[9px] font-black text-lime">{initials(selected.displayName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-white/80">{selected.displayName}</span><span className="mt-0.5 block truncate text-[10px] text-white/35">{selected.handle} • {selected.tier}</span></span><Check size={15} className="text-lime" /><button type="button" onClick={clearSelection} className="rounded p-1 text-white/30 hover:text-white" aria-label="Remover parceiro selecionado"><X size={14} /></button></div>}{error && <p className="mt-2 text-[11px] font-semibold text-coral">{error}</p>}<div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] text-white/30">{helper}</span><Link href="/friends" className="shrink-0 text-[10px] font-bold text-lime hover:text-white">Gerenciar amigos</Link></div><div className="mt-3 space-y-1.5">{results.length > 0 ? <><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/25">{query.trim() ? 'Resultados da busca' : 'Seus amigos'}</p>{results.slice(0, 8).map((player) => <button type="button" key={player.id} onClick={() => selectPlayer(player)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${value === player.id ? 'border-lime/25 bg-lime/[.06]' : 'border-white/[.07] bg-white/[.02] hover:border-white/20 hover:bg-white/[.05]'}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/[.08] text-[9px] font-black text-white/60">{initials(player.displayName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-white/75">{player.displayName}</span><span className="mt-0.5 block truncate text-[10px] text-white/30">{player.handle} • {player.tier} • {player.city}</span></span>{value === player.id ? <Check size={14} className="text-lime" /> : player.relationship === 'accepted' && <span className="text-[9px] font-black text-lime">AMIGO</span>}</button>)}</> : query.trim() ? <div className="rounded-xl border border-dashed border-white/[.1] px-3 py-4 text-center text-[11px] text-white/30">Nenhum jogador encontrado.</div> : <div className="rounded-xl border border-dashed border-white/[.1] px-3 py-4 text-center"><UserPlus size={16} className="mx-auto text-white/25" /><p className="mt-2 text-[11px] text-white/35">Você ainda não adicionou amigos.</p><Link href="/friends" className="mt-1 inline-block text-[10px] font-bold text-lime">Buscar jogadores</Link></div>}</div></div>;
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}
