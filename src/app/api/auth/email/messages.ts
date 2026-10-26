import { buildEmailLink, sendEmail } from '@/lib/email';

function verificationHtml(link: string) {
  return `<p>Confirme seu email para ativar sua conta no Elo Padel.</p><p><a href="${link}">Confirmar email</a></p><p>Se você não criou esta conta, ignore esta mensagem.</p>`;
}

function resetHtml(link: string) {
  return `<p>Recebemos um pedido para redefinir sua senha no Elo Padel.</p><p><a href="${link}">Redefinir senha</a></p><p>Se você não solicitou, ignore esta mensagem. O link expira em 1 hora.</p>`;
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const link = buildEmailLink('/login', 'emailToken', token);
  await sendEmail({
    to: email,
    subject: 'Confirme seu email no Elo Padel',
    text: `Confirme seu email para ativar sua conta no Elo Padel: ${link}\n\nSe você não criou esta conta, ignore esta mensagem.`,
    html: verificationHtml(link),
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const link = buildEmailLink('/login', 'resetToken', token);
  await sendEmail({
    to: email,
    subject: 'Recuperação de senha no Elo Padel',
    text: `Redefina sua senha no Elo Padel: ${link}\n\nO link expira em 1 hora. Se você não solicitou, ignore esta mensagem.`,
    html: resetHtml(link),
  });
}
