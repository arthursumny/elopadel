import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { devicePushTokens } from '@/lib/db/schema';

export type PushPlatform = 'ios' | 'android' | 'web';

export type UpsertPushTokenInput = {
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceType?: string | null;
  appVersion?: string | null;
};

export type DevicePushTokenRecord = {
  id: string;
  userId: string;
  token: string;
  platform: PushPlatform;
  deviceType?: string | null;
  appVersion?: string | null;
  isEnabled: boolean;
  lastSeenAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

// In-memory fallback map for unit tests and environments where PostgreSQL is not running
export const runtimeDevicePushTokens = new Map<string, DevicePushTokenRecord>();

export function clearRuntimePushTokens(): void {
  runtimeDevicePushTokens.clear();
}

export function getRuntimePushTokens(): Map<string, DevicePushTokenRecord> {
  return runtimeDevicePushTokens;
}

export async function upsertDevicePushToken(input: UpsertPushTokenInput): Promise<DevicePushTokenRecord> {
  const now = new Date();

  if (db) {
    const updateSet: Record<string, unknown> = {
      userId: input.userId,
      platform: input.platform,
      isEnabled: true,
      lastSeenAt: now,
      updatedAt: now,
    };
    if (input.deviceType !== undefined) updateSet.deviceType = input.deviceType;
    if (input.appVersion !== undefined) updateSet.appVersion = input.appVersion;

    const [row] = await db
      .insert(devicePushTokens)
      .values({
        userId: input.userId,
        token: input.token,
        platform: input.platform,
        deviceType: input.deviceType ?? null,
        appVersion: input.appVersion ?? null,
        isEnabled: true,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: devicePushTokens.token,
        set: updateSet,
      })
      .returning();

    return {
      id: row.id,
      userId: row.userId,
      token: row.token,
      platform: row.platform as PushPlatform,
      deviceType: row.deviceType,
      appVersion: row.appVersion,
      isEnabled: row.isEnabled,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  // Fallback in-memory implementation
  const existing = runtimeDevicePushTokens.get(input.token);
  const record: DevicePushTokenRecord = {
    id: existing?.id ?? `dpt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    userId: input.userId,
    token: input.token,
    platform: input.platform,
    deviceType: input.deviceType !== undefined ? input.deviceType : existing?.deviceType ?? null,
    appVersion: input.appVersion !== undefined ? input.appVersion : existing?.appVersion ?? null,
    isEnabled: true,
    lastSeenAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  runtimeDevicePushTokens.set(input.token, record);
  return record;
}

export async function deactivateDevicePushToken(
  userIdOrInput: string | { userId: string; token: string },
  tokenArg?: string
): Promise<boolean> {
  const userId = typeof userIdOrInput === 'string' ? userIdOrInput : userIdOrInput.userId;
  const token = typeof userIdOrInput === 'string' ? (tokenArg ?? '') : userIdOrInput.token;

  if (!userId || !token) return false;

  if (db) {
    const rows = await db
      .update(devicePushTokens)
      .set({ isEnabled: false, updatedAt: new Date() })
      .where(and(eq(devicePushTokens.token, token), eq(devicePushTokens.userId, userId)))
      .returning({ id: devicePushTokens.id });
    return rows.length > 0;
  }

  const existing = runtimeDevicePushTokens.get(token);
  if (existing && existing.userId === userId) {
    existing.isEnabled = false;
    existing.updatedAt = new Date();
    return true;
  }
  return false;
}

export async function getActivePushTokens(userIds: string[]): Promise<DevicePushTokenRecord[]> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return [];

  if (db) {
    const rows = await db
      .select()
      .from(devicePushTokens)
      .where(and(inArray(devicePushTokens.userId, uniqueUserIds), eq(devicePushTokens.isEnabled, true)));

    return rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      token: row.token,
      platform: row.platform as PushPlatform,
      deviceType: row.deviceType,
      appVersion: row.appVersion,
      isEnabled: row.isEnabled,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  const userSet = new Set(uniqueUserIds);
  const results: DevicePushTokenRecord[] = [];
  for (const record of runtimeDevicePushTokens.values()) {
    if (userSet.has(record.userId) && record.isEnabled) {
      results.push({ ...record });
    }
  }
  return results;
}

export async function getActivePushTokensForUsers(
  userIds: string[]
): Promise<Array<{ userId: string; token: string; platform: PushPlatform }>> {
  const records = await getActivePushTokens(userIds);
  return records.map((r) => ({
    userId: r.userId,
    token: r.token,
    platform: r.platform,
  }));
}

export async function deleteDevicePushTokens(tokens: string[]): Promise<number> {
  const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
  if (uniqueTokens.length === 0) return 0;

  let count = 0;
  if (db) {
    try {
      const deleted = await db
        .delete(devicePushTokens)
        .where(inArray(devicePushTokens.token, uniqueTokens))
        .returning({ id: devicePushTokens.id });
      count += deleted.length;
    } catch (err) {
      console.error('Erro ao deletar push tokens no banco:', err);
    }
  }

  for (const t of uniqueTokens) {
    if (runtimeDevicePushTokens.delete(t)) {
      count++;
    }
  }
  return count;
}

export const reapDeadPushTokens = deleteDevicePushTokens;
