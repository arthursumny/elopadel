import { NextResponse } from 'next/server';
import { currentUserId } from '@/lib/auth';
import { loadMatchDetails } from '@/lib/db/queries';
import {
  confirmGripoBooking,
  findMatchingGripoSlot,
  resolveGripoClubId,
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

  const clubId = resolveGripoClubId(match.gripoUrl || match.club);
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

  // Determine booking date and time
  const matchDate = new Date(match.startsAt);
  const dateStr =
    body.date ||
    matchDate.toISOString().split('T')[0];

  let courtId = body.courtId;
  let startHour = body.startHour;
  let endHour = body.endHour;

  // If specific slot not passed, find first matching/available slot
  if (!courtId || !startHour || !endHour) {
    const hours = matchDate.getHours().toString().padStart(2, '0');
    const minutes = matchDate.getMinutes().toString().padStart(2, '0');
    const targetHour = `${hours}:${minutes}:00`;

    const slot = await findMatchingGripoSlot(clubId, dateStr, targetHour);
    if (!slot) {
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
    return NextResponse.json(
      {
        error: bookingResult.error,
        manualUrl: match.gripoUrl,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    message: bookingResult.message,
    scheduleId: bookingResult.scheduleId,
    courtName: bookingResult.courtName,
    courtId,
    date: dateStr,
    startHour,
    endHour,
  });
}
