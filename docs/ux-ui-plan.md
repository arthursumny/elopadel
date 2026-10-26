# Plano de UI/UX — Lote 1 (web)

## Status

Lote 1 implementado em 20/10/2026, com escopo estrito no app web (`src/app`, `src/components`). Backend, schema, migrations, dependências e app mobile não foram alterados.

## Objetivo do lote

Deixar as telas principais **legíveis, honestas e navegáveis**:

- texto informativo com contraste e tamanho adequados;
- nenhum controle visível sem ação;
- navegação com estado ativo, rótulos e acesso completo no mobile;
- estados de sistema (404, erro e carregamento) dentro da identidade;
- saída de sessão para jogador, clube e admin;
- filtros de histórico reais, com links reais para a partida.

## Entregas

### 1. Base visual e acessibilidade

Arquivos: `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`, `src/components/app-shell.tsx`.

- Tokens `soft`, `meta` e `quiet` para texto secundário.
- `color-scheme: dark` e cores de `option`/placeholder.
- Foco visível global (2 px lime, offset 2 px).
- `prefers-reduced-motion` respeitado.
- Safe area no bottom nav e no menu mobile.
- `viewport` com `themeColor` e `colorScheme`.
- Shell com sidebar a partir de 1024 px; abaixo disso, header compacto e bottom nav, evitando a coluna estreita em tablet.
- Grids de dashboard, perfil, ranking e admin passam a duas colunas apenas em `xl`, preservando largura útil em 1024 px.
- Skip link “Pular para o conteúdo” e `<main id="conteudo">`.
- `aria-label`, `aria-current` e estado ativo em `/match/*`.
- Menu mobile “Mais” com Amigos, Temporada global e Meu perfil.
- Sino administrativo removido (o admin não tinha para onde navegar).
- Sidebar sem o link morto “Ver guia”.

### 2. Ações honestas

Arquivos: `src/components/history-view.tsx`, `src/app/history/page.tsx`, `src/components/leaderboard-view.tsx`, `src/components/profile-view.tsx`, `src/components/dashboard.tsx`, `src/components/notification-bell.tsx`, `src/app/admin/page.tsx`.

- Histórico com filtro real (`Todas`, `Vitórias`, `Derrotas`, `Pendentes`, `Amistosas`), contagem, estado vazio e `aria-pressed`.
- Linhas do histórico são links para `/match/[id]`.
- Ranking sem botão de filtro/ordenação morto; rótulo estático “Ordenado por MMR”.
- Busca do ranking com rótulo acessível e ação “Limpar busca”.
- Perfil sem toggles falsos e sem toast inalcançável.
- Bloco de privacidade apenas com fatos verificáveis no código: telefone mascarado, posição por MMR e encerramento de acesso pelo botão Sair.
- Dashboard sem CTA “em breve”; “Ver evolução” aponta para o perfil.
- Admin sem setas decorativas em cards não clicáveis; KPIs em 2 colunas no mobile.
- Sino com fechamento por Escape, clique fora e retorno de foco.
- Conquistas inativas e notificações lidas diferenciadas por borda, fundo e ícone; o texto não perde contraste por `opacity` no container.

### 3. Estados de sistema

Arquivos novos: `src/app/not-found.tsx`, `src/app/error.tsx`, `src/app/loading.tsx`.

- 404 branded, em português, com caminhos de volta.
- Erro com `retry` (contrato do Next 16), copy em português e ação de nova tentativa.
- Carregamento com skeleton neutro e `role="status"`.

### 4. Sessão

Arquivos: `src/components/sign-out-button.tsx`, `src/components/app-shell.tsx`, `src/components/club-dashboard-view.tsx`.

- “Sair” com texto no admin, no clube e no perfil.
- Admin vai para `/admin/login`; clube para `/club/login`; jogador para `/login`.
- Endpoint existente `POST /api/auth/logout`; nenhum contrato novo.

## Privacidade — decisão de conteúdo

Os textos anteriores prometiam controles que não existiam. Foram substituídos por informações verificáveis:

- o telefone aparece mascarado na tela;
- a posição vem do MMR e das partidas registradas;
- “Use Sair para encerrar o acesso neste navegador.”

O texto não garante que a sessão foi encerrada quando a requisição de saída falha. Nesse caso, a interface mostra um aviso curto e mantém a opção de tentar novamente.

