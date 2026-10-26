import { NextResponse } from 'next/server';
import { databaseConfigured, databaseReachable } from '@/lib/db';

import { runAutoMigrations } from '@/lib/db/migrate';

export async function GET() {
  const configured = databaseConfigured();
  if (configured) {
    runAutoMigrations().catch((err) => console.error('[Health] Auto-migration error:', err));
  }
  const reachable = configured && await databaseReachable();
  return NextResponse.json(
    {
      ok: true,
      service: 'elo-padel',
      database: !configured ? 'not-configured' : reachable ? 'ready' : 'unreachable',
    },
    {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    }
  );
}
