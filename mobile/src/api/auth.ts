import { apiClient } from './client';
import type {
  CompleteOnboardingData,
  EmailActionResponse,
  EmailAuthResponse,
  EmailRegisterInput,
  EmailRegisterResponse,
  OnboardingPayload,
  PlayerProfile,
  SocialAuthResponse,
} from './types';

export const authApi = {
  /**
   * Authenticate with Google using a native ID token.
   */
  socialLogin: async (payload: { provider: 'google'; idToken: string }): Promise<SocialAuthResponse> => {
    return apiClient.post<SocialAuthResponse>('/api/auth/social', payload);
  },

  /**
   * Submit initial onboarding details for a new social player.
   */
  submitOnboarding: async (
    data: CompleteOnboardingData & { onboardingToken: string }
  ): Promise<{
    ok: true;
    status: 'authenticated';
    token: string;
    user: PlayerProfile;
    player: PlayerProfile;
  }> => {
    return apiClient.post('/api/auth/social/onboarding', data);
  },

  completeOnboarding: async (
    payload: OnboardingPayload
  ): Promise<SocialAuthResponse> => {
    return apiClient.post<SocialAuthResponse>('/api/auth/social/onboarding', payload);
  },

  /**
   * Email + password login. Requires a verified email.
   */
  loginWithEmail: async (email: string, password: string): Promise<EmailAuthResponse> => {
    return apiClient.post<EmailAuthResponse>('/api/auth/email/login', { email, password });
  },

  /**
   * Creates an email/password account after collecting the full player profile.
   * The account becomes usable only after the verification link is opened.
   */
  registerEmail: async (payload: EmailRegisterInput): Promise<EmailRegisterResponse> => {
    return apiClient.post<EmailRegisterResponse>('/api/auth/email/register', payload);
  },

  /**
   * Requests a password reset link. The backend always answers generically.
   */
  requestPasswordReset: async (email: string): Promise<EmailActionResponse> => {
    return apiClient.post<EmailActionResponse>('/api/auth/email/forgot-password', { email });
  },

  /**
   * Fetch current authenticated player's full profile and stats.
   */
  getMe: async (): Promise<{
    ok: true;
    player: PlayerProfile;
    user: PlayerProfile;
  }> => {
    return apiClient.get('/api/me');
  },
};
