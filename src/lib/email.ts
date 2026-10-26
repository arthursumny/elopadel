/**
 * Minimal transactional email client.
 *
 * Native Resend contract:
 *   POST https://api.resend.com/emails
 *   Authorization: Bearer ${RESEND_API_KEY}
 *   { from, to: [to], subject, text, html? }
 *
 * Legacy adapter contract (for existing deployments):
 *   POST ${EMAIL_PROVIDER_URL}
 *   Authorization: Bearer ${EMAIL_PROVIDER_TOKEN}
 *   Content-Type: application/json
 *   { "to": string, "subject": string, "text": string, "html"?: string }
 *
 * Non-2xx responses are treated as failures. No recipient, subject or token is
 * written to logs.
 */

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('EMAIL_PROVIDER_NOT_CONFIGURED');
    this.name = 'EmailNotConfiguredError';
  }
}

export class EmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type ProviderConfig =
  | { kind: 'resend'; url: string; token: string; from: string }
  | { kind: 'legacy'; url: string; token: string };

function providerConfig(): ProviderConfig {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (resendKey || emailFrom) {
    if (!resendKey || !emailFrom) throw new EmailNotConfiguredError();
    return { kind: 'resend', url: 'https://api.resend.com/emails', token: resendKey, from: emailFrom };
  }

  const url = process.env.EMAIL_PROVIDER_URL?.trim();
  const token = process.env.EMAIL_PROVIDER_TOKEN?.trim();
  if (!url || !token) {
    throw new EmailNotConfiguredError();
  }
  return { kind: 'legacy', url, token };
}

export function emailProviderConfigured(): boolean {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const emailFrom = process.env.EMAIL_FROM?.trim();
  if (resendKey || emailFrom) return Boolean(resendKey && emailFrom);
  return Boolean(process.env.EMAIL_PROVIDER_URL?.trim() && process.env.EMAIL_PROVIDER_TOKEN?.trim());
}

export function resolveAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new EmailNotConfiguredError();
  }
  return 'http://localhost:3000';
}

export function buildEmailLink(path: string, param: string, token: string): string {
  const separator = path.includes('?') ? '&' : '?';
  return `${resolveAppUrl()}${path}${separator}${param}=${encodeURIComponent(token)}`;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const config = providerConfig();

  let response: Response;
  try {
    response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(config.kind === 'resend'
        ? { from: config.from, to: [message.to], subject: message.subject, text: message.text, ...(message.html === undefined ? {} : { html: message.html }) }
        : message),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new EmailDeliveryError('EMAIL_PROVIDER_UNREACHABLE');
  }

  if (!response.ok) {
    throw new EmailDeliveryError(`EMAIL_PROVIDER_HTTP_${response.status}`);
  }
}
