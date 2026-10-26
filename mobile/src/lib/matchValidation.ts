import { SetScore } from '../api/types';

export interface ScoreValidationResult {
  valid: boolean;
  isValid: boolean;
  winner?: 'A' | 'B';
  error?: string;
}

/**
 * Validação client-side para Melhor de Três Sets conforme regras do Elo Padel.
 * - Deve ter 2 ou 3 sets.
 * - Games de cada set devem ser inteiros >= 0.
 * - Nenhum set pode terminar empatado (a !== b).
 * - Pelo menos uma das duplas deve ter vencido >= 2 sets.
 * - O vencedor indicado ('A' | 'B') deve ser estritamente igual à dupla que venceu mais sets.
 */
export function validateBestOfThreeScores(
  sets: SetScore[],
  winner: 'A' | 'B'
): ScoreValidationResult {
  if (!Array.isArray(sets) || sets.length < 2 || sets.length > 3) {
    const error = 'A partida deve ter 2 ou 3 sets jogados.';
    return { valid: false, isValid: false, error };
  }

  for (let i = 0; i < sets.length; i++) {
    const set = sets[i];
    if (
      !set ||
      typeof set.a !== 'number' ||
      typeof set.b !== 'number' ||
      !Number.isInteger(set.a) ||
      !Number.isInteger(set.b) ||
      set.a < 0 ||
      set.b < 0
    ) {
      const error = `Games do set ${i + 1} devem ser números inteiros não negativos.`;
      return { valid: false, isValid: false, error };
    }

    if (set.a === set.b) {
      const error = `O set ${i + 1} não pode terminar empatado (${set.a}x${set.b}).`;
      return { valid: false, isValid: false, error };
    }
  }

  const winsA = sets.filter((s) => s.a > s.b).length;
  const winsB = sets.filter((s) => s.b > s.a).length;

  if (winsA < 2 && winsB < 2) {
    const error = 'Uma das duplas precisa vencer pelo menos 2 sets.';
    return { valid: false, isValid: false, error };
  }

  const calculatedWinner: 'A' | 'B' = winsA > winsB ? 'A' : 'B';
  if (winner !== calculatedWinner) {
    const error = `O vencedor selecionado (Dupla ${winner}) diverge do placar de sets (Dupla ${calculatedWinner} venceu ${Math.max(winsA, winsB)} sets).`;
    return { valid: false, isValid: false, error };
  }

  return { valid: true, isValid: true, winner: calculatedWinner };
}

// Alias para compatibilidade
export const validateBestOfThreeScore = validateBestOfThreeScores;

export interface QuorumParticipant {
  team: 'A' | 'B';
  confirmation?: string;
  resultWinner?: 'A' | 'B' | null;
}

export interface QuorumResolutionResult {
  isQuorumMet: boolean;
  isDisputed: boolean;
  totalVotes: number;
  votesA: number;
  votesB: number;
  hasBothTeams: boolean;
  teamsRepresentedCount: number;
}

/**
 * Avalia o estado de quorum e detecção de divergência para validação de resultado de partida.
 * - Quorum exige >= 3 votos confirmados.
 * - Representação obrigatória de ambas as duplas (new Set(votes.map(v => v.team)).size === 2).
 * - Sem votos de contestação (confirmation === 'disputed').
 * - Todos os votos confirmados devem concordar no mesmo vencedor.
 */
export function calculateQuorumState(
  participants: QuorumParticipant[],
  submittedWinner?: 'A' | 'B'
): QuorumResolutionResult {
  if (!Array.isArray(participants)) {
    return {
      isQuorumMet: false,
      isDisputed: false,
      totalVotes: 0,
      votesA: 0,
      votesB: 0,
      hasBothTeams: false,
      teamsRepresentedCount: 0,
    };
  }

  const confirmedVotes = participants.filter(
    (p) => p.confirmation === 'confirmed' && (p.resultWinner === 'A' || p.resultWinner === 'B')
  );
  const disputedVotes = participants.filter((p) => p.confirmation === 'disputed');

  const votesA = confirmedVotes.filter((p) => p.resultWinner === 'A').length;
  const votesB = confirmedVotes.filter((p) => p.resultWinner === 'B').length;

  const teamsRepresented = new Set(confirmedVotes.map((p) => p.team));
  const hasBothTeams = teamsRepresented.size === 2;

  const hasConflictingVotes = votesA > 0 && votesB > 0;
  const hasSubmittedMismatch =
    Boolean(submittedWinner) && confirmedVotes.some((p) => p.resultWinner !== submittedWinner);

  const isDisputed = disputedVotes.length > 0 || hasConflictingVotes || hasSubmittedMismatch;
  const isQuorumMet = confirmedVotes.length >= 3 && hasBothTeams && !isDisputed;

  return {
    isQuorumMet,
    isDisputed,
    totalVotes: confirmedVotes.length,
    votesA,
    votesB,
    hasBothTeams,
    teamsRepresentedCount: teamsRepresented.size,
  };
}