Não foi criado nenhum controle de privacidade novo.

## Testes adicionados

`tests/config/ui-ux.test.ts` cobre o comportamento puro do filtro de histórico e da requisição de logout:

- filtro padrão mantém a lista e a ordem;
- cada filtro retorna os itens corretos;
- a lista original não é mutada;
- filtro sem resultados retorna vazio;
- `requestLogout` só retorna sucesso com `response.ok`;
- HTTP não-ok e falha de rede retornam falha.

O arquivo fica em `tests/config/` porque é a convenção coberta pelo `vitest.config.ts`.

### Regressões de partida (fixer)

O fixer da partida adicionou `src/lib/match-draft.test.ts` com 6 checagens:

- hidratação inicial de placar e vencedor;
- rascunho preservado durante polling;
- resultado autoritativo substitui rascunho;
- transição `confirmed` → `result-pending`;
- sets ausentes são limpos;
- respostas atrasadas e de partida anterior são descartadas.

Essas checagens são automatizadas. A validação browser de `/match/[id]` foi feita nesta rodada final e está registrada abaixo.

## Validação executada

- `npm run typecheck`: passou.
- `npm test`: 31 arquivos, 362 testes passando.
- `npm run build`: passou no gate final do orquestrador.
- Validação visual com Chromium 154 headless em banco local descartável `elo_padel_ui_audit_20261020`.
- Interações via CDP:
  - filtro “Derrotas” → 1 linha, “Mostrando 1 de 4 partidas”;
  - menu “Mais” → `aria-expanded=true`, links Amigos/Temporada/Meu perfil;
  - Escape fecha o menu e devolve foco ao botão;
  - primeiro Tab foca “Pular para o conteúdo” com outline lime de 2 px;
  - sem overflow horizontal em 360, 390, 768, 1024 e 1440 px nas telas de dashboard, histórico, ranking e perfil;
  - sino abre, fecha com Escape e devolve foco;
  - admin não renderiza sino;
  - logout de admin, clube e jogador redireciona para o login correto quando a API responde ok;
  - falha HTTP no logout mantém a tela, libera o loading, mostra alerta acessível e “Tentar novamente”;
  - retry após a falha, com a API disponível, conclui o logout e redireciona;
  - conquistas inativas e notificações lidas mantêm `opacity: 1` no container e texto legível.

### Validação browser de `/match`

Feita com Chromium/CDP, banco isolado `elo_padel_ui_audit_20261020`, GET real da API local e **nenhum POST**. A mudança de estado do cenário 2 foi feita diretamente na partida do banco isolado, não por mock de GET.

- Cenário 1: quatro games digitados (`6×4`, `5×7`), vencedor B selecionado; após poll real de 12,5 s, valores e `aria-pressed` de B foram preservados, inputs e envio continuaram habilitados.
- Cenário 2: servidor passou a responder `result-pending` com sets `3×6`, `4×6` e vencedor A; o poll refletiu os valores, desabilitou os inputs e manteve A como `aria-pressed`.
- Cenário 3: voto B selecionado; após novo poll, o voto B continuou selecionado e o botão permaneceu em “Confirmar voto: dupla B”. Recheck dedicado em `match-vote-recheck.json`: clique real de mouse, 1 GET novo em 12,5 s, voto B preservado e sem remount (mesmo marcador de janela, 1 entrada de navegação).
- Evidência de poll: 6 requisições `GET` para a API da partida, 0 `POST`.
- JSON principal: `/tmp/opencode/elo-audit/match-validation.json`.
- Recheck do voto: `/tmp/opencode/elo-audit/match-vote-recheck.json`.

O `match-validation.json` original tem ordem de chaves não cronológica: `voteSelected` aparece antes de `afterPollTwo` no objeto, mas foi medido depois. No código, `afterPollTwo` é lido na linha 124 e o voto B é clicado nas linhas 128–130. O recheck confirma: antes do clique A selecionado; depois do clique B; após o poll B. Não houve remount HMR.
- Screenshots: `match-draft-typed.png`, `match-server-result.png`, `match-vote-preserved.png`, `match-server-result-viewport.png`, `match-vote-preserved-viewport.png`, `match-vote-recheck-before.png`, `match-vote-recheck-selected.png`, `match-vote-recheck-after.png`.

