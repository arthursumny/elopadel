import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { isHandleUniqueViolation } from '@/lib/db/handle-unique-violation';
import { authTokens, clubMemberships, emailCredentials, playerSessionVersions, rankStates, ratings, users } from '@/lib/db/schema';
import { isValidPublicHandle, normalizePublicHandle } from '@/lib/handles';
import { initialRankForCategory, normalizeInitialCategory, ratingMidpointForRank } from '@/lib/ranks';
import { hashPassword, verifyPassword } from '@/lib/security/password';
import {
  generateEmailToken,
  hashEmailToken,
  normalizeEmail,
} from '@/lib/security/email-tokens';
import { createPlayer, getPlayer, getPlayerByHandle } from '@/lib/runtime-store';
import { getPlayerSessionVersion, incrementPlayerSessionVersion, incrementPlayerSessionVersionWithTx } from '@/lib/security/session-version';
import { runtimeUsersByPhone } from '@/app/api/auth/social/service';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

export type EmailUserProfile = {
  id: string;
  displayName: string;
  handle: string;
  email: string | null;
  city: string;
  state: string;
  country: string;
  isActive: boolean;
  tier: string;
  rating: number;
  provisional: boolean;
};

export type RegisterEmailInput = {
  email: string;
  passwordHash: string;
  name: string;
  handle: string;
  city: string;
  state: string;
  category: string;
  country?: string;
  clubId?: string;
};

export type RegisterEmailResult = {
  userId: string;
  created: boolean;
  email: string;
};

export type EmailCredentialStatus = {
  exists: boolean;
  verified: boolean;
  isActive: boolean;
};

export type EmailAuthErrorCode =
  | 'EMAIL_TAKEN'
  | 'HANDLE_TAKEN'
  | 'INVALID_HANDLE'
  | 'INVALID_CATEGORY'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'INACTIVE'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'RESET_NOT_ALLOWED';

export class EmailAuthError extends Error {
  code: EmailAuthErrorCode;

  constructor(code: EmailAuthErrorCode, message: string) {
    super(message);
    this.name = 'EmailAuthError';
    this.code = code;
  }
}

type RuntimeEmailAccount = {
  userId: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: number | null;
  isActive: boolean;
};

type RuntimeAuthToken = {
  id: string;
  userId: string;
  type: 'email_verification' | 'password_reset';
  expiresAt: number;
  consumedAt: number | null;
};

// In-memory fallback used when DATABASE_URL is not configured (unit tests / local runtime).
export const runtimeEmailAccounts = new Map<string, RuntimeEmailAccount>();
export const runtimeAuthTokens = new Map<string, RuntimeAuthToken>();

export function clearEmailAuthRuntime(): void {
  runtimeEmailAccounts.clear();
  runtimeAuthTokens.clear();
}

function runtimeAccountByEmail(email: string): RuntimeEmailAccount | null {
  const normalized = normalizeEmail(email);
  for (const account of runtimeEmailAccounts.values()) {
    if (account.email === normalized) return account;
  }
  return null;
}

function runtimeAccountById(userId: string): RuntimeEmailAccount | null {
  return runtimeEmailAccounts.get(userId) ?? null;
}

async function dbAccountByEmail(email: string) {
  if (!db) return null;
  const [row] = await db
    .select({ user: users, credential: emailCredentials })
    .from(emailCredentials)
    .innerJoin(users, eq(users.id, emailCredentials.userId))
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return row ?? null;
}

export async function getEmailCredentialStatus(userId: string): Promise<EmailCredentialStatus> {
  if (db) {
    const [row] = await db
      .select({ user: users, credential: emailCredentials })
      .from(emailCredentials)
      .innerJoin(users, eq(users.id, emailCredentials.userId))
      .where(eq(emailCredentials.userId, userId))
      .limit(1);
    if (!row) return { exists: false, verified: false, isActive: true };
    return {
      exists: true,
      verified: Boolean(row.credential.emailVerifiedAt),
      isActive: row.user.isActive,
    };
  }

  const account = runtimeAccountById(userId);
  if (!account) return { exists: false, verified: false, isActive: true };
  return { exists: true, verified: account.emailVerifiedAt !== null, isActive: account.isActive };
}

