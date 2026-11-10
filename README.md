# Elo Padel

Plataforma de competição contínua de padel projetada para conectar jogadores, clubes e ligas com partidas equilibradas, evolução de patentes e rankings dinâmicos.

O sistema combina uma experiência web completa com um aplicativo mobile nativo, integrando desde a busca de parceiros e adversários até a validação coletiva de resultados e a evolução de rating em temporadas competitivas.

---

## Recursos Principais

- **Matchmaking por Proximidade e GPS**: Busca inteligente de partidas baseada na localização geográfica do jogador, preferências de lados da quadra (drive/revés), disponibilidade de horário e compatibilidade de nível técnico.
- **Rating Estilo MMR com Bandas Progressivas**: Sistema de avaliação de habilidade baseado em MMR (Matchmaking Rating) com divisões, categorias e patentes, calibrado para equilibrar partidas solo ou em duplas formadas.
- **Temporadas e Pontos**: Divisão do ano esportivo em temporadas competitivas, acúmulo de pontos por vitórias e partidas disputadas, e tabelas de liderança (leaderboards) regionais.
- **Clubes e Quadras**: Cadastro de clubes parceiros, gestão de quadras e possibilidade de solicitação de filiação de atletas aos seus clubes locais.
- **Reservas Sincronizadas com Gripo**: Integração com a API do Gripo para checagem de disponibilidade de quadras em tempo real e redirecionamento contínuo para reserva.
- **Validação de Resultados e Presença**: Ciclo completo pós-jogo com confirmação de presença (check-in), envio de placar e votação mútua entre as duas duplas para validação transparente do resultado antes do cálculo de pontuação.
- **Painéis Especializados**:
  - **Jogador**: Perfil, histórico de partidas, estatísticas de temporada, lista de amigos, lobby de busca e desafios diretos.
  - **Clube**: Gestão de membros, consulta de partidas realizadas no local e resolução de eventuais contestações.
  - **Administrador**: Gestão de temporadas, clubes, parâmetros globais e monitoramento da plataforma.
- **Multiplataforma**: Aplicação web responsiva e aplicativo mobile nativo (iOS e Android).

---

## Tecnologias e Arquitetura

O projeto foi construído com as seguintes tecnologias:

### Web & Backend
- **Next.js 16 (App Router)**: Framework full-stack para renderização web e rotas de API.
- **React 19**: Biblioteca para interfaces declarativas e componentes de servidor.
- **Tailwind CSS**: Estilização baseada em classes utilitárias.
- **PostgreSQL**: Banco de dados relacional.
- **Drizzle ORM**: Modelagem de dados, schemas declarativos e geração de migrações tipadas.
- **postgres (melhor-sql/porsager)**: Driver SQL de alta performance para conexões com o PostgreSQL.
- **Resend**: Envio de e-mails transacionais (verificação de conta, redefinição de senha e notificações).
- **Zod**: Validação de schemas e payloads nas rotas de API.
- **Jose**: Assinatura e verificação segura de JSON Web Tokens (JWT) para autenticação.

### Mobile
- **React Native & Expo**: Desenvolvimento do aplicativo móvel cross-platform para Android e iOS.
- **NativeWind (Tailwind CSS)**: Estilização consistente e reativa no app móvel.
- **Expo Router**: Roteamento baseado em arquivos para mobile.
- **Expo Location & Push Notifications**: Serviços nativos de geolocalização e notificações push.

### Testes & Qualidade
- **Vitest & Vitest Browser**: Framework para execução de testes rápidos de unidade, rotas de API e integração de matchmaking.
- **TypeScript 5**: Tipagem estática rigorosa em todo o repositório.

---

## Estrutura do Projeto

