import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { clubMemberships, clubs } from '@/lib/db/schema';

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: 'Faça login para solicitar vínculo.' }, { status: 401 });
  if (!db) return NextResponse.json({ ok: true, status: 'pending' });
  const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, id)).limit(1);
  if (!club) return NextResponse.json({ error: 'Clube não encontrado.' }, { status: 404 });
  const [existing] = await db.select().from(clubMemberships).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.clubId, id))).limit(1);
  if (existing) return NextResponse.json({ ok: true, status: existing.status });
  await db.insert(clubMemberships).values({ userId, clubId: id, status: 'pending' });
  return NextResponse.json({ ok: true, status: 'pending' }, { status: 201 });
}
