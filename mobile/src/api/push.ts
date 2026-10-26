import { apiClient } from './client';
import type { PushTokenRegistrationPayload } from './types';

export const pushApi = {
  /**
   * Register or update push token idempotently on the backend.
   */
  registerPushToken: async (
    payload: PushTokenRegistrationPayload
  ): Promise<{ ok: boolean; registeredAt: string; token: string }> => {
    return apiClient.post<{ ok: boolean; registeredAt: string; token: string }>(
      '/api/notifications/push-token',
      payload
    );
  },

  /**
   * Deactivate device push token on logout.
   */
  unregisterPushToken: async (
    token: string
  ): Promise<{ ok: boolean; unregistered: boolean }> => {
    return apiClient.delete<{ ok: boolean; unregistered: boolean }>(
      `/api/notifications/push-token?token=${encodeURIComponent(token)}`
    );
  },
};
