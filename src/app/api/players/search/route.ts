import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { searchPlayers } from '@/lib/db/queries';

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para buscar jogadores.' }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q') ?? '';
  return NextResponse.json({ players: await searchPlayers(userId, query) }, { headers: { 'cache-control': 'no-store' } });
}
