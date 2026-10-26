import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');

const compose = read('docker-compose.yml');
const envExample = read('.env.example');
const adminLoginRoute = read('src/app/api/admin/login/route.ts');
const maintenanceRoute = read('src/app/api/internal/maintenance/route.ts');
const emailClient = read('src/lib/email.ts');

function composeServiceEnv(name: string): string | undefined {
  const match = compose.match(new RegExp(`^\\s{6}${name}:\\s*(.+)$`, 'm'));
  return match?.[1].trim();
}

describe('deploy environment contract', () => {
  it('passes the exact env names the admin and maintenance routes read', () => {
    expect(adminLoginRoute).toContain('process.env.ADMIN_KEY');
    expect(maintenanceRoute).toContain('process.env.MAINTENANCE_TOKEN');

    expect(composeServiceEnv('ADMIN_KEY')).toBe('${ADMIN_KEY:-${ADMIN_API_KEY:-}}');
    expect(composeServiceEnv('MAINTENANCE_TOKEN')).toBe(
      '${MAINTENANCE_TOKEN:-${MAINTENANCE_API_KEY:-}}'
    );
  });

  it('does not expose the legacy names as the configured variable', () => {
    expect(compose).not.toMatch(/^\s+ADMIN_API_KEY:/m);
    expect(compose).not.toMatch(/^\s+MAINTENANCE_API_KEY:/m);
  });

  it('disables mock auth by default and removes Apple configuration', () => {
    expect(composeServiceEnv('ALLOW_MOCK_AUTH')).toBe('${ALLOW_MOCK_AUTH:-false}');
    expect(envExample).toMatch(/^ALLOW_MOCK_AUTH=false$/m);
    expect(compose).not.toMatch(/APPLE/i);
    expect(envExample).not.toMatch(/APPLE/i);
  });

  it('passes email provider variables matching the fixed client contract', () => {
    expect(emailClient).toContain('process.env.EMAIL_PROVIDER_URL');
    expect(emailClient).toContain('process.env.EMAIL_PROVIDER_TOKEN');

    expect(composeServiceEnv('EMAIL_PROVIDER_URL')).toBe('${EMAIL_PROVIDER_URL:-}');
    expect(composeServiceEnv('EMAIL_PROVIDER_TOKEN')).toBe('${EMAIL_PROVIDER_TOKEN:-}');
    expect(envExample).toMatch(/^EMAIL_PROVIDER_URL=$/m);
    expect(envExample).toMatch(/^EMAIL_PROVIDER_TOKEN=$/m);
    expect(composeServiceEnv('RESEND_API_KEY')).toBe('${RESEND_API_KEY:-}');
    expect(composeServiceEnv('EMAIL_FROM')).toBe('${EMAIL_FROM:-}');
    expect(envExample).toMatch(/^RESEND_API_KEY=$/m);
    expect(envExample).toMatch(/^EMAIL_FROM=Elo Padel <noreply@elopadel\.avaliacoes\.tech>$/m);
  });

  it('exposes the runtime Google client id', () => {
    expect(composeServiceEnv('GOOGLE_CLIENT_ID')).toBe('${GOOGLE_CLIENT_ID:-}');
    expect(envExample).toMatch(/^GOOGLE_CLIENT_ID=$/m);
  });

  it('documents the required production auth secret length', () => {
    expect(envExample).toMatch(/AUTH_SECRET=.{32,}/);
  });
});
