import { NextResponse } from 'next/server';
import { fetchGripoAvailability, resolveGripoClubId } from '@/lib/integrations/gripo';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const clubParam = url.searchParams.get('clubId') || url.searchParams.get('club');
    const dateParam = url.searchParams.get('date');

    const clubId = clubParam
      ? parseInt(clubParam, 10) || resolveGripoClubId(clubParam)
      : 31; // Default to Padel Joaçaba (31)

    if (!clubId) {
      return NextResponse.json(
        { error: 'Clube do Gripo inválido ou não especificado.' },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split('T')[0];
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : today;

    const availability = await fetchGripoAvailability(clubId, date);
    return NextResponse.json({ ok: true, ...availability });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao consultar Gripo';
    console.error('[API /api/gripo/availability]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
