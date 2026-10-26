import { apiClient } from './client';
import type {
  Friend,
  FriendRequest,
  FriendsResponse,
  MatchmakingPlayerOption,
} from './types';

export const friendsApi = {
  /**
   * Consulta a lista de amigos conectados e solicitações pendentes.
   */
  getFriends: async (): Promise<FriendsResponse> => {
    return apiClient.get<FriendsResponse>('/api/friends');
  },

  /**
   * Realiza busca instantânea de jogadores por nome ou @handle.
   */
  searchPlayers: async (query: string): Promise<MatchmakingPlayerOption[]> => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return [];

    const data = await apiClient.get<{ players: MatchmakingPlayerOption[] }>(
      '/api/players/search',
      { params: { q: trimmed } }
    );

    return data.players || [];
  },

  /**
   * Envia uma solicitação de amizade utilizando handle ou userId.
   */
  sendFriendRequest: async (
    target: string | { userId?: string; id?: string; handle?: string }
  ): Promise<{ ok: boolean; status: string; message: string }> => {
    let payload: { userId?: string; handle?: string } = {};

    if (typeof target === 'string') {
      if (target.startsWith('@')) {
        payload = { handle: target };
      } else {
        payload = { userId: target };
      }
    } else {
      if (target.userId) payload.userId = target.userId;
      else if (target.id) payload.userId = target.id;
      if (target.handle) payload.handle = target.handle;
    }

    return apiClient.post<{ ok: boolean; status: string; message: string }>(
      '/api/friends',
      payload
    );
  },

  /**
   * Responde (aceita ou recusa) uma solicitação de amizade pendente.
   */
  respondFriendRequest: async (
    requestId: string,
    decision: 'accept' | 'decline'
  ): Promise<{ ok: boolean; status: string; playerId?: string }> => {
    return apiClient.post<{ ok: boolean; status: string; playerId?: string }>(
      `/api/friends/${encodeURIComponent(requestId)}/decision`,
      { decision }
    );
  },

  /**
   * Remove um vínculo de amizade existente.
   */
  removeFriend: async (friendshipId: string): Promise<{ ok: boolean }> => {
    return apiClient.delete<{ ok: boolean }>(
      `/api/friends/${encodeURIComponent(friendshipId)}`
    );
  },
};
