import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { currentUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { matches, matchRooms } from '@/lib/db/schema';
import { loadMatchDetails } from '@/lib/db/queries';
import {
  calculateSlotDuration,
  createBrasiliaDate,
  formatBrasiliaDateParts,
} from '@/lib/booking/auto-book';
import {
  confirmGripoBooking,
  findMatchingGripoSlot,
  resolveGripoClubIdFromRecord,
} from '@/lib/integrations/gripo';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json(
      { error: 'Faça login para reservar a quadra da partida.' },
      { status: 401 }
    );
  }

  const { id } = await context.params;
  const match = await loadMatchDetails(id);
  if (!match) {
    return NextResponse.json({ error: 'Partida não encontrada.' }, { status: 404 });
  }

  // Ensure current user is in match
  const isParticipant = match.participants.some((p) => p.userId === userId);
  if (!isParticipant) {
    return NextResponse.json(
      { error: 'Você não é um participante desta partida.' },
      { status: 403 }
    );
  }

  // Recusar (409) se bookingStatus já for 'booked'
  if (match.bookingStatus === 'booked') {
    return NextResponse.json(
      {
        error: 'A quadra para esta partida já está reservada.',
        bookingStatus: 'booked',
        bookedCourtName: match.bookedCourtName,
        bookingMessage: match.bookingMessage,
        bookedAt: match.bookedAt,
      },
      { status: 409 }
    );
  }

  const clubId = resolveGripoClubIdFromRecord({
    gripoClubId: match.gripoClubId,
    gripoUrl: match.gripoUrl || match.club,
  });

  if (!clubId) {
    return NextResponse.json(
      {
        error:
          'O clube desta partida não possui integração automática configurada no Gripo. Utilize a reserva manual.',
        manualUrl: match.gripoUrl,
      },
      { status: 422 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    courtId?: number;
    date?: string;
    startHour?: string;
    endHour?: string;
    notes?: string;
  };

  // Determine booking date and time in Brasília timezone
  const matchDate = new Date(match.startsAt);
  const { date: defaultDateStr, time: defaultTimeStr } = formatBrasiliaDateParts(matchDate);
  const dateStr = body.date || defaultDateStr;

  let courtId = body.courtId;
  let startHour = body.startHour;
  let endHour = body.endHour;
  let detectedCourtName: string | undefined;

  // If specific slot not passed, find first matching/available slot
  if (!courtId || !startHour || !endHour) {
    const targetHour = `${defaultTimeStr}:00`;
    const slot = await findMatchingGripoSlot(clubId, dateStr, targetHour);
    if (!slot) {
      if (db) {
        await db
          .update(matches)
          .set({
            bookingStatus: 'failed',
            bookingMessage:
              'Nenhuma quadra disponível encontrada no Gripo para este horário/data.',
            updatedAt: new Date(),
          })
          .where(eq(matches.id, match.id));
      }

      return NextResponse.json(
        {
          error:
            'Nenhuma quadra disponível encontrada no Gripo para este horário/data.',
          manualUrl: match.gripoUrl,
        },
        { status: 404 }
      );
    }

    courtId = slot.courtId;
    startHour = slot.startHour;
    endHour = slot.endHour;
    detectedCourtName = slot.courtName;
  }

  const bookingResult = await confirmGripoBooking({
    clubId,
    courtId,
    date: dateStr,
    startHour,
    endHour,
    notes: body.notes || `Elo Padel - Partida ${match.id.slice(0, 8)}`,
  });

  if (!bookingResult.success) {
    const errorMessage = bookingResult.error || 'Falha ao confirmar reserva no Gripo.';
    if (db) {
      await db
        .update(matches)
        .set({
          bookingStatus: 'failed',
          bookingMessage: errorMessage,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, match.id));
    }

    return NextResponse.json(
      {
        error: errorMessage,
        manualUrl: match.gripoUrl,
      },
      { status: 400 }
    );
  }

  const bookedCourtName = bookingResult.courtName || detectedCourtName || null;
  const bookingMessage = bookingResult.message || 'Reserva confirmada no Gripo!';
  const bookedAt = new Date();
  const effectiveStartsAt = createBrasiliaDate(dateStr, startHour);
  const effectiveDurationMinutes = calculateSlotDuration(startHour, endHour);

  if (db) {
    await db
      .update(matches)
      .set({
        bookingStatus: 'booked',
        bookedCourtName,
        gripoScheduleId: bookingResult.scheduleId ?? null,
        bookingMessage,
        bookedAt,
        updatedAt: bookedAt,
      })
      .where(eq(matches.id, match.id));

    const [matchRow] = await db
      .select({ roomId: matches.roomId })
      .from(matches)
      .where(eq(matches.id, match.id))
      .limit(1);

    if (matchRow?.roomId) {
      await db
        .update(matchRooms)
        .set({
          startsAt: effectiveStartsAt,
          durationMinutes: effectiveDurationMinutes,
          updatedAt: bookedAt,
        })
        .where(eq(matchRooms.id, matchRow.roomId));
    }
  }

  return NextResponse.json({
    ok: true,
    message: bookingMessage,
    scheduleId: bookingResult.scheduleId,
    courtName: bookedCourtName,
    courtId,
    date: dateStr,
    startHour,
    endHour,
    bookingStatus: 'booked',
    bookedCourtName,
    gripoScheduleId: bookingResult.scheduleId,
    bookingMessage,
    bookedAt: bookedAt.toISOString(),
  });
}
