import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailDeliveryError, EmailNotConfiguredError, emailProviderConfigured, sendEmail } from '../../src/lib/email';

describe('email provider configuration and delivery', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', '');
    vi.stubEnv('EMAIL_FROM', '');
    vi.stubEnv('EMAIL_PROVIDER_URL', '');
    vi.stubEnv('EMAIL_PROVIDER_TOKEN', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('uses Resend with its native payload, including HTML', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-secret');
    vi.stubEnv('EMAIL_FROM', 'Elo Padel <noreply@exemplo.com>');
    vi.stubEnv('EMAIL_PROVIDER_URL', 'https://mail.provider.test/send');
    vi.stubEnv('EMAIL_PROVIDER_TOKEN', 'legacy-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail({ to: 'player@example.com', subject: 'Verify', text: 'Plain', html: '<b>HTML</b>' });

    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer resend-secret' }),
      body: JSON.stringify({ from: 'Elo Padel <noreply@exemplo.com>', to: ['player@example.com'], subject: 'Verify', text: 'Plain', html: '<b>HTML</b>' }),
    }));
  });

  it('omits html from the Resend payload when not provided', async () => {
    vi.stubEnv('RESEND_API_KEY', 'resend-secret');
    vi.stubEnv('EMAIL_FROM', 'sender@example.com');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail({ to: 'player@example.com', subject: 'Verify', text: 'Plain' });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      from: 'sender@example.com', to: ['player@example.com'], subject: 'Verify', text: 'Plain',
    });
  });

  it('keeps the legacy adapter request unchanged if Resend is absent', async () => {
    vi.stubEnv('EMAIL_PROVIDER_URL', 'https://mail.provider.test/send');
    vi.stubEnv('EMAIL_PROVIDER_TOKEN', 'legacy-secret');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const message = { to: 'player@example.com', subject: 'Verify', text: 'Plain' };

    await sendEmail(message);

    expect(fetchMock).toHaveBeenCalledWith('https://mail.provider.test/send', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer legacy-secret' }), body: JSON.stringify(message),
    }));
  });

  it.each([
    ['Resend key only', { RESEND_API_KEY: 'key', EMAIL_FROM: '' }],
    ['sender only', { RESEND_API_KEY: '', EMAIL_FROM: 'sender@example.com' }],
  ])('fails closed for partial Resend configuration (%s)', async (_label, env) => {
    vi.stubEnv('RESEND_API_KEY', env.RESEND_API_KEY);
    vi.stubEnv('EMAIL_FROM', env.EMAIL_FROM);
    vi.stubEnv('EMAIL_PROVIDER_URL', 'https://mail.provider.test/send');
    vi.stubEnv('EMAIL_PROVIDER_TOKEN', 'legacy-secret');
    expect(emailProviderConfigured()).toBe(false);
    await expect(sendEmail({ to: 'x@example.com', subject: 'x', text: 'x' })).rejects.toBeInstanceOf(EmailNotConfiguredError);
  });

  it('reports missing providers and incomplete legacy configuration as unconfigured', async () => {
    expect(emailProviderConfigured()).toBe(false);
    await expect(sendEmail({ to: 'x@example.com', subject: 'x', text: 'x' })).rejects.toBeInstanceOf(EmailNotConfiguredError);
    vi.stubEnv('EMAIL_PROVIDER_URL', 'https://mail.provider.test/send');
    expect(emailProviderConfigured()).toBe(false);
  });

  it.each([400, 500])('sanitizes Resend HTTP %s failures', async (status) => {
    vi.stubEnv('RESEND_API_KEY', 'secret');
    vi.stubEnv('EMAIL_FROM', 'sender@example.com');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private response body', { status })));
    await expect(sendEmail({ to: 'private@example.com', subject: 'private subject', text: 'x' }))
      .rejects.toThrow(`EMAIL_PROVIDER_HTTP_${status}`);
  });

  it('sanitizes network failures', async () => {
    vi.stubEnv('RESEND_API_KEY', 'secret');
    vi.stubEnv('EMAIL_FROM', 'sender@example.com');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('secret network detail')));
    await expect(sendEmail({ to: 'private@example.com', subject: 'private subject', text: 'x' }))
      .rejects.toEqual(expect.objectContaining({ name: 'EmailDeliveryError', message: 'EMAIL_PROVIDER_UNREACHABLE' } satisfies Partial<EmailDeliveryError>));
  });

  it('uses a 10-second timeout and sanitizes TimeoutError rejections', async () => {
    vi.stubEnv('RESEND_API_KEY', 'secret');
    vi.stubEnv('EMAIL_FROM', 'sender@example.com');
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('secret timeout detail', 'TimeoutError')));

    await expect(sendEmail({ to: 'private@example.com', subject: 'private subject', text: 'x' }))
      .rejects.toEqual(expect.objectContaining({ name: 'EmailDeliveryError', message: 'EMAIL_PROVIDER_UNREACHABLE' } satisfies Partial<EmailDeliveryError>));
    expect(timeoutSpy).toHaveBeenCalledWith(10_000);
  });
});
