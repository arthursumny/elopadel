'use client';

import { LogOut } from 'lucide-react';
import { useId, useState } from 'react';

type LogoutRequest = () => Promise<Pick<Response, 'ok'>>;

/**
 * Returns false for HTTP and network failures. Callers must only treat the
 * session as ended after a successful response.
 */
export async function requestLogout(
  request: LogoutRequest = () => fetch('/api/auth/logout', { method: 'POST' }),
): Promise<boolean> {
  try {
    const response = await request();
    return response.ok;
  } catch {
    return false;
  }
}

export function SignOutButton({
  redirectTo,
  label = 'Sair',
  align = 'right',
}: {
  redirectTo: string;
  label?: string;
  align?: 'left' | 'right';
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const errorId = useId();
  const loading = status === 'loading';

  async function signOut() {
    setStatus('loading');
    const ok = await requestLogout();
    if (!ok) {
      setStatus('error');
      return;
    }
    window.location.href = redirectTo;
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={signOut}
        disabled={loading}
        aria-label="Sair da conta"
        aria-busy={loading}
        aria-describedby={status === 'error' ? errorId : undefined}
        className="flex items-center justify-center gap-2 rounded-xl border border-white/[.12] bg-white/[.04] px-3 py-2.5 text-xs font-bold text-white/75 transition hover:border-coral/40 hover:text-coral disabled:cursor-wait disabled:opacity-60"
      >
        <LogOut size={14} aria-hidden="true" />
        <span>{loading ? 'Saindo...' : label}</span>
      </button>

      {status === 'error' && (
        <div
          id={errorId}
          role="alert"
          className={`absolute top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-coral/25 bg-[#1b171b] p-3 text-left shadow-2xl ${align === 'left' ? 'left-0' : 'right-0'}`}
        >
          <p className="text-xs font-semibold text-white/90">Não foi possível sair agora.</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 rounded-lg bg-coral/10 px-2.5 py-1.5 text-xs font-bold text-coral transition hover:bg-coral/20"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
