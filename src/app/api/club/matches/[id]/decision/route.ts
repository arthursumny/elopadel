import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { currentClubId } from '@/lib/auth';
import { db } from '@/lib/db';
import { matchParticipants, matchRooms, matches } from '@/lib/db/schema';

type ClubDecision = 'keep' | 'retry' | 'cancel';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const clubId = await currentClubId();
  if (!clubId) return NextResponse.json({ error: 'Faça login como clube.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado.' }, { status: 503 });

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision as ClubDecision;
  if (!['keep', 'retry', 'cancel'].includes(decision)) return NextResponse.json({ error: 'Decisão inválida.' }, { status: 400 });

  const [match] = await db.select({ id: matches.id, status: matches.status, winner: matches.winner }).from(matches).innerJoin(matchRooms, eq(matchRooms.id, matches.roomId)).where(and(eq(matches.id, id), eq(matchRooms.clubId, clubId))).limit(1);
  if (!match) return NextResponse.json({ error: 'Partida não encontrada neste clube.' }, { status: 404 });
  if (match.status !== 'disputed') return NextResponse.json({ error: 'Esta partida não está aguardando decisão.' }, { status: 409 });

  if (decision === 'cancel') {
    await db.update(matches).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(matches.id, id));
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  if (decision === 'keep') {
    if (match.winner !== 'A' && match.winner !== 'B') return NextResponse.json({ error: 'A partida não possui um vencedor para reconfirmar.' }, { status: 409 });
  }
  await db.update(matchParticipants).set({ confirmation: 'pending', resultWinner: null, updatedAt: new Date() }).where(eq(matchParticipants.matchId, id));
  if (decision === 'keep') {
    await db.update(matches).set({ status: 'result-pending', updatedAt: new Date() }).where(eq(matches.id, id));
    return NextResponse.json({ ok: true, status: 'result-pending' });
  }

  await db.update(matches).set({ status: 'confirming', winner: null, sets: null, resultSubmittedBy: null, validatedAt: null, updatedAt: new Date() }).where(eq(matches.id, id));
  return NextResponse.json({ ok: true, status: 'confirming' });
}
