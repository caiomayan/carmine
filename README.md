# Carmine

## Pré-requisitos

- Node.js 24 LTS (`.nvmrc`) e pnpm 12 (`npm i -g pnpm@12.11.2`; a versão exata está em `package.json`).
- Docker (Docker Desktop no Windows) para o Postgres e o Valkey locais e para os testes de integração.
- .NET SDK 10 para os plugins (`plugins/global.json`).
- Windows + PowerShell 7 para o servidor CS2 local.

## Subir o ambiente

```sh
pnpm install
pnpm dev
```

`pnpm dev` sobe o Postgres e o Valkey (`infra/docker-compose.yml`), aplica as migrações e roda em modo watch:

- o web em http://localhost:3000 (Next.js, `apps/web`);
- a API em http://localhost:3333 (health check em `/api/health`, documentação em `/api/docs`).

- A API lê `apps/api/.env.example`; para mudar algo, crie `apps/api/.env` só com as variáveis que mudam.
- Um Ctrl+C encerra tudo (turbo, watchers e as portas 3000/3333). No Windows, `infra/scripts/dev.mjs` põe o `pnpm.exe` antes do `pnpm.cmd` no PATH do turbo: com o shim em lotes, o cmd.exe parava em "Deseja finalizar o arquivo em lotes (S/N)?" e o turbo ficava em "3 tasks shutting down...".
- Só a infraestrutura: `pnpm infra:up` / `pnpm infra:down` (ou `docker compose -f infra/docker-compose.yml up -d`).
- Portas ocupadas: `POSTGRES_PORT` e `VALKEY_PORT` mudam as portas do Compose (ajuste as URLs no `.env`).

## Testes e verificações

```sh
pnpm lint        # Biome
pnpm typecheck
pnpm test        # unitários + integração (Testcontainers; precisa do Docker rodando)
pnpm build

# E2E do web (Playwright + axe) contra os builds de produção; na primeira vez, instale o Chromium.
# O Playwright sobe a Steam OpenID falsa (:4555), a API (:3333) e o web (:3000) e precisa do
# Postgres e do Valkey no ar (pnpm infra:up); o que já estiver rodando nessas portas é reaproveitado.
pnpm --filter @carmine/web exec playwright install chromium
pnpm --filter @carmine/web test:e2e
# Também contra o next dev (pega erros do servidor que só o dev mostra no console):
E2E_DEV=1 pnpm --filter @carmine/web test:e2e

dotnet test --solution plugins/Carmine.Plugins.slnx
```

Web: textos da interface só em `apps/web/messages/pt-BR.json` (next-intl); tokens da identidade 2c em `apps/web/src/app/tokens.css`. Imagem: `docker buildx build -f infra/docker/web.Dockerfile --platform linux/amd64,linux/arm64 .`.

Mudou um contrato da API? Rode `pnpm --filter @carmine/api openapi:generate` e faça commit do `apps/api/openapi.json`: o cliente C# dos plugins é gerado dele e a CI falha se estiver desatualizado.

## Servidor CS2 local

`infra/scripts/install-cs2-server.ps1` instala SteamCMD, o servidor dedicado do CS2, Metamod:Source e CounterStrikeSharp, compila os plugins e os copia com a config apontando para a API local. Padrões: `C:\carmine\cs2-server` e `C:\carmine\steamcmd` (mude com `-ServerDir` e `-SteamCmdDir`).

```powershell
# Primeira vez: baixa ~60 GB do CS2 (só com -DownloadCs2).
./infra/scripts/install-cs2-server.ps1 -DownloadCs2

# Depois de mudar um plugin: recompila e copia.
./infra/scripts/install-cs2-server.ps1 -Steps Plugins

# Depois de um update do CS2 (que sobrescreve o gameinfo.gi):
./infra/scripts/install-cs2-server.ps1 -DownloadCs2 -Steps SteamCmd,Cs2,Metamod
```

### Cadastrar o servidor na API

Cada Servidor Carmine se autentica na API com uma chave própria (`Authorization: Bearer <chave>`). A API guarda só o hash; a chave aparece **uma única vez**, ao ser gerada:

```sh
pnpm --filter @carmine/api build
pnpm --filter @carmine/api servers create --name local --mode retake --address 127.0.0.1:27015
pnpm --filter @carmine/api servers rotate-key --name local   # gera outra; a anterior para na hora
pnpm --filter @carmine/api servers list
```

Na imagem Docker: `docker run --rm --env-file <...> <imagem> node dist/game-servers/servers.cli.js create ...`.

Cole a chave em `ApiKey` no `game\csgo\addons\counterstrikesharp\configs\plugins\Carmine.Core\Carmine.Core.json` (o script cria o arquivo com a URL da API).

### Subir

Com a API no ar (`pnpm dev`), suba o servidor e procure no console a linha `Carmine.Core: API no ar (...)`:

```powershell
& 'C:\carmine\cs2-server\game\bin\win64\cs2.exe' -dedicated -console +sv_lan 1 +game_type 0 +game_mode 1 +map de_dust2
```

`css_plugins list` no console confirma que o `Carmine.Core` carregou. Com a API fora do ar, os connects ficam em `addons\counterstrikesharp\data\Carmine.Core\pending-connects.json` e são reenviados a cada `RetryIntervalSeconds` (padrão 15 s).

## Login Steam no site

O web e a API ficam na mesma origem: o navegador chama sempre `/api/*` (ADR 0015). Em desenvolvimento o Next repassa `/api/*` para a API (`API_URL` no `apps/web/.env`, padrão `http://localhost:3333`); em produção quem separa é o Cloudflare Tunnel. A API precisa saber a origem pública do web em `PUBLIC_WEB_URL` (padrão `http://localhost:3000`).

Para entrar sem a Steam real (e sem internet), use a Steam OpenID falsa, que aprova todo login como o SteamID escolhido:

```sh
pnpm --filter @carmine/contracts build
pnpm --filter @carmine/api fake-steam 76561198000000001   # escuta em http://127.0.0.1:4555
# no apps/api/.env: STEAM_OPENID_URL=http://127.0.0.1:4555/openid/login
```

Depois, "Entrar" na barra superior (ou `http://localhost:3000/entrar`) faz o login completo. Para entrar como outra Conta sem reiniciar a Steam falsa, crie no navegador o cookie `fake_steam_id=<SteamID64>` no host `127.0.0.1`; `fake_steam_action=cancel` simula a desistência na Steam. Mutações com sessão exigem o cabeçalho `x-csrf-token` com o valor do cookie `carmine_csrf` (ou do `csrfToken` de `GET /api/me`).

## Rate limit e IP real

As rotas da API são limitadas por política (`@RateLimit`), com contagem no Valkey; os limites mudam por `RATE_LIMIT_*_PER_MINUTE`. Atrás do Cloudflare Tunnel, o IP do visitante vem de `CF-Connecting-IP`, aceito só de `TRUSTED_PROXIES` (vazio em desenvolvimento). Políticas, falha segura e a configuração da S09: [docs/operacao/rate-limit-e-ip-real.md](docs/operacao/rate-limit-e-ip-real.md).

## Steam Web API

Os avatares das Contas vêm da Steam Web API. Crie a chave em https://steamcommunity.com/dev/apikey e coloque-a só no `apps/api/.env` local (`STEAM_WEB_API_KEY=...`), nunca no repositório. Sem a chave, as Contas ficam com o avatar neutro.
