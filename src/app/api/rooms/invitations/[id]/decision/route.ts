import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Os convites agora acontecem dentro do saguão de matchmaking.' }, { status: 410 });
}
