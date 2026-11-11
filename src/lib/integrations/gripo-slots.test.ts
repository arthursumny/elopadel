import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearGripoAvailabilityCache,
  findBestSlotForMatch,
  GripoAvailabilityResponse,
  gripoApi,
  selectBestSlot,
} from './gripo';

describe('Gripo Slot Selection (selectBestSlot & findBestSlotForMatch)', () => {
  beforeEach(() => {
    clearGripoAvailabilityCache();
  });
  // Dados reais observados no Racket Center (club_id 122, 2026-11-19):
  // Quadra Padel 1 | 1 | Vidro | 18:00-18:30(40), 21:30-23:00(100)
  // Quadra Padel 3 | 7 | Vidro | 18:00-18:30(40)
  // Q1 - Beach Tennis | 3 | Areia | 17:00..21:30 em blocos de 30 min (25 cada)
  const racketCenterFixture: GripoAvailabilityResponse = {
    date: '2026-11-19',
    courts: [
      {
        id: 1,
        name: 'Quadra Padel 1',
        type: 'Vidro',
        hours: [
          {
            date: '2026-11-19',
            hour: '18:00:00',
            startHour: '18:00:00',
            endHour: '18:30:00',
            interval: 30,
            available: true,
            availableToSchedule: true,
            courtId: 1,
            courtName: 'Quadra Padel 1',
            scheduleGridId: 101,
            priceInCents: 4000,
            hash: 'h-padel1-1800',
            sport: 'padel',
          },
          {
            date: '2026-11-19',
            hour: '21:30:00',
            startHour: '21:30:00',
            endHour: '22:00:00',
            interval: 30,
            available: true,
            availableToSchedule: true,
            courtId: 1,
            courtName: 'Quadra Padel 1',
            scheduleGridId: 102,
            priceInCents: 4000,
            hash: 'h-padel1-2130',
            sport: 'padel',
          },
          {
            date: '2026-11-19',
            hour: '22:00:00',
            startHour: '22:00:00',
            endHour: '22:30:00',
            interval: 30,
            available: true,
            availableToSchedule: true,
            courtId: 1,
            courtName: 'Quadra Padel 1',
            scheduleGridId: 103,
            priceInCents: 3000,
            hash: 'h-padel1-2200',
            sport: 'padel',
          },
          {
            date: '2026-11-19',
            hour: '22:30:00',
            startHour: '22:30:00',
            endHour: '23:00:00',
            interval: 30,
            available: true,
            availableToSchedule: true,
            courtId: 1,
            courtName: 'Quadra Padel 1',
            scheduleGridId: 104,
            priceInCents: 3000,
            hash: 'h-padel1-2230',
            sport: 'padel',
          },
        ],
      },
      {
        id: 7,
        name: 'Quadra Padel 3',
        type: 'Vidro',
        hours: [
          {
            date: '2026-11-19',
            hour: '18:00:00',
            startHour: '18:00:00',
            endHour: '18:30:00',
            interval: 30,
            available: true,
            availableToSchedule: true,
            courtId: 7,
            courtName: 'Quadra Padel 3',
            scheduleGridId: 701,
            priceInCents: 4000,
            hash: 'h-padel3-1800',
            sport: 'padel',
          },
        ],
      },
      {
        id: 3,
        name: 'Q1 - Beach Tennis',
        type: 'Areia',
        hours: [
          // 17:00..21:30 em blocos de 30 min (25 cada), rotuladas como padel na API
          ...[
            ['17:00:00', '17:30:00'],
            ['17:30:00', '18:00:00'],
            ['18:00:00', '18:30:00'],
            ['18:30:00', '19:00:00'],
            ['19:00:00', '19:30:00'],
            ['19:30:00', '20:00:00'],
            ['20:00:00', '20:30:00'],
            ['20:30:00', '21:00:00'],
            ['21:00:00', '21:30:00'],
          ].map(([start, end], idx) => ({
            date: '2026-11-19',
            hour: start,
            startHour: start,
            endHour: end,
            interval: 30,
            available: true,
            availableToSchedule: true,
            courtId: 3,
            courtName: 'Q1 - Beach Tennis',
            scheduleGridId: 300 + idx,
            priceInCents: 2500,
            hash: `h-beach-${idx}`,
            sport: 'padel',
          })),
        ],
      },
    ],
  };

  it('(a) escolhe "Quadra Padel 1" das 21:30 às 23:00 quando o pedido é 21:30 e a duração 90', () => {
    const result = selectBestSlot(racketCenterFixture, {
      startTime: '21:30',
      durationMinutes: 90,
      sport: 'padel',
    });

    expect(result).not.toBeNull();
    expect(result?.courtId).toBe(1);
    expect(result?.courtName).toBe('Quadra Padel 1');
    expect(result?.startHour).toBe('21:30');
    expect(result?.endHour).toBe('23:00');
    expect(result?.totalPriceCents).toBe(10000); // 4000 + 3000 + 3000
    expect(result?.slotIds).toEqual([
      'h-padel1-2130',
      'h-padel1-2200',
      'h-padel1-2230',
    ]);
  });

  it('(b) NÃO escolhe a quadra de areia quando existe quadra de vidro compatível', () => {
    // Ambos possuem cobertura de 90 min (18:00 às 19:30)
    const fixtureWithBoth: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 3,
          name: 'Q1 - Beach Tennis',
          type: 'Areia',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 301,
              priceInCents: 2500,
              hash: 'h-b1',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '18:30:00',
              startHour: '18:30:00',
              endHour: '19:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 302,
              priceInCents: 2500,
              hash: 'h-b2',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:00:00',
              startHour: '19:00:00',
              endHour: '19:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 303,
              priceInCents: 2500,
              hash: 'h-b3',
              sport: 'padel',
            },
          ],
        },
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 101,
              priceInCents: 4000,
              hash: 'h-p1',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '18:30:00',
              startHour: '18:30:00',
              endHour: '19:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 102,
              priceInCents: 4000,
              hash: 'h-p2',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:00:00',
              startHour: '19:00:00',
              endHour: '19:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 103,
              priceInCents: 4000,
              hash: 'h-p3',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const result = selectBestSlot(fixtureWithBoth, {
      startTime: '18:00',
      durationMinutes: 90,
      sport: 'padel',
    });

    expect(result).not.toBeNull();
    expect(result?.courtId).toBe(1);
    expect(result?.courtName).toBe('Quadra Padel 1');
    expect(result?.courtName).not.toContain('Beach');
    expect(result?.startHour).toBe('18:00');
    expect(result?.endHour).toBe('19:30');

    // Também prefere vidro iniciando 30 min depois em vez de areia no horário exato
    const fixtureGlassDelayed: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        fixtureWithBoth.courts[0], // Beach Tennis 18:00-19:30
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:30:00',
              startHour: '18:30:00',
              endHour: '19:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 201,
              priceInCents: 4000,
              hash: 'h-pg1',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:00:00',
              startHour: '19:00:00',
              endHour: '19:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 202,
              priceInCents: 4000,
              hash: 'h-pg2',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:30:00',
              startHour: '19:30:00',
              endHour: '20:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 203,
              priceInCents: 4000,
              hash: 'h-pg3',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const resultDelayed = selectBestSlot(fixtureGlassDelayed, {
      startTime: '18:00',
      durationMinutes: 90,
      sport: 'padel',
    });

    expect(resultDelayed).not.toBeNull();
    expect(resultDelayed?.courtId).toBe(1);
    expect(resultDelayed?.courtName).toBe('Quadra Padel 1');
    expect(resultDelayed?.startHour).toBe('18:30');
    expect(resultDelayed?.endHour).toBe('20:00');
  });

  it('(c) retorna null quando nenhuma quadra cobre 90 min no horário', () => {
    // Fixture onde quadras possuem apenas blocos de 30 minutos isolados
    const fixtureNoCoverage: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 101,
              priceInCents: 4000,
              hash: 'h-p1-short',
              sport: 'padel',
            },
          ],
        },
        {
          id: 7,
          name: 'Quadra Padel 3',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 7,
              courtName: 'Quadra Padel 3',
              scheduleGridId: 701,
              priceInCents: 4000,
              hash: 'h-p3-short',
              sport: 'padel',
            },
          ],
        },
        {
          id: 3,
          name: 'Q1 - Beach Tennis',
          type: 'Areia',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 301,
              priceInCents: 2500,
              hash: 'h-b-short',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const result = selectBestSlot(fixtureNoCoverage, {
      startTime: '18:00',
      durationMinutes: 90,
      sport: 'padel',
    });

    expect(result).toBeNull();
  });

  it('(a) com allowNonPadelCourts=false e apenas areia disponível, retorna null', () => {
    // Apenas a quadra de areia possui horários disponíveis cobrindo 90 min
    const fixtureOnlySand: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: false, // Ocupada
              availableToSchedule: false,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 101,
              priceInCents: 4000,
              hash: 'h-p1-busy',
              sport: 'padel',
            },
          ],
        },
        {
          id: 3,
          name: 'Q1 - Beach Tennis',
          type: 'Areia',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:30:00',
              startHour: '18:30:00',
              endHour: '19:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 301,
              priceInCents: 2500,
              hash: 'h-b1',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:00:00',
              startHour: '19:00:00',
              endHour: '19:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 302,
              priceInCents: 2500,
              hash: 'h-b2',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:30:00',
              startHour: '19:30:00',
              endHour: '20:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 303,
              priceInCents: 2500,
              hash: 'h-b3',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    // Default allowNonPadelCourts: false
    const resultDefault = selectBestSlot(fixtureOnlySand, {
      startTime: '18:30',
      durationMinutes: 90,
      sport: 'padel',
    });
    expect(resultDefault).toBeNull();

    // Explicit allowNonPadelCourts: false
    const resultExplicit = selectBestSlot(fixtureOnlySand, {
      startTime: '18:30',
      durationMinutes: 90,
      sport: 'padel',
      allowNonPadelCourts: false,
    });
    expect(resultExplicit).toBeNull();
  });

  it('(b) com allowNonPadelCourts=true volta a aceitar areia', () => {
    const fixtureOnlySand: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: false,
              availableToSchedule: false,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 101,
              priceInCents: 4000,
              hash: 'h-p1-busy',
              sport: 'padel',
            },
          ],
        },
        {
          id: 3,
          name: 'Q1 - Beach Tennis',
          type: 'Areia',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:30:00',
              startHour: '18:30:00',
              endHour: '19:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 301,
              priceInCents: 2500,
              hash: 'h-b1',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:00:00',
              startHour: '19:00:00',
              endHour: '19:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 302,
              priceInCents: 2500,
              hash: 'h-b2',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:30:00',
              startHour: '19:30:00',
              endHour: '20:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 3,
              courtName: 'Q1 - Beach Tennis',
              scheduleGridId: 303,
              priceInCents: 2500,
              hash: 'h-b3',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const result = selectBestSlot(fixtureOnlySand, {
      startTime: '18:30',
      durationMinutes: 90,
      sport: 'padel',
      allowNonPadelCourts: true,
    });

    expect(result).not.toBeNull();
    expect(result?.courtId).toBe(3);
    expect(result?.courtName).toBe('Q1 - Beach Tennis');
    expect(result?.startHour).toBe('18:30');
    expect(result?.endHour).toBe('20:00');
    expect(result?.totalPriceCents).toBe(7500); // 3 * 2500
    expect(result?.slotIds).toEqual(['h-b1', 'h-b2', 'h-b3']);
  });

  it('(c) escolha dentro de janela (windowStart 18:00, windowEnd 21:00, start 18:30, duração 90) pega a primeira quadra de vidro que cubra o intervalo, mesmo que não comece exatamente 18:30', () => {
    const fixtureWindow: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '18:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 101,
              priceInCents: 4000,
              hash: 'h-w1',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '18:30:00',
              startHour: '18:30:00',
              endHour: '19:00:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 102,
              priceInCents: 4000,
              hash: 'h-w2',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:00:00',
              startHour: '19:00:00',
              endHour: '19:30:00',
              interval: 30,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 103,
              priceInCents: 4000,
              hash: 'h-w3',
              sport: 'padel',
            },
            {
              date: '2026-11-19',
              hour: '19:30:00',
              startHour: '19:30:00',
              endHour: '20:00:00',
              interval: 30,
              available: false,
              availableToSchedule: false,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 104,
              priceInCents: 4000,
              hash: 'h-w4',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const result = selectBestSlot(fixtureWindow, {
      startTime: '18:30',
      durationMinutes: 90,
      windowStart: '18:00',
      windowEnd: '21:00',
      sport: 'padel',
    });

    expect(result).not.toBeNull();
    expect(result?.courtId).toBe(1);
    expect(result?.courtName).toBe('Quadra Padel 1');
    expect(result?.startHour).toBe('18:00');
    expect(result?.endHour).toBe('19:30');
    expect(result?.slotIds).toEqual(['h-w1', 'h-w2', 'h-w3']);
  });

  it('suporta slot único cobrindo a duração de 90 min (ex: 21:30 às 23:00)', () => {
    const fixtureSingleSlot: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '21:30:00',
              startHour: '21:30:00',
              endHour: '23:00:00',
              interval: 90,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 501,
              priceInCents: 10000,
              hash: 'h-90min',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const result = selectBestSlot(fixtureSingleSlot, {
      startTime: '21:30',
      durationMinutes: 90,
      sport: 'padel',
    });

    expect(result).not.toBeNull();
    expect(result?.courtId).toBe(1);
    expect(result?.startHour).toBe('21:30');
    expect(result?.endHour).toBe('23:00');
    expect(result?.totalPriceCents).toBe(10000);
    expect(result?.slotIds).toEqual(['h-90min']);
  });

  it('desempata pelo menor preço quando duas quadras de vidro estão disponíveis', () => {
    const fixtureTwoGlass: GripoAvailabilityResponse = {
      date: '2026-11-19',
      courts: [
        {
          id: 1,
          name: 'Quadra Padel 1',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '19:30:00',
              interval: 90,
              available: true,
              availableToSchedule: true,
              courtId: 1,
              courtName: 'Quadra Padel 1',
              scheduleGridId: 101,
              priceInCents: 12000, // R$ 120
              hash: 'h-expensive',
              sport: 'padel',
            },
          ],
        },
        {
          id: 2,
          name: 'Quadra Padel 2',
          type: 'Vidro',
          hours: [
            {
              date: '2026-11-19',
              hour: '18:00:00',
              startHour: '18:00:00',
              endHour: '19:30:00',
              interval: 90,
              available: true,
              availableToSchedule: true,
              courtId: 2,
              courtName: 'Quadra Padel 2',
              scheduleGridId: 102,
              priceInCents: 9000, // R$ 90 (mais barata)
              hash: 'h-cheaper',
              sport: 'padel',
            },
          ],
        },
      ],
    };

    const result = selectBestSlot(fixtureTwoGlass, {
      startTime: '18:00',
      durationMinutes: 90,
      sport: 'padel',
    });

    expect(result?.courtId).toBe(2);
    expect(result?.courtName).toBe('Quadra Padel 2');
    expect(result?.totalPriceCents).toBe(9000);
  });

  it('findBestSlotForMatch busca via fetch e retorna o melhor slot', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '2026-11-19',
        courts: racketCenterFixture.courts.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          hours: c.hours.map((h) => ({
            date: h.date,
            hour: h.hour,
            start_hour: h.startHour,
            end_hour: h.endHour,
            interval: h.interval,
            available: h.available,
            available_to_schedule: h.availableToSchedule,
            court_id: h.courtId,
            court: h.courtName,
            schedule_grid_id: h.scheduleGridId,
            price: h.priceInCents,
            hash: h.hash,
            sport: h.sport,
          })),
        })),
      }),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const result = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
        sport: 'padel',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.gripo.com.br/app/v1/schedule/available',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ club_id: 122, date: '2026-11-19' }),
        })
      );
      expect(result).not.toBeNull();
      expect(result?.courtId).toBe(1);
      expect(result?.courtName).toBe('Quadra Padel 1');
      expect(result?.startHour).toBe('21:30');
      expect(result?.endHour).toBe('23:00');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('(d) cache: duas chamadas seguidas a findBestSlotForMatch no mesmo clube+data fazem só um fetch', async () => {
    clearGripoAvailabilityCache();

    const fetchSpy = vi.spyOn(gripoApi, 'fetchGripoAvailability').mockResolvedValue(racketCenterFixture);

    try {
      const res1 = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
      });

      const res2 = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
      });

      expect(res1).not.toBeNull();
      expect(res2).toEqual(res1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      clearGripoAvailabilityCache();

      const res3 = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
      });

      expect(res3).not.toBeNull();
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    } finally {
      fetchSpy.mockRestore();
      clearGripoAvailabilityCache();
    }
  });

  it('(d) cache: duas chamadas seguidas a findBestSlotForMatch no mesmo clube+data fazem só um fetch HTTP', async () => {
    clearGripoAvailabilityCache();

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '2026-11-19',
        courts: racketCenterFixture.courts.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          hours: c.hours.map((h) => ({
            date: h.date,
            hour: h.hour,
            start_hour: h.startHour,
            end_hour: h.endHour,
            interval: h.interval,
            available: h.available,
            available_to_schedule: h.availableToSchedule,
            court_id: h.courtId,
            court: h.courtName,
            schedule_grid_id: h.scheduleGridId,
            price: h.priceInCents,
            hash: h.hash,
            sport: h.sport,
          })),
        })),
      }),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch;

    try {
      const res1 = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
      });

      const res2 = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
      });

      expect(res1).not.toBeNull();
      expect(res2).toEqual(res1);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      clearGripoAvailabilityCache();

      const res3 = await findBestSlotForMatch({
        clubId: 122,
        date: '2026-11-19',
        startTime: '21:30',
        durationMinutes: 90,
      });

      expect(res3).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      clearGripoAvailabilityCache();
    }
  });
});
