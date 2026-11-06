/**
 * Seed local (não usar em produção): cria 4 jogadores de teste em Joaçaba/SC
 * com e-mail verificado + senha, e uma temporada ativa.
 *
 * Uso:
 *   set -a && . ./.env.local && set +a && npx tsx scripts/local-seed-test-players.ts
 *
 * Senha de todos: elopadel123
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../src/lib/db';
import { emailCredentials, rankStates, ratings, seasons, users } from '../src/lib/db/schema';
import { hashPassword } from '../src/lib/security/password';

const PASSWORD = process.env.LOCAL_SEED_PASSWORD ?? 'elopadel123';

const PLAYERS = [
  { handle: '@teste1', displayName: 'Teste Um', email: 'teste1@elopadel.local', tier: '4ª III', points: 40 },
  { handle: '@teste2', displayName: 'Teste Dois', email: 'teste2@elopadel.local', tier: '4ª III', points: 40 },
  { handle: '@teste3', displayName: 'Teste Três', email: 'teste3@elopadel.local', tier: '5ª I', points: 20 },
  { handle: '@teste4', displayName: 'Teste Quatro', email: 'teste4@elopadel.local', tier: '5ª I', points: 20 },
];

async function main() {
  if (!db) throw new Error('DATABASE_URL ausente.');
  const passwordHash = await hashPassword(PASSWORD);

  for (const player of PLAYERS) {
    const [existing] = await db.select().from(users).where(eq(users.handle, player.handle)).limit(1);
    let userId = existing?.id;

    if (!userId) {
      const [created] = await db
        .insert(users)
        .values({
          displayName: player.displayName,
          handle: player.handle,
          email: player.email,
          city: 'Joaçaba',
          state: 'SC',
          country: 'Brasil',
        })
        .returning();
      userId = created.id;
      console.log(`criado jogador ${player.handle}`);
    } else {
      console.log(`jogador ${player.handle} já existe`);
    }

    const [credential] = await db
      .select()
      .from(emailCredentials)
      .where(eq(emailCredentials.userId, userId))
      .limit(1);
    if (!credential) {
      await db.insert(emailCredentials).values({ userId, passwordHash, emailVerifiedAt: new Date() });
      console.log(`  credencial de e-mail verificada criada`);
    }

    const [rating] = await db.select().from(ratings).where(eq(ratings.userId, userId)).limit(1);
    if (!rating) {
      await db.insert(ratings).values({ userId, rating: 1500, deviation: 350, provisionalMatches: 0 });
    }

    const [rankState] = await db.select().from(rankStates).where(eq(rankStates.userId, userId)).limit(1);
    if (!rankState) {
      await db.insert(rankStates).values({
        userId,
        tier: player.tier,
        points: player.points,
        peakTier: player.tier,
      });
    }
  }

  const [active] = await db.select().from(seasons).where(eq(seasons.status, 'active')).limit(1);
  if (!active) {
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 90 * 24 * 60 * 60 * 1000);
    await db.insert(seasons).values({ name: 'Temporada 1 (local)', status: 'active', startsAt, endsAt });
    console.log('temporada ativa criada: Temporada 1 (local), 90 dias');
  } else {
    console.log(`temporada ativa já existe: ${active.name}`);
  }

  const [check] = await db
    .select({ handle: users.handle })
    .from(users)
    .where(and(eq(users.handle, '@teste1'), eq(users.isActive, true)))
    .limit(1);
  console.log(`verificação final: ${check ? 'ok' : 'falhou'}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
