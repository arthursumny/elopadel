import { describe, expect, it, vi } from 'vitest';
import { resolveBookableSlot, type SlotFinder } from './availability';

describe('resolveBookableSlot', () => {
  const baseParams = {
    date: '2026-11-20',
    windowStart: '18:00',
    windowEnd: '21:00',
    durationMinutes: 90,
  };

  it('(a) escolhe o primeiro clube com slot e ignora os sem gripoClubId', async () => {
    const clubs = [
      { id: 'club-no-gripo', gripoClubId: null, name: 'Clube Sem Gripo' },
      { id: 'club-1', gripoClubId: 101, name: 'Clube 1' },
      { id: 'club-2', gripoClubId: 102, name: 'Clube 2' },
    ];

    const findSlot = vi.fn<SlotFinder>(async ({ gripoClubId }) => {
      if (gripoClubId === 101) {
        return {
          startHour: '18:00',
          endHour: '19:30',
          courtId: 10,
          courtName: 'Quadra Vidro 1',
        };
      }
      return null;
    });

    const result = await resolveBookableSlot({
      ...baseParams,
      clubs,
      findSlot,
    });

    expect(result).toEqual({
      clubId: 'club-1',
      clubName: 'Clube 1',
      gripoClubId: 101,
      startHour: '18:00',
      endHour: '19:30',
      courtName: 'Quadra Vidro 1',
    });

    expect(findSlot).toHaveBeenCalledTimes(1);
    expect(findSlot).toHaveBeenCalledWith({
      gripoClubId: 101,
      date: '2026-11-20',
      startTime: '18:00',
      windowStart: '18:00',
      windowEnd: '21:00',
      durationMinutes: 90,
    });
  });

  it('(b) devolve null quando nenhum clube tem slot', async () => {
    const clubs = [
      { id: 'club-1', gripoClubId: 101, name: 'Clube 1' },
      { id: 'club-2', gripoClubId: 102, name: 'Clube 2' },
    ];

    const findSlot = vi.fn<SlotFinder>(async () => null);

    const result = await resolveBookableSlot({
      ...baseParams,
      clubs,
      findSlot,
    });

    expect(result).toBeNull();
    expect(findSlot).toHaveBeenCalledTimes(2);
  });

  it('(c) se o findSlot de um clube lançar erro, segue para o próximo', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const clubs = [
      { id: 'club-error', gripoClubId: 101, name: 'Clube Erro' },
      { id: 'club-ok', gripoClubId: 102, name: 'Clube Ok' },
    ];

    const findSlot = vi.fn<SlotFinder>(async ({ gripoClubId }) => {
      if (gripoClubId === 101) {
        throw new Error('Falha de rede ao consultar Gripo');
      }
      return {
        startHour: '19:30',
        endHour: '21:00',
        courtId: 20,
        courtName: 'Quadra Vidro 2',
      };
    });

    const result = await resolveBookableSlot({
      ...baseParams,
      clubs,
      findSlot,
    });

    expect(result).toEqual({
      clubId: 'club-ok',
      clubName: 'Clube Ok',
      gripoClubId: 102,
      startHour: '19:30',
      endHour: '21:00',
      courtName: 'Quadra Vidro 2',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[resolveBookableSlot] Erro ao consultar clube Clube Erro (101):'),
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });

  it('(d) respeita a ordem dos clubes recebidos', async () => {
    const clubA = { id: 'club-a', gripoClubId: 201, name: 'Arena Alfa' };
    const clubB = { id: 'club-b', gripoClubId: 202, name: 'Arena Beta' };

    const findSlot = vi.fn<SlotFinder>(async ({ gripoClubId }) => ({
      startHour: '18:30',
      endHour: '20:00',
      courtId: gripoClubId,
      courtName: `Quadra ${gripoClubId}`,
    }));

    // Ordem: A depois B -> deve retornar A
    const result1 = await resolveBookableSlot({
      ...baseParams,
      clubs: [clubA, clubB],
      findSlot,
    });
    expect(result1?.clubId).toBe('club-a');

    findSlot.mockClear();

    // Ordem inversa: B depois A -> deve retornar B
    const result2 = await resolveBookableSlot({
      ...baseParams,
      clubs: [clubB, clubA],
      findSlot,
    });
    expect(result2?.clubId).toBe('club-b');
  });
});
