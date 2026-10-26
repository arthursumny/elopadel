export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { runAutoMigrations } = await import('@/lib/db/migrate');
      await runAutoMigrations();
    } catch (err) {
      console.error('[Instrumentation] Auto-migration error on boot:', err);
    }
  }
}
