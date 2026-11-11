'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, CircleAlert, Clock3, MapPin, MessageCircle, ShieldCheck, Swords, Users, X, Zap } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { RankEmblem } from '@/components/rank-emblem';
import type { MatchDetails } from '@/lib/types';
import { matchDraftFromServer, shouldApplyMatchResponse, shouldApplyServerMatchDraft } from '@/lib/match-draft';
import { getMatchNextAction } from '@/lib/match-next-action';
import { ConfirmDialog } from '@/components/dialog';

export default function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <MatchView id={id} />;
}

function MatchView({ id }: { id: string }) {
  const [details, setDetails] = useState<MatchDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [error, setError] = useState('');
  const [setOneA, setSetOneA] = useState('');
  const [setOneB, setSetOneB] = useState('');
  const [setTwoA, setSetTwoA] = useState('');
  const [setTwoB, setSetTwoB] = useState('');
  const [winner, setWinner] = useState<'A' | 'B'>('A');
  const [voteWinner, setVoteWinner] = useState<'A' | 'B'>('A');
  const [submitted, setSubmitted] = useState(false);
  const [resultConfirmed, setResultConfirmed] = useState(false);
  const [acceptanceLoading, setAcceptanceLoading] = useState(false);
  const [disputed, setDisputed] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedCourt, setBookedCourt] = useState<string | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [confirmingResult, setConfirmingResult] = useState(false);
  const [disputingResult, setDisputingResult] = useState(false);
  const [declineConfirmOpen, setDeclineConfirmOpen] = useState(false);
  const [disputeConfirmOpen, setDisputeConfirmOpen] = useState(false);
  const draftDirty = useRef(false);
  const voteDirty = useRef(false);
  const latestRequest = useRef(0);
  const activeId = useRef(id);
  activeId.current = id;

  function setDraft(patch: Partial<{ setOneA: string; setOneB: string; setTwoA: string; setTwoB: string; winner: 'A' | 'B' }>) {
    draftDirty.current = true;
    if (patch.setOneA !== undefined) setSetOneA(patch.setOneA);
    if (patch.setOneB !== undefined) setSetOneB(patch.setOneB);
    if (patch.setTwoA !== undefined) setSetTwoA(patch.setTwoA);
    if (patch.setTwoB !== undefined) setSetTwoB(patch.setTwoB);
    if (patch.winner !== undefined) setWinner(patch.winner);
  }

  async function autoBookCourt() {
    setBookingLoading(true);
    const response = await fetch('/api/matches/' + id + '/book-court', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    const data = await response.json().catch(() => ({}));
    setBookingLoading(false);
    if (!response.ok) {
      setStatusMessage(data.error ?? 'Falha ao reservar quadra automaticamente. Use o link do Gripo.');
      return;
    }
    setBookedCourt(data.courtName ?? 'Confirmada');
    setStatusMessage(data.message ?? 'Quadra reservada com sucesso no Gripo!');
    await refresh();
  }

  async function refresh() {
    const request = ++latestRequest.current;
    const requestedId = id;
    const response = await fetch('/api/matches/' + id, { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!shouldApplyMatchResponse(request, latestRequest.current, requestedId, activeId.current)) return;
    if (!response.ok) {
      setError(data.error ?? 'Partida não encontrada.');
      setLoadingDetails(false);
      return;
    }
    const match = data.match as MatchDetails;
    const current = match.participants.find((participant) => participant.isCurrentPlayer);
    setDetails(match);
    if (match.bookedCourtName) {
      setBookedCourt(match.bookedCourtName);
    }
    setSubmitted(['result-pending', 'validated', 'disputed'].includes(match.status));
    setResultConfirmed(current?.confirmation === 'confirmed' || match.status === 'validated');
    setDisputed(current?.confirmation === 'disputed' || match.status === 'disputed');
    if (shouldApplyServerMatchDraft(draftDirty.current, match.status)) {
      const draft = matchDraftFromServer(match.sets, match.winner);
      setSetOneA(draft.setOneA);
      setSetOneB(draft.setOneB);
      setSetTwoA(draft.setTwoA);
      setSetTwoB(draft.setTwoB);
      setWinner(draft.winner);
    }
    if (!voteDirty.current) setVoteWinner(current?.resultWinner ?? match.winner ?? 'A');
    setLoadingDetails(false);
  }

  useEffect(() => {
    activeId.current = id;
    latestRequest.current += 1;
    draftDirty.current = false;
    voteDirty.current = false;
    setDetails(null);
    setLoadingDetails(true);
    setError('');
    setDeclineConfirmOpen(false);
    setDisputeConfirmOpen(false);
    setSetOneA(''); setSetOneB(''); setSetTwoA(''); setSetTwoB(''); setWinner('A'); setVoteWinner('A');
    setSubmitted(false); setResultConfirmed(false); setDisputed(false); setStatusMessage('');
    setBookedCourt(null); setBookingLoading(false); setAcceptanceLoading(false);
    setAttendanceLoading(false); setResultSubmitting(false); setConfirmingResult(false); setDisputingResult(false);
    const load = () => refresh().catch(() => {
      if (activeId.current === id) {
        setError('Não foi possível carregar a partida.');
        setLoadingDetails(false);
      }
    });
    void load();
    const interval = window.setInterval(() => { refresh().catch(() => undefined); }, 10000);
    return () => window.clearInterval(interval);
  }, [id]);

  async function decideAcceptance(decision: 'accept' | 'decline') {
    setAcceptanceLoading(true);
    try {
      const response = await fetch('/api/matches/' + id + '/acceptance', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? 'Não foi possível atualizar sua confirmação.');
        return;
      }
      setStatusMessage(data.message ?? 'Confirmação atualizada.');
      await refresh();
    } catch {
      setStatusMessage('Não foi possível atualizar sua confirmação. Tente novamente.');
    } finally {
      setAcceptanceLoading(false);
    }
  }

  async function submitResult() {
    setResultSubmitting(true);
    const response = await fetch('/api/matches/' + id + '/result', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sets: [
          { a: Number(setOneA), b: Number(setOneB) },
          { a: Number(setTwoA), b: Number(setTwoB) },
        ],
        winner,
      }),
    });
    const data = await response.json().catch(() => ({}));
    setResultSubmitting(false);
    if (!response.ok) return setStatusMessage(data.error ?? 'Não foi possível enviar o placar.');
    setStatusMessage('Resultado enviado. Agora cada jogador deve votar no vencedor que reconhece.');
    await refresh();
  }

  async function confirmResult() {
    setConfirmingResult(true);
    const response = await fetch('/api/matches/' + id + '/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'confirmed', winner: voteWinner }),
    });
    const data = await response.json().catch(() => ({}));
    setConfirmingResult(false);
    if (!response.ok) return setStatusMessage(data.error ?? 'Não foi possível registrar seu voto.');
    setResultConfirmed(true);
    setStatusMessage(
      data.status === 'validated'
        ? 'Partida validada. O MMR e a patente foram atualizados.'
        : data.status === 'disputed'
          ? 'Votos conflitantes. O MMR está bloqueado e o clube fará a análise.'
          : 'Voto registrado. Aguardando os outros jogadores.',
    );
    await refresh();
  }

  async function disputeResult() {
    setDisputingResult(true);
    try {
      const response = await fetch('/api/matches/' + id + '/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'disputed' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatusMessage(data.error ?? 'Não foi possível contestar o resultado.');
        return;
      }
      setDisputed(true);
      setStatusMessage('Contestação aberta. O MMR ficará bloqueado até a análise.');
      await refresh();
    } catch {
      setStatusMessage('Não foi possível contestar o resultado. Tente novamente.');
    } finally {
      setDisputingResult(false);
    }
  }

  async function markPresence() {
    setAttendanceLoading(true);
    const response = await fetch('/api/matches/' + id + '/attendance', { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    setAttendanceLoading(false);
    if (!response.ok) return setStatusMessage(data.error ?? 'Não foi possível registrar sua presença.');
    setStatusMessage('Presença informada. O clube ainda fará a confirmação final.');
    await refresh();
  }

  if (loadingDetails) {
    return <AppShell playerName=""><div className="mx-auto max-w-4xl py-20 text-center text-sm text-white/45">Carregando partida...</div></AppShell>;
  }
  if (error || !details) {
    return (
      <AppShell playerName="">
        <div className="mx-auto max-w-4xl space-y-5">
          <Link href="/matchmaking" className="flex w-fit items-center gap-2 text-xs font-bold text-white/40 hover:text-lime">
            <ArrowLeft size={15} /> Voltar para partidas
          </Link>
          <div className="glass rounded-2xl p-8 text-center">
            <p className="text-sm font-bold text-coral">{error || 'Partida não encontrada.'}</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const teamA = details.participants.filter((participant) => participant.team === 'A');
  const teamB = details.participants.filter((participant) => participant.team === 'B');
  const current = details.participants.find((participant) => participant.isCurrentPlayer);
  const matchLabel = details.mode === 'ranked' ? 'Partida ranqueada' : 'Partida amistosa';
  const resultLocked = details.status === 'cancelled' || details.status === 'no-show';
  const startsAt = new Date(details.startsAt);
  const matchEnd = new Date(startsAt.getTime() + details.durationMinutes * 60 * 1000);
  const resultDeadline = details.resultDeadlineAt ? new Date(details.resultDeadlineAt) : null;
  const resultWindowExpired = Boolean(resultDeadline && resultDeadline < new Date());
  const resultWindowOpen = new Date() >= matchEnd;
  const canSubmitResult = details.status === 'confirmed' && details.attendanceCount === 4 && resultWindowOpen && !resultWindowExpired && !resultLocked;
  const stateLabel = resultLocked
    ? details.status === 'no-show' ? 'Falta confirmada' : 'Partida cancelada'
    : disputed || details.status === 'disputed'
      ? 'Resultado em análise'
      : resultConfirmed || details.status === 'validated'
        ? 'Seu voto registrado'
          : submitted
            ? 'Resultado pendente'
              : details.status === 'confirming'
                ? `${details.acceptedCount}/4 aceitaram`
                : details.status === 'confirmed'
                  ? 'Partida confirmada'
          : 'Partida formada';
  const canVote = Boolean(current)
    && submitted
    && details.status === 'result-pending'
    && !resultConfirmed
    && current?.confirmation !== 'disputed'
    && !resultLocked;
  const nextAction = getMatchNextAction({
    status: details.status,
    startsAt: details.startsAt,
    durationMinutes: details.durationMinutes,
    resultDeadlineAt: details.resultDeadlineAt,
    acceptedCount: details.acceptedCount,
    attendanceCount: details.attendanceCount,
    now: new Date(),
    current: current ? {
      matchAcceptance: current.matchAcceptance,
      attendance: current.attendance,
      confirmation: current.confirmation,
    } : null,
  });

  return (
    <AppShell playerName={current?.name} playerInitials={current?.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}>
      <div className="mx-auto max-w-4xl space-y-7">
        <Link href="/matchmaking" className="flex w-fit items-center gap-2 text-xs font-bold text-white/40 hover:text-lime">
          <ArrowLeft size={15} /> Voltar para partidas
        </Link>

        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">{matchLabel} • confirmação</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.05em]">Partida presencial.</h1>
            <p className="mt-2 flex items-center gap-2 text-sm text-white/40">
              <MapPin size={14} /> {details.club}, {details.city}
              <span className="text-white/15">•</span>
              <CalendarDays size={14} /> {startsAt.toLocaleDateString('pt-BR')} às {startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span className={'flex items-center gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold ' + (details.status === 'disputed' || details.status === 'no-show' ? 'border-coral/20 bg-coral/[.06] text-coral' : 'border-lime/15 bg-lime/[.06] text-lime')}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> {stateLabel}
          </span>
        </section>

        <NextActionCard action={nextAction} />

        <section className="glass rounded-3xl p-5 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">Duplas da sala</p>
              <p className="mt-1 text-[11px] text-white/35">Os participantes e patentes vêm da sala persistida.</p>
            </div>
            <span className="rounded-lg bg-lime/10 px-2 py-1 text-[10px] font-bold text-lime">{details.mode === 'ranked' ? 'Ranqueada' : 'Amistosa'}</span>
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <Team name="Dupla A" players={teamA} active={current?.team === 'A'} />
            <div className="flex items-center justify-center gap-3 text-white/20">
              <span className="h-px w-10 bg-white/[.1] sm:w-16" />
              <span className="text-xs font-black">VS</span>
              <span className="h-px w-10 bg-white/[.1] sm:w-16" />
            </div>
            <Team name="Dupla B" players={teamB} active={current?.team === 'B'} opponent />
          </div>
          <div className="mt-8 grid gap-3 border-t border-white/[.07] pt-5 sm:grid-cols-3">
            <Meta icon={Clock3} label="Horário" value={startsAt.toLocaleDateString('pt-BR') + ' ' + startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} />
            <Meta icon={Users} label="Aceite da partida" value={details.acceptedCount + ' de 4 confirmaram'} />
            <Meta icon={ShieldCheck} label="Quadra" value={details.bookedCourtName || bookedCourt ? `Quadra: ${details.bookedCourtName || bookedCourt}` : 'Reservar no Gripo'} />
          </div>

          {/* Cartão destacado quando a quadra está reservada */}
          {details.bookingStatus === 'booked' && (
            <div className="mt-5 rounded-2xl border border-lime/30 bg-lime/[.07] p-4 text-white">
              <div className="flex items-center gap-2">
                <ShieldCheck className="text-lime" size={18} />
                <span className="text-xs font-bold uppercase tracking-wider text-lime">Quadra reservada</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-white">
                <span>{details.bookedCourtName || bookedCourt || 'Quadra confirmada'}</span>
                <span className="text-white/30">•</span>
                <span className="text-xs font-semibold text-white/70">
                  {startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} às {matchEnd.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {typeof details.bookingPriceCents === 'number' && (
                  <>
                    <span className="text-white/30">•</span>
                    <span className="text-xs font-semibold text-lime">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(details.bookingPriceCents / 100)}
                    </span>
                  </>
                )}
              </div>
              {details.bookingMessage && (
                <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-white/80">
                  {details.bookingMessage}
                </p>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                Cancelamento com menos de 4 horas de antecedência é cobrado no valor integral da locação. O pagamento é feito direto com o clube pelo link enviado na confirmação.
              </p>
            </div>
          )}

          {/* Mensagem quando reserva automática foi ignorada ou falhou */}
          {(details.bookingStatus === 'failed' || details.bookingStatus === 'skipped') && details.bookingMessage && (
            <div
              className={`mt-5 rounded-xl border p-3.5 text-xs leading-relaxed ${
                details.bookingStatus === 'failed'
                  ? 'border-coral/30 bg-coral/[.08] text-coral/90'
                  : 'border-amber-300/30 bg-amber-300/[.08] text-amber-200/90'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                <CircleAlert size={15} />
                <span>
                  {details.bookingStatus === 'failed'
                    ? 'Falha na reserva automática'
                    : 'Reserva automática ignorada'}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-white/70">{details.bookingMessage}</p>
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            {details.bookingStatus !== 'booked' && !bookedCourt && (
              <button
                onClick={autoBookCourt}
                disabled={bookingLoading}
                aria-busy={bookingLoading}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-lime/30 bg-lime/10 py-3 text-[11px] font-bold text-lime hover:bg-lime/20 disabled:opacity-50"
              >
                {bookingLoading ? 'Reservando...' : '⚡ Reservar Quadra (Gripo)'}
              </button>
            )}
            <a
              href={details.gripoUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center rounded-xl border border-cyan/20 bg-cyan/[.05] py-3 text-[11px] font-bold text-cyan hover:bg-cyan/10"
            >
              Abrir Gripo no Navegador
            </a>
          </div>
          {current && details.status === 'confirming' && !resultLocked && (
            <div id="participacao" tabIndex={-1} className="mt-4 scroll-mt-6 rounded-xl border border-amber-300/20 bg-amber-300/[.06] px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black text-amber-200">Confirme sua participação</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-white/40">A partida só fica confirmada quando os quatro jogadores aceitarem.</p>
                </div>
                <span className="shrink-0 text-[10px] font-black text-amber-200">{details.acceptedCount}/4</span>
              </div>
              {current.matchAcceptance === 'accepted' ? <p className="mt-3 flex items-center gap-1.5 text-[10px] font-black text-lime"><Check size={14} /> Você confirmou que vai jogar</p> : <div className="mt-3 flex gap-2"><button type="button" aria-haspopup="dialog" disabled={acceptanceLoading} aria-busy={acceptanceLoading} onClick={() => setDeclineConfirmOpen(true)} className="rounded-lg border border-white/[.1] px-3 py-2 text-[10px] font-bold text-white/45 hover:border-coral/30 hover:text-coral">Não posso ir</button><button disabled={acceptanceLoading} aria-busy={acceptanceLoading} onClick={() => decideAcceptance('accept')} className="rounded-lg bg-lime px-3 py-2 text-[10px] font-black text-ink">Vou jogar</button></div>}
            </div>
          )}
          {current && details.status === 'confirmed' && (
            <div id="presenca" tabIndex={-1} className="mt-4 flex scroll-mt-6 items-center justify-between gap-3 rounded-xl border border-lime/15 bg-lime/[.04] px-4 py-3">
              <div>
                <p className="text-[11px] font-bold text-white/70">Sua presença</p>
                <p className="mt-1 text-[10px] text-white/35">A partida só é liberada quando os quatro confirmarem que chegaram.</p>
              </div>
              {current.attendance === 'present' ? (
                <span className="flex items-center gap-1.5 text-[10px] font-black text-lime"><Check size={14} /> Presença confirmada</span>
              ) : current.attendance === 'claimed-present' ? (
                <span className="text-[10px] font-black text-cyan">Presença informada</span>
              ) : current.attendance === 'pending' ? (
                startsAt > new Date() ? <span className="text-right text-[10px] font-black text-white/35">Disponível no horário marcado</span> : <button disabled={attendanceLoading} onClick={markPresence} aria-busy={attendanceLoading} className="rounded-lg bg-lime/10 px-3 py-2 text-[10px] font-black text-lime hover:bg-lime/20">Estou na quadra</button>
              ) : (
                <span className="text-[10px] font-black text-coral">{current.attendance === 'absent' ? 'Falta confirmada' : 'Ausência abonada'}</span>
              )}
              <span className="text-[10px] font-black text-white/35">{details.attendanceCount}/4 presentes</span>
            </div>
          )}
          {current && details.status === 'confirmed' && details.attendanceCount < 4 && <p className="mt-3 text-[10px] text-amber-200/70">Aguardando os outros jogadores confirmarem que estão na quadra.</p>}
          {current && details.status === 'confirmed' && details.attendanceCount === 4 && !resultWindowOpen && <p className="mt-3 text-[10px] text-cyan/80">Os quatro chegaram. O resultado será liberado após o término previsto de {details.durationMinutes} minutos.</p>}
          {current && details.status === 'confirmed' && details.attendanceCount === 4 && resultWindowOpen && !resultWindowExpired && resultDeadline && <p className="mt-3 text-[10px] text-lime/80">Janela de resultado aberta até {resultDeadline.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.</p>}
        </section>

        <section className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div id="placar" tabIndex={-1} className="glass scroll-mt-6 rounded-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">Depois do jogo</p>
                <h2 className="mt-2 text-xl font-black">Informe o placar</h2>
            <p className="mt-1 text-xs text-white/35">O MMR só muda quando o resultado for validado pelos votos dos jogadores.</p>
              </div>
              <Swords size={19} className="text-cyan" />
            </div>
            <div className="mt-6 space-y-3">
              <ScoreRow label="1º set" a={setOneA} b={setOneB} setLeft={(value) => setDraft({ setOneA: value })} setRight={(value) => setDraft({ setOneB: value })} disabled={submitted || resultLocked} />
              <ScoreRow label="2º set" a={setTwoA} b={setTwoB} setLeft={(value) => setDraft({ setTwoA: value })} setRight={(value) => setDraft({ setTwoB: value })} disabled={submitted || resultLocked} />
            </div>
            <div className="mt-4 flex gap-2 rounded-xl border border-white/[.07] bg-white/[.025] p-1">
              <button disabled={submitted || resultLocked} aria-pressed={winner === 'A'} onClick={() => setDraft({ winner: 'A' })} className={'flex-1 rounded-lg py-2 text-[11px] font-bold disabled:opacity-50 ' + (winner === 'A' ? 'bg-lime/15 text-lime' : 'text-white/35')}>Vitória da dupla A</button>
              <button disabled={submitted || resultLocked} aria-pressed={winner === 'B'} onClick={() => setDraft({ winner: 'B' })} className={'flex-1 rounded-lg py-2 text-[11px] font-bold disabled:opacity-50 ' + (winner === 'B' ? 'bg-cyan/15 text-cyan' : 'text-white/35')}>Vitória da dupla B</button>
            </div>
            <button disabled={resultSubmitting || submitted || !canSubmitResult || !setOneA || !setOneB || !setTwoA || !setTwoB} aria-busy={resultSubmitting} onClick={submitResult} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-lime py-3.5 text-xs font-black text-ink disabled:opacity-50">
              {submitted ? <><Check size={15} /> Resultado enviado</> : resultLocked ? 'Partida encerrada por falta' : details.status !== 'confirmed' ? 'Aguardando aceite dos quatro' : details.attendanceCount < 4 ? 'Aguardando presença dos 4' : !resultWindowOpen ? 'Aguardando o fim do jogo' : resultWindowExpired ? 'Prazo para resultado encerrado' : <><Zap size={15} /> Enviar resultado</>}
            </button>
            {canVote && (
              <div id="votacao" tabIndex={-1} className="mt-5 scroll-mt-6 rounded-2xl border border-cyan/15 bg-cyan/[.04] p-4">
                <p className="text-xs font-black text-cyan">Qual resultado você confirma?</p>
                <p className="mt-2 text-[11px] leading-relaxed text-white/40">
                  {details.status === 'disputed'
                    ? 'A partida já está em análise. Você ainda pode registrar seu voto para que o clube veja a divergência completa.'
                    : 'Escolha a dupla vencedora. Se o seu voto divergir dos demais, a partida será enviada para análise e o MMR ficará bloqueado.'}
                </p>
                <div className="mt-4 flex gap-2">
                  <button aria-pressed={voteWinner === 'A'} onClick={() => { voteDirty.current = true; setVoteWinner('A'); }} className={'flex-1 rounded-xl py-2.5 text-[10px] font-black ' + (voteWinner === 'A' ? 'bg-lime/15 text-lime' : 'border border-white/[.08] text-white/40')}>Dupla A venceu</button>
                  <button aria-pressed={voteWinner === 'B'} onClick={() => { voteDirty.current = true; setVoteWinner('B'); }} className={'flex-1 rounded-xl py-2.5 text-[10px] font-black ' + (voteWinner === 'B' ? 'bg-cyan/15 text-cyan' : 'border border-white/[.08] text-white/40')}>Dupla B venceu</button>
                </div>
              </div>
            )}
            {submitted && (
              <button disabled={confirmingResult || resultConfirmed || current?.confirmation === 'disputed' || details.status === 'validated' || resultLocked} aria-busy={confirmingResult} onClick={confirmResult} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan/25 bg-cyan/[.06] py-3.5 text-xs font-black text-cyan disabled:opacity-50">
                {resultConfirmed ? <><Check size={15} /> Meu voto: dupla {current?.resultWinner ?? winner}</> : 'Confirmar voto: dupla ' + voteWinner}
              </button>
            )}
            {statusMessage && <p role="status" aria-live="polite" className="mt-4 rounded-xl border border-white/[.08] bg-white/[.03] p-3 text-center text-[11px] font-semibold text-white/55">{statusMessage}</p>}
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-lime/15 bg-lime/[.05] p-5">
              <div className="flex items-center gap-2 text-xs font-bold text-lime"><ShieldCheck size={15} /> Validação segura</div>
              <p className="mt-3 text-xs leading-relaxed text-white/45">São necessários pelo menos três votos, com pelo menos uma pessoa de cada dupla, e todos precisam apontar o mesmo vencedor.</p>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-lime/10 p-2"><p className="text-sm font-black text-lime">{details.resultVotes.A}</p><p className="mt-1 text-[9px] text-white/35">votos A</p></div>
                <div className="rounded-lg bg-cyan/10 p-2"><p className="text-sm font-black text-cyan">{details.resultVotes.B}</p><p className="mt-1 text-[9px] text-white/35">votos B</p></div>
                <div className="rounded-lg bg-white/[.05] p-2"><p className="text-sm font-black text-white/70">{details.resultVotes.pending}</p><p className="mt-1 text-[9px] text-white/35">pendentes</p></div>
              </div>
              {details.resultVotes.A > 0 && details.resultVotes.B > 0 && <p className="mt-3 text-[10px] font-bold text-coral">Há divergência: o MMR está bloqueado.</p>}
            </div>
            <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5">
              <div className="flex items-center gap-2 text-xs font-bold text-white/65"><MessageCircle size={15} className="text-cyan" /> Algo não bate?</div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">Conteste o resultado manualmente. Isso também bloqueia o MMR e envia a partida para o clube.</p>
              <button type="button" aria-haspopup="dialog" disabled={disputingResult || disputed || details.status === 'validated' || resultLocked} aria-busy={disputingResult} onClick={() => setDisputeConfirmOpen(true)} className={'mt-4 flex items-center gap-2 text-[11px] font-bold ' + (disputed ? 'text-coral' : 'text-white/45 hover:text-coral')}>
                {disputed ? <><CircleAlert size={14} /> Análise aberta</> : <><X size={14} /> Contestar resultado</>}
              </button>
            </div>
          </aside>
        </section>
      </div>

      <ConfirmDialog
        open={declineConfirmOpen}
        title="Recusar esta partida?"
        description="Sua presença não será confirmada nesta partida."
        confirmLabel="Recusar partida"
        cancelLabel="Voltar"
        onCancel={() => setDeclineConfirmOpen(false)}
        onConfirm={() => { setDeclineConfirmOpen(false); void decideAcceptance('decline'); }}
        loading={acceptanceLoading}
      />

      <ConfirmDialog
        open={disputeConfirmOpen}
        title="Contestar o resultado?"
        description="O MMR ficará bloqueado até a análise do clube."
        confirmLabel="Contestar resultado"
        cancelLabel="Voltar"
        onCancel={() => setDisputeConfirmOpen(false)}
        onConfirm={() => { setDisputeConfirmOpen(false); void disputeResult(); }}
        loading={disputingResult}
      />
    </AppShell>
  );
}

function NextActionCard({ action }: { action: ReturnType<typeof getMatchNextAction> }) {
  const tones = {
    lime: { card: 'border-lime/20 bg-lime/[.055]', label: 'text-lime', cta: 'bg-lime text-ink hover:bg-lime-300' },
    cyan: { card: 'border-cyan/20 bg-cyan/[.05]', label: 'text-cyan', cta: 'bg-cyan text-ink hover:bg-cyan/90' },
    amber: { card: 'border-amber-300/20 bg-amber-300/[.05]', label: 'text-amber-200', cta: 'bg-amber-300 text-ink hover:bg-amber-200' },
    coral: { card: 'border-coral/20 bg-coral/[.05]', label: 'text-coral', cta: 'bg-coral text-ink hover:bg-coral/90' },
    neutral: { card: 'border-white/[.08] bg-white/[.025]', label: 'text-soft', cta: 'border border-white/[.12] text-white/80 hover:text-white' },
  };
  const tone = tones[action.tone];

  return (
    <section aria-labelledby="match-next-action-title" className={`rounded-2xl border p-5 ${tone.card}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={`eyebrow ${tone.label}`}>Próxima ação</p>
          <h2 id="match-next-action-title" className="mt-2 text-xl font-black tracking-[-.03em]">{action.title}</h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-soft">{action.detail}</p>
        </div>
        {action.cta && (
          <a
            href={`#${action.cta.targetId}`}
            onClick={(event) => {
              const target = document.getElementById(action.cta!.targetId);
              if (!target) return;
              event.preventDefault();
              target.scrollIntoView({ block: 'start' });
              target.focus({ preventScroll: true });
              window.history.replaceState(null, '', `#${action.cta!.targetId}`);
            }}
            className={`flex shrink-0 items-center justify-center rounded-xl px-4 py-3 text-xs font-black transition ${tone.cta}`}
          >
            {action.cta.label}
          </a>
        )}
      </div>
    </section>
  );
}

function Team({ name, players, active = false, opponent = false }: { name: string; players: MatchDetails['participants']; active?: boolean; opponent?: boolean }) {
  const first = players[0];
  const tone = active ? 'border-lime/15 bg-lime/[.05]' : opponent ? 'border-white/[.08] bg-white/[.025]' : 'border-cyan/15 bg-cyan/[.04]';
  return (
    <div className={'flex items-center gap-4 rounded-2xl border p-4 ' + tone}>
      <RankEmblem label={first?.tier ?? '5ª III'} size="sm" accent={active ? 'cyan' : opponent ? 'gold' : 'violet'} />
      <div className="min-w-0">
        <p className="text-sm font-black text-white/80">{name}</p>
        <p className="mt-1 truncate text-[10px] text-white/35">{players.map((player) => player.isCurrentPlayer ? player.name + ' (você)' : player.name).join(' / ') || 'Aguardando jogadores'}</p>
        <p className="mt-2 text-[10px] font-bold text-cyan">{first?.tier ?? 'Nível em definição'}</p>
      </div>
    </div>
  );
}

function Meta({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="flex items-center gap-3"><Icon size={15} className="text-white/35" /><div><p className="text-[10px] text-white/25">{label}</p><p className="mt-1 text-[11px] font-bold text-white/65">{value}</p></div></div>;
}

function ScoreRow({ label, a, b, setLeft, setRight, disabled = false }: { label: string; a: string; b: string; setLeft: (value: string) => void; setRight: (value: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3">
      <span className="w-16 text-[11px] font-bold text-white/45">{label}</span>
      <input aria-label={`${label}: games dupla A`} disabled={disabled} value={a} onChange={(event) => setLeft(event.target.value.replace(/\D/g, '').slice(0, 2))} className="w-16 rounded-lg border border-white/[.08] bg-black/20 px-3 py-2 text-center text-sm font-black text-white outline-none focus:border-lime/40 disabled:opacity-50" />
      <span className="text-white/20">×</span>
      <input aria-label={`${label}: games dupla B`} disabled={disabled} value={b} onChange={(event) => setRight(event.target.value.replace(/\D/g, '').slice(0, 2))} className="w-16 rounded-lg border border-white/[.08] bg-black/20 px-3 py-2 text-center text-sm font-black text-white outline-none focus:border-lime/40 disabled:opacity-50" />
      <span className="ml-auto text-[10px] text-white/25">games dupla A / dupla B</span>
    </div>
  );
}
