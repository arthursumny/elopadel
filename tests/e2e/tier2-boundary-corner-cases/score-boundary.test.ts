import { describe, expect, it } from 'vitest';
import { validateBestOfThree } from '@/lib/domain/match';

describe('Tier 2: Boundary & Corner Cases — Best-of-3 Score Boundaries (R1)', () => {
  it('TC-BND-SCORE-01: Rejects tied game sets (e.g. 6x6 without decisive winner)', () => {
    expect(
      validateBestOfThree({
        sets: [{ a: 6, b: 6 }, { a: 6, b: 4 }],
        winner: 'A',
      })
    ).toBe(false);
  });

  it('TC-BND-SCORE-02: Rejects inverted winner declaration incompatible with set outcomes', () => {
    // Team A won 6-4 and 6-2, but winner submitted as 'B'
    expect(
      validateBestOfThree({
        sets: [{ a: 6, b: 4 }, { a: 6, b: 2 }],
        winner: 'B',
      })
    ).toBe(false);
  });

  it('TC-BND-SCORE-03: Rejects negative game scores in any set', () => {
    expect(
      validateBestOfThree({
        sets: [{ a: -1, b: 6 }, { a: 2, b: 6 }],
        winner: 'B',
      })
    ).toBe(false);
  });

  it('TC-BND-SCORE-04: Rejects incomplete match with only 1 set completed', () => {
    expect(
      validateBestOfThree({
        sets: [{ a: 6, b: 4 }],
        winner: 'A',
      })
    ).toBe(false);
  });

  it('TC-BND-SCORE-05: Rejects score payload exceeding 3 sets in Best-of-3 format', () => {
    expect(
      validateBestOfThree({
        sets: [{ a: 6, b: 4 }, { a: 4, b: 6 }, { a: 6, b: 4 }, { a: 6, b: 2 }],
        winner: 'A',
      })
    ).toBe(false);
  });

  it('TC-BND-SCORE-06: Accepts decisive 3rd set champions tiebreak (e.g. 10-8)', () => {
    expect(
      validateBestOfThree({
        sets: [{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 10, b: 8 }],
        winner: 'A',
      })
    ).toBe(true);
  });
});
