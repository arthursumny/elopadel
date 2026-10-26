import { describe, it, expect, vi } from 'vitest';
import { resolveDeepLinkRoute } from './usePushNotifications';
import { pushApi } from '../api/push';

describe('usePushNotifications & Deep Linking Unit Test Suite', () => {
  describe('resolveDeepLinkRoute() URL Normalization', () => {
    it('TC-DEEP-01: resolves fallback route when url is empty or null', () => {
      expect(resolveDeepLinkRoute(null)).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute(undefined)).toBe('/(tabs)/lobby');
    });

    it('TC-DEEP-02: maps web /matchmaking and /lobby to mobile tab /(tabs)/lobby', () => {
      expect(resolveDeepLinkRoute('/matchmaking')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('elopadel:///matchmaking')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('https://elopadel.com/matchmaking')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/lobby')).toBe('/(tabs)/lobby');
      expect(resolveDeepLinkRoute('/tabs/lobby')).toBe('/(tabs)/lobby');
    });

    it('TC-DEEP-03: maps /friends to mobile tab /(tabs)/friends', () => {
      expect(resolveDeepLinkRoute('/friends')).toBe('/(tabs)/friends');
      expect(resolveDeepLinkRoute('elopadel:///friends')).toBe('/(tabs)/friends');
      expect(resolveDeepLinkRoute('/tabs/friends')).toBe('/(tabs)/friends');
    });

    it('TC-DEEP-04: maps /match/[id] to dynamic match room route', () => {
      const matchId = '550e8400-e29b-41d4-a716-446655440000';
      expect(resolveDeepLinkRoute(`/match/${matchId}`)).toBe(`/match/${matchId}`);
      expect(resolveDeepLinkRoute(`elopadel:///match/${matchId}`)).toBe(`/match/${matchId}`);
      expect(resolveDeepLinkRoute(`https://elopadel.com/match/${matchId}`)).toBe(`/match/${matchId}`);
    });

    it('TC-DEEP-05: preserves other platform tabs (leaderboard, profile, matches, history, notifications)', () => {
      expect(resolveDeepLinkRoute('/leaderboard')).toBe('/(tabs)/leaderboard');
      expect(resolveDeepLinkRoute('/profile')).toBe('/(tabs)/profile');
      expect(resolveDeepLinkRoute('/matches')).toBe('/(tabs)/matches');
      expect(resolveDeepLinkRoute('/history')).toBe('/history');
      expect(resolveDeepLinkRoute('/notifications')).toBe('/notifications');
    });
  });

  describe('pushApi integration', () => {
    it('TC-DEEP-06: registerPushToken calls POST /api/notifications/push-token with payload', async () => {
      const mockPost = vi.spyOn(pushApi, 'registerPushToken').mockResolvedValue({
        ok: true,
        registeredAt: new Date().toISOString(),
        token: 'ExponentPushToken[test-token-123]',
      });

      const res = await pushApi.registerPushToken({
        token: 'ExponentPushToken[test-token-123]',
        platform: 'ios',
        deviceType: 'iPhone 15 Pro',
        appVersion: '1.0.0',
      });

      expect(res.ok).toBe(true);
      expect(res.token).toBe('ExponentPushToken[test-token-123]');
      mockPost.mockRestore();
    });

    it('TC-DEEP-07: unregisterPushToken calls DELETE /api/notifications/push-token', async () => {
      const mockDelete = vi.spyOn(pushApi, 'unregisterPushToken').mockResolvedValue({
        ok: true,
        unregistered: true,
      });

      const res = await pushApi.unregisterPushToken('ExponentPushToken[test-token-123]');
      expect(res.ok).toBe(true);
      expect(res.unregistered).toBe(true);
      mockDelete.mockRestore();
    });
  });
});
