'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  CircleHelp,
  MapPin,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import type { HistoryData, HistoryItem } from '@/lib/types';

export type HistoryFilter = 'all' | 'win' | 'loss' | 'pending' | 'friendly';

const historyFilters: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'win', label: 'Vitórias' },
  { id: 'loss', label: 'Derrotas' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'friendly', label: 'Amistosas' },
];

export function filterHistoryItems(items: readonly HistoryItem[], filter: HistoryFilter): HistoryItem[] {
  if (filter === 'all') return [...items];
  if (filter === 'friendly') return items.filter((item) => item.tone === 'friendly' || item.label === 'Amistosa');
  return items.filter((item) => item.tone === filter);
}

export function HistoryView({
  history,
  playerName,
  playerInitials,
}: {
  history: HistoryData;
  playerName: string;
  playerInitials: string;
}) {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const visible = useMemo(() => filterHistoryItems(history.items, filter), [history.items, filter]);
  const counts = useMemo(
    () => Object.fromEntries(historyFilters.map((item) => [item.id, filterHistoryItems(history.items, item.id).length])) as Record<HistoryFilter, number>,
    [history.items],
  );
  const winRate = history.total ? Math.round((history.wins / history.total) * 100) : 0;
  const activeFilterLabel = historyFilters.find((item) => item.id === filter)?.label ?? 'Todas';

  return (
    <AppShell playerName={playerName} playerInitials={playerInitials}>
      <div className="space-y-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Sua carreira</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">Histórico de partidas</h1>
            <p className="mt-2 text-sm text-soft">Resultados e evolução em um só lugar.</p>
          </div>
          <Link href="/matchmaking" className="flex w-fit items-center gap-2 rounded-xl bg-lime px-4 py-3 text-xs font-black text-ink transition hover:bg-lime-300">
            <CalendarDays size={15} aria-hidden="true" /> Encontrar partida
          </Link>
        </section>

        <section className="grid grid-cols-3 gap-2 sm:gap-4">
          <MiniStat icon={Activity} label="Partidas" value={String(history.total)} detail="registradas" />
          <MiniStat icon={Trophy} label="Vitórias" value={String(history.wins)} detail={`${winRate}% de aproveitamento`} />
          <MiniStat icon={ArrowUpRight} label="Evolução" value={`${history.mmrDelta >= 0 ? '+' : ''}${history.mmrDelta}`} detail="MMR validado" />
        </section>

        <section className="glass rounded-2xl p-3 sm:p-4" aria-label="Filtros do histórico">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="group" aria-label="Filtrar partidas por resultado" className="flex flex-wrap gap-1.5">
              {historyFilters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${filter === item.id ? 'bg-white/[.1] text-white' : 'text-white/60 hover:text-white'}`}
                >
                  {item.label}
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${filter === item.id ? 'bg-lime/15 text-lime' : 'bg-white/[.06] text-meta'}`}>{counts[item.id]}</span>
                </button>
              ))}
            </div>
            <p className="text-xs text-meta" aria-live="polite">
              Mostrando {visible.length} de {history.total} partidas
            </p>
          </div>
        </section>

        <section className="glass overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[.07] px-5 py-4">
            <div>
              <p className="text-sm font-bold">Partidas recentes</p>
              <p className="mt-1 text-xs text-meta">Resultados validados atualizam sua patente automaticamente</p>
            </div>
            <span className="rounded-lg bg-lime/10 px-2 py-1 text-[11px] font-bold text-lime">{activeFilterLabel}: {visible.length}</span>
          </div>

          {history.items.length === 0 ? (
            <div className="px-5 py-16 text-center">
              <CircleHelp className="mx-auto text-cyan" size={24} aria-hidden="true" />
              <p className="mt-4 text-sm font-bold text-white/80">Seu histórico ainda está vazio.</p>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-meta">Entre no saguão, complete uma partida e aguarde as confirmações. O resultado aparecerá aqui.</p>
              <Link href="/matchmaking" className="mt-5 inline-flex rounded-lg bg-lime/10 px-3 py-2 text-xs font-bold text-lime transition hover:bg-lime/20">Abrir saguão</Link>
            </div>
          ) : visible.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-bold text-white/80">Nenhuma partida neste filtro.</p>
              <p className="mt-2 text-xs text-meta">Escolha outro resultado ou volte para todas as partidas.</p>
              <button type="button" onClick={() => setFilter('all')} className="mt-4 rounded-lg border border-white/[.12] px-3 py-2 text-xs font-bold text-white/75 transition hover:border-lime/30 hover:text-lime">
                Ver todas
              </button>
            </div>
          ) : (
            <div className="divide-y divide-white/[.055]">
              {visible.map((match) => <HistoryRow key={match.id} match={match} />)}
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-lime/15 bg-lime/[.05] p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-lime"><CircleCheck size={15} aria-hidden="true" /> Validação distribuída</div>
            <p className="mt-3 text-sm leading-relaxed text-soft">O MMR só muda depois que pelo menos três dos quatro jogadores confirmam, incluindo uma pessoa de cada dupla.</p>
          </div>
          <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan"><CalendarDays size={15} aria-hidden="true" /> Próximo marco</div>
            <p className="mt-3 text-sm leading-relaxed text-soft">Entre no saguão para continuar sua carreira competitiva.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function HistoryRow({ match }: { match: HistoryItem }) {
  const isWin = match.tone === 'win';
  const isLoss = match.tone === 'loss';
  const isPending = match.tone === 'pending';
  const Icon = isPending ? CircleHelp : match.tone === 'friendly' ? Activity : isWin ? ArrowUpRight : ArrowDownRight;

  return (
    <Link
      href={`/match/${match.id}`}
      className="flex flex-col gap-4 px-5 py-5 transition hover:bg-white/[.035] sm:flex-row sm:items-center"
    >
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isWin ? 'bg-lime/10 text-lime' : isLoss ? 'bg-coral/10 text-coral' : isPending ? 'bg-amber-300/10 text-amber-300' : 'bg-white/[.07] text-white/60'}`}>
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`text-xs font-black ${isWin ? 'text-lime' : isLoss ? 'text-coral' : isPending ? 'text-amber-300' : 'text-white/75'}`}>{match.result}</span>
          <span className="rounded bg-white/[.06] px-1.5 py-0.5 text-[11px] font-bold text-white/70">{match.label}</span>
          <span className="text-[11px] text-meta">{match.date}</span>
        </div>
        <p className="mt-1.5 truncate text-sm font-bold text-white/85">{match.opponent}</p>
        <p className="mt-1 flex items-center gap-1.5 text-[11px] text-meta"><MapPin size={11} aria-hidden="true" /> {match.club}</p>
      </div>
      <div className="flex items-center justify-between gap-6 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-sm font-black text-white/85">{match.score}</p>
          <p className="mt-1 text-[11px] text-meta">placar final</p>
        </div>
        <div className={`w-12 text-right text-xs font-black ${match.delta !== null && match.delta > 0 ? 'text-lime' : match.delta !== null && match.delta < 0 ? 'text-coral' : 'text-meta'}`}>
          {match.delta === null ? '—' : `${match.delta >= 0 ? '+' : ''}${match.delta}`}
        </div>
        <ChevronRight size={15} className="text-white/40" aria-hidden="true" />
      </div>
    </Link>
  );
}

function MiniStat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: string; detail: string }) {
  return (
    <div className="glass rounded-2xl p-3 sm:p-5">
      <Icon size={16} className="text-lime" aria-hidden="true" />
      <p className="mt-3 text-[11px] font-bold uppercase tracking-[.13em] text-meta sm:mt-5">{label}</p>
      <div className="mt-1 flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
        <strong className="text-xl font-black sm:text-2xl">{value}</strong>
        <span className="text-[11px] leading-snug text-soft sm:text-xs">{detail}</span>
      </div>
    </div>
  );
}
