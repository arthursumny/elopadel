import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Scale } from 'lucide-react';
import { Brand } from '@/components/app-shell';
import { PublicFooter } from '@/components/landing-page';

export const metadata: Metadata = {
  title: 'Termos de Uso — Elo Padel',
  description:
    'Regras de funcionamento das partidas, validação de placares por votos, MMR, ranking, temporada e conduta no Elo Padel.',
};

export default function TermosPage() {
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
          <div className="inline-flex items-center gap-2 rounded-full border border-lime/20 bg-lime/[.07] px-3 py-1 text-[11px] font-bold uppercase tracking-[.14em] text-lime">
            <Scale size={13} aria-hidden="true" />
            Regras da plataforma
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-[-.05em] text-white sm:text-4xl">
            Termos de Uso
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-soft sm:text-base">
            Ao criar uma conta ou participar de partidas no Elo Padel, você concorda com as regras abaixo para garantir jogos equilibrados e um ranking limpo para toda a comunidade.
          </p>
          <p className="mt-4 text-xs font-semibold text-meta">
            Última atualização: <span className="text-white/85">10 de novembro de 2026</span>
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-soft sm:text-[15px] sm:leading-7">
          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              1. O que é o Elo Padel
            </h2>
            <p className="mt-3">
              O Elo Padel é uma plataforma digital de organização de partidas de padel que conecta jogadores por nível técnico e proximidade, registra resultados validados pelos próprios participantes e mantém o cálculo contínuo de MMR, patentes de ranking e temporada competitiva. O serviço é voltado a maiores de 18 anos (ou menores assistidos e autorizados por seu responsável legal).
            </p>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              2. Conta e responsabilidade pelas credenciais
            </h2>
            <p className="mt-3">
              Cada jogador pode manter apenas <strong className="text-white">uma única conta</strong> pessoal e intransferível. No momento do cadastro, você se compromete a informar dados verdadeiros e a selecionar uma categoria inicial compatível com o seu nível real de jogo.
            </p>
            <p className="mt-3">
              Você é o único responsável por proteger sua senha e o acesso ao seu e-mail ou conta Google vinculada. Qualquer ação realizada na plataforma a partir da sua sessão autenticada será atribuída ao seu perfil.
            </p>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              3. Uso aceitável e integridade competitiva
            </h2>
            <p className="mt-3">
              A credibilidade do ranking depende da lealdade entre os jogadores. É estritamente proibido:
            </p>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Manipular placares ou combinar resultados:</strong> registrar partidas que não aconteceram em quadra, entregar jogos propositalmente ou votar em placares falsos para inflar ou reduzir o MMR de qualquer jogador.
              </li>
              <li>
                <strong className="text-white">Criar contas falsas ou secundárias (smurfing):</strong> abrir novo cadastro em categoria inferior ao seu nível real para obter vantagem indevida no matchmaking ou na temporada.
              </li>
              <li>
                <strong className="text-white">Assediar ou ofender outros jogadores:</strong> praticar ofensas, ameaças, discriminação ou conduta antidesportiva dentro da plataforma ou nas partidas organizadas por meio dela.
              </li>
            </ul>
            <p className="mt-4 text-xs text-coral">
              O descumprimento destas regras pode resultar em anulação de partidas, congelamento ou reajuste de MMR e suspensão temporária ou definitiva da conta.
            </p>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              4. Como funcionam as partidas
            </h2>
            <p className="mt-3">
              O fluxo oficial de uma partida no Elo Padel segue quatro etapas obrigatórias:
            </p>
            <ol className="mt-4 list-decimal space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Busca e formação:</strong> você entra na fila de matchmaking ou cria/aceita convite em uma sala definindo horário, cidade e clube.
              </li>
              <li>
                <strong className="text-white">Confirmação dos 4 jogadores:</strong> a partida só é fechada quando os quatro participantes aceitam o jogo.
              </li>
              <li>
                <strong className="text-white">Presença em quadra:</strong> os jogadores comparecem ao clube no horário combinado e registram presença na partida.
              </li>
              <li>
                <strong className="text-white">Envio de placar e validação por votos:</strong> encerrado o jogo, o placar em sets é lançado e submetido aos 4 jogadores. Quando <strong className="text-lime">3 votos concordam</strong> com o resultado, a partida é validada automaticamente. Em caso de votos divergentes, a partida fica marcada como contestada (<code className="rounded bg-white/[.08] px-1.5 py-0.5 font-mono text-xs text-coral">disputed</code>) e o MMR permanece congelado até verificação.
              </li>
            </ol>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              5. Como funcionam MMR, ranking e temporada
            </h2>
            <ul className="mt-3 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">MMR (Matchmaking Rating):</strong> índice técnico calculado pelo sistema que reflete sua regularidade, a força dos adversários e do parceiro. As primeiras partidas ranqueadas funcionam como período de calibração provisória.
              </li>
              <li>
                <strong className="text-white">Patentes e ranking:</strong> sua evolução percorre as divisões da 6ª à 1ª categoria, além das faixas Elite e Challenger, subindo ou descendo exclusivamente a partir de partidas validadas.
              </li>
              <li>
                <strong className="text-white">Temporada global:</strong> cada temporada tem prazo determinado e contabiliza pontos e vitórias conquistados no período para compor o placar e os marcos da etapa.
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              6. Cancelamentos e ausências
            </h2>
            <p className="mt-3">
              Como o padel exige exatamente quatro jogadores em quadra, o cancelamento em cima da hora ou o não comparecimento sem aviso compromete a partida de outros três atletas. O Elo Padel registra desistências tardias e ausências, podendo aplicar bloqueios temporários na busca de partidas e restrições no perfil reincidente.
            </p>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              7. Propriedade do conteúdo e uso do nome/arroba no ranking público
            </h2>
            <p className="mt-3">
              Todo o software, identidade visual, marca, regras de negócio e algoritmos de cálculo do Elo Padel são de titularidade exclusiva da plataforma.
            </p>
            <p className="mt-3">
              Ao participar do Elo Padel, você autoriza a exibição do seu <strong className="text-white">nome de exibição, arroba (<code className="rounded bg-white/[.08] px-1.5 py-0.5 font-mono text-xs text-lime">@handle</code>), cidade, clube principal, patente, pontuação e histórico de partidas</strong> nas listagens públicas de ranking, placar da temporada, busca de jogadores e cartões de partida.
            </p>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              8. Limitações de responsabilidade
            </h2>
            <p className="mt-3">
              O Elo Padel atua exclusivamente como plataforma digital de organização competitiva:
            </p>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-soft">
              <li>
                <strong className="text-white">Quadras e reservas:</strong> o Elo Padel <strong className="text-white">não é proprietário, locador nem administrador de clubes ou quadras de padel</strong>. A confirmação de uma partida no app não substitui a reserva nem o pagamento do aluguel da quadra diretamente junto ao clube escolhido.
              </li>
              <li>
                <strong className="text-white">Aptidão física e lesões:</strong> cada jogador é integralmente responsável por avaliar suas condições médicas e físicas antes de entrar em quadra. O Elo Padel não se responsabiliza por lesões esportivas, acidentes, danos a materiais (raquetes, objetos pessoais) ou desentendimentos presenciais ocorridos antes, durante ou após as partidas.
              </li>
            </ul>
          </section>

          <section className="glass rounded-2xl p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              9. Alterações dos termos e foro aplicável
            </h2>
            <p className="mt-3">
              Estes Termos de Uso podem ser atualizados periodicamente para refletir evoluções nas regras competitivas, novos recursos ou exigências legais, mantendo sempre a data da revisão mais recente no topo desta página.
            </p>
            <p className="mt-3">
              Estes termos são regidos pelas leis da <strong className="text-white">República Federativa do Brasil</strong>, ficando eleito o foro brasileiro competente, nos termos da legislação aplicável, para dirimir quaisquer controvérsias decorrentes do uso da plataforma.
            </p>
          </section>

          <section className="rounded-2xl border border-lime/20 bg-lime/[.05] p-6 sm:p-7">
            <h2 className="text-lg font-black tracking-[-.03em] text-white">
              10. Contato
            </h2>
            <p className="mt-3 text-soft">
              Em caso de dúvidas sobre estas regras, denúncias de manipulação de placar ou solicitações relacionadas à sua conta, entre em contato pelo e-mail:
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
              Leia também a nossa{' '}
              <Link href="/privacidade" className="font-bold text-cyan underline underline-offset-4 hover:text-lime">
                Política de Privacidade
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
