import { describe, expect, it } from 'vitest';
import { filterHistoryItems, type HistoryFilter } from '@/components/history-view';
import { requestLogout } from '@/components/sign-out-button';
import type { HistoryItem } from '@/lib/types';

const items: HistoryItem[] = [
  { id: 'm1', date: '12 out', result: 'Vitória', score: '6–4, 6–3', opponent: 'Dupla A', club: 'Clube Central', delta: 18, tone: 'win', label: 'Ranqueada' },
  { id: 'm2', date: '10 out', result: 'Derrota', score: '3–6, 4–6', opponent: 'Dupla B', club: 'Clube Central', delta: -12, tone: 'loss', label: 'Ranqueada' },
  { id: 'm3', date: '08 out', result: 'Aguardando confirmação', score: 'Placar pendente', opponent: 'Dupla C', club: 'Clube Norte', delta: null, tone: 'pending', label: 'Amistosa' },
  { id: 'm4', date: '01 out', result: 'Vitória', score: '6–2, 6–2', opponent: 'Dupla D', club: 'Clube Central', delta: null, tone: 'friendly', label: 'Amistosa' },
];

describe('history filters', () => {
  it('returns every match for the default filter without changing order', () => {
    expect(filterHistoryItems(items, 'all').map((item) => item.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it.each<[HistoryFilter, string[]]>([
    ['win', ['m1']],
    ['loss', ['m2']],
    ['pending', ['m3']],
    ['friendly', ['m3', 'm4']],
  ])('filters %s matches', (filter, expected) => {
    expect(filterHistoryItems(items, filter).map((item) => item.id)).toEqual(expected);
  });

  it('returns a new array and never mutates the source list', () => {
    const all = filterHistoryItems(items, 'all');
    all.pop();
    expect(items).toHaveLength(4);
    expect(all).toHaveLength(3);
  });

  it('returns an empty result when a filter has no matches', () => {
    expect(filterHistoryItems(items.filter((item) => item.tone !== 'loss'), 'loss')).toEqual([]);
  });
});

describe('logout request', () => {
  it('only reports success when the server responds with ok', async () => {
    await expect(requestLogout(async () => ({ ok: true }))).resolves.toBe(true);
    await expect(requestLogout(async () => ({ ok: false }))).resolves.toBe(false);
  });

  it('treats a network failure as a failed logout', async () => {
    await expect(requestLogout(async () => {
      throw new Error('network down');
    })).resolves.toBe(false);
  });
});
