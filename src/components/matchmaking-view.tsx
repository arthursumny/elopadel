'use client';

import { Check, ChevronDown, Clock3, Crosshair, LocateFixed, MapPin, RotateCcw, Search, Swords, UserRoundPlus, Users, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { DirectChallengeInbox as DirectChallengeInboxPanel } from '@/components/direct-challenge-inbox';
import { PlayerPicker } from '@/components/player-picker';
import { Dialog } from '@/components/dialog';
import { localDateKey, timeToMinutes, type MatchSearchPreferences } from '@/lib/matchmaking';
import { clubIdForCity, clubsForCity } from '@/lib/matchmaking-club-filter';
import { clubIdForBrowserLocation, clubsForBrowserLocation, isBrowserLocationProofFresh, resolveCurrentBrowserLocation, type BrowserLocationProof } from '@/lib/browser-location';
import type { ActiveMatchSearch, CourtSide, MatchChallenge, MatchMode, MatchSearchInvitation, MatchmakingPlayerOption } from '@/lib/types';

type Club = { id: string; name: string; city: string; state: string; country: string };
type SearchDraft = MatchSearchPreferences & { partyType: 'solo' | 'duo'; partnerId: string; mode: MatchMode; sidePreference: CourtSide };
type ChallengeDraft = { partnerId: string; targetId: string; targetPartnerId: string; mode: MatchMode; date: string; time: string; city: string; clubId: string; sidePreference: CourtSide };

function proofMatchesSearchLocation(proof: BrowserLocationProof, search: ActiveMatchSearch, clubs: Club[]) {
  if (proof.city.trim().localeCompare(search.city.trim(), 'pt-BR', { sensitivity: 'base' }) !== 0) return false;
  const selectedClub = clubs.find((club) => club.id === search.clubId);
  if (selectedClub) return clubIdForBrowserLocation(selectedClub.id, proof, clubs) === selectedClub.id;
  const cityClubs = clubs.filter((club) => club.city.trim().localeCompare(search.city.trim(), 'pt-BR', { sensitivity: 'base' }) === 0);
  return cityClubs.length === 0 || clubsForBrowserLocation(clubs, proof).length > 0;
}

function defaultPreferences(playerCity?: string): MatchSearchPreferences {
  return { dates: [], from: '18:00', to: '22:00', city: playerCity ?? '', clubId: '' };
}

function defaultSearchDraft(playerCity?: string): SearchDraft {
  return { ...defaultPreferences(playerCity), partyType: 'solo', partnerId: '', mode: 'ranked', sidePreference: 'any' };
}

function defaultChallengeDraft(playerCity?: string): ChallengeDraft {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + 1);
  return { partnerId: '', targetId: '', targetPartnerId: '', mode: 'ranked', date: localDateKey(date), time: '19:00', city: playerCity ?? '', clubId: '', sidePreference: 'any' };
}

function searchDraftFromActive(search: ActiveMatchSearch): SearchDraft {
  return { dates: [...search.dates], from: search.from, to: search.to, city: search.city, clubId: search.clubId ?? '', partyType: search.partyType, partnerId: search.partnerId ?? '', mode: search.mode, sidePreference: search.sidePreference };
}

function formatDateOption(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');
}

function formatTimeWindow(preferences: Pick<MatchSearchPreferences, 'from' | 'to'>) {
  if (preferences.from && preferences.to) return `${preferences.from} – ${preferences.to}`;
  if (preferences.from) return `A partir das ${preferences.from}`;
  if (preferences.to) return `Até ${preferences.to}`;
  return 'Qualquer horário';
}

type SearchSummaryPreferences = Omit<MatchSearchPreferences, 'clubId'> & { clubId?: string };

function formatSearchSummary(preferences: SearchSummaryPreferences, clubs: Club[]) {
  const club = clubs.find((item) => item.id === preferences.clubId)?.name;
  const where = club ?? (preferences.city || 'qualquer local');
  const when = preferences.dates.length === 0 ? 'qualquer dia' : preferences.dates.length === 1 ? formatDateOption(preferences.dates[0]) : `${preferences.dates.length} dias`;
  return `${when} • ${formatTimeWindow(preferences)} • ${where}`;
}

function sideLabel(side: CourtSide) {
  if (side === 'left') return 'Esquerda';
  if (side === 'right') return 'Direita';
  return 'Tanto faz';
}

