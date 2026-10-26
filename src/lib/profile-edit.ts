import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clubMemberships, clubs, users } from '@/lib/db/schema';

export type ProfileEditStatus = 'none' | 'pending' | 'approved';
export type ProfileEditSnapshot = {
  city: string;
  state: string;
  country: string;
  clubId: string | null;
  clubStatus: ProfileEditStatus;
  currentClub: { id: string; name: string } | null;
};
export type ProfileEditInput = { city: string; state: string; country: string; clubId: string | null };

export class ProfileEditError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_LOCATION' | 'INVALID_CLUB') { super(code); }
}

export async function loadProfileEdit(userId: string): Promise<ProfileEditSnapshot> {
  if (!db) throw new Error('DATABASE_UNAVAILABLE');
  const [user] = await db.select({ city: users.city, state: users.state, country: users.country }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new ProfileEditError('NOT_FOUND');
  const [pending] = await db.select({ clubId: clubMemberships.clubId }).from(clubMemberships).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'pending'))).orderBy(desc(clubMemberships.createdAt)).limit(1);
  const [primary] = await db.select({ id: clubs.id, name: clubs.name }).from(clubMemberships).innerJoin(clubs, and(eq(clubs.id, clubMemberships.clubId), eq(clubs.isActive, true))).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'approved'), eq(clubMemberships.isPrimary, true))).limit(1);
  return { ...user, clubId: pending?.clubId ?? primary?.id ?? null, clubStatus: pending ? 'pending' : primary ? 'approved' : 'none', currentClub: primary ?? null };
}

export async function saveProfileEdit(userId: string, input: ProfileEditInput): Promise<ProfileEditSnapshot> {
  if (!db) throw new Error('DATABASE_UNAVAILABLE');
  const city = input.city.trim();
  const state = input.state.trim();
  const country = input.country.trim();
  if (!city || !state || !country) throw new ProfileEditError('INVALID_LOCATION');

  await db.transaction(async (tx) => {
    await tx.execute(sql`select id from users where id = ${userId} for update`);
    const [user] = await tx.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user || user.role !== 'player' || !user.isActive) throw new ProfileEditError('NOT_FOUND');
    const locationClubs = await tx.select({ id: clubs.id }).from(clubs).where(and(eq(clubs.isActive, true), eq(clubs.city, city), eq(clubs.state, state), eq(clubs.country, country))).for('share');
    if (!locationClubs.length) throw new ProfileEditError('INVALID_LOCATION');
    if (input.clubId !== null && !locationClubs.some((club) => club.id === input.clubId)) throw new ProfileEditError('INVALID_CLUB');
    await tx.update(users).set({ city, state, country, updatedAt: new Date() }).where(eq(users.id, userId));

    if (input.clubId === null) {
      await tx.delete(clubMemberships).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'pending')));
      await tx.update(clubMemberships).set({ isPrimary: false, updatedAt: new Date() }).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.isPrimary, true)));
      return;
    }

    const [selected] = await tx.select().from(clubMemberships).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.clubId, input.clubId))).limit(1);
    if (selected?.status === 'approved') {
      await tx.update(clubMemberships).set({ isPrimary: false, updatedAt: new Date() }).where(eq(clubMemberships.userId, userId));
      await tx.update(clubMemberships).set({ isPrimary: true, updatedAt: new Date() }).where(eq(clubMemberships.id, selected.id));
      await tx.delete(clubMemberships).where(and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'pending')));
      return;
    }

    await tx.delete(clubMemberships).where(selected
      ? and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'pending'), ne(clubMemberships.id, selected.id))
      : and(eq(clubMemberships.userId, userId), eq(clubMemberships.status, 'pending')));
    if (selected) {
      if (selected.status === 'pending') return;
      await tx.update(clubMemberships).set({ status: 'pending', isPrimary: false, updatedAt: new Date() }).where(eq(clubMemberships.id, selected.id));
    } else {
      await tx.insert(clubMemberships).values({ userId, clubId: input.clubId, status: 'pending', isPrimary: false });
    }
  });
  return loadProfileEdit(userId);
}
