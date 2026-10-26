import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import * as SecureStore from 'expo-secure-store';
import {
  AuthProvider,
  useAuth,
  type AuthContextType,
} from './AuthContext';
import {
  apiClient,
  clearStoredToken,
  setStoredToken,
  getStoredToken,
  notifyUnauthorized,
  AUTH_STORAGE_KEY,
  ApiError,
} from '../api/client';

// =============================================================================
// Lightweight Headless DOM Mock for React 18 in Vitest Node Environment
// =============================================================================
(globalThis as any).HTMLIFrameElement = class {};
(globalThis as any).HTMLInputElement = class {};
(globalThis as any).HTMLTextAreaElement = class {};
(globalThis as any).HTMLElement = class {};

const makeNode = (name = 'div') => ({
  nodeType: 1,
  nodeName: name.toUpperCase(),
  tagName: name.toUpperCase(),
  setAttribute: () => {},
  getAttribute: () => null,
  addEventListener: () => {},
  removeEventListener: () => {},
  appendChild: (child: any) => child,
  removeChild: (child: any) => child,
  insertBefore: (child: any) => child,
  childNodes: [] as any[],
  style: {},
  ownerDocument: null,
});

const doc = {
  nodeType: 9,
  nodeName: '#document',
  createElement: (tag: string) => makeNode(tag),
  createTextNode: () => ({ nodeType: 3, nodeName: '#text', nodeValue: '' }),
  createComment: () => ({ nodeType: 8, nodeName: '#comment' }),
  documentElement: makeNode('html'),
  head: makeNode('head'),
  body: makeNode('body'),
  activeElement: null,
};

(globalThis as any).document = doc;
(globalThis as any).window = globalThis;
(globalThis as any).Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, COMMENT_NODE: 8, DOCUMENT_NODE: 9 };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// Mock expo-secure-store
// =============================================================================
const mockStorage = new Map<string, string>();
let storageShouldThrow = false;

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => {
    if (storageShouldThrow) throw new Error('SecureStore disk failure');
    return mockStorage.get(key) || null;
  }),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    if (storageShouldThrow) throw new Error('SecureStore disk failure');
    mockStorage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    if (storageShouldThrow) throw new Error('SecureStore disk failure');
    mockStorage.delete(key);
  }),
}));