export function MatchmakingView({ clubs, players, searchInvitations: initialSearchInvitations, challenges: initialChallenges, activeSearch: initialActiveSearch, playerName, playerInitials, playerCity }: { clubs: Club[]; players: MatchmakingPlayerOption[]; searchInvitations: MatchSearchInvitation[]; challenges: MatchChallenge[]; activeSearch: ActiveMatchSearch | null; playerName: string; playerInitials: string; playerCity?: string }) {
  const initialDraft = initialActiveSearch ? searchDraftFromActive(initialActiveSearch) : defaultSearchDraft(playerCity);
  const [activeSearch, setActiveSearch] = useState<ActiveMatchSearch | null>(initialActiveSearch);
  const [searchInvitations, setSearchInvitations] = useState(initialSearchInvitations);
  const [challenges, setChallenges] = useState(initialChallenges);
  const [notice, setNotice] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [challengeOpen, setChallengeOpen] = useState(false);
  const [searchSubmitting, setSearchSubmitting] = useState(false);
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [challengeError, setChallengeError] = useState('');
  const [rankedLocation, setRankedLocation] = useState<BrowserLocationProof | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [preferences, setPreferences] = useState<MatchSearchPreferences>(initialDraft);
  const [draftPreferences, setDraftPreferences] = useState<SearchDraft>(initialDraft);
  const [friendlyCityPreference, setFriendlyCityPreference] = useState(initialActiveSearch?.mode === 'friendly' ? initialActiveSearch.city : playerCity ?? '');
  const [challengeDraft, setChallengeDraft] = useState<ChallengeDraft>(() => defaultChallengeDraft(playerCity));
  const searchSubmitLock = useRef(false);
  const locationResolveLock = useRef(false);

  const availableDays = useMemo(() => Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return localDateKey(date);
  }), []);

  const cities = useMemo(() => Array.from(new Set(clubs.map((club) => club.city.trim()).filter(Boolean).concat(playerCity?.trim() ?? '').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR')), [clubs, playerCity]);
  const lobbyActive = activeSearch?.status === 'lobby';
  const searching = activeSearch?.status === 'searching';

  useEffect(() => {
    if (activeSearch?.status === 'matched' && activeSearch.matchId) window.location.assign(`/match/${activeSearch.matchId}`);
  }, [activeSearch]);

  useEffect(() => {
    let cancelled = false;
    async function refreshSearch() {
      const [searchResponse, challengeResponse] = await Promise.all([
        fetch('/api/matchmaking/search', { cache: 'no-store' }).catch(() => null),
        fetch('/api/matchmaking/challenges', { cache: 'no-store' }).catch(() => null),
      ]);
      if (cancelled) return;
      if (searchResponse?.ok) {
        const data = await searchResponse.json().catch(() => ({}));
        if (data.search) {
          const nextSearch = data.search as ActiveMatchSearch;
          setActiveSearch(nextSearch);
          if (nextSearch.status === 'lobby') setSearchInvitations((current) => current.filter((invitation) => invitation.id !== nextSearch.id));
        } else if (activeSearch && activeSearch.status !== 'matched') setActiveSearch(null);
      }
      if (challengeResponse?.ok) {
        const data = await challengeResponse.json().catch(() => ({}));
        setChallenges((data.challenges ?? []) as MatchChallenge[]);
      }
    }
    const interval = window.setInterval(refreshSearch, 10000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [activeSearch?.id, activeSearch?.status]);

  function openSearchEditor() {
    const base = activeSearch ? searchDraftFromActive(activeSearch) : { ...defaultSearchDraft(playerCity), ...preferences };
    if (base.mode === 'friendly') setFriendlyCityPreference(base.city);
    setDraftPreferences({ ...base, clubId: clubIdForCity(base.clubId, base.city, clubs) });
    setSearchError('');
    setLocationError('');
    setRankedLocation(null);
    setSearchOpen(true);
  }

  function openChallengeEditor() {
    setChallengeDraft((current) => ({ ...current, clubId: clubIdForCity(current.clubId, current.city, clubs) }));
    setChallengeError('');
    setChallengeOpen(true);
  }

  function toggleDate(date: string) {
    setDraftPreferences((current) => ({ ...current, dates: current.dates.includes(date) ? current.dates.filter((item) => item !== date) : [...current.dates, date].sort() }));
  }

  async function requestRankedLocation() {
    if (locationResolveLock.current) return null;
    locationResolveLock.current = true;
    setLocationLoading(true);
    setLocationError('');
    try {
      const resolved = await resolveCurrentBrowserLocation();
      setRankedLocation(resolved);
      setDraftPreferences((current) => ({
        ...current,
        city: resolved.city,
        clubId: clubIdForBrowserLocation(current.clubId, resolved, clubs),
      }));
      return resolved;
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Não foi possível validar sua localização. Tente novamente.');
      setRankedLocation(null);
      return null;
    } finally {
      locationResolveLock.current = false;
      setLocationLoading(false);
    }
  }

  async function applySearchPreferences() {
    if (searchSubmitLock.current) return;
    const from = draftPreferences.from ? timeToMinutes(draftPreferences.from) : null;
    const to = draftPreferences.to ? timeToMinutes(draftPreferences.to) : null;
    if (draftPreferences.dates.length === 0) return setSearchError('Selecione pelo menos um dia em que você pode jogar.');
    if (from === null || to === null || from > to) return setSearchError('Informe uma janela de horário válida.');
    if (draftPreferences.mode === 'friendly' && !draftPreferences.city) return setSearchError('Escolha a cidade onde você quer jogar.');
    if (draftPreferences.partyType === 'duo' && !draftPreferences.partnerId) return setSearchError('Escolha o parceiro da sua dupla.');
    searchSubmitLock.current = true;
    setSearchSubmitting(true);
    setSearchError('');
    try {
      let location = draftPreferences.mode === 'ranked' ? rankedLocation : null;
      if (draftPreferences.mode === 'ranked' && !isBrowserLocationProofFresh(location)) location = await requestRankedLocation();
      if (draftPreferences.mode === 'ranked' && !location) return;
      const searchCity = draftPreferences.mode === 'ranked' ? location!.city : draftPreferences.city;
      const selectedClubId = draftPreferences.mode === 'ranked'
        ? clubIdForBrowserLocation(draftPreferences.clubId, location!, clubs)
        : clubIdForCity(draftPreferences.clubId, searchCity, clubs);
      const response = await fetch('/api/matchmaking/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        ...draftPreferences,
        city: searchCity,
        clubId: selectedClubId,
        ...(draftPreferences.mode === 'ranked' ? { locationToken: location!.token } : {}),
        replace: Boolean(activeSearch),
        timezoneOffset: new Date().getTimezoneOffset(),
      }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (draftPreferences.mode === 'ranked' && response.status === 422) setRankedLocation(null);
        return setSearchError(data.error ?? 'Não foi possível entrar no saguão.');
      }
      setPreferences({ dates: [...draftPreferences.dates], from: draftPreferences.from, to: draftPreferences.to, city: searchCity, clubId: selectedClubId });
      setSearchOpen(false);
      setNotice(data.message ?? 'Busca criada.');
      if (data.invited) {
        setActiveSearch(null);
        if (data.invitation) setSearchInvitations((current) => [data.invitation, ...current.filter((invitation) => invitation.id !== data.invitation.id)]);
        return;
      }
      if (data.matchId) return window.location.assign(`/match/${data.matchId}`);
      setActiveSearch(data.search ?? null);
    } catch {
      setSearchError('Não foi possível conectar ao servidor.');
    } finally {
      setRankedLocation(null);
      searchSubmitLock.current = false;
      setSearchSubmitting(false);
    }
  }

  async function cancelSearch() {
    if (!activeSearch) return;
    setSearchSubmitting(true);
    const response = await fetch('/api/matchmaking/search', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ searchId: activeSearch.id }) }).catch(() => null);
    setSearchSubmitting(false);
    if (!response?.ok) return setNotice('Não foi possível cancelar o saguão.');
    setActiveSearch(null);
    setNotice('Saguão cancelado.');
  }

  async function applyDirectChallenge() {
    const ids = [challengeDraft.partnerId, challengeDraft.targetId, challengeDraft.targetPartnerId];
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return setChallengeError('Escolha três jogadores diferentes para completar as duas duplas.');
    if (!challengeDraft.date || !challengeDraft.time) return setChallengeError('Escolha a data e o horário do desafio.');
    const startsAt = new Date(`${challengeDraft.date}T${challengeDraft.time}:00`);
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) return setChallengeError('Escolha uma data e horário futuros.');
    if (!challengeDraft.city.trim()) return setChallengeError('Informe a cidade onde a partida acontecerá.');
    setChallengeSubmitting(true);
    setChallengeError('');
    try {
      const selectedClubId = clubIdForCity(challengeDraft.clubId, challengeDraft.city, clubs);
      const response = await fetch('/api/matchmaking/challenges', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...challengeDraft, clubId: selectedClubId, startsAt: startsAt.toISOString(), timezoneOffset: new Date().getTimezoneOffset() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setChallengeError(data.error ?? 'Não foi possível enviar o desafio.');
      setChallenges((data.challenges ?? []) as MatchChallenge[]);
      setChallengeOpen(false);
      setNotice(data.message ?? 'Desafio enviado.');
    } catch {
      setChallengeError('Não foi possível conectar ao servidor.');
    } finally {
      setChallengeSubmitting(false);
    }
  }

  function resetSearchPreferences() {
    const defaults = defaultSearchDraft(playerCity);
    setPreferences(defaults);
    setDraftPreferences(defaults);
    setFriendlyCityPreference(defaults.city);
    setSearchError('');
  }

  return <AppShell playerName={playerName} playerInitials={playerInitials}>
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div><p className="eyebrow">Saguão de matchmaking</p><h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">Encontre sua próxima partida.</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-white/40">Defina sua disponibilidade, escolha o lado da quadra e entre sozinho ou com sua dupla. O app monta uma partida equilibrada quando os quatro puderem jogar.</p></div>
        <div className="flex flex-wrap gap-2">{!activeSearch && <button disabled={challengeSubmitting} onClick={openChallengeEditor} className="flex items-center gap-2 rounded-xl border border-cyan/25 bg-cyan/[.08] px-4 py-3 text-xs font-black text-cyan transition hover:bg-cyan/[.14]"><Swords size={15} /> Desafiar dupla</button>}<button disabled={searchSubmitting} onClick={activeSearch ? cancelSearch : openSearchEditor} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-xs font-black transition ${activeSearch ? 'border border-coral/20 bg-coral/10 text-coral' : 'bg-lime text-ink hover:bg-lime-300'}`}>{activeSearch ? <X size={15} /> : <Crosshair size={15} />}{activeSearch ? 'Sair do saguão' : 'Encontrar partida'}</button></div>
      </section>

      {challenges.length > 0 && <DirectChallengeInboxPanel challenges={challenges} onChange={setChallenges} onNotice={setNotice} />}
      {searchInvitations.length > 0 && <MatchSearchInvitationInbox invitations={searchInvitations} onRemove={(id) => setSearchInvitations((current) => current.filter((invitation) => invitation.id !== id))} onNotice={setNotice} onSearchUpdated={setActiveSearch} />}
      {lobbyActive && activeSearch && <SearchLobbyCard search={activeSearch} clubs={clubs} onUpdated={setActiveSearch} onNotice={setNotice} />}
      {searching && activeSearch && <SearchingCard search={activeSearch} clubs={clubs} />}
      {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-cyan/20 bg-cyan/[.06] p-4 text-xs text-cyan"><div><span className="flex items-start gap-2"><Check size={15} className="mt-0.5 shrink-0" /> {notice}</span>{notice.startsWith('Localização confirmada:') && <p className="ml-6 mt-2 text-[10px] text-white/35">Dados de mapa: <a href="https://www.geoapify.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/70">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/70">© OpenStreetMap</a></p>}</div><button type="button" onClick={() => setNotice('')} aria-label="Fechar aviso" className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50"><X size={15} /></button></div>}

      {!activeSearch && <section className="glass overflow-hidden rounded-3xl p-6 sm:p-9"><div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-center"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-lime"><span className="h-2 w-2 rounded-full bg-lime" /> Uma única porta de entrada</div><h2 className="mt-4 max-w-xl text-2xl font-black tracking-[-.04em] sm:text-3xl">Entre no saguão e deixe o sistema formar sua partida.</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-white/40">Você informa os dias e horários em que pode jogar. Pode chamar um parceiro ou entrar solo; o matchmaking procura jogadores compatíveis e só fecha o jogo depois dos aceites.</p><button onClick={openSearchEditor} className="mt-6 flex items-center gap-2 rounded-xl bg-lime px-5 py-3.5 text-xs font-black text-ink hover:bg-lime-300"><Search size={15} /> Abrir saguão de busca</button></div><div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1"><LobbyStep number="01" title="Disponibilidade" text="Dias, horário, cidade e clube." /><LobbyStep number="02" title="Dupla" text="Convide um amigo ou vá sozinho." /><LobbyStep number="03" title="Partida" text="Quatro aceites e presença na quadra." /></div></div></section>}

      {activeSearch && <section className="grid gap-4 md:grid-cols-3"><Info icon={Clock3} title="Disponibilidade em comum" text="O sistema só marca quando existe um dia e horário compatível para todos." /><Info icon={Users} title="Duplas preservadas" text="Quem entra com parceiro permanece na mesma dupla contra os adversários." /><Info icon={MapPin} title="Quadra no Gripo" text="O saguão organiza jogadores e horário; a reserva continua no clube." /></section>}
      {!activeSearch && <section className="grid gap-4 md:grid-cols-3"><Info icon={Clock3} title="Dias e horários" text="Escolha terça, quarta, quinta ou quantos dias forem possíveis para você." /><Info icon={Users} title="Solo ou dupla" text="Convide pelo @handle ou deixe o app encontrar três jogadores." /><Info icon={MapPin} title="Lado da quadra" text="Informe esquerda, direita ou tanto faz para o pareamento respeitar seu estilo." /></section>}
    </div>
    {searchOpen && <SearchPreferencesModal clubs={clubs} cities={cities} players={players} availableDays={availableDays} value={draftPreferences} friendlyCity={friendlyCityPreference} onFriendlyCityChange={setFriendlyCityPreference} location={rankedLocation} locationError={locationError} locationLoading={locationLoading} error={searchError} loading={searchSubmitting} onChange={(patch) => setDraftPreferences((current) => ({ ...current, ...patch }))} onClearLocation={() => { setRankedLocation(null); setLocationError(''); }} onRequestLocation={requestRankedLocation} onToggleDate={toggleDate} onApply={applySearchPreferences} onReset={resetSearchPreferences} onClose={() => { setSearchOpen(false); setRankedLocation(null); }} />}
    {challengeOpen && <DirectChallengeModal clubs={clubs} cities={cities} players={players} value={challengeDraft} error={challengeError} loading={challengeSubmitting} onChange={(patch) => setChallengeDraft((current) => ({ ...current, ...patch }))} onApply={applyDirectChallenge} onClose={() => setChallengeOpen(false)} />}
  </AppShell>;
}

function SearchLobbyCard({ search, clubs, onUpdated, onNotice }: { search: ActiveMatchSearch; clubs: Club[]; onUpdated: (search: ActiveMatchSearch | null) => void; onNotice: (message: string) => void }) {
  const [side, setSide] = useState<CourtSide>(search.sidePreference);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const submitLock = useRef(false);

  useEffect(() => setSide(search.sidePreference), [search.sidePreference]);

  async function setReady(ready: boolean) {
    if (submitLock.current) return;
    submitLock.current = true;
    setLoading(true);
    setError('');
    onNotice('');
    try {
      let locationToken: string | undefined;
      let detectedCity = '';
      if (ready && search.mode === 'ranked') {
        const location = await resolveCurrentBrowserLocation();
        detectedCity = `${location.city} — ${location.state}`;
        if (!proofMatchesSearchLocation(location, search, clubs)) {
          return setError(`Sua localização atual é ${detectedCity}. Este saguão é de ${search.city}. A dupla só pode iniciar a busca na mesma cidade e UF; volte à cidade do saguão ou cancele e crie outro.`);
        }
        locationToken = location.token;
      }
      const response = await fetch('/api/matchmaking/search/ready', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ searchId: search.id, ready, sidePreference: side, ...(locationToken ? { locationToken } : {}) }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) return setError(data.error ?? 'Não foi possível atualizar sua confirmação.');
      if (data.matchId) return window.location.assign(`/match/${data.matchId}`);
      if (data.search) onUpdated(data.search as ActiveMatchSearch);
      onNotice(detectedCity ? `Localização confirmada: ${detectedCity}. ${data.message ?? 'Confirmação atualizada.'}` : data.message ?? 'Confirmação atualizada.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível confirmar sua localização. Tente novamente.');
    } finally {
      submitLock.current = false;
      setLoading(false);
    }
  }

  return <section className="rounded-3xl border border-amber-300/20 bg-amber-300/[.055] p-5 sm:p-7"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start"><div><p className="eyebrow text-amber-200">Saguão da dupla</p><h2 className="mt-2 text-2xl font-black">Preparem-se para buscar.</h2><p className="mt-2 max-w-xl text-xs leading-relaxed text-white/45">O convite foi aceito. Agora os dois precisam confirmar que querem entrar no matchmaking; só então o app procurará os adversários.</p></div><span className="rounded-xl border border-amber-200/20 bg-amber-200/10 px-3 py-2 text-[10px] font-black text-amber-200">{search.myReady && search.partnerReady ? 'Iniciando busca' : `${Number(search.myReady) + Number(search.partnerReady)}/2 prontos`}</span></div><div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr] lg:items-end"><div className="rounded-2xl border border-white/[.08] bg-black/10 p-4"><p className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Sua disponibilidade</p><p className="mt-2 text-sm font-bold text-white/80">{formatSearchSummary(search, clubs)}</p><p className="mt-2 text-[11px] text-white/40">Seu lado: <strong className="text-cyan">{sideLabel(side)}</strong></p><div className="mt-4"><SideSelector value={side} onChange={setSide} /></div></div><div className="rounded-2xl border border-white/[.08] bg-black/10 p-4"><p className="text-[10px] font-black uppercase tracking-[.15em] text-white/30">Sua dupla</p><p className="mt-2 text-sm font-bold text-white/80">{search.partnerName ?? 'Parceiro convidado'}</p><p className="mt-1 text-[11px] text-white/40">{search.partnerHandle ?? ''}</p><p className="mt-3 text-[11px] text-white/40">Lado do parceiro: <strong className="text-cyan">{sideLabel(search.partnerSidePreference ?? 'any')}</strong></p><p className="mt-3 text-[10px] font-black text-white/35">{search.partnerReady ? 'Parceiro confirmou a busca' : 'Aguardando confirmação do parceiro'}</p></div></div><div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] text-white/35">{search.myReady ? 'Você já confirmou. Pode retirar a confirmação para trocar o lado.' : 'Escolha seu lado e confirme para começar.'}</p><button disabled={loading} onClick={() => setReady(search.myReady ? false : true)} className="rounded-xl bg-lime px-5 py-3 text-xs font-black text-ink disabled:opacity-50">{loading ? 'Salvando...' : search.myReady ? 'Retirar confirmação' : 'Confirmar que quero buscar'}</button></div>{error && <p className="mt-4 rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs font-semibold text-coral">{error}</p>}</section>;
}

function SearchingCard({ search, clubs }: { search: ActiveMatchSearch; clubs: Club[] }) {
  return <section className="flex flex-col gap-4 rounded-2xl border border-lime/20 bg-lime/[.06] p-5 sm:flex-row sm:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime text-ink"><LocateFixed size={18} /></span><div className="flex-1"><p className="text-sm font-black text-white/90">Buscando jogadores compatíveis</p><p className="mt-1 text-xs text-white/45">{formatSearchSummary(search, clubs)} • {search.partyType === 'duo' ? 'sua dupla está preservada' : 'você entrou solo'} • lado: {sideLabel(search.sidePreference)}</p><p className="mt-2 text-[10px] text-white/30">Quando a partida for encontrada, os quatro receberão um aviso para confirmar que vão jogar.</p></div><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-lime" /></section>;
}

function SearchPreferencesModal({ clubs, cities, players, availableDays, value, friendlyCity, onFriendlyCityChange, location, locationError, locationLoading, error, loading, onChange, onClearLocation, onRequestLocation, onToggleDate, onApply, onReset, onClose }: { clubs: Club[]; cities: string[]; players: MatchmakingPlayerOption[]; availableDays: string[]; value: SearchDraft; friendlyCity: string; onFriendlyCityChange: (city: string) => void; location: BrowserLocationProof | null; locationError: string; locationLoading: boolean; error: string; loading: boolean; onChange: (patch: Partial<SearchDraft>) => void; onClearLocation: () => void; onRequestLocation: () => Promise<BrowserLocationProof | null>; onToggleDate: (date: string) => void; onApply: () => void; onReset: () => void; onClose: () => void }) {
  const availableClubs = value.mode === 'ranked'
    ? location ? clubsForBrowserLocation(clubs, location) : []
    : clubsForCity(clubs, value.city);

  function changeMode(mode: MatchMode) {
    if (mode === value.mode) return;
    if (mode === 'friendly') {
      const city = friendlyCity;
      onClearLocation();
      onChange({ mode, city, clubId: clubIdForCity(value.clubId, city, clubs) });
      return;
    }
    onClearLocation();
    onChange({ mode, city: '', clubId: '' });
  }

  function changeFriendlyCity(city: string) {
    onFriendlyCityChange(city);
    onChange({ city, clubId: clubIdForCity(value.clubId, city, clubs) });
  }

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <button type="button" onClick={onReset} className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-bold text-white/55 hover:text-white">
        <RotateCcw size={14} /> Restaurar padrão
      </button>
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-white/[.1] px-4 py-3 text-xs font-bold text-white/70 hover:text-white">Cancelar</button>
        <button type="button" disabled={loading || locationLoading} onClick={onApply} aria-busy={loading || locationLoading} className="rounded-xl bg-lime px-5 py-3 text-xs font-black text-ink disabled:opacity-50">
          {loading ? 'Salvando...' : value.partyType === 'duo' ? 'Enviar convite da dupla' : 'Entrar na busca'}
        </button>
      </div>
    </div>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="Saguão de busca"
      title="Como você quer encontrar a partida?"
      description="Defina seus dias, horários e local. A partida só avança depois dos aceites."
      size="lg"
      closeOnBackdrop={false}
      closeLabel="Fechar saguão"
      footer={footer}
    >
      <div className="space-y-6">
        <div>
          <span className="mb-3 block text-xs font-bold text-white/70">Como quer entrar?</span>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" data-autofocus onClick={() => onChange({ partyType: 'solo', partnerId: '' })} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold ${value.partyType === 'solo' ? 'border-lime/40 bg-lime/10 text-lime' : 'border-white/[.1] bg-white/[.03] text-white/65'}`}><UserRoundPlus size={15} /> Sozinho</button>
            <button type="button" onClick={() => onChange({ partyType: 'duo' })} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold ${value.partyType === 'duo' ? 'border-lime/40 bg-lime/10 text-lime' : 'border-white/[.1] bg-white/[.03] text-white/65'}`}><Users size={15} /> Com parceiro</button>
          </div>
        </div>

        {value.partyType === 'duo' && <PlayerPicker options={players} value={value.partnerId} onChange={(partnerId) => onChange({ partnerId })} label="Seu parceiro" helper="Amigos aparecem primeiro; busque por @handle ou nome." />}

        <div>
          <span className="mb-3 block text-xs font-bold text-white/70">Seu lado da quadra</span>
          <SideSelector value={value.sidePreference} onChange={(sidePreference) => onChange({ sidePreference })} />
          <p className="mt-2 text-xs text-meta">O app usa essa preferência para montar duplas que consigam ocupar os dois lados.</p>
        </div>

        <div>
          <span className="mb-3 block text-xs font-bold text-white/70">Tipo de partida</span>
          <div className="flex gap-1 rounded-xl border border-white/[.1] bg-white/[.035] p-1">
            <button type="button" onClick={() => changeMode('ranked')} className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/50 ${value.mode === 'ranked' ? 'bg-white/[.1] text-white' : 'text-white/60'}`}>Ranqueada</button>
            <button type="button" onClick={() => changeMode('friendly')} className={`flex-1 rounded-lg px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/50 ${value.mode === 'friendly' ? 'bg-white/[.1] text-white' : 'text-white/60'}`}>Amistosa</button>
          </div>
        </div>

        {value.mode === 'ranked' && <div className="space-y-3 rounded-2xl border border-cyan/15 bg-cyan/[.04] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><span className="block text-xs font-bold text-white/75">Cidade da sua localização atual</span><p className="mt-1 text-[11px] leading-relaxed text-white/40">A cidade da busca ranqueada é confirmada pelo GPS e não pode ser escolhida manualmente.</p></div>
            <button type="button" disabled={locationLoading || loading} onClick={() => void onRequestLocation()} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-cyan/25 bg-cyan/10 px-4 py-3 text-xs font-black text-cyan transition hover:bg-cyan/[.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/50 disabled:opacity-50">
              <Crosshair size={14} aria-hidden="true" />{locationLoading ? 'Verificando...' : location ? 'Atualizar localização' : 'Detectar minha localização'}
            </button>
          </div>
          {location && <div className="rounded-xl border border-white/[.08] bg-black/10 px-3 py-3" role="status">
            <p className="flex items-center gap-2 text-sm font-black text-white/90"><MapPin size={15} className="text-cyan" aria-hidden="true" />{location.city} — {location.state}</p>
            <p className="mt-1 text-[10px] text-white/40">Localização confirmada para esta busca.</p>
            <p className="mt-2 text-[10px] text-white/35">Dados de mapa: <a href="https://www.geoapify.com" target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white/70">Geoapify</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline decoration-white/30 underline-offset-2 hover:text-white/70">© OpenStreetMap</a></p>
          </div>}
          {locationLoading && <p className="text-xs text-cyan" role="status">Buscando um sinal preciso. A localização é usada apenas para confirmar a cidade desta busca.</p>}
          {locationError && <p role="alert" className="rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-xs leading-relaxed text-coral">{locationError}</p>}
          <div className="rounded-xl border border-white/[.07] bg-white/[.025] p-3">
            <p className="text-[10px] font-black uppercase tracking-[.12em] text-white/45">A busca pode ampliar a faixa de rating</p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">Começa em até 300 pontos de diferença; a faixa pode chegar a 450 após 2 min e a 600 após 5 min, sempre respeitando o limite da patente. A ampliação conforme o tempo de espera dos jogadores depende da manutenção do sistema: os prazos não são garantidos e a cidade da busca não muda.</p>
          </div>
        </div>}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-xs font-bold text-white/70">Dias disponíveis</span>
            <span className="text-xs text-meta">{value.dates.length === 0 ? 'Obrigatório' : `${value.dates.length} selecionado${value.dates.length === 1 ? '' : 's'}`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {availableDays.map((date) => (
              <button type="button" key={date} onClick={() => onToggleDate(date)} className={`rounded-xl border px-3 py-3 text-left text-xs font-bold transition ${value.dates.includes(date) ? 'border-lime/40 bg-lime/10 text-lime' : 'border-white/[.1] bg-white/[.03] text-white/70 hover:border-white/20 hover:text-white'}`}>{formatDateOption(date)}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-meta">Marque todos os dias em que você conseguiria jogar.</p>
        </div>

        <div>
          <span className="mb-3 block text-xs font-bold text-white/70">Janela de horário</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-xs text-meta">A partir de</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><Clock3 size={15} className="text-cyan" /><input type="time" value={value.from} onChange={(event) => onChange({ from: event.target.value })} className="w-full bg-transparent text-sm text-white outline-none" /></span></label>
            <label className="block"><span className="mb-2 block text-xs text-meta">Até</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><Clock3 size={15} className="text-cyan" /><input type="time" value={value.to} onChange={(event) => onChange({ to: event.target.value })} className="w-full bg-transparent text-sm text-white outline-none" /></span></label>
          </div>
        </div>

        {value.mode === 'friendly'
          ? <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Cidade" value={value.city} placeholder="Qualquer cidade" options={cities} onChange={changeFriendlyCity} />
            <SelectField label="Clube" value={value.clubId} placeholder={value.city ? 'Qualquer clube nesta cidade' : 'Qualquer clube'} options={availableClubs.map((club) => ({ label: `${club.name} — ${club.city}`, value: club.id }))} onChange={(clubId) => onChange({ clubId })} />
          </div>
          : <SelectField label="Clube na cidade confirmada" value={value.clubId} placeholder={location ? 'Qualquer clube nesta cidade' : 'Confirme sua localização primeiro'} options={availableClubs.map((club) => ({ label: `${club.name} — ${club.city}, ${club.state}`, value: club.id }))} disabled={!location || locationLoading} onChange={(clubId) => onChange({ clubId })} />}

        <p className="text-xs leading-relaxed text-soft">Sozinho entra na busca agora. Em dupla, o parceiro confirma antes. Cada integrante da dupla precisa estar na cidade confirmada.</p>

        {error && <p role="alert" className="rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-sm font-semibold text-coral">{error}</p>}
      </div>
    </Dialog>
  );
}

function DirectChallengeModal({ clubs, cities, players, value, error, loading, onChange, onApply, onClose }: { clubs: Club[]; cities: string[]; players: MatchmakingPlayerOption[]; value: ChallengeDraft; error: string; loading: boolean; onChange: (patch: Partial<ChallengeDraft>) => void; onApply: () => void; onClose: () => void }) {
  const availableClubs = clubsForCity(clubs, value.city);
  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button type="button" onClick={onClose} className="rounded-xl border border-white/[.1] px-4 py-3 text-xs font-bold text-white/70 hover:text-white">Cancelar</button>
      <button type="button" disabled={loading} onClick={onApply} className="flex items-center justify-center gap-2 rounded-xl bg-cyan px-5 py-3 text-xs font-black text-ink disabled:opacity-50">
        {loading ? 'Enviando...' : <><Swords size={14} /> Enviar desafio</>}
      </button>
    </div>
  );

  return (
    <Dialog
      open
      onClose={onClose}
      eyebrow="Desafio direto"
      title="Escolha as duas duplas."
      description="Você escolhe os quatro jogadores e propõe um horário. As regras da partida continuam iguais."
      size="xl"
      closeOnBackdrop={false}
      closeLabel="Fechar desafio"
      footer={footer}
    >
      <div className="space-y-6">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-5 rounded-2xl border border-lime/15 bg-lime/[.035] p-4">
            <div><p className="text-xs font-black uppercase tracking-[.15em] text-lime">Sua dupla</p><p className="mt-1 text-xs text-meta">O primeiro jogador é você; escolha quem jogará ao seu lado.</p></div>
            <PlayerPicker options={players} value={value.partnerId} onChange={(partnerId) => onChange({ partnerId })} label="Seu parceiro" helper="Busque por @handle ou nome; o telefone não fica exposto." />
            <div><span className="mb-2 block text-xs font-bold text-white/60">Seu lado da quadra</span><SideSelector value={value.sidePreference} onChange={(sidePreference) => onChange({ sidePreference })} /></div>
          </div>
          <div className="space-y-5 rounded-2xl border border-cyan/15 bg-cyan/[.035] p-4">
            <div><p className="text-xs font-black uppercase tracking-[.15em] text-cyan">Dupla desafiada</p><p className="mt-1 text-xs text-meta">Os dois recebem uma notificação e precisam aceitar.</p></div>
            <PlayerPicker options={players} value={value.targetId} onChange={(targetId) => onChange({ targetId })} label="Jogador adversário" helper="Você pode desafiar alguém fora da sua lista de amigos." />
            <PlayerPicker options={players} value={value.targetPartnerId} onChange={(targetPartnerId) => onChange({ targetPartnerId })} label="Parceiro adversário" helper="A dupla fica preservada durante a partida." />
          </div>
        </div>

        <div>
          <span className="mb-3 block text-xs font-bold text-white/60">Tipo de partida</span>
          <div className="flex gap-1 rounded-xl border border-white/[.1] bg-white/[.035] p-1">
            <button type="button" onClick={() => onChange({ mode: 'ranked' })} className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-black ${value.mode === 'ranked' ? 'bg-white/[.1] text-white' : 'text-white/60'}`}>Ranqueada — vale MMR</button>
            <button type="button" onClick={() => onChange({ mode: 'friendly' })} className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-black ${value.mode === 'friendly' ? 'bg-white/[.1] text-white' : 'text-white/60'}`}>Amistosa — sem ranking</button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-2 block text-xs font-bold text-white/60">Data</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><Clock3 size={15} className="text-cyan" /><input type="date" value={value.date} onChange={(event) => onChange({ date: event.target.value })} className="w-full bg-transparent text-sm text-white outline-none" /></span></label>
          <label className="block"><span className="mb-2 block text-xs font-bold text-white/60">Horário</span><span className="flex items-center gap-3 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3"><Clock3 size={15} className="text-cyan" /><input type="time" value={value.time} onChange={(event) => onChange({ time: event.target.value })} className="w-full bg-transparent text-sm text-white outline-none" /></span></label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Cidade" value={value.city} placeholder="Escolha a cidade" options={cities} onChange={(city) => onChange({ city, clubId: clubIdForCity(value.clubId, city, clubs) })} />
          <SelectField label="Clube" value={value.clubId} placeholder={value.city ? 'Qualquer clube nesta cidade' : 'Qualquer clube'} options={availableClubs.map((club) => ({ label: `${club.name} — ${club.city}`, value: club.id }))} onChange={(clubId) => onChange({ clubId })} />
        </div>

        <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[.04] p-4">
          <p className="text-xs font-bold text-amber-100">Como o desafio funciona</p>
          <p className="mt-1 text-xs leading-relaxed text-soft">A partida não é criada agora. O parceiro e os dois adversários serão notificados; quando os quatro aceitarem, as duplas são fixadas e o jogo aparece no histórico. Desafios ranqueados contra a mesma dupla ficam limitados a duas ocorrências em 14 dias.</p>
        </div>

        {error && <p role="alert" className="rounded-xl border border-coral/20 bg-coral/[.06] p-3 text-sm font-semibold text-coral">{error}</p>}
      </div>
    </Dialog>
  );
}

function MatchSearchInvitationInbox({ invitations, onRemove, onNotice, onSearchUpdated }: { invitations: MatchSearchInvitation[]; onRemove: (id: string) => void; onNotice: (message: string) => void; onSearchUpdated: (search: ActiveMatchSearch | null) => void }) {
  const [loadingId, setLoadingId] = useState('');
  const [error, setError] = useState('');

  async function decide(invitation: MatchSearchInvitation, decision: 'accept' | 'decline') {
    setLoadingId(invitation.id);
    setError('');
    const response = await fetch(`/api/matchmaking/search/invitations/${invitation.id}/decision`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setLoadingId('');
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível responder ao convite.');
    if (data.matchId) return window.location.assign(`/match/${data.matchId}`);
    if (data.search) onSearchUpdated(data.search as ActiveMatchSearch);
    onRemove(invitation.id);
    onNotice(data.message ?? (decision === 'accept' ? 'Convite aceito.' : 'Convite recusado.'));
  }

  async function cancel(invitation: MatchSearchInvitation) {
    setLoadingId(invitation.id);
    setError('');
    const response = await fetch('/api/matchmaking/search', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ searchId: invitation.id }) }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setLoadingId('');
    if (!response?.ok) return setError(data?.error ?? 'Não foi possível cancelar o convite.');
    onRemove(invitation.id);
    onNotice(data.message ?? 'Convite cancelado.');
  }

  return <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-300/10 text-amber-200"><Users size={17} /></span><div><p className="eyebrow text-amber-200">Convites do saguão</p><h2 className="mt-1 text-sm font-black text-white/85">A dupla precisa aceitar</h2><p className="mt-1 text-xs text-white/40">A busca com parceiro só começa quando o convite for aceito e os dois confirmarem.</p></div></div><div className="mt-4 space-y-2">{invitations.map((invitation) => <div key={invitation.id} className="flex flex-col gap-3 rounded-xl border border-white/[.08] bg-black/10 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-bold text-white/75">{invitation.direction === 'incoming' ? `${invitation.player} convidou você` : `Convite enviado para ${invitation.player}`}</p><p className="mt-1 text-[11px] text-white/40">{invitation.playerHandle} • {formatSearchInvitationSummary(invitation)}</p><p className="mt-1 text-[10px] text-white/30">{invitation.mode === 'ranked' ? `Ranqueada • Nível automático: ${invitation.tier}` : 'Amistosa'}</p></div>{invitation.direction === 'incoming' ? <div className="flex gap-2"><button disabled={loadingId === invitation.id} onClick={() => decide(invitation, 'decline')} className="rounded-lg border border-white/[.1] px-3 py-2 text-[11px] font-bold text-white/45 hover:text-white">Recusar</button><button disabled={loadingId === invitation.id} onClick={() => decide(invitation, 'accept')} className="rounded-lg bg-lime px-3 py-2 text-[11px] font-black text-ink">Aceitar e entrar</button></div> : <button disabled={loadingId === invitation.id} onClick={() => cancel(invitation)} className="rounded-lg border border-white/[.1] px-3 py-2 text-[11px] font-bold text-white/45 hover:border-coral/30 hover:text-coral">{loadingId === invitation.id ? 'Cancelando...' : 'Cancelar'}</button>}</div>)}</div>{error && <p className="mt-3 text-[11px] font-semibold text-coral">{error}</p>}</section>;
}

