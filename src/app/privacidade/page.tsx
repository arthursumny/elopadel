import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { Brand } from '@/components/app-shell';
import { PublicFooter } from '@/components/landing-page';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Elo Padel',
  description:
    'Como o Elo Padel coleta, utiliza, armazena e protege seus dados pessoais e competitivos conforme a LGPD.',
};

export default function PrivacidadePage() {
  return (
    <div className="app-gradient flex min-h-screen flex-col text-white">
      <header className="border-b border-white/[.07] bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Brand href="/" />
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl border border-white/[.12] bg-white/[.035] px-4 py-2.5 text-xs font-bold text-white/85 transition hover:border-lime/30 hover:text-white"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Voltar para o início
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-10 border-b border-white/[.08] pb-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan/20 bg-cyan/[.07] px-3 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-cyan">
            <ShieldCheck size={13} aria-hidden="true" />
            Privacidade e LGPD
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">
            Política de Privacidade
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-soft sm:text-base">
            Esta política explica, de forma direta e sem rodeios, quais dados o Elo Padel coleta, para que eles servem e como você controla suas informações na plataforma.
          </p>
          <p className="mt-4 text-xs font-semibold text-meta">
            Última atualização: <span className="text-white/85">10 de novembro de 2026</span>
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-soft sm:text-[15px] sm:leading-7">
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              1. Quem pode usar o Elo Padel (Faixa etária)
            </h2>
            <p className="mt-3">
              O Elo Padel é um serviço destinado a <strong className="text-white">maiores de 18 anos</strong>. Jogadores menores de 18 anos somente podem criar conta e participar de partidas com a autorização e supervisão direta de um dos pais ou responsável legal, que assume integral responsabilidade pelo cadastro e pelo uso da plataforma.
            </p>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              2. Quais dados coletamos
            </h2>
            <p className="mt-3">
              Coletamos apenas as informações necessárias para identificar seu perfil competitivo, organizar jogos e manter o ranking íntegro:
            </p>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Dados de cadastro e perfil:</strong> nome ou apelido de exibição, arroba pública (<code className="rounded bg-white/[.08] px-1.5 py-0.5 font-mono text-xs text-lime">@handle</code>), endereço de e-mail, cidade e estado, categoria competitiva inicial e clube principal de preferência.
              </li>
              <li>
                <strong className="text-white">Dados de uso e desempenho competitivo:</strong> partidas criadas ou disputadas, confirmações de presença, placares enviados, votos de validação de resultado, MMR (rating técnico), patente no ranking e pontos acumulados na temporada.
              </li>
              <li>
                <strong className="text-white">Localização aproximada (GPS):</strong> coordenadas geográficas informadas pelo navegador ou aparelho celular, exclusivamente quando você autoriza a permissão de localização para buscar partidas e clubes por proximidade.
              </li>
              <li>
                <strong className="text-white">Notificações push:</strong> token do dispositivo caso você ative voluntariamente o recebimento de alertas de convites, confirmações de jogo e validação de placar.
              </li>
              <li>
                <strong className="text-white">Cookies de sessão:</strong> utilizamos cookie HTTP-only de autenticação (<code className="rounded bg-white/[.08] px-1.5 py-0.5 font-mono text-xs text-cyan">elo_session</code>) para manter você conectado com segurança, sem rastreadores publicitários de terceiros.
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              3. Para que usamos seus dados
            </h2>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Login e gestão de acesso:</strong> autenticar sua conta, validar seu endereço de e-mail e permitir recuperação de senha.
              </li>
              <li>
                <strong className="text-white">Matchmaking por nível e proximidade:</strong> cruzar categoria, MMR, cidade, clube e distância aproximada para sugerir partidas equilibradas e duplas compatíveis.
              </li>
              <li>
                <strong className="text-white">Ranking e temporada:</strong> calcular a evolução do MMR após partidas validadas por votos, atualizar sua patente e exibir a classificação pública na cidade, no clube e na temporada global.
              </li>
              <li>
                <strong className="text-white">Notificações operacionais:</strong> avisar quando uma partida fecha os 4 jogadores, lembrar do horário do jogo e solicitar seu voto no placar.
              </li>
              <li>
                <strong className="text-white">Segurança e integridade competitiva:</strong> prevenir contas falsas, auditar placares contestados e impedir manipulação de resultados.
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              4. Com quem compartilhamos seus dados
            </h2>
            <p className="mt-3">
              O Elo Padel <strong className="text-lime">não vende, não aluga e não comercializa dados pessoais</strong> para anunciantes, corretores de dados ou quaisquer terceiros. O compartilhamento restrito ocorre apenas com os serviços essenciais para o funcionamento do app:
            </p>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Google (Login Social):</strong> caso você escolha entrar com sua conta Google, validamos o token de autenticação junto ao Google para confirmar seu nome e e-mail verificado.
              </li>
              <li>
                <strong className="text-white">Resend (Provedor de e-mail transacional):</strong> utilizado exclusivamente para enviar os e-mails de confirmação de cadastro e os links de redefinição de senha.
              </li>
              <li>
                <strong className="text-white">Integração Gripo (Catálogo de clubes):</strong> a comunicação com o Gripo serve apenas para consultar e sincronizar o catálogo público de clubes e cidades disponíveis. <strong className="text-white">Nenhum dado pessoal de jogadores é enviado ao Gripo.</strong>
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <div className="flex items-center gap-2.5">
              <Lock size={18} className="text-lime" aria-hidden="true" />
              <h2 className="text-lg font-black tracking-[-.03em] text-white">
                5. Retenção e segurança
              </h2>
            </div>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Senhas protegidas com hash:</strong> nunca armazenamos senhas em texto puro. Todas as senhas são processadas com algoritmo de hash criptográfico forte antes de serem salvas no banco de dados.
              </li>
              <li>
                <strong className="text-white">Sessão por token assinado:</strong> o acesso à conta utiliza tokens JWT assinados com chave secreta e versão de sessão, permitindo invalidar acessos antigos imediatamente caso você redefina sua senha.
              </li>
              <li>
                <strong className="text-white">Tempo de retenção:</strong> mantemos seus dados cadastrais enquanto sua conta estiver ativa. Caso você solicite a exclusão da conta, seus dados pessoais identificáveis (nome, e-mail, arroba e tokens) são removidos ou anonimizados, preservando-se apenas os registros estatísticos agregados das partidas já validadas para não distorcer o MMR dos demais jogadores que participaram daqueles jogos.
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              6. Seus direitos como titular (LGPD)
            </h2>
            <p className="mt-3">
              Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar a qualquer momento:
            </p>
            <ul className="mt-4 list-disc space-y-2 pl-5 text-soft">
              <li>
                <strong className="text-white">Acesso e confirmação:</strong> saber se tratamos dados seus e receber cópia das informações vinculadas à sua conta.
              </li>
              <li>
                <strong className="text-white">Correção:</strong> atualizar nome, cidade, clube ou dados incompletos e desatualizados.
              </li>
              <li>
                <strong className="text-white">Exclusão e anonimização:</strong> pedir o encerramento da conta e a remoção dos seus dados pessoais.
              </li>
              <li>
                <strong className="text-white">Portabilidade:</strong> solicitar a exportação do seu histórico de partidas e dados cadastrais em formato estruturado.
              </li>
              <li>
                <strong className="text-white">Revogação de consentimento:</strong> desativar o uso de localização (GPS) ou notificações push diretamente nas configurações do navegador/aparelho ou solicitar a remoção pelo nosso canal de contato.
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-lime/20 bg-lime/[.05] p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              7. Como exercer seus direitos e contato
            </h2>
            <p className="mt-3 text-soft">
              Para exercer qualquer direito previsto na LGPD, tirar dúvidas sobre esta Política de Privacidade ou solicitar a exclusão da sua conta, envie um e-mail informando sua arroba ou endereço cadastrado para:
            </p>
            <p className="mt-4">
              <a
                href="mailto:skanesx56@gmail.com"
                className="inline-flex items-center rounded-xl border border-lime/30 bg-ink/60 px-4 py-2.5 font-mono text-xs font-bold text-lime transition hover:border-lime hover:bg-ink"
              >
                skanesx56@gmail.com
              </a>
            </p>
            <p className="mt-4 text-xs text-meta">
              Consulte também os nossos{' '}
              <Link href="/termos" className="font-bold text-cyan underline underline-offset-4 hover:text-lime">
                Termos de uso
              </Link>
              .
            </p>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
