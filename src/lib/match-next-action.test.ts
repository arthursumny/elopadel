import { describe, expect, it } from 'vitest';
import { getMatchNextAction, type MatchNextActionInput } from './match-next-action';

const base: MatchNextActionInput = {
  status: 'confirmed',
  startsAt: '2026-10-20T18:00:00.000Z',
  durationMinutes: 90,
  resultDeadlineAt: '2026-10-20T22:00:00.000Z',
  acceptedCount: 4,
  attendanceCount: 0,
  now: new Date('2026-10-20T17:00:00.000Z'),
  current: { matchAcceptance: 'accepted', attendance: 'pending', confirmation: 'pending' },
};

describe('match next action', () => {
  it('asks for acceptance while confirming', () => {
    const action = getMatchNextAction({ ...base, status: 'confirming', acceptedCount: 2, current: { ...base.current!, matchAcceptance: 'pending' } });
    expect(action.title).toBe('Confirme sua participação');
    expect(action.cta?.targetId).toBe('participacao');
  });

  it('waits after the player accepts during confirming', () => {
    const action = getMatchNextAction({ ...base, status: 'confirming' });
    expect(action.title).toBe('Participação confirmada');
    expect(action.cta).toBeUndefined();
  });

  it('waits before the match start for presence', () => {
    const action = getMatchNextAction(base);
    expect(action.title).toBe('Partida confirmada');
    expect(action.cta).toBeUndefined();
  });

  it('asks for presence at the match start when attendance is pending', () => {
    const action = getMatchNextAction({ ...base, now: new Date('2026-10-20T18:01:00.000Z') });
    expect(action.title).toBe('Confirme sua presença');
    expect(action.cta?.targetId).toBe('presenca');
  });

  it('waits for the other players after this player is present', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T18:01:00.000Z'),
      attendanceCount: 3,
      current: { ...base.current!, attendance: 'claimed-present' },
    });
    expect(action.title).toBe('Presença registrada');
    expect(action.cta).toBeUndefined();
    expect(action.detail).toContain('Aguardando a confirmação das presenças.');
  });

  it('offers the score to a present player once all four arrived and the window is open', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T19:31:00.000Z'),
      attendanceCount: 4,
      current: { ...base.current!, attendance: 'present' },
    });
    expect(action.title).toBe('Informe o placar');
    expect(action.cta?.targetId).toBe('placar');
  });

  it('waits for the end of the match before opening the score', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T19:00:00.000Z'),
      attendanceCount: 4,
    });
    expect(action.title).toBe('Aguardando o fim do jogo');
    expect(action.cta).toBeUndefined();
  });

  it('asks for the score when the result window is open', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T19:31:00.000Z'),
      attendanceCount: 4,
    });
    expect(action.title).toBe('Informe o placar');
    expect(action.cta?.targetId).toBe('placar');
  });

  it('does not offer the score if there is no current participant', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T19:31:00.000Z'),
      attendanceCount: 4,
      current: null,
    });
    expect(action.cta).toBeUndefined();
  });

  it.each(['absent', 'excused'] as const)('does not offer actions for %s attendance', (attendance) => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T19:31:00.000Z'),
      attendanceCount: 4,
      current: { ...base.current!, attendance },
    });
    expect(action.cta).toBeUndefined();
  });

  it('explains a declined match without offering confirmation again', () => {
    const action = getMatchNextAction({
      ...base,
      status: 'confirming',
      current: { ...base.current!, matchAcceptance: 'declined' },
    });
    expect(action.title).toBe('Você recusou esta partida');
    expect(action.cta).toBeUndefined();
  });

  it('does not offer the score after the deadline', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T22:01:00.000Z'),
      attendanceCount: 4,
    });
    expect(action.title).toBe('Prazo do placar encerrado');
    expect(action.cta).toBeUndefined();
  });

  it('keeps the result window open exactly at its deadline', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T22:00:00.000Z'),
      attendanceCount: 4,
    });
    expect(action.title).toBe('Informe o placar');
    expect(action.cta?.targetId).toBe('placar');
  });

  it('opens the result window exactly at the scheduled end', () => {
    const action = getMatchNextAction({
      ...base,
      now: new Date('2026-10-20T19:30:00.000Z'),
      attendanceCount: 4,
    });
    expect(action.title).toBe('Informe o placar');
    expect(action.cta?.targetId).toBe('placar');
  });

  it('asks for a vote while the player vote is pending', () => {
    const action = getMatchNextAction({
      ...base,
      status: 'result-pending',
      now: new Date('2026-10-20T19:31:00.000Z'),
      attendanceCount: 4,
    });
    expect(action.title).toBe('Confirme o vencedor');
    expect(action.cta?.targetId).toBe('votacao');
  });

  it('waits after the player vote is registered', () => {
    const action = getMatchNextAction({
      ...base,
      status: 'result-pending',
      attendanceCount: 4,
      current: { ...base.current!, confirmation: 'confirmed' },
    });
    expect(action.title).toBe('Voto registrado');
    expect(action.cta).toBeUndefined();
  });

  it('closes voting when this player has disputed the result', () => {
    const action = getMatchNextAction({
      ...base,
      status: 'result-pending',
      current: { ...base.current!, confirmation: 'disputed' },
    });
    expect(action.title).toBe('Resultado em análise');
    expect(action.cta).toBeUndefined();
  });

  it('uses mode-neutral copy for validated results', () => {
    expect(getMatchNextAction({ ...base, status: 'validated' }).detail).toBe('O resultado já foi confirmado.');
  });

  it('blocks actions for closed and disputed matches', () => {
    for (const status of ['disputed', 'validated', 'cancelled', 'no-show'] as const) {
      const action = getMatchNextAction({ ...base, status, attendanceCount: 4 });
      expect(action.cta).toBeUndefined();
    }
  });
});
