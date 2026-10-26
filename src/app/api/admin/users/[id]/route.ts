import { and, eq, ne } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { currentAdminSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await currentAdminSession()) return NextResponse.json({ error: 'Faça login como administrador para editar jogadores.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado.' }, { status: 503 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const phone = typeof body.phone === 'string' ? normalizePhone(body.phone) : '';
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const state = typeof body.state === 'string' ? body.state.trim().toUpperCase() : '';
  const country = typeof body.country === 'string' ? body.country.trim() : '';

  if (!displayName || !city || !state || !country || phone.length < 8 || phone.length > 15) {
    return NextResponse.json({ error: 'Nome, celular, cidade, estado e país são obrigatórios.' }, { status: 400 });
  }

  const [currentUser] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!currentUser) return NextResponse.json({ error: 'Jogador não encontrado.' }, { status: 404 });

  const [phoneOwner] = await db.select({ id: users.id }).from(users).where(and(eq(users.phone, phone), ne(users.id, id))).limit(1);
  if (phoneOwner) return NextResponse.json({ error: 'Este celular já está vinculado a outro jogador.' }, { status: 409 });

  const isActive = typeof body.isActive === 'boolean' ? body.isActive : currentUser.isActive;
  const [user] = await db.update(users).set({ displayName, phone, city, state, country, isActive, updatedAt: new Date() }).where(eq(users.id, id)).returning();

  return NextResponse.json({
    ok: true,
    user: { id: user.id, displayName: user.displayName, handle: user.handle, phone: user.phone, city: user.city, state: user.state, country: user.country, isActive: user.isActive },
  });
}
