'use client';

import { Clock3, Swords, X } from 'lucide-react';
import { useState } from 'react';
import type { CourtSide, MatchChallenge } from '@/lib/types';

export function DirectChallengeInbox({ challenges, onChange, onNotice }: { challenges: MatchChallenge[]; onChange: (challenges: MatchChallenge[]) => void; onNotice: (message: string) => void }) {
  const [loadingId, setLoadingId] = useState('');
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { startsAt: string; side: CourtSide }>>({});

  function draftFor(challenge: MatchChallenge) {
    return drafts[challenge.id] ?? { startsAt: localDateTimeValue(challenge.startsAt), side: challenge.mySidePreference };
  }

  function updateDraft(challenge: MatchChallenge, patch: Partial<{ startsAt: string; side: CourtSide }>) {
    setDrafts((current) => ({ ...current, [challenge.id]: { ...draftFor(challenge), ...patch } }));
  }

  async function decide(challenge: MatchChallenge, decision: 'accept' | 'decline' | 'suggest' | 'cancel') {
    const draft = draftFor(challenge);
    let startsAt: string | undefined;
    if (decision === 'suggest') {
      const suggested = new Date(draft.startsAt);
      if (!draft.startsAt || Number.isNaN(suggested.getTime()) || suggested <= new Date()) return setError('Escolha um novo horário futuro antes de enviar a sugestão.');
      startsAt = suggested.toISOString();
    }
    setLoadingId(challenge.id);
    setError('');
    const response = await fetch(`/api/matchmaking/challenges/${challenge.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision, startsAt, sidePreference: draft.side }) }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setLoadingId('');
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível responder ao desafio.');
    if (data.matchId) return window.location.assign(`/match/${data.matchId}`);
    const nextChallenges = (data.challenges ?? []) as MatchChallenge[];
    setDrafts((current) => {
      const next = { ...current };
      for (const item of nextChallenges) if (next[item.id]) next[item.id] = { startsAt: localDateTimeValue(item.startsAt), side: item.mySidePreference };
      return next;
    });
    onChange(nextChallenges);
    onNotice(data.message ?? 'Desafio atualizado.');
  }

  return <section className="rounded-3xl border border-cyan/20 bg-cyan/[.045] p-5 sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-cyan/10 text-cyan"><Swords size={17} /></span><div><p className="eyebrow text-cyan">Desafios diretos</p><h2 className="mt-1 text-sm font-black text-white/85">Partidas escolhidas entre jogadores</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-white/40">O desafio não cria uma sala pública. A partida só é criada quando os quatro aceitam; depois ela segue o mesmo fluxo de presença, resultado e MMR.</p></div></div><span className="rounded-xl border border-cyan/20 bg-cyan/10 px-3 py-2 text-[10px] font-black text-cyan">{challenges.length} pendente{challenges.length === 1 ? '' : 's'}</span></div><div className="mt-5 space-y-4">{challenges.map((challenge) => { const draft = draftFor(challenge); const creatorView = challenge.direction === 'outgoing'; const currentMember = challenge.participants.find((member) => member.isCurrentPlayer); const ownTeam = challenge.participants.filter((member) => member.team === currentMember?.team); const opponentTeam = challenge.participants.filter((member) => member.team !== currentMember?.team); const canAccept = challenge.myAcceptance !== 'accepted'; const showEditor = !creatorView || canAccept; return <article key={challenge.id} className="rounded-2xl border border-white/[.08] bg-black/10 p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><span className="text-xs font-black text-white/80">{creatorView ? 'Desafio enviado' : 'Você recebeu um desafio'}</span><span className="rounded-lg bg-white/[.06] px-2 py-1 text-[9px] font-black text-white/40">{challenge.mode === 'ranked' ? 'RANQUEADA' : 'AMISTOSA'}</span></div><p className="mt-2 text-[11px] text-white/45">{formatChallengeDateTime(challenge.startsAt)} • {challenge.club}, {challenge.city}</p></div><span className="rounded-lg border border-white/[.08] px-2 py-1 text-[10px] font-black text-white/45">{challenge.acceptedCount}/4 aceites</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2"><ChallengeTeam label="Sua dupla" members={ownTeam} highlight /><ChallengeTeam label="Dupla adversária" members={opponentTeam} /></div>{showEditor && <div className="mt-4 grid gap-3 border-t border-white/[.07] pt-4 lg:grid-cols-[1fr_1fr]"><label className="block"><span className="mb-2 block text-[10px] font-bold text-white/40">{creatorView ? 'Novo horário sugerido' : 'Horário proposto ou alternativa'}</span><span className="flex items-center gap-2 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><Clock3 size={14} className="text-cyan" /><input type="datetime-local" value={draft.startsAt} onChange={(event) => updateDraft(challenge, { startsAt: event.target.value })} className="w-full bg-transparent text-xs text-white outline-none" /></span></label><div><span className="mb-2 block text-[10px] font-bold text-white/40">Seu lado da quadra</span><SideSelector value={draft.side} onChange={(side) => updateDraft(challenge, { side })} /></div></div>}<div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] leading-relaxed text-white/30">{creatorView ? canAccept ? 'Um novo horário foi sugerido. Aceite para confirmar sua participação.' : 'Os outros três jogadores recebem uma notificação para aceitar.' : challenge.myAcceptance === 'accepted' ? 'Seu aceite já foi registrado. Aguardando os outros jogadores.' : 'Você pode aceitar o horário ou sugerir uma alternativa.'}</p><div className="flex flex-wrap gap-2">{creatorView ? <>{canAccept && <button disabled={loadingId === challenge.id} onClick={() => decide(challenge, 'accept')} className="rounded-lg bg-lime px-3 py-2 text-[10px] font-black text-ink">Aceitar novo horário</button>}<button disabled={loadingId === challenge.id} onClick={() => decide(challenge, 'cancel')} className="rounded-lg border border-white/[.1] px-3 py-2 text-[10px] font-bold text-white/45 hover:border-coral/30 hover:text-coral">{loadingId === challenge.id ? 'Cancelando...' : 'Cancelar desafio'}</button></> : <>{canAccept && <button disabled={loadingId === challenge.id} onClick={() => decide(challenge, 'decline')} className="rounded-lg border border-white/[.1] px-3 py-2 text-[10px] font-bold text-white/45 hover:border-coral/30 hover:text-coral">Recusar</button>}{canAccept && <button disabled={loadingId === challenge.id} onClick={() => decide(challenge, 'accept')} className="rounded-lg bg-lime px-3 py-2 text-[10px] font-black text-ink">Aceitar desafio</button>}<button disabled={loadingId === challenge.id} onClick={() => decide(challenge, 'suggest')} className="rounded-lg border border-cyan/25 bg-cyan/[.06] px-3 py-2 text-[10px] font-black text-cyan hover:bg-cyan/10">Sugerir horário</button></>}</div></div></article>; })}</div>{error && <p className="mt-4 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}</section>;
}

function ChallengeTeam({ label, members, highlight }: { label: string; members: MatchChallenge['participants']; highlight?: boolean }) {
  return <div className={`rounded-xl border p-3 ${highlight ? 'border-lime/20 bg-lime/[.04]' : 'border-white/[.07] bg-white/[.02]'}`}><p className="text-[10px] font-black uppercase tracking-[.14em] text-white/30">{label}</p><div className="mt-2 space-y-2">{members.map((member) => <div key={member.id} className="flex items-center gap-2"><span className="grid h-6 w-6 place-items-center rounded-lg bg-white/[.08] text-[8px] font-black text-white/60">{initials(member.name)}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-white/70">{member.name}</span><span className="block truncate text-[10px] text-white/30">{member.handle} • {sideLabel(member.sidePreference)}</span></span><span className={`text-[9px] font-black ${member.acceptance === 'accepted' ? 'text-lime' : member.acceptance === 'declined' ? 'text-coral' : 'text-amber-200'}`}>{member.acceptance === 'accepted' ? 'ACEITO' : member.acceptance === 'declined' ? 'RECUSOU' : 'PENDENTE'}</span></div>)}</div></div>;
}

function SideSelector({ value, onChange }: { value: CourtSide; onChange: (value: CourtSide) => void }) {
  return <div className="grid grid-cols-3 gap-2">{(['left', 'right', 'any'] as const).map((side) => <button key={side} type="button" onClick={() => onChange(side)} className={`rounded-xl border px-3 py-2.5 text-[11px] font-black ${value === side ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-white/[.1] bg-white/[.03] text-white/45 hover:border-white/20 hover:text-white'}`}>{sideLabel(side)}</button>)}</div>;
}

function initials(name: string) {
  return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function sideLabel(side: CourtSide) {
  if (side === 'left') return 'Esquerda';
  if (side === 'right') return 'Direita';
  return 'Tanto faz';
}

function formatChallengeDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
}

function localDateTimeValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

