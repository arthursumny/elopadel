import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import {
  apiClient,
  clearStoredToken,
  getStoredToken,
  onUnauthorized,
  setStoredToken,
} from '../api/client';
import type {
  CompleteOnboardingData,
  EmailAuthResponse,
  OnboardingProfileSuggestion,
  PlayerProfile,
  SocialAuthResponse,
} from '../api/types';

const ONBOARDING_TOKEN_STORAGE_KEY = 'elo_onboarding_token';
const ONBOARDING_PROFILE_STORAGE_KEY = 'elo_onboarding_profile';

try {
  WebBrowser.maybeCompleteAuthSession();
} catch {}

function isRunningInExpoGoEnv(): boolean {
  return (
    (Constants as any)?.appOwnership === 'expo' ||
    (Constants as any)?.executionEnvironment === 'storeClient'
  );
}

function getGoogleSigninModule(): any {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__mockGoogleSignin) {
    return (globalThis as any).__mockGoogleSignin;
  }
  if (isRunningInExpoGoEnv()) {
    return null;
  }
  try {
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}

export interface AuthState {
  user: PlayerProfile | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsOnboarding: boolean;
  onboardingToken: string | null;
  onboardingProfile: OnboardingProfileSuggestion | null;
  onboardingDraft?: {
    onboardingToken: string;
    suggestedName?: string;
    email?: string;
    avatarUrl?: string;
  } | null;
}

export function extractQueryParamsFromUrl(rawUrl: string): Record<string, string> {
  if (!rawUrl || typeof rawUrl !== 'string') return {};
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex === -1) return {};
  const queryStr = rawUrl.slice(queryIndex + 1).split('#')[0];
  const params: Record<string, string> = {};
  for (const part of queryStr.split('&')) {
    if (!part) continue;
    const [rawKey, ...rest] = part.split('=');
    const rawVal = rest.join('=');
    if (rawKey) {
      let key = rawKey;
      let val = rawVal || '';
      try {
        key = decodeURIComponent(rawKey);
      } catch {}
      try {
        val = decodeURIComponent(rawVal || '');
      } catch {}
      params[key] = val;
    }
  }
  return params;
}