Screenshots em `/tmp/opencode/elo-audit/ui2-*.png` (temporários, fora do repositório), incluindo `ui2-logout-error.png`, `ui2-logout-error-mobile.png` e `ui2-notifications.png`.

## Pendências e limites

- `src/app/match/[id]/page.tsx` foi entregue pelo fixer de partida e validado em browser nesta rodada final. O arquivo não foi alterado por esta validação.
- `src/components/admin-directory.tsx` recebeu ajuste limitado de contraste ao ter seus diálogos migrados; a tabela não foi redesenhada.
- Login e telas de autenticação não receberam a varredura tipográfica global.
- `src/components/stat-card.tsx` deixou de ser usado no dashboard; não foi removido por estar fora do escopo.
- O `error.tsx` foi validado por typecheck e revisão de contrato, mas não foi provocado em runtime.
- O indicador “N” do Next em desenvolvimento aparece nos screenshots e não existe em produção.

## Próximos lotes

### Lote 2 — concluído

- card “Próxima ação” em `/match/[id]`;
- focus trap, Escape, retorno de foco e scroll lock nos modais ativos;
- confirmação antes de contestar resultado ou recusar partida;
- testes puros e validação em browser/CDP no banco isolado.

### Lote 3 — consistência

- unificar o painel do clube no AppShell;
- componentes base de botão/campo/empty state;
- revisão de contraste no diretório administrativo;
- paridade de copy e navegação com o app mobile.

## Lote 2 — plano de implementação

### Objetivo

Fechar o fluxo da partida e os diálogos ativos sem redesenhar o produto:

- card “Próxima ação” derivado do estado real da partida;
- CTA que leva à seção correspondente, nunca a uma ação impossível;
- confirmação acessível antes de recusar partida ou contestar resultado;
- foco preso, Escape, retorno de foco e scroll lock nos diálogos;
- consistência limitada no diretório administrativo ao tocar seus diálogos.

### Decisões

- `src/lib/match-next-action.ts` será uma função pura, testável, que recebe status, horários, presença, aceite e estado do jogador atual.
- Estados encerrados (`validated`, `cancelled`, `no-show`) não terão CTA de ação. Mostrarão apenas o resumo.
- A confirmação perigosa não fará POST ao abrir. O POST só ocorre depois de “Confirmar” no `ConfirmDialog`.
- `src/components/dialog.tsx` centralizará portal, `role`, foco inicial, Tab/Shift+Tab, Escape, clique no backdrop, retorno de foco e scroll lock com contador para múltiplos diálogos.
- `src/lib/dialog-focus.ts` terá o cálculo puro de próximo foco para teste.
- Modais ativos: saguão, desafio direto, cadastro de clube e edição administrativa. `room-card`/`room-composer` continuam fora por não serem renderizados.
- Nenhuma regra de backend, MMR, voto ou aceite será alterada.

### Arquivos previstos

- `src/app/match/[id]/page.tsx`
- `src/components/matchmaking-view.tsx`
- `src/components/club-register-form.tsx`
- `src/components/admin-directory.tsx`
- `src/components/dialog.tsx` (novo)
- `src/lib/dialog-focus.ts` (novo)
- `src/lib/match-next-action.ts` (novo)
- `src/lib/dialog-focus.test.ts` (novo)
- `src/lib/match-next-action.test.ts` (novo)
- `docs/ux-ui-plan.md`

### Estados da próxima ação

- `confirming`: confirmação pendente → CTA para participação; aceito → aguardar.
- `confirmed`: presença pendente antes do horário → aguardar; no horário → CTA para presença; presença incompleta → aguardar; quatro presentes antes do fim → aguardar; janela aberta → CTA para placar; prazo encerrado → aviso sem CTA.
- `result-pending`: voto pendente → CTA para votação; voto registrado → aguardar.
- `disputed`: análise do clube, sem CTA.
- `validated`, `cancelled`, `no-show`: encerrado, sem CTA.
- `open`/`full`: partida ainda não está no fluxo de confirmação, sem CTA.

### Validação planejada

