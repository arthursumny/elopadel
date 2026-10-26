import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loadOpenRooms } from '@/lib/db/queries';
import { listRooms } from '@/lib/runtime-store';

export async function GET() {
  return NextResponse.json({ rooms: db ? await loadOpenRooms() : listRooms() });
}

export async function POST() {
  return NextResponse.json({ error: 'O fluxo de salas manuais foi substituído pelo saguão de matchmaking.' }, { status: 410 });
}