export async function findEmailUserProfileByEmail(email: string): Promise<EmailUserProfile | null> {
  if (db) {
    const row = await dbAccountByEmail(email);
    if (!row) return null;
    return profileFromDb(row.user, null, null);
  }

  const account = runtimeAccountByEmail(email);
  if (!account) return null;
  return profileFromRuntime(account);
}

function profileFromDb(
  user: typeof users.$inferSelect,
  rank: typeof rankStates.$inferSelect | null,
  rating: typeof ratings.$inferSelect | null
): EmailUserProfile {
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

function profileFromRuntime(account: RuntimeEmailAccount): EmailUserProfile {
  const player = getPlayer(account.userId);
  const runtimeUser = player
    ? null
    : Array.from(runtimeUsersByPhone.values()).find((item) => item.id === account.userId);

  return {
    id: account.userId,
    displayName: player?.displayName ?? runtimeUser?.displayName ?? '',
    handle: player?.handle ?? runtimeUser?.handle ?? '',
    email: account.email,
    city: player?.city ?? runtimeUser?.city ?? '',
    state: player?.state ?? runtimeUser?.state ?? '',
    country: player?.country ?? runtimeUser?.country ?? 'Brasil',
    isActive: account.isActive,
    tier: player?.rank.tier.label ?? '5ª II',
    rating: player?.rating.rating ?? 1500,
    provisional: player?.rating.provisional ?? true,
  };
}

/**
 * Creates the player + credential + rating + rank (and optional club membership)
 * in a single transaction. Existing unverified registrations are reported as
 * pending instead of being overwritten, so registration can act as a resend.
 */
export async function registerEmailAccount(input: RegisterEmailInput): Promise<RegisterEmailResult> {
  const email = normalizeEmail(input.email);
  const handle = normalizePublicHandle(input.handle);
  if (!isValidPublicHandle(handle)) {
    throw new EmailAuthError('INVALID_HANDLE', 'Escolha uma arroba de 3 a 20 caracteres: letras, números, ponto ou sublinhado.');
  }

  const category = normalizeInitialCategory(input.category);
  if (!category) {
    throw new EmailAuthError('INVALID_CATEGORY', 'Escolha uma categoria válida.');
  }

  const country = input.country?.trim() || 'Brasil';
  const initialRank = initialRankForCategory(category);
  const midpointRating = ratingMidpointForRank(initialRank);

  if (db) {
    try {
      return await db.transaction(async (tx) => {
        const [existingUser] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
        if (existingUser) {
          const [credential] = await tx
            .select()
            .from(emailCredentials)
            .where(eq(emailCredentials.userId, existingUser.id))
            .limit(1);

          if (credential && !credential.emailVerifiedAt) {
            return { userId: existingUser.id, created: false, email };
          }
          throw new EmailAuthError('EMAIL_TAKEN', 'Este email já está cadastrado. Faça login ou use outro email.');
        }

        const [existingHandle] = await tx.select({ id: users.id }).from(users).where(eq(users.handle, handle)).limit(1);
        if (existingHandle) {
          throw new EmailAuthError('HANDLE_TAKEN', 'Essa arroba já está em uso. Escolha outra.');
        }

        const [newUser] = await tx.insert(users).values({
          displayName: input.name,
          handle,
          email,
          city: input.city,
          state: input.state,
          country,
        }).returning();

        await tx.insert(emailCredentials).values({
          userId: newUser.id,
          passwordHash: input.passwordHash,
          emailVerifiedAt: null,
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

        return { userId: newUser.id, created: true, email };
      });
    } catch (error) {
      if (isHandleUniqueViolation(error)) {
        throw new EmailAuthError('HANDLE_TAKEN', 'Essa arroba já está em uso. Escolha outra.');
      }
      throw error;
    }
  }

  const pending = runtimeAccountByEmail(email);
  if (pending) {
    if (pending.emailVerifiedAt !== null) {
      throw new EmailAuthError('EMAIL_TAKEN', 'Este email já está cadastrado. Faça login ou use outro email.');
    }
    return { userId: pending.userId, created: false, email };
  }

  const legacyUser = Array.from(runtimeUsersByPhone.values()).find(
    (user) => user.email?.toLowerCase().trim() === email
  );
  if (legacyUser) {
    throw new EmailAuthError('EMAIL_TAKEN', 'Este email já está cadastrado. Faça login ou use outro email.');
  }

  if (getPlayerByHandle(handle)) {
    throw new EmailAuthError('HANDLE_TAKEN', 'Essa arroba já está em uso. Escolha outra.');
  }

  const player = createPlayer({
    phone: '',
    displayName: input.name,
    handle,
    city: input.city,
    state: input.state,
    category,
  });

  runtimeEmailAccounts.set(player.id, {
    userId: player.id,
    email,
    passwordHash: input.passwordHash,
    emailVerifiedAt: null,
    isActive: true,
  });

  // Keep the shared runtime directory in sync so Google login can find this email.
  runtimeUsersByPhone.set(player.id, {
    id: player.id,
    displayName: player.displayName,
    handle: player.handle,
    city: player.city,
    state: player.state,
    country: player.country,
    isActive: true,
    email,
  });

  return { userId: player.id, created: true, email };
}

async function invalidateTokens(userId: string, type: RuntimeAuthToken['type']): Promise<void> {
  const now = new Date();
  if (db) {
    await db.update(authTokens)
      .set({ consumedAt: now, updatedAt: now })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.consumedAt)));
    return;
  }
  for (const token of runtimeAuthTokens.values()) {
    if (token.userId === userId && token.type === type && token.consumedAt === null) {
      token.consumedAt = Date.now();
    }
  }
}

