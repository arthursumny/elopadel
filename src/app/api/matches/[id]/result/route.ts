import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { canValidateResult, validateBestOfThree, type Confirmation } from '@/lib/domain/match';
import { db } from '@/lib/db';
import { submitMatchResult } from '@/lib/db/competition';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (!validateBestOfThree(body)) return NextResponse.json({ error: 'Placar inválido para melhor de três.' }, { status: 400 });
  if (db && id !== 'demo') {
    const userId = await currentUserId();
    if (!userId) return NextResponse.json({ error: 'Faça login para informar o resultado.' }, { status: 401 });
    const match = await submitMatchResult(id, userId, body);
    if (!match) return NextResponse.json({ error: 'Partida não encontrada ou já encerrada.' }, { status: 409 });
    return NextResponse.json({ ok: true, matchId: id, status: 'result-pending' });
  }
  const confirmations = (body.confirmations ?? []) as Confirmation[];
  const submittedWinner = body.winner === 'A' || body.winner === 'B' ? body.winner : undefined;
  return NextResponse.json({ ok: true, matchId: id, status: canValidateResult(confirmations, submittedWinner) ? 'validated' : 'result-pending' });
}
