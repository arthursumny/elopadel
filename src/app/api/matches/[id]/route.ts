import { NextResponse } from 'next/server';
import { loadMatchDetails } from '@/lib/db/queries';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const match = await loadMatchDetails(id);
  if (!match) return NextResponse.json({ error: 'Partida não encontrada.' }, { status: 404 });
  return NextResponse.json({ match });
}