async function issueToken(
  userId: string,
  type: RuntimeAuthToken['type'],
  ttlMs: number
): Promise<string> {
  await invalidateTokens(userId, type);
  const rawToken = generateEmailToken();
  const tokenHash = hashEmailToken(rawToken);
  const expiresAt = new Date(Date.now() + ttlMs);

  if (db) {
    await db.insert(authTokens).values({ userId, type, tokenHash, expiresAt });
    return rawToken;
  }

  runtimeAuthTokens.set(tokenHash, {
    id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    type,
    expiresAt: expiresAt.getTime(),
    consumedAt: null,
  });
  return rawToken;
}

export async function issueEmailVerificationToken(userId: string): Promise<string> {
  return issueToken(userId, 'email_verification', EMAIL_VERIFICATION_TTL_MS);
}

export async function issuePasswordResetToken(userId: string): Promise<string> {
  return issueToken(userId, 'password_reset', PASSWORD_RESET_TTL_MS);
}

export async function revokeEmailToken(rawToken: string, type: RuntimeAuthToken['type']): Promise<void> {
  const tokenHash = hashEmailToken(rawToken);
  if (db) {
    await db.update(authTokens)
      .set({ consumedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.type, type), isNull(authTokens.consumedAt)));
    return;
  }
  const token = runtimeAuthTokens.get(tokenHash);
  if (token && token.type === type && token.consumedAt === null) {
    token.consumedAt = Date.now();
  }
}

function assertActive(isActive: boolean) {
  if (!isActive) {
    throw new EmailAuthError('INACTIVE', 'Esta conta está desativada.');
  }
}

