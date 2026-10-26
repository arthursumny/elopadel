import { AdminDirectory } from '@/components/admin-directory';
import { AdminSyncGripoButton } from '@/components/admin-sync-gripo-button';
import { AppShell } from '@/components/app-shell';
import { ClubRegisterForm } from '@/components/club-register-form';
import { requireAdminSession } from '@/lib/auth';
import { loadAdminDirectory, loadAdminOverview } from '@/lib/db/queries';
import { AlertTriangle, Building2, Check, Clock3, ShieldCheck, Users } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdminSession();
  const [overview, directory] = await Promise.all([loadAdminOverview(), loadAdminDirectory()]);
  const cards = [
    { label: 'Jogadores cadastrados', value: overview.players, detail: 'contas criadas na plataforma', icon: Users, color: 'lime' },
    { label: 'Partidas aguardando aceite', value: overview.rooms, detail: 'formadas pelo matchmaking', icon: Clock3, color: 'cyan' },
    { label: 'Clubes cadastrados', value: overview.clubs, detail: 'clubes disponíveis na plataforma', icon: Building2, color: 'amber' },
    { label: 'Pendências', value: overview.pendingMemberships + overview.disputedMatches, detail: `${overview.pendingMemberships} vínculos • ${overview.disputedMatches} contestações`, icon: AlertTriangle, color: 'coral' },
  ];

  return <AppShell role="admin">
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="eyebrow">Operação da plataforma</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.05em] sm:text-4xl">Painel do Elo Padel.</h1>
          <p className="mt-2 text-sm text-soft">Cadastre clubes, acompanhe as decisões e gerencie os perfis da rede.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AdminSyncGripoButton />
          <ClubRegisterForm />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return <div key={card.label} className="glass rounded-2xl p-4 sm:p-5">
            <span className={`grid h-9 w-9 place-items-center rounded-xl ${card.color === 'lime' ? 'bg-lime/10 text-lime' : card.color === 'cyan' ? 'bg-cyan/10 text-cyan' : card.color === 'amber' ? 'bg-amber-300/10 text-amber-300' : 'bg-coral/10 text-coral'}`}>
              <Icon size={17} aria-hidden="true" />
            </span>
            <p className="mt-4 text-[11px] font-bold uppercase tracking-[.13em] text-meta">{card.label}</p>
            <p className="mt-1 text-2xl font-black">{card.value.toLocaleString('pt-BR')}</p>
            <p className="mt-1 text-xs leading-relaxed text-soft">{card.detail}</p>
          </div>;
        })}
      </section>

      <AdminDirectory initialPlayers={directory.players} initialClubs={directory.clubs} />

      <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="glass overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-white/[.07] px-5 py-4">
            <div>
              <p className="text-sm font-bold">Solicitações recentes</p>
              <p className="mt-1 text-[11px] text-meta">O clube decide se aprova ou recusa cada vínculo.</p>
            </div>
            <span className="rounded-lg bg-amber-300/10 px-2 py-1 text-[11px] font-bold text-amber-300">{overview.pendingMemberships} pendentes</span>
          </div>
          {overview.recentMemberships.length === 0 ? <div className="px-5 py-16 text-center">
            <Building2 className="mx-auto text-white/35" size={24} />
            <p className="mt-4 text-sm font-bold text-white/70">Ainda não há solicitações.</p>
            <p className="mt-2 text-xs text-meta">Os jogadores aparecerão aqui depois de escolher um clube.</p>
          </div> : <div className="divide-y divide-white/[.055]">
            {overview.recentMemberships.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[.07] text-[11px] font-bold text-white/60">{item.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-white/75">{item.name}</p>
                <p className="mt-1 text-[11px] text-meta">{item.phone} <span className="mx-1 text-white/15">•</span> {item.club}</p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-[11px] font-bold ${item.status === 'approved' ? 'bg-lime/10 text-lime' : item.status === 'rejected' ? 'bg-coral/10 text-coral' : 'bg-amber-300/10 text-amber-300'}`}>
                {item.status === 'approved' ? <><Check size={11} className="mr-1 inline" />Aprovado</> : item.status === 'rejected' ? 'Recusado' : 'Pendente'}
              </span>
            </div>)}
          </div>}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-cyan/15 bg-cyan/[.05] p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan"><ShieldCheck size={15} /> Acesso dos clubes</div>
            <p className="mt-3 text-sm font-bold text-white/80">Cada clube tem seu próprio login.</p>
            <p className="mt-1 text-[11px] leading-relaxed text-soft">O clube recebe as solicitações de vínculo e toma a decisão diretamente.</p>
          </div>
          <div className="rounded-2xl border border-coral/15 bg-coral/[.05] p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-coral"><AlertTriangle size={15} /> Contestações</div>
            <p className="mt-3 text-2xl font-black">{overview.disputedMatches}</p>
            <p className="mt-1 text-[11px] text-soft">resultados aguardando análise.</p>
          </div>
        </div>
      </section>
    </div>
  </AppShell>;
}
