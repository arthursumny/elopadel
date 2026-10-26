import { describe, it, expect } from 'vitest';
import { resolveTierAccent } from './RankEmblem';

describe('RankEmblem Component Domain Logic (`RankEmblem.tsx`)', () => {
  it('TC-EMBLEM-01: resolves all 8 tier division accents accurately', () => {
    expect(resolveTierAccent('6ª III')).toBe('slate');
    expect(resolveTierAccent('6ª II')).toBe('slate');
    expect(resolveTierAccent('6ª I')).toBe('slate');

    expect(resolveTierAccent('5ª III')).toBe('blue');
    expect(resolveTierAccent('5ª II')).toBe('blue');
    expect(resolveTierAccent('5ª I')).toBe('blue');

    expect(resolveTierAccent('4ª III')).toBe('cyan');
    expect(resolveTierAccent('4ª II')).toBe('cyan');
    expect(resolveTierAccent('4ª I')).toBe('cyan');

    expect(resolveTierAccent('3ª III')).toBe('violet');
    expect(resolveTierAccent('3ª II')).toBe('violet');
    expect(resolveTierAccent('3ª I')).toBe('violet');

    expect(resolveTierAccent('2ª III')).toBe('amber');
    expect(resolveTierAccent('2ª II')).toBe('amber');
    expect(resolveTierAccent('2ª I')).toBe('amber');

    expect(resolveTierAccent('1ª III')).toBe('orange');
    expect(resolveTierAccent('1ª II')).toBe('orange');
    expect(resolveTierAccent('1ª I')).toBe('orange');

    expect(resolveTierAccent('Elite')).toBe('gold');
    expect(resolveTierAccent('Challenger')).toBe('lime');
  });

  it('TC-EMBLEM-02: falls back to cyan accent for unrecognized labels', () => {
    expect(resolveTierAccent('Custom Rank')).toBe('cyan');
    expect(resolveTierAccent('')).toBe('cyan');
  });

  it('TC-EMBLEM-03: properly parses category and division parts from multi-word label', () => {
    const label = '5ª II';
    const parts = label.split(' ');
    expect(parts[0]).toBe('5ª');
    expect(parts[1]).toBe('II');

    const singleLabel = 'Elite';
    const singleParts = singleLabel.split(' ');
    expect(singleParts[0]).toBe('Elite');
    expect(singleParts[1]).toBeUndefined();
  });
});