- Testes puros de todos os estados e do cálculo de foco.
- Typecheck.
- Browser/CDP com banco isolado para:
  - CTA de próxima ação levando à seção;
  - confirmação de recusa sem POST antes de confirmar e cancelamento sem mudança;
  - confirmação de contestação idem;
  - foco inicial, Tab/Shift+Tab, Escape e retorno de foco;
  - scroll lock e restauração ao fechar;
  - screenshot/JSON em `/tmp/opencode/elo-audit`.


## Lote 2 — status da implementação

### Entregue

- `src/lib/match-next-action.ts`: regra pura para todos os estados de partida, com CTA apenas quando a ação é possível.
- `src/app/match/[id]/page.tsx`: card “Próxima ação” com link para `#participacao`, `#presenca`, `#placar` ou `#votacao`; foco movido para a seção; nenhuma ação em estados encerrados.
- `src/components/dialog.tsx`: portal, `role`, `aria-modal`, foco inicial, Tab/Shift+Tab presos, Escape, retorno de foco, scroll lock com contador e restauração de overflow/padding.
- `src/components/dialog.tsx` (`ConfirmDialog`): `role="alertdialog"`, foco inicial em “Voltar”, confirmação sem POST ao abrir.
- `src/app/match/[id]/page.tsx`: confirmação antes de “Não posso ir” e “Contestar resultado”; POST só depois de confirmar.
- `src/components/matchmaking-view.tsx`: saguão e desafio direto migrados para `Dialog`.
- `src/components/club-register-form.tsx` e `src/components/admin-directory.tsx`: modais migrados; fechamento, foco e scroll preservados.
- `room-card`/`room-composer` não foram alterados por não estarem renderizados.

### Testes

- `src/lib/dialog-focus.test.ts`: 5 testes de ordem de foco.
- `src/lib/match-next-action.test.ts`: 20 testes cobrindo `confirming`, `confirmed` antes/depois do início, presença incompleta, quatro presentes antes do fim, janela aberta, prazo encerrado, voto pendente/registrado, `disputed`, `validated`, `cancelled`, `no-show` e `open`.
- `npm run typecheck`: passou.
- Gate final: `npm test` aprovado, **33 arquivos e 387 testes**; `npm run typecheck`, `npm run build` e `git diff --check` aprovados.

### Evidência browser/CDP

Banco isolado `elo_padel_ui_audit_20261020`. GETs reais; POSTs de `acceptance`/`confirm` foram interceptados e respondidos com 200, sem ação real.

- `lote2-validation.json`:
  - CTAs da próxima ação e foco na seção;
  - confirmação de recusa: 0 POST antes, 0 após cancelar, 1 após confirmar;
  - confirmação de contestação: nenhum POST novo ao cancelar, 1 após confirmar;
  - `role="alertdialog"`, título vinculado, foco inicial em “Voltar”;
  - Shift+Tab/Tab presos;
  - Escape devolve foco ao gatilho;
  - overflow do body restaurado e scroll preservado.
- `lote2-next-action-matrix.json`: 15 estados com título/CTA conferidos, sem mock de GET.
- `lote2-multidialog.json`: dois diálogos empilhados; contador de scroll lock mantém `hidden` até o último fechar; foco inicial e retorno testados; empilhamento provocado por clique programático, não é fluxo de usuário.
- Screenshots: `lote2-next-action-confirming.png`, `lote2-confirm-decline.png`, `lote2-confirm-dispute.png`, `lote2-dialog-search.png`, `lote2-dialog-club.png`, `lote2-multidialog.png`.

### Limites

- Build, typecheck e suíte completa foram executados e aprovados pelo orquestrador após a integração final.
- Não houve unificação do painel do clube no AppShell nem trabalho no app mobile.
- O empilhamento de dois diálogos foi programático e serve para validar o contador de scroll lock; não existe fluxo de UI que abra os dois.
- O diretório administrativo recebeu apenas ajuste limitado de contraste, não redesign.


## Última revisão — diálogos responsivos e falhas

### Validação visual

Viewports testados: **390×844** e **768×1024**.

- Saguão, desafio direto, confirmação de recusa e confirmação de contestação:
  - painel dentro da viewport;
  - rodapé com ação principal visível;
  - corpo rolável quando necessário;
  - `body.style.overflow = hidden` enquanto aberto e restaurado ao fechar;
  - Escape fecha;
  - foco retorna ao botão de origem;
  - foco inicial correto: “Sozinho”, primeiro campo do desafio, “Voltar” nas confirmações.
