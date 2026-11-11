import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loadMatchDetails: vi.fn(),
}));

vi.mock('@/lib/db/queries', () => ({
  loadMatchDetails: mocks.loadMatchDetails,
}));

import { GET } from './route';

describe('GET /api/matches/[id]', () => {
  it('retorna os campos de reserva na resposta', async () => {
    mocks.loadMatchDetails.mockResolvedValue({
      id: 'match-xyz',
      mode: 'ranked',
      status: 'confirmed',
      bookingStatus: 'booked',
      bookedCourtName: 'Quadra Central',
      bookingMessage: 'Reserva confirmada.',
      bookedAt: '2026-11-10T20:00:00.000Z',
      bookingPriceCents: 10000,
    });

    const response = await GET(
      new Request('http://localhost/api/matches/match-xyz'),
      { params: Promise.resolve({ id: 'match-xyz' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.match.id).toBe('match-xyz');
    expect(data.bookingStatus).toBe('booked');
    expect(data.bookedCourtName).toBe('Quadra Central');
    expect(data.bookingMessage).toBe('Reserva confirmada.');
    expect(data.bookedAt).toBe('2026-11-10T20:00:00.000Z');
    expect(data.bookingPriceCents).toBe(10000);
    expect(data.match.bookingPriceCents).toBe(10000);
  });

  it('retorna 404 quando partida não for encontrada', async () => {
    mocks.loadMatchDetails.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/matches/match-none'),
      { params: Promise.resolve({ id: 'match-none' }) }
    );

    expect(response.status).toBe(404);
  });
});
