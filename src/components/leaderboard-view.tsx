'use client';

import { MapPin, Search, Trophy, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { LeaderboardEntry, Player } from '@/lib/types';

const scopes = ['Global', 'Meu estado', 'Minha cidade', 'Meu clube'] as const;

export function LeaderboardView({ entries, player }: { entries: LeaderboardEntry[]; player: Player }) {
  const [scope, setScope] = useState<(typeof scopes)[number]>('Minha cidade');
  const [query, setQuery] = useState('');
  const scopedEntries = useMemo(() => {
    const scoped = entries.filter((entry) => {
      if (scope === 'Meu estado') return entry.state === player.state;
      if (scope === 'Minha cidade') return entry.city === player.city;
      if (scope === 'Meu clube') return entry.club === player.club;
      return true;
    });
    return scoped.map((entry, index) => ({ ...entry, position: index + 1 }));
  }, [entries, player, scope]);
  const filtered = useMemo(
    () => scopedEntries.filter((entry) => `${entry.player} ${entry.handle} ${entry.club}`.toLowerCase().includes(query.toLowerCase())),
    [scopedEntries, query],
  );
  const currentEntry = scopedEntries.find((entry) => entry.handle === player.handle);
  const position = currentEntry?.position ?? 0;
  const scopeDescription = scope === 'Global'
    ? 'no mundo'
    : scope === 'Meu estado'
      ? `em ${player.state || 'seu estado'}`
      : scope === 'Minha cidade'
        ? `em ${player.city || 'sua cidade'}`
        : `em ${player.club || 'seu clube'}`;

  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Ranking contínuo</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">Ranking</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-soft">Compare sua posição por região ou clube.</p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-xl border border-lime/15 bg-lime/[.06] px-3 py-2 text-xs font-semibold text-lime">
          <Trophy size={14} aria-hidden="true" /> Ranking global
        </div>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Escopo do ranking" className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border border-white/[.07] bg-white/[.025] p-1">
          {scopes.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={scope === item}
              onClick={() => setScope(item)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold transition ${scope === item ? 'bg-white/[.1] text-white' : 'text-white/60 hover:text-white'}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/[.08] bg-white/[.025] px-3 py-2.5 text-white/60 focus-within:border-lime/40 lg:w-64">
            <Search size={15} aria-hidden="true" />
            <span className="sr-only">Buscar jogador no ranking</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar jogador"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-meta"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <section className="glass overflow-hidden rounded-2xl" aria-label={`Ranking ${scope}`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-5 py-4">
            <div>
              <p className="text-sm font-bold">{scope}</p>
              <p className="mt-1 text-xs text-meta" aria-live="polite">{filtered.length} jogadores ativos {scopeDescription}</p>
            </div>
            <span className="text-xs font-semibold text-meta">Ordenado por MMR</span>
          </div>

          <div className="divide-y divide-white/[.055]">
            {filtered.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="text-sm font-bold text-white/80">
                  {query ? 'Nenhum jogador encontrado nesta busca.' : 'Ainda não existem jogadores nesta visão.'}
                </p>
                <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-meta">
                  {query ? 'Tente outro nome, @handle ou clube.' : 'Os jogadores aparecem aqui quando têm uma posição calculada.'}
                </p>
                {query ? (
                  <button type="button" onClick={() => setQuery('')} className="mt-4 rounded-lg border border-white/[.12] px-3 py-2 text-xs font-bold text-white/75 transition hover:border-lime/30 hover:text-lime">
                    Limpar busca
                  </button>
                ) : scope !== 'Global' ? (
                  <button type="button" onClick={() => setScope('Global')} className="mt-4 rounded-lg border border-white/[.12] px-3 py-2 text-xs font-bold text-white/75 transition hover:border-lime/30 hover:text-lime">
                    Ver ranking global
                  </button>
                ) : null}
              </div>
            ) : (
              filtered.map((entry) => (
                <div
                  key={entry.handle}
                  className={`flex items-center gap-3 px-4 py-4 transition hover:bg-white/[.025] sm:px-5 ${entry.handle === player.handle ? 'bg-lime/[.035]' : ''}`}
                >
                  <span className={`w-6 text-center text-sm font-black ${entry.position <= 3 ? 'text-lime' : 'text-meta'}`}>{String(entry.position).padStart(2, '0')}</span>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.07] text-xs font-bold text-white/75">{entry.initials}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-xs font-bold text-white/90">{entry.player}</p>
                      {entry.handle === player.handle && <span className="rounded bg-lime/10 px-1.5 py-0.5 text-[11px] font-black text-lime">VOCÊ</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-meta">
                      <MapPin size={11} aria-hidden="true" /> {entry.city} <span className="text-white/20">•</span> {entry.club}
                    </p>
                  </div>
                  <div className="hidden w-20 text-right sm:block">
                    <p className="text-xs font-bold text-cyan">{entry.tier}</p>
                    <p className="mt-1 text-[11px] text-meta">{entry.points} pts</p>
                  </div>
                  <div className="flex w-8 justify-end" aria-hidden="true">
                    {entry.delta > 0 ? <TrendingUp size={14} className="text-lime" /> : entry.delta < 0 ? <TrendingDown size={14} className="text-coral" /> : <span className="text-xs text-meta">—</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="glass grid-lines rounded-2xl p-5">
            <p className="eyebrow">Acompanhe de perto</p>
            <p className="mt-3 text-3xl font-black">{position ? `#${position.toLocaleString('pt-BR')}` : '—'}</p>
            <p className="mt-1 text-xs text-soft">posição {scopeDescription}</p>
            <div className="mt-5 space-y-3 text-xs">
              <div className="flex justify-between gap-3"><span className="text-meta">No clube</span><strong className="text-white/80">{formatPosition(player.clubPosition)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-meta">Na cidade</span><strong className="text-white/80">{formatPosition(player.cityPosition)}</strong></div>
              <div className="flex justify-between gap-3"><span className="text-meta">No mundo</span><strong className="text-white/80">{formatPosition(player.globalPosition)}</strong></div>
            </div>
          </div>
          <div className="rounded-2xl border border-cyan/15 bg-cyan/[.05] p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan"><MapPin size={15} aria-hidden="true" /> Ranking é um só</div>
            <p className="mt-2 text-xs leading-relaxed text-soft">Os filtros mostram posições dentro do mesmo MMR global. O jogador não ganha uma patente diferente por região.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function formatPosition(position: number) {
  return position ? `#${position.toLocaleString('pt-BR')}` : '—';
}