- Nenhum bug visual que exigisse alteração em `dialog.tsx`.

Evidência: `/tmp/opencode/elo-audit/dialog-responsive-validation.json` e screenshots `dialog-{mobile,tablet}-{search,challenge,decline,dispute}.png`.

### Falhas de POST

Com POSTs interceptados por CDP, sem ação real:

- HTTP 500 na recusa e na contestação:
  - diálogo fecha;
  - `busy=false`;
  - ação original volta a ficar habilitada;
  - mensagem do servidor visível e legível;
  - reabrir a confirmação funciona.
- Falha de rede na recusa e na contestação:
  - mesmas garantias;
  - mensagem de conexão visível;
  - nova tentativa possível.

Evidência: `/tmp/opencode/elo-audit/dialog-failure-validation.json` e screenshots `dialog-failure-{decline,dispute}-{http500,network}.png`.

### Rascunho e voto após poll real

- GET real da API local; nenhum POST.
- Rascunho `6×4`, `5×7` e vencedor B preservados após 12,5 s e novo GET.
- Mudança autoritativa para `result-pending` refletiu `3×6`, `4×6`, vencedor A e inputs desabilitados.
- Voto B preservado após poll real; mesmo marcador de janela, uma navegação, sem remount.

Evidência: `/tmp/opencode/elo-audit/match-validation.json` e `/tmp/opencode/elo-audit/match-vote-recheck.json`.

### Honestidade da evidência

- **GET real** no banco isolado para a matriz de próxima ação, rascunho e voto.
- **POST interceptado/simulado** para HTTP 500 e falha de rede; nenhuma chamada real.
- Empilhamento de dois diálogos foi programático, não fluxo de usuário.
- Após esta validação de navegador, o gate final aprovou a suíte completa (387 testes), typecheck e build.

## Login e onboarding — arroba e disponibilidade

### Entregue

- Campo extraído para `src/components/handle-field.tsx`.
- Hook `src/lib/use-handle-availability.ts` com debounce de 400 ms, `AbortController` e proteção contra respostas fora de ordem.
- Regras puras em `src/lib/handle-availability-ui.ts`.
- Prefixo `@` preservado; rótulo natural “Escolha sua arroba”.
- Todos os textos do fluxo de login/cadastro passaram a usar “arroba” em vez de “handle”.
- Removidas as menções a SMS.
- Consulta só ocorre em cadastro por email ou onboarding social, com valor válido.
- Estados: neutro, verificando, disponível, ocupada, inválida e erro de rede.
- Status com `role="status"`, `aria-live="polite"`, `aria-describedby` e `aria-invalid`.
- Arroba ocupada/inválida bloqueia envio; verificação pendente ou resposta antiga também bloqueia.
- Erro de rede não declara disponibilidade; mostra retry e permite o envio autoritativo do servidor.
- Resend de verificação ignora a checagem de disponibilidade, preservando contas já registradas.
- Cidades e clubes do Gripo não foram alterados.

### Testes

- `src/lib/handle-availability-ui.test.ts`: 6 testes de busca válida, stale, bloqueio de envio, erro de rede e mensagens.
- `npm run typecheck`: passou.
- Testes focados de arroba: 6 passando.
- Gate final: suíte completa aprovada (38 arquivos, 406 testes), typecheck, build e `git diff --check` aprovados.
- Endpoint público `GET /api/auth/handle-availability`: disponibilidade sem dados pessoais, respostas sem cache e limite de 60 consultas/minuto por IP hasheado. Os cabeçalhos de IP dependem de proxy confiável; sem endereço, o bucket é compartilhado.
- Cadastro mantém validação autoritativa e constraint única. Conflitos PostgreSQL de arroba, inclusive envolvidos em `DrizzleQueryError.cause`, são mapeados para conflito de cadastro; reconhecimento da constraint coberto por testes, sem teste concorrente de integração nesta etapa.

### Browser/CDP

Viewports: 390×844 e 1440×1000.

