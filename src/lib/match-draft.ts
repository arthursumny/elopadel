export type MatchDraft = {
  setOneA: string;
  setOneB: string;
  setTwoA: string;
  setTwoB: string;
  winner: 'A' | 'B';
};

export function matchDraftFromServer(sets: Array<{ a: number; b: number }>, winner: 'A' | 'B' | null | undefined): MatchDraft {
  return {
    setOneA: sets[0] ? String(sets[0].a) : '',
    setOneB: sets[0] ? String(sets[0].b) : '',
    setTwoA: sets[1] ? String(sets[1].a) : '',
    setTwoB: sets[1] ? String(sets[1].b) : '',
    winner: winner ?? 'A',
  };
}

export function shouldApplyServerMatchDraft(dirty: boolean, status: string): boolean {
  const resultIsAuthoritative = ['result-pending', 'validated', 'disputed'].includes(status);
  return !dirty || resultIsAuthoritative;
}

export function shouldApplyMatchResponse(request: number, latestRequest: number, requestedId: string, activeId: string): boolean {
  return request === latestRequest && requestedId === activeId;
}
