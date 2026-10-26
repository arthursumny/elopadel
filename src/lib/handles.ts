const MAX_HANDLE_LENGTH = 20;

export const RESERVED_HANDLES = new Set([
  'admin',
  'club',
  'root',
  'system',
  'elopadel',
  'support',
  'suporte',
  'moderator',
  'moderador',
  'moderacao',
]);

export function normalizeHandleInput(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, MAX_HANDLE_LENGTH);
}

export function normalizePublicHandle(value: string) {
  const handle = normalizeHandleInput(value);
  return handle ? `@${handle}` : '';
}

export function isReservedHandle(value: string): boolean {
  const normalized = normalizeHandleInput(value);
  return RESERVED_HANDLES.has(normalized);
}

export function isValidPublicHandle(value: string): boolean {
  if (isReservedHandle(value)) {
    return false;
  }
  return /^@[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/i.test(value);
}

