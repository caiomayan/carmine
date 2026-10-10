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

`pnpm dev` sobe o Postgres e o Valkey (`infra/docker-compose.yml`), aplica as migrações e roda a API em modo watch em http://localhost:3333 (health check em `/api/health`, documentação em `/api/docs`).

- A API lê `apps/api/.env.example`; para mudar algo, crie `apps/api/.env` só com as variáveis que mudam.
- Só a infraestrutura: `pnpm infra:up` / `pnpm infra:down` (ou `docker compose -f infra/docker-compose.yml up -d`).
- Portas ocupadas: `POSTGRES_PORT` e `VALKEY_PORT` mudam as portas do Compose (ajuste as URLs no `.env`).

## Testes e verificações

```sh
pnpm lint        # Biome
pnpm typecheck
pnpm test        # unitários + integração (Testcontainers; precisa do Docker rodando)
pnpm build

dotnet test --solution plugins/Carmine.Plugins.slnx
```

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

Com a API no ar (`pnpm dev`), suba o servidor e procure no console a linha `Carmine.Hello: API no ar (...)`:

```powershell
& 'C:\carmine\cs2-server\game\bin\win64\cs2.exe' -dedicated -console +sv_lan 1 +game_type 0 +game_mode 1 +map de_dust2
```

`css_plugins list` no console confirma que o `Carmine.Hello` carregou. A URL e a chave da API ficam em `game\csgo\addons\counterstrikesharp\configs\plugins\Carmine.Hello\Carmine.Hello.json`.
