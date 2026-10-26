import { execSync } from 'node:child_process';
import path from 'node:path';

async function main() {
  console.log('====================================================');
  console.log('   ELO PADEL OPAQUE-BOX E2E TEST RUNNER (TIERS 1-4)  ');
  console.log('====================================================\n');

  const configPath = path.resolve(__dirname, 'vitest.config.ts');
  const cmd = `npx vitest run -c ${configPath}`;

  console.log(`Executing: ${cmd}\n`);

  try {
    const output = execSync(cmd, {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'inherit',
      env: {
        ...process.env,
        AUTH_SECRET: process.env.AUTH_SECRET ?? 'elo-padel-local-secret-change-before-production',
      },
    });
    console.log('\n[SUCCESS] All E2E test suites passed cleanly!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n[FAILURE] E2E test suite encountered errors:', error.message);
    process.exit(1);
  }
}

main();
