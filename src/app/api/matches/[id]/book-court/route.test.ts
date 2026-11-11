import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentUserId: vi.fn(),
  loadMatchDetails: vi.fn(),
  findMatchingGripoSlot: vi.fn(),
  confirmGripoBooking: vi.fn(),
  db: null as unknown,
}));

vi.mock('@/lib/auth', () => ({
  currentUserId: mocks.currentUserId,
}));

vi.mock('@/lib/db/queries', () => ({
  loadMatchDetails: mocks.loadMatchDetails,
}));

vi.mock('@/lib/integrations/gripo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/gripo')>();
  return {
    ...actual,
    findMatchingGripoSlot: mocks.findMatchingGripoSlot,
    confirmGripoBooking: mocks.confirmGripoBooking,
  };
});

vi.mock('@/lib/db', () => ({
  get db() {
    return mocks.db;
  },
}));

import { POST } from './route';

describe('POST /api/matches/[id]/book-court', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recusa com 409 quando bookingStatus já for "booked"', async () => {
    mocks.currentUserId.mockResolvedValue('user-1');
    mocks.loadMatchDetails.mockResolvedValue({
      id: 'match-already-booked',
      bookingStatus: 'booked',
      bookedCourtName: 'Quadra Central',
      bookingMessage: 'Reserva confirmada anteriormente.',
      bookedAt: '2026-11-10T18:00:00.000Z',
      participants: [{ userId: 'user-1' }],
    });

    const response = await POST(
      new Request('http://localhost/api/matches/match-already-booked/book-court', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: 'match-already-booked' }) }
    );

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe('A quadra para esta partida já está reservada.');
    expect(data.bookingStatus).toBe('booked');
    expect(data.bookedCourtName).toBe('Quadra Central');
    expect(mocks.confirmGripoBooking).not.toHaveBeenCalled();
  });

  it('grava os campos de reserva no banco e retorna sucesso (200) com os detalhes', async () => {
    mocks.currentUserId.mockResolvedValue('user-1');
    mocks.loadMatchDetails.mockResolvedValue({
      id: 'match-to-book',
      startsAt: '2026-11-15T21:30:00.000Z',
      gripoClubId: 122,
      gripoUrl: 'https://gripo.app/racket-center',
      bookingStatus: null,
      participants: [{ userId: 'user-1' }],
    });

    const updates: unknown[] = [];
    mocks.db = {
      update: vi.fn(() => ({
        set: vi.fn((values: unknown) => ({
          where: vi.fn(async () => {
            updates.push(values);
            return [values];
          }),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ roomId: 'room-1' }]),
          })),
        })),
      })),
    };

    mocks.findMatchingGripoSlot.mockResolvedValue({
      courtId: 5,
      courtName: 'Quadra Coberta 5',
      startHour: '18:30:00',
      endHour: '20:00:00',
    });

    mocks.confirmGripoBooking.mockResolvedValue({
      success: true,
      scheduleId: 1234,
      courtName: 'Quadra Coberta 5',
      message: 'Reserva efetuada com sucesso!',
    });

    const response = await POST(
      new Request('http://localhost/api/matches/match-to-book/book-court', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Partida teste' }),
      }),
      { params: Promise.resolve({ id: 'match-to-book' }) }
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.bookingStatus).toBe('booked');
    expect(data.bookedCourtName).toBe('Quadra Coberta 5');
    expect(data.gripoScheduleId).toBe(1234);
    expect(data.bookingMessage).toBe('Reserva efetuada com sucesso!');

    expect(updates.length).toBeGreaterThanOrEqual(1);
    expect(updates[0]).toMatchObject({
      bookingStatus: 'booked',
      bookedCourtName: 'Quadra Coberta 5',
      gripoScheduleId: 1234,
    });
  });
});
