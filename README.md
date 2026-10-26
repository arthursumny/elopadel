# Elo Padel

Camada competitiva contínua para jogadores de padel: partidas equilibradas, MMR, patentes, temporadas e ranking geográfico.

## Rodar localmente

Requisitos: Node.js 22+ e npm.

```bash
npm install
cp .env.example .env
docker compose up -d db
npm run db:push
npm run dev
```

Abra `http://localhost:3000`. O banco começa vazio: não existe jogador, clube, sala ou temporada demonstrativa. O administrador entra em `/admin/login` com a chave configurada em `ADMIN_KEY`, cadastra os clubes e define o e-mail/senha de acesso de cada clube em `/club/login`. Jogadores criam as próprias contas em `/login` com e-mail e senha; o formulário de cadastro pede uma senha inicial, mas a conta fica pendente até a confirmação do e-mail. Ao abrir o link, o jogador define a **senha definitiva**, que substitui a inicial; somente depois disso o login é liberado. Também é possível entrar com Google quando `GOOGLE_CLIENT_ID` estiver configurado. Em uma conta nova, o jogador informa nome, escolhe seu @handle, cidade, UF e sua categoria inicial. A conta começa na divisão II da categoria escolhida, com 50 pontos e patente provisória.

O cadastro por e-mail exige `EMAIL_PROVIDER_URL` e `EMAIL_PROVIDER_TOKEN` apontando para um provedor compatível com o contrato descrito em [`docs/OPERATIONS.md`](docs/OPERATIONS.md#e-mail-transacional). Sem esse adaptador, o cadastro responde 503 em vez de fingir que enviou a mensagem. Login por celular/OTP e login com Apple foram desativados; as rotas de OTP respondem 410, tokens Apple são rejeitados e as contas existentes não foram apagadas. A troca de ticket de sessão também está desativada (410). No fallback de Google em navegador no mobile, o retorno ao app usa somente deep link, sem troca de ticket.

## PostgreSQL

Com Docker:

```bash
docker compose up -d db
npm run db:push
```

Defina `DATABASE_URL` no `.env`. O schema está em `src/lib/db/schema.ts`; o modo recomendado é executar com PostgreSQL. `npm run db:seed` não cria dados fictícios: ele apenas confirma que o banco será mantido vazio.

O fluxo real de competição é: jogador se cadastra por e-mail e senha, confirma o e-mail definindo a senha definitiva → recebe um @handle público → pode buscar jogadores por nome/@handle e construir sua lista de amigos → solicita vínculo com clube → abre o saguão de busca e informa se entra solo ou convida um parceiro, os dias, a janela de horário, a cidade, o clube e o lado da quadra → em uma dupla, os dois aceitam buscar → o app combina quatro jogadores com ranking, lados e disponibilidade compatíveis → os quatro aceitam a partida formada → no horário, os quatro confirmam presença → depois da duração configurada, um informa o placar → cada jogador vota no vencedor → pelo menos três votos iguais, com um de cada dupla, validam o resultado. Para um desafio direto, o criador escolhe as duas duplas, propõe um horário e os outros três jogadores aceitam ou sugerem outro; quando todos aceitam, o desafio gera uma partida comum e segue exatamente o mesmo ciclo de presença, resultado, punição e MMR. Desafios ranqueados contra a mesma dupla ficam limitados a duas ocorrências em 14 dias. Qualquer divergência, como 2×2, bloqueia MMR e patente e envia a partida para análise do clube. Se o clube confirmar um no-show, o jogador recebe perda escalonada de MMR/pontos e suspensão ranqueada. Telefones permanecem privados e não são usados como identificador social.

## Scripts

- `npm run dev` — desenvolvimento.
- `npm run build` — build de produção standalone.
- `npm run start` — inicia o bundle standalone depois do build.
- `npm run typecheck` — checagem TypeScript.
- `npm test` — testes unitários do domínio.
- `npm run db:generate` — gerar migration Drizzle.
- `npm run db:migrate` — executar migrations.
- `npm run db:seed` — confirmar que o banco será mantido vazio.
- `npm run db:backup` — gerar um dump PostgreSQL no diretório definido por `BACKUP_DIR`.
- `npm run maintenance` — executar a manutenção automática com `APP_URL` e `MAINTENANCE_TOKEN`.

## Operação em produção

O checklist de deploy no Dokploy, migração, healthcheck, backup, configuração de Google/e-mail e cadastro do primeiro clube está em [`docs/OPERATIONS.md`](docs/OPERATIONS.md). As migrations `0014_email_auth` e `0015_player_session_versions` são aditivas. A `0015` versiona sessões de jogador: em produção, JWTs antigos sem o claim `sv` deixam de valer e o jogador precisa entrar novamente. O reset de senha também revoga as sessões anteriores. Clubes e administradores não usam esse claim. No deploy por Compose, use `elo_padel_db` como host do banco: somente o serviço web participa da rede compartilhada do Dokploy e o PostgreSQL fica na rede privada do projeto.

## Escopo

O Elo Padel não implementa reservas, pagamentos, disponibilidade de quadras ou torneios. O Gripo continua responsável por esses fluxos; o app armazena o clube/horário da partida e direciona o jogador para o link configurado do Gripo.
