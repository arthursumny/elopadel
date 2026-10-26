import { apiClient } from './client';
import type {
  LeaderboardEntry,
  LeaderboardScope,
  LeaderboardResponse,
} from './types';

export interface GetLeaderboardOptions {
  scope?: LeaderboardScope;
  userContext?: {
    state?: string;
    city?: string;
    club?: string;
  };
}

export interface GetLeaderboardResult {
  entries: LeaderboardEntry[];
  scope: LeaderboardScope;
  totalCount: number;
}

/**
 * Filtra e reordena sequencialmente as posições (1..N) da tabela de ranking conforme o escopo geográfico.
 */
export function filterLeaderboardByScope(
  entries: LeaderboardEntry[],
  scope: LeaderboardScope = 'global',
  userContext?: { state?: string; city?: string; club?: string }
): LeaderboardEntry[] {
  if (!Array.isArray(entries)) return [];

  const scoped = entries.filter((entry) => {
    if (scope === 'state') {
      if (!userContext?.state?.trim()) return false;
      return (
        (entry.state || '').trim().toLowerCase() ===
        userContext.state.trim().toLowerCase()
      );
    }
    if (scope === 'city') {
      if (!userContext?.city?.trim()) return false;
      return (
        (entry.city || '').trim().toLowerCase() ===
        userContext.city.trim().toLowerCase()
      );
    }
    if (scope === 'club') {
      if (!userContext?.club?.trim()) return false;
      return (
        (entry.club || '').trim().toLowerCase() ===
        userContext.club.trim().toLowerCase()
      );
    }
    if (scope === 'global') {
      return true;
    }
    return true;
  });

  return scoped.map((entry, index) => ({
    ...entry,
    position: index + 1,
  }));
}

/**
 * Localiza a posição do usuário na lista de ranking por handle ou identificador.
 */
export function findUserRank(
  entries: LeaderboardEntry[],
  userIdOrHandle: string
): { position: number; entry?: LeaderboardEntry } | null {
  if (!userIdOrHandle || typeof userIdOrHandle !== 'string') return null;
  const clean = userIdOrHandle.trim().toLowerCase().replace(/^@/, '');
  if (!clean) return null;

  const found = entries.find((e) => {
    const handleClean = (e.handle || '').trim().toLowerCase().replace(/^@/, '');
    const playerClean = (e.player || '').trim().toLowerCase();
    return (
      Boolean(handleClean && handleClean === clean) ||
      Boolean(playerClean && playerClean === clean)
    );
  });

  if (!found) return null;
  return { position: found.position, entry: found };
}

export const leaderboardApi = {
  /**
   * Consulta o ranking geográfico e aplica filtragem opcional.
   */
  getLeaderboard: async (
    options: GetLeaderboardOptions = {}
  ): Promise<GetLeaderboardResult> => {
    const { scope = 'global', userContext } = options;

    const data = await apiClient.get<LeaderboardResponse>(
      '/api/leaderboard',
      { params: { scope } }
    );

    const rawEntries = data.entries || [];
    const entries = filterLeaderboardByScope(rawEntries, scope, userContext);

    return {
      entries,
      scope,
      totalCount: entries.length,
    };
  },
};
