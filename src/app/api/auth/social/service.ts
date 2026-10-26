import { and, eq, ne } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getAuthSecret } from '@/lib/auth';
import { db } from '@/lib/db';
import { isHandleUniqueViolation } from '@/lib/db/handle-unique-violation';
import { clubMemberships, oauthAccounts, ratings, rankStates, users } from '@/lib/db/schema';
import { isValidPublicHandle, normalizePublicHandle } from '@/lib/handles';
import { initialRankForCategory, normalizeInitialCategory, ratingMidpointForRank } from '@/lib/ranks';
import { createPlayer, getPlayer, getPlayerByHandle } from '@/lib/runtime-store';

export type VerifiedSocialProfile = {
  provider: 'google';
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  avatarUrl?: string;
};

// Remote JWKS instance created once at module level for in-memory key caching & rotation
const GOOGLE_JWKS_URL = new URL(process.env.GOOGLE_JWKS_URI || 'https://www.googleapis.com/oauth2/v3/certs');
const googleJWKS = createRemoteJWKSet(GOOGLE_JWKS_URL);

export function googleAudiences(): string[] {
  const configured = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_AUDIENCE || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  return configured.split(',').map((value) => value.trim()).filter(Boolean);
}

export function googleAudienceConfigured(): boolean {
  return googleAudiences().length > 0 || process.env.NODE_ENV !== 'production';
}

// In-memory OAuth link cache for fallback/test environments when DB is not configured
const runtimeOAuthStore = new Map<string, { userId: string; provider: 'google'; providerAccountId: string; email?: string }>();
export const runtimeUsersByPhone = new Map<string, { id: string; displayName: string; handle: string; city: string; state: string; country: string; isActive: boolean; email?: string; phone?: string }>();

export function clearRuntimeOAuthStore(): void {
  runtimeOAuthStore.clear();
  runtimeUsersByPhone.clear();
}

function oauthKey(provider: string, sub: string) {
  return `${provider}:${sub}`;
}

export async function verifySocialToken(input: {
  provider: 'google';
  token: string;
  rawFullName?: { firstName?: string; lastName?: string };
}): Promise<VerifiedSocialProfile> {
  const { provider, token, rawFullName } = input;
  if (provider !== 'google') {
    throw new Error('Provedor social inválido. Apenas o Google é suportado.');
  }
  if (!token || typeof token !== 'string' || token.trim() === '') {
    throw new Error('Token social não informado.');
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    throw new Error('Token social inválido: formato JWT malformado.');
  }

  // 1. Mock / Local Secret verification (development and test suites only).
  // Production never accepts internally signed mock tokens, even with ALLOW_MOCK_AUTH.
  const isMockAllowed = process.env.NODE_ENV !== 'production';
  if (isMockAllowed) {
    try {
      const { payload } = await jwtVerify(token, getAuthSecret(), {
        algorithms: ['HS256'],
      });
      const sub = (payload.sub ?? payload.user_id ?? payload.id) as string;
      if (!sub) {
        throw new Error('Token social inválido: ausência do identificador de usuário (sub).');
      }

      const emailVerified =
        payload.email_verified === true ||
        payload.email_verified === 'true' ||
        payload.emailVerified === true ||
        payload.emailVerified === 'true';

      let name: string | undefined;
      if (typeof payload.name === 'string') {
        name = payload.name;
      } else if (rawFullName) {
        const p = [rawFullName.firstName, rawFullName.lastName].filter(Boolean);
        if (p.length > 0) name = p.join(' ');
      }

      return {
        provider,
        sub: String(sub),
        email: typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : undefined,
        emailVerified,
        name,
        avatarUrl:
          typeof payload.picture === 'string'
            ? payload.picture
            : typeof payload.avatarUrl === 'string'
            ? payload.avatarUrl
            : undefined,
      };
    } catch (mockError) {
      if (mockError instanceof Error && mockError.message.includes('ausência do identificador')) {
        throw mockError;
      }
      // Not signed with internal secret, proceed to Google JWKS verification
    }
  }

  // 2. Cryptographic Google JWKS verification.
  const audiences = googleAudiences();
  if (audiences.length === 0 && process.env.NODE_ENV === 'production') {
    throw new Error('GOOGLE_AUDIENCE_NOT_CONFIGURED');
  }

  try {
    const { payload } = await jwtVerify(token, googleJWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: audiences.length > 0 ? audiences : undefined,
    });

    const sub = payload.sub;
    if (!sub) {
      throw new Error('Token social inválido: ausência do identificador de usuário (sub).');
    }

    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    return {
      provider: 'google',
      sub: String(sub),
      email: typeof payload.email === 'string' ? payload.email.toLowerCase().trim() : undefined,
      emailVerified,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  } catch (jwksError) {
    if (jwksError instanceof Error && jwksError.message.includes('Token social')) {
      throw jwksError;
    }
    throw new Error('Falha ao validar token social: assinatura criptográfica do Google inválida ou expirada.');
  }
}


