import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from './client';
import { authApi } from './auth';

describe('authApi email/password contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts email login to the expected endpoint', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      status: 'authenticated',
      token: 'token',
      user: { id: 'u1' },
      player: { id: 'u1' },
    });

    await authApi.loginWithEmail('jogador@email.com', 'senhaSegura123');

    expect(postSpy).toHaveBeenCalledWith('/api/auth/email/login', {
      email: 'jogador@email.com',
      password: 'senhaSegura123',
    });
  });

  it('posts the full profile when registering with email', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      status: 'verification_required',
      message: 'Enviamos um link de verificação.',
    });

    await authApi.registerEmail({
      email: 'jogador@email.com',
      password: 'senhaSegura123',
      name: 'Jogador Teste',
      handle: 'jogador_teste',
      city: 'São Paulo',
      state: 'SP',
      category: '5ª',
      clubId: 'club-1',
    });

    expect(postSpy).toHaveBeenCalledWith('/api/auth/email/register', {
      email: 'jogador@email.com',
      password: 'senhaSegura123',
      name: 'Jogador Teste',
      handle: 'jogador_teste',
      city: 'São Paulo',
      state: 'SP',
      category: '5ª',
      clubId: 'club-1',
    });
  });

  it('requests a reset link without exposing account existence', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      ok: true,
      message: 'Se este email estiver cadastrado, enviaremos instruções.',
    });

    const result = await authApi.requestPasswordReset('jogador@email.com');

    expect(postSpy).toHaveBeenCalledWith('/api/auth/email/forgot-password', {
      email: 'jogador@email.com',
    });
    expect(result.message).toMatch(/Se este email estiver cadastrado/);
  });

  it('does not expose legacy SMS/OTP endpoints', () => {
    expect((authApi as any).requestOtp).toBeUndefined();
    expect((authApi as any).verifyOtp).toBeUndefined();
    expect((authApi as any).linkSocialAccount).toBeUndefined();
  });
});
