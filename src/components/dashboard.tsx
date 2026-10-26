'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Crown,
  Flame,
  Globe2,
  Medal,
  Sparkles,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { RankEmblem } from '@/components/rank-emblem';
import { progressPercent } from '@/lib/ranks';
import type { ActivityItem, Player, SeasonData } from '@/lib/types';

export function Dashboard({ player, activities, season }: { player: Player; activities: ActivityItem[]; season: SeasonData }) {
  const firstName = player.displayName.split(' ')[0];
  const nextRank = player.rank.tier.order < 18 ? player.rank.tier.order + 1 : player.rank.tier.order;
  const nextRankLabel = nextRank === player.rank.tier.order
    ? player.rank.tier.label
    : ['6ª III', '6ª II', '6ª I', '5ª III', '5ª II', '5ª I', '4ª III', '4ª II', '4ª I', '3ª III', '3ª II', '3ª I', '2ª III', '2ª II', '2ª I', '1ª III', '1ª II', '1ª I', 'Elite', 'Challenger'][nextRank];

  return (
    <AppShell playerName={player.displayName} playerInitials={player.initials}>
      <div className="space-y-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Olá, {firstName} <span className="text-white/25">/</span> sua carreira continua</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">Vamos para a próxima?</h1>
            <p className="mt-2 text-sm text-soft">Você está construindo seu caminho até a {nextRankLabel}.</p>
          </div>
          <Link href="/matchmaking" className="flex w-fit items-center gap-2 rounded-xl bg-lime px-4 py-3 text-xs font-black text-ink transition hover:bg-lime-300">
            <Zap size={15} fill="currentColor" aria-hidden="true" /> Encontrar partida
          </Link>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
          <div className="relative overflow-hidden rounded-3xl border border-lime/15 bg-gradient-to-br from-[#18231e] via-[#111a1b] to-[#11151c] p-6 shadow-glow sm:p-8">
            <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-lime/10 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-col justify-between gap-8 sm:flex-row">
              <div className="flex items-start gap-5 sm:gap-6">
                <div className="mt-2"><RankEmblem label={player.rank.tier.label} size="lg" accent={player.rank.tier.accent} /></div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-cyan/25 bg-cyan/10 px-2 py-1 text-[11px] font-black uppercase tracking-[.12em] text-cyan">Patente atual</span>
                    <span className="text-xs font-semibold text-meta">#{player.cityPosition || '—'} {player.city}</span>
                  </div>
                  <h2 className="mt-4 text-3xl font-black tracking-[-.04em]">{player.rank.tier.label}</h2>
                  <p className="mt-1 text-sm text-soft">{player.rating.matches} partidas ranqueadas • {player.streak} vitórias seguidas</p>
                  <div className="mt-6 w-full max-w-[280px]">
                    <div className="mb-2 flex justify-between text-xs font-bold">
                      <span className="text-soft">{player.rank.points} / 100 pontos</span>
                      <span className="text-lime">MMR em evolução</span>
                    </div>
                    <div
                      className="h-2 overflow-hidden rounded-full bg-black/30"
                      role="progressbar"
                      aria-label="Progresso até a próxima patente"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progressPercent(player.rank.points))}
                    >
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan to-lime" style={{ width: `${progressPercent(player.rank.points)}%` }} />
                    </div>
                    <div className="mt-2 flex justify-between text-[11px] font-semibold text-meta">
                      <span>{player.rank.tier.label}</span>
                      <span>Próxima: {nextRankLabel}</span>
                      <span>100 pts</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 flex-row gap-3 sm:flex-col sm:items-end sm:justify-end">
                <div className="rounded-xl border border-white/[.08] bg-black/15 px-4 py-3">
                  <p className="tiny-label">MMR oculto</p>
                  <p className="mt-1 text-xs font-bold text-white/80">Protegido pelo sistema <span className="text-lime">●</span></p>
                </div>
                <Link href="/profile" className="flex items-center gap-1 text-xs font-bold text-soft transition hover:text-lime">
                  Ver evolução no perfil <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </div>

          <div className="glass grid-lines flex flex-col justify-between rounded-3xl p-6 sm:p-7">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">Temporada global</p>
                <h2 className="mt-3 text-2xl font-black tracking-[-.04em]">{season.name}</h2>
                <p className="mt-1 text-sm text-soft">{season.active ? `Até ${new Date(season.endsAt).toLocaleDateString('pt-BR')}` : 'Aguardando a próxima etapa'}</p>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-400/10 text-amber-300">
                <Crown size={21} aria-hidden="true" />
              </div>
            </div>
            <div className="mt-8">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-3xl font-black">{season.points}</p>
                  <p className="mt-1 text-xs uppercase tracking-[.12em] text-meta">pontos de temporada</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-lime">{season.position ? `#${season.position.toLocaleString('pt-BR')}` : '—'}</p>
                  <p className="mt-1 text-xs text-meta">{season.position ? 'posição na temporada' : season.active ? 'jogue para entrar' : 'sem temporada ativa'}</p>
                </div>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[.07]" aria-hidden="true">
                <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-lime" style={{ width: `${Math.min(100, Math.round((season.points / 500) * 100))}%` }} />
              </div>
            </div>
            <Link href="/season" className="mt-6 flex items-center justify-between rounded-xl border border-white/[.08] px-3 py-3 text-xs font-bold text-white/75 transition hover:border-lime/25 hover:text-lime">
              Ver placar da temporada <ChevronRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <KpiCard label="Ranking global" value={player.globalPosition ? `#${player.globalPosition.toLocaleString('pt-BR')}` : '—'} detail={player.rating.matches ? `${player.rating.matches} partidas` : 'em classificação'} icon={Globe2} accent="cyan" />
          <KpiCard label="No seu clube" value={player.clubPosition ? `#${player.clubPosition}` : '—'} detail={player.club} icon={Trophy} accent="lime" />
          <KpiCard label="Sequência atual" value={String(player.streak)} detail="vitórias" icon={Flame} accent="coral" />
          <KpiCard label="Partidas ranqueadas" value={String(player.rating.matches)} detail="no histórico" icon={Activity} accent="cyan" />
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.4fr_1fr]">
          <div className="glass rounded-3xl p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">Seu próximo jogo</p>
                <h2 className="mt-2 text-xl font-black tracking-[-.03em]">O saguão está pronto.</h2>
                <p className="mt-2 text-sm leading-relaxed text-soft">Escolha seus dias, horários e lado da quadra. O sistema encontra uma partida equilibrada quando houver quatro jogadores compatíveis.</p>
              </div>
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-lime/10 text-lime">
                <Clock3 size={20} aria-hidden="true" />
              </div>
            </div>
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              <StepCard number="01" title="Disponibilidade" detail="Quando você pode jogar." />
              <StepCard number="02" title="Solo ou dupla" detail="Convide pelo @handle." />
              <StepCard number="03" title="Quatro aceites" detail="A partida só fecha depois." />
            </div>
            <Link href="/matchmaking" className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3 text-xs font-black text-ink transition hover:bg-lime-300">
              <Zap size={15} fill="currentColor" aria-hidden="true" /> Abrir saguão de busca
            </Link>
          </div>

          <div>
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="eyebrow">Linha do tempo</p>
                <h2 className="mt-2 text-xl font-black tracking-[-.03em]">Sua evolução</h2>
              </div>
              <Link href="/history" className="text-xs font-bold text-soft transition hover:text-lime">Histórico completo</Link>
            </div>
            <div className="glass rounded-2xl p-5">
              {activities.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-bold text-white/80">Sua linha do tempo começará com a primeira partida.</p>
                  <p className="mt-2 text-xs leading-relaxed text-meta">Entre no saguão para criar seu próximo marco competitivo.</p>
                </div>
              ) : (
                <ol className="relative space-y-5 before:absolute before:bottom-4 before:left-[13px] before:top-4 before:w-px before:bg-white/[.09]">
                  {activities.map((item) => (
                    <li key={item.id} className="relative flex gap-3">
                      <div className={`z-10 grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#18202a] ${item.type === 'win' ? 'bg-lime/15 text-lime' : item.type === 'promotion' ? 'bg-cyan/15 text-cyan' : 'bg-white/[.08] text-white/65'}`}>
                        {item.icon === 'zap' ? <Zap size={13} aria-hidden="true" /> : item.icon === 'arrow' ? <ArrowUpRight size={13} aria-hidden="true" /> : item.icon === 'trophy' ? <Trophy size={13} aria-hidden="true" /> : <CalendarDays size={13} aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white/85">{item.title}</p>
                        <p className="mt-1 text-xs leading-relaxed text-soft">{item.description}</p>
                        <p className="mt-1.5 text-[11px] text-meta">{item.time}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <Link href="/history" className="mt-5 flex items-center justify-center gap-1 border-t border-white/[.06] pt-4 text-xs font-bold text-soft transition hover:text-lime">
                Ver todas as atividades <ChevronRight size={13} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <HighlightCard icon={Target} tone="lime" title="Próximo objetivo" value={`Conquiste a ${nextRankLabel}`} detail="Continue jogando partidas válidas para avançar na sua carreira." />
          <HighlightCard icon={Medal} tone="cyan" title="Maior conquista" value={player.rank.peakLabel} detail="Sua maior patente registrada até agora." />
          <HighlightCard icon={Sparkles} tone="amber" title="Clube principal" value={player.club} detail="Seu vínculo ajuda a formar rankings locais." />
        </section>
      </div>
    </AppShell>
  );
}

function KpiCard({ label, value, detail, icon: Icon, accent }: { label: string; value: string; detail: string; icon: LucideIcon; accent: 'lime' | 'cyan' | 'coral' }) {
  const tones = {
    lime: 'bg-lime/10 text-lime',
    cyan: 'bg-cyan/10 text-cyan',
    coral: 'bg-coral/10 text-coral',
  };

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[accent]}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-[.13em] text-meta">{label}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong className="text-2xl font-black tracking-tight">{value}</strong>
        <span className="text-xs text-soft">{detail}</span>
      </div>
    </div>
  );
}

function StepCard({ number, title, detail }: { number: string; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
      <p className="text-[11px] font-black text-lime">{number}</p>
      <p className="mt-2 text-xs font-bold text-white/85">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-meta">{detail}</p>
    </div>
  );
}

function HighlightCard({ icon: Icon, tone, title, value, detail }: { icon: LucideIcon; tone: 'lime' | 'cyan' | 'amber'; title: string; value: string; detail: string }) {
  const tones = {
    lime: 'text-lime',
    cyan: 'text-cyan',
    amber: 'text-amber-300',
  };

  return (
    <div className={`rounded-2xl border p-5 ${tone === 'lime' ? 'border-lime/15 bg-lime/[.055]' : tone === 'cyan' ? 'border-white/[.08] bg-white/[.025]' : 'border-white/[.08] bg-white/[.025]'}`}>
      <div className={`flex items-center gap-2 text-xs font-bold ${tones[tone]}`}>
        <Icon size={15} aria-hidden="true" /> {title}
      </div>
      <p className="mt-3 text-sm font-bold text-white/90">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-soft">{detail}</p>
    </div>
  );
}
