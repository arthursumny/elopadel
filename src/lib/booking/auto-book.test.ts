import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  notifyUsers: vi.fn(),
  findBestSlotForMatch: vi.fn(),
  findMatchingGripoSlot: vi.fn(),
  confirmGripoBooking: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  get db() {
    return mocks.db;
  },
}));

vi.mock('@/lib/db/notifications', () => ({
  notifyUsers: mocks.notifyUsers,
}));

vi.mock('@/lib/integrations/gripo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/gripo')>();
  return {
    ...actual,
    findBestSlotForMatch: mocks.findBestSlotForMatch,
    findMatchingGripoSlot: mocks.findMatchingGripoSlot,
    confirmGripoBooking: mocks.confirmGripoBooking,
  };
});

import { autoBookMatchCourt } from './auto-book';

interface MockDbOptions {
  matchRow?: unknown;
  participants?: Array<{ userId: string }>;
  onUpdate?: (table: unknown, values: unknown) => void;
}

function setupMockDb({ matchRow, participants = [], onUpdate }: MockDbOptions) {
  const updateFn = vi.fn((table: unknown) => ({
    set: vi.fn((values: unknown) => ({
      where: vi.fn(async () => {
        onUpdate?.(table, values);
        return [values];
      }),
    })),
  }));

  const selectFn = vi.fn(() => ({
    from: vi.fn(() => {
      const whereObj = Promise.resolve(participants) as Promise<unknown> & {
        limit: () => Promise<unknown[]>;
      };
      whereObj.limit = async () => (matchRow ? [matchRow] : []);

      const joinObj = {
        leftJoin: () => joinObj,
        where: () => whereObj,
      };
      return joinObj;
    }),
  }));

  mocks.db = {
    select: selectFn,
    update: updateFn,
  };

  return { selectFn, updateFn };
}

