export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

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

/**
 * Initial Category options adhering strictly to backend wire values.
 */
export const INITIAL_CATEGORY_OPTIONS = [
  { value: '6ª', label: '6ª Categoria', desc: 'Iniciante — fundamentos e primeiras partidas', startingTier: '6ª II' },
  { value: '5ª', label: '5ª Categoria', desc: 'Intermediário Inicial — controle e jogos regulares', startingTier: '5ª II' },
  { value: '4ª', label: '4ª Categoria', desc: 'Intermediário — ritmo e bom posicionamento', startingTier: '4ª II' },
  { value: '3ª', label: '3ª Categoria', desc: 'Avançado — técnica apurada e intensidade', startingTier: '3ª II' },
  { value: '2ª', label: '2ª Categoria', desc: 'Competitivo Alto — disputas federadas', startingTier: '2ª II' },
  { value: '1ª', label: '1ª Categoria', desc: 'Open / Elite Regional — nível máximo', startingTier: '1ª II' },
  { value: 'Elite', label: 'Elite', desc: 'Nível profissional ou campeão estadual', startingTier: 'Elite' },
  { value: 'unknown', label: 'Ainda não sei', desc: 'Calibração total nas primeiras 5 partidas', startingTier: '6ª III' },
] as const;

/**
 * Normalizes a handle in real time:
 * strips accents, spaces become underscores, lowercase, only [a-z0-9_.], max 20 chars.
 */
export function normalizeHandleInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.]/g, '')
    .slice(0, 20);
}

/**
 * Validates a normalized (without @) handle against domain rules.
 */
export function isValidHandle(rawHandle: string): boolean {
  if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 20) return false;
  if (RESERVED_HANDLES.has(rawHandle)) return false;
  return /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/i.test(rawHandle);
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `A senha deve ter no máximo ${PASSWORD_MAX_LENGTH} caracteres.`;
  }
  return null;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
