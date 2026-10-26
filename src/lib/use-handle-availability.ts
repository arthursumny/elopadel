'use client';

import { useEffect, useRef, useState } from 'react';
import { normalizeHandleInput } from './handles';
import {
  handleAvailabilityMessage,
  invalidHandleMessage,
  isStaleHandleResponse,
  publicHandleFor,
  shouldLookupHandle,
  type HandleAvailabilityState,
} from './handle-availability-ui';

const HANDLE_LOOKUP_DEBOUNCE_MS = 400;

export function useHandleAvailability({ value, enabled }: { value: string; enabled: boolean }) {
  const [state, setState] = useState<HandleAvailabilityState>({ status: 'idle', handle: '' });
  const [retryToken, setRetryToken] = useState(0);
  const latestRequest = useRef(0);
  const normalized = normalizeHandleInput(value);
  const publicHandle = publicHandleFor(value);

  useEffect(() => {
    const requestId = ++latestRequest.current;
    const controller = new AbortController();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    if (!enabled || !normalized) {
      setState({ status: 'idle', handle: normalized });
      return () => controller.abort();
    }

    if (!shouldLookupHandle(value)) {
      setState({
        status: 'invalid',
        handle: normalized,
        message: invalidHandleMessage(normalized),
      });
      return () => controller.abort();
    }

    setState({ status: 'checking', handle: normalized });
    timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/auth/handle-availability?handle=${encodeURIComponent(publicHandle)}`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled || controller.signal.aborted || requestId !== latestRequest.current) return;

        if (response.status === 400) {
          setState({
            status: 'invalid',
            handle: normalized,
            message: typeof data.error === 'string' ? data.error : invalidHandleMessage(normalized),
          });
          return;
        }

        if (!response.ok) {
          setState({
            status: 'error',
            handle: normalized,
            message: typeof data.error === 'string'
              ? data.error
              : handleAvailabilityMessage({ status: 'error', handle: normalized }),
          });
          return;
        }

        if (isStaleHandleResponse(typeof data.handle === 'string' ? data.handle : '', publicHandle, requestId, latestRequest.current) || data.handle !== publicHandle || typeof data.available !== 'boolean') {
          setState({
            status: 'error',
            handle: normalized,
            message: 'Não foi possível confirmar a arroba agora. Tente novamente.',
          });
          return;
        }

        setState(
          data.available
            ? { status: 'available', handle: normalized }
            : { status: 'taken', handle: normalized, message: 'Essa arroba já está em uso. Escolha outra.' },
        );
      } catch (error) {
        if (cancelled || controller.signal.aborted || (error as { name?: string })?.name === 'AbortError') return;
        setState({
          status: 'error',
          handle: normalized,
          message: 'Não foi possível verificar agora. Tente de novo ou continue; o servidor confirma ao salvar.',
        });
      }
    }, HANDLE_LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, normalized, publicHandle, retryToken, value]);

  return {
    state,
    normalized,
    retry: () => setRetryToken((current) => current + 1),
  };
}
