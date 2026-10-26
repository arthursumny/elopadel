import { describe, expect, it } from 'vitest';
import { canValidateResult, hasConflictingResult, resultVoteCounts, validateBestOfThree } from './match';

describe('validação de partidas', () => {
  it('aceita melhor de três com dois sets vencidos', () => {
    expect(validateBestOfThree({ sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 10, b: 8 }], winner: 'A' })).toBe(true);
  });

  it('rejeita vencedor incompatível com o placar', () => {
    expect(validateBestOfThree({ sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }], winner: 'B' })).toBe(false);
  });

  it('exige três confirmações com pelo menos uma por dupla', () => {
    expect(canValidateResult([{ playerId: '1', team: 'A', status: 'confirmed' }, { playerId: '2', team: 'A', status: 'confirmed' }, { playerId: '3', team: 'B', status: 'confirmed' }])).toBe(true);
    expect(canValidateResult([{ playerId: '1', team: 'A', status: 'confirmed' }, { playerId: '2', team: 'A', status: 'confirmed' }, { playerId: '3', team: 'A', status: 'confirmed' }])).toBe(false);
    expect(canValidateResult([{ playerId: '1', team: 'A', status: 'confirmed' }, { playerId: '2', team: 'A', status: 'confirmed' }, { playerId: '3', team: 'B', status: 'disputed' }])).toBe(false);
  });

  it('bloqueia votos conflitantes mesmo quando há quatro respostas', () => {
    const votes = [
      { playerId: '1', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: '2', team: 'A' as const, status: 'confirmed' as const, winner: 'A' as const },
      { playerId: '3', team: 'B' as const, status: 'confirmed' as const, winner: 'B' as const },
      { playerId: '4', team: 'B' as const, status: 'confirmed' as const, winner: 'B' as const },
    ];
    expect(hasConflictingResult(votes, 'A')).toBe(true);
    expect(canValidateResult(votes, 'A')).toBe(false);
    expect(resultVoteCounts(votes)).toEqual({ A: 2, B: 2, pending: 0, disputed: 0 });
  });

  it('permite três votos iguais com uma confirmação de cada dupla', () => {
    expect(canValidateResult([
      { playerId: '1', team: 'A', status: 'confirmed', winner: 'A' },
      { playerId: '2', team: 'A', status: 'confirmed', winner: 'A' },
      { playerId: '3', team: 'B', status: 'confirmed', winner: 'A' },
    ], 'A')).toBe(true);
  });
});
