import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { normalizeCourtSide } from '@/lib/domain/matchmaking';
import { decideDirectChallenge, type DirectChallengeDecision } from '@/lib/db/challenges';
import { loadPendingMatchChallenges } from '@/lib/db/queries';

const errorMessages: Record<string, string> = {
  'database-not-configured': 'O banco de dados não está configurado.',
  'invalid-time': 'Escolha um novo horário futuro.',
  'not-found': 'Este desafio não foi encontrado.',
  'not-allowed': 'Você não pode responder a este desafio.',
  'already-decided': 'Este desafio já foi encerrado ou convertido em partida.',
  incompatible: 'O ranking dos jogadores deixou de ser compatível para uma partida ranqueada.',
  suspended: 'Um dos jogadores está suspenso para partidas ranqueadas.',
  'side-incompatible': 'Escolham lados diferentes dentro de cada dupla: uma pessoa na esquerda e outra na direita ou tanto faz.',
  'invalid-players': 'Um dos jogadores não está mais ativo.',
};

function statusFor(error: string) {
  if (error === 'database-not-configured') return 503;
  if (error === 'not-found') return 404;
  if (error === 'not-allowed') return 403;
  return 409;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para responder ao desafio.' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const rawDecision = body.decision;
  if (rawDecision !== 'accept' && rawDecision !== 'decline' && rawDecision !== 'suggest' && rawDecision !== 'cancel') return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  const decision: DirectChallengeDecision = rawDecision;
  const suggestedStartsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : undefined;
  const result = await decideDirectChallenge(id, userId, decision, suggestedStartsAt, normalizeCourtSide(body.sidePreference));
  if (!result) return NextResponse.json({ error: 'Não foi possível responder ao desafio.' }, { status: 409 });
  if ('error' in result) {
    const code = result.error ?? 'unknown';
    return NextResponse.json({ error: errorMessages[code] ?? 'Não foi possível responder ao desafio.' }, { status: statusFor(code) });
  }
  return NextResponse.json({ ok: true, status: result.status, acceptedCount: result.acceptedCount, matchId: 'matchId' in result ? result.matchId : undefined, challenges: await loadPendingMatchChallenges(userId), message: result.status === 'matched' ? 'Desafio aceito. A partida está confirmada; os quatro devem confirmar presença no dia.' : result.status === 'suggested' ? 'Novo horário enviado. Os demais jogadores precisam aceitar novamente.' : result.status === 'accepted' ? `Seu aceite foi registrado (${result.acceptedCount}/4).` : result.status === 'declined' ? 'Desafio recusado.' : 'Desafio cancelado.' });
}
