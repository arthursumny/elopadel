import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { setClubSessionCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { clubAccounts, clubs } from '@/lib/db/schema';
import { verifyPassword } from '@/lib/security/password';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return NextResponse.json({ error: 'Informe e-mail e senha.' }, { status: 400 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado.' }, { status: 503 });
  const [account] = await db.select({ account: clubAccounts, club: clubs }).from(clubAccounts).innerJoin(clubs, eq(clubs.id, clubAccounts.clubId)).where(eq(clubAccounts.email, email)).limit(1);
  if (!account || !account.account.isActive || !account.club.isActive || !(await verifyPassword(password, account.account.passwordHash))) return NextResponse.json({ error: 'E-mail ou senha inválidos.' }, { status: 401 });
  await setClubSessionCookie(account.club.id);
  return NextResponse.json({ ok: true, club: { id: account.club.id, name: account.club.name } });
}
