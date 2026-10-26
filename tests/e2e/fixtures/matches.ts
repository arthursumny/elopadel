export interface MatchFixture {
  id: string;
  clubId?: string;
  mode: 'ranked' | 'friendly';
  status:
    | 'confirming'
    | 'confirmed'
    | 'result-pending'
    | 'processing'
    | 'validated'
    | 'disputed'
    | 'no-show'
    | 'cancelled';
  startsAt: Date;
  durationMinutes: number;
  teamA: {
    player1Id: string;
    player2Id: string;
  };
  teamB: {
    player1Id: string;
    player2Id: string;
  };
  sets?: Array<{ a: number; b: number }>;
  winner?: 'A' | 'B';
}

export function createSampleMatch(overrides?: Partial<MatchFixture>): MatchFixture {
  return {
    id: '99999999-9999-4999-8999-999999999999',
    clubId: 'club-joacaba-001',
    mode: 'ranked',
    status: 'confirming',
    startsAt: new Date(Date.now() + 3600 * 1000), // starts in 1 hour
    durationMinutes: 90,
    teamA: {
      player1Id: '11111111-1111-4111-8111-111111111111',
      player2Id: '22222222-2222-4222-8222-222222222222',
    },
    teamB: {
      player1Id: '33333333-3333-4333-8333-333333333333',
      player2Id: '44444444-4444-4444-8444-444444444444',
    },
    ...overrides,
  };
}

export const VALID_BEST_OF_THREE_SETS = [
  { sets: [{ a: 6, b: 4 }, { a: 6, b: 3 }], winner: 'A' as const },
  { sets: [{ a: 4, b: 6 }, { a: 6, b: 4 }, { a: 7, b: 5 }], winner: 'A' as const },
  { sets: [{ a: 3, b: 6 }, { a: 2, b: 6 }], winner: 'B' as const },
  { sets: [{ a: 6, b: 7 }, { a: 7, b: 6 }, { a: 8, b: 10 }], winner: 'B' as const },
];

export const INVALID_SETS = [
  { sets: [{ a: 6, b: 6 }], winner: 'A' as const, reason: 'tied-set' },
  { sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }], winner: 'B' as const, reason: 'mismatched-winner' },
  { sets: [{ a: -1, b: 6 }, { a: 0, b: 6 }], winner: 'B' as const, reason: 'negative-score' },
  { sets: [{ a: 6, b: 4 }], winner: 'A' as const, reason: 'single-set-not-best-of-three' },
];