function formatSearchInvitationSummary(invitation: MatchSearchInvitation) {
  const when = invitation.dates.length === 0 ? 'qualquer dia' : invitation.dates.length === 1 ? formatDateOption(invitation.dates[0]) : `${invitation.dates.length} dias disponíveis`;
  const place = invitation.club === 'Qualquer clube' ? invitation.city : `${invitation.club}, ${invitation.city}`;
  return `${when} • ${invitation.from}–${invitation.to} • ${place}`;
}

function SideSelector({ value, onChange }: { value: CourtSide; onChange: (value: CourtSide) => void }) {
  return <div className="grid grid-cols-3 gap-2">{(['left', 'right', 'any'] as const).map((side) => <button key={side} type="button" onClick={() => onChange(side)} className={`rounded-xl border px-3 py-2.5 text-[11px] font-black ${value === side ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-white/[.1] bg-white/[.03] text-white/45 hover:border-white/20 hover:text-white'}`}>{sideLabel(side)}</button>)}</div>;
}

function SelectField({ label, value, placeholder, options, onChange, disabled = false }: { label: string; value: string; placeholder: string; options: string[] | { label: string; value: string }[]; onChange: (value: string) => void; disabled?: boolean }) {
  const normalizedOptions = options.map((option) => typeof option === 'string' ? { label: option, value: option } : option);
  return <label className="block"><span className="mb-2 block text-[11px] font-bold text-white/45">{label}</span><span className={`flex items-center gap-2 rounded-xl border border-white/[.1] bg-white/[.035] px-3 py-3 focus-within:ring-2 focus-within:ring-lime/40 ${disabled ? 'opacity-45' : ''}`}><select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="w-full bg-transparent text-xs text-white outline-none disabled:cursor-not-allowed"><option value="" className="bg-[#121820]">{placeholder}</option>{normalizedOptions.map((option) => <option key={option.value} value={option.value} className="bg-[#121820]">{option.label}</option>)}</select><ChevronDown size={14} className="pointer-events-none shrink-0 text-white/25" /></span></label>;
}

function LobbyStep({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-lime/10 text-[10px] font-black text-lime">{number}</span><span><span className="block text-xs font-black text-white/75">{title}</span><span className="mt-0.5 block text-[10px] text-white/35">{text}</span></span></div>;
}

function Info({ icon: Icon, title, text }: { icon: typeof Clock3; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/[.07] bg-white/[.02] p-4"><Icon size={17} className="text-lime" /><p className="mt-3 text-xs font-bold text-white/75">{title}</p><p className="mt-1 text-[11px] leading-relaxed text-white/35">{text}</p></div>;
}
