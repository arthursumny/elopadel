import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { PLAYER_COOKIE_NAME, CLUB_COOKIE_NAME, ADMIN_COOKIE_NAME } from '@/lib/auth';

export async function POST() {
  const store = await cookies();
  store.delete(PLAYER_COOKIE_NAME);
  store.delete(CLUB_COOKIE_NAME);
  store.delete(ADMIN_COOKIE_NAME);

  return NextResponse.json({ ok: true }, {
    headers: { 'cache-control': 'no-store' },
  });
}
