import type { MatchMode, MatchStatus } from '@/lib/types';

export type SetScore = { a: number; b: number };

export type MatchResultInput = {
  sets: SetScore[];
  winner: 'A' | 'B';
};

export type Confirmation = {
  playerId: string;
  team: 'A' | 'B';
  status: 'confirmed' | 'disputed';
  winner?: 'A' | 'B' | null;
};

export function validateBestOfThree(input: MatchResultInput) {
  if (input.sets.length < 2 || input.sets.length > 3) return false;
  if (!input.sets.every((set) => Number.isInteger(set.a) && Number.isInteger(set.b) && set.a >= 0 && set.b >= 0 && set.a !== set.b)) return false;
  const winsA = input.sets.filter((set) => set.a > set.b).length;
  const winsB = input.sets.filter((set) => set.b > set.a).length;
  if (winsA < 2 && winsB < 2) return false;
  return input.winner === (winsA > winsB ? 'A' : 'B');
}

export function hasConflictingResult(confirmations: Confirmation[], submittedWinner?: 'A' | 'B') {
  const winners = new Set(confirmations.filter((confirmation) => confirmation.status === 'confirmed' && confirmation.winner).map((confirmation) => confirmation.winner));
  return winners.size > 1 || Boolean(submittedWinner && [...winners].some((winner) => winner !== submittedWinner));
}

export function resultVoteCounts(confirmations: Confirmation[]) {
  return confirmations.reduce((counts, confirmation) => {
    if (confirmation.winner === 'A') counts.A += 1;
    if (confirmation.winner === 'B') counts.B += 1;
    if (confirmation.status === 'disputed') counts.disputed += 1;
    else if (!confirmation.winner) counts.pending += 1;
    return counts;
  }, { A: 0, B: 0, pending: 0, disputed: 0 });
}

export function canValidateResult(confirmations: Confirmation[], submittedWinner?: 'A' | 'B') {
  const confirmed = confirmations.filter((confirmation) => confirmation.status === 'confirmed');
  return confirmed.length >= 3 && new Set(confirmed.map((confirmation) => confirmation.team)).size === 2 && !confirmations.some((confirmation) => confirmation.status === 'disputed') && !hasConflictingResult(confirmations, submittedWinner);
}

export function nextMatchStatus(current: MatchStatus, action: 'join' | 'confirm' | 'submit-result' | 'dispute' | 'validate' | 'cancel'): MatchStatus {
  if (action === 'cancel') return 'cancelled';
  if (action === 'dispute') return 'disputed';
  if (action === 'validate') return 'validated';
  if (action === 'join' && current === 'open') return 'full';
  if (action === 'confirm' && (current === 'full' || current === 'confirming')) return 'confirming';
  if (action === 'submit-result' && current === 'confirmed') return 'result-pending';
  return current;
}

export function isRanked(mode: MatchMode) {
  return mode === 'ranked';
}