- `@marina` real no banco isolado → ocupada, envio bloqueado.
- Arroba livre real → disponível, envio liberado.
- `ab` → inválida local, sem GET.
- Digitação rápida → apenas a última arroba consultada.
- Falha de rede → mensagem e “Tentar novamente”; retry resultou em disponível.
- Resend: `@marina` ocupada de verdade, disponibilidade e POST de cadastro simulados; o primeiro cadastro e o reenvio geraram 2 POSTs mockados, sem email real.
- `document.body.innerText` sem “handle” e sem “SMS” no formulário.

Evidência:

- `/tmp/opencode/elo-audit/handle-availability-validation.json`
- `/tmp/opencode/elo-audit/handle-checking-validation.json`
- `handle-mobile-neutral.png`
- `handle-mobile-checking.png`
- `handle-mobile-invalid.png`
- `handle-mobile-taken.png`
- `handle-mobile-available.png`
- `handle-mobile-network-error.png`
- `handle-mobile-resend.png`
- `handle-desktop-taken.png`
- `handle-desktop-available.png`

### Limites

- Onboarding social não foi exercitado em browser porque exige token Google; reutiliza o mesmo `HandleField` e o mesmo hook.
- POST de cadastro/reenvio e falha de rede foram simulados; nenhum email ou conta real foi criado.
- A consulta de disponibilidade foi real no banco isolado para ocupada, disponível e inválida local.

## Lote 3 — ajustes de busca, login e temporada

### Escopo

- `src/components/matchmaking-view.tsx`: clube filtrado pela cidade selecionada; limpar clube incompatível ao trocar cidade, ao abrir e ao enviar, tanto na busca quanto no desafio direto.
- `src/components/login-form.tsx`: remover chamadas duplicadas de cadastro/rodapé repetido e ajustar o botão oficial Google. Textos do saguão ficam em `matchmaking-view.tsx`.
- Google: manter `google.accounts.id.renderButton`; usar `filled_black`, `pill`, largura oficial de até 400 px e host com `color-scheme: normal`. Não estilizar iframe cross-origin nem criar botão falso.
- `src/app/season/page.tsx`: separar “sem temporada ativa” de “temporada ativa sem partidas”; evitar zeros que pareçam temporada quebrada; oferecer link ao saguão quando fizer sentido.
- Helpers/testes novos para filtro de clube e estado da temporada. Sem APIs, backend, DB, schema, mobile ou dependências.

### Decisões

- O contrato de busca usa `city: string`, então o filtro de clube é por cidade exata; cidades homônimas de UFs diferentes não podem ser separadas nesse contrato.
- Ao mudar a cidade, `clubId` é limpo se o clube atual não pertencer à nova cidade.
- Temporada inativa/ativa vazia não renderiza placar, marcos ou estatísticas zeradas. Temporada ativa com placar mantém os dados reais; jogador ainda sem posição recebe “—/jogue para entrar” em vez de zero.
- Google não terá overlay, iframe CSS cross-origin ou tema não documentado. O provável fundo branco vem do `color-scheme: dark` herdado pelo iframe; o host foi isolado com `color-scheme: normal` como correção mínima.

### Validação planejada

- Testes puros do filtro de clube e do estado da temporada.
- Typecheck e testes focados.
- Browser/CDP com banco isolado `elo_padel_ui_audit_20261020`, em 390/768/1440:
  - cidades diferentes, troca de cidade, clube incompatível, clube vazio e limpeza;
  - temporada inativa e ativa sem partidas;
  - Google via `renderButton` stub quando não houver credencial, declarando a limitação.

## Lote 3 — status e validação

### Entregue

- `src/lib/matchmaking-club-filter.ts`: clubes filtrados por cidade exata; preservação/limpeza de `clubId`.
- `src/components/matchmaking-view.tsx`: cidade do saguão e do desafio filtra o clube, limpa clube incompatível ao trocar cidade, sanitiza estado inicial e envia o payload já sanitizado.
- `src/components/matchmaking-view.tsx`: saguão sem “Nível definido automaticamente” e sem menção a nível no subtítulo; bloco “Depois de enviar” reduzido a uma linha de regra. Em `login-form.tsx`, chamada inferior “Criar cadastro” e rodapé repetido removidos; ausência de SMS preservada.
- Google: `renderButton` oficial preservado, `filled_black`, `large`, `continue_with`, `pill`, `logo_alignment:left`, largura entre 200 e 400; host com `color-scheme: normal`; botão de fallback customizado removido.
- `src/app/season/page.tsx`: estados distintos para temporada inativa, ativa sem partidas e ativa com placar; sem zeros/marcos falsos nos dois primeiros; jogador ainda sem posição recebe “—/jogue para entrar”.
- `src/lib/season-state.ts` e testes.

