import { apiClient } from './client';
import type {
  ActiveMatchSearch,
  CourtSide,
  CreateSearchPayload,
  CreateMatchSearchResponse,
  LocationMeasurement,
  LocationResolveResponse,
  MatchmakingClub,
} from './types';

export const matchmakingApi = {
  /** Resolve a one-time foreground location measurement into a short-lived proof. */
  resolveLocation: async (measurement: LocationMeasurement): Promise<LocationResolveResponse> => {
    return apiClient.post<LocationResolveResponse>('/api/location/resolve', measurement);
  },

  /** Load active clubs so ranked choices can stay within the verified city and state. */
  getClubs: async (): Promise<{ clubs: MatchmakingClub[] }> => {
    return apiClient.get<{ clubs: MatchmakingClub[] }>('/api/clubs');
  },

  /**
   * Consulta o estado atual da busca ou saguão do jogador autenticado.
   */
  getSearchStatus: async (): Promise<ActiveMatchSearch | null> => {
    const data = await apiClient.get<{ search: ActiveMatchSearch | null }>(
      '/api/matchmaking/search'
    );
    return data.search;
  },

  /**
   * Alias para getSearchStatus.
   */
  getActiveSearch: async (): Promise<{ search: ActiveMatchSearch | null }> => {
    return apiClient.get<{ search: ActiveMatchSearch | null }>('/api/matchmaking/search');
  },

  /**
   * Cria uma busca de partida no saguão (solo ou duo).
   */
  createSearch: async (
    payload: CreateSearchPayload
  ): Promise<CreateMatchSearchResponse> => {
    return apiClient.post<CreateMatchSearchResponse>(
      '/api/matchmaking/search',
      payload
    );
  },

  /**
   * Cancela a busca ativa no saguão.
   */
  cancelSearch: async (
    searchId?: string
  ): Promise<{ ok: boolean; message: string }> => {
    return apiClient.delete<{ ok: boolean; message: string }>(
      '/api/matchmaking/search',
      searchId ? { body: { searchId } } : undefined
    );
  },

  /**
   * Convida um amigo para formar dupla no saguão de matchmaking.
   */
  invitePartner: async (
    firstArg: string | (Omit<CreateSearchPayload, 'partyType'> & { partnerId: string }),
    secondArg?: string
  ): Promise<any> => {
    if (typeof firstArg === 'string') {
      const searchId = firstArg;
      const partnerId = secondArg || '';
      return apiClient.post('/api/matchmaking/search', {
        searchId,
        partnerId,
        partyType: 'duo',
      });
    }

    return apiClient.post('/api/matchmaking/search', {
      ...firstArg,
      partyType: 'duo',
    });
  },

  /**
   * Aceita convite de dupla no saguão.
   */
  acceptPartnerInvitation: async (
    invitationId: string
  ): Promise<{
    ok: boolean;
    matchId?: string;
    search?: ActiveMatchSearch | null;
    message: string;
  }> => {
    return apiClient.post(
      `/api/matchmaking/search/invitations/${encodeURIComponent(invitationId)}/decision`,
      { decision: 'accept' }
    );
  },

  /**
   * Recusa convite de dupla no saguão.
   */
  declinePartnerInvitation: async (
    invitationId: string
  ): Promise<{
    ok: boolean;
    matchId?: string;
    search?: ActiveMatchSearch | null;
    message: string;
  }> => {
    return apiClient.post(
      `/api/matchmaking/search/invitations/${encodeURIComponent(invitationId)}/decision`,
      { decision: 'decline' }
    );
  },

  /**
   * Atualiza a prontidão (ready) e lado da dupla.
   */
  setReady: async (
    searchId: string,
    ready: boolean = true,
    sidePreference?: CourtSide,
    locationToken?: string
  ): Promise<{
    ok: boolean;
    started?: boolean;
    matched?: boolean;
    matchId?: string;
    search?: ActiveMatchSearch | null;
    message: string;
  }> => {
    return apiClient.post('/api/matchmaking/search/ready', {
      searchId,
      ready,
      sidePreference: sidePreference || 'any',
      ...(ready && locationToken ? { locationToken } : {}),
    });
  },

  /**
   * Marca a dupla como pronta para a busca.
   */
  setDuoReady: async (
    searchId: string,
    sidePreference?: CourtSide,
    locationToken?: string
  ): Promise<{
    ok: boolean;
    started?: boolean;
    matched?: boolean;
    matchId?: string;
    search?: ActiveMatchSearch | null;
    message: string;
  }> => {
    return matchmakingApi.setReady(searchId, true, sidePreference, locationToken);
  },
};
