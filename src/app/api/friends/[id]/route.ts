import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { removeFriend } from '@/lib/db/friends';

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para remover um amigo.' }, { status: 401 });
  const result = await removeFriend(id, userId);
  if ('error' in result) return NextResponse.json({ error: result.error === 'database-not-configured' ? 'O banco de dados não está configurado.' : 'Amizade não encontrada.' }, { status: result.error === 'database-not-configured' ? 503 : 404 });
  return NextResponse.json({ ok: true });
}
