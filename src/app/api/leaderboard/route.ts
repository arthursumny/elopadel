import { NextResponse } from 'next/server';
import { loadLeaderboard } from '@/lib/db/queries';

export async function GET() {
  return NextResponse.json({ entries: await loadLeaderboard(), scope: 'global' });
}
