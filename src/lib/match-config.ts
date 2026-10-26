const FALLBACK_MATCH_DURATION_MINUTES = 90;
const FALLBACK_RESULT_WINDOW_MINUTES = 60;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Until the Gripo integration provides the booked court duration, these values
 * are configurable in the environment and are used as the safe local fallback.
 */
export function getMatchDurationMinutes() {
  return positiveInteger(process.env.GRIPO_MATCH_DURATION_MINUTES ?? process.env.MATCH_DURATION_MINUTES, FALLBACK_MATCH_DURATION_MINUTES);
}

export function getResultWindowMinutes() {
  return positiveInteger(process.env.RESULT_SUBMISSION_WINDOW_MINUTES, FALLBACK_RESULT_WINDOW_MINUTES);
}

export function getResultDeadline(startsAt: Date, durationMinutes = getMatchDurationMinutes()) {
  return new Date(startsAt.getTime() + (durationMinutes + getResultWindowMinutes()) * 60 * 1000);
}

export function getMatchEnd(startsAt: Date, durationMinutes = getMatchDurationMinutes()) {
  return new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
}
