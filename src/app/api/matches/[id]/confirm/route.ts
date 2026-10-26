import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { confirmMatchResult } from '@/lib/db/competition';
import { db } from '@/lib/db';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = body.status === 'disputed' ? 'disputed' : 'confirmed';
  const winner = body.winner === 'A' || body.winner === 'B' ? body.winner : undefined;
  if (status === 'confirmed' && !winner) return NextResponse.json({ error: 'Informe qual dupla venceu.' }, { status: 400 });
  if (!db) return NextResponse.json({ ok: true, status });
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para confirmar o resultado.' }, { status: 401 });
  const result = await confirmMatchResult(id, userId, status, winner);
  if (!result) return NextResponse.json({ error: 'Você não participa desta partida.' }, { status: 403 });
  return NextResponse.json({ ok: true, ...result });
}
