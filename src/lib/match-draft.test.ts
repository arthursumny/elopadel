import { describe, expect, it } from 'vitest';
import { matchDraftFromServer, shouldApplyMatchResponse, shouldApplyServerMatchDraft } from './match-draft';

describe('match draft hydration', () => {
  it('hydrates initial server score and winner while the match allows a draft', () => {
    expect(matchDraftFromServer([{ a: 6, b: 3 }, { a: 4, b: 6 }], 'B')).toEqual({
      setOneA: '6', setOneB: '3', setTwoA: '4', setTwoB: '6', winner: 'B',
    });
    expect(shouldApplyServerMatchDraft(false, 'confirmed')).toBe(true);
  });

  it('preserves a dirty draft during polls while the match still allows edits', () => {
    expect(shouldApplyServerMatchDraft(true, 'confirmed')).toBe(false);
    expect(shouldApplyServerMatchDraft(true, 'confirming')).toBe(false);
  });

  it('replaces a dirty draft when an authoritative result arrives', () => {
    const typedDraft = { setOneA: '5', setOneB: '7', setTwoA: '6', setTwoB: '4', winner: 'A' as const };
    const receivedResult = matchDraftFromServer([{ a: 6, b: 2 }, { a: 6, b: 4 }], 'B');
    expect(shouldApplyServerMatchDraft(true, 'result-pending')).toBe(true);
    expect(shouldApplyServerMatchDraft(true, 'validated')).toBe(true);
    expect(shouldApplyServerMatchDraft(true, 'disputed')).toBe(true);
    expect(receivedResult).not.toEqual(typedDraft);
    expect(receivedResult).toEqual({ setOneA: '6', setOneB: '2', setTwoA: '6', setTwoB: '4', winner: 'B' });
  });

  it('accepts the first authoritative sets when confirmed transitions to result-pending', () => {
    const status = 'confirmed';
    const cleanInitial = matchDraftFromServer([], null);
    expect(shouldApplyServerMatchDraft(false, status)).toBe(true);
    expect(cleanInitial.setOneA).toBe('');

    const nextStatus = 'result-pending';
    const submitted = matchDraftFromServer([{ a: 6, b: 3 }, { a: 6, b: 4 }], 'A');
    expect(shouldApplyServerMatchDraft(false, nextStatus)).toBe(true);
    expect(submitted).toEqual({ setOneA: '6', setOneB: '3', setTwoA: '6', setTwoB: '4', winner: 'A' });
  });

  it('clears absent server sets instead of retaining a prior match score', () => {
    expect(matchDraftFromServer([], null)).toEqual({
      setOneA: '', setOneB: '', setTwoA: '', setTwoB: '', winner: 'A',
    });
  });

  it('rejects late poll responses and responses for a previous match id', () => {
    expect(shouldApplyMatchResponse(2, 3, 'match-a', 'match-a')).toBe(false);
    expect(shouldApplyMatchResponse(3, 3, 'match-a', 'match-b')).toBe(false);
    expect(shouldApplyMatchResponse(3, 3, 'match-b', 'match-b')).toBe(true);
  });
});