export interface AuthContextType extends AuthState {
  signInWithGoogle: (idToken?: string) => Promise<{ status: 'authenticated' | 'needs_onboarding' | 'cancelled' }>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  completeOnboarding: (data: CompleteOnboardingData) => Promise<void>;
  processAuthCallback: (
    input: string | { token?: string; onboardingToken?: string; name?: string; email?: string }
  ) => Promise<{ status: 'authenticated' | 'needs_onboarding' | 'ignored' }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
    isAuthenticated: false,
    needsOnboarding: false,
    onboardingToken: null,
    onboardingProfile: null,
    onboardingDraft: null,
  });

  /**
   * Refreshes the full player profile from GET /api/me.
   */
  const refreshProfile = useCallback(async () => {
    try {
      const response = await apiClient.get<{
        ok: boolean;
        player?: PlayerProfile;
        user?: PlayerProfile;
      }>('/api/me');

      const profile = response.player || response.user;
      if (profile) {
        setState((prev) => ({
          ...prev,
          user: profile,
          isAuthenticated: true,
        }));
      }
    } catch (error) {
      console.warn('[AuthContext] Failed to refresh profile:', error);
    }
  }, []);

  const refreshUser = refreshProfile;

  /**
   * Action: Process incoming Auth Callback (from Deep Link, Expo Router or WebBrowser)
   */
  const processAuthCallback = useCallback(
    async (
      input: string | { token?: string; onboardingToken?: string; name?: string; email?: string }
    ): Promise<{ status: 'authenticated' | 'needs_onboarding' | 'ignored' }> => {
      let token: string | null = null;
      let onboardingToken: string | null = null;
      let name: string | undefined = undefined;
      let email: string | undefined = undefined;

      if (typeof input === 'string') {
        const queryParams = extractQueryParamsFromUrl(input);
        token = queryParams.token || null;
        onboardingToken = queryParams.onboardingToken || null;
        name = queryParams.name || undefined;
        email = queryParams.email || undefined;
      } else if (input && typeof input === 'object') {
        token = input.token || null;
        onboardingToken = input.onboardingToken || null;
        name = input.name || undefined;
        email = input.email || undefined;
      }

      if (token) {
        await setStoredToken(token);
        await SecureStore.deleteItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => {});
        const meRes = await apiClient.get<PlayerProfile>('/api/me').catch(() => null);

        setState({
          user: meRes,
          token,
          isLoading: false,
          isAuthenticated: true,
          needsOnboarding: false,
          onboardingToken: null,
          onboardingProfile: null,
          onboardingDraft: null,
        });
        refreshProfile();
        return { status: 'authenticated' };
      }

      if (onboardingToken) {
        const onboardingProfile: OnboardingProfileSuggestion = {
          email,
          suggestedName: name,
        };
        const draft = {
          onboardingToken,
          suggestedName: name,
          email,
        };

        await SecureStore.setItemAsync(ONBOARDING_TOKEN_STORAGE_KEY, onboardingToken).catch(() => {});
        await SecureStore.setItemAsync(ONBOARDING_PROFILE_STORAGE_KEY, JSON.stringify(onboardingProfile)).catch(() => {});

        setState((prev) => ({
          ...prev,
          isLoading: false,
          isAuthenticated: false,
          needsOnboarding: true,
          onboardingToken,
          onboardingProfile,
          onboardingDraft: draft,
        }));
        return { status: 'needs_onboarding' };
      }

      return { status: 'ignored' };
    },
    [refreshProfile]
  );

  /**
   * Bootstrap lifecycle: Checks SecureStore for an existing token on mount.
   */
  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const storedToken = await getStoredToken();
        if (!storedToken) {
          const storedOnboarding = await SecureStore.getItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => null);
          const storedProfileJson = await SecureStore.getItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => null);
          let storedProfile: OnboardingProfileSuggestion | null = null;
          if (storedProfileJson) {
            try {
              storedProfile = JSON.parse(storedProfileJson);
            } catch {}
          }

          if (isMounted) {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              needsOnboarding: Boolean(storedOnboarding),
              onboardingToken: storedOnboarding,
              onboardingProfile: storedProfile,
              onboardingDraft: storedOnboarding
                ? {
                    onboardingToken: storedOnboarding,
                    suggestedName: storedProfile?.suggestedName,
                    email: storedProfile?.email,
                  }
                : null,
            }));
          }
          return;
        }

        // Validate token by fetching current player profile
        const response = await apiClient.get<{
          ok: boolean;
          player?: PlayerProfile;
          user?: PlayerProfile;
        }>('/api/me');

        const profile = response.player || response.user;

        if (isMounted) {
          if (profile) {
            setState({
              user: profile,
              token: storedToken,
              isLoading: false,
              isAuthenticated: true,
              needsOnboarding: false,
              onboardingToken: null,
              onboardingProfile: null,
              onboardingDraft: null,
            });
          } else {
            await clearStoredToken();
            setState({
              user: null,
              token: null,
              isLoading: false,
              isAuthenticated: false,
              needsOnboarding: false,
              onboardingToken: null,
              onboardingProfile: null,
              onboardingDraft: null,
            });
          }
        }
      } catch (error) {
        if (isMounted) {
          setState((prev) => ({ ...prev, isLoading: false }));
        }
      }
    }

    bootstrap();

    const handleDeepLink = async (url: string | null) => {
      if (!url || !isMounted) return;
      try {
        await processAuthCallback(url);
      } catch (err) {
        console.warn('[AuthContext] Erro ao processar deep link:', err);
      }
    };

    const linkSub =
      typeof Linking?.addEventListener === 'function'
        ? Linking.addEventListener('url', (event) => handleDeepLink(event?.url))
        : null;

    if (typeof Linking?.getInitialURL === 'function') {
      try {
        const initialPromise = Linking.getInitialURL();
        if (initialPromise && typeof initialPromise.then === 'function') {
          initialPromise.then(handleDeepLink).catch(() => {});
        }
      } catch {}
    }

    // Listen to 401 unauthorized notifications from client.ts
    const unsubscribe = onUnauthorized(() => {
      if (isMounted) {
        setState({
          user: null,
          token: null,
          isLoading: false,
          isAuthenticated: false,
          needsOnboarding: false,
          onboardingToken: null,
          onboardingProfile: null,
          onboardingDraft: null,
        });
      }
    });

    return () => {
      isMounted = false;
      linkSub?.remove?.();
      unsubscribe();
    };
  }, [processAuthCallback, refreshProfile]);

  /**
   * Action: Sign In with Google
   */
  const signInWithGoogle = useCallback(
    async (explicitIdToken?: string): Promise<{ status: 'authenticated' | 'needs_onboarding' | 'cancelled' }> => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        let tokenToUse = explicitIdToken;

        if (!tokenToUse) {
          const googleModule = getGoogleSigninModule();
          if (googleModule) {
            const GoogleSignin =
              googleModule.GoogleSignin || googleModule.default?.GoogleSignin || googleModule;
            const statusCodes = googleModule.statusCodes || googleModule.default?.statusCodes;

            try {
              await GoogleSignin.hasPlayServices();
              const response = await GoogleSignin.signIn();
              tokenToUse = response.data?.idToken || response.idToken;
            } catch (nativeErr: any) {
              if (
                nativeErr?.code === 'SIGN_IN_CANCELLED' ||
                (statusCodes && nativeErr?.code === statusCodes.SIGN_IN_CANCELLED) ||
                nativeErr?.code === '12501' ||
                nativeErr?.message?.includes('cancel')
              ) {
                setState((prev) => ({ ...prev, isLoading: false }));
                return { status: 'cancelled' };
              }
              setState((prev) => ({ ...prev, isLoading: false }));
              throw nativeErr;
            }
          } else {
            // Browser fallback for Expo Go. The only credential path is the
            // deep-link callback from the web login page; no ticket exchange.
            const redirectUrl = Linking.createURL('auth-callback');
            const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://elopadel.avaliacoes.tech';
            const authUrl = `${baseUrl}/login?mobile=1&redirect_uri=${encodeURIComponent(redirectUrl)}`;

            try {
              const authResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);
              if (authResult.type === 'success' && authResult.url) {
                const res = await processAuthCallback(authResult.url);
                if (res.status === 'authenticated' || res.status === 'needs_onboarding') {
                  return { status: res.status };
                }
              }
            } catch {}

            // On some Android devices the browser is dismissed during the
            // custom-scheme handoff. Give the global Linking listener a short
            // grace period to persist the session, without network polling.
            for (let attempt = 0; attempt < 10; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 400));
              if (await getStoredToken()) return { status: 'authenticated' };
              const storedOnboarding = await SecureStore.getItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => null);
              if (storedOnboarding) return { status: 'needs_onboarding' };
            }

            setState((prev) => ({ ...prev, isLoading: false }));
            return { status: 'cancelled' };
          }
        }

        if (!tokenToUse) {
          setState((prev) => ({ ...prev, isLoading: false }));
          throw new Error('Não foi possível obter o token do Google.');
        }

        const response = await apiClient.post<SocialAuthResponse>('/api/auth/social', {
          provider: 'google',
          idToken: tokenToUse,
        });

        if (response.status === 'authenticated') {
          await setStoredToken(response.token);
          await SecureStore.deleteItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => {});
          await SecureStore.deleteItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => {});
          const userProfile = response.user || response.player || null;

          setState({
            user: userProfile,
            token: response.token,
            isLoading: false,
            isAuthenticated: true,
            needsOnboarding: false,
            onboardingToken: null,
            onboardingProfile: null,
            onboardingDraft: null,
          });

          refreshProfile();
          return { status: 'authenticated' };
        } else {
          const onboardingProfile: OnboardingProfileSuggestion = response.profile || {
            email: response.email,
            suggestedName: response.suggestedName || response.name,
          };

          const draft = {
            onboardingToken: response.onboardingToken,
            suggestedName: response.suggestedName || response.name || onboardingProfile.suggestedName,
            email: response.email || onboardingProfile.email,
            avatarUrl: onboardingProfile.avatarUrl,
          };

          await SecureStore.setItemAsync(ONBOARDING_TOKEN_STORAGE_KEY, response.onboardingToken).catch(() => {});
          await SecureStore.setItemAsync(ONBOARDING_PROFILE_STORAGE_KEY, JSON.stringify(onboardingProfile)).catch(() => {});

          setState((prev) => ({
            ...prev,
            isLoading: false,
            isAuthenticated: false,
            needsOnboarding: true,
            onboardingToken: response.onboardingToken,
            onboardingProfile,
            onboardingDraft: draft,
          }));

          return { status: 'needs_onboarding' };
        }
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    [refreshProfile]
  );

  /**
   * Action: Email + password login for verified accounts.
   */
  const loginWithEmail = useCallback(
    async (email: string, password: string): Promise<void> => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const response = await apiClient.post<EmailAuthResponse>('/api/auth/email/login', {
          email: email.trim(),
          password,
        });

        await setStoredToken(response.token);
        await SecureStore.deleteItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => {});

        setState({
          user: response.user || response.player || null,
          token: response.token,
          isLoading: false,
          isAuthenticated: true,
          needsOnboarding: false,
          onboardingToken: null,
          onboardingProfile: null,
          onboardingDraft: null,
        });

        refreshProfile();
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    [refreshProfile]
  );

  /**
   * Action: Complete Onboarding for new social player
   */
  const completeOnboarding = useCallback(
    async (data: CompleteOnboardingData): Promise<void> => {
      let activeToken = state.onboardingToken || state.onboardingDraft?.onboardingToken || undefined;
      if (!activeToken) {
        activeToken = (await SecureStore.getItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => null)) || undefined;
      }
      if (!activeToken) {
        throw new Error('Sessão de onboarding não encontrada ou expirada. Faça login novamente.');
      }

      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const response = await apiClient.post<{
          ok: boolean;
          status: string;
          token: string;
          user: PlayerProfile;
          player: PlayerProfile;
        }>('/api/auth/social/onboarding', {
          onboardingToken: activeToken,
          handle: data.handle,
          name: data.name,
          city: data.city,
          state: data.state,
          category: data.category,
          country: data.country || 'Brasil',
          clubId: data.clubId,
        });

        await setStoredToken(response.token);
        await SecureStore.deleteItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => {});
        await SecureStore.deleteItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => {});
        const userProfile = response.user || response.player;

        setState({
          user: userProfile,
          token: response.token,
          isLoading: false,
          isAuthenticated: true,
          needsOnboarding: false,
          onboardingToken: null,
          onboardingProfile: null,
          onboardingDraft: null,
        });

        refreshProfile();
      } catch (error) {
        setState((prev) => ({ ...prev, isLoading: false }));
        throw error;
      }
    },
    [state.onboardingToken, state.onboardingDraft, refreshProfile]
  );

  /**
   * Action: Sign Out
   */
  const signOut = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      await clearStoredToken();
      await SecureStore.deleteItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => {});
    } finally {
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        needsOnboarding: false,
        onboardingToken: null,
        onboardingProfile: null,
        onboardingDraft: null,
      });
    }
  }, []);

  /**
   * Action: Delete Account (Required by app stores)
   */
  const deleteAccount = useCallback(async (): Promise<void> => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      await apiClient.delete('/api/me').catch(() => {});
      await clearStoredToken();
      await SecureStore.deleteItemAsync(ONBOARDING_TOKEN_STORAGE_KEY).catch(() => {});
      await SecureStore.deleteItemAsync(ONBOARDING_PROFILE_STORAGE_KEY).catch(() => {});
    } finally {
      setState({
        user: null,
        token: null,
        isLoading: false,
        isAuthenticated: false,
        needsOnboarding: false,
        onboardingToken: null,
        onboardingProfile: null,
        onboardingDraft: null,
      });
    }
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      ...state,
      signInWithGoogle,
      loginWithEmail,
      completeOnboarding,
      processAuthCallback,
      signOut,
      deleteAccount,
      refreshProfile,
      refreshUser,
    }),
    [state, signInWithGoogle, loginWithEmail, completeOnboarding, processAuthCallback, signOut, deleteAccount, refreshProfile, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

/**
 * Hook to access AuthContext.
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
}
