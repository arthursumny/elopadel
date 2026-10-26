import { describe, it, expect, beforeEach, vi } from 'vitest';
import { matchesApi } from './matches';
import { apiClient } from './client';

describe('matchesApi Service Unit Tests (`matches.ts`)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('TC-MATCH-01: getMatch calls GET /api/matches/:id', async () => {
    const mockMatch = {
      id: 'match-100',
      mode: 'ranked',
      status: 'confirmed',
      startsAt: '2026-10-15T19:00:00Z',
      durationMinutes: 90,
      resultDeadlineAt: null,
      acceptedCount: 4,
      attendanceCount: 4,
      club: 'Arena Padel Morumbi',
      city: 'São Paulo',
      gripoUrl: 'https://gripo.com.br/clube',
      sets: [],
      resultVotes: { A: 0, B: 0, pending: 4, disputed: 0 },
      participants: [],
    };

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({ match: mockMatch });
    const res = await matchesApi.getMatch('match-100');

    expect(apiClient.get).toHaveBeenCalledWith('/api/matches/match-100');
    expect(res.id).toBe('match-100');
    expect(res.club).toBe('Arena Padel Morumbi');
  });

  it('TC-MATCH-02: acceptMatch calls POST /api/matches/:id/acceptance with accept', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'confirmed',
      acceptedCount: 4,
      declined: false,
      message: 'Presença confirmada.',
    });

    const res = await matchesApi.acceptMatch('match-100', 'accept');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/acceptance', {
      decision: 'accept',
    });
    expect(res.ok).toBe(true);
    expect(res.status).toBe('confirmed');
  });

  it('TC-MATCH-03: declineMatch calls POST /api/matches/:id/acceptance with decline', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'cancelled',
      acceptedCount: 2,
      declined: true,
      message: 'Partida cancelada.',
    });

    const res = await matchesApi.declineMatch('match-100');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/acceptance', {
      decision: 'decline',
    });
    expect(res.declined).toBe(true);
  });

  it('TC-MATCH-04: checkIn calls POST /api/matches/:id/attendance', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'claimed-present',
    });

    const res = await matchesApi.checkIn('match-100');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/attendance');
    expect(res.status).toBe('claimed-present');
  });

  it('TC-MATCH-05: submitScore validates score and calls POST /api/matches/:id/result', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      matchId: 'match-100',
      status: 'result-pending',
    });

    const payload = {
      sets: [
        { a: 6, b: 3 },
        { a: 7, b: 5 },
      ],
      winner: 'A' as const,
    };

    const res = await matchesApi.submitScore('match-100', payload);
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/result', payload);
    expect(res.ok).toBe(true);
  });

  it('TC-MATCH-06: submitScore throws an Error if score is invalid without calling API', async () => {
    const postSpy = vi.spyOn(apiClient, 'post');
    const invalidPayload = {
      sets: [
        { a: 6, b: 6 }, // tied!
        { a: 6, b: 4 },
      ],
      winner: 'A' as const,
    };

    await expect(matchesApi.submitScore('match-100', invalidPayload)).rejects.toThrow(
      /não pode terminar empatado/i
    );
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('TC-MATCH-07: voteScore formats string winner into confirmed status payload', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'validated',
    });

    const res = await matchesApi.voteScore('match-100', 'A');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/confirm', {
      status: 'confirmed',
      winner: 'A',
    });
    expect(res.status).toBe('validated');
  });

  it('TC-MATCH-08: disputeMatch calls POST /api/matches/:id/confirm with status disputed', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'disputed',
      reason: 'Placar contestado',
    });

    const res = await matchesApi.disputeMatch('match-100', 'Placar contestado');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/confirm', {
      status: 'disputed',
      reason: 'Placar contestado',
    });
    expect(res.status).toBe('disputed');
  });

  it('TC-MATCH-09: bookGripoCourt calls POST /api/matches/:id/book-court', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      message: 'Quadra reservada com sucesso',
      courtName: 'Quadra 01',
      scheduleId: 1092,
    });

    const res = await matchesApi.bookGripoCourt('match-100');
    expect(apiClient.post).toHaveBeenCalledWith('/api/matches/match-100/book-court', {});
    expect(res.ok).toBe(true);
    expect(res.courtName).toBe('Quadra 01');
    expect(res.scheduleId).toBe(1092);
  });
});

