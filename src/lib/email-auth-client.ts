export type ConfirmEmailResult =
  | { ok: true; message: string }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Confirms an email token and defines the account password in the same step.
 * The token is single-use and the password sent here replaces the initial
 * password supplied at registration.
 */
export async function confirmEmailWithPassword(
  token: string,
  password: string
): Promise<ConfirmEmailResult> {
  const response = await fetch('/api/auth/email/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: data.error ?? 'Não foi possível confirmar este email agora.',
      code: typeof data.code === 'string' ? data.code : undefined,
    };
  }

  return {
    ok: true,
    message: data.message ?? 'Email verificado com sucesso. Você já pode entrar.',
  };
}
