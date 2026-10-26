import assert from 'node:assert/strict';
import postgres from 'postgres';

/**
 * Isolated PostgreSQL integration test for the email auth backend.
 *
 * Safety:
 * - Only runs when explicitly invoked with an ephemeral TEST_DATABASE_URL.
 * - Refuses non-loopback hosts, port 5432, and non `elo_auth_test*` databases.
 * - Never loads the repository .env and never performs external email/Google calls.
 */

const ALLOW_ENV = 'ALLOW_DB_INTEGRATION';
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const EXPECTED_MIN_MIGRATIONS = 16;

function validateEnvironment(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (process.env[ALLOW_ENV] !== '1') {
    throw new Error(`${ALLOW_ENV}=1 is required; this test is not part of npm test.`);
  }
  if (!url) {
    throw new Error('TEST_DATABASE_URL is required.');
  }
  if (process.env.DATABASE_URL !== url) {
    throw new Error('DATABASE_URL must equal the explicit TEST_DATABASE_URL.');
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to run integration test with NODE_ENV=production.');
  }

  const parsed = new URL(url);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`Refusing non-local database host: ${parsed.hostname}`);
  }
  if (parsed.port === '5432') {
    throw new Error('Refusing port 5432; use the disposable container random loopback port.');
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (!database.startsWith('elo_auth_test')) {
    throw new Error(`Refusing database "${database}"; name must start with elo_auth_test.`);
  }
  return url;
}

