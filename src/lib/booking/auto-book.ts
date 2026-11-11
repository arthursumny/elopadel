import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clubs, matches, matchParticipants, matchRooms } from '@/lib/db/schema';
import {
  confirmGripoBooking,
  findBestSlotForMatch,
  findMatchingGripoSlot,
  resolveGripoClubIdFromRecord,
} from '@/lib/integrations/gripo';
import { notifyUsers } from '@/lib/db/notifications';

export interface AutoBookResult {
  bookingStatus: 'booked' | 'skipped' | 'failed';
  bookedCourtName?: string | null;
  gripoScheduleId?: number | null;
  bookingMessage?: string | null;
  bookedAt?: Date | null;
  bookingPriceCents?: number | null;
}

export function formatBrasiliaDateParts(date: Date): {
  date: string;
  time: string;
  hours: string;
  minutes: string;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const hours = getPart('hour');
  const minutes = getPart('minute');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
    hours,
    minutes,
  };
}

export function parseTimeMinutes(timeStr: string): number {
  const [h = '0', m = '0'] = timeStr.trim().split(':');
  return Number(h) * 60 + Number(m);
}

export function calculateSlotDuration(startHour: string, endHour: string): number {
  const startMins = parseTimeMinutes(startHour);
  const endMins = parseTimeMinutes(endHour);
  const diff = endMins - startMins;
  return diff > 0 ? diff : diff + 24 * 60;
}