### Testes focados

- `src/lib/matchmaking-club-filter.test.ts`: 4 testes, incluindo cidade exata, clube incompatível e contrato sem UF.
- `src/lib/season-state.test.ts`: 3 testes.
- `src/lib/handle-availability-ui.test.ts`: 6 testes.
- Total focado: **13 passando**.
- `npm run typecheck`: passou.
- Gate final: suíte completa aprovada (**40 arquivos, 413 testes**), typecheck, build e `git diff --check` aprovados.

### Browser/CDP

Banco isolado `elo_padel_ui_audit_20261020`, sem produção.

- Matchmaking em 390, 768 e 1440:
  - Campinas lista somente Arena Campinas;
  - São Paulo lista Arena Norte e Padel House;
  - clube selecionado em Campinas é limpo ao trocar para São Paulo;
  - payload da busca: `city: "São Paulo"`, `clubId: ""`;
  - desafio direto tem o mesmo filtro e limpeza.
  - POST de busca interceptado; nenhum POST real.
- Temporada:
  - inativa: “Sem temporada ativa.”, sem estatísticas/marcos/placar;
  - ativa vazia: “Temporada em andamento.” e “O placar ainda está vazio.”, sem zeros;
  - ativa normal: dados existentes do banco isolado (340 pts, 9 vitórias, 3/4 marcos) — fixture, não produção.
- Login:
  - sem SMS, sem “handle” visível, sem chamada duplicada de cadastro;
  - sem Google configurado, o bloco Google não aparece e o texto não promete Google.
- Google com `renderButton` stub:
  - opções `filled_black/large/continue_with/pill/left`, largura 350 no mobile e 400 no desktop;
  - host `color-scheme: normal`;
  - nenhum botão fallback customizado.
  - **Não é validação visual do GIS real**, pois não havia credencial.

### Causa provável da moldura branca

Hipótese sustentada pelo código e por relatos técnicos: o `color-scheme: dark` global é herdado pelo iframe do GIS, que pode renderizar fundo/borda clara. O host foi isolado com `color-scheme: normal`, sem CSS no iframe cross-origin. A confirmação visual depende de credencial Google real; não foi feita.

`outline_dark` não foi usado. `size: large` foi mantido por altura/alvo e consistência com o formulário; `medium/small` desativaria personalização, mas reduziria a presença do botão.

### Evidência

- `/tmp/opencode/elo-audit/lote3-matchmaking-validation.json`
- `/tmp/opencode/elo-audit/season-state-validation.json`
- `/tmp/opencode/elo-audit/google-stub-validation.json`
- `lote3-search-club-campinas-{mobile,desktop}.png`
- `lote3-search-club-saopaulo-{mobile,desktop}.png`
- `lote3-challenge-club-campinas-{mobile,desktop}.png`
- `lote3-challenge-club-saopaulo-{mobile,desktop}.png`
- `season-{mobile,tablet,desktop}-inactive.png`
- `season-{mobile,tablet,desktop}-empty.png`
- `season-desktop-active.png`
- `login-clean-mobile.png`
- `login-clean-desktop.png`
- `login-google-stub-mobile.png`
- `login-google-stub-desktop.png`

### Limites

- Geometria real do iframe Google e eventual moldura só podem ser confirmadas com `GOOGLE_CLIENT_ID` real; o stub valida apenas opções e host.
- Cidades homônimas de UFs diferentes continuam indistinguíveis no contrato `city: string`.
- Temporada normal usa fixtures do banco isolado; não há dados de produção nesta validação.
- Onboarding social não foi exercitado em browser por exigir token Google.

## Lote 4 — edição de perfil (cidade e clube)

### Plano

