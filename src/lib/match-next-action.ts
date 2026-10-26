import type { MatchStatus } from './types';

export type MatchNextActionTone = 'lime' | 'cyan' | 'amber' | 'coral' | 'neutral';

export type MatchNextAction = {
  title: string;
  detail: string;
  tone: MatchNextActionTone;
  cta?: {
    label: string;
    targetId: string;
  };
};

export type MatchNextActionInput = {
  status: MatchStatus;
  startsAt: string;
  durationMinutes: number;
  resultDeadlineAt: string | null;
  acceptedCount: number;
  attendanceCount: number;
  now: Date;
  current: {
    matchAcceptance: string;
    attendance: string;
    confirmation: string;
  } | null;
};

const waiting = (title: string, detail: string): MatchNextAction => ({ title, detail, tone: 'amber' });
const closed = (title: string, detail: string, tone: MatchNextActionTone = 'neutral'): MatchNextAction => ({ title, detail, tone });

export function getMatchNextAction(input: MatchNextActionInput): MatchNextAction {
  const start = new Date(input.startsAt);
  const end = new Date(start.getTime() + input.durationMinutes * 60 * 1000);
  const deadline = input.resultDeadlineAt ? new Date(input.resultDeadlineAt) : null;
  const resultWindowOpen = input.now >= end;
  const resultWindowExpired = Boolean(deadline && deadline < input.now);
  const current = input.current;

  if (input.status === 'cancelled') {
    return closed('Partida cancelada', 'Não há ação pendente nesta partida.');
  }

  if (input.status === 'no-show') {
    return closed('Falta confirmada', 'A partida foi encerrada sem resultado.', 'coral');
  }

  if (input.status === 'validated') {
    return closed('Partida validada', 'O resultado já foi confirmado.', 'lime');
  }

  if (input.status === 'disputed') {
    return closed('Resultado em análise', 'O clube vai revisar os votos. O MMR segue bloqueado.', 'coral');
  }

  if (input.status === 'confirming') {
    if (!current) return waiting('Aguardando confirmação', 'A partida ainda não está pronta para a sua ação.');
    if (current.matchAcceptance === 'accepted') {
      return waiting('Participação confirmada', `${input.acceptedCount}/4 aceitaram. Aguardando os outros jogadores.`);
    }
    if (current.matchAcceptance === 'declined') {
      return closed('Você recusou esta partida', 'Sua presença não será confirmada nesta partida.');
    }
    return {
      title: 'Confirme sua participação',
      detail: `${input.acceptedCount}/4 aceitaram. Diga se você vai jogar.`,
      tone: 'lime',
      cta: { label: 'Confirmar participação', targetId: 'participacao' },
    };
  }

  if (input.status === 'confirmed') {
    if (current) {
      if (['present', 'claimed-present'].includes(current.attendance) && input.attendanceCount < 4) {
        return waiting('Presença registrada', `${input.attendanceCount}/4 confirmaram presença. Aguardando a confirmação das presenças.`);
      }
      if (current.attendance === 'absent') {
        return closed('Presença não confirmada', 'O clube vai analisar a ausência nesta partida.', 'coral');
      }
      if (current.attendance === 'excused') {
        return closed('Ausência registrada', 'A partida segue sem a sua presença.');
      }
      if (input.now < start) {
        return waiting('Partida confirmada', 'A confirmação de presença será liberada no horário da partida.');
      }
    }

    if (!current) {
      return waiting('Partida confirmada', 'Acompanhe a confirmação de presença dos jogadores.');
    }

    if (input.attendanceCount >= 4) {
      if (!resultWindowOpen) {
        return waiting('Aguardando o fim do jogo', 'O placar será liberado depois do tempo previsto de partida.');
      }
      if (resultWindowExpired) {
        return closed('Prazo do placar encerrado', 'O clube vai analisar a partida sem um resultado dentro do prazo.', 'coral');
      }
      return {
        title: 'Informe o placar',
        detail: 'Os quatro jogadores já confirmaram presença. Registre o resultado.',
        tone: 'lime',
        cta: { label: 'Ir para o placar', targetId: 'placar' },
      };
    }

    return {
      title: 'Confirme sua presença',
      detail: `${input.attendanceCount}/4 confirmaram presença. Diga que você está na quadra.`,
      tone: 'lime',
      cta: { label: 'Confirmar presença', targetId: 'presenca' },
    };
  }

  if (input.status === 'result-pending') {
    if (!current) return waiting('Resultado pendente', 'Aguardando a votação dos jogadores.');
    if (current.confirmation === 'confirmed') {
      return waiting('Voto registrado', 'Aguardando os outros jogadores confirmarem o vencedor.');
    }
    if (current.confirmation === 'disputed') {
      return closed('Resultado em análise', 'O clube vai revisar os votos. O MMR segue bloqueado.', 'coral');
    }
    return {
      title: 'Confirme o vencedor',
      detail: 'O placar foi enviado. Registre qual dupla você confirma como vencedora.',
      tone: 'cyan',
      cta: { label: 'Registrar voto', targetId: 'votacao' },
    };
  }

  return waiting('Partida formada', 'Aguardando a confirmação dos jogadores.');
}
