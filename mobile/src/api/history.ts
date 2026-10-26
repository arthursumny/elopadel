import { apiClient } from './client';
import type { HistoryResponse } from './types';

export const historyApi = {
  /**
   * Consulta o histórico completo de confrontos e variações de MMR do jogador.
   */
  getHistory: async (): Promise<HistoryResponse> => {
    return apiClient.get<HistoryResponse>('/api/history');
  },
};
