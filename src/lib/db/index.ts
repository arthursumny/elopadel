import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const client = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 5, prepare: false })
  : null;

export const db = client ? drizzle(client, { schema }) : null;

export function databaseConfigured() {
  return Boolean(client);
}

export async function databaseReachable() {
  if (!client) {
    console.warn('[DB] databaseReachable: client is null. DATABASE_URL set?', Boolean(process.env.DATABASE_URL));
    return false;
  }
  try {
    await client`select 1`;
    return true;
  } catch (err) {
    console.error('[DB] databaseReachable: connection check failed:', err);
    return false;
  }
}
