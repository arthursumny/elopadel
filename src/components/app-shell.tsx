'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  History,
  LayoutDashboard,
  Medal,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trophy,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/notification-bell';
import { SignOutButton } from '@/components/sign-out-button';

type NavItem = { href: string; label: string; shortLabel?: string; icon: LucideIcon; highlight?: boolean };

const playerNavItems: NavItem[] = [
  { href: '/', label: 'Visão geral', shortLabel: 'Início', icon: LayoutDashboard },
  { href: '/matchmaking', label: 'Encontrar partida', shortLabel: 'Jogar', icon: Search, highlight: true },
  { href: '/ranking', label: 'Ranking', icon: Trophy },
  { href: '/history', label: 'Histórico', icon: History },
  { href: '/friends', label: 'Amigos', icon: UsersRound },
];

const careerNavItems: NavItem[] = [
  { href: '/season', label: 'Temporada global', icon: Medal },
  { href: '/profile', label: 'Meu perfil', icon: UserRound },
];

const adminNavItems: NavItem[] = [{ href: '/admin', label: 'Visão geral', icon: LayoutDashboard }];

function isNavItemActive(pathname: string, href: string) {
  if (href === '/matchmaking') return pathname === href || pathname.startsWith('/match/');
  return pathname === href;
}

export function Brand({ compact = false, href = '/' }: { compact?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn('flex items-center gap-3', compact && 'justify-center')}>
      <Image src="/brand/logo-mark.png" alt="Elo Padel" width={36} height={36} className="h-9 w-9 object-contain" priority />
      {!compact && <span className="text-[15px] font-black tracking-tight">ELO <span className="font-normal text-white/60">PADEL</span></span>}
    </Link>
  );
}

