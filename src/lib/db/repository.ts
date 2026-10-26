import { eq } from 'drizzle-orm';
import { isValidPublicHandle, normalizePublicHandle } from '@/lib/handles';
import { initialRankForCategory, ratingMidpointForRank, type InitialCategory } from '@/lib/ranks';
import { db } from './index';
import { clubMemberships, rankStates, ratings, users } from './schema';

import { getPlayerByHandle, getPlayerByPhone } from '@/lib/runtime-store';
import { runtimeUsersByPhone } from '@/app/api/auth/social/service';

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '');
}

export async function findPlayerByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!db) {
    const runtime = getPlayerByPhone(normalized);
    if (runtime) {
      return {
        id: runtime.id,
        displayName: runtime.displayName,
        handle: runtime.handle,
        phone: runtime.phone,
        city: runtime.city,
        state: runtime.state,
        country: runtime.country,
        isActive: true,
      };
    }
    const runtimeUser = runtimeUsersByPhone.get(normalized);
    if (runtimeUser) {
      return runtimeUser;
    }
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.phone, normalized)).limit(1);
  return user ?? null;
}

export async function findPlayerByHandle(handle: string) {
  const normalizedHandle = normalizePublicHandle(handle);
  if (!isValidPublicHandle(normalizedHandle)) return null;
  if (!db) {
    const runtime = getPlayerByHandle(normalizedHandle);
    if (runtime) {
      return {
        id: runtime.id,
        displayName: runtime.displayName,
        handle: runtime.handle,
        city: runtime.city,
        state: runtime.state,
        country: runtime.country,
        isActive: true,
      };
    }
    return null;
  }

  const [user] = await db.select().from(users).where(eq(users.handle, normalizedHandle)).limit(1);
  return user ?? null;
}


export async function persistPlayer(input: { phone: string; displayName: string; handle: string; city: string; state: string; category: InitialCategory; country?: string; clubId?: string }) {
  if (!db) return null;
  try {
    const phone = normalizePhone(input.phone);
    const handle = normalizePublicHandle(input.handle);
    if (!isValidPublicHandle(handle)) return null;
    const initialRank = initialRankForCategory(input.category);
    const [existing] = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    if (!existing) {
      const [handleOwner] = await db.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
      if (handleOwner) return null;
    }
    const [user] = existing
      ? await db.update(users).set({ displayName: input.displayName, city: input.city, state: input.state, country: input.country ?? 'Brasil', updatedAt: new Date() }).where(eq(users.id, existing.id)).returning()
      : await db.insert(users).values({ phone, displayName: input.displayName, handle, city: input.city, state: input.state, country: input.country ?? 'Brasil' }).returning();

    const [rating] = await db.select({ id: ratings.id }).from(ratings).where(eq(ratings.userId, user.id)).limit(1);
    if (!rating) await db.insert(ratings).values({ userId: user.id, rating: ratingMidpointForRank(initialRank), deviation: 350, provisionalMatches: 0 });
    const [rank] = await db.select({ id: rankStates.id }).from(rankStates).where(eq(rankStates.userId, user.id)).limit(1);
    if (!rank) await db.insert(rankStates).values({ userId: user.id, tier: initialRank.label, points: 50, peakTier: initialRank.label });
    if (input.clubId) await db.insert(clubMemberships).values({ userId: user.id, clubId: input.clubId, status: 'pending', isPrimary: false }).onConflictDoNothing();
    return user;
  } catch (error) {
    console.error('Não foi possível persistir o jogador no PostgreSQL.', error);
    return null;
  }
}