describe('Empirical Adversarial Stress Tests: Mobile AuthContext State Machine', () => {
  let capturedAuth: AuthContextType | null = null;
  let root: any = null;
  let container: any = null;
  let getMock: any = null;

  function Consumer() {
    capturedAuth = useAuth();
    return null;
  }

  async function mountProvider() {
    container = doc.createElement('div');
    root = ReactDOMClient.createRoot(container);
    await React.act(async () => {
      root.render(
        React.createElement(AuthProvider, null, React.createElement(Consumer))
      );
    });
  }

  async function unmountProvider() {
    if (root) {
      await React.act(async () => {
        root.unmount();
      });
      root = null;
      container = null;
    }
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.clear();
    storageShouldThrow = false;
    capturedAuth = null;
    await clearStoredToken();

    // Default mock for apiClient.get('/api/me') to ensure hermetic tests
    getMock = vi.spyOn(apiClient, 'get').mockImplementation(async (endpoint: string) => {
      if (endpoint === '/api/me') {
        const token = await getStoredToken();
        if (!token) {
          throw new ApiError('Não autenticado.', 401);
        }
        return {
          ok: true,
          player: {
            id: 'u-default',
            handle: '@default_player',
            displayName: 'Default Player',
            rating: 1200,
            tier: '5ª I',
          },
        };
      }
      return { ok: true };
    });
  });

  afterEach(async () => {
    await unmountProvider();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CATEGORY 1: Bootstrap Lifecycle & Storage Failure Modes
  // =========================================================================
  describe('Category 1: Bootstrap Lifecycle & Storage Failure Modes', () => {
    it('STRESS-AUTH-01: mounts cleanly with no stored token -> unauthenticated and not loading', async () => {
      await mountProvider();

      expect(capturedAuth).not.toBeNull();
      expect(capturedAuth?.isLoading).toBe(false);
      expect(capturedAuth?.isAuthenticated).toBe(false);
      expect(capturedAuth?.user).toBeNull();
      expect(capturedAuth?.token).toBeNull();
      expect(capturedAuth?.needsOnboarding).toBe(false);
    });

    it('STRESS-AUTH-02: mounts with valid stored token -> verifies with /api/me and hydrates profile', async () => {
      await setStoredToken('valid_bootstrap_jwt');

      getMock.mockResolvedValue({
        ok: true,
        player: {
          id: 'u-boot-1',
          handle: '@pedro_padel',
          displayName: 'Pedro Padel',
          city: 'São Paulo',
          state: 'SP',
          rating: 1400,
          tier: '4ª II',
        },
      });

      await mountProvider();

      expect(capturedAuth?.isLoading).toBe(false);
      expect(capturedAuth?.isAuthenticated).toBe(true);
      expect(capturedAuth?.token).toBe('valid_bootstrap_jwt');
      expect(capturedAuth?.user?.handle).toBe('@pedro_padel');
    });

    it('STRESS-AUTH-03: mounts with expired stored token -> 401 response purges token and resets state', async () => {
      await setStoredToken('expired_bootstrap_jwt');

      getMock.mockRejectedValue(
        new ApiError('Sessão expirada. Faça login novamente.', 401)
      );

      await mountProvider();

      expect(capturedAuth?.isLoading).toBe(false);
      expect(capturedAuth?.isAuthenticated).toBe(false);
      expect(capturedAuth?.user).toBeNull();
      expect(capturedAuth?.token).toBeNull();
    });

    it('STRESS-AUTH-04: mounts when SecureStore throws hardware exception -> catches safely', async () => {
      storageShouldThrow = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await mountProvider();

      expect(capturedAuth?.isLoading).toBe(false);
      expect(capturedAuth?.isAuthenticated).toBe(false);
      warnSpy.mockRestore();
    });

    it('STRESS-AUTH-05: mounts when /api/me fails due to network outage (offline) -> does NOT purge token', async () => {
      await setStoredToken('persisted_token_offline');

      // Network error (not a 401)
      getMock.mockRejectedValue(
        new ApiError('Não foi possível conectar ao servidor.', 0, null, true)
      );

      await mountProvider();

      expect(capturedAuth?.isLoading).toBe(false);
      expect(capturedAuth?.isAuthenticated).toBe(false);
      // SecureStore token remains intact so the user can re-verify when connection restores
      expect(await getStoredToken()).toBe('persisted_token_offline');
    });
  });

  // =========================================================================
  // CATEGORY 2: Active 401 Interception & Sign-out Event Dispatch
  // =========================================================================
  describe('Category 2: Runtime 401 Interception', () => {
    it('STRESS-AUTH-06: runtime 401 notification immediately resets state to unauthenticated', async () => {
      await setStoredToken('logged_in_token');
      getMock.mockResolvedValue({
        ok: true,
        player: { id: 'u-1', handle: '@player1', displayName: 'Player 1' },
      });

      await mountProvider();
      expect(capturedAuth?.isAuthenticated).toBe(true);

      // Trigger 401 notification from background API call
      await React.act(async () => {
        notifyUnauthorized();
      });

      expect(capturedAuth?.isAuthenticated).toBe(false);
      expect(capturedAuth?.user).toBeNull();
      expect(capturedAuth?.token).toBeNull();
    });

    it('STRESS-AUTH-07: unmounting AuthProvider unsubscribes from onUnauthorized (no memory leaks)', async () => {
      await mountProvider();
      await unmountProvider();

      // notifyUnauthorized after unmount should not throw or attempt state update on unmounted component
      expect(() => notifyUnauthorized()).not.toThrow();
    });
  });

  // =========================================================================
  // CATEGORY 3: Concurrency, Double-Submissions & Race Conditions
  // =========================================================================
  describe('Category 3: Concurrency & State Machine Race Conditions', () => {
    it('STRESS-AUTH-08: rapid concurrent signInWithGoogle calls settle cleanly', async () => {
      await mountProvider();

      vi.spyOn(apiClient, 'post').mockResolvedValue({
        ok: true,
        status: 'authenticated',
        token: 'concurrent_google_jwt',
        user: { id: 'u-google', handle: '@google_user', displayName: 'Google User' },
      });

      let res1: any;
      let res2: any;
      await React.act(async () => {
        [res1, res2] = await Promise.all([
          capturedAuth!.signInWithGoogle('google_id_token_1'),
          capturedAuth!.signInWithGoogle('google_id_token_2'),
        ]);
      });

      expect(res1.status).toBe('authenticated');
      expect(res2.status).toBe('authenticated');
      expect(capturedAuth?.isAuthenticated).toBe(true);
      expect(capturedAuth?.token).toBe('concurrent_google_jwt');
    });

    it('STRESS-AUTH-09: explicit signOut purges token and resets all state variables', async () => {
      await setStoredToken('active_token');
      getMock.mockResolvedValue({
        ok: true,
        player: { id: 'u-signout', handle: '@signout_user', displayName: 'Signout' },
      });
      await mountProvider();
      expect(capturedAuth?.isAuthenticated).toBe(true);

      await React.act(async () => {
        await capturedAuth!.signOut();
      });

      expect(capturedAuth?.isAuthenticated).toBe(false);
      expect(capturedAuth?.user).toBeNull();
      expect(capturedAuth?.token).toBeNull();
      expect(capturedAuth?.isLoading).toBe(false);
      expect(await getStoredToken()).toBeNull();
    });

    it('STRESS-AUTH-10: loginWithEmail sets the session for a verified email account', async () => {
      await mountProvider();

      const emailPlayer = {
        id: 'u-email-verified',
        handle: '@email_player',
        displayName: 'Email Player',
        email: 'player@email.com',
      };

      vi.spyOn(apiClient, 'post').mockResolvedValue({
        ok: true,
        status: 'authenticated',
        token: 'email_verified_token',
        user: emailPlayer,
        player: emailPlayer,
      });

      getMock.mockResolvedValue({
        ok: true,
        player: emailPlayer,
      });

      await React.act(async () => {
        await capturedAuth!.loginWithEmail('player@email.com', 'senhaSegura123');
      });

      expect(capturedAuth?.isAuthenticated).toBe(true);
      expect(capturedAuth?.token).toBe('email_verified_token');
      expect(capturedAuth?.user?.handle).toBe('@email_player');
    });
  });

  // =========================================================================
  // CATEGORY 4: Onboarding State Machine & Boundary Validations
  // =========================================================================
  describe('Category 4: Onboarding State Machine & Validation Constraints', () => {
    it('STRESS-AUTH-11: new social user transitions to needsOnboarding with draft profile', async () => {
      await mountProvider();

      vi.spyOn(apiClient, 'post').mockResolvedValue({
        ok: true,
        status: 'needs_onboarding',
        onboardingToken: 'onb_token_new_user',
        email: 'newuser@gmail.com',
        name: 'New Player',
        suggestedName: 'New Player',
        profile: {
          email: 'newuser@gmail.com',
          suggestedName: 'New Player',
          avatarUrl: 'https://images.com/photo.jpg',
        },
      });

      let res: any;
      await React.act(async () => {
        res = await capturedAuth!.signInWithGoogle('new_social_id_token');
      });

      expect(res.status).toBe('needs_onboarding');
      expect(capturedAuth?.isAuthenticated).toBe(false);
      expect(capturedAuth?.needsOnboarding).toBe(true);
      expect(capturedAuth?.onboardingToken).toBe('onb_token_new_user');
      expect(capturedAuth?.onboardingDraft?.suggestedName).toBe('New Player');
      expect(capturedAuth?.onboardingDraft?.avatarUrl).toBe('https://images.com/photo.jpg');
    });

    it('STRESS-AUTH-12: completeOnboarding throws error if called without active onboarding session', async () => {
      await mountProvider();

      // No onboarding token in state
      expect(capturedAuth?.onboardingToken).toBeNull();

      await expect(
        capturedAuth!.completeOnboarding({
          handle: '@fresh_handle',
          name: 'Fresh Player',
          city: 'Curitiba',
          state: 'PR',
          category: '5ª',
        })
      ).rejects.toThrow('Sessão de onboarding não encontrada ou expirada.');
    });

    it('STRESS-AUTH-13: completeOnboarding succeeds and elevates state to authenticated', async () => {
      await mountProvider();

      // First transition to needs_onboarding
      vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        ok: true,
        status: 'needs_onboarding',
        onboardingToken: 'valid_onb_token',
        name: 'Carlos Onboard',
        email: 'carlos@padel.com',
      });

      await React.act(async () => {
        await capturedAuth!.signInWithGoogle('google_token');
      });

      expect(capturedAuth?.needsOnboarding).toBe(true);

      const carlosProfile = {
        id: 'u-carlos-123',
        handle: '@carlos_padel',
        displayName: 'Carlos Onboard',
        city: 'Porto Alegre',
        state: 'RS',
        category: '4ª',
        rating: 1200,
        tier: '5ª I',
      };

      // Now complete onboarding
      vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
        ok: true,
        status: 'authenticated',
        token: 'new_player_authenticated_session',
        user: carlosProfile,
      });

      getMock.mockResolvedValue({
        ok: true,
        player: carlosProfile,
      });

      await React.act(async () => {
        await capturedAuth!.completeOnboarding({
          handle: '@carlos_padel',
          name: 'Carlos Onboard',
          city: 'Porto Alegre',
          state: 'RS',
          category: '4ª',
        });
      });

      expect(capturedAuth?.isAuthenticated).toBe(true);
      expect(capturedAuth?.needsOnboarding).toBe(false);
      expect(capturedAuth?.token).toBe('new_player_authenticated_session');
      expect(capturedAuth?.user?.handle).toBe('@carlos_padel');
    });
  });

  // =========================================================================
  // CATEGORY 5: Profile Refresh Under Boundary & Error Conditions
  // =========================================================================
  describe('Category 5: Profile Refresh Boundary Conditions', () => {
    it('STRESS-AUTH-14: refreshProfile updates state.user with latest stats from /api/me', async () => {
      await setStoredToken('user_token');
      getMock.mockResolvedValueOnce({
        ok: true,
        player: { id: 'u-stats', handle: '@pro_stats', displayName: 'Pro', rating: 1000 },
      });

      await mountProvider();
      expect(capturedAuth?.user?.rating).toBe(1000);

      // Next /api/me returns updated rating and matches
      getMock.mockResolvedValueOnce({
        ok: true,
        player: { id: 'u-stats', handle: '@pro_stats', displayName: 'Pro', rating: 1050, matches: 5 },
      });

      await React.act(async () => {
        await capturedAuth!.refreshProfile();
      });

      expect(capturedAuth?.user?.rating).toBe(1050);
    });

    it('STRESS-AUTH-15: refreshProfile catches network errors gracefully without crashing or logging out', async () => {
      await setStoredToken('user_token');
      getMock.mockResolvedValueOnce({
        ok: true,
        player: { id: 'u-safe', handle: '@safe_player', displayName: 'Safe' },
      });

      await mountProvider();
      expect(capturedAuth?.isAuthenticated).toBe(true);

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      getMock.mockRejectedValueOnce(new Error('Network timeout'));

      await React.act(async () => {
        await capturedAuth!.refreshProfile();
      });

      // User remains authenticated despite refresh failure
      expect(capturedAuth?.isAuthenticated).toBe(true);
      expect(capturedAuth?.user?.handle).toBe('@safe_player');
      expect(warnSpy).toHaveBeenCalledWith(
        '[AuthContext] Failed to refresh profile:',
        expect.any(Error)
      );
      warnSpy.mockRestore();
    });
  });
});
