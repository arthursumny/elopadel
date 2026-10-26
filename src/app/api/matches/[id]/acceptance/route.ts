import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { decideMatchAcceptance } from '@/lib/db/competition';
import { db } from '@/lib/db';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para confirmar a partida.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados não está configurado.' }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'decline' ? 'decline' : body.decision === 'accept' ? 'accept' : null;
  if (!decision) return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  const result = await decideMatchAcceptance(id, userId, decision);
  if (!result) return NextResponse.json({ error: 'Não foi possível atualizar sua confirmação.' }, { status: 409 });
  return NextResponse.json({ ok: true, ...result, message: result.declined ? 'Partida cancelada.' : result.status === 'confirmed' ? 'Os quatro jogadores confirmaram a partida.' : 'Sua confirmação foi registrada. Aguardando os demais jogadores.' });
}