export async function findUserByOAuth(provider: 'google', sub: string) {
  if (db) {
    const [account] = await db
      .select()
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, sub)))
      .limit(1);

    if (account) {
      const [user] = await db.select().from(users).where(eq(users.id, account.userId)).limit(1);
      if (user) {
        const [rank] = await db.select().from(rankStates).where(eq(rankStates.userId, user.id)).limit(1);
        const [rating] = await db.select().from(ratings).where(eq(ratings.userId, user.id)).limit(1);
        return {
          id: user.id,
          displayName: user.displayName,
          handle: user.handle,
          email: user.email,
          city: user.city,
          state: user.state,
          country: user.country,
          isActive: user.isActive,
          tier: rank?.tier ?? '5ª II',
          rating: rating?.rating ?? 1500,
          provisional: (rating?.provisionalMatches ?? 0) < 5,
        };
      }
    }
    return null;
  }

  // Fallback in-memory
  const entry = runtimeOAuthStore.get(oauthKey(provider, sub));
  if (entry) {
    const player = getPlayer(entry.userId);
    if (player) {
      return {
        id: player.id,
        displayName: player.displayName,
        handle: player.handle,
        email: entry.email,
        city: player.city,
        state: player.state,
        country: player.country,
        isActive: true,
        tier: player.rank.tier.label,
        rating: player.rating.rating,
        provisional: player.rating.provisional,
      };
    }
    const runtimeUser = Array.from(runtimeUsersByPhone.values()).find(u => u.id === entry.userId);
    if (runtimeUser) {
      return {
        id: runtimeUser.id,
        displayName: runtimeUser.displayName,
        handle: runtimeUser.handle,
        email: entry.email ?? runtimeUser.email,
        city: runtimeUser.city,
        state: runtimeUser.state,
        country: runtimeUser.country,
        isActive: runtimeUser.isActive,
        tier: '5ª II',
        rating: 1500,
        provisional: true,
      };
    }
  }
  return null;
}

export async function findUserByEmail(email: string) {
  if (!email) return null;
  const normalized = email.toLowerCase().trim();

  if (db) {
    const [user] = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
    if (user) {
      const [rank] = await db.select().from(rankStates).where(eq(rankStates.userId, user.id)).limit(1);
      const [rating] = await db.select().from(ratings).where(eq(ratings.userId, user.id)).limit(1);
      return {
        id: user.id,
        displayName: user.displayName,
        handle: user.handle,
        email: user.email,
        city: user.city,
        state: user.state,
        country: user.country,
        isActive: user.isActive,
        tier: rank?.tier ?? '5ª II',
        rating: rating?.rating ?? 1500,
        provisional: (rating?.provisionalMatches ?? 0) < 5,
      };
    }
    return null;
  }

  // Fallback in-memory
  for (const user of runtimeUsersByPhone.values()) {
    if (user.email && user.email.toLowerCase().trim() === normalized) {
      const player = getPlayer(user.id);
      return {
        id: user.id,
        displayName: user.displayName,
        handle: user.handle,
        email: user.email,
        city: user.city,
        state: user.state,
        country: user.country,
        isActive: user.isActive,
        tier: player?.rank.tier.label ?? '5ª II',
        rating: player?.rating.rating ?? 1500,
        provisional: player?.rating.provisional ?? true,
      };
    }
  }

  return null;
}

