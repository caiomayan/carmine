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
# O E2E usa um banco próprio, carmine_e2e (E2E_DATABASE_URL), esvaziado a cada execução: nada vai
# para o banco de desenvolvimento. Com o pnpm dev no ar (API no banco de dev), o E2E para e avisa.
pnpm --filter @carmine/web exec playwright install chromium
pnpm --filter @carmine/web test:e2e
# Também contra o next dev (pega erros do servidor que só o dev mostra no console):
E2E_DEV=1 pnpm --filter @carmine/web test:e2e

dotnet test --solution plugins/Carmine.Plugins.slnx
```

Web: textos da interface só em `apps/web/messages/pt-BR.json` (next-intl); tokens da identidade 2c em `apps/web/src/app/tokens.css`. Imagem: `docker buildx build -f infra/docker/web.Dockerfile --platform linux/amd64,linux/arm64 .`.

Mudou um contrato da API? Rode `pnpm --filter @carmine/api openapi:generate` e faça commit do `apps/api/openapi.json`: o cliente C# dos plugins é gerado dele e a CI falha se estiver desatualizado.

## Servidor CS2 local

`infra/scripts/install-cs2-server.ps1` instala SteamCMD, o servidor dedicado do CS2, Metamod:Source e CounterStrikeSharp, compila os plugins e os copia com a config apontando para a API local, e instala o `cs2-css-inventory-simulator` (sem modificação, ADR 0006), que lê o Loadout em `/api/equipped/v5` (convars em `game\csgo\cfg\carmine\inventory-simulator.cfg`, executado pelo `server.cfg`; o arquivo leva a chave do servidor, então rode a etapa depois de colar a `ApiKey` do `Carmine.Core`). Padrões: `C:\carmine\cs2-server` e `C:\carmine\steamcmd` (mude com `-ServerDir` e `-SteamCmdDir`).

```powershell
# Primeira vez: baixa ~60 GB do CS2 (só com -DownloadCs2).
./infra/scripts/install-cs2-server.ps1 -DownloadCs2

# Depois de mudar um plugin: recompila e copia.
./infra/scripts/install-cs2-server.ps1 -Steps Plugins

# Só o inventory-simulator (S05; -InvSimVersion muda a versão, -ApiBaseUrl a API):
./infra/scripts/install-cs2-server.ps1 -Steps InventorySimulator

