import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { currentAdminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { clubAccounts, clubs } from '@/lib/db/schema';
import { hashPassword } from '@/lib/security/password';

export async function POST(request: Request) {
  if (!await currentAdminSession()) return NextResponse.json({ error: 'Faça login como administrador para cadastrar um clube.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!body.name || !body.city || !body.state || !body.country || !email || password.length < 8) return NextResponse.json({ error: 'Nome, localização, e-mail e senha de pelo menos 8 caracteres são obrigatórios.' }, { status: 400 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado para cadastrar clubes.' }, { status: 503 });
  const [existingAccount] = await db.select({ id: clubAccounts.id }).from(clubAccounts).where(eq(clubAccounts.email, email)).limit(1);
  if (existingAccount) return NextResponse.json({ error: 'Este e-mail já está em uso por outro clube.' }, { status: 409 });
  const passwordHash = await hashPassword(password);
  const [club] = await db.insert(clubs).values({ name: body.name, city: body.city, region: body.region, state: body.state, country: body.country, address: body.address, gripoUrl: body.gripoUrl ?? process.env.GRIPO_DEFAULT_URL }).onConflictDoNothing().returning();
  if (!club) return NextResponse.json({ error: 'Este clube já está cadastrado.' }, { status: 409 });
  await db.insert(clubAccounts).values({ clubId: club.id, email, passwordHash });
  return NextResponse.json({ ok: true, club, account: { email } }, { status: 201 });
}
