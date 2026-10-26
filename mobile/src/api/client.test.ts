import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import {
  apiClient,
  resolveApiBaseUrl,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  onUnauthorized,
  AUTH_STORAGE_KEY,
  AUTH_TOKEN_KEY,
  ApiError,
} from './client';

// Mock expo-secure-store
vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: vi.fn(async (key: string) => store.get(key) || null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
});

describe('Mobile API Client & Secure Storage (`client.ts`)', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearStoredToken();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('TC-CLIENT-01: resolves API base URL using EXPO_PUBLIC_API_URL or platform default', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.elopadel.com';
    expect(resolveApiBaseUrl()).toBe('https://api.elopadel.com');

    delete process.env.EXPO_PUBLIC_API_URL;
    const url = resolveApiBaseUrl();
    expect(url).toMatch(/^http:\/\/(localhost|10\.0\.2\.2):3000$/);
  });

  it('TC-CLIENT-02: persists and retrieves token in SecureStore', async () => {
    expect(await getStoredToken()).toBeNull();
    await setStoredToken('test_jwt_bearer_token');
    expect(await getStoredToken()).toBe('test_jwt_bearer_token');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(AUTH_STORAGE_KEY, 'test_jwt_bearer_token');
  });

  it('TC-CLIENT-03: injects Authorization Bearer header when token exists', async () => {
    await setStoredToken('active_session_token');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true, data: 'profile' }),
    });

    const res = await apiClient.get('/api/me');
    expect(res).toEqual({ ok: true, data: 'profile' });

    const callArgs = (global.fetch as any).mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers['Authorization']).toBe('Bearer active_session_token');
    expect(headers['Accept']).toBe('application/json');
  });

  it('TC-CLIENT-04: omits Authorization header when no token is present', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true, status: 'public' }),
    });

    await apiClient.get('/api/public-endpoint');
    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[1].headers['Authorization']).toBeUndefined();
  });

  it('TC-CLIENT-05: automatically serializes JSON body on POST/PUT requests', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ ok: true }),
    });

    await apiClient.post('/api/auth/social', { provider: 'google', idToken: 'xyz' });
    const callArgs = (global.fetch as any).mock.calls[0];
    expect(callArgs[1].body).toBe(JSON.stringify({ provider: 'google', idToken: 'xyz' }));
    expect(callArgs[1].headers['Content-Type']).toBe('application/json');
  });

  it('TC-CLIENT-06: intercepts 401 Unauthorized, purges stored token and triggers listener', async () => {
    await setStoredToken('expired_token');

    const unauthorizedListener = vi.fn();
    const unsubscribe = onUnauthorized(unauthorizedListener);

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Sessão expirada.' }),
    });

    await expect(apiClient.get('/api/me')).rejects.toThrow(ApiError);
    expect(await getStoredToken()).toBeNull();
    expect(unauthorizedListener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('TC-CLIENT-07: propagates backend error message on non-200 responses', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ error: 'Esse @handle já está em uso.' }),
    });

    await expect(
      apiClient.post('/api/auth/social/onboarding', { handle: '@taken' })
    ).rejects.toThrow('Esse @handle já está em uso.');
  });

  it('TC-CLIENT-08: handles network exceptions gracefully without crashing', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiClient.get('/api/me')).rejects.toThrow(
      'Não foi possível conectar ao servidor. Verifique sua conexão com a internet.'
    );
  });
});
