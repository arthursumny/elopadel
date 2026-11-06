/**
 * Cria um jogador no ambiente LOCAL (com e-mail verificado e senha), para testes
 * controlados com amigos. Não usar em produção.
 *
 * Uso:
 *   set -a && . ./.env.local && set +a
 *   node scripts/local-add-player.mjs --email fulano@exemplo.com --name "Fulano" --handle @fulano --password senha123 [--city "Joaçaba"] [--state SC]
 */
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';
import postgres from 'postgres';

const scryptAsync = promisify(scrypt);

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1];
}

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  const email = (arg('email') ?? '').trim().toLowerCase();
  const name = (arg('name') ?? '').trim();
  const handle = (arg('handle') ?? '').trim().toLowerCase();
  const password = arg('password') ?? '';
  const city = arg('city', 'Joaçaba');
  const state = arg('state', 'SC');

  if (!email || !name || !handle || !password) {
    throw new Error('Informe --email, --name, --handle e --password.');
  }
  if (!/^@[a-z0-9_.]{2,19}$/.test(handle)) throw new Error('Handle inválido: use @ + 2 a 19 caracteres (a-z 0-9 _ .).');
  if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente (carregue o .env.local).');

  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  const passwordHash = await hashPassword(password);

  await sql.begin(async (tx) => {
    const [existing] = await tx`select id from users where email = ${email} or handle = ${handle} limit 1`;
    if (existing) throw new Error('Já existe um usuário com esse e-mail ou handle.');

    const [user] = await tx`
      insert into users (display_name, handle, email, city, state, country)
      values (${name}, ${handle}, ${email}, ${city}, ${state}, 'Brasil')
      returning id`;

    await tx`insert into email_credentials (user_id, password_hash, email_verified_at)
             values (${user.id}, ${passwordHash}, now())`;
    await tx`insert into ratings (user_id, rating, deviation, provisional_matches)
             values (${user.id}, 1500, 350, 0)`;
    await tx`insert into rank_states (user_id, tier, points, peak_tier)
             values (${user.id}, '5ª III', 50, '5ª III')`;

    console.log(`criado: ${handle} <${email}> em ${city}/${state}`);
  });

  await sql.end();
}

main().catch((error) => {
  console.error(`FALHOU: ${error.message}`);
  process.exit(1);
});
