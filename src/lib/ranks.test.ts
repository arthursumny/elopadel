import { describe, expect, it } from 'vitest';
import { categoryFromTier, initialRankForCategory, normalizeInitialCategory, ratingMidpointForRank } from './ranks';

describe('largada competitiva', () => {
  it('converte a categoria declarada para a divisão intermediária', () => {
    expect(initialRankForCategory('4ª').label).toBe('4ª II');
    expect(initialRankForCategory('1ª').label).toBe('1ª II');
  });

  it('começa sem categoria definida em uma patente provisória segura', () => {
    expect(initialRankForCategory('unknown').label).toBe('6ª III');
  });

  it('usa a faixa de MMR correspondente à patente inicial', () => {
    expect(ratingMidpointForRank(initialRankForCategory('5ª'))).toBe(1500);
    expect(ratingMidpointForRank(initialRankForCategory('4ª'))).toBe(1800);
  });

  it('rejeita categorias que não podem ser escolhidas no cadastro', () => {
    expect(normalizeInitialCategory('Challenger')).toBeNull();
    expect(normalizeInitialCategory('categoria-inválida')).toBeNull();
  });

  it('deriva a categoria de exibição a partir da patente atual', () => {
    expect(categoryFromTier('4ª I')).toBe('4ª');
    expect(categoryFromTier('Elite')).toBe('Elite');
    expect(categoryFromTier('Challenger')).toBe('Challenger');
  });
});
