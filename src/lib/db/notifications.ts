import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { AppNotification } from '@/lib/types';
import { db } from './index';
import { matchParticipants, notifications } from './schema';
import { dispatchPushNotifications } from '@/lib/notifications/push';

export type NotificationInput = {
  type: string;
  title: string;
  body: string;
  href?: string;
  dedupeKey?: string;
};

export async function notifyUsers(userIds: string[], input: NotificationInput) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return;

  if (db) {
    try {
      await db.insert(notifications).values(uniqueUserIds.map((userId) => ({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        href: input.href ?? null,
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${userId}` : null,
      }))).onConflictDoNothing();
    } catch (error) {
      console.error('Não foi possível persistir as notificações.', error);
    }
  }

  try {
    await dispatchPushNotifications(uniqueUserIds, input);
  } catch (pushError) {
    console.error('Falha ao despachar notificações push.', pushError);
  }
}

export async function notifyMatchParticipants(matchId: string, input: NotificationInput, excludeUserId?: string) {
  if (!db) return;
  const participants = await db.select({ userId: matchParticipants.userId }).from(matchParticipants).where(eq(matchParticipants.matchId, matchId));
  await notifyUsers(participants.map((participant) => participant.userId).filter((userId) => userId !== excludeUserId), input);
}

export async function loadNotifications(userId: string): Promise<{ notifications: AppNotification[]; unreadCount: number }> {
  if (!db) return { notifications: [], unreadCount: 0 };
  const [rows, [unread]] = await Promise.all([
    db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(30),
    db.select({ count: sql<number>`count(*)` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
  ]);
  return {
    notifications: rows.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      href: notification.href,
      readAt: notification.readAt?.toISOString() ?? null,
      createdAt: notification.createdAt.toISOString(),
    })),
    unreadCount: Number(unread?.count ?? 0),
  };
}

export async function markNotificationsRead(userId: string, notificationId?: string) {
  if (!db) return 0;
  const filters = [eq(notifications.userId, userId), isNull(notifications.readAt)];
  if (notificationId) filters.push(eq(notifications.id, notificationId));
  const updated = await db.update(notifications).set({ readAt: new Date(), updatedAt: new Date() }).where(and(...filters)).returning({ id: notifications.id });
  return updated.length;
}
