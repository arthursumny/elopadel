import { and, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { currentClubId } from '@/lib/auth';
import { db } from '@/lib/db';
import { notifyUsers } from '@/lib/db/notifications';
import { clubMemberships } from '@/lib/db/schema';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const clubId = await currentClubId();
  if (!clubId) return NextResponse.json({ error: 'Faça login como clube.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado.' }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = body.decision === 'approved' ? 'approved' : body.decision === 'rejected' ? 'rejected' : null;
  if (!status) return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });
  const [membership] = await db.select({ id: clubMemberships.id, userId: clubMemberships.userId }).from(clubMemberships).where(and(eq(clubMemberships.id, id), eq(clubMemberships.clubId, clubId))).limit(1);
  if (!membership) return NextResponse.json({ error: 'Solicitação não encontrada neste clube.' }, { status: 404 });
  const decided = await db.transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${membership.userId} for update`);
    const [stillExists] = await tx.select({ id: clubMemberships.id }).from(clubMemberships).where(and(eq(clubMemberships.id, id), eq(clubMemberships.userId, membership.userId), eq(clubMemberships.clubId, clubId))).limit(1);
    if (!stillExists) return false;
    if (status === 'approved') await tx.update(clubMemberships).set({ isPrimary: false, updatedAt: new Date() }).where(eq(clubMemberships.userId, membership.userId));
    await tx.update(clubMemberships).set({ status, isPrimary: status === 'approved', updatedAt: new Date() }).where(eq(clubMemberships.id, id));
    return true;
  });
  if (!decided) return NextResponse.json({ error: 'Solicitação não encontrada neste clube.' }, { status: 404 });
  await notifyUsers([membership.userId], { type: 'club-membership', title: status === 'approved' ? 'Vínculo aprovado' : 'Vínculo recusado', body: status === 'approved' ? 'O clube aprovou seu vínculo. Ele já aparece como seu clube principal.' : 'O clube recusou sua solicitação de vínculo.', href: '/profile' });
  return NextResponse.json({ ok: true, status });
}