export function AppShell({
  children,
  playerName,
  playerInitials,
  role = 'player',
}: {
  children: ReactNode;
  playerName?: string;
  playerInitials?: string;
  role?: 'player' | 'admin';
}) {
  const pathname = usePathname();
  const isAdmin = role === 'admin';
  const navItems = isAdmin ? adminNavItems : playerNavItems;
  const homeHref = isAdmin ? '/admin' : '/';
  const displayName = playerName ?? (isAdmin ? 'Administrador' : 'Jogador');
  const initials = playerInitials ?? (isAdmin ? 'AD' : 'JO');
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileItems = playerNavItems.slice(0, 4);
  const moreItems = [playerNavItems[4], ...careerNavItems];
  const moreActive = moreItems.some((item) => isNavItemActive(pathname, item.href));
  const sectionLabel = isAdmin
    ? 'Operação da plataforma'
    : pathname === '/season' || pathname === '/profile'
      ? 'Sua carreira'
      : 'Competição';

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (morePanelRef.current?.contains(target) || moreButtonRef.current?.contains(target)) return;
      setMoreOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [moreOpen]);

  return (
    <div className="app-gradient min-h-screen lg:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-lime focus:px-4 focus:py-2 focus:text-xs focus:font-black focus:text-ink"
      >
        Pular para o conteúdo
      </a>

      <aside className="hidden w-[248px] shrink-0 border-r border-white/[.07] bg-black/10 px-5 py-7 lg:flex lg:flex-col">
        <Brand href={homeHref} />
        <div className="mt-12 flex-1 space-y-1">
          <p className="tiny-label mb-4 px-3">{isAdmin ? 'Administração' : 'Competição'}</p>
          <nav aria-label="Navegação principal" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition',
                    active ? 'bg-white/[.09] text-white' : 'text-white/60 hover:bg-white/[.05] hover:text-white',
                    item.highlight && !active && 'text-lime/85',
                  )}
                >
                  <Icon size={17} strokeWidth={active ? 2.3 : 1.8} className={cn(active && 'text-lime')} aria-hidden="true" />
                  <span>{item.label}</span>
                  {item.highlight && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-lime" aria-hidden="true" />}
                </Link>
              );
            })}
          </nav>

          {!isAdmin && (
            <>
              <div className="my-7 border-t border-white/[.07]" />
              <p className="tiny-label mb-4 px-3">Sua carreira</p>
              <nav aria-label="Sua carreira" className="space-y-1">
                {careerNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isNavItemActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-medium transition',
                        active ? 'bg-white/[.09] text-white' : 'text-white/60 hover:bg-white/[.05] hover:text-white',
                      )}
                    >
                      <Icon size={17} className={cn(active && 'text-lime')} aria-hidden="true" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </>
          )}
        </div>

        {isAdmin && (
          <div className="rounded-2xl border border-white/[.07] bg-white/[.035] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-white/80">
              <ShieldCheck size={14} className="text-cyan" aria-hidden="true" /> Operação da plataforma
            </div>
            <p className="mt-2 text-xs leading-relaxed text-meta">Cadastre clubes e acompanhe as pendências que precisam de atenção.</p>
          </div>
        )}
      </aside>

      <main id="conteudo" tabIndex={-1} className="min-w-0 flex-1 mobile-bottom-space">
        <header className="flex h-[76px] items-center justify-between gap-3 border-b border-white/[.07] px-5 sm:px-8 lg:px-12">
          <div className="lg:hidden"><Brand href={homeHref} /></div>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="h-2 w-2 rounded-full bg-lime pulse-lime" aria-hidden="true" />
            <span className="text-xs font-medium text-soft">{sectionLabel}</span>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {!isAdmin && <NotificationBell />}
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <div aria-label="Sessão administrativa" className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] py-1.5 pl-1.5 pr-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan/15 text-[11px] font-bold text-cyan">{initials}</span>
                  <span className="hidden text-xs font-semibold text-white/80 sm:block">{displayName}</span>
                </div>
                <SignOutButton redirectTo="/admin/login" />
              </div>
            ) : (
              <Link
                href="/profile"
                aria-label={`Abrir perfil de ${displayName}`}
                className="flex items-center gap-3 rounded-xl border border-white/[.07] bg-white/[.025] py-1.5 pl-1.5 pr-3 transition hover:border-white/20"
              >
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan/15 text-[11px] font-bold text-cyan">{initials}</span>
                <span className="hidden text-xs font-semibold text-white/80 sm:block">{displayName}</span>
              </Link>
            )}
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-12">{children}</div>
      </main>

      {!isAdmin && (
        <nav
          aria-label="Navegação rápida"
          className="fixed inset-x-3 bottom-3 z-30 flex h-16 items-center justify-around rounded-2xl border border-white/[.12] bg-[#111720]/95 px-2 shadow-2xl backdrop-blur-xl lg:hidden"
          style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {mobileItems.map((item) => {
            const Icon = item.icon;
            const active = isNavItemActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold',
                  active ? 'text-lime' : 'text-white/60',
                )}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{item.shortLabel ?? item.label.split(' ')[0]}</span>
              </Link>
            );
          })}
          <button
            ref={moreButtonRef}
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-more"
            onClick={() => setMoreOpen((current) => !current)}
            className={cn(
              'flex min-h-11 min-w-[56px] flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2 text-[11px] font-semibold',
              moreActive || moreOpen ? 'text-lime' : 'text-white/60',
            )}
          >
            <MoreHorizontal size={18} aria-hidden="true" />
            <span>Mais</span>
          </button>
        </nav>
      )}

      {!isAdmin && moreOpen && (
        <div
          id="mobile-more"
          ref={morePanelRef}
          className="fixed inset-x-3 z-40 rounded-2xl border border-white/[.14] bg-[#111b25] p-2 shadow-2xl lg:hidden"
          style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        >
          <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-[.14em] text-meta">Mais opções</p>
          <div className="space-y-1">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const active = isNavItemActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl px-3 py-3 text-[13px] font-semibold transition',
                    active ? 'bg-white/[.09] text-white' : 'text-white/75 hover:bg-white/[.05] hover:text-white',
                  )}
                >
                  <Icon size={17} className={cn(active && 'text-lime')} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