async function main() {
  const databaseUrl = validateEnvironment();
  const sql = postgres(databaseUrl, { max: 3, prepare: false });

  try {
    // ---------------------------------------------------------------------
    // Migrations: every file 0000..0015 must be applied.
    // ---------------------------------------------------------------------
    const [migrationCountRow] = await sql<{ count: number }[]>`
      select count(*)::int as count from drizzle.__drizzle_migrations
    `;
    assert.ok(
      migrationCountRow.count >= EXPECTED_MIN_MIGRATIONS,
      `expected >= ${EXPECTED_MIN_MIGRATIONS} migrations, got ${migrationCountRow.count}`
    );

    const tableRows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public'
    `;
    const tables = new Set(tableRows.map((row) => row.table_name));
    for (const table of ['users', 'email_credentials', 'auth_tokens', 'auth_rate_limits', 'player_session_versions']) {
      assert.ok(tables.has(table), `missing expected table ${table}`);
    }

    const { registerEmailAccount, issueEmailVerificationToken, verifyEmailAddress, authenticateEmailAccount, issuePasswordResetToken, resetEmailPassword, hashNewPassword } =
      await import('../../src/app/api/auth/email/service.ts');
    const { consumeRateLimit, RATE_LIMITS } = await import('../../src/lib/security/rate-limit.ts');
    const { getPlayerSessionVersion } = await import('../../src/lib/security/session-version.ts');
    const { createSession, verifySessionToken } = await import('../../src/lib/auth.ts');

    const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let sequence = 0;
    const nextIdentity = () => {
      sequence += 1;
      return {
        email: `player_${run}_${sequence}@example.com`,
        handle: `@p${run}${sequence}`.slice(0, 20),
      };
    };

    const registerPending = async (passwordHash: string, name: string) => {
      const identity = nextIdentity();
      const registration = await registerEmailAccount({
        email: identity.email,
        passwordHash,
        name,
        handle: identity.handle,
        city: 'Curitiba',
        state: 'PR',
        category: '5ª',
      });
      assert.equal(registration.created, true, 'registration should create a pending account');
      return { ...identity, registration };
    };

    // ---------------------------------------------------------------------
    // 1. Pending registration -> victim chooses password at verification.
    // ---------------------------------------------------------------------
    const attackerPassword = 'senha-do-atacante-123';
    const victimPassword = 'senha-escolhida-pela-vitima-456';
    const attackerHash = await hashNewPassword(attackerPassword);
    const victimHash = await hashNewPassword(victimPassword);

    const victim = await registerPending(attackerHash, 'Vitima Integracao');
    const victimToken = await issueEmailVerificationToken(victim.registration.userId);
    await verifyEmailAddress(victimToken, victimHash);

    await assert.rejects(
      authenticateEmailAccount(victim.email, attackerPassword),
      (error: { code?: string }) => error.code === 'INVALID_CREDENTIALS',
      'attacker password must be rejected after victim verification'
    );

    const victimAuth = await authenticateEmailAccount(victim.email, victimPassword);
    const victimProfile = victimAuth.profile;
    assert.equal(victimProfile.id, victim.registration.userId);

    const preResetSession = await createSession(victimProfile.id, 'player', { sessionVersion: victimAuth.sessionVersion });
    assert.deepEqual(await verifySessionToken(preResetSession), { id: victimProfile.id, role: 'player' });

    // ---------------------------------------------------------------------
    // 2. Reset: password changes, session version bumps, old JWT dies.
    // ---------------------------------------------------------------------
    const versionBeforeReset = await getPlayerSessionVersion(victimProfile.id);
    assert.equal(victimAuth.sessionVersion, versionBeforeReset);

    // Snapshot captured before the reset: minting a JWT with this version must
    // produce a token that can never validate after the reset commits.
    const staleSnapshotSession = await createSession(victimProfile.id, 'player', {
      sessionVersion: victimAuth.sessionVersion,
    });

    const resetToken = await issuePasswordResetToken(victimProfile.id);
    const postResetPassword = 'senha-pos-reset-integracao-789';

    await resetEmailPassword(resetToken, await hashNewPassword(postResetPassword));

    const versionAfterReset = await getPlayerSessionVersion(victimProfile.id);
    assert.equal(versionAfterReset, versionBeforeReset + 1, 'reset must increment the session version');
    assert.equal(await verifySessionToken(preResetSession), null, 'pre-reset player JWT must be invalid');
    assert.equal(await verifySessionToken(staleSnapshotSession), null, 'JWT from the pre-reset auth snapshot must be invalid');
    console.log(
      `[integration] auth snapshot version=${victimAuth.sessionVersion} post-reset=${versionAfterReset}; stale JWT invalid: ok`
    );

    await assert.rejects(
      authenticateEmailAccount(victim.email, victimPassword),
      (error: { code?: string }) => error.code === 'INVALID_CREDENTIALS'
    );
    await authenticateEmailAccount(victim.email, postResetPassword);

    const postResetSession = await createSession(victimProfile.id);
    assert.deepEqual(await verifySessionToken(postResetSession), { id: victimProfile.id, role: 'player' });

    // Sequential reset replay must fail.
    await assert.rejects(
      resetEmailPassword(resetToken, await hashNewPassword('outra-senha-qualquer-000')),
      (error: { code?: string }) => error.code === 'TOKEN_INVALID'
    );

    // ---------------------------------------------------------------------
    // 3. Concurrent single-use email verification token.
    // ---------------------------------------------------------------------
    const concurrentVerifyPasswordA = 'concorrente-verificacao-a-111';
    const concurrentVerifyPasswordB = 'concorrente-verificacao-b-222';
    const verifyAHash = await hashNewPassword(concurrentVerifyPasswordA);
    const verifyBHash = await hashNewPassword(concurrentVerifyPasswordB);
    const concurrentAccount = await registerPending(await hashNewPassword('inicial-para-verificacao-000'), 'Concorrente Verify');
    const concurrentToken = await issueEmailVerificationToken(concurrentAccount.registration.userId);

    const verifyResults = await Promise.allSettled([
      verifyEmailAddress(concurrentToken, verifyAHash),
      verifyEmailAddress(concurrentToken, verifyBHash),
    ]);
    assert.equal(verifyResults.filter((result) => result.status === 'fulfilled').length, 1, 'only one verify may succeed');
    const rejectedVerify = verifyResults.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rejectedVerify.reason as { code?: string }).code, 'TOKEN_INVALID');

    let concurrentVerifyLogins = 0;
    for (const password of [concurrentVerifyPasswordA, concurrentVerifyPasswordB]) {
      try {
        await authenticateEmailAccount(concurrentAccount.email, password);
        concurrentVerifyLogins += 1;
      } catch (error) {
        assert.equal((error as { code?: string }).code, 'INVALID_CREDENTIALS');
      }
    }
    assert.equal(concurrentVerifyLogins, 1, 'only the winning concurrent verifier password may log in');

    // ---------------------------------------------------------------------
    // 4. Concurrent single-use password reset token + one version bump.
    // ---------------------------------------------------------------------
    const resetBasePassword = 'base-para-reset-concorrente-000';
    const resetPasswordA = 'reset-concorrente-a-111';
    const resetPasswordB = 'reset-concorrente-b-222';
    const resetAccount = await registerPending(await hashNewPassword(resetBasePassword), 'Concorrente Reset');
    const resetVerifyToken = await issueEmailVerificationToken(resetAccount.registration.userId);
    await verifyEmailAddress(resetVerifyToken, await hashNewPassword(resetBasePassword));

    const versionBeforeConcurrentReset = await getPlayerSessionVersion(resetAccount.registration.userId);
    const concurrentResetToken = await issuePasswordResetToken(resetAccount.registration.userId);
    const resetResults = await Promise.allSettled([
      resetEmailPassword(concurrentResetToken, await hashNewPassword(resetPasswordA)),
      resetEmailPassword(concurrentResetToken, await hashNewPassword(resetPasswordB)),
    ]);
    assert.equal(resetResults.filter((result) => result.status === 'fulfilled').length, 1, 'only one reset may succeed');
    const rejectedReset = resetResults.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rejectedReset.reason as { code?: string }).code, 'TOKEN_INVALID');

    const versionAfterConcurrentReset = await getPlayerSessionVersion(resetAccount.registration.userId);
    assert.equal(
      versionAfterConcurrentReset,
      versionBeforeConcurrentReset + 1,
      'concurrent reset must bump the version exactly once'
    );

    let concurrentResetLogins = 0;
    for (const password of [resetPasswordA, resetPasswordB]) {
      try {
        await authenticateEmailAccount(resetAccount.email, password);
        concurrentResetLogins += 1;
      } catch (error) {
        assert.equal((error as { code?: string }).code, 'INVALID_CREDENTIALS');
      }
    }
    assert.equal(concurrentResetLogins, 1, 'only the winning reset password may log in');

    // ---------------------------------------------------------------------
    // 5. Concurrent rate limiting on a brand-new first key: no race bypass.
    // ---------------------------------------------------------------------
    const rateLimitIdentifier = `race-first-key-${run}`;
    const rateLimitNow = Date.now();
    const attempts = 30;
    const allowed = await Promise.all(
      Array.from({ length: attempts }, () => consumeRateLimit('login', rateLimitIdentifier, rateLimitNow))
    );
    assert.equal(
      allowed.filter(Boolean).length,
      RATE_LIMITS.login.limit,
      `exactly ${RATE_LIMITS.login.limit} concurrent attempts may pass`
    );

    const [rateRow] = await sql<{ count: number; blocked_until: Date | null }[]>`
      select count, blocked_until from auth_rate_limits where key = ${`login:${rateLimitIdentifier}`}
    `;
    assert.equal(Number(rateRow.count), attempts, 'every concurrent attempt must be counted');
    assert.notEqual(rateRow.blocked_until, null, 'the first key must be blocked after exceeding the limit');
    assert.equal(await consumeRateLimit('login', rateLimitIdentifier, rateLimitNow + 1), false);

    console.log(`[integration] migrations applied=${migrationCountRow.count} tables=${tables.size}`);
    console.log('[integration] migrations applied and schema verified');
    console.log('[integration] pending/verify/attacker-password/login: ok');
    console.log('[integration] reset/session-version/old-session-invalid: ok');
    console.log('[integration] concurrent token single-use (verify + reset): ok');
    console.log('[integration] concurrent first-key rate limiting: ok');
    console.log(`[integration] rate-limit row count=${rateRow.count} blocked=${rateRow.blocked_until !== null}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main()
  .then(() => {
    console.log('[integration] PASS');
    process.exit(0);
  })
  .catch((error) => {
    console.error('[integration] FAIL');
    console.error(error);
    process.exit(1);
  });
