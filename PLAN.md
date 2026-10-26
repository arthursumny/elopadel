# Elo Padel — MVP competitivo global

## Objetivo

Construir uma PWA mobile-first para competição contínua de padel. O produto é global desde o início; Joaçaba será apenas o primeiro piloto. O Gripo continua responsável por clubes, quadras, reservas, pagamentos e torneios.

## Entrega do MVP

- Jogadores criam suas próprias contas com celular + OTP e escolhem um @handle público único.
- Administradores cadastram qualquer clube e criam o acesso institucional do clube; jogadores continuam criando as próprias credenciais.
- MMR oculto baseado em Glicko-2 adaptado para duplas.
- Patentes 6ª III até Elite/Challenger, pontos, promoções, rebaixamentos e histórico.
- Matchmaking por saguão de disponibilidade, parceiros, desafios e partidas amistosas.
- Busca pública por nome/@handle, rede de amigos e convites de dupla sem expor telefone.
- Confirmação de presença pelo jogador e decisão do clube quando houver ausência.
- Votação do vencedor por participante: pelo menos três votos, um de cada dupla, apontando o mesmo lado; qualquer divergência bloqueia o resultado para análise.
- Penalidade escalonada para no-show confirmado: perda de MMR/pontos, suspensão ranqueada e reincidência mais severa.
- Ranking único com filtros de clube, cidade, região, estado, país e global.
- Temporadas, conquistas, inatividade e ranking histórico.
- Link configurável para reserva no Gripo, sem recriar operações do Gripo.
- Painel operacional para clubes, usuários, vínculos, contestações e auditoria.

## Base técnica

Next.js + TypeScript, Tailwind/shadcn UI, PostgreSQL, Drizzle ORM e Docker Compose para execução em VPS. O código deve manter serviços de domínio tipados e adaptadores para OTP/WhatsApp, notificações e persistência.

## Regras padrão

- Categoria inicial declarada pelo jogador, com início na divisão II e cinco partidas provisórias de calibração sem bloquear o acesso.
- 100 pontos por divisão.
- Promoção com duas vitórias em três partidas.
- Falha na promoção retorna o jogador a 70 pontos.
- Duplas com mais de duas divisões ou aproximadamente 300 MMR de diferença não jogam ranqueadas no MVP.
- Inatividade após 30 dias começa a reduzir pontos; após 60 dias, perfil fica inativo.
- Challenger: mínimo de 500 jogadores ativos e top 100 global.
- Resultados de torneios e integração automática com o Gripo ficam fora do MVP.

## Aceite

O piloto deve permitir que jogadores reais se cadastrem, entrem no saguão e encontrem partidas, validem resultados, evoluam de patente e consultem o mesmo ranking por diferentes filtros geográficos, com operação administrativa auditável.

## Status da implementação local — 31/08/2026

- [x] PostgreSQL + Drizzle persistindo jogadores, clubes, vínculos, salas, partidas, resultados, MMR, patentes, eventos e temporadas.
- [x] Cadastro feito pelo próprio jogador via celular + OTP local (`123456`), com nome, @handle, cidade/estado, categoria inicial e clube opcional; contas existentes entram somente com celular + OTP.
- [x] Categoria declarada define a largada na divisão II, 50 pontos e MMR provisório alinhado à faixa da patente; a opção sem categoria começa em 6ª III.
- [x] Cadastro administrativo de clubes genéricos, sem limitar a plataforma a Joaçaba.
- [x] Banco inicial zerado, sem jogador, clube, sala ou temporada demonstrativos.
- [x] Login separado para clubes, com decisão sobre solicitações de vínculo.
- [x] Saguão de busca persistido para entrada solo ou com parceiro, com convite por @handle, aceite do parceiro, dias, janela de horário, cidade, clube, modo e preferência de lado; a categoria é derivada pelo sistema.
- [x] Matchmaking automático só inicia depois que os dois integrantes da dupla confirmam; combina duplas ou jogadores solo com disponibilidade, localização, MMR e lados compatíveis.
- [x] Partida formada exige aceite dos quatro jogadores, confirmação de presença dos quatro no horário e janela limitada para envio do resultado após a duração configurada do jogo.
- [x] Busca de jogadores por nome/@handle, solicitações de amizade persistidas e seletor de amigos nos convites de dupla do saguão.
- [x] Placar, voto individual do vencedor, confirmação mínima de três jogadores com uma pessoa de cada dupla, bloqueio de divergências, decisão do clube e atualização idempotente do MMR.
- [x] Comparecimento manual, punição de no-show confirmada pelo clube e bloqueio temporário de partidas ranqueadas durante a suspensão.
- [x] Ranking global com visões de estado, cidade e clube; histórico, perfil e temporada lendo o banco.
- [x] Link de reserva direcionando para o Gripo, sem duplicar reservas, pagamentos ou torneios.
- [x] Envio de resultado autorizado somente para participantes da partida, com proteção de uma partida por sala.
- [x] Notificações persistidas para convites, amizades, partidas, resultados, comparecimento e vínculos, com central no app.
- [x] Rotina protegida de manutenção para expirar buscas, cancelar partidas sem os quatro aceites, enviar lembretes/resultados e aplicar inatividade sem duplicidade.
- [x] Healthcheck que testa o PostgreSQL, healthcheck do container, comandos de backup e runbook de operação.
- [x] Dashboard sem etapa, prazo, posição ou progresso fictícios quando não existe temporada ativa.
- [ ] Provedor real de SMS/WhatsApp para produção; o piloto local usa OTP em memória.
- [x] Desafios diretos persistidos: criador escolhe seu parceiro e a dupla adversária por @handle/nome, propõe data/horário, os três convidados aceitam ou sugerem novo horário, e o app cria a mesma partida ranqueada/amistosa quando os quatro confirmam; sem categoria paralela e com limite de duas partidas ranqueadas contra a mesma dupla em 14 dias.
- [ ] Importação de torneios do Gripo, recompensas e Challenger dependem de dados reais e regras de produção.
