import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { decideFriendRequest } from '@/lib/db/friends';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para responder à solicitação.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'accept' ? 'accept' : body.decision === 'decline' ? 'decline' : null;
  if (!decision) return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  const result = await decideFriendRequest(id, userId, decision);
  if ('error' in result) return NextResponse.json({ error: result.error === 'database-not-configured' ? 'O banco de dados não está configurado.' : 'Solicitação não encontrada ou já respondida.' }, { status: result.error === 'database-not-configured' ? 503 : 404 });
  return NextResponse.json({ ok: true, status: result.status, playerId: result.playerId });
}
