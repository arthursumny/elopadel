import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { sendFriendRequest } from '@/lib/db/friends';
import { db } from '@/lib/db';
import { loadFriends, loadPendingFriendRequests } from '@/lib/db/queries';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para ver seus amigos.' }, { status: 401 });
  const [friends, requests] = await Promise.all([loadFriends(userId), loadPendingFriendRequests(userId)]);
  return NextResponse.json({ friends, requests }, { headers: { 'cache-control': 'no-store' } });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para adicionar um amigo.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados não está configurado.' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const targetId = typeof body.userId === 'string' ? body.userId : typeof body.id === 'string' ? body.id : undefined;
  const handle = typeof body.handle === 'string' ? body.handle : undefined;
  const result = await sendFriendRequest(userId, { targetId, handle });
  if ('error' in result) {
    const status = result.error === 'player-not-found' ? 404 : result.error === 'database-not-configured' ? 503 : 409;
    const messages = {
      'player-not-found': 'Jogador não encontrado.',
      'database-not-configured': 'O banco de dados não está configurado.',
      self: 'Você não pode adicionar a si mesmo.',
      'already-friends': 'Esse jogador já está nos seus amigos.',
      'already-pending': 'A solicitação já está aguardando resposta.',
      'request-not-found': 'Solicitação não encontrada.',
    } as const;
    return NextResponse.json({ error: messages[result.error as keyof typeof messages] ?? 'Não foi possível enviar a solicitação.' }, { status });
  }
  return NextResponse.json({ ok: true, status: result.status, message: result.status === 'accepted' ? 'Vocês agora são amigos.' : 'Solicitação de amizade enviada.' }, { status: result.status === 'accepted' ? 200 : 201 });
}