/** Verifies an email token without creating a session. */
export async function verifyEmailAddress(rawToken: string, newPasswordHash: string): Promise<void> {
  const tokenHash = hashEmailToken(rawToken);

  if (db) {
    await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.type, 'email_verification')))
        .for('update')
        .limit(1);

      if (!token || token.consumedAt) {
        throw new EmailAuthError('TOKEN_INVALID', 'Link de verificação inválido ou já utilizado.');
      }
      if (token.expiresAt.getTime() <= Date.now()) {
        throw new EmailAuthError('TOKEN_EXPIRED', 'Link de verificação expirado. Solicite um novo cadastro.');
      }

      const [user] = await tx.select().from(users).where(eq(users.id, token.userId)).limit(1);
      if (!user) {
        throw new EmailAuthError('TOKEN_INVALID', 'Link de verificação inválido ou já utilizado.');
      }
      assertActive(user.isActive);

      const now = new Date();
      const consumed = await tx.update(authTokens)
        .set({ consumedAt: now, updatedAt: now })
        .where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt)))
        .returning({ id: authTokens.id });
      if (consumed.length === 0) {
        throw new EmailAuthError('TOKEN_INVALID', 'Link de verificação inválido ou já utilizado.');
      }

      // Whoever proves possession of the email defines the password. This
      // neutralizes pre-registration attempts made with someone else's email.
      const updatedCredential = await tx.update(emailCredentials)
        .set({ emailVerifiedAt: now, passwordHash: newPasswordHash, updatedAt: now })
        .where(eq(emailCredentials.userId, token.userId))
        .returning({ id: emailCredentials.id });
      if (updatedCredential.length === 0) {
        throw new EmailAuthError('TOKEN_INVALID', 'Link de verificação inválido ou já utilizado.');
      }
    });
    return;
  }

  const token = runtimeAuthTokens.get(tokenHash);
  if (!token || token.type !== 'email_verification' || token.consumedAt !== null) {
    throw new EmailAuthError('TOKEN_INVALID', 'Link de verificação inválido ou já utilizado.');
  }
  if (token.expiresAt <= Date.now()) {
    throw new EmailAuthError('TOKEN_EXPIRED', 'Link de verificação expirado. Solicite um novo cadastro.');
  }
  const account = runtimeAccountById(token.userId);
  if (!account) {
    throw new EmailAuthError('TOKEN_INVALID', 'Link de verificação inválido ou já utilizado.');
  }
  assertActive(account.isActive);
  token.consumedAt = Date.now();
  account.emailVerifiedAt = Date.now();
  account.passwordHash = newPasswordHash;
}

export type EmailAuthenticationResult = {
  profile: EmailUserProfile;
  sessionVersion: number;
};

export async function authenticateEmailAccount(email: string, password: string): Promise<EmailAuthenticationResult> {
  const normalized = normalizeEmail(email);

  if (db) {
    // Single-statement snapshot: credential hash and player session version are
    // read together. If a reset commits while scrypt is running, the token is
    // still minted with this (stale) version and is therefore invalid.
    const [row] = await db
      .select({
        user: users,
        credential: emailCredentials,
        sessionVersion: sql<number>`coalesce(${playerSessionVersions.version}, 0)`,
      })
      .from(emailCredentials)
      .innerJoin(users, eq(users.id, emailCredentials.userId))
      .leftJoin(playerSessionVersions, eq(playerSessionVersions.userId, emailCredentials.userId))
      .where(eq(users.email, normalized))
      .limit(1);

    if (!row) {
      // Run the KDF to keep the timing similar to a real credential check.
      await verifyPassword(password, `${'0'.repeat(32)}:${'0'.repeat(128)}`);
      throw new EmailAuthError('INVALID_CREDENTIALS', 'Email ou senha inválidos.');
    }

    const passwordOk = await verifyPassword(password, row.credential.passwordHash);
    if (!passwordOk) {
      throw new EmailAuthError('INVALID_CREDENTIALS', 'Email ou senha inválidos.');
    }
    assertActive(row.user.isActive);
    if (!row.credential.emailVerifiedAt) {
      throw new EmailAuthError('EMAIL_NOT_VERIFIED', 'Confirme seu email antes de entrar.');
    }

    const [rank] = await db.select().from(rankStates).where(eq(rankStates.userId, row.user.id)).limit(1);
    const [rating] = await db.select().from(ratings).where(eq(ratings.userId, row.user.id)).limit(1);
    await db.update(emailCredentials)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(emailCredentials.userId, row.user.id));

    return {
      profile: profileFromDb(row.user, rank ?? null, rating ?? null),
      sessionVersion: Number(row.sessionVersion ?? 0),
    };
  }

  const account = runtimeAccountByEmail(normalized);
  if (!account) {
    await verifyPassword(password, `${'0'.repeat(32)}:${'0'.repeat(128)}`);
    throw new EmailAuthError('INVALID_CREDENTIALS', 'Email ou senha inválidos.');
  }

  // Captured before the KDF so a concurrent reset cannot make this login re-read
  // the newer version after validating the old hash.
  const sessionVersion = await getPlayerSessionVersion(account.userId);

  const passwordOk = await verifyPassword(password, account.passwordHash);
  if (!passwordOk) {
    throw new EmailAuthError('INVALID_CREDENTIALS', 'Email ou senha inválidos.');
  }
  assertActive(account.isActive);
  if (account.emailVerifiedAt === null) {
    throw new EmailAuthError('EMAIL_NOT_VERIFIED', 'Confirme seu email antes de entrar.');
  }
  return { profile: profileFromRuntime(account), sessionVersion };
}

