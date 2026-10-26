import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'O fluxo de salas manuais foi substituído pelo saguão de matchmaking.' }, { status: 410 });
}
