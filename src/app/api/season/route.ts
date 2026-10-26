import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { loadSeason } from '@/lib/db/queries';

export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  }

  try {
    const season = await loadSeason();
    return NextResponse.json({
      ok: true,
      ...season,
      season,
    }, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar a temporada.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
