import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  apiClient,
  apiRequest,
  resolveApiBaseUrl,
  getStoredToken,
  setStoredToken,
  clearStoredToken,
  onUnauthorized,
  notifyUnauthorized,
  AUTH_STORAGE_KEY,
  AUTH_TOKEN_KEY,
  ApiError,
} from './client';

// Mock expo-secure-store in-memory store
const mockSecureStore = new Map<string, string>();
let getItemShouldThrow = false;
let setItemShouldThrow = false;
let deleteItemShouldThrow = false;

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => {
    if (getItemShouldThrow) {
      throw new Error('Keystore hardware decryption error');
    }
    return mockSecureStore.get(key) || null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (setItemShouldThrow) {
      throw new Error('Storage quota exceeded / Keystore write failure');
    }
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (deleteItemShouldThrow) {
      throw new Error('Keystore deletion failure');
    }
    mockSecureStore.delete(key);
  }),
}));

describe('Empirical Adversarial Stress Tests: Mobile API Client (`client.ts`)', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockSecureStore.clear();
    getItemShouldThrow = false;
    setItemShouldThrow = false;
    deleteItemShouldThrow = false;
    await clearStoredToken();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // CATEGORY 1: Storage Corruption, Keystore Hardware Errors & Boundary Values
  // =========================================================================
  describe('Category 1: Storage Corruption & Keystore Failure Modes', () => {
    it('STRESS-CLIENT-01: gracefully handles SecureStore.getItemAsync hardware exception without crashing', async () => {
      getItemShouldThrow = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const token = await getStoredToken();
      expect(token).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith(
        '[SecureStore] Failed to read token:',
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });

    it('STRESS-CLIENT-02: gracefully handles SecureStore.setItemAsync quota error while preserving in-memory token', async () => {
      setItemShouldThrow = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await setStoredToken('ephemeral_token_session');
      // In-memory cache should still retain the token despite persistence failure
      expect(await getStoredToken()).toBe('ephemeral_token_session');
      expect(warnSpy).toHaveBeenCalledWith(
        '[SecureStore] Failed to persist token:',
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });

    it('STRESS-CLIENT-03: clearStoredToken purges in-memory token even if SecureStore.deleteItemAsync throws', async () => {
      await setStoredToken('initial_token');
      expect(await getStoredToken()).toBe('initial_token');

      deleteItemShouldThrow = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await clearStoredToken();
      // In-memory token MUST be cleared immediately
      getItemShouldThrow = true; // Even if storage throws on read, cache is null
      expect(await getStoredToken()).toBeNull();
      warnSpy.mockRestore();
    });

    it('STRESS-CLIENT-04: handles storage containing corrupted non-token strings and oversized blobs (>64KB)', async () => {
      const oversizedCorruptPayload = JSON.stringify({
        corrupted: true,
        blob: 'A'.repeat(70000),
        signature: 'invalid_raw_unparsed_json',
      });

      mockSecureStore.set(AUTH_STORAGE_KEY, oversizedCorruptPayload);
      const retrieved = await getStoredToken();
      expect(retrieved).toBe(oversizedCorruptPayload);
      expect(retrieved?.length).toBeGreaterThan(70000);
    });

    it('STRESS-CLIENT-05: handles empty string token without injecting broken Bearer header', async () => {
      mockSecureStore.set(AUTH_STORAGE_KEY, '');

      let capturedHeaders: Record<string, string> = {};
      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedHeaders = options.headers;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        };
      });

      await apiClient.get('/api/me');
      expect(capturedHeaders['Authorization']).toBeUndefined();
    });
  });

  // =========================================================================
  // CATEGORY 2: 401 Unauthorized Handling, Purge & Listener Isolation
  // =========================================================================
  describe('Category 2: 401 Unauthorized Purge & Listener Event Dispatch', () => {
    it('STRESS-CLIENT-06: 401 response purges in-memory and SecureStore token and fires listeners', async () => {
      await setStoredToken('active_token_to_expire');
      const listener = vi.fn();
      const unsubscribe = onUnauthorized(listener);

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Sessão expirada. Faça login novamente.' }),
      });

      await expect(apiClient.get('/api/me')).rejects.toThrow('Sessão expirada. Faça login novamente.');
      expect(await getStoredToken()).toBeNull();
      expect(mockSecureStore.has(AUTH_STORAGE_KEY)).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('STRESS-CLIENT-07: unsubscribing from onUnauthorized correctly unbinds the listener', async () => {
      const listener = vi.fn();
      const unsubscribe = onUnauthorized(listener);

      notifyUnauthorized();
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      notifyUnauthorized();
      expect(listener).toHaveBeenCalledTimes(1); // Not called again
    });

    it('STRESS-CLIENT-08: a listener throwing an exception does NOT crash notifyUnauthorized or abort other listeners', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = vi.fn(() => {
        throw new Error('Fatal consumer listener error');
      });
      const goodListener = vi.fn();

      const unsub1 = onUnauthorized(badListener);
      const unsub2 = onUnauthorized(goodListener);

      expect(() => notifyUnauthorized()).not.toThrow();
      expect(badListener).toHaveBeenCalledTimes(1);
      expect(goodListener).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalled();

      unsub1();
      unsub2();
      errorSpy.mockRestore();
    });

    it('STRESS-CLIENT-09: multiple concurrent 401 responses execute purge idempotently without racing', async () => {
      await setStoredToken('concurrent_expired_token');
      const listener = vi.fn();
      const unsubscribe = onUnauthorized(listener);

      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Token revogado.' }),
      }));

      // Fire 5 concurrent requests that all return 401
      const requests = [
        apiClient.get('/api/me'),
        apiClient.get('/api/history'),
        apiClient.get('/api/season'),
        apiClient.get('/api/notifications'),
        apiClient.get('/api/friends'),
      ];

      const results = await Promise.allSettled(requests);
      results.forEach((res) => {
        expect(res.status).toBe('rejected');
        if (res.status === 'rejected') {
          expect(res.reason).toBeInstanceOf(ApiError);
          expect((res.reason as ApiError).status).toBe(401);
        }
      });

      expect(await getStoredToken()).toBeNull();
      expect(listener).toHaveBeenCalledTimes(5);
      unsubscribe();
    });

    it('STRESS-CLIENT-10: ApiError retains raw responseData, status code, and flags network error', async () => {
      const customPayload = { error: 'Acesso negado', reason: 'ROLE_MISMATCH', code: 403 };
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => customPayload,
      });

      try {
        await apiClient.get('/api/admin/clubs');
        expect.unreachable('Should have thrown ApiError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(403);
        expect(err.data).toEqual(customPayload);
        expect(err.isNetworkError).toBe(false);
      }
    });
  });

  // =========================================================================
  // CATEGORY 3: Dynamic URL Fallback, Formatting & Edge Cases
  // =========================================================================
  describe('Category 3: Dynamic URL Resolution & Fallback Logic', () => {
    it('STRESS-CLIENT-11: falls back to localhost:3000 when EXPO_PUBLIC_API_URL is undefined on iOS', () => {
      delete process.env.EXPO_PUBLIC_API_URL;
      (Platform as any).OS = 'ios';
      expect(resolveApiBaseUrl()).toBe('http://localhost:3000');
    });

    it('STRESS-CLIENT-12: falls back to 10.0.2.2:3000 when EXPO_PUBLIC_API_URL is undefined on Android', () => {
      delete process.env.EXPO_PUBLIC_API_URL;
      (Platform as any).OS = 'android';
      expect(resolveApiBaseUrl()).toBe('http://10.0.2.2:3000');
      (Platform as any).OS = 'ios'; // Reset to ios
    });

    it('STRESS-CLIENT-13: falls back to default when EXPO_PUBLIC_API_URL is empty string or only whitespace', () => {
      process.env.EXPO_PUBLIC_API_URL = '';
      (Platform as any).OS = 'ios';
      expect(resolveApiBaseUrl()).toBe('http://localhost:3000');

      process.env.EXPO_PUBLIC_API_URL = '    ';
      expect(resolveApiBaseUrl()).toBe('http://localhost:3000');
    });

    it('STRESS-CLIENT-14: strips multiple trailing slashes from EXPO_PUBLIC_API_URL', () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.elopadel.com///';
      expect(resolveApiBaseUrl()).toBe('https://api.elopadel.com');
    });

    it('STRESS-CLIENT-15: formats relative endpoints correctly with or without leading slash', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.elopadel.com';
      let capturedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        };
      });

      await apiClient.get('api/me');
      expect(capturedUrl).toBe('https://api.elopadel.com/api/me');

      await apiClient.get('/api/me');
      expect(capturedUrl).toBe('https://api.elopadel.com/api/me');
    });

    it('STRESS-CLIENT-16: absolute endpoints bypass resolveApiBaseUrl completely', async () => {
      process.env.EXPO_PUBLIC_API_URL = 'https://api.elopadel.com';
      let capturedUrl = '';

      global.fetch = vi.fn().mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        };
      });

      await apiClient.get('https://custom-gateway.io/v2/stats');
      expect(capturedUrl).toBe('https://custom-gateway.io/v2/stats');
    });

    it('STRESS-CLIENT-17: properly serializes search parameters, encoding special characters and skipping undefined', async () => {
      let capturedUrl = '';
      global.fetch = vi.fn().mockImplementation(async (url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        };
      });

      await apiClient.get('/api/players/search', {
        params: {
          q: 'Lucas & Padel #1',
          city: 'São Paulo',
          active: true,
          limit: 20,
          missing: undefined,
        },
      });

      expect(capturedUrl).toContain('/api/players/search?');
      expect(capturedUrl).toContain('q=Lucas+%26+Padel+%231');
      expect(capturedUrl).toContain('city=S%C3%A3o+Paulo');
      expect(capturedUrl).toContain('active=true');
      expect(capturedUrl).toContain('limit=20');
      expect(capturedUrl).not.toContain('missing');
    });
  });

  // =========================================================================
  // CATEGORY 4: Concurrency & Stress Harnesses
  // =========================================================================
  describe('Category 4: High Concurrency Stress Harness', () => {
    it('STRESS-CLIENT-18: 50 concurrent getStoredToken invocations on cold cache resolve consistently', async () => {
      mockSecureStore.set(AUTH_STORAGE_KEY, 'high_concurrency_token');

      // 50 simultaneous parallel reads
      const promises = Array.from({ length: 50 }, () => getStoredToken());
      const results = await Promise.all(promises);

      results.forEach((token) => {
        expect(token).toBe('high_concurrency_token');
      });
      // SecureStore getItemAsync should have been called
      expect(SecureStore.getItemAsync).toHaveBeenCalled();
    });

    it('STRESS-CLIENT-19: alternating storm of 50 concurrent setStoredToken and clearStoredToken calls settles safely', async () => {
      const ops = Array.from({ length: 50 }, (_, i) => {
        if (i % 2 === 0) {
          return setStoredToken(`token_seq_${i}`);
        } else {
          return clearStoredToken();
        }
      });

      // Settle all without throwing
      await expect(Promise.all(ops)).resolves.not.toThrow();

      // State is deterministic: reads without crashing
      const finalToken = await getStoredToken();
      expect(typeof finalToken === 'string' || finalToken === null).toBe(true);
    });

    it('STRESS-CLIENT-20: 30 concurrent API calls all accurately inject Bearer auth and merge custom headers', async () => {
      await setStoredToken('concurrent_bearer_token');

      const capturedHeadersList: any[] = [];
      global.fetch = vi.fn().mockImplementation(async (_url, options) => {
        capturedHeadersList.push(options.headers);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ ok: true }),
        };
      });

      const calls = Array.from({ length: 30 }, (_, i) =>
        apiClient.get(`/api/endpoint-${i}`, {
          headers: { 'X-Request-Index': String(i) },
        })
      );

      await Promise.all(calls);
      expect(capturedHeadersList.length).toBe(30);

      capturedHeadersList.forEach((headers, index) => {
        expect(headers['Authorization']).toBe('Bearer concurrent_bearer_token');
        expect(headers['Accept']).toBe('application/json');
        expect(headers['X-Request-Index']).toBe(String(index));
      });
    });
  });

  // =========================================================================
  // CATEGORY 5: Backend Contract Simulation Integration
  // =========================================================================
  describe('Category 5: Backend Contract Wire Format Integration', () => {
    it('STRESS-CLIENT-21: simulates full auth lifecycle: login -> authenticated getMe -> 401 revocation', async () => {
      let activeBackendToken: string | null = null;
      const unauthorizedListener = vi.fn();
      const unsub = onUnauthorized(unauthorizedListener);

      // Wire simulated backend
      global.fetch = vi.fn().mockImplementation(async (url: string, options: any) => {
        const parsedUrl = new URL(url);
        const authHeader = options.headers?.['Authorization'] || options.headers?.['authorization'];

        if (parsedUrl.pathname === '/api/auth/social' && options.method === 'POST') {
          activeBackendToken = 'mock_jwt_session_valid_backend';
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ok: true,
              status: 'authenticated',
              token: activeBackendToken,
              user: {
                id: 'u-backend-1',
                handle: '@backend_pro',
                displayName: 'Backend Pro',
                rating: 1250,
                tier: '5ª I',
              },
            }),
          };
        }

        if (parsedUrl.pathname === '/api/me') {
          if (!authHeader || authHeader !== `Bearer ${activeBackendToken}`) {
            return {
              ok: false,
              status: 401,
              headers: new Headers({ 'content-type': 'application/json' }),
              json: async () => ({ error: 'Não autenticado.' }),
            };
          }
          return {
            ok: true,
            status: 200,
            headers: new Headers({ 'content-type': 'application/json' }),
            json: async () => ({
              ok: true,
              player: {
                id: 'u-backend-1',
                handle: '@backend_pro',
                displayName: 'Backend Pro',
                rating: 1250,
                tier: '5ª I',
                totalMatches: 12,
                winRate: 75,
              },
            }),
          };
        }

        return {
          ok: false,
          status: 404,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ error: 'Not found' }),
        };
      });

      // 1. Initial /api/me without token -> throws 401
      await expect(apiClient.get('/api/me')).rejects.toThrow('Não autenticado.');

      // 2. Perform social login
      const loginRes = await apiClient.post('/api/auth/social', {
        provider: 'google',
        idToken: 'valid_google_token',
      });
      expect(loginRes.status).toBe('authenticated');
      expect(loginRes.token).toBe('mock_jwt_session_valid_backend');

      // Persist token in client storage
      await setStoredToken(loginRes.token);
      expect(await getStoredToken()).toBe('mock_jwt_session_valid_backend');

      // 3. Authenticated /api/me succeeds
      const profile = await apiClient.get('/api/me');
      expect(profile.ok).toBe(true);
      expect(profile.player.handle).toBe('@backend_pro');
      expect(profile.player.rating).toBe(1250);

      // 4. Invalidate token on backend (revocation / expiration)
      activeBackendToken = 'new_rotated_secret_invalidating_previous';

      // 5. Subsequent /api/me receives 401 and auto-clears client storage
      await expect(apiClient.get('/api/me')).rejects.toThrow('Não autenticado.');
      expect(await getStoredToken()).toBeNull();
      expect(unauthorizedListener).toHaveBeenCalled();

      unsub();
    });
  });
});