- `src/components/profile-editor.tsx`: Dialog acessível reutilizando `Dialog`; ao abrir, carrega `GET /api/me/profile` e `GET /api/clubs` em paralelo, com loading, erro e retry. A edição fica limitada a cidade composta (cidade + UF + país) e clube principal. Nome, arroba e categoria não são editáveis.
- `src/lib/profile-edit-ui.ts`: helpers puros para chave composta de localidade, filtro de clubes pela localidade exata, limpeza de clube incompatível ao trocar cidade e identificação do clube pendente. Testes focados em `src/lib/profile-edit-ui.test.ts`.
- `src/components/profile-view.tsx`: botão “Editar perfil” abre o Dialog; um `GET` client ao montar atualiza o clube principal e mostra pendência após reload, sem alterar `src/app/profile/page.tsx`.
- A troca de cidade limpa o clube incompatível. “Sem clube principal” envia `clubId: null`. Falha de `PATCH` mantém seleção e Dialog abertos. Sucesso fecha o Dialog, atualiza o estado local, chama `router.refresh()` e dá feedback curto.
- O texto sobre aprovação só é afirmado depois de o backend devolver `clubStatus: 'pending'`; a UI não inventa sucesso quando o banco responde 503.
- A implementação de UI não altera backend; a frente de persistência adiciona `GET/PATCH /api/me/profile` e `src/lib/profile-edit.ts`, alinha a leitura do clube principal nas consultas e serializa edição/aprovação por usuário. Sem mudanças de schema, dependências ou mobile.

### Status e validação

- Dialog com foco inicial na cidade, Tab/Shift+Tab entre cidade e clube, Escape fecha e devolve foco ao botão “Editar perfil”; `body` com scroll travado durante a edição.
- Em 390/768/1440: painel dentro da viewport, rodapé visível, sem overflow horizontal.
- Cancelar após alterar cidade/clube: **0 PATCH**.
- PATCH real no banco isolado `elo_padel_ui_audit_20261020`:
  - Campinas + Arena Campinas gerou vínculo `pending`, com Padel House mantido como principal;
  - reload exibiu “Vínculo aguardando aprovação: Arena Campinas”;
  - “Sem clube principal” durante pendência cancelou o pedido e removeu o principal;
  - escolher Padel House (vínculo aprovado histórico) virou principal imediatamente;
  - “Sem clube principal” removeu o principal e o reload mostrou “Sem clube principal”.
- Falhas simuladas por CDP, declaradas como mock:
  - `GET /api/me/profile` 500 exibiu erro e “Tentar novamente”;
  - `PATCH` 500 e falha de rede mantiveram os campos selecionados, o Dialog aberto e uma mensagem de erro focável;
  - nenhum desses mocks foi tratado como sucesso.
- Gate final: **43 arquivos e 425 testes aprovados**, typecheck, build e `git diff --check` aprovados.
- Integração adicional executada: `tests/integration/profile-edit-db.test.ts`, usando `profile-edit.vitest.config.ts`, com opt-in `ALLOW_PROFILE_EDIT_DB_INTEGRATION=1` e `PROFILE_EDIT_TEST_DATABASE_URL` igual a `DATABASE_URL`. O teste recusa produção e aceita somente o banco isolado `elo_padel_ui_audit_20261020` em loopback, porta 15432. Cobriu localidade inválida, clube inativo/de outra UF, reabertura de vínculo rejeitado, reuso idempotente, duas edições concorrentes, remoção e troca para clube aprovado. Ratings, patentes, partidas, participantes e buscas permaneceram iguais; fixtures próprias removidas ao final.
- Teste de decisão do clube cobre solicitação cancelada entre leitura e lock: retorna 404 sem aprovar nem notificar.
- Evidência: `/tmp/opencode/elo-audit/profile-editor-validation.json`, `profile-editor-{mobile,tablet,desktop}.png`, `profile-editor-load-error.png`, `profile-editor-http-error.png`, `profile-editor-network-error.png`, `profile-pending-reload.png`, `profile-editor-pending.png`, `profile-pending-to-no-club.png`, `profile-editor-approved.png`, `profile-no-club.png`, `profile-editor-escape.json`.

### Limites

- A validação usa apenas o banco isolado e um usuário fixture; não houve acesso ao banco padrão/produção.
- Cidades homônimas são distinguidas por cidade + UF + país na UI, mas o contrato de busca existente continua recebendo apenas `city: string`; esse lote não altera esse contrato.
- Nenhum e-mail, SMS ou POST real para o Gripo foi enviado.
