import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getPlayerByHandle } from '@/lib/runtime-store';

/** Checks handle ownership without returning any identifying account information. */
export async function isPublicHandleAvailable(handle: string): Promise<boolean> {
  if (!db) return getPlayerByHandle(handle) === null;

  const [owner] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, handle))
    .limit(1);

  return !owner;
}