describe('autoBookMatchCourt', () => {
  const originalEnv = process.env.AUTO_BOOK_COURT;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AUTO_BOOK_COURT;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.AUTO_BOOK_COURT = originalEnv;
    } else {
      delete process.env.AUTO_BOOK_COURT;
    }
  });

  it('(a) idempotência: se a partida já tem bookingStatus "booked", retorna o estado atual sem chamar a API do Gripo nem atualizar', async () => {
    const bookedAtDate = new Date('2026-11-10T15:00:00Z');
    const matchRow = {
      match: {
        id: 'match-1',
        status: 'confirmed',
        bookingStatus: 'booked',
        bookedCourtName: 'Quadra Central',
        gripoScheduleId: 54321,
        bookingMessage: 'Reserva confirmada anteriormente.',
        bookedAt: bookedAtDate,
      },
      room: {
        id: 'room-1',
        startsAt: new Date(Date.now() + 3600000), // 1h in the future
        durationMinutes: 90,
      },
      club: {
        id: 'club-1',
        gripoClubId: 122,
        gripoUrl: 'https://gripo.app/racket-center',
      },
    };

    const { updateFn } = setupMockDb({ matchRow });

    const result = await autoBookMatchCourt('match-1');

    expect(result).toEqual({
      bookingStatus: 'booked',
      bookedCourtName: 'Quadra Central',
      gripoScheduleId: 54321,
      bookingMessage: 'Reserva confirmada anteriormente.',
      bookedAt: bookedAtDate,
    });

    expect(mocks.findBestSlotForMatch).not.toHaveBeenCalled();
    expect(mocks.confirmGripoBooking).not.toHaveBeenCalled();
    expect(updateFn).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('(b) clube sem gripo id: grava bookingStatus "skipped" e mensagem explicativa', async () => {
    const updates: unknown[] = [];
    const matchRow = {
      match: {
        id: 'match-2',
        status: 'confirmed',
        bookingStatus: null,
        bookedCourtName: null,
        gripoScheduleId: null,
        bookingMessage: null,
        bookedAt: null,
      },
      room: {
        id: 'room-2',
        startsAt: new Date(Date.now() + 7200000), // 2h in the future
        durationMinutes: 90,
      },
      club: {
        id: 'club-2',
        gripoClubId: null,
        gripoUrl: null, // sem URL nem ID
      },
    };

    setupMockDb({
      matchRow,
      onUpdate: (_table, values) => updates.push(values),
    });

    const result = await autoBookMatchCourt('match-2');

    expect(result).toEqual({
      bookingStatus: 'skipped',
      bookingMessage:
        'Clube sem integração de reserva automática. Use o botão de reserva ou reserve pelo Gripo.',
    });

    expect(updates.length).toBe(1);
    expect(updates[0]).toMatchObject({
      bookingStatus: 'skipped',
      bookingMessage:
        'Clube sem integração de reserva automática. Use o botão de reserva ou reserve pelo Gripo.',
    });

    expect(mocks.findBestSlotForMatch).not.toHaveBeenCalled();
    expect(mocks.confirmGripoBooking).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('(c) sucesso: reserva quadra, atualiza matches como "booked", ajusta sala e notifica 4 participantes', async () => {
    const matchUpdates: unknown[] = [];
    const roomUpdates: unknown[] = [];

    // Horário futuro: 2026-11-20T21:30:00Z (18:30 em Brasília)
    const futureDate = new Date('2026-11-20T21:30:00Z');

    const matchRow = {
      match: {
        id: 'match-3',
        status: 'confirmed',
        bookingStatus: null,
        bookedCourtName: null,
        gripoScheduleId: null,
        bookingMessage: null,
        bookedAt: null,
      },
      room: {
        id: 'room-3',
        startsAt: futureDate,
        durationMinutes: 90,
      },
      club: {
        id: 'club-3',
        gripoClubId: 122,
        gripoUrl: 'https://gripo.app/racket-center',
      },
    };

    const participants = [
      { userId: 'user-1' },
      { userId: 'user-2' },
      { userId: 'user-3' },
      { userId: 'user-4' },
    ];

    setupMockDb({
      matchRow,
      participants,
      onUpdate: (table, values) => {
        // We can inspect values to see which table was updated
        if (typeof values === 'object' && values !== null && 'bookingStatus' in values) {
          matchUpdates.push(values);
        } else if (typeof values === 'object' && values !== null && 'durationMinutes' in values) {
          roomUpdates.push(values);
        }
      },
    });

    mocks.findBestSlotForMatch.mockResolvedValue({
      courtId: 4,
      courtName: 'Quadra Padel 4',
      startHour: '18:30:00',
      endHour: '20:00:00',
      totalPriceCents: 16000,
      slotIds: ['101'],
    });

    const gripoMessage =
      'Reserva confirmada. Em caso de cancelamento com menos de 4 horas de antecedência, será cobrado o valor total.';

    mocks.confirmGripoBooking.mockResolvedValue({
      success: true,
      scheduleId: 9988,
      courtName: 'Quadra Padel 4',
      message: gripoMessage,
    });

    const result = await autoBookMatchCourt('match-3');

    expect(result).toMatchObject({
      bookingStatus: 'booked',
      bookedCourtName: 'Quadra Padel 4',
      gripoScheduleId: 9988,
      bookingMessage: gripoMessage,
      bookingPriceCents: 16000,
    });

    // Verificações da API do Gripo
    expect(mocks.findBestSlotForMatch).toHaveBeenCalledWith({
      clubId: 122,
      date: '2026-11-20',
      startTime: '18:30',
      durationMinutes: 90,
      sport: 'padel',
    });
    expect(mocks.confirmGripoBooking).toHaveBeenCalledWith({
      clubId: 122,
      courtId: 4,
      date: '2026-11-20',
      startHour: '18:30:00',
      endHour: '20:00:00',
      notes: 'Elo Padel - partida confirmada',
      sport: 'padel',
      paymentType: 'link',
    });

    // Matches atualizada com booked
    expect(matchUpdates.length).toBe(1);
    expect(matchUpdates[0]).toMatchObject({
      bookingStatus: 'booked',
      bookedCourtName: 'Quadra Padel 4',
      gripoScheduleId: 9988,
      bookingMessage: gripoMessage,
      bookingPriceCents: 16000,
    });

    // MatchRooms ajustada com startsAt e durationMinutes = 90
    expect(roomUpdates.length).toBe(1);
    expect(roomUpdates[0]).toMatchObject({
      durationMinutes: 90,
    });

    // Participantes notificados
    expect(mocks.notifyUsers).toHaveBeenCalledWith(
      ['user-1', 'user-2', 'user-3', 'user-4'],
      expect.objectContaining({
        type: 'gripo-booking',
        title: 'Quadra reservada no Gripo',
        body: `Quadra Padel 4 às 18:30 — ${gripoMessage}`,
        href: '/match/match-3',
      })
    );
  });

  it('respeita flag AUTO_BOOK_COURT=false e grava "skipped"', async () => {
    process.env.AUTO_BOOK_COURT = 'false';

    const updates: unknown[] = [];
    const matchRow = {
      match: {
        id: 'match-flag',
        status: 'confirmed',
        bookingStatus: null,
      },
      room: {
        id: 'room-flag',
        startsAt: new Date(Date.now() + 3600000),
        durationMinutes: 90,
      },
      club: {
        id: 'club-flag',
        gripoClubId: 122,
      },
    };

    setupMockDb({
      matchRow,
      onUpdate: (_table, values) => updates.push(values),
    });

    const result = await autoBookMatchCourt('match-flag');

    expect(result).toEqual({
      bookingStatus: 'skipped',
      bookingMessage: 'Reserva automática desativada.',
    });

    expect(updates[0]).toMatchObject({
      bookingStatus: 'skipped',
      bookingMessage: 'Reserva automática desativada.',
    });

    expect(mocks.findBestSlotForMatch).not.toHaveBeenCalled();
    expect(mocks.confirmGripoBooking).not.toHaveBeenCalled();
  });

  it('grava bookingStatus "failed" se não houver horário livre no Gripo', async () => {
    const updates: unknown[] = [];
    const matchRow = {
      match: {
        id: 'match-no-slot',
        status: 'confirmed',
        bookingStatus: null,
      },
      room: {
        id: 'room-no-slot',
        startsAt: new Date(Date.now() + 3600000),
        durationMinutes: 90,
      },
      club: {
        id: 'club-no-slot',
        gripoClubId: 31,
      },
    };

    setupMockDb({
      matchRow,
      onUpdate: (_table, values) => updates.push(values),
    });

    mocks.findBestSlotForMatch.mockResolvedValue(null);

    const result = await autoBookMatchCourt('match-no-slot');

    expect(result).toEqual({
      bookingStatus: 'failed',
      bookingMessage:
        'Nenhuma quadra de padel com horário livre para a duração da partida no Gripo.',
    });

    expect(updates[0]).toMatchObject({
      bookingStatus: 'failed',
      bookingMessage:
        'Nenhuma quadra de padel com horário livre para a duração da partida no Gripo.',
    });

    expect(mocks.confirmGripoBooking).not.toHaveBeenCalled();
    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('grava bookingStatus "failed" com o erro do Gripo se confirmação falhar', async () => {
    const updates: unknown[] = [];
    const matchRow = {
      match: {
        id: 'match-fail-confirm',
        status: 'confirmed',
        bookingStatus: null,
      },
      room: {
        id: 'room-fail-confirm',
        startsAt: new Date(Date.now() + 3600000),
        durationMinutes: 90,
      },
      club: {
        id: 'club-fail-confirm',
        gripoClubId: 31,
      },
    };

    setupMockDb({
      matchRow,
      onUpdate: (_table, values) => updates.push(values),
    });

    mocks.findBestSlotForMatch.mockResolvedValue({
      startHour: '10:00:00',
      endHour: '11:30:00',
      courtId: 2,
      courtName: 'Quadra 2',
      totalPriceCents: 10000,
      slotIds: ['s1'],
    });

    mocks.confirmGripoBooking.mockResolvedValue({
      success: false,
      error: 'Horário acabou de ser ocupado por outro usuário.',
    });

    const result = await autoBookMatchCourt('match-fail-confirm');

    expect(result).toEqual({
      bookingStatus: 'failed',
      bookingMessage: 'Horário acabou de ser ocupado por outro usuário.',
    });

    expect(updates[0]).toMatchObject({
      bookingStatus: 'failed',
      bookingMessage: 'Horário acabou de ser ocupado por outro usuário.',
    });

    expect(mocks.notifyUsers).not.toHaveBeenCalled();
  });

  it('nunca lança exceção para fora se ocorrer erro inesperado no banco ou na rede', async () => {
    mocks.db = {
      select: vi.fn(() => {
        throw new Error('Falha de conexão com Postgres');
      }),
      update: vi.fn(),
    };

    const result = await autoBookMatchCourt('match-crash');

    expect(result).toEqual({
      bookingStatus: 'failed',
      bookingMessage: 'Falha de conexão com Postgres',
    });
  });
});
