import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  consume: vi.fn(),
  hashIp: vi.fn((ip: string) => `hashed:${ip}`),
}));

vi.mock('@/lib/handle-availability', () => ({
  isPublicHandleAvailable: mocks.lookup,
}));

vi.mock('@/lib/security/rate-limit', () => ({
  consumeRateLimit: mocks.consume,
  hashRateLimitIp: mocks.hashIp,
}));

import { GET } from './route';

function request(handle: string, headers?: HeadersInit) {
  return new Request(`http://localhost/api/auth/handle-availability?handle=${encodeURIComponent(handle)}`, { headers });
}

async function expectNoStore(response: Response) {
  expect(response.headers.get('cache-control')).toBe('no-store');
}

describe('GET /api/auth/handle-availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.consume.mockResolvedValue(true);
    mocks.lookup.mockResolvedValue(true);
  });

  it('returns normalized availability without exposing account data', async () => {
    const response = await GET(request(' @ANA.4 ', { 'x-forwarded-for': '203.0.113.8' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ handle: '@ana.4', available: true });
    expect(mocks.lookup).toHaveBeenCalledWith('@ana.4');
    expect(mocks.consume).toHaveBeenCalledWith('handleAvailability', 'hashed:203.0.113.8');
    await expectNoStore(response);
  });

  it('returns occupied handles without revealing who owns them', async () => {
    mocks.lookup.mockResolvedValue(false);
    const response = await GET(request('@ja_usado'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ handle: '@ja_usado', available: false });
    await expectNoStore(response);
  });

  it.each(['@admin', '@ab', '!!!'])('rejects invalid or reserved handle %s', async (handle) => {
    const response = await GET(request(handle));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Escolha uma arroba válida e não reservada.' });
    expect(mocks.consume).not.toHaveBeenCalled();
    await expectNoStore(response);
  });

  it('returns 429 when the IP limit is exceeded', async () => {
    mocks.consume.mockResolvedValue(false);
    const response = await GET(request('@jogador', { 'x-real-ip': '203.0.113.9' }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'Muitas verificações. Aguarde um minuto e tente novamente.' });
    expect(mocks.lookup).not.toHaveBeenCalled();
    expect(mocks.consume).toHaveBeenCalledWith('handleAvailability', 'hashed:203.0.113.9');
    await expectNoStore(response);
  });

  it('returns 503 when the availability storage fails', async () => {
    mocks.lookup.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request('@jogador'));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Verificação temporariamente indisponível. Tente novamente.' });
    await expectNoStore(response);
  });

  it('returns 503 if the rate-limit storage fails closed', async () => {
    mocks.consume.mockRejectedValue(new Error('database unavailable'));
    const response = await GET(request('@jogador'));
    expect(response.status).toBe(503);
    expect(mocks.lookup).not.toHaveBeenCalled();
    await expectNoStore(response);
  });
});
