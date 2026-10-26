import Link from 'next/link';
import { Award, CalendarDays, ChevronRight, Crown, Flame, Gift, Medal, Target, Trophy, Users } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { requireUserId } from '@/lib/auth';
import { loadCurrentPlayer, loadSeason } from '@/lib/db/queries';
import { getSeasonViewState, hasPlayerSeasonStanding } from '@/lib/season-state';

export const dynamic = 'force-dynamic';

export default async function SeasonPage() {
  await requireUserId();
  const [player, season] = await Promise.all([loadCurrentPlayer(), loadSeason()]);
  const view = getSeasonViewState(season);
  const hasStanding = hasPlayerSeasonStanding(season);
  const daysRemaining = Math.max(0, Math.ceil((new Date(season.endsAt).getTime() - Date.now()) / 86400000));
  const milestones = [
    { label: 'Primeira partida', value: season.matches > 0 ? 'Concluída' : '0 / 1', done: season.matches > 0 },
    { label: '10 partidas', value: `${Math.min(season.matches, 10)} / 10`, done: season.matches >= 10 },
    { label: '500 pontos', value: `${Math.min(season.points, 500)} / 500`, done: season.points >= 500 },
    { label: 'Top 100', value: season.position > 0 && season.position <= 100 ? 'Conquistado' : season.position ? `posição ${season.position}` : 'Ainda não ranqueado', done: season.position > 0 && season.position <= 100 },
  ];

  return (
    <AppShell playerName={player.displayName} playerInitials={player.initials}>
      <div className="space-y-8">
        {view === 'inactive' ? <InactiveSeason /> : view === 'empty' ? <EmptySeason season={season} daysRemaining={daysRemaining} /> : (
          <>
            <section className="relative overflow-hidden rounded-3xl border border-amber-300/15 bg-gradient-to-br from-[#2c2316] via-[#171a18] to-[#11151c] p-6 sm:p-9">
              <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-amber-300/10 blur-3xl" aria-hidden="true" />
              <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
                <div>
                  <p className="eyebrow text-amber-300">{season.name}</p>
                  <h1 className="mt-3 text-4xl font-black tracking-[-.06em] sm:text-5xl">Carreira em temporada.</h1>
                  <p className="mt-3 max-w-lg text-sm leading-relaxed text-soft">Jogue, acumule desempenho e deixe seu nome na história da temporada global.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl border border-white/[.1] bg-black/20 px-4 py-3"><p className="tiny-label">Termina em</p><p className="mt-1 text-lg font-black">{daysRemaining} dias</p></div>
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-300/15 text-amber-200"><Crown size={26} aria-hidden="true" /></div>
                </div>
              </div>
            </section>

            {hasStanding ? (
              <section className="grid gap-4 sm:grid-cols-3">
                <SeasonStat icon={Trophy} label="Sua pontuação" value={season.points.toLocaleString('pt-BR')} detail={season.position ? `#${season.position} na temporada` : 'jogue para entrar'} />
                <SeasonStat icon={Flame} label="Vitórias" value={String(season.wins)} detail={`${season.matches} partidas na etapa`} />
                <SeasonStat icon={Gift} label="Recompensas" value={`${milestones.filter((milestone) => milestone.done).length} / ${milestones.length}`} detail="marcos concluídos" />
              </section>
            ) : (
              <section className="glass rounded-2xl p-5 sm:p-6">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-300"><Trophy size={18} aria-hidden="true" /></span>
                  <div>
                    <p className="text-sm font-bold text-white/85">Sua temporada começa na primeira partida validada.</p>
                    <p className="mt-1 text-xs leading-relaxed text-meta">Você ainda não tem posição nesta etapa. O placar abaixo já mostra os jogadores que pontuaram.</p>
                  </div>
                </div>
                <Link href="/matchmaking" className="mt-5 inline-flex rounded-lg bg-lime/10 px-3 py-2 text-xs font-bold text-lime transition hover:bg-lime/20">Encontrar partida</Link>
              </section>
            )}

            <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
              {hasStanding && (
                <div className="glass rounded-2xl p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-sm font-bold">Marcos da temporada</p><p className="mt-1 text-xs text-meta">Pequenas metas. Uma carreira inteira.</p></div>
                    <Target size={18} className="text-lime" aria-hidden="true" />
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {milestones.map((milestone) => (
                      <div key={milestone.label} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-4">
                        <span className={`grid h-9 w-9 place-items-center rounded-xl ${milestone.done ? 'bg-lime/10 text-lime' : 'bg-white/[.07] text-white/50'}`}>{milestone.done ? <Medal size={16} aria-hidden="true" /> : <Target size={16} aria-hidden="true" />}</span>
                        <div className="flex-1"><p className="text-xs font-bold text-white/80">{milestone.label}</p><p className={`mt-1 text-xs ${milestone.done ? 'text-lime' : 'text-meta'}`}>{milestone.value}</p></div>
                        {milestone.done && <span className="text-[11px] font-black uppercase tracking-wider text-lime">Feito</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 rounded-xl border border-lime/15 bg-lime/[.05] p-4">
                    <div className="flex items-start gap-3">
                      <Award size={18} className="mt-0.5 text-lime" aria-hidden="true" />
                      <div><p className="text-xs font-bold text-white/80">Próximo desbloqueio</p><p className="mt-1 text-xs leading-relaxed text-soft">{season.matches < 10 ? `Complete mais ${10 - season.matches} partidas nesta temporada.` : season.points < 500 ? `Conquiste mais ${500 - season.points} pontos para alcançar o próximo marco.` : 'Você completou os principais marcos desta etapa.'}</p></div>
                    </div>
                  </div>
                </div>
              )}

              <div className={`glass rounded-2xl p-5 sm:p-6 ${hasStanding ? '' : 'lg:col-span-2'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div><p className="text-sm font-bold">Placar da temporada</p><p className="mt-1 text-xs text-meta">Jogadores com partidas validadas</p></div>
                  <Users size={17} className="text-cyan" aria-hidden="true" />
                </div>
                {season.leaderboard.length === 0 ? (
                  <div className="py-10 text-center text-xs leading-relaxed text-meta">O placar começa a aparecer depois da primeira partida validada.</div>
                ) : (
                  <div className="mt-5 space-y-1">
                    {season.leaderboard.slice(0, 5).map((entry) => (
                      <div key={`${entry.position}-${entry.name}`} className={`flex items-center gap-3 rounded-xl px-2 py-3 ${entry.isCurrentPlayer ? 'border border-lime/15 bg-lime/[.05]' : ''}`}>
                        <span className={`w-5 text-center text-xs font-black ${entry.position <= 3 ? 'text-lime' : 'text-white/60'}`}>{entry.position}</span>
                        <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.07] text-[11px] font-bold text-white/70">{entry.initials}</span>
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white/80">{entry.name}</p><p className="mt-1 text-[11px] text-cyan">{entry.tier}</p></div>
                        <strong className="text-xs text-white/80">{entry.points}</strong>
                      </div>
                    ))}
                  </div>
                )}
                <Link href="/ranking" className="mt-4 flex w-full items-center justify-center gap-1 border-t border-white/[.07] pt-4 text-xs font-bold text-soft transition hover:text-lime">Ver ranking completo <ChevronRight size={13} aria-hidden="true" /></Link>
              </div>
            </section>
          </>
        )}

        <section className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5">
          <div className="flex items-center gap-3"><CalendarDays size={17} className="text-cyan" aria-hidden="true" /><p className="text-xs font-bold text-white/75">Uma única temporada para toda a plataforma</p><span className="ml-auto hidden text-[11px] text-meta sm:block">Sem ligas privadas de clubes no MVP</span></div>
        </section>
      </div>
    </AppShell>
  );
}

function InactiveSeason() {
  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-white/[.08] bg-gradient-to-br from-[#151b25] via-[#11161e] to-[#0d1117] p-6 sm:p-9">
        <div className="relative max-w-2xl">
          <p className="eyebrow">Temporada global</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-.06em] sm:text-5xl">Sem temporada ativa.</h1>
          <p className="mt-3 text-sm leading-relaxed text-soft">A próxima temporada será anunciada aqui. Seu histórico e ranking continuam disponíveis.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/matchmaking" className="rounded-xl bg-lime px-4 py-3 text-xs font-black text-ink transition hover:bg-lime-300">Encontrar partida</Link>
            <Link href="/ranking" className="rounded-xl border border-white/[.12] bg-white/[.04] px-4 py-3 text-xs font-bold text-white/80 transition hover:border-lime/30 hover:text-lime">Ver ranking</Link>
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cyan/10 text-cyan"><Trophy size={18} aria-hidden="true" /></span>
          <div>
            <p className="text-sm font-bold text-white/85">Enquanto isso, continue jogando.</p>
            <p className="mt-1 text-xs leading-relaxed text-meta">Partidas válidas continuam construindo seu histórico. Quando uma temporada for ativada, o placar aparecerá aqui.</p>
          </div>
        </div>
      </section>
    </>
  );
}

function EmptySeason({ season, daysRemaining }: { season: Awaited<ReturnType<typeof loadSeason>>; daysRemaining: number }) {
  return (
    <>
      <section className="relative overflow-hidden rounded-3xl border border-amber-300/15 bg-gradient-to-br from-[#2c2316] via-[#171a18] to-[#11151c] p-6 sm:p-9">
        <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-amber-300/10 blur-3xl" aria-hidden="true" />
        <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow text-amber-300">{season.name}</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-.06em] sm:text-5xl">Temporada em andamento.</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-soft">As primeiras partidas validadas abrem o placar.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-white/[.1] bg-black/20 px-4 py-3"><p className="tiny-label">Termina em</p><p className="mt-1 text-lg font-black">{daysRemaining} dias</p></div>
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-300/15 text-amber-200"><Crown size={26} aria-hidden="true" /></div>
          </div>
        </div>
      </section>

      <section className="glass rounded-2xl p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-300"><Trophy size={18} aria-hidden="true" /></span>
          <div>
            <p className="text-sm font-bold text-white/85">O placar ainda está vazio.</p>
            <p className="mt-1 text-xs leading-relaxed text-meta">Jogue e tenha uma partida validada para entrar na temporada.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/matchmaking" className="rounded-lg bg-lime/10 px-3 py-2 text-xs font-bold text-lime transition hover:bg-lime/20">Encontrar partida</Link>
          <Link href="/ranking" className="rounded-lg border border-white/[.12] px-3 py-2 text-xs font-bold text-white/75 transition hover:text-lime">Ver ranking</Link>
        </div>
      </section>
    </>
  );
}

function SeasonStat({ icon: Icon, label, value, detail }: { icon: typeof Trophy; label: string; value: string; detail: string }) {
  return (
    <div className="glass rounded-2xl p-5">
      <Icon size={17} className="text-amber-300" aria-hidden="true" />
      <p className="mt-5 text-[11px] font-bold uppercase tracking-[.13em] text-meta">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      <p className="mt-1 text-xs text-soft">{detail}</p>
    </div>
  );
}