# Depois de um update do CS2 (que sobrescreve o gameinfo.gi):
./infra/scripts/install-cs2-server.ps1 -DownloadCs2 -Steps SteamCmd,Cs2,Metamod
```

### Cadastrar o servidor na API

Cada Servidor Carmine se autentica na API com uma chave própria (`Authorization: Bearer <chave>`). A API guarda só o hash; a chave aparece **uma única vez**, ao ser gerada:

```sh
pnpm --filter @carmine/api build
pnpm --filter @carmine/api servers create --name local --mode retake --address 127.0.0.1:27015
pnpm --filter @carmine/api servers rotate-key --name local   # gera outra; a anterior para na hora
pnpm --filter @carmine/api servers list                      # --all mostra também os aposentados
pnpm --filter @carmine/api servers retire --name local       # ou --prefix e2e- para vários de uma vez
```

Aposentar tira o servidor da lista pública e do painel e a chave para de valer na hora; a linha fica (o log de auditoria aponta para ela) e o nome continua reservado. Para limpar o banco de dev dos servidores que os E2E antigos deixaram: `servers retire --prefix e2e-`.

Na imagem Docker: `docker run --rm --env-file <...> <imagem> node dist/game-servers/servers.cli.js create ...`.

Cole a chave em `ApiKey` no `game\csgo\addons\counterstrikesharp\configs\plugins\Carmine.Core\Carmine.Core.json` (o script cria o arquivo com a URL da API).

### Subir

Com a API no ar (`pnpm dev`), suba o servidor e procure no console a linha `Carmine.Core: API no ar (...)`:

```powershell
& 'C:\carmine\cs2-server\game\bin\win64\cs2.exe' -dedicated -console +sv_lan 1 +game_type 0 +game_mode 1 +map de_dust2
```

`css_plugins list` no console confirma que o `Carmine.Core` e o `InventorySimulator` carregaram. O Loadout é aplicado no connect e com `!ws` (cooldown de 30 s); a API guarda a resposta em cache e a invalida a cada mudança. Com a API fora do ar, os connects ficam em `addons\counterstrikesharp\data\Carmine.Core\pending-connects.json` e são reenviados a cada `RetryIntervalSeconds` (padrão 15 s), e o jogador entra com as Armas padrão e o aviso "Não conseguimos carregar seu Loadout agora; tente !ws em alguns minutos".

## Login Steam no site

O web e a API ficam na mesma origem: o navegador chama sempre `/api/*` (ADR 0015). Em desenvolvimento o Next repassa `/api/*` para a API (`API_URL` no `apps/web/.env`, padrão `http://localhost:3333`); em produção quem separa é o Cloudflare Tunnel. A API precisa saber a origem pública do web em `PUBLIC_WEB_URL` (padrão `http://localhost:3000`).

Para entrar sem a Steam real (e sem internet), use a Steam OpenID falsa, que aprova todo login como o SteamID escolhido:

```sh
pnpm --filter @carmine/contracts build
pnpm --filter @carmine/api fake-steam 76561198000000001   # escuta em http://127.0.0.1:4555
# no apps/api/.env: STEAM_OPENID_URL=http://127.0.0.1:4555/openid/login
```

Depois, "Entrar" na barra superior (ou `http://localhost:3000/entrar`) faz o login completo. Para entrar como outra Conta sem reiniciar a Steam falsa, crie no navegador o cookie `fake_steam_id=<SteamID64>` no host `127.0.0.1`; `fake_steam_action=cancel` simula a desistência na Steam. Mutações com sessão exigem o cabeçalho `x-csrf-token` com o valor do cookie `carmine_csrf` (ou do `csrfToken` de `GET /api/me`).

## Inventário e VIP

O Inventário (S04) fica em `/api/inventory` (documentação em `/api/docs`), sempre da Conta da sessão; as mutações exigem `x-csrf-token`. O Item vai no formato `CS2BaseInventoryItem` da `@ianlucas/cs2-lib` e é validado na API contra o catálogo da mesma versão que o web usa (`catalog:` do `pnpm-workspace.yaml`): para atualizar a lib, mude a versão lá e rode `pnpm install`. Os erros têm código estável (`INVENTORY_ERROR_CODES` em `packages/contracts/src/inventory.ts`).

Agentes, music kits, StatTrak e nametag exigem um Período VIP ativo. A Staff concede e revoga VIP pelo painel (S07) ou pelo CLI; toda ação vai para o log de auditoria (`staff_audit_log`: autor, ação, alvo, motivo e horário) e invalida o `equipped/v5` da Conta. A Conta precisa existir: jogue ou faça login antes.

```sh
pnpm --filter @carmine/api build
# --by: o SteamID64 de quem da Staff está fazendo; --reason: o motivo (obrigatório)
pnpm --filter @carmine/api vip grant --steam-id 76561198000000001 --days 30 --by 76561198000000002 --reason "beta"   # soma ao Período ativo
pnpm --filter @carmine/api vip revoke --steam-id 76561198000000001 --by 76561198000000002 --reason "fim do teste"  # acaba agora
pnpm --filter @carmine/api vip status --steam-id 76561198000000001   # VIP e as últimas ações da Staff
```

## Loadout e Presets

O Loadout (S05) é o Preset ativo: `GET /api/loadout` traz todos os slots (`weapon_<modelo>`, `knife`, `gloves` e `agent` por lado; `musicKit` sem lado) e `POST /api/loadout/{equip,unequip,assign}` o mudam (o `assign` com o `previous` da resposta é o Desfazer). `/api/presets` cria (VIP, até 20), renomeia, ativa e apaga Presets; sem VIP, os extras ficam somente leitura. O `equipped/v5` aplica a regra do VIP na resposta: sem Período ativo, agentes e music kits ficam fora e StatTrak e nametag saem dos Itens. A cada abate, o plugin chama `POST /api/increment-item-stattrak` com a chave do Servidor Carmine (`invsim_apikey`, gravada pela etapa `InventorySimulator` a partir da `ApiKey` do `Carmine.Core`): o StatTrak do Item do Loadout sobe 1 se a Conta tem VIP; senão, a chamada é ignorada.

Na imagem Docker: `docker run --rm --env-file <...> <imagem> node dist/vip/vip.cli.js grant ...`.

## Servidores ao vivo e amigos jogando

O Carmine.Core manda um batimento (`POST /api/server/heartbeat`, com a chave do servidor) a cada `HeartbeatIntervalSeconds` (10 s) e 1 s depois de cada connect, disconnect e troca de mapa: o mapa, os SteamID64 dos jogadores humanos e as vagas públicas (`PublicSlots` no `Carmine.Core.json`; 0 usa o `maxplayers`; no Retake, 9, sem a folga da Vaga reservada). A API guarda o último batimento no Valkey; sem batimento por `SERVER_OFFLINE_AFTER_SECONDS` (45 s) o servidor fica offline, e uma varredura a cada `LIVE_SERVERS_SWEEP_SECONDS` (5 s) avisa a home. Com a API fora, nada fica em fila (o próximo batimento leva o estado inteiro) e o log do servidor mostra só a queda e a volta.

- `GET /api/servers`: a lista pública (Modo, nome, endereço, região, mapa, jogadores/vagas, estado online/lotado/offline) e o resumo do rodapé.
- `GET /api/servers/live`: a mesma lista por SSE (ADR 0016), logo ao conectar e a cada mudança.
- `GET /api/me/friends-playing`: os amigos Steam da Conta da sessão jogando agora (`ok`), a lista de amigos privada (`private`) ou a Steam indisponível (`unavailable`, também sem `STEAM_WEB_API_KEY`). A lista de amigos fica 60 s em cache no Valkey (15 s com a Steam fora); quem está jogando é sempre o atual.

Para ver sem um CS2 de verdade, mande o batimento à mão com a chave de um servidor cadastrado:

```sh
curl -X POST http://localhost:3333/api/server/heartbeat -H "Authorization: Bearer <chave>" \
  -H "Content-Type: application/json" -d '{"map":"de_mirage","players":["76561198000000002"],"maxPlayers":9}'
curl -N http://localhost:3333/api/servers/live   # Ctrl+C para sair
```

## Moderação e painel da Staff

A S07 traz os papéis da Staff (Dono, Admin, Moderador), as Punições (ban, mute, gag, kick e aviso, com Categoria de infração e motivo interno) e o painel em `/api/staff/*` (documentação em `/api/docs`, permissões em `STAFF_PERMISSIONS` de `packages/contracts/src/staff.ts`). Toda ação de Staff vai para o `staff_audit_log`, consultável em `GET /api/staff/audit`.

O primeiro Dono nasce pelo CLI (no painel, só um Dono altera papéis). A Conta precisa ter feito login no site:

```sh
pnpm --filter @carmine/api build
pnpm --filter @carmine/api staff grant --steam-id 76561198000000001 --role owner --by 76561198000000001 --reason "fundador"
pnpm --filter @carmine/api staff revoke --steam-id 76561198000000002 --by 76561198000000001 --reason "saiu da Staff"
pnpm --filter @carmine/api staff list
```

Na imagem Docker: `docker run --rm --env-file <...> <imagem> node dist/staff/staff.cli.js grant ...`.

- O Carmine.Core recebe as Punições na resposta do batimento e do connect (ADR 0017): ban e kick mostram o motivo no chat, no centro e no console e tiram o jogador em 5 s; mute desliga a voz; gag bloqueia o chat (comandos de uma palavra, como `!ws`, passam); aviso vai no chat.
- O ban derruba as sessões do site da Conta; num novo login, o site fica só leitura (403 `account_banned`).
- O hostname vira `Carmine | <nome de vitrine> | <código>` quando a Staff define os dois em `PATCH /api/staff/servers/{id}`.
- Ban por cheat exige uma testemunha mencionada (`witness`, da plataforma ou não) ou o link da evidência (`evidenceUrl`), ou os dois. O Perfil público só mostra "Cheat" com a evidência; só com testemunha, mostra "Violação das regras".
- No Perfil, o selo da Punição ativa é público; o histórico só vem para quem está logado (`sanctions.history` nulo para o visitante; o web repassa a sessão). Nenhum Perfil é indexado por buscadores (`noindex`).
- `!chat off` (ou `css_chat off` no console) oculta para o jogador o chat dos outros jogadores; `!chat on` volta. A escolha fica na Conta (`PUT /api/server/players/{steamId}/chat-preference`) e volta em cada connect. Com gag, o `!chat off` no chat é bloqueado como qualquer mensagem; o console funciona.
- As mensagens do jogo apontam para `<host do PUBLIC_WEB_URL>/regras#recurso`.

## Exclusão de dados

Um pedido de exclusão (LGPD) anonimiza a Conta: pelo painel da Staff (só o Dono) ou pelo CLI. Procedimento completo, o que some e o que fica: [docs/operacao/exclusao-de-dados.md](docs/operacao/exclusao-de-dados.md).

```sh
pnpm --filter @carmine/api accounts anonymize --public-id 10016 --by <SteamID64 do Dono> --reason "Pedido de exclusão, protocolo 12"
```

## Rate limit e IP real

As rotas da API são limitadas por política (`@RateLimit`), com contagem no Valkey; os limites mudam por `RATE_LIMIT_*_PER_MINUTE`. Atrás do Cloudflare Tunnel, o IP do visitante vem de `CF-Connecting-IP`, aceito só de `TRUSTED_PROXIES` (vazio em desenvolvimento). Políticas, falha segura e a configuração da S09: [docs/operacao/rate-limit-e-ip-real.md](docs/operacao/rate-limit-e-ip-real.md).

## Steam Web API

Os avatares das Contas e as listas de amigos ("Seus amigos jogando agora") vêm da Steam Web API. Crie a chave em https://steamcommunity.com/dev/apikey e coloque-a só no `apps/api/.env` local (`STEAM_WEB_API_KEY=...`), nunca no repositório. Sem a chave, as Contas ficam com o avatar neutro e o bloco de amigos aparece como Steam indisponível.

Sem a Steam real, a Steam falsa (`pnpm --filter @carmine/api fake-steam`) responde também a Steam Web API na mesma porta: `STEAM_WEB_API_URL=http://127.0.0.1:4555` e qualquer `STEAM_WEB_API_KEY`. Nela nenhum perfil existe (avatar neutro), os SteamID64 de `76561198000000001` a `76561198000000999` são amigos de todos, `76561198000009001` tem a lista de amigos privada e `76561198000009002` faz a Steam falhar.
