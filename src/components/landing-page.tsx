import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  History,
  ShieldCheck,
  Swords,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { Brand } from '@/components/app-shell';

type FeatureItem = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  accent: 'lime' | 'cyan' | 'coral';
};

const features: FeatureItem[] = [
  {
    icon: Swords,
    eyebrow: 'Equilíbrio em quadra',
    title: 'Matchmaking por nível',
    description:
      'Encontre jogos compatíveis com a sua categoria, lado de quadra e cidade. Os 4 jogadores confirmam presença antes da partida começar.',
    accent: 'lime',
  },
  {
    icon: ShieldCheck,
    eyebrow: 'Consenso entre os 4',
    title: 'Placar validado por votos',
    description:
      'Nada de resultado lançado sozinho. Após o jogo, os próprios jogadores votam no placar; com 3 confirmações iguais, o resultado é validado.',
    accent: 'cyan',
  },
  {
    icon: Trophy,
    eyebrow: 'Da 6ª categoria ao Elite',
    title: 'Ranking e temporada',
    description:
      'Seu MMR e sua patente evoluem apenas em partidas validadas. Dispute posição na sua cidade, no seu clube e na temporada global.',
    accent: 'lime',
  },
  {
    icon: History,
    eyebrow: 'Carreira registrada',
    title: 'Histórico do jogador',
    description:
      'Acompanhe vitórias, sequência atual, evolução de patente, parceiros de dupla e cada placar oficial que construiu a sua trajetória.',
    accent: 'coral',
  },
];

