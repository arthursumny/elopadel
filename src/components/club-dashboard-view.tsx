'use client';

import { Ban, Building2, Check, CircleAlert, Clock3, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import { Brand } from '@/components/app-shell';
import { SignOutButton } from '@/components/sign-out-button';

type PendingMembership = {
  id: string;
  name: string;
  phone: string;
  city: string;
  state: string;
  createdAt: string | Date;
};

type DisputedMatch = {
  id: string;
  startsAt: string;
  winner: 'A' | 'B' | null;
  sets: Array<{ a: number; b: number }>;
  resultVotes: { A: number; B: number; pending: number; disputed: number };
  votes: Array<{ name: string; team: 'A' | 'B'; confirmation: string; winner: 'A' | 'B' | null }>;
};

type AttendanceMatch = {
  id: string;
  startsAt: string;
  status: string;
  mode: string;
  winner: 'A' | 'B' | null;
  sets: Array<{ a: number; b: number }>;
  participants: Array<{ userId: string; name: string; team: 'A' | 'B'; attendance: string }>;
};

export function ClubDashboardView({
  club,
  initialMemberships,
  initialDisputedMatches,
  initialAttendanceMatches,
}: {
  club: { name: string; city: string; state: string } | null;
  initialMemberships: PendingMembership[];
  initialDisputedMatches: DisputedMatch[];
  initialAttendanceMatches: AttendanceMatch[];
}) {
  const [memberships, setMemberships] = useState(initialMemberships);
  const [disputedMatches, setDisputedMatches] = useState(initialDisputedMatches);
  const [attendanceMatches, setAttendanceMatches] = useState(initialAttendanceMatches);
  const [selectedAbsences, setSelectedAbsences] = useState<Record<string, string[]>>({});
  const [busyMatchId, setBusyMatchId] = useState('');
  const [message, setMessage] = useState('');

  async function decideMembership(id: string, decision: 'approved' | 'rejected') {
    const response = await fetch('/api/club/memberships/' + id + '/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setMessage(data.error ?? 'Não foi possível registrar a decisão.');
    setMemberships((current) => current.filter((membership) => membership.id !== id));
    setMessage(decision === 'approved' ? 'Vínculo aprovado.' : 'Solicitação recusada.');
  }

  async function decideMatch(id: string, decision: 'keep' | 'retry' | 'cancel') {
    setBusyMatchId(id);
    const response = await fetch('/api/club/matches/' + id + '/decision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision }),
    });
    const data = await response.json().catch(() => ({}));
    setBusyMatchId('');
    if (!response.ok) return setMessage(data.error ?? 'Não foi possível decidir sobre a partida.');
    setDisputedMatches((current) => current.filter((match) => match.id !== id));
    setMessage(
      decision === 'keep'
        ? 'Resultado mantido. Os jogadores precisarão votar novamente.'
        : decision === 'retry'
          ? 'Novo placar solicitado. A partida voltou para confirmação.'
          : 'Partida cancelada sem alteração no MMR.',
    );
  }

  function toggleAbsence(matchId: string, userId: string, checked: boolean) {
    setSelectedAbsences((current) => ({
      ...current,
      [matchId]: checked
        ? [...(current[matchId] ?? []), userId]
        : (current[matchId] ?? []).filter((id) => id !== userId),
    }));
  }

  async function decideAttendance(id: string, decision: 'confirm-no-show' | 'all-present' | 'excuse') {
    const selected = selectedAbsences[id] ?? [];
    if (decision !== 'all-present' && selected.length === 0) {
      return setMessage('Selecione ao menos um jogador para registrar a decisão.');
    }
    setBusyMatchId(id);
    const response = await fetch('/api/club/matches/' + id + '/attendance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ decision, absentUserIds: selected }),
    });
    const data = await response.json().catch(() => ({}));
    setBusyMatchId('');
    if (!response.ok) return setMessage(data.error ?? 'Não foi possível registrar o comparecimento.');
    setAttendanceMatches((current) => current.filter((match) => match.id !== id));
    setSelectedAbsences((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });

    if (decision === 'confirm-no-show') {
      const totalLoss = (data.penalties ?? []).reduce(
        (sum: number, penalty: { mmrLoss: number }) => sum + penalty.mmrLoss,
        0,
      );
      setMessage(
        totalLoss > 0
          ? 'Não comparecimento confirmado. O(s) jogador(es) perdeu(ram) ' + totalLoss + ' MMR e receberam suspensão ranqueada.'
          : 'Não comparecimento confirmado. O(s) jogador(es) receberam suspensão ranqueada; partidas amistosas não alteram MMR.',
      );
    } else if (decision === 'excuse') {
      setMessage('Ausência abonada. Nenhum MMR foi alterado e a partida foi cancelada.');
    } else {
      setMessage('Comparecimento confirmado. A partida pode seguir para o resultado.');
    }
  }

  return (
    <main className="app-gradient min-h-screen px-5 py-8 sm:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-white/[.07] pb-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <Brand href="/club" />
              <div className="mt-6 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan/15 text-cyan">
                  <Building2 size={19} aria-hidden="true" />
                </span>
                <p className="eyebrow">Área do clube</p>
              </div>
              <h1 className="mt-4 text-3xl font-black tracking-[-.05em]">{club?.name ?? 'Clube'}</h1>
              <p className="mt-2 text-sm text-soft">
                {club ? club.city + ', ' + club.state : 'Clube não encontrado'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-xl border border-cyan/15 bg-cyan/[.05] px-3 py-2 text-xs font-bold text-cyan">
                Decisões do clube
              </span>
              <SignOutButton redirectTo="/club/login" />
            </div>
          </div>
        </header>

        <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_300px]">
          <div className="space-y-5">
            <div className="glass rounded-2xl p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Solicitações de vínculo</p>
                  <p className="mt-1 text-[11px] text-meta">
                    Jogadores criam as próprias contas e aguardam a decisão do clube.
                  </p>
                </div>
                <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-[11px] font-bold text-amber-300">
                  {memberships.length} pendentes
                </span>
              </div>
              {memberships.length === 0 ? (
                <div className="py-12 text-center">
                  <Clock3 className="mx-auto text-white/35" size={25} />
                  <p className="mt-4 text-sm font-bold text-white/70">Nenhuma solicitação pendente.</p>
                  <p className="mt-2 text-xs text-meta">
                    Quando um jogador escolher seu clube, a solicitação aparecerá aqui.
                  </p>
                </div>
              ) : (
                <div className="mt-6 divide-y divide-white/[.06]">
                  {memberships.map((membership) => (
                    <div key={membership.id} className="flex flex-col gap-4 py-4 first:pt-0 sm:flex-row sm:items-center">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[.07] text-xs font-bold text-white/60">
                        {membership.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-white/75">{membership.name}</p>
                        <p className="mt-1 text-[11px] text-meta">
                          {membership.phone} • {membership.city}, {membership.state}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => decideMembership(membership.id, 'approved')} className="flex items-center gap-1.5 rounded-lg bg-lime/10 px-3 py-2 text-[11px] font-black text-lime hover:bg-lime/20">
                          <Check size={13} /> Aprovar
                        </button>
                        <button onClick={() => decideMembership(membership.id, 'rejected')} className="flex items-center gap-1.5 rounded-lg bg-coral/10 px-3 py-2 text-[11px] font-black text-coral hover:bg-coral/20">
                          <X size={13} /> Recusar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="glass rounded-2xl p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Comparecimento pendente</p>
                  <p className="mt-1 text-[11px] text-meta">
                    Depois do horário marcado, o clube confirma quem esteve na quadra.
                  </p>
                </div>
                <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-[11px] font-bold text-amber-300">
                  {attendanceMatches.length} partidas
                </span>
              </div>
              {attendanceMatches.length === 0 ? (
                <div className="py-12 text-center">
                  <Check className="mx-auto text-lime/60" size={25} />
                  <p className="mt-4 text-sm font-bold text-white/70">Nenhuma presença aguardando decisão.</p>
                  <p className="mt-2 text-xs text-meta">
                    O painel exibirá partidas atrasadas sem confirmação de presença.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {attendanceMatches.map((match) => {
                    const selected = selectedAbsences[match.id] ?? [];
                    return (
                      <div key={match.id} className="rounded-2xl border border-amber-300/15 bg-amber-300/[.04] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                              <ShieldAlert size={14} /> Verificação de presença
                            </div>
                            <p className="mt-2 text-xs font-bold text-white/75">
                              {new Date(match.startsAt).toLocaleDateString('pt-BR')} às{' '}
                              {new Date(match.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="mt-1 text-[11px] text-meta">
                              Marque apenas quem realmente não compareceu. A decisão gera punição automática.
                            </p>
                          </div>
                          <span className="rounded-lg bg-white/[.05] px-2 py-1 text-[11px] font-bold text-white/45">
                            {match.mode === 'ranked' ? 'Ranqueada' : 'Amistosa'}
                          </span>
                        </div>
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                          {match.participants.map((participant) => {
                            const selectable = ['pending', 'claimed-present'].includes(participant.attendance);
                            return (
                              <label key={participant.userId} className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-black/10 px-3 py-2.5">
                                <input
                                  type="checkbox"
                                  disabled={!selectable || busyMatchId === match.id}
                                  checked={selected.includes(participant.userId)}
                                  onChange={(event) => toggleAbsence(match.id, participant.userId, event.target.checked)}
                                  className="h-4 w-4 accent-coral"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[11px] font-semibold text-white/65">
                                    {participant.name} <span className="text-meta">(dupla {participant.team})</span>
                                  </span>
                                  <span className={'mt-1 block text-[11px] font-bold ' + attendanceTone(participant.attendance)}>
                                    {attendanceLabel(participant.attendance)}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                          <button disabled={busyMatchId === match.id} onClick={() => decideAttendance(match.id, 'all-present')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-lime/10 px-3 py-2.5 text-[11px] font-black text-lime hover:bg-lime/20 disabled:opacity-50">
                            <Check size={13} /> Todos compareceram
                          </button>
                          <button disabled={busyMatchId === match.id || selected.length === 0} onClick={() => decideAttendance(match.id, 'confirm-no-show')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-coral/10 px-3 py-2.5 text-[11px] font-black text-coral hover:bg-coral/20 disabled:opacity-50">
                            <Ban size={13} /> Confirmar falta
                          </button>
                          <button disabled={busyMatchId === match.id || selected.length === 0} onClick={() => decideAttendance(match.id, 'excuse')} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[.08] px-3 py-2.5 text-[11px] font-black text-white/45 hover:text-white disabled:opacity-50">
                            Abonar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="glass rounded-2xl p-5 sm:p-7">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">Resultados em análise</p>
                  <p className="mt-1 text-[11px] text-meta">Divergências entre os votos ficam bloqueadas e não alteram o MMR.</p>
                </div>
                <span className="rounded-lg bg-coral/10 px-2 py-1 text-[11px] font-bold text-coral">{disputedMatches.length} bloqueadas</span>
              </div>
              {disputedMatches.length === 0 ? (
                <div className="py-12 text-center">
                  <Check className="mx-auto text-lime/60" size={25} />
                  <p className="mt-4 text-sm font-bold text-white/70">Nenhum resultado aguardando análise.</p>
                  <p className="mt-2 text-xs text-meta">Partidas com votos diferentes aparecerão aqui.</p>
                </div>
              ) : (
                <div className="mt-6 space-y-4">
                  {disputedMatches.map((match) => (
                    <div key={match.id} className="rounded-2xl border border-coral/15 bg-coral/[.04] p-4">
                      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                        <div>
                          <div className="flex items-center gap-2 text-xs font-bold text-coral"><CircleAlert size={14} /> Voto divergente</div>
                          <p className="mt-2 text-xs font-bold text-white/75">
                            {new Date(match.startsAt).toLocaleDateString('pt-BR')} às{' '}
                            {new Date(match.startsAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          <p className="mt-1 text-[11px] text-meta">
                            Placar enviado: {match.sets.length ? match.sets.map((set) => String(set.a) + '×' + String(set.b)).join(' • ') : 'não informado'}
                            {match.winner ? ' • Vitória da dupla ' + match.winner : ''}
                          </p>
                        </div>
                        <div className="flex gap-2 text-[11px] font-black">
                          <span className="rounded-lg bg-lime/10 px-2 py-1 text-lime">A: {match.resultVotes.A}</span>
                          <span className="rounded-lg bg-cyan/10 px-2 py-1 text-cyan">B: {match.resultVotes.B}</span>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {match.votes.map((vote) => (
                          <div key={match.id + '-' + vote.name} className="flex items-center justify-between rounded-xl border border-white/[.07] bg-black/10 px-3 py-2">
                            <span className="truncate text-[11px] font-semibold text-white/60">
                              {vote.name} <span className="text-meta">(dupla {vote.team})</span>
                            </span>
                            <span className={'ml-2 shrink-0 text-[11px] font-black ' + voteTone(vote)}>
                              {vote.confirmation === 'disputed' ? 'Contestou' : vote.winner ? 'Votou ' + vote.winner : 'Sem voto'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button disabled={busyMatchId === match.id} onClick={() => decideMatch(match.id, 'keep')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-lime/10 px-3 py-2.5 text-[11px] font-black text-lime hover:bg-lime/20 disabled:opacity-50">
                          <Check size={13} /> Manter e reconfirmar
                        </button>
                        <button disabled={busyMatchId === match.id} onClick={() => decideMatch(match.id, 'retry')} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan/10 px-3 py-2.5 text-[11px] font-black text-cyan hover:bg-cyan/20 disabled:opacity-50">
                          <RefreshCw size={13} /> Pedir novo placar
                        </button>
                        <button disabled={busyMatchId === match.id} onClick={() => decideMatch(match.id, 'cancel')} className="flex items-center justify-center gap-1.5 rounded-xl bg-coral/10 px-3 py-2.5 text-[11px] font-black text-coral hover:bg-coral/20 disabled:opacity-50">
                          <Ban size={13} /> Cancelar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-cyan/15 bg-cyan/[.05] p-5">
              <p className="eyebrow text-cyan">Acesso separado</p>
              <p className="mt-3 text-sm font-bold text-white/80">O clube não é uma conta de jogador.</p>
              <p className="mt-2 text-xs leading-relaxed text-soft">Este acesso serve para decisões de vínculo, comparecimento e resultados conflitantes.</p>
            </div>
            <div className="rounded-2xl border border-coral/15 bg-coral/[.04] p-5">
              <p className="eyebrow text-coral">Política de no-show</p>
              <p className="mt-3 text-xs leading-relaxed text-white/45">
                Em ranqueadas, a primeira falta confirmada remove 100 MMR, 25 pontos e suspende o acesso por 24 horas.
                Reincidências aumentam até 30 dias; amistosas não alteram MMR.
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.08] bg-white/[.025] p-5">
              <p className="text-xs font-bold text-white/65">Regra do resultado</p>
              <p className="mt-2 text-xs leading-relaxed text-meta">
                São necessários pelo menos três votos, com um de cada dupla, apontando o mesmo vencedor.
                Um voto contrário bloqueia o MMR até a análise.
              </p>
            </div>
          </aside>
        </section>

        {message && <p role="status" aria-live="polite" className="mt-5 rounded-xl border border-cyan/15 bg-cyan/[.05] p-3 text-sm font-semibold text-cyan">{message}</p>}
      </div>
    </main>
  );
}

function attendanceLabel(value: string) {
  if (value === 'present') return 'Presença confirmada pelo clube';
  if (value === 'claimed-present') return 'Presença informada pelo jogador';
  if (value === 'absent') return 'Falta confirmada';
  if (value === 'excused') return 'Ausência abonada';
  return 'Ainda sem confirmação';
}

function attendanceTone(value: string) {
  if (value === 'present') return 'text-lime';
  if (value === 'absent') return 'text-coral';
  if (value === 'claimed-present') return 'text-cyan';
  return 'text-amber-300';
}

function voteTone(vote: DisputedMatch['votes'][number]) {
  if (vote.confirmation === 'disputed') return 'text-coral';
  if (vote.winner === 'A') return 'text-lime';
  if (vote.winner === 'B') return 'text-cyan';
  return 'text-meta';
}
