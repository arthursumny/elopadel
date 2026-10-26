'use client';

import { Bell, CheckCheck, CircleAlert, Info, Swords, UserPlus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AppNotification } from '@/lib/types';

function notificationIcon(type: string) {
  if (type.includes('friend')) return UserPlus;
  if (type.includes('match') || type.includes('result') || type.includes('room')) return Swords;
  if (type.includes('attendance')) return CircleAlert;
  return Info;
}

function notificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
}

export function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  async function refresh() {
    if (!enabled) return;
    const response = await fetch('/api/notifications', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json().catch(() => ({}));
    setNotifications(data.notifications ?? []);
    setUnreadCount(Number(data.unreadCount ?? 0));
  }

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const interval = window.setInterval(refresh, 30000);
    return () => window.clearInterval(interval);
  }, [enabled]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [open]);

  async function markRead(id?: string) {
    await fetch('/api/notifications', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(id ? { id } : {}) }).catch(() => null);
    if (id) {
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
      setUnreadCount((current) => Math.max(0, current - 1));
    } else {
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
      setUnreadCount(0);
    }
  }

  async function openNotification(item: AppNotification) {
    if (!item.readAt) await markRead(item.id);
    if (item.href) window.location.assign(item.href);
    else setOpen(false);
  }

  if (!enabled) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={unreadCount > 0 ? `${unreadCount} notificações não lidas` : 'Notificações'}
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          if (!open) refresh();
        }}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-white/[.07] text-white/70 transition hover:border-lime/30 hover:text-white"
      >
        <Bell size={17} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-coral px-1 text-[11px] font-black leading-none text-white" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/[.1] bg-[#111820] shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/[.07] px-4 py-3">
            <div>
              <p className="text-sm font-black text-white/90">Notificações</p>
              <p className="mt-1 text-xs text-meta">Atualizadas automaticamente</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={unreadCount === 0 || loading}
                onClick={async () => {
                  setLoading(true);
                  await markRead();
                  setLoading(false);
                }}
                className="rounded-lg p-2 text-white/60 hover:bg-white/[.06] hover:text-lime disabled:opacity-40"
                aria-label="Marcar todas como lidas"
              >
                <CheckCheck size={15} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
                className="rounded-lg p-2 text-white/60 hover:bg-white/[.06] hover:text-white"
                aria-label="Fechar notificações"
              >
                <X size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          {notifications.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Bell size={22} className="mx-auto text-white/35" aria-hidden="true" />
              <p className="mt-3 text-sm font-bold text-white/80">Tudo em dia.</p>
              <p className="mt-1 text-xs leading-relaxed text-meta">Seus convites e atualizações aparecerão aqui.</p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {notifications.map((item) => {
                const Icon = notificationIcon(item.type);
                const read = Boolean(item.readAt);
                const content = (
                  <>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${read ? 'bg-white/[.06] text-white/55' : 'bg-lime/10 text-lime'}`}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-xs font-bold ${read ? 'text-white/75' : 'text-white/90'}`}>
                          <span className="sr-only">{read ? 'Lida: ' : 'Não lida: '}</span>{item.title}
                        </span>
                        {!read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" aria-hidden="true" />}
                      </span>
                      <span className={`mt-1 block text-xs leading-relaxed ${read ? 'text-meta' : 'text-soft'}`}>{item.body}</span>
                      <span className="mt-1.5 block text-[11px] text-meta">{notificationTime(item.createdAt)}</span>
                    </span>
                  </>
                );

                return item.href ? (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openNotification(item)}
                    className={`flex w-full gap-3 border-b border-white/[.05] px-4 py-3 text-left transition hover:bg-white/[.04] ${read ? 'bg-black/10' : 'bg-white/[.025]'}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div key={item.id} className={`flex gap-3 border-b border-white/[.05] px-4 py-3 ${read ? 'bg-black/10' : 'bg-white/[.025]'}`}>
                    {content}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
