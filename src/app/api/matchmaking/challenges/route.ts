import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { normalizeCourtSide } from '@/lib/domain/matchmaking';
import { createDirectChallenge } from '@/lib/db/challenges';
import { db } from '@/lib/db';
import { loadPendingMatchChallenges } from '@/lib/db/queries';

const errorMessages: Record<string, string> = {
  'database-not-configured': 'O banco de dados não está configurado.',
  'invalid-players': 'Selecione quatro jogadores diferentes e ativos.',
  'invalid-time': 'Escolha uma data e horário futuros.',
  'club-not-found': 'O clube selecionado não está disponível.',
  duplicate: 'Já existe um desafio pendente para estes quatro jogadores.',
  'repeat-limit': 'Esta dupla já se enfrentou duas vezes nos últimos 14 dias. Faça novas partidas pelo matchmaking automático.',
  incompatible: 'Os jogadores selecionados estão fora da faixa competitiva permitida para uma partida ranqueada.',
  suspended: 'Um dos jogadores está suspenso para partidas ranqueadas.',
};

function statusFor(error: string) {
  if (error === 'database-not-configured') return 503;
  if (error === 'invalid-players' || error === 'invalid-time' || error === 'club-not-found') return 400;
  return 409;
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para consultar seus desafios.' }, { status: 401 });
  return NextResponse.json({ challenges: await loadPendingMatchChallenges(userId) }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para desafiar uma dupla.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: errorMessages['database-not-configured'] }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const startsAt = typeof body.startsAt === 'string' ? new Date(body.startsAt) : new Date(Number.NaN);
  const timezoneOffset = typeof body.timezoneOffset === 'number' && Number.isFinite(body.timezoneOffset) && Math.abs(body.timezoneOffset) <= 840 ? body.timezoneOffset : 180;
  const result = await createDirectChallenge({
    createdById: userId,
    partnerId: typeof body.partnerId === 'string' ? body.partnerId : '',
    targetId: typeof body.targetId === 'string' ? body.targetId : '',
    targetPartnerId: typeof body.targetPartnerId === 'string' ? body.targetPartnerId : '',
    mode: body.mode === 'friendly' ? 'friendly' : 'ranked',
    startsAt,
    city: typeof body.city === 'string' ? body.city : '',
    clubId: typeof body.clubId === 'string' && body.clubId ? body.clubId : undefined,
    timezoneOffset,
    sidePreference: normalizeCourtSide(body.sidePreference),
  });
  if ('error' in result) {
    const code = result.error ?? 'unknown';
    return NextResponse.json({ error: errorMessages[code] ?? 'Não foi possível criar o desafio.' }, { status: statusFor(code) });
  }
  return NextResponse.json({ ok: true, challengeId: result.challengeId, challenges: await loadPendingMatchChallenges(userId), message: 'Desafio enviado. A partida só será criada quando os outros três jogadores aceitarem.' }, { status: 201 });
}
