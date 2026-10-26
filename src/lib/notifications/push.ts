import {
  clearRuntimePushTokens,
  deleteDevicePushTokens,
  getActivePushTokens,
  runtimeDevicePushTokens,
  type PushPlatform,
} from './tokens';

export type AndroidChannelId = 'match-events' | 'invitations' | 'reminders';

export type NotificationInput = {
  type: string;
  title: string;
  body: string;
  href?: string;
  dedupeKey?: string;
};

export type PushNotificationData = {
  url: string;
  deepLink: string;
  eventType: string;
  type: string;
  href?: string | null;
  dedupeKey?: string | null;
  [key: string]: unknown;
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data: PushNotificationData;
  sound?: 'default' | null;
  badge?: number;
  channelId?: AndroidChannelId;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
  subtitle?: string;
};

export type ExpoPushTicket = {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: {
    error?:
      | 'DeviceNotRegistered'
      | 'MessageTooBig'
      | 'MessageRateExceeded'
      | 'InvalidCredentials'
      | string;
    [key: string]: unknown;
  };
};

export type ExpoPushResponse = {
  data?: ExpoPushTicket[];
  errors?: Array<{ code: string; message: string }>;
};

export type PushDispatchResult = {
  success: boolean;
  totalTokens: number;
  sentCount: number;
  failedCount: number;
  reapedTokens: string[];
  tickets: ExpoPushTicket[];
};

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function resolveAndroidChannel(eventType: string): AndroidChannelId {
  switch (eventType) {
    case 'match-formed':
    case 'match-confirmed':
    case 'match-cancelled':
    case 'match-ready-to-play':
    case 'attendance-update':
    case 'result-window-open':
    case 'result-submitted':
    case 'result-vote':
    case 'result-disputed':
    case 'match-validated':
      return 'match-events';

    case 'friend-request':
    case 'friend-request-response':
    case 'match-search-invitation':
    case 'match-search-invitation-response':
    case 'match-search-started':
    case 'room-invitation':
    case 'room-invitation-response':
    case 'room-joined':
    case 'direct-challenge':
    case 'direct-challenge-response':
    case 'direct-challenge-suggestion':
    case 'direct-challenge-accepted':
      return 'invitations';

    case 'match-reminder':
    case 'room-expired':
    case 'search-expired':
    case 'direct-challenge-expired':
    case 'inactivity-penalty':
    case 'profile-inactive':
    case 'club-membership':
    default:
      return 'reminders';
  }
}

export function resolveDeepLink(eventType: string, href?: string | null): string {
  if (href && href.trim()) {
    return href.trim();
  }
  if (eventType.startsWith('friend-')) {
    return '/friends';
  }
  const channel = resolveAndroidChannel(eventType);
  if (channel === 'match-events') {
    return '/matchmaking';
  }
  if (channel === 'invitations') {
    return '/matchmaking';
  }
  return '/notifications';
}

export function isExpoPushToken(token: unknown): boolean {
  if (typeof token !== 'string') return false;
  return /^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_\-\+]+\]$/.test(token.trim());
}

export function chunkArray<T>(items: T[], size: number = 100): T[][] {
  if (!Array.isArray(items) || items.length === 0) return [];
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function formatPushPayload(token: string, input: NotificationInput): ExpoPushMessage {
  const channelId = resolveAndroidChannel(input.type);
  const deepLink = resolveDeepLink(input.type, input.href);

  return {
    to: token,
    title: input.title,
    body: input.body,
    sound: 'default',
    badge: 1,
    channelId,
    priority: 'high',
    data: {
      url: deepLink,
      deepLink,
      eventType: input.type,
      type: input.type,
      href: input.href ?? null,
      dedupeKey: input.dedupeKey ?? null,
    },
  };
}

export async function sendExpoPushMessages(
  messages: ExpoPushMessage[],
  fetchFn: typeof fetch = globalThis.fetch
): Promise<{ tickets: ExpoPushTicket[]; deadTokens: string[] }> {
  if (!messages || messages.length === 0) {
    return { tickets: [], deadTokens: [] };
  }

  const chunks = chunkArray(messages, 100);
  const allTickets: ExpoPushTicket[] = [];
  const deadTokens: string[] = [];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };

  if (process.env.EXPO_ACCESS_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  }

  for (const chunk of chunks) {
    try {
      const response = await fetchFn(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });

      if (!response.ok) {
        console.error(`Expo Push API HTTP error ${response.status}: ${await response.text().catch(() => '')}`);
        continue;
      }

      const json = (await response.json().catch(() => null)) as ExpoPushResponse | null;
      if (json && Array.isArray(json.data)) {
        json.data.forEach((ticket, idx) => {
          allTickets.push(ticket);
          if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
            const correspondingToken = chunk[idx]?.to;
            if (correspondingToken) {
              deadTokens.push(correspondingToken);
            }
          }
        });
      }
    } catch (chunkError) {
      console.error('Falha ao enviar chunk para Expo Push Service:', chunkError);
    }
  }

  return { tickets: allTickets, deadTokens };
}

export async function reapDeadTokens(deadTokens: string[]): Promise<number> {
  return deleteDevicePushTokens(deadTokens);
}

export async function dispatchPushNotifications(
  userIds: string[],
  input: NotificationInput,
  options?: { fetchFn?: typeof fetch }
): Promise<PushDispatchResult> {
  const result: PushDispatchResult = {
    success: true,
    totalTokens: 0,
    sentCount: 0,
    failedCount: 0,
    reapedTokens: [],
    tickets: [],
  };

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return result;

  if (process.env.DISABLE_PUSH_NOTIFICATIONS === 'true') {
    return result;
  }

  try {
    const records = await getActivePushTokens(uniqueUserIds);
    const tokens = records.map((r) => r.token).filter(Boolean);
    result.totalTokens = tokens.length;
    if (tokens.length === 0) return result;

    const messages: ExpoPushMessage[] = tokens.map((token) => formatPushPayload(token, input));

    const fetchImpl = options?.fetchFn ?? globalThis.fetch;
    const { tickets, deadTokens } = await sendExpoPushMessages(messages, fetchImpl);

    result.tickets = tickets;
    result.sentCount = tickets.filter((t) => t.status === 'ok').length;
    result.failedCount = tickets.filter((t) => t.status === 'error').length;

    if (deadTokens.length > 0) {
      await reapDeadTokens(deadTokens);
      result.reapedTokens = deadTokens;
    }
  } catch (error) {
    console.error('Erro no pipeline de push dispatch:', error);
    result.success = false;
  }

  return result;
}

export {
  clearRuntimePushTokens,
  deleteDevicePushTokens,
  getActivePushTokens,
  runtimeDevicePushTokens,
};
