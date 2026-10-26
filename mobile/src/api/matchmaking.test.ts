import { describe, it, expect, beforeEach, vi } from 'vitest';
import { matchmakingApi } from './matchmaking';
import { apiClient } from './client';

describe('matchmakingApi Service Unit Tests (`matchmaking.ts`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-MM-01: getSearchStatus calls GET /api/matchmaking/search', async () => {
    const mockSearch = {
      id: 'search-101',
      partyType: 'solo' as const,
      dates: ['2026-10-15'],
      from: '18:00',
      to: '22:00',
      city: 'São Paulo',
      sidePreference: 'any' as const,
      myReady: true,
      partnerReady: false,
      tier: '5ª II',
      mode: 'ranked' as const,
      status: 'searching' as const,
    };

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ search: mockSearch });
    const res = await matchmakingApi.getSearchStatus();

    expect(apiClient.get).toHaveBeenCalledWith('/api/matchmaking/search');
    expect(res?.id).toBe('search-101');
    expect(res?.status).toBe('searching');
  });

  it('TC-MM-02: createSearch calls POST /api/matchmaking/search with payload', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      matched: false,
      message: 'Você entrou no saguão.',
    });

    const payload = {
      partyType: 'solo' as const,
      mode: 'ranked' as const,
      dates: ['2026-10-15'],
      from: '18:00',
      to: '22:00',
      city: 'São Paulo',
      sidePreference: 'right' as const,
    };

    const res = await matchmakingApi.createSearch(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/matchmaking/search', payload);
    expect(res.ok).toBe(true);
  });

  it('resolves a one-time GPS measurement through the location endpoint', async () => {
    const measurement = { latitude: -27.1, longitude: -51.5, accuracy: 12, timestamp: 1_797_000_000_000 };
    const resolved = { location: { city: 'Joaçaba', state: 'SC', country: 'Brasil', token: 'proof', expiresAt: '2026-10-26T12:05:00.000Z' } };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce(resolved);

    await expect(matchmakingApi.resolveLocation(measurement)).resolves.toEqual(resolved);
    expect(apiClient.post).toHaveBeenCalledWith('/api/location/resolve', measurement);
  });

  it('loads available clubs through the existing public clubs endpoint', async () => {
    const clubs = [{ id: 'club-1', name: 'Arena', city: 'Joaçaba', state: 'SC', country: 'Brasil' }];
    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ clubs });

    await expect(matchmakingApi.getClubs()).resolves.toEqual({ clubs });
    expect(apiClient.get).toHaveBeenCalledWith('/api/clubs');
  });

  it('sends the GPS-derived city and proof with a ranked search request', async () => {
    const payload = {
      partyType: 'solo' as const,
      mode: 'ranked' as const,
      dates: ['2026-10-27'],
      from: '18:00',
      to: '22:00',
      city: 'Joaçaba',
      clubId: 'joa-sc-club',
      sidePreference: 'any' as const,
      locationToken: 'fresh-proof',
    };
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ok: true, matched: false });

    await matchmakingApi.createSearch(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/matchmaking/search', payload);
  });

  it('TC-MM-03: cancelSearch calls DELETE /api/matchmaking/search with searchId', async () => {
    vi.spyOn(apiClient, 'delete').mockResolvedValueOnce({
      ok: true,
      message: 'Busca cancelada.',
    });

    const res = await matchmakingApi.cancelSearch('search-101');
    expect(apiClient.delete).toHaveBeenCalledWith('/api/matchmaking/search', {
      body: { searchId: 'search-101' },
    });
    expect(res.ok).toBe(true);
  });

  it('TC-MM-04: invitePartner calls POST /api/matchmaking/search with partyType duo', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      invited: true,
      message: 'Convite enviado.',
    });

    const res = await matchmakingApi.invitePartner({
      partnerId: 'user-partner-77',
      mode: 'ranked',
      dates: ['2026-10-15'],
      from: '19:00',
      to: '21:00',
      city: 'São Paulo',
      sidePreference: 'left',
    });

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/matchmaking/search',
      expect.objectContaining({
        partyType: 'duo',
        partnerId: 'user-partner-77',
      })
    );
    expect(res.invited).toBe(true);
  });

  it('TC-MM-05: acceptPartnerInvitation calls POST decision with accept', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      message: 'Convite aceito.',
    });

    const res = await matchmakingApi.acceptPartnerInvitation('inv-404');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/matchmaking/search/invitations/inv-404/decision',
      { decision: 'accept' }
    );
    expect(res.ok).toBe(true);
  });

  it('TC-MM-06: declinePartnerInvitation calls POST decision with decline', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      message: 'Convite recusado.',
    });

    const res = await matchmakingApi.declinePartnerInvitation('inv-404');
    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/matchmaking/search/invitations/inv-404/decision',
      { decision: 'decline' }
    );
    expect(res.ok).toBe(true);
  });

  it('TC-MM-07: setReady calls POST /api/matchmaking/search/ready', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      started: true,
      message: 'Busca iniciada.',
    });

    const res = await matchmakingApi.setReady('search-101', true, 'left');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matchmaking/search/ready', {
      searchId: 'search-101',
      ready: true,
      sidePreference: 'left',
    });
    expect(res.started).toBe(true);
  });

  it('sends a location proof only when setting a ranked lobby ready', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ok: true, started: false, message: 'Aguardando.' });
    await matchmakingApi.setReady('search-101', true, 'left', 'fresh-proof');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matchmaking/search/ready', {
      searchId: 'search-101', ready: true, sidePreference: 'left', locationToken: 'fresh-proof',
    });

    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ok: true, started: false, message: 'Aguardando.' });
    await matchmakingApi.setReady('search-101', false, 'left', 'must-not-be-sent');
    expect(apiClient.post).toHaveBeenLastCalledWith('/api/matchmaking/search/ready', {
      searchId: 'search-101', ready: false, sidePreference: 'left',
    });
  });

  it('TC-MM-08: setDuoReady delegates to setReady with ready true', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      started: true,
      message: 'Busca iniciada.',
    });

    const res = await matchmakingApi.setDuoReady('search-101', 'right');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matchmaking/search/ready', {
      searchId: 'search-101',
      ready: true,
      sidePreference: 'right',
    });
    expect(res.started).toBe(true);
  });
});
