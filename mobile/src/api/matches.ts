import { apiClient } from './client';
import type { MatchDetails, MatchResultInput, SetScore } from './types';
import { validateBestOfThreeScores, calculateQuorumState } from '../lib/matchValidation';

export { validateBestOfThreeScores, calculateQuorumState };
export const validateBestOfThreeScore = validateBestOfThreeScores;

export const matchesApi = {
  /**
   * Consulta os detalhes da sala de partida por ID.
   */
  getMatch: async (id: string): Promise<MatchDetails> => {
    const data = await apiClient.get<{ match: MatchDetails }>(
      `/api/matches/${encodeURIComponent(id)}`
    );
    return data.match;
  },

  /**
   * Registra a decisão de aceite da partida (accept / decline).
   */
  acceptMatch: async (
    id: string,
    decision: 'accept' | 'decline' = 'accept'
  ): Promise<{ ok: boolean; status?: string; declined?: boolean; message?: string }> => {
    return apiClient.post<{ ok: boolean; status?: string; declined?: boolean; message?: string }>(
      `/api/matches/${encodeURIComponent(id)}/acceptance`,
      { decision }
    );
  },

  /**
   * Atalho para recusar a participação na partida.
   */
  declineMatch: async (
    id: string
  ): Promise<{ ok: boolean; status?: string; declined?: boolean; message?: string }> => {
    return apiClient.post<{ ok: boolean; status?: string; declined?: boolean; message?: string }>(
      `/api/matches/${encodeURIComponent(id)}/acceptance`,
      { decision: 'decline' }
    );
  },

  /**
   * Registra o check-in presencial do jogador na quadra.
   */
  checkIn: async (
    id: string
  ): Promise<{ ok: boolean; status: string; message?: string }> => {
    return apiClient.post<{ ok: boolean; status: string; message?: string }>(
      `/api/matches/${encodeURIComponent(id)}/attendance`
    );
  },

  /**
   * Submete o placar final da melhor de três para validação.
   */
  submitScore: async (
    id: string,
    payload: MatchResultInput | { sets: SetScore[]; winner: 'A' | 'B' }
  ): Promise<{ ok: boolean; matchId: string; status: string }> => {
    const validation = validateBestOfThreeScores(payload.sets, payload.winner);
    if (!validation.valid) {
      throw new Error(validation.error || 'Placar inválido.');
    }

    return apiClient.post<{ ok: boolean; matchId: string; status: string }>(
      `/api/matches/${encodeURIComponent(id)}/result`,
      payload
    );
  },

  /**
   * Vota e confirma o resultado de uma partida ('A' ou 'B').
   */
  voteScore: async (
    id: string,
    decision: 'A' | 'B' | { status: 'confirmed' | 'disputed'; winner?: 'A' | 'B' }
  ): Promise<{ ok: boolean; status: string; [key: string]: any }> => {
    const body =
      typeof decision === 'string'
        ? { status: 'confirmed' as const, winner: decision }
        : decision;

    return apiClient.post<{ ok: boolean; status: string; [key: string]: any }>(
      `/api/matches/${encodeURIComponent(id)}/confirm`,
      body
    );
  },

  /**
   * Contesta o resultado da partida, congelando o cálculo de MMR e enviando para auditoria.
   */
  disputeMatch: async (
    id: string,
    reason?: string
  ): Promise<{ ok: boolean; status: string; [key: string]: any }> => {
    return apiClient.post<{ ok: boolean; status: string; [key: string]: any }>(
      `/api/matches/${encodeURIComponent(id)}/confirm`,
      { status: 'disputed', reason }
    );
  },

  /**
   * Reserva a quadra automaticamente através do Gripo.
   */
  bookGripoCourt: async (
    id: string,
    payload?: { courtId?: number; date?: string; startHour?: string; endHour?: string; notes?: string }
  ): Promise<{ ok: boolean; message?: string; courtName?: string; scheduleId?: number; manualUrl?: string }> => {
    return apiClient.post<{ ok: boolean; message?: string; courtName?: string; scheduleId?: number; manualUrl?: string }>(
      `/api/matches/${encodeURIComponent(id)}/book-court`,
      payload || {}
    );
  },
};

