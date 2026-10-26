import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db } from './index';
import path from 'path';
import fs from 'fs';

let migrationDone = false;
let migrationRunning: Promise<boolean> | null = null;

export async function runAutoMigrations(): Promise<boolean> {
  if (migrationDone) return true;
  if (!db) {
    console.warn('[DB Migrator] Database not configured, skipping migrations.');
    return false;
  }
  if (migrationRunning) return migrationRunning;

  migrationRunning = (async () => {
    try {
      const candidates = [
        path.join(process.cwd(), 'drizzle'),
        path.resolve('/app/drizzle'),
        path.join(__dirname, '../../../drizzle'),
      ];
      const migrationsFolder = candidates.find((dir) => fs.existsSync(dir));

      if (!migrationsFolder) {
        console.warn('[DB Migrator] Migrations folder not found in candidates:', candidates);
        return false;
      }

      console.log('[DB Migrator] Applying pending migrations from:', migrationsFolder);
      await migrate(db, { migrationsFolder });
      console.log('[DB Migrator] Database schema is fully up to date!');
      migrationDone = true;
      return true;
    } catch (err) {
      console.error('[DB Migrator] Migration error:', err);
      return false;
    } finally {
      migrationRunning = null;
    }
  })();

  return migrationRunning;
}
