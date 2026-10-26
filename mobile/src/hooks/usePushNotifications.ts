import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import type * as NotificationsType from 'expo-notifications';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { pushApi } from '../api/push';

let _notificationsModule: typeof import('expo-notifications') | null | undefined = undefined;
let _handlerConfigured = false;

/**
 * Retorna o módulo expo-notifications de forma segura.
 * No Android dentro do Expo Go (SDK 53+), o pacote expo-notifications lança um erro
 * fatal ao ser carregado/executado. Detectamos esse ambiente para evitar crash do app.
 */
function getNotificationsModule(): typeof import('expo-notifications') | null {
  if (_notificationsModule !== undefined) {
    return _notificationsModule;
  }

  const isExpoGo =
    (Constants as any)?.appOwnership === 'expo' ||
    (Constants as any)?.executionEnvironment === 'storeClient';

  if (Platform.OS === 'android' && isExpoGo) {
    console.warn(
      '[Push] Notificações push não são suportadas no Expo Go no Android (SDK 53+). Utilize uma development build para push nativo.'
    );
    _notificationsModule = null;
    return null;
  }

  try {
    const mod = require('expo-notifications');
    _notificationsModule = mod;

    if (!_handlerConfigured && mod?.setNotificationHandler) {
      _handlerConfigured = true;
      try {
        mod.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
          }),
        });
      } catch {
        // Ignora erros em ambientes sem suporte
      }
    }

    return _notificationsModule ?? null;
  } catch (err) {
    console.warn('[Push] Não foi possível carregar expo-notifications:', err);
    _notificationsModule = null;
    return null;
  }
}

/**
 * Normaliza links recebidos no payload da notificação para as rotas do Expo Router.
 */
