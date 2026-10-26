import { eq } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { authRateLimits } from '@/lib/db/schema';

/**
 * Fixed-window rate limiting for credential endpoints.
 *
 * Limits are enforced per action + identifier (normalized email or a hashed IP /
 * token, prepared by the caller). With PostgreSQL configured the counters live in `auth_rate_limits`
 * and are shared across processes/restarts. Without a database (unit tests and
 * local runtime fallback) counters are kept in-process only, which means they are
 * per-instance and reset on restart. That limitation is intentional and documented.
 */

export const RATE_LIMITS = {
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  verifyEmail: { limit: 20, windowMs: 60 * 60 * 1000 },
  forgotPassword: { limit: 5, windowMs: 60 * 60 * 1000 },
  resetPassword: { limit: 10, windowMs: 60 * 60 * 1000 },
  handleAvailability: { limit: 60, windowMs: 60 * 1000 },
  locationResolve: { limit: 20, windowMs: 15 * 60 * 1000 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

type MemoryEntry = { count: number; windowStartedAt: number; blockedUntil: number | null };

const memoryStore = new Map<string, MemoryEntry>();

export function clearRateLimits(): void {
  memoryStore.clear();
}

export function rateLimitKey(action: RateLimitAction, identifier: string): string {
  return `${action}:${identifier}`;
}

export function rateLimitKeyForEmail(action: RateLimitAction, email: string): string {
  return rateLimitKey(action, email.trim().toLowerCase());
}

/** Hash an IP before using it in rate-limit keys so raw addresses aren't persisted. */
export function hashRateLimitIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}

function consumeMemory(key: string, limit: number, windowMs: number, now: number): boolean {
  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { count: 0, windowStartedAt: now, blockedUntil: null };
    memoryStore.set(key, entry);
  }

  if (entry.windowStartedAt + windowMs <= now) {
    entry.count = 0;
    entry.windowStartedAt = now;
    entry.blockedUntil = null;
  }

  // Every attempt is counted, including requests made while blocked.
  entry.count += 1;

  if (entry.blockedUntil && entry.blockedUntil > now) {
    return false;
  }

  if (entry.count > limit) {
    entry.blockedUntil = now + windowMs;
    return false;
  }

  return true;
}

/**
 * Returns true when the request is allowed, false when the caller is over the limit.
 * Throws on unexpected database failures so routes can fail closed instead of
 * silently disabling protection.
 *
 * The database path always inserts (0 count) first, then locks the row with
 * SELECT ... FOR UPDATE in the same transaction. This removes the insert/select
 * race where concurrent attempts could all pass before a counter existed.
 */
export async function consumeRateLimit(
  action: RateLimitAction,
  identifier: string,
  now: number = Date.now()
): Promise<boolean> {
  const { limit, windowMs } = RATE_LIMITS[action];
  const key = rateLimitKey(action, identifier);

  if (!db) {
    return consumeMemory(key, limit, windowMs, now);
  }

  return db.transaction(async (tx) => {
    await tx.insert(authRateLimits).values({
      key,
      count: 0,
      windowStartedAt: new Date(now),
      blockedUntil: null,
    }).onConflictDoNothing();

    const [row] = await tx
      .select()
      .from(authRateLimits)
      .where(eq(authRateLimits.key, key))
      .for('update')
      .limit(1);

    if (!row) {
      return false;
    }

    const windowStart = row.windowStartedAt.getTime();
    const blockedUntil = row.blockedUntil ? row.blockedUntil.getTime() : null;
    const windowExpired = windowStart + windowMs <= now;

    const previousCount = windowExpired ? 0 : row.count;
    const nextCount = previousCount + 1;
    const nextWindowStart = windowExpired ? new Date(now) : row.windowStartedAt;
    const stillBlocked = !windowExpired && blockedUntil !== null && blockedUntil > now;
    const shouldBlock = stillBlocked || nextCount > limit;

    await tx.update(authRateLimits).set({
      count: nextCount,
      windowStartedAt: nextWindowStart,
      blockedUntil: shouldBlock
        ? (stillBlocked ? row.blockedUntil : new Date(now + windowMs))
        : null,
      updatedAt: new Date(now),
    }).where(eq(authRateLimits.key, key));

    return !shouldBlock;
  });
}
