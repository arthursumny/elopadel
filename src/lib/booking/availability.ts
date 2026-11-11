export type SlotFinder = (params: {
  gripoClubId: number;
  date: string;
  startTime: string;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
}) => Promise<{
  startHour: string;
  endHour: string;
  courtId: number;
  courtName: string;
} | null>;

export async function resolveBookableSlot({
  clubs,
  date,
  windowStart,
  windowEnd,
  durationMinutes,
  findSlot,
}: {
  clubs: Array<{ id: string; gripoClubId: number | null; name: string }>;
  date: string;
  windowStart: string;
  windowEnd: string;
  durationMinutes: number;
  findSlot: SlotFinder;
}): Promise<{
  clubId: string;
  clubName: string;
  gripoClubId: number;
  startHour: string;
  endHour: string;
  courtName: string;
} | null> {
  for (const club of clubs) {
    if (club.gripoClubId === null || club.gripoClubId === undefined) {
      continue;
    }

    try {
      const slot = await findSlot({
        gripoClubId: club.gripoClubId,
        date,
        startTime: windowStart,
        windowStart,
        windowEnd,
        durationMinutes,
      });

      if (slot) {
        return {
          clubId: club.id,
          clubName: club.name,
          gripoClubId: club.gripoClubId,
          startHour: slot.startHour,
          endHour: slot.endHour,
          courtName: slot.courtName,
        };
      }
    } catch (error) {
      console.warn(
        `[resolveBookableSlot] Erro ao consultar clube ${club.name} (${club.gripoClubId}):`,
        error
      );
    }
  }

  return null;
}
