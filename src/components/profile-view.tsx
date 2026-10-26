'use client';

import { AppShell } from '@/components/app-shell';
import { RankEmblem } from '@/components/rank-emblem';
import { SignOutButton } from '@/components/sign-out-button';
import { progressPercent } from '@/lib/ranks';
import { ProfileEditor } from '@/components/profile-editor';
import { clubNameFor, type ProfileClub, type ProfileEditSnapshot } from '@/lib/profile-edit-ui';
import type { Player } from '@/lib/types';
import { Award, Globe2, MapPin, Pencil, Phone, ShieldCheck, Trash2, Trophy, UserRound, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ProfileView({ player }: { player: Player }) {
  const nextRank = player.rank.tier.order < 19 ? player.rank.tier.order + 1 : player.rank.tier.order;
  const nextRankLabel = ['6ª III', '6ª II', '6ª I', '5ª III', '5ª II', '5ª I', '4ª III', '4ª II', '4ª I', '3ª III', '3ª II', '3ª I', '2ª III', '2ª II', '2ª I', '1ª III', '1ª II', '1ª I', 'Elite', 'Challenger'][nextRank] ?? player.rank.tier.label;
  const phone = player.phone ? maskPhone(player.phone) : 'Protegido';
  const [editorOpen, setEditorOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ProfileEditSnapshot | null>(null);
  const [pendingClubName, setPendingClubName] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me/profile', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        return data.profile as ProfileEditSnapshot | undefined;
      })
      .then(async (profile) => {
        if (cancelled || !profile) return;
        setSnapshot(profile);
        if (profile.clubStatus !== 'pending' || !profile.clubId) return;
        const catalog = await fetch('/api/clubs', { cache: 'no-store' }).then((response) => response.ok ? response.json() : null).catch(() => null);
        if (!cancelled) setPendingClubName(clubNameFor(profile, (catalog?.clubs ?? []) as ProfileClub[]));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  function handleSaved(profile: ProfileEditSnapshot, pendingName: string | null) {
    setSnapshot(profile);
    setPendingClubName(pendingName);
    setEditorOpen(false);
    const message = profile.clubStatus === 'pending'
      ? `Solicitação enviada${pendingName ? ` para ${pendingName}` : ''}. O novo clube precisa aprovar seu vínculo.`
      : profile.clubStatus === 'approved'
        ? 'Clube principal atualizado.'
        : 'Clube principal removido.';
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4200);
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Tem certeza de que deseja excluir permanentemente sua conta? Esta ação desvinculará seu login e não pode ser desfeita.')) {
      return;
    }
    await fetch('/api/me', { method: 'DELETE' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <AppShell playerName={player.displayName} playerInitials={player.initials}>
      <div className="space-y-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">Seu perfil competitivo</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">{player.displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-soft">
              <MapPin size={14} aria-hidden="true" /> {player.city}, {player.state} <span className="text-white/25">•</span> <span className="text-lime">{player.handle}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setEditorOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-lime/20 bg-lime/[.06] px-4 py-3 text-xs font-bold text-lime transition hover:bg-lime/15"
            >
              <Pencil size={14} aria-hidden="true" /> Editar perfil
            </button>
            <SignOutButton redirectTo="/login" align="left" />
            <button
              type="button"
              onClick={handleDeleteAccount}
              className="flex items-center gap-2 rounded-xl border border-white/[.06] bg-transparent px-3 py-3 text-xs font-medium text-white/60 transition hover:border-coral/30 hover:text-coral"
            >
              <Trash2 size={14} aria-hidden="true" /> Excluir conta
            </button>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
          <div className="glass relative overflow-hidden rounded-3xl p-6 sm:p-8">
            <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan/10 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
              <RankEmblem label={player.rank.tier.label} size="lg" accent={player.rank.tier.accent} />
              <div>
                <p className="eyebrow">Patente atual</p>
                <h2 className="mt-2 text-3xl font-black">{player.rank.tier.label}</h2>
                <p className="mt-1 text-sm text-soft">{player.rank.points} pontos • {player.rating.provisional ? 'classificação provisória' : 'MMR consolidado'}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <span className="rounded-lg border border-lime/15 bg-lime/[.06] px-2.5 py-1.5 text-[11px] font-bold text-lime">{formatPosition(player.clubPosition)} no clube</span>
                  <span className="rounded-lg border border-white/[.08] bg-white/[.04] px-2.5 py-1.5 text-[11px] font-bold text-white/70">{formatPosition(player.cityPosition)} na cidade</span>
                </div>
              </div>
            </div>
            <div className="relative mt-8 border-t border-white/[.07] pt-5">
              <div className="flex justify-between gap-3 text-xs font-bold">
                <span className="text-soft">{player.rank.points} / 100 pontos</span>
                <span className="text-cyan">Próxima: {nextRankLabel}</span>
              </div>
              <div
                className="mt-2 h-2 overflow-hidden rounded-full bg-black/25"
                role="progressbar"
                aria-label="Progresso até a próxima patente"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent(player.rank.points)}
              >
                <div className="h-full rounded-full bg-gradient-to-r from-cyan to-lime" style={{ width: `${progressPercent(player.rank.points)}%` }} />
              </div>
            </div>
          </div>

          <div className="glass rounded-3xl p-6 sm:p-8">
            <div className="flex items-start justify-between">
              <div>
                <p className="eyebrow">Conquistas</p>
                <h2 className="mt-2 text-2xl font-black">Sua vitrine</h2>
              </div>
              <Award className="text-amber-300" size={23} aria-hidden="true" />
            </div>
            <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
              <Achievement icon="🔥" title="Sequência em alta" detail={`${player.streak} vitórias`} active={player.streak >= 3} />
              <Achievement icon="↗" title="Em evolução" detail={player.rank.tier.label} active={player.rating.matches > 0} />
              <Achievement icon="♛" title="Temporada" detail={`${player.seasonPoints} pontos`} active={player.seasonPoints > 0} />
              <Achievement icon="⚡" title="Zebra" detail="Em busca" />
              <Achievement icon="◎" title="Veterano" detail={`${player.rating.matches} partidas`} active={player.rating.matches >= 10} />
              <Achievement icon="✦" title="Top 100" detail={formatPosition(player.globalPosition)} active={player.globalPosition > 0 && player.globalPosition <= 100} />
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold">Informações pessoais</p>
                <p className="mt-1 text-xs text-meta">Dados usados no seu perfil competitivo</p>
              </div>
              <UserRound size={17} className="text-cyan" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-4">
              <ProfileRow icon={UserRound} label="Nome de exibição" value={player.displayName} />
              <ProfileRow icon={Phone} label="Celular" value={phone} />
              <ProfileRow icon={MapPin} label="Localização do ranking" value={`${player.city}, ${player.state}, ${player.country}`} />
              <ProfileRow icon={Globe2} label="Clube principal" value={snapshot?.currentClub?.name ?? (snapshot ? 'Sem clube principal' : player.club)} />
            </div>
            {snapshot?.clubStatus === 'pending' && (
              <p role="status" className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-3 text-xs leading-relaxed text-amber-100">
                Vínculo aguardando aprovação{pendingClubName ? `: ${pendingClubName}` : ''}. O novo clube precisa aprovar seu vínculo.
              </p>
            )}
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-bold">Privacidade e acesso</p>
              <ShieldCheck size={17} className="text-lime" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-3">
              <PrivacyRow icon={Phone} title="Telefone" detail="Seu telefone fica mascarado nesta tela." />
              <PrivacyRow icon={Trophy} title="Ranking" detail="Sua posição vem do MMR e das partidas registradas." />
              <PrivacyRow icon={ShieldCheck} title="Sessão" detail="Use Sair para encerrar o acesso neste navegador." />
            </div>
          </div>
        </section>
      </div>

      <ProfileEditor open={editorOpen} onClose={() => setEditorOpen(false)} onSaved={handleSaved} />

      {notice && <div role="status" aria-live="polite" className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-lime/20 bg-[#172018] px-4 py-3 text-center text-xs font-bold text-lime shadow-2xl md:bottom-8">{notice}</div>}
    </AppShell>
  );
}

function formatPosition(position: number) {
  return position ? `#${position.toLocaleString('pt-BR')}` : '—';
}

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? `+${digits.slice(0, 2)} ${digits.slice(2, 4)} *****-${digits.slice(-4)}` : 'Protegido';
}

function Achievement({ icon, title, detail, active = false }: { icon: string; title: string; detail: string; active?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-xl border p-2.5 text-center sm:p-3 ${active ? 'border-amber-300/15 bg-amber-300/[.05]' : 'border-white/[.07] bg-white/[.02]'}`}>
      <span className={`text-xl ${active ? '' : 'opacity-45 grayscale'}`} aria-hidden="true">{icon}</span>
      <p className="mt-2 text-[11px] font-bold leading-snug text-white/85">{title}</p>
      <p className="mt-1 text-[11px] leading-snug text-meta">{detail}</p>
    </div>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[.06] text-white/55"><Icon size={14} aria-hidden="true" /></span>
      <div className="flex-1">
        <p className="text-[11px] text-meta">{label}</p>
        <p className="mt-1 text-sm font-bold text-white/80">{value}</p>
      </div>
    </div>
  );
}

function PrivacyRow({ icon: Icon, title, detail }: { icon: LucideIcon; title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-3">
      <div className="flex items-center gap-2 text-xs font-bold text-white/80">
        <Icon size={14} className="text-lime" aria-hidden="true" /> {title}
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-soft">{detail}</p>
    </div>
  );
}
