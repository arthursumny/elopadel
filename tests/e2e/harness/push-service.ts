export interface ExpoPushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
  badge?: number;
}

export interface PushTicketSuccess {
  status: 'ok';
  id: string;
}

export interface PushTicketError {
  status: 'error';
  message: string;
  details?: {
    error?: 'DeviceNotRegistered' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidCredentials';
  };
}

export type PushTicket = PushTicketSuccess | PushTicketError;

export class MockPushService {
  private sentMessages: ExpoPushPayload[] = [];
  private tokenRegistry: Map<string, { userId: string; platform: 'ios' | 'android' | 'web'; isEnabled: boolean; lastSeenAt: Date }> = new Map();
  private simulatedErrors: Map<string, PushTicketError['details']['error']> = new Map();

  registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android' | 'web' = 'ios') {
    if (!token || typeof token !== 'string') {
      throw new Error('Invalid push token');
    }
    // On conflict, update user and re-enable (handles multi-user device switching)
    this.tokenRegistry.set(token, {
      userId,
      platform,
      isEnabled: true,
      lastSeenAt: new Date(),
    });
    return { ok: true, registeredAt: new Date().toISOString() };
  }

  unregisterDeviceToken(userId: string, token: string) {
    const record = this.tokenRegistry.get(token);
    if (record && record.userId === userId) {
      record.isEnabled = false;
      this.tokenRegistry.set(token, record);
      return { ok: true, unregistered: true };
    }
    return { ok: false, error: 'Token not found or user mismatch' };
  }

  getTokensForUser(userId: string): string[] {
    const tokens: string[] = [];
    for (const [token, record] of this.tokenRegistry.entries()) {
      if (record.userId === userId && record.isEnabled) {
        tokens.push(token);
      }
    }
    return tokens;
  }

  simulateDeviceNotRegistered(token: string) {
    this.simulatedErrors.set(token, 'DeviceNotRegistered');
  }

  async sendPushNotification(payloads: ExpoPushPayload[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (const payload of payloads) {
      this.sentMessages.push(payload);

      const simError = this.simulatedErrors.get(payload.to);
      if (simError) {
        tickets.push({
          status: 'error',
          message: `The device is not registered (${simError})`,
          details: { error: simError },
        });
        // Auto-clean dead tokens from registry
        if (simError === 'DeviceNotRegistered') {
          this.tokenRegistry.delete(payload.to);
        }
      } else {
        tickets.push({
          status: 'ok',
          id: `ticket-${Math.random().toString(36).substring(2, 9)}`,
        });
      }
    }
    return tickets;
  }

  async dispatchEventToUsers(
    userIds: string[],
    event: {
      type: string;
      title: string;
      body: string;
      data?: Record<string, unknown>;
      channelId?: string;
    }
  ): Promise<{ sentCount: number; tickets: PushTicket[] }> {
    const payloads: ExpoPushPayload[] = [];
    for (const userId of userIds) {
      const tokens = this.getTokensForUser(userId);
      for (const token of tokens) {
        payloads.push({
          to: token,
          title: event.title,
          body: event.body,
          data: { ...event.data, type: event.type },
          priority: 'high',
          sound: 'default',
          channelId: event.channelId ?? 'match-events',
        });
      }
    }

    const tickets = await this.sendPushNotification(payloads);
    return { sentCount: payloads.length, tickets };
  }

  getAllSent(): ExpoPushPayload[] {
    return [...this.sentMessages];
  }

  getSentForUser(userId: string): ExpoPushPayload[] {
    const userTokens = new Set(this.getTokensForUser(userId));
    return this.sentMessages.filter((msg) => userTokens.has(msg.to));
  }

  clear() {
    this.sentMessages = [];
    this.tokenRegistry.clear();
    this.simulatedErrors.clear();
  }
}

export const pushService = new MockPushService();
