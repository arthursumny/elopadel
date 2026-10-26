import type { RankTier } from './types';

export const RANKS: RankTier[] = [
  ['6ª', 'III', '6ª III', 'slate'],
  ['6ª', 'II', '6ª II', 'slate'],
  ['6ª', 'I', '6ª I', 'slate'],
  ['5ª', 'III', '5ª III', 'blue'],
  ['5ª', 'II', '5ª II', 'blue'],
  ['5ª', 'I', '5ª I', 'blue'],
  ['4ª', 'III', '4ª III', 'cyan'],
  ['4ª', 'II', '4ª II', 'cyan'],
  ['4ª', 'I', '4ª I', 'cyan'],
  ['3ª', 'III', '3ª III', 'violet'],
  ['3ª', 'II', '3ª II', 'violet'],
  ['3ª', 'I', '3ª I', 'violet'],
  ['2ª', 'III', '2ª III', 'amber'],
  ['2ª', 'II', '2ª II', 'amber'],
  ['2ª', 'I', '2ª I', 'amber'],
  ['1ª', 'III', '1ª III', 'orange'],
  ['1ª', 'II', '1ª II', 'orange'],
  ['1ª', 'I', '1ª I', 'orange'],
  ['Elite', '', 'Elite', 'gold'],
  ['Challenger', '', 'Challenger', 'lime'],
].map(([category, division, label, accent], order) => ({ id: label.toLowerCase().replaceAll('ª', 'a').replaceAll(' ', '-'), category, division, label, accent, order }));

export const INITIAL_CATEGORY_OPTIONS = [
  { value: '6ª', label: '6ª categoria', startingTier: '6ª II' },
  { value: '5ª', label: '5ª categoria', startingTier: '5ª II' },
  { value: '4ª', label: '4ª categoria', startingTier: '4ª II' },
  { value: '3ª', label: '3ª categoria', startingTier: '3ª II' },
  { value: '2ª', label: '2ª categoria', startingTier: '2ª II' },
  { value: '1ª', label: '1ª categoria', startingTier: '1ª II' },
  { value: 'Elite', label: 'Elite', startingTier: 'Elite' },
  { value: 'unknown', label: 'Ainda não sei', startingTier: '6ª III' },
] as const;

export type InitialCategory = typeof INITIAL_CATEGORY_OPTIONS[number]['value'];

export function normalizeInitialCategory(value: unknown): InitialCategory | null {
  if (typeof value !== 'string') return null;
  return INITIAL_CATEGORY_OPTIONS.some((option) => option.value === value)
    ? value as InitialCategory
    : null;
}

export function initialRankForCategory(category: InitialCategory) {
  const option = INITIAL_CATEGORY_OPTIONS.find((item) => item.value === category);
  return getRank(option?.startingTier ?? '6ª III');
}

export function ratingMidpointForRank(rank: RankTier | string) {
  const resolved = typeof rank === 'string' ? getRank(rank) : rank;
  return 1100 + resolved.order * 100;
}

export function getRank(label: string) {
  return RANKS.find((rank) => rank.label === label) ?? RANKS[4];
}

export function categoryFromTier(tier: string | undefined) {
  if (!tier) return '';
  if (tier.startsWith('Challenger')) return 'Challenger';
  if (tier.startsWith('Elite')) return 'Elite';
  return tier.match(/^[1-6]ª/)?.[0] ?? '';
}

export function progressPercent(points: number, max = 100) {
  return Math.min(100, Math.max(0, Math.round((points / max) * 100)));
}
