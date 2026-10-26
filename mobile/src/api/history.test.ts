import { describe, it, expect, beforeEach, vi } from 'vitest';
import { historyApi } from './history';
import { apiClient } from './client';

describe('historyApi Service Unit Tests (`history.ts`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-HIST-01: getHistory calls GET /api/history and returns HistoryResponse', async () => {
    const mockData = {
      ok: true,
      total: 10,
      wins: 7,
      mmrDelta: 42,
      items: [
        {
          id: 'match-1',
          date: '08 de out., 19:30',
          result: 'Vitória',
          score: '6–4, 7–5',
          opponent: 'Lucas / Rodrigo',
          club: 'Arena Padel Morumbi',
          delta: 18,
          tone: 'win' as const,
          label: 'Ranqueada',
        },
      ],
    };

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce(mockData);

    const res = await historyApi.getHistory();
    expect(apiClient.get).toHaveBeenCalledWith('/api/history');
    expect(res.total).toBe(10);
    expect(res.wins).toBe(7);
    expect(res.mmrDelta).toBe(42);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('match-1');
  });
});
