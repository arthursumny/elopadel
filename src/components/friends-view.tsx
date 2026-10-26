'use client';

import Link from 'next/link';
import { Check, Clipboard, Compass, Search, ShieldCheck, UserPlus, UsersRound, X } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/app-shell';
import type { Friend, FriendRequest, MatchmakingPlayerOption } from '@/lib/types';

export function FriendsView({ initialFriends, initialRequests, playerName, playerInitials, playerHandle }: { initialFriends: Friend[]; initialRequests: FriendRequest[]; playerName: string; playerInitials: string; playerHandle: string }) {
  const [friends, setFriends] = useState(initialFriends);
  const [requests, setRequests] = useState(initialRequests);
  const [results, setResults] = useState<MatchmakingPlayerOption[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [workingId, setWorkingId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function refreshFriends() {
    const response = await fetch('/api/friends', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json().catch(() => ({}));
    setFriends(data.friends ?? []);
    setRequests(data.requests ?? []);
  }

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    setError('');
    if (value.length < 2) return setError('Digite pelo menos 2 caracteres para buscar.');
    setSearching(true);
    const response = await fetch(`/api/players/search?q=${encodeURIComponent(value)}`, { cache: 'no-store' }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setSearching(false);
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível buscar jogadores.');
    setResults(data.players ?? []);
    if ((data.players ?? []).length === 0) setNotice('Nenhum jogador ativo encontrado com esse nome ou @handle.');
  }

  async function addFriend(player: MatchmakingPlayerOption) {
    setWorkingId(player.id);
    setError('');
    const response = await fetch('/api/friends', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: player.id }) }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setWorkingId('');
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível enviar a solicitação.');
    setNotice(data.message ?? 'Solicitação enviada.');
    await refreshFriends();
    setResults((current) => current.map((item) => item.id === player.id ? { ...item, relationship: data.status === 'accepted' ? 'accepted' : 'pending' } : item));
  }

  async function decide(request: FriendRequest, decision: 'accept' | 'decline') {
    setWorkingId(request.id);
    setError('');
    const response = await fetch(`/api/friends/${request.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setWorkingId('');
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível responder à solicitação.');
    setNotice(decision === 'accept' ? `${request.displayName} agora está nos seus amigos.` : 'Solicitação recusada.');
    await refreshFriends();
  }

  async function removeFriend(friend: Friend) {
    if (!window.confirm(`Remover ${friend.displayName} dos seus amigos?`)) return;
    setWorkingId(friend.friendshipId);
    setError('');
    const response = await fetch(`/api/friends/${friend.friendshipId}`, { method: 'DELETE' }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setWorkingId('');
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível remover a amizade.');
    setFriends((current) => current.filter((item) => item.friendshipId !== friend.friendshipId));
    setNotice('Amizade removida.');
  }

  async function copyHandle() {
    await navigator.clipboard?.writeText(playerHandle);
    setNotice(`${playerHandle} copiado para compartilhar.`);
  }

  return <AppShell playerName={playerName} playerInitials={playerInitials}>
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><p className="eyebrow">Comunidade competitiva</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">Encontre seus parceiros.</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-white/40">Adicione jogadores pelo nome ou @handle e convide seus amigos para formar uma dupla no saguão.</p></div><Link href="/matchmaking" className="flex items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-xs font-black text-ink"><Compass size={15} /> Encontrar partida</Link></section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <div className="glass rounded-3xl p-5 sm:p-7"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime"><Search size={18} /></span><div><p className="text-sm font-black">Buscar jogador</p><p className="mt-1 text-xs text-white/35">Use o nome de exibição ou o identificador público. Telefones nunca aparecem na busca.</p></div></div><form onSubmit={search} className="mt-6 flex gap-2"><label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3 focus-within:border-lime/35"><Search size={15} className="shrink-0 text-white/30" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: @marina ou Marina Silva" className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" /></label><button disabled={searching} className="rounded-xl bg-white/[.09] px-4 text-xs font-black text-white/80 hover:bg-lime hover:text-ink disabled:opacity-50">{searching ? 'Buscando...' : 'Buscar'}</button></form>{error && <p className="mt-3 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}{notice && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-cyan/20 bg-cyan/[.06] p-3 text-xs font-semibold text-cyan"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={14} /></button></div>}{results.length > 0 && <div className="mt-5 space-y-2"><p className="text-[10px] font-black uppercase tracking-[.16em] text-white/30">Resultados</p>{results.map((player) => <PlayerResult key={player.id} player={player} loading={workingId === player.id} onAdd={() => addFriend(player)} />)}</div>}{results.length === 0 && <div className="mt-6 rounded-2xl border border-dashed border-white/[.1] px-5 py-8 text-center"><UsersRound size={22} className="mx-auto text-white/25" /><p className="mt-3 text-xs font-bold text-white/60">Busque alguém para começar sua rede.</p><p className="mt-1 text-[11px] text-white/30">Depois, essa pessoa aparecerá primeiro nos convites de dupla.</p></div>}</div>

        <aside className="space-y-5"><div className="rounded-3xl border border-lime/20 bg-lime/[.06] p-5 sm:p-6"><div className="flex items-center gap-2 text-xs font-black text-lime"><ShieldCheck size={16} /> Seu identificador público</div><p className="mt-5 text-2xl font-black tracking-tight text-white">{playerHandle}</p><p className="mt-2 text-xs leading-relaxed text-white/40">Compartilhe este @handle para que outros jogadores encontrem você. Seu número de celular permanece privado.</p><button onClick={copyHandle} className="mt-5 flex items-center gap-2 rounded-xl border border-lime/20 px-3 py-2.5 text-[11px] font-black text-lime hover:bg-lime/10"><Clipboard size={14} /> Copiar identificador</button></div><div className="glass rounded-3xl p-5"><p className="text-sm font-black">Como funciona</p><div className="mt-4 space-y-4 text-xs text-white/45"><Step number="1" text="Busque pelo @handle ou nome." /><Step number="2" text="Envie ou aceite uma solicitação." /><Step number="3" text="O amigo aparece primeiro ao montar uma dupla." /></div></div></aside>
      </section>

      {requests.length > 0 && <section className="glass rounded-3xl p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="eyebrow">Aguardando você</p><h2 className="mt-2 text-xl font-black">Solicitações de amizade</h2></div><span className="rounded-full bg-cyan/10 px-2.5 py-1 text-[10px] font-black text-cyan">{requests.length}</span></div><div className="mt-5 grid gap-2 md:grid-cols-2">{requests.map((request) => <div key={request.id} className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-3"><Avatar name={request.displayName} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white/80">{request.displayName}</p><p className="mt-1 truncate text-[10px] text-white/35">{request.handle} • {request.tier}</p></div><div className="flex gap-1.5"><button disabled={workingId === request.id} onClick={() => decide(request, 'decline')} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[.1] text-white/40 hover:text-white" aria-label={`Recusar solicitação de ${request.displayName}`}><X size={14} /></button><button disabled={workingId === request.id} onClick={() => decide(request, 'accept')} className="grid h-8 w-8 place-items-center rounded-lg bg-lime text-ink" aria-label={`Aceitar solicitação de ${request.displayName}`}><Check size={14} /></button></div></div>)}</div></section>}

      <section className="glass rounded-3xl p-5 sm:p-7"><div className="flex items-center justify-between"><div><p className="eyebrow">Sua rede</p><h2 className="mt-2 text-xl font-black">Amigos para jogar</h2></div><span className="text-xs font-bold text-white/35">{friends.length} {friends.length === 1 ? 'jogador' : 'jogadores'}</span></div>{friends.length > 0 ? <div className="mt-5 grid gap-2 md:grid-cols-2 lg:grid-cols-3">{friends.map((friend) => <div key={friend.friendshipId} className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-3"><Avatar name={friend.displayName} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white/80">{friend.displayName}</p><p className="mt-1 truncate text-[10px] text-white/35">{friend.handle} • {friend.tier}</p></div><button disabled={workingId === friend.friendshipId} onClick={() => removeFriend(friend)} className="rounded-lg p-2 text-white/25 hover:bg-coral/10 hover:text-coral" aria-label={`Remover ${friend.displayName}`}><X size={14} /></button></div>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-white/[.1] px-5 py-10 text-center"><UserPlus size={22} className="mx-auto text-white/25" /><p className="mt-3 text-xs font-bold text-white/60">Sua lista ainda está vazia.</p><p className="mt-1 text-[11px] text-white/30">Adicione jogadores para convidar para uma dupla no saguão.</p></div>}</section>
    </div>
  </AppShell>;
}

function PlayerResult({ player, loading, onAdd }: { player: MatchmakingPlayerOption; loading: boolean; onAdd: () => void }) {
  const relation = player.relationship ?? 'none';
  return <div className="flex items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.025] p-3"><Avatar name={player.displayName} /><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-white/80">{player.displayName}</p><p className="mt-1 truncate text-[10px] text-white/35">{player.handle} • {player.tier} • {player.city}</p></div>{relation === 'accepted' ? <span className="rounded-lg bg-lime/10 px-2.5 py-2 text-[10px] font-black text-lime">Amigo</span> : relation === 'pending' ? <span className="rounded-lg bg-white/[.07] px-2.5 py-2 text-[10px] font-black text-white/40">Solicitado</span> : relation === 'incoming' ? <span className="rounded-lg bg-cyan/10 px-2.5 py-2 text-[10px] font-black text-cyan">Solicitou você</span> : <button disabled={loading} onClick={onAdd} className="flex items-center gap-1.5 rounded-lg bg-lime px-2.5 py-2 text-[10px] font-black text-ink disabled:opacity-50"><UserPlus size={13} /> {loading ? 'Enviando' : 'Adicionar'}</button>}</div>;
}

function Avatar({ name }: { name: string }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.08] text-[10px] font-black text-white/65">{name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span>;
}

function Step({ number, text }: { number: string; text: string }) {
  return <div className="flex items-center gap-3"><span className="grid h-6 w-6 place-items-center rounded-lg bg-lime/10 text-[10px] font-black text-lime">{number}</span><span>{text}</span></div>;
}
