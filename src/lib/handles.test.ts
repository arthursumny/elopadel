import { describe, expect, it } from 'vitest';
import { isValidPublicHandle, normalizeHandleInput, normalizePublicHandle } from './handles';

describe('identificador público do jogador', () => {
  it('normaliza acentos, espaços e o símbolo @', () => {
    expect(normalizeHandleInput('@João da Quadra')).toBe('joao_da_quadra');
    expect(normalizePublicHandle(' @MARINA.4 ')).toBe('@marina.4');
  });

  it('exige um identificador curto e legível', () => {
    expect(isValidPublicHandle('@joao_4')).toBe(true);
    expect(isValidPublicHandle('@a')).toBe(false);
    expect(isValidPublicHandle('@ab')).toBe(false);
    expect(isValidPublicHandle('@abc')).toBe(true);
    expect(isValidPublicHandle('@joao-da-quadra')).toBe(false);
    expect(isValidPublicHandle('@.joao')).toBe(false);
    expect(isValidPublicHandle('@joao.')).toBe(false);
  });

  it('bloqueia identificadores reservados do sistema', () => {
    expect(isValidPublicHandle('@admin')).toBe(false);
    expect(isValidPublicHandle('@club')).toBe(false);
    expect(isValidPublicHandle('@root')).toBe(false);
    expect(isValidPublicHandle('@system')).toBe(false);
    expect(isValidPublicHandle('@elopadel')).toBe(false);
    expect(isValidPublicHandle('@support')).toBe(false);
    expect(isValidPublicHandle('@suporte')).toBe(false);
    expect(isValidPublicHandle('@moderator')).toBe(false);
    expect(isValidPublicHandle('@moderador')).toBe(false);
    expect(isValidPublicHandle('@moderacao')).toBe(false);
    expect(isValidPublicHandle('@admin_player')).toBe(true);
  });
});

