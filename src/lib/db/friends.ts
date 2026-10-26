import { and, eq, ilike, or } from 'drizzle-orm';
import { db } from './index';
import { notifyUsers } from './notifications';
import { friendships, users } from './schema';

export type FriendRequestError = 'database-not-configured' | 'self' | 'player-not-found' | 'already-friends' | 'already-pending' | 'request-not-found';

function normalizeHandle(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}

async function findTarget(targetId?: string, handle?: string) {
  if (!db) return null;
  if (targetId) {
    const [player] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, targetId), eq(users.role, 'player'), eq(users.isActive, true))).limit(1);
    return player ?? null;
  }
  if (!handle?.trim()) return null;
  const [player] = await db.select({ id: users.id }).from(users).where(and(ilike(users.handle, normalizeHandle(handle)), eq(users.role, 'player'), eq(users.isActive, true))).limit(1);
  return player ?? null;
}

export async function sendFriendRequest(requesterId: string, input: { targetId?: string; handle?: string }) {
  if (!db) return { error: 'database-not-configured' as const };
  const target = await findTarget(input.targetId, input.handle);
  if (!target) return { error: 'player-not-found' as const };
  if (target.id === requesterId) return { error: 'self' as const };
  const [requester] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, requesterId)).limit(1);

  const [existing] = await db.select().from(friendships).where(or(and(eq(friendships.requesterId, requesterId), eq(friendships.addresseeId, target.id)), and(eq(friendships.requesterId, target.id), eq(friendships.addresseeId, requesterId)))).limit(1);
  if (!existing) {
    await db.insert(friendships).values({ requesterId, addresseeId: target.id, status: 'pending' });
    await notifyUsers([target.id], { type: 'friend-request', title: 'Nova solicitação de amizade', body: `${requester?.displayName ?? 'Um jogador'} quer adicionar você à rede competitiva.`, href: '/friends' });
    return { status: 'pending' as const };
  }
  if (existing.status === 'accepted') return { error: 'already-friends' as const };
  if (existing.status === 'pending') {
    if (existing.requesterId === requesterId) return { error: 'already-pending' as const };
    await db.update(friendships).set({ status: 'accepted', updatedAt: new Date() }).where(eq(friendships.id, existing.id));
    return { status: 'accepted' as const };
  }

  await db.update(friendships).set({ requesterId, addresseeId: target.id, status: 'pending', updatedAt: new Date() }).where(eq(friendships.id, existing.id));
  return { status: 'pending' as const };
}

export async function decideFriendRequest(requestId: string, userId: string, decision: 'accept' | 'decline') {
  if (!db) return { error: 'database-not-configured' as const };
  const [request] = await db.select().from(friendships).where(and(eq(friendships.id, requestId), eq(friendships.addresseeId, userId), eq(friendships.status, 'pending'))).limit(1);
  if (!request) return { error: 'request-not-found' as const };
  await db.update(friendships).set({ status: decision === 'accept' ? 'accepted' : 'declined', updatedAt: new Date() }).where(eq(friendships.id, request.id));
  await notifyUsers([request.requesterId], { type: 'friend-request-response', title: decision === 'accept' ? 'Solicitação aceita' : 'Solicitação recusada', body: decision === 'accept' ? 'Vocês agora estão conectados para montar duplas.' : 'Sua solicitação de amizade foi recusada.', href: '/friends' });
  return { status: decision === 'accept' ? 'accepted' as const : 'declined' as const, playerId: request.requesterId };
}

export async function removeFriend(friendshipId: string, userId: string) {
  if (!db) return { error: 'database-not-configured' as const };
  const [friendship] = await db.select({ id: friendships.id }).from(friendships).where(and(eq(friendships.id, friendshipId), eq(friendships.status, 'accepted'), or(eq(friendships.requesterId, userId), eq(friendships.addresseeId, userId)))).limit(1);
  if (!friendship) return { error: 'request-not-found' as const };
  await db.delete(friendships).where(eq(friendships.id, friendshipId));
  return { ok: true as const };
}
