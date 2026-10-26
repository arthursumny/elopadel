import { defineConfig } from 'drizzle-kit';

const url = process.env.TEST_DATABASE_URL;

// This config is intentionally isolated from drizzle.config.ts and never loads
// the repository .env. The shell harness must pass an explicit ephemeral URL.
if (process.env.ALLOW_DB_INTEGRATION !== '1') {
  throw new Error('ALLOW_DB_INTEGRATION=1 is required to apply migrations for the integration test.');
}
if (!url) {
  throw new Error('TEST_DATABASE_URL is required.');
}

const parsed = new URL(url);
const localHosts = new Set(['127.0.0.1', 'localhost', '::1']);
if (!localHosts.has(parsed.hostname)) {
  throw new Error(`Refusing non-local integration database host: ${parsed.hostname}`);
}
if (!parsed.pathname.replace(/^\//, '').startsWith('elo_auth_test')) {
  throw new Error('Refusing integration database whose name does not start with elo_auth_test.');
}
if (parsed.port === '5432') {
  throw new Error('Refusing port 5432; the ephemeral container must use a random loopback port.');
}

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
  dbCredentials: { url },
});
