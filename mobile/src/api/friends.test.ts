import { describe, it, expect, beforeEach, vi } from 'vitest';
import { friendsApi } from './friends';
import { apiClient } from './client';

describe('friendsApi Service Unit Tests (`friends.ts`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-FRIENDS-01: getFriends calls GET /api/friends', async () => {
    const mockFriends = [
      {
        id: 'user-1',
        displayName: 'Pedro Santos',
        handle: '@pedro',
        city: 'São Paulo',
        tier: '5ª II',
        rating: 1540,
        friendshipId: 'f-1',
        createdAt: '2026-10-01T10:00:00Z',
        relationship: 'accepted' as const,
      },
    ];
    const mockRequests = [
      {
        id: 'req-1',
        playerId: 'user-2',
        displayName: 'Lucas Lima',
        handle: '@lucas',
        city: 'Campinas',
        tier: '4ª I',
        rating: 1720,
        createdAt: '2026-10-05T12:00:00Z',
        relationship: 'incoming' as const,
      },
    ];

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      friends: mockFriends,
      requests: mockRequests,
    });

    const res = await friendsApi.getFriends();
    expect(apiClient.get).toHaveBeenCalledWith('/api/friends');
    expect(res.friends).toHaveLength(1);
    expect(res.requests).toHaveLength(1);
    expect(res.friends[0].handle).toBe('@pedro');
  });

  it('TC-FRIENDS-02: searchPlayers calls GET /api/players/search with query param', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      players: [
        {
          id: 'user-3',
          displayName: 'Marina Silva',
          handle: '@marina',
          city: 'São Paulo',
          tier: '6ª I',
          rating: 1400,
        },
      ],
    });

    const res = await friendsApi.searchPlayers('marina');
    expect(apiClient.get).toHaveBeenCalledWith('/api/players/search', {
      params: { q: 'marina' },
    });
    expect(res).toHaveLength(1);
    expect(res[0].handle).toBe('@marina');
  });

  it('TC-FRIENDS-03: searchPlayers returns empty array if query has less than 2 chars', async () => {
    const getSpy = vi.spyOn(apiClient, 'get');
    const res = await friendsApi.searchPlayers('a');
    expect(getSpy).not.toHaveBeenCalled();
    expect(res).toEqual([]);
  });

  it('TC-FRIENDS-04: sendFriendRequest handles string handle with @ prefix', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'pending',
      message: 'Solicitação de amizade enviada.',
    });

    const res = await friendsApi.sendFriendRequest('@marina');
    expect(apiClient.post).toHaveBeenCalledWith('/api/friends', { handle: '@marina' });
    expect(res.ok).toBe(true);
  });

  it('TC-FRIENDS-05: sendFriendRequest handles target object with userId', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'pending',
      message: 'Solicitação de amizade enviada.',
    });

    const res = await friendsApi.sendFriendRequest({ userId: 'user-uuid-88' });
    expect(apiClient.post).toHaveBeenCalledWith('/api/friends', { userId: 'user-uuid-88' });
    expect(res.ok).toBe(true);
  });

  it('TC-FRIENDS-06: respondFriendRequest calls POST /api/friends/:id/decision', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'accepted',
      playerId: 'user-3',
    });

    const res = await friendsApi.respondFriendRequest('req-1', 'accept');
    expect(apiClient.post).toHaveBeenCalledWith('/api/friends/req-1/decision', {
      decision: 'accept',
    });
    expect(res.status).toBe('accepted');
  });

  it('TC-FRIENDS-07: removeFriend calls DELETE /api/friends/:id', async () => {
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({ ok: true });

    const res = await friendsApi.removeFriend('f-1');
    expect(apiClient.delete).toHaveBeenCalledWith('/api/friends/f-1');
    expect(res.ok).toBe(true);
  });
});