export async function linkOAuthAccount(input: {
  userId: string;
  provider: 'google';
  providerAccountId: string;
  email?: string;
}) {
  const { userId, provider, providerAccountId, email } = input;
  const normalizedEmail = email?.toLowerCase().trim();

  if (db) {

    // 1. Check if this OAuth account is already bound to another player
    const [existingAccount] = await db
      .select({ id: oauthAccounts.id, userId: oauthAccounts.userId })
      .from(oauthAccounts)
      .where(and(eq(oauthAccounts.provider, provider), eq(oauthAccounts.providerAccountId, providerAccountId)))
      .limit(1);

    if (existingAccount) {
      if (existingAccount.userId !== userId) {
        throw new Error('ACCOUNT_ALREADY_LINKED');
      }
      // Idempotent re-link for same user
      if (normalizedEmail) {
        await db
          .update(oauthAccounts)
          .set({ email: normalizedEmail, updatedAt: new Date() })
          .where(eq(oauthAccounts.id, existingAccount.id));
      }
    } else {
      // 2. Check if user already has this provider linked with a different providerAccountId
      const [userExistingProvider] = await db
        .select({ id: oauthAccounts.id, providerAccountId: oauthAccounts.providerAccountId })
        .from(oauthAccounts)
        .where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)))
        .limit(1);

      if (userExistingProvider && userExistingProvider.providerAccountId !== providerAccountId) {
        throw new Error('PROVIDER_ALREADY_LINKED');
      }

      // 3. Pre-check email collision before linking
      if (normalizedEmail) {
        const [existingEmailOwner] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, normalizedEmail), ne(users.id, userId)))
          .limit(1);

        if (existingEmailOwner) {
          throw new Error('EMAIL_ALREADY_IN_USE');
        }
      }

      await db.insert(oauthAccounts).values({
        userId,
        provider,
        providerAccountId,
        email: normalizedEmail,
      });
    }

    // 4. Update user email if currently null
    if (normalizedEmail) {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      if (user && !user.email) {
        const [existingEmailOwner] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.email, normalizedEmail), ne(users.id, userId)))
          .limit(1);

        if (existingEmailOwner) {
          throw new Error('EMAIL_ALREADY_IN_USE');
        }

        await db.update(users).set({ email: normalizedEmail, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    }
  } else {
    // Fallback in-memory store
    const key = oauthKey(provider, providerAccountId);
    const existingEntry = runtimeOAuthStore.get(key);
    if (existingEntry && existingEntry.userId !== userId) {
      throw new Error('ACCOUNT_ALREADY_LINKED');
    }

    for (const entry of runtimeOAuthStore.values()) {
      if (entry.userId === userId && entry.provider === provider && entry.providerAccountId !== providerAccountId) {
        throw new Error('PROVIDER_ALREADY_LINKED');
      }
    }

    if (normalizedEmail) {
      for (const user of runtimeUsersByPhone.values()) {
        if (user.id !== userId && user.email === normalizedEmail) {
          throw new Error('EMAIL_ALREADY_IN_USE');
        }
      }
    }

    runtimeOAuthStore.set(key, {
      userId,
      provider,
      providerAccountId,
      email: normalizedEmail,
    });

    const runtimeUser = Array.from(runtimeUsersByPhone.values()).find(u => u.id === userId);
    if (runtimeUser && normalizedEmail && !runtimeUser.email) {
      runtimeUser.email = normalizedEmail;
    }
  }
}

