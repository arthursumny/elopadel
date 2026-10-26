import { NextResponse } from 'next/server';
import { currentClubId } from '@/lib/auth';
import { resolveClubAttendance } from '@/lib/db/competition';
import { db } from '@/lib/db';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const clubId = await currentClubId();
  if (!clubId) return NextResponse.json({ error: 'Faça login como clube.' }, { status: 401 });
  if (!db) return NextResponse.json({ error: 'O banco de dados precisa estar configurado.' }, { status: 503 });
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const decision = body.decision === 'confirm-no-show' || body.decision === 'all-present' || body.decision === 'excuse' ? body.decision : null;
  const absentUserIds = Array.isArray(body.absentUserIds) ? body.absentUserIds.filter((value: unknown): value is string => typeof value === 'string') : [];
  if (!decision) return NextResponse.json({ error: 'Decisão de comparecimento inválida.' }, { status: 400 });
  const result = await resolveClubAttendance(id, clubId, decision, absentUserIds);
  if (!result) return NextResponse.json({ error: 'A partida não está disponível para decisão ou os jogadores selecionados são inválidos.' }, { status: 409 });
  return NextResponse.json({ ok: true, ...result });
}