export function resolveDeepLinkRoute(rawUrl?: string | null): string {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    return '/(tabs)/lobby';
  }

  // Remove esquema personalizado e prefixos de domínio web, preservando o path
  const path = rawUrl
    .trim()
    .replace(/^elopadel:\/+/i, '/')
    .replace(/^https?:\/\/[^\/]+/i, '');

  const [cleanPath] = path.split(/[?#]/);
  let normalized = cleanPath.replace(/\/+$/, '');
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (normalized === '' || normalized === '/') {
    return '/(tabs)/lobby';
  }

  // Mapeamentos específicos para as rotas de tabs e telas do app
  if (
    normalized === '/matchmaking' ||
    normalized === '/lobby' ||
    normalized === '/tabs/lobby' ||
    normalized === '/(tabs)/lobby'
  ) {
    return '/(tabs)/lobby';
  }

  if (
    normalized === '/friends' ||
    normalized === '/tabs/friends' ||
    normalized === '/(tabs)/friends'
  ) {
    return '/(tabs)/friends';
  }

  if (
    normalized === '/leaderboard' ||
    normalized === '/tabs/leaderboard' ||
    normalized === '/(tabs)/leaderboard'
  ) {
    return '/(tabs)/leaderboard';
  }

  if (
    normalized === '/profile' ||
    normalized === '/tabs/profile' ||
    normalized === '/(tabs)/profile'
  ) {
    return '/(tabs)/profile';
  }

  if (
    normalized === '/matches' ||
    normalized === '/tabs/matches' ||
    normalized === '/(tabs)/matches'
  ) {
    return '/(tabs)/matches';
  }

  if (normalized === '/history' || normalized.startsWith('/history/')) {
    return '/history';
  }

  if (normalized === '/notifications' || normalized.startsWith('/notifications/')) {
    return '/notifications';
  }

  if (normalized.startsWith('/match/')) {
    return normalized; // Ex: /match/123 ou /match/b8e05a39-9d7a-471d-...
  }

  return '/(tabs)/lobby';
}

export interface UsePushNotificationsResult {
  pushToken: string | null;
  notification: NotificationsType.Notification | null;
  permissionGranted: boolean;
  isRegistering: boolean;
  error: string | null;
  registerToken: () => Promise<string | null>;
  unregisterToken: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  const [pushToken, setPushToken] = useState<string | null>(null);
  const [notification, setNotification] = useState<NotificationsType.Notification | null>(null);
  const [permissionGranted, setPermissionGranted] = useState<boolean>(false);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const notificationListener = useRef<NotificationsType.EventSubscription | null>(null);
  const responseListener = useRef<NotificationsType.EventSubscription | null>(null);

  // Configuração dos canais Android no carregamento
  useEffect(() => {
    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    if (Platform.OS === 'android') {
      try {
        Notifications.setNotificationChannelAsync('match-events', {
          name: 'Eventos de Partida',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#c9ff4a',
          sound: 'default',
        }).catch((err) => console.warn('[Push] Falha canal match-events:', err));

        Notifications.setNotificationChannelAsync('invitations', {
          name: 'Convites e Amizades',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 200, 200, 200],
          lightColor: '#00f2fe',
          sound: 'default',
        }).catch((err) => console.warn('[Push] Falha canal invitations:', err));

        Notifications.setNotificationChannelAsync('reminders', {
          name: 'Lembretes de Presença',
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: 'default',
        }).catch((err) => console.warn('[Push] Falha canal reminders:', err));
      } catch (err) {
        console.warn('[Push] Falha canais Android:', err);
      }
    }
  }, []);

  // Handler para processamento de cliques em notificações
  const handleNotificationResponse = useCallback(
    (response: NotificationsType.NotificationResponse) => {
      const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
      const targetUrl = data?.url || data?.deepLink || data?.href;

      if (targetUrl && typeof targetUrl === 'string') {
        const route = resolveDeepLinkRoute(targetUrl);
        router.push(route as any);
      }
    },
    [router]
  );

  // Registro do token junto à API
  const registerToken = useCallback(async (): Promise<string | null> => {
    if (isRegistering) return pushToken;

    const Notifications = getNotificationsModule();
    if (!Notifications) {
      return null;
    }

    setIsRegistering(true);
    setError(null);

    try {
      // 1. Verificação de permissões
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        setPermissionGranted(false);
        setIsRegistering(false);
        return null;
      }

      setPermissionGranted(true);

      // 2. Obtenção do Expo Push Token
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ??
        (Constants as any)?.easConfig?.projectId ??
        undefined;

      const tokenResult = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );

      const token = tokenResult?.data ?? null;
      if (!token) {
        setIsRegistering(false);
        return null;
      }

      setPushToken(token);

      // 3. Registro idempotente no backend
      const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
      const deviceType = Constants.deviceName ?? undefined;
      const appVersion = Constants.expoConfig?.version ?? undefined;

      await pushApi.registerPushToken({
        token,
        platform,
        deviceType,
        appVersion,
      });

      setIsRegistering(false);
      return token;
    } catch (err: any) {
      console.warn('[Push] Não foi possível registrar o token:', err?.message || err);
      setError(err?.message || 'Falha ao registrar push token');
      setIsRegistering(false);
      return null;
    }
  }, [isRegistering, pushToken]);

  // Cancelamento do registro do token (utilizado no logout)
  const unregisterToken = useCallback(async (): Promise<void> => {
    if (!pushToken) return;
    try {
      await pushApi.unregisterPushToken(pushToken);
      setPushToken(null);
    } catch (err) {
      console.warn('[Push] Erro ao desregistrar token no logout:', err);
    }
  }, [pushToken]);

  // Disparo automático do registro quando autenticado
  useEffect(() => {
    if (isAuthenticated) {
      registerToken();
    } else {
      setPushToken(null);
    }
  }, [isAuthenticated, registerToken]);

  // Listeners de notificação e cold-start
  useEffect(() => {
    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    // 1. Cold-start check
    Notifications.getLastNotificationResponseAsync()
      .then((response: any) => {
        if (response) {
          handleNotificationResponse(response);
        }
      })
      .catch((err: any) => console.warn('[Push] Erro ao ler última notificação recebida:', err));

    // 2. Notificação recebida em foreground
    try {
      notificationListener.current = Notifications.addNotificationReceivedListener((incoming: any) => {
        setNotification(incoming);
      });
    } catch {
      // Ignora erro de listener
    }

    // 3. Toque na notificação (background ou foreground)
    try {
      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse
      );
    } catch {
      // Ignora erro de listener
    }

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [handleNotificationResponse]);

  return {
    pushToken,
    notification,
    permissionGranted,
    isRegistering,
    error,
    registerToken,
    unregisterToken,
  };
}