export function createBrasiliaDate(dateStr: string, timeStr: string): Date {
  const [year = '1970', month = '1', day = '1'] = dateStr.trim().split('-');
  const [hour = '00', minute = '00'] = timeStr.trim().split(':');
  const pad = (v: string | number) => String(v).padStart(2, '0');
  const iso = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00-03:00`;
  return new Date(iso);
}

export async function autoBookMatchCourt(matchId: string): Promise<AutoBookResult | null> {
  try {
    if (!db) {
      console.warn('[autoBookMatchCourt] Banco de dados indisponível.');
      return null;
    }

    const [matchRow] = await db
      .select({
        match: matches,
        room: matchRooms,
        club: clubs,
      })
      .from(matches)
      .leftJoin(matchRooms, eq(matchRooms.id, matches.roomId))
      .leftJoin(clubs, eq(clubs.id, matchRooms.clubId))
      .where(eq(matches.id, matchId))
      .limit(1);

    if (!matchRow || !matchRow.match) {
      console.warn(`[autoBookMatchCourt] Partida ${matchId} não encontrada.`);
      return null;
    }

    const { match, room, club } = matchRow;

    // Idempotência: se já reservado, retorna o estado sem chamar a API
    if (match.bookingStatus === 'booked') {
      return {
        bookingStatus: 'booked',
        bookedCourtName: match.bookedCourtName,
        gripoScheduleId: match.gripoScheduleId,
        bookingMessage: match.bookingMessage,
        bookedAt: match.bookedAt,
        bookingPriceCents: match.bookingPriceCents,
      };
    }

    // Só age se a partida estiver com status 'confirmed' e o horário estiver no futuro
    const now = new Date();
    if (match.status !== 'confirmed') {
      return null;
    }

    if (!room || room.startsAt <= now) {
      return null;
    }

    // Flag process.env.AUTO_BOOK_COURT: se desativada, grava skipped e retorna
    const autoBookFlag = process.env.AUTO_BOOK_COURT?.trim().toLowerCase();
    if (autoBookFlag === '0' || autoBookFlag === 'false') {
      const skipMessage = 'Reserva automática desativada.';
      await db
        .update(matches)
        .set({
          bookingStatus: 'skipped',
          bookingMessage: skipMessage,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId));

      return {
        bookingStatus: 'skipped',
        bookingMessage: skipMessage,
      };
    }

    // Resolve o id numérico do clube no Gripo
    const numericClubId = resolveGripoClubIdFromRecord({
      gripoClubId: club?.gripoClubId,
      gripoUrl: club?.gripoUrl,
    });

    if (!numericClubId) {
      const skipMessage =
        'Clube sem integração de reserva automática. Use o botão de reserva ou reserve pelo Gripo.';
      await db
        .update(matches)
        .set({
          bookingStatus: 'skipped',
          bookingMessage: skipMessage,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId));

      return {
        bookingStatus: 'skipped',
        bookingMessage: skipMessage,
      };
    }

    // Deriva data e hora da sala no fuso de Brasília
    const { date, time } = formatBrasiliaDateParts(room.startsAt);

    // Consulta disponibilidade no Gripo
    const slot = await findBestSlotForMatch({
      clubId: numericClubId,
      date,
      startTime: time,
      durationMinutes: room.durationMinutes ?? 90,
      sport: 'padel',
    });
    if (!slot) {
      const failMessage =
        'Nenhuma quadra de padel com horário livre para a duração da partida no Gripo.';
      await db
        .update(matches)
        .set({
          bookingStatus: 'failed',
          bookingMessage: failMessage,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId));

      return {
        bookingStatus: 'failed',
        bookingMessage: failMessage,
      };
    }

    // Confirma a reserva no Gripo
    const bookingResult = await confirmGripoBooking({
      clubId: numericClubId,
      courtId: slot.courtId,
      date,
      startHour: slot.startHour,
      endHour: slot.endHour,
      notes: 'Elo Padel - partida confirmada',
      sport: 'padel',
      paymentType: 'link',
    });

    if (!bookingResult.success) {
      const failMessage = bookingResult.error || 'Falha ao confirmar reserva no Gripo.';
      await db
        .update(matches)
        .set({
          bookingStatus: 'failed',
          bookingMessage: failMessage,
          updatedAt: new Date(),
        })
        .where(eq(matches.id, matchId));

      return {
        bookingStatus: 'failed',
        bookingMessage: failMessage,
      };
    }

    // Sucesso: atualiza matches, ajusta match_rooms e notifica participantes
    const courtName = bookingResult.courtName || slot.courtName;
    const scheduleId = bookingResult.scheduleId;
    const bookingMessage =
      bookingResult.message || 'Reserva confirmada com sucesso no Gripo!';
    const bookedAt = new Date();
    const effectiveStartsAt = createBrasiliaDate(date, slot.startHour);
    const effectiveDurationMinutes = calculateSlotDuration(slot.startHour, slot.endHour);

    await db
      .update(matches)
      .set({
        bookingStatus: 'booked',
        bookedCourtName: courtName,
        gripoScheduleId: scheduleId ?? null,
        bookingMessage,
        bookingPriceCents: slot.totalPriceCents,
        bookedAt,
        updatedAt: bookedAt,
      })
      .where(eq(matches.id, matchId));

    await db
      .update(matchRooms)
      .set({
        startsAt: effectiveStartsAt,
        durationMinutes: effectiveDurationMinutes,
        updatedAt: bookedAt,
      })
      .where(eq(matchRooms.id, room.id));

    const participants = await db
      .select({ userId: matchParticipants.userId })
      .from(matchParticipants)
      .where(eq(matchParticipants.matchId, matchId));

    const userIds = participants.map((p) => p.userId);
    if (userIds.length > 0) {
      const formattedHour = slot.startHour.slice(0, 5);
      await notifyUsers(userIds, {
        type: 'gripo-booking',
        title: 'Quadra reservada no Gripo',
        body: `${courtName} às ${formattedHour} — ${bookingMessage}`,
        href: `/match/${matchId}`,
        dedupeKey: `gripo-booking:${matchId}`,
      });
    }

    return {
      bookingStatus: 'booked',
      bookedCourtName: courtName,
      gripoScheduleId: scheduleId,
      bookingMessage,
      bookedAt,
      bookingPriceCents: slot.totalPriceCents,
    };
  } catch (error) {
    console.error(`[autoBookMatchCourt] Erro ao reservar quadra da partida ${matchId}:`, error);

    try {
      if (db) {
        await db
          .update(matches)
          .set({
            bookingStatus: 'failed',
            bookingMessage:
              error instanceof Error
                ? error.message
                : 'Erro interno na reserva automática.',
            updatedAt: new Date(),
          })
          .where(eq(matches.id, matchId));
      }
    } catch (saveError) {
      console.error('[autoBookMatchCourt] Falha ao persistir erro de reserva:', saveError);
    }

    return {
      bookingStatus: 'failed',
      bookingMessage:
        error instanceof Error ? error.message : 'Erro interno na reserva automática.',
    };
  }
}
