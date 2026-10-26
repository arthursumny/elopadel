import { NextResponse } from 'next/server';
import { setAdminSessionCookie } from '@/lib/auth';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const key = typeof body.key === 'string' ? body.key : '';
  if (!process.env.ADMIN_KEY || key !== process.env.ADMIN_KEY) return NextResponse.json({ error: 'Chave administrativa inválida.' }, { status: 401 });
  await setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
