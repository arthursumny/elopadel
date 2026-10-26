import { isReservedHandle, isValidPublicHandle, normalizeHandleInput } from './handles';

export type HandleAvailabilityStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'error';

export type HandleAvailabilityState = {
  status: HandleAvailabilityStatus;
  handle: string;
  message?: string;
};

export function publicHandleFor(value: string): string {
  const normalized = normalizeHandleInput(value);
  return normalized ? `@${normalized}` : '';
}

export function shouldLookupHandle(value: string): boolean {
  return isValidPublicHandle(publicHandleFor(value));
}

export function isHandleAvailabilityCurrent(state: HandleAvailabilityState, normalized: string): boolean {
  return Boolean(normalized) && state.handle === normalized;
}

export function canSubmitHandle(
  state: HandleAvailabilityState,
  normalized: string,
  { allowNetworkError = true }: { allowNetworkError?: boolean } = {},
): boolean {
  if (!isHandleAvailabilityCurrent(state, normalized)) return false;
  if (state.status === 'available') return true;
  if (state.status === 'error') return allowNetworkError;
  return false;
}

export function handleAvailabilityMessage(state: HandleAvailabilityState): string {
  if (state.status === 'checking') return 'Verificando disponibilidade...';
  if (state.status === 'available') return 'Arroba disponível.';
  if (state.status === 'taken') return state.message ?? 'Essa arroba já está em uso.';
  if (state.status === 'invalid') return state.message ?? 'Escolha uma arroba válida.';
  if (state.status === 'error') return state.message ?? 'Não foi possível verificar agora. Tente de novo ou continue; o servidor confirma ao salvar.';
  return '';
}

export function invalidHandleMessage(value: string): string {
  if (isReservedHandle(value)) return 'Essa arroba é reservada. Escolha outra.';
  return 'Use de 3 a 20 caracteres: letras, números, ponto ou sublinhado.';
}

export function isStaleHandleResponse(
  responseHandle: string,
  currentPublicHandle: string,
  requestId: number,
  latestRequestId: number,
): boolean {
  return responseHandle !== currentPublicHandle || requestId !== latestRequestId;
}
