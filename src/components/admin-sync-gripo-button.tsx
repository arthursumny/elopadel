'use client';

import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AdminSyncGripoButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch('/api/admin/sync-gripo', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Falha ao sincronizar com o Gripo.');
      } else {
        setMessage(data.message || 'Clubes sincronizados com sucesso!');
        router.refresh();
      }
    } catch {
      setError('Erro de conexão ao sincronizar.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSync}
        disabled={loading}
        className="flex items-center gap-2 rounded-xl border border-cyan/25 bg-cyan/[.08] px-4 py-3 text-xs font-bold text-cyan hover:bg-cyan/15 disabled:opacity-50"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        {loading ? 'Sincronizando do Gripo...' : 'Sincronizar com o Gripo'}
      </button>
      {message && (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-lime">
          <Check size={12} /> {message}
        </span>
      )}
      {error && (
        <span className="flex items-center gap-1 text-[11px] font-semibold text-coral">
          <AlertCircle size={12} /> {error}
        </span>
      )}
    </div>
  );
}