```
elo-padel/
├── src/
│   ├── app/                 # Rotas do Next.js App Router (páginas web, APIs e painéis)
│   │   ├── (auth)/          # Telas de login, cadastro e onboarding web
│   │   ├── admin/           # Painel administrativo
│   │   ├── club/            # Painel do gestor de clube
│   │   ├── api/             # Endpoints REST (auth, matchmaking, partidas, clubes, etc.)
│   │   └── ...              # Telas do jogador (lobby, partidas, perfil, ranking)
│   ├── components/          # Componentes React reutilizáveis da interface web
│   └── lib/                 # Núcleo de regras de negócio e infraestrutura
│       ├── db/              # Conexão PostgreSQL, instâncias Drizzle e schemas de tabelas
│       ├── domain/          # Lógica de domínio (MMR, cálculo de pontuação, partidas)
│       ├── integrations/    # Integrações externas (Gripo, Resend, provedores de geolocalização)
│       └── security/        # Hashing de senhas, controle de sessões e rate-limiting
├── mobile/                  # Aplicação mobile React Native com Expo
│   ├── app/                 # Rotas de navegação do Expo Router
│   ├── src/                 # Contextos de autenticação, hooks e componentes do app
│   └── eas.json             # Configuração de builds com Expo Application Services
├── drizzle/                 # Migrações SQL versionadas geradas pelo Drizzle Kit
├── scripts/                 # Scripts utilitários de desenvolvimento, seed e automações
│   ├── local-seed-test-players.ts # Criação de jogadores e temporada de teste para dev
│   ├── local-e2e-match.mjs        # Simulação local de fluxo E2E de partida
│   ├── sync-gripo-clubs.ts        # Script de sincronização de clubes via Gripo
│   └── backup-db.sh               # Utilitário de backup do banco de dados
├── tests/                   # Testes automatizados de API, integração e adversariais
├── docker-compose.yml       # Orquestração do banco de dados PostgreSQL e serviço web
└── package.json             # Dependências e scripts da aplicação web
```

---

## Como Rodar Localmente

### Pré-requisitos
- **Node.js**: Versão 22 ou superior recomendada.
- **npm**: Versão 10+.
- **Docker e Docker Compose**: Para execução do banco de dados PostgreSQL local.

---

### Passo a Passo

#### 1. Clonar o repositório e instalar dependências
```bash
git clone <url-do-repositorio>
cd elo-padel
npm ci
```

#### 2. Configurar as variáveis de ambiente
Copie o arquivo de exemplo para criar seu `.env`:
```bash
cp .env.example .env
```
Edite o arquivo `.env` para ajustar os valores conforme necessário (por padrão, as configurações já apontam para o PostgreSQL local configurado no Docker Compose).

#### 3. Subir o banco de dados PostgreSQL
Inicie o contêiner do PostgreSQL via Docker Compose:
```bash
docker compose up -d db
```

#### 4. Executar as migrações do banco de dados
Aplique as migrações existentes no banco de dados recém-criado:
```bash
npx drizzle-kit migrate
```
*(Ou utilize o atalho: `npm run db:migrate`)*

#### 5. Popular o banco com dados de teste (Opcional)
Para criar rapidamente 4 jogadores de teste (`@teste1`, `@teste2`, `@teste3`, `@teste4`) com senhas prontas (`elopadel123`) e uma temporada ativa:
```bash
npx tsx scripts/local-seed-test-players.ts
```

#### 6. Iniciar a aplicação web em modo de desenvolvimento
```bash
npm run dev
```
Acesse a aplicação no seu navegador em `http://localhost:3000`.

---

### Executando o Aplicativo Mobile (Opcional)

Para rodar o aplicativo mobile:
1. Acesse a pasta `mobile/`:
   ```bash
   cd mobile
   npm install
   ```
2. Inicie o Expo:
   ```bash
   npm run start
   ```
3. Use o aplicativo **Expo Go** no seu smartphone ou um emulador (Android Studio / simulador iOS) para ler o QR Code e interagir com o app.

---

## Testes e Qualidade de Código

### Testes Automatizados (Vitest)
O repositório possui uma ampla suíte de testes unitários, testes de rotas de API e testes de integração de matchmaking com Vitest:

```bash
# Executa todos os testes
npm test

# Executa testes em modo interativo/watch
npx vitest
```

### Checagem de Tipos (TypeScript)
Para validar todos os tipos estáticos do projeto sem gerar arquivos de build:

```bash
npx tsc --noEmit
```
*(Ou utilize o atalho: `npm run typecheck`)*

---

## Licença

Distribuído sob a licença MIT. Consulte o arquivo [LICENSE](LICENSE) para obter mais informações.
