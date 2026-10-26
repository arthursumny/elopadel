import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import {
  AuthContext,
  AuthProvider,
  useAuth,
  type AuthContextType,
} from './AuthContext';
import {
  apiClient,
  notifyUnauthorized,
  AUTH_STORAGE_KEY,
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

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => mockStorage.get(key) || null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    mockStorage.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    mockStorage.delete(key);
  }),
}));

// =============================================================================
// Mock Google Sign-In native module
// =============================================================================
const mockGoogleSignInFn = vi.fn();
const mockHasPlayServices = vi.fn().mockResolvedValue(true);

const mockGoogleSigninModule = {
  GoogleSignin: {
    hasPlayServices: () => mockHasPlayServices(),
    signIn: () => mockGoogleSignInFn(),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'ASYNC_OP_IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
};

(globalThis as any).__mockGoogleSignin = mockGoogleSigninModule;

vi.mock('@react-native-google-signin/google-signin', () => mockGoogleSigninModule);

describe('AuthContext & AuthProvider Genuine Unit Test Suite (`AuthContext.tsx`)', () => {
  let capturedAuth: AuthContextType | null = null;
  let root: any = null;
  let container: any = null;

  function Consumer() {
    capturedAuth = useAuth();
    return null;
  }

  async function mountProvider() {
    container = doc.createElement('div');
    root = ReactDOMClient.createRoot(container as any);
    await React.act(async () => {
      root.render(
        React.createElement(AuthProvider, null, React.createElement(Consumer))
      );
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.clear();
    mockGoogleSignInFn.mockReset();
    mockHasPlayServices.mockResolvedValue(true);
    capturedAuth = null;
    root = null;
    container = null;
  });

  afterEach(async () => {
    if (root) {
      await React.act(async () => {
        root.unmount();
      });
      root = null;
    }
  });

  it('TC-AUTH-00: useAuth throws informative error when rendered outside AuthProvider', async () => {
    let capturedError: any = null;

    function Orphan() {
      try {
        useAuth();
      } catch (err) {
        capturedError = err;
      }
      return null;
    }

    const orphanContainer = doc.createElement('div');
    const orphanRoot = ReactDOMClient.createRoot(orphanContainer as any);
    await React.act(async () => {
      orphanRoot.render(React.createElement(Orphan));
    });

    expect(capturedError).toBeDefined();
    expect(capturedError.message).toBe('useAuth deve ser utilizado dentro de um AuthProvider');
    expect(AuthContext).toBeDefined();
  });

  it('TC-AUTH-01: initial state initializes unauthenticated when no stored token exists', async () => {
    await mountProvider();

    expect(capturedAuth).toBeDefined();
    expect(capturedAuth!.isLoading).toBe(false);
    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.user).toBeNull();
    expect(capturedAuth!.token).toBeNull();
    expect(capturedAuth!.needsOnboarding).toBe(false);
  });

  it('TC-AUTH-02: session hydration succeeds when token exists and GET /api/me validates', async () => {
    mockStorage.set(AUTH_STORAGE_KEY, 'stored_jwt_token_123');

    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true,
      player: {
        id: 'user_hydrate_1',
        name: 'Carlos Padel',
        handle: '@carlos_padel',
        elo: 1350,
        tier: '4ª II',
      },
    });

    await mountProvider();

    expect(capturedAuth!.isLoading).toBe(false);
    expect(capturedAuth!.isAuthenticated).toBe(true);
    expect(capturedAuth!.token).toBe('stored_jwt_token_123');
    expect(capturedAuth!.user).toEqual({
      id: 'user_hydrate_1',
      name: 'Carlos Padel',
      handle: '@carlos_padel',
      elo: 1350,
      tier: '4ª II',
    });

    getSpy.mockRestore();
  });

  it('TC-AUTH-03: session hydration purges token when GET /api/me fails or returns null', async () => {
    mockStorage.set(AUTH_STORAGE_KEY, 'expired_stale_token');

    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('401 Unauthorized'));

    await mountProvider();

    expect(capturedAuth!.isLoading).toBe(false);
    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.user).toBeNull();

    getSpy.mockRestore();
  });

  it('TC-AUTH-04: signInWithGoogle transitions state to authenticated when account exists', async () => {
    await mountProvider();

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      status: 'authenticated',
      token: 'jwt_google_user_token',
      user: {
        id: 'u1',
        displayName: 'Lucas Padel',
        handle: '@lucaspadel',
        city: 'São Paulo',
        state: 'SP',
      },
    });
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true,
      user: {
        id: 'u1',
        displayName: 'Lucas Padel',
        handle: '@lucaspadel',
        city: 'São Paulo',
        state: 'SP',
      },
    });

    let result: any;
    await React.act(async () => {
      result = await capturedAuth!.signInWithGoogle('valid_google_id_token');
    });

    expect(result.status).toBe('authenticated');
    expect(capturedAuth!.isAuthenticated).toBe(true);
    expect(capturedAuth!.token).toBe('jwt_google_user_token');
    expect(capturedAuth!.user?.handle).toBe('@lucaspadel');
    expect(mockStorage.get(AUTH_STORAGE_KEY)).toBe('jwt_google_user_token');

    postSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('TC-AUTH-05: signInWithGoogle transitions to needs_onboarding for new social player', async () => {
    await mountProvider();

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      status: 'needs_onboarding',
      onboardingToken: 'onboarding_token_123',
      email: 'novo@gmail.com',
      suggestedName: 'Novo Jogador',
      profile: {
        email: 'novo@gmail.com',
        suggestedName: 'Novo Jogador',
      },
    });

    let result: any;
    await React.act(async () => {
      result = await capturedAuth!.signInWithGoogle('new_player_token');
    });

    expect(result.status).toBe('needs_onboarding');
    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.needsOnboarding).toBe(true);
    expect(capturedAuth!.onboardingToken).toBe('onboarding_token_123');
    expect(capturedAuth!.onboardingProfile?.suggestedName).toBe('Novo Jogador');

    postSpy.mockRestore();
  });

  it('TC-AUTH-06: completeOnboarding sends payload and transitions to authenticated state', async () => {
    await mountProvider();

    // First simulate onboarding state
    const postSocialSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'needs_onboarding',
      onboardingToken: 'onboarding_token_xyz',
      email: 'pedro@padel.com',
      suggestedName: 'Pedro Onboarded',
    });

    await React.act(async () => {
      await capturedAuth!.signInWithGoogle('token_pedro');
    });
    expect(capturedAuth!.needsOnboarding).toBe(true);

    // Now complete onboarding
    const postOnboardingSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      ok: true,
      status: 'authenticated',
      token: 'session_jwt_pedro',
      user: {
        id: 'u2',
        name: 'Pedro Onboarded',
        handle: '@pedro_padel',
        city: 'Curitiba',
        state: 'PR',
      },
    });
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true,
      player: {
        id: 'u2',
        name: 'Pedro Onboarded',
        handle: '@pedro_padel',
        city: 'Curitiba',
        state: 'PR',
      },
    });

    await React.act(async () => {
      await capturedAuth!.completeOnboarding({
        handle: '@pedro_padel',
        name: 'Pedro Onboarded',
        city: 'Curitiba',
        state: 'PR',
        category: '5ª',
      });
    });

    expect(capturedAuth!.isAuthenticated).toBe(true);
    expect(capturedAuth!.needsOnboarding).toBe(false);
    expect(capturedAuth!.token).toBe('session_jwt_pedro');
    expect(capturedAuth!.user?.handle).toBe('@pedro_padel');

    postSocialSpy.mockRestore();
    postOnboardingSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('TC-AUTH-07: loginWithEmail authenticates a verified account and stores the session', async () => {
    await mountProvider();

    const profile = {
      id: 'u3',
      displayName: 'Marcos Email',
      handle: '@marcos_email',
      email: 'marcos@email.com',
      city: 'São Paulo',
      state: 'SP',
    };

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      status: 'authenticated',
      token: 'email_password_token',
      user: profile,
      player: profile,
    });
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true,
      player: profile,
    });

    await React.act(async () => {
      await capturedAuth!.loginWithEmail('marcos@email.com', 'senhaSegura123');
    });

    expect(postSpy).toHaveBeenCalledWith('/api/auth/email/login', {
      email: 'marcos@email.com',
      password: 'senhaSegura123',
    });
    expect(capturedAuth!.isAuthenticated).toBe(true);
    expect(capturedAuth!.token).toBe('email_password_token');
    expect(capturedAuth!.user?.handle).toBe('@marcos_email');
    expect(mockStorage.get(AUTH_STORAGE_KEY)).toBe('email_password_token');

    postSpy.mockRestore();
    getSpy.mockRestore();
  });

  it('TC-AUTH-08: signOut resets state to unauthenticated and deletes stored token', async () => {
    mockStorage.set(AUTH_STORAGE_KEY, 'token_to_purge');
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true,
      player: { id: 'u4', name: 'User Four', handle: '@user4' },
    });

    await mountProvider();
    expect(capturedAuth!.isAuthenticated).toBe(true);

    await React.act(async () => {
      await capturedAuth!.signOut();
    });

    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.token).toBeNull();
    expect(capturedAuth!.user).toBeNull();
    expect(mockStorage.get(AUTH_STORAGE_KEY)).toBeUndefined();

    getSpy.mockRestore();
  });

  it('TC-AUTH-09: 401 unauthorized notification triggers listener and unsubscription on unmount', async () => {
    mockStorage.set(AUTH_STORAGE_KEY, 'token_active');
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      ok: true,
      player: { id: 'u5', name: 'User Five', handle: '@user5' },
    });

    await mountProvider();
    expect(capturedAuth!.isAuthenticated).toBe(true);

    // Trigger 401 broadcast
    await React.act(async () => {
      notifyUnauthorized();
    });

    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.token).toBeNull();
    expect(capturedAuth!.user).toBeNull();

    // Verify unmount cleans up listener
    await React.act(async () => {
      root.unmount();
      root = null;
    });

    // Notify again after unmount - should not throw or cause state update on unmounted component
    expect(() => notifyUnauthorized()).not.toThrow();

    getSpy.mockRestore();
  });

  it('TC-AUTH-10: signInWithGoogle cleanly returns cancelled status on SIGN_IN_CANCELLED without transitioning to onboarding', async () => {
    await mountProvider();

    mockGoogleSignInFn.mockRejectedValueOnce({
      code: 'SIGN_IN_CANCELLED',
      message: 'Sign in was cancelled by user',
    });

    let result: any;
    await React.act(async () => {
      result = await capturedAuth!.signInWithGoogle();
    });

    expect(result.status).toBe('cancelled');
    expect(capturedAuth!.isLoading).toBe(false);
    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.needsOnboarding).toBe(false);
    expect(capturedAuth!.token).toBeNull();
  });

  it('TC-AUTH-11: signInWithGoogle rethrows genuine native errors and never sends mock tokens', async () => {
    await mountProvider();

    const postSpy = vi.spyOn(apiClient, 'post');
    mockGoogleSignInFn.mockRejectedValueOnce({
      code: 'PLAY_SERVICES_NOT_AVAILABLE',
      message: 'Google Play Services not installed',
    });

    let thrownError: any = null;
    await React.act(async () => {
      try {
        await capturedAuth!.signInWithGoogle();
      } catch (err) {
        thrownError = err;
      }
    });

    expect(thrownError).toBeDefined();
    expect(thrownError.code).toBe('PLAY_SERVICES_NOT_AVAILABLE');
    expect(postSpy).not.toHaveBeenCalled();
    expect(capturedAuth!.isLoading).toBe(false);
    expect(capturedAuth!.isAuthenticated).toBe(false);

    postSpy.mockRestore();
  });

  it('TC-AUTH-12: loginWithEmail keeps the player signed out when the email is not verified', async () => {
    await mountProvider();

    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(
      Object.assign(new Error('Confirme seu email antes de entrar.'), { status: 403 })
    );

    let thrownError: any = null;
    await React.act(async () => {
      try {
        await capturedAuth!.loginWithEmail('pendente@email.com', 'senhaSegura123');
      } catch (err) {
        thrownError = err;
      }
    });

    expect(thrownError).toBeDefined();
    expect(thrownError.status).toBe(403);
    expect(capturedAuth!.isLoading).toBe(false);
    expect(capturedAuth!.isAuthenticated).toBe(false);
    expect(capturedAuth!.token).toBeNull();
    expect(mockStorage.get(AUTH_STORAGE_KEY)).toBeUndefined();

    postSpy.mockRestore();
  });

  it('TC-AUTH-13: exposes only Google as social provider and no legacy Apple/OTP actions', async () => {
    await mountProvider();

    expect((capturedAuth as any).signInWithApple).toBeUndefined();
    expect((capturedAuth as any).loginWithOtp).toBeUndefined();
    expect((capturedAuth as any).requestOtp).toBeUndefined();
    expect((capturedAuth as any).verifyOtp).toBeUndefined();
  });
});
