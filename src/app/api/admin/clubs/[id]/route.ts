import { and, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { currentAdminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { clubAccounts, clubs } from '@/lib/db/schema';
import { hashPassword } from '@/lib/security/password';

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await currentAdminSession()) return NextResponse.json({ error: 'Faça login como administrador para editar clubes.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado.' }, { status: 503 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim().toUpperCase() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name || !city || !state || !country || !email) {
    return NextResponse.json({ error: 'Nome, cidade, estado, país e e-mail são obrigatórios.' }, { status: 400 });
  }
  if (password && password.length < 8) return NextResponse.json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' }, { status: 400 });

  const [currentClub] = await db.select().from(clubs).where(eq(clubs.id, id)).limit(1);
  if (!currentClub) return NextResponse.json({ error: 'Clube não encontrado.' }, { status: 404 });
  const [currentAccount] = await db.select({ id: clubAccounts.id }).from(clubAccounts).where(eq(clubAccounts.clubId, id)).limit(1);
  if (!currentAccount && !password) return NextResponse.json({ error: 'Informe uma senha para criar o acesso deste clube.' }, { status: 400 });

  const [emailOwner] = await db.select({ id: clubAccounts.id }).from(clubAccounts).where(and(eq(clubAccounts.email, email), ne(clubAccounts.clubId, id))).limit(1);
  if (emailOwner) return NextResponse.json({ error: 'Este e-mail já está em uso por outro clube.' }, { status: 409 });

  const [locationOwner] = await db.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.name, name), eq(clubs.city, city), eq(clubs.state, state), eq(clubs.country, country), ne(clubs.id, id))).limit(1);
  if (locationOwner) return NextResponse.json({ error: 'Já existe outro clube com este nome e localização.' }, { status: 409 });

  const passwordHash = password ? await hashPassword(password) : null;
  await db.transaction(async (tx) => {
    await tx.update(clubs).set({ name, city, region: optionalText(body.region), state, country, address: optionalText(body.address), gripoUrl: optionalText(body.gripoUrl), isActive: typeof body.isActive === 'boolean' ? body.isActive : currentClub.isActive, updatedAt: new Date() }).where(eq(clubs.id, id));
    if (currentAccount) {
      await tx.update(clubAccounts).set(passwordHash ? { email, passwordHash, updatedAt: new Date() } : { email, updatedAt: new Date() }).where(eq(clubAccounts.id, currentAccount.id));
    } else {
      await tx.insert(clubAccounts).values({ clubId: id, email, passwordHash: passwordHash! });
    }
  });

  const [club] = await db.select({ id: clubs.id, name: clubs.name, city: clubs.city, region: clubs.region, state: clubs.state, country: clubs.country, address: clubs.address, gripoUrl: clubs.gripoUrl, isActive: clubs.isActive, email: clubAccounts.email }).from(clubs).leftJoin(clubAccounts, eq(clubAccounts.clubId, clubs.id)).where(eq(clubs.id, id)).limit(1);
  return NextResponse.json({ ok: true, club });
}
