import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { markPlayerPresent } from '@/lib/db/competition';
import { db } from '@/lib/db';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para confirmar sua presença.' }, { status: 401 });
  if (!db) return NextResponse.json({ ok: true, status: 'claimed-present' });
  const { id } = await context.params;
  const result = await markPlayerPresent(id, userId);
  if (!result) return NextResponse.json({ error: 'Não foi possível registrar sua presença nesta partida.' }, { status: 409 });
  return NextResponse.json({ ok: true, ...result });
}
