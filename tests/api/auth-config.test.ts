import { describe, it, expect, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/auth/config/route';

describe('GET /api/auth/config', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns only the first trimmed Google client ID from the backend list', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', ' web-client.apps.googleusercontent.com , android-client.apps.googleusercontent.com , ios-client.apps.googleusercontent.com ');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');

    const res = await GET();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ googleClientId: 'web-client.apps.googleusercontent.com' });
  });

  it('falls back to the public client ID and returns a single value', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'public-web-id, secondary-id');

    const res = await GET();
    expect(await res.json()).toEqual({ googleClientId: 'public-web-id' });
  });

  it('returns an empty ID when nothing is configured', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '');

    const res = await GET();
    expect(await res.json()).toEqual({ googleClientId: '' });
  });
});
