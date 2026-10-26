'use client';

import { Check, CircleAlert, Loader2, RefreshCw } from 'lucide-react';
import { normalizeHandleInput } from '@/lib/handles';
import {
  handleAvailabilityMessage,
  type HandleAvailabilityState,
} from '@/lib/handle-availability-ui';

export function HandleField({
  idPrefix,
  value,
  onChange,
  availability,
  onRetry,
}: {
  idPrefix: string;
  value: string;
  onChange: (value: string) => void;
  availability: HandleAvailabilityState;
  onRetry: () => void;
}) {
  const hintId = `${idPrefix}-handle-hint`;
  const statusId = `${idPrefix}-handle-status`;
  const message = handleAvailabilityMessage(availability);
  const invalid = availability.status === 'invalid' || availability.status === 'taken';
  const checking = availability.status === 'checking';
  const tone = availability.status === 'available'
    ? 'text-lime'
    : availability.status === 'taken' || availability.status === 'invalid'
      ? 'text-coral'
      : availability.status === 'error'
        ? 'text-amber-200'
        : 'text-meta';

  return (
    <div>
      <label className="block" htmlFor={`${idPrefix}-handle`}>
        <span className="mb-2 block text-xs font-bold text-white/70">Escolha sua arroba</span>
        <div className={`flex items-center gap-2 rounded-xl border bg-white/[.035] px-4 py-3.5 transition ${invalid ? 'border-coral/35' : 'border-white/[.1] focus-within:border-lime/40 focus-within:ring-2 focus-within:ring-lime/20'}`}>
          <span className="text-base font-bold text-lime" aria-hidden="true">@</span>
          <input
            id={`${idPrefix}-handle`}
            value={value}
            onChange={(event) => onChange(normalizeHandleInput(event.target.value))}
            maxLength={20}
            placeholder="sua_arroba"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={invalid || undefined}
            aria-busy={checking || undefined}
            aria-describedby={`${hintId}${message ? ` ${statusId}` : ''}`}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-meta"
          />
        </div>
      </label>
      <p id={hintId} className="mt-2 text-xs leading-relaxed text-meta">
        É assim que outros jogadores vão encontrar você. De 3 a 20 caracteres: letras, números, ponto ou sublinhado.
      </p>
      {message && (
        <p id={statusId} role="status" aria-live="polite" className={`mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold ${tone}`}>
          {checking && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {availability.status === 'available' && <Check size={14} aria-hidden="true" />}
          {(availability.status === 'taken' || availability.status === 'invalid') && <CircleAlert size={14} aria-hidden="true" />}
          {availability.status === 'error' && <CircleAlert size={14} aria-hidden="true" />}
          <span>{message}</span>
          {availability.status === 'error' && (
            <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 text-xs font-bold text-lime underline underline-offset-2 hover:text-white">
              <RefreshCw size={12} aria-hidden="true" /> Tentar novamente
            </button>
          )}
        </p>
      )}
    </div>
  );
}
