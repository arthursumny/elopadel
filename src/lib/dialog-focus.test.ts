import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from './dialog-focus';

describe('dialog focus order', () => {
  it('wraps forward from the last element to the first', () => {
    expect(nextFocusIndex(2, 3, false)).toBe(0);
  });

  it('wraps backward from the first element to the last', () => {
    expect(nextFocusIndex(0, 3, true)).toBe(2);
  });

  it('moves one step in both directions inside the dialog', () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1);
    expect(nextFocusIndex(2, 3, true)).toBe(1);
  });

  it('starts at the first or last element when focus is outside the list', () => {
    expect(nextFocusIndex(-1, 3, false)).toBe(0);
    expect(nextFocusIndex(-1, 3, true)).toBe(2);
    expect(nextFocusIndex(9, 3, false)).toBe(0);
  });

  it('returns no target for an empty dialog', () => {
    expect(nextFocusIndex(0, 0, false)).toBe(-1);
  });
});
