import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { decideMatchSearchInvitation } from '@/lib/db/matchmaking';
import { db } from '@/lib/db';
import { loadActiveMatchSearch } from '@/lib/db/queries';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para responder ao convite.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados não está configurado.' }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'accept' ? 'accept' : body.decision === 'decline' ? 'decline' : null;
  if (!decision) return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  const result = await decideMatchSearchInvitation(id, userId, decision);
  if (!result) return NextResponse.json({ error: 'Este convite não está mais disponível.' }, { status: 409 });
  if ('blocked' in result) return NextResponse.json({ error: 'O ranking dos jogadores mudou e a dupla não é mais compatível para esta busca.' }, { status: 409 });
  return NextResponse.json({ ok: true, matchId: result.matchId, search: result.decision === 'accept' && !result.matchId ? await loadActiveMatchSearch(userId) : null, message: result.matchId ? 'A partida foi encontrada. Confirme que você vai jogar.' : result.decision === 'accept' ? 'Convite aceito. Entre no saguão e confirme que você quer buscar a partida.' : 'Convite recusado.' });
}
