import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmEmailWithPassword } from './email-auth-client';

describe('confirmEmailWithPassword', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts only the token and the password chosen on the confirmation form', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, message: 'Email verificado com sucesso. Você já pode entrar.' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await confirmEmailWithPassword('single-use-token', 'senhaDefinitiva123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/email/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'single-use-token', password: 'senhaDefinitiva123' }),
    });
    expect(result).toEqual({
      ok: true,
      message: 'Email verificado com sucesso. Você já pode entrar.',
    });
  });

  it('returns the backend token error code so the form can stop retrying the same link', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Link de verificação expirado. Solicite um novo cadastro.',
          code: 'TOKEN_EXPIRED',
        }),
      })
    );

    const result = await confirmEmailWithPassword('expired-token', 'senhaDefinitiva123');

    expect(result).toEqual({
      ok: false,
      status: 400,
      error: 'Link de verificação expirado. Solicite um novo cadastro.',
      code: 'TOKEN_EXPIRED',
    });
  });
});
