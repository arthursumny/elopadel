import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { loadHistory } from '@/lib/db/queries';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    const history = await loadHistory();
    return NextResponse.json({
      ok: true,
      items: history.items,
      total: history.total,
      wins: history.wins,
      mmrDelta: history.mmrDelta,
      history,
    }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar o histórico.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
