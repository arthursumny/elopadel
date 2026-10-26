import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { playerSessionVersions } from '@/lib/db/schema';

/**
 * Per-player session versioning.
 *
 * Player JWTs carry the numeric `sv` claim. On password reset the persisted
 * version is atomically incremented, invalidating every previously issued
 * player JWT (web cookie or mobile bearer token) without affecting club/admin
 * sessions, which never use this claim.
 *
 * The runtime map is only a test/local fallback when DATABASE_URL is absent.
 * In production a missing database fails closed instead of trusting memory.
 */

export const SESSION_VERSION_CLAIM = 'sv';

const runtimeVersions = new Map<string, number>();

export function clearRuntimeSessionVersions(): void {
  runtimeVersions.clear();
}

export type SessionVersionTx = Parameters<
  Parameters<NonNullable<typeof db>['transaction']>[0]
>[0];

function assertRuntimeFallbackAllowed(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_VERSION_STORE_UNAVAILABLE');
  }
}

export async function getPlayerSessionVersion(userId: string): Promise<number> {
  if (!db) {
    assertRuntimeFallbackAllowed();
    return runtimeVersions.get(userId) ?? 0;
  }

  const [row] = await db
    .select({ version: playerSessionVersions.version })
    .from(playerSessionVersions)
    .where(eq(playerSessionVersions.userId, userId))
    .limit(1);

  return row?.version ?? 0;
}

async function bumpInTransaction(tx: SessionVersionTx, userId: string): Promise<number> {
  const [row] = await tx
    .insert(playerSessionVersions)
    .values({ userId, version: 1 })
    .onConflictDoUpdate({
      target: playerSessionVersions.userId,
      set: {
        version: sql`${playerSessionVersions.version} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ version: playerSessionVersions.version });

  return row.version;
}

/** Atomic increment; safe to call inside an existing transaction. */
export async function incrementPlayerSessionVersionWithTx(
  tx: SessionVersionTx,
  userId: string
): Promise<number> {
  return bumpInTransaction(tx, userId);
}

/** Standalone atomic increment for callers that do not already own a transaction. */
export async function incrementPlayerSessionVersion(userId: string): Promise<number> {
  if (!db) {
    assertRuntimeFallbackAllowed();
    const next = (runtimeVersions.get(userId) ?? 0) + 1;
    runtimeVersions.set(userId, next);
    return next;
  }

  return db.transaction(async (tx) => bumpInTransaction(tx, userId));
}

/**
 * Returns false for stale/missing player versions. Missing `sv` is accepted as
 * version 0 only outside production so existing local fixtures keep working;
 * production rejects pre-versioning JWTs by design.
 */
export async function isPlayerSessionVersionValid(
  userId: string,
  tokenVersion: unknown
): Promise<boolean> {
  let version: number;

  if (typeof tokenVersion === 'number' && Number.isInteger(tokenVersion) && tokenVersion >= 0) {
    version = tokenVersion;
  } else if (process.env.NODE_ENV === 'production') {
    return false;
  } else {
    version = 0;
  }

  const current = await getPlayerSessionVersion(userId);
  return current === version;
}