export function LandingPage() {
  return (
    <div className="app-gradient flex min-h-screen flex-col text-white">
      <header className="border-b border-white/[.07] bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Brand href="/" />
          <nav aria-label="Acesso à plataforma" className="flex items-center gap-2.5 sm:gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-white/[.12] bg-white/[.035] px-4 py-2.5 text-xs font-bold text-white/85 transition hover:border-white/25 hover:bg-white/[.07] hover:text-white"
            >
              Entrar
            </Link>
            <Link
              href="/login?view=register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2.5 text-xs font-black text-ink shadow-[0_0_25px_rgba(201,255,74,.18)] transition hover:bg-lime/90"
            >
              Criar conta
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-16">
          <div className="grid items-center gap-10 lg:grid-cols-[1.08fr_.92fr] lg:gap-12">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-lime/20 bg-lime/[.07] px-3.5 py-1.5">
                <span className="h-2 w-2 rounded-full bg-lime pulse-lime" aria-hidden="true" />
                <span className="eyebrow">Competição real para jogadores de padel</span>
              </div>

              <h1 className="mt-5 text-4xl font-black leading-[.96] tracking-[-.06em] text-white sm:text-5xl lg:text-6xl">
                Padel competitivo, medido de verdade.
              </h1>

              <p className="mt-5 max-w-xl text-base leading-relaxed text-soft sm:text-lg">
                O Elo Padel organiza partidas equilibradas por nível, registra placares validados pelos próprios jogadores e mantém ranking e temporada para quem leva a quadra a sério.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/login?view=register"
                  className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-4 text-xs font-black text-ink shadow-[0_0_32px_rgba(201,255,74,.22)] transition hover:bg-lime/90"
                >
                  Criar conta e começar
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/[.12] bg-white/[.04] px-6 py-4 text-xs font-bold text-white/85 transition hover:border-lime/30 hover:text-white"
                >
                  Já tenho conta
                </Link>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-3 border-t border-white/[.08] pt-7 sm:gap-6">
                <div>
                  <dt className="tiny-label">Confirmação</dt>
                  <dd className="mt-1.5 text-lg font-black text-white sm:text-xl">4 jogadores</dd>
                  <p className="mt-0.5 text-xs text-meta">presença fechada antes do jogo</p>
                </div>
                <div>
                  <dt className="tiny-label">Validação</dt>
                  <dd className="mt-1.5 text-lg font-black text-cyan sm:text-xl">3 de 4 votos</dd>
                  <p className="mt-0.5 text-xs text-meta">placar auditado pela quadra</p>
                </div>
                <div>
                  <dt className="tiny-label">Progressão</dt>
                  <dd className="mt-1.5 text-lg font-black text-lime sm:text-xl">6ª ao Elite</dd>
                  <p className="mt-0.5 text-xs text-meta">patentes e temporada global</p>
                </div>
              </dl>
            </div>

            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-3 rounded-[2rem] bg-gradient-to-tr from-lime/15 via-cyan/10 to-transparent blur-2xl"
                aria-hidden="true"
              />
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-3xl border border-white/[.12] bg-panel shadow-glow sm:aspect-[5/4] lg:aspect-[4/4.6]">
                <Image
                  src="/login-hero.jpg"
                  alt="Jogadores em quadra de padel disputando partida ranqueada"
                  fill
                  priority
                  sizes="(min-width: 1024px) 44vw, 100vw"
                  className="object-cover object-center"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink via-ink/35 to-transparent" />

                <div className="absolute inset-x-4 bottom-4 sm:inset-x-6 sm:bottom-6">
                  <div className="glass rounded-2xl p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="eyebrow">Partida ranqueada • validada</span>
                      <span className="inline-flex items-center gap-1 rounded-md border border-lime/25 bg-lime/10 px-2 py-0.5 text-[11px] font-bold text-lime">
                        <CheckCircle2 size={12} aria-hidden="true" /> 3/4 votos confirmados
                      </span>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between gap-4 border-t border-white/[.08] pt-3">
                      <div>
                        <p className="text-xs font-bold text-white/90">Dupla A vs. Dupla B</p>
                        <p className="mt-0.5 text-[11px] text-meta">MMR atualizado • +24 pts na temporada</p>
                      </div>
                      <p className="font-mono text-lg font-black tracking-tight text-white">6/4 • 6/3</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="recursos-heading"
          className="mx-auto max-w-6xl border-t border-white/[.07] px-5 py-16 sm:px-8 sm:py-20"
        >
          <div className="max-w-2xl">
            <p className="eyebrow">Como funciona na prática</p>
            <h2 id="recursos-heading" className="mt-3 text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">
              Feito para organizar o jogo e proteger o ranking.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-soft sm:text-base">
              Sem planilhas paralelas e sem placar combinado no grito: cada etapa da partida passa pelos quatro jogadores em quadra.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              const badgeColor =
                feature.accent === 'lime'
                  ? 'bg-lime/10 text-lime border-lime/20'
                  : feature.accent === 'cyan'
                    ? 'bg-cyan/10 text-cyan border-cyan/20'
                    : 'bg-coral/10 text-coral border-coral/20';

              return (
                <article
                  key={feature.title}
                  className="glass flex flex-col justify-between rounded-2xl p-6 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`grid h-11 w-11 place-items-center rounded-xl border ${badgeColor}`}
                      >
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="tiny-label">{feature.eyebrow}</span>
                    </div>
                    <h3 className="mt-6 text-lg font-black tracking-[-.03em] text-white">
                      {feature.title}
                    </h3>
                    <p className="mt-2.5 text-xs leading-relaxed text-soft sm:text-sm">
                      {feature.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8 sm:pb-24">
          <div className="relative overflow-hidden rounded-3xl border border-lime/20 bg-gradient-to-br from-[#18231e] via-[#111a1b] to-[#10141c] p-7 shadow-glow sm:p-10 lg:p-12">
            <div
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-lime/10 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
              <div className="max-w-xl">
                <p className="eyebrow">Sua carreira começa na quadra</p>
                <h2 className="mt-3 text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">
                  Escolha sua categoria inicial e entre na fila hoje.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-soft sm:text-base">
                  Crie seu perfil com sua arroba, selecione seu clube de preferência e dispute partidas validadas na sua cidade.
                </p>
              </div>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link
                  href="/login?view=register"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-lime px-6 py-4 text-xs font-black text-ink transition hover:bg-lime/90"
                >
                  Criar conta agora
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-xl border border-white/[.14] bg-white/[.04] px-6 py-4 text-xs font-bold text-white/85 transition hover:border-white/30 hover:text-white"
                >
                  Entrar
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-white/[.07] bg-black/20">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 text-xs text-meta sm:flex-row sm:px-8">
        <div className="flex items-center gap-3">
          <Brand href="/" compact />
          <span>© 2026 Elo Padel</span>
        </div>
        <nav aria-label="Links institucionais" className="flex flex-wrap items-center gap-6">
          <Link href="/termos" className="font-semibold text-soft transition hover:text-lime">
            Termos de uso
          </Link>
          <Link href="/privacidade" className="font-semibold text-soft transition hover:text-lime">
            Política de Privacidade
          </Link>
        </nav>
      </div>
    </footer>
  );
}