export async function createSocialProfile(input: {
  provider: 'google';
  providerAccountId: string;
  email?: string;
  name: string;
  handle: string;
  city: string;
  state: string;
  category: string;
  country?: string;
  avatarUrl?: string;
  clubId?: string;
}) {
  const normalizedHandle = normalizePublicHandle(input.handle);
  if (!isValidPublicHandle(normalizedHandle)) {
    throw new Error('INVALID_HANDLE');
  }

  const category = normalizeInitialCategory(input.category) ?? 'unknown';
  const initialRank = initialRankForCategory(category);
  const midpointRating = ratingMidpointForRank(initialRank);
  const normalizedEmail = input.email?.toLowerCase().trim();

  if (db) {
    try {
      return await db.transaction(async (tx) => {
        // 1. Check if OAuth account is already registered
        const [existingOAuth] = await tx
          .select({ id: oauthAccounts.id })
          .from(oauthAccounts)
          .where(and(eq(oauthAccounts.provider, input.provider), eq(oauthAccounts.providerAccountId, input.providerAccountId)))
          .limit(1);

        if (existingOAuth) {
          throw new Error('ALREADY_REGISTERED');
        }

        // 2. Check handle uniqueness
        const [existingHandle] = await tx.select({ id: users.id }).from(users).where(eq(users.handle, normalizedHandle)).limit(1);
        if (existingHandle) {
          throw new Error('HANDLE_TAKEN');
        }

        // 3. Check email uniqueness
        if (normalizedEmail) {
          const [existingEmail] = await tx.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
          if (existingEmail) {
            throw new Error('EMAIL_TAKEN');
          }
        }

        // 4. Atomic inserts
        const [newUser] = await tx.insert(users).values({
          displayName: input.name,
          handle: normalizedHandle,
          email: normalizedEmail,
          avatarUrl: input.avatarUrl,
          city: input.city,
          state: input.state,
          country: input.country ?? 'Brasil',
        }).returning();

        await tx.insert(oauthAccounts).values({
          userId: newUser.id,
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          email: normalizedEmail,
        });

        await tx.insert(ratings).values({
          userId: newUser.id,
          rating: midpointRating,
          deviation: 350,
          provisionalMatches: 0,
        });

        await tx.insert(rankStates).values({
          userId: newUser.id,
          tier: initialRank.label,
          points: 50,
          peakTier: initialRank.label,
        });

        if (input.clubId) {
          await tx.insert(clubMemberships).values({
            userId: newUser.id,
            clubId: input.clubId,
            status: 'pending',
            isPrimary: false,
          }).onConflictDoNothing();
        }

        return {
          id: newUser.id,
          displayName: newUser.displayName,
          handle: newUser.handle,
          email: newUser.email,
          city: newUser.city,
          state: newUser.state,
          country: newUser.country,
          tier: initialRank.label,
          rating: midpointRating,
          provisional: true,
        };
      });
    } catch (error) {
      if (isHandleUniqueViolation(error)) throw new Error('HANDLE_TAKEN');
      throw error;
    }
  }

  // Fallback in-memory
  if (runtimeOAuthStore.has(oauthKey(input.provider, input.providerAccountId))) {
    throw new Error('ALREADY_REGISTERED');
  }

  const existingPlayerByHandle = getPlayerByHandle(normalizedHandle);
  if (existingPlayerByHandle) {
    throw new Error('HANDLE_TAKEN');
  }

  if (normalizedEmail) {
    for (const u of runtimeUsersByPhone.values()) {
      if (u.email === normalizedEmail) {
        throw new Error('EMAIL_TAKEN');
      }
    }
  }

  const player = createPlayer({
    phone: '',
    displayName: input.name,
    handle: normalizedHandle,
    city: input.city,
    state: input.state,
    category,
  });

  runtimeOAuthStore.set(oauthKey(input.provider, input.providerAccountId), {
    userId: player.id,
    provider: input.provider,
    providerAccountId: input.providerAccountId,
    email: normalizedEmail,
  });

  runtimeUsersByPhone.set(player.id, {
    id: player.id,
    displayName: player.displayName,
    handle: player.handle,
    city: player.city,
    state: player.state,
    country: player.country,
    isActive: true,
    email: normalizedEmail,
    phone: '',
  });

  return {
    id: player.id,
    displayName: player.displayName,
    handle: player.handle,
    email: normalizedEmail,
    city: player.city,
    state: player.state,
    country: player.country,
    tier: player.rank.tier.label,
    rating: player.rating.rating,
    provisional: player.rating.provisional,
  };
}