/**
 * Creates a reset token only for an existing, verified email/password credential.
 * Google-only accounts never receive password reset links.
 */
export async function createPasswordResetForEmail(email: string): Promise<{ userId: string; token: string; email: string } | null> {
  const normalized = normalizeEmail(email);

  if (db) {
    const row = await dbAccountByEmail(normalized);
    if (!row || !row.credential.emailVerifiedAt || !row.user.isActive) return null;
    const token = await issuePasswordResetToken(row.user.id);
    return { userId: row.user.id, token, email: normalized };
  }

  const account = runtimeAccountByEmail(normalized);
  if (!account || account.emailVerifiedAt === null || !account.isActive) return null;
  const token = await issuePasswordResetToken(account.userId);
  return { userId: account.userId, token, email: normalized };
}

export async function resetEmailPassword(rawToken: string, newPasswordHash: string): Promise<void> {
  const tokenHash = hashEmailToken(rawToken);

  if (db) {
    await db.transaction(async (tx) => {
      const [token] = await tx
        .select()
        .from(authTokens)
        .where(and(eq(authTokens.tokenHash, tokenHash), eq(authTokens.type, 'password_reset')))
        .for('update')
        .limit(1);

      if (!token || token.consumedAt) {
        throw new EmailAuthError('TOKEN_INVALID', 'Link de recuperação inválido ou já utilizado.');
      }
      if (token.expiresAt.getTime() <= Date.now()) {
        throw new EmailAuthError('TOKEN_EXPIRED', 'Link de recuperação expirado. Solicite um novo.');
      }

      const [row] = await tx
        .select({ user: users, credential: emailCredentials })
        .from(emailCredentials)
        .innerJoin(users, eq(users.id, emailCredentials.userId))
        .where(eq(emailCredentials.userId, token.userId))
        .limit(1);

      if (!row) {
        throw new EmailAuthError('RESET_NOT_ALLOWED', 'Esta conta não usa email e senha.');
      }
      assertActive(row.user.isActive);

      const now = new Date();
      const consumed = await tx.update(authTokens)
        .set({ consumedAt: now, updatedAt: now })
        .where(and(eq(authTokens.id, token.id), isNull(authTokens.consumedAt)))
        .returning({ id: authTokens.id });
      if (consumed.length === 0) {
        throw new EmailAuthError('TOKEN_INVALID', 'Link de recuperação inválido ou já utilizado.');
      }

      await tx.update(emailCredentials)
        .set({ passwordHash: newPasswordHash, updatedAt: now })
        .where(eq(emailCredentials.userId, token.userId));

      // Same transaction: a completed reset always invalidates old player JWTs.
      await incrementPlayerSessionVersionWithTx(tx, token.userId);

      await tx.update(authTokens)
        .set({ consumedAt: now, updatedAt: now })
        .where(and(eq(authTokens.userId, token.userId), eq(authTokens.type, 'password_reset'), isNull(authTokens.consumedAt)));
    });
    return;
  }

  const token = runtimeAuthTokens.get(tokenHash);
  if (!token || token.type !== 'password_reset' || token.consumedAt !== null) {
    throw new EmailAuthError('TOKEN_INVALID', 'Link de recuperação inválido ou já utilizado.');
  }
  if (token.expiresAt <= Date.now()) {
    throw new EmailAuthError('TOKEN_EXPIRED', 'Link de recuperação expirado. Solicite um novo.');
  }
  const account = runtimeAccountById(token.userId);
  if (!account) {
    throw new EmailAuthError('RESET_NOT_ALLOWED', 'Esta conta não usa email e senha.');
  }
  assertActive(account.isActive);
  token.consumedAt = Date.now();
  account.passwordHash = newPasswordHash;
  await incrementPlayerSessionVersion(token.userId);
  for (const other of runtimeAuthTokens.values()) {
    if (other.userId === token.userId && other.type === 'password_reset' && other.consumedAt === null) {
      other.consumedAt = Date.now();
    }
  }
}

/** Hash helper kept here so routes never import scrypt details directly. */
export async function hashNewPassword(password: string): Promise<string> {
  return hashPassword(password);
}
