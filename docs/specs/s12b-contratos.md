# S12b · Estatísticas detalhadas: contratos

Os contratos (Zod em `packages/contracts`, OpenAPI em `apps/api/openapi.json`) da S12b, publicados **antes** da implementação para o web (página do servidor, blocos do Perfil) e o plugin construírem em paralelo. Desenho, custo e decisões D1 a D6: `carmine-s12b-proposta.md`. Este PR só traz os contratos: as rotas novas respondem **501** (`apps/api/src/stats/s12b-pending.ts`) até os PRs da API entrarem, e nada grava nem lê tabela nova ainda.

## O que é opcional, e por quê

Todo campo novo de **entrada** (o que o plugin manda) é opcional: plugin velho com API nova, e o contrário, continuam funcionando. Todo campo novo de **saída** que pode faltar é `nullable`/`optional`, e o cliente nunca mostra zero no lugar de "não sei" (nada de número inventado).

O **Deathmatch** não tem placar de times e pode nem ter `round_end`: lá `match` é nulo, `team` é nulo, os rounds do dia são nulos e os mapas vêm das Sessões. O web trata esses nulos como "este Modo não tem isso", não como erro.

## Entrada (plugin → API)

| Onde | Campo | Tipo | Notas |
| --- | --- | --- | --- |
| `KillEvent` | `killerTeam` | `'ct' \| 't' \| null`, opcional | radar de armas por lado; ausente: a kill conta nas Estatísticas, não no radar |
| `RoundEndEvent` | `map` | `MapName`, opcional | mapa do round (a virada de mapa não engana) |
| `RoundEndEvent` | `roundNumber`, `scoreCt`, `scoreT` | `int`, opcionais | número do round no mapa (1 = primeiro) e placar **depois** do round |
| `SessionStartEvent` | `map` | `MapName`, opcional | mapa de entrada |
| `SessionEndEvent` | `maps` | `MapName[]` (máx. 8), opcional | mapas por onde a Sessão passou, em ordem |
| `ServerHeartbeat` | `match` | `MatchState \| null`, opcional | `{ round, ctScore, tScore, warmup }`; `round` é o **em andamento** |
| `ServerHeartbeat` | `scoreboard` | `ScoreboardEntry[]` (máx. 128), opcional | `{ steamId, team, kills, deaths, score }`; `players` segue sendo a presença |

## Saída (API → web)

| Endpoint | `operationId` | Schema | Privacidade |
| --- | --- | --- | --- |
| `GET /api/servers` e SSE `/api/servers/live` | (existentes) | `LiveServer.match?: MatchState \| null` | pública |
| `GET /api/servers/{id}/players` | `getServerPlayers` | `ServerPlayers` | Perfil privado = linha "Jogador privado" (sem `publicId`/avatar), conta no total (D2) |
| `GET /api/servers/{id}/today?date=` | `getServerToday` | `ServerToday` | pública, agregada |
| `GET /api/profiles/{publicId}/stats/activity?weeks=20` | `getProfileStatsActivity` | `ProfileActivity` | `canSeeStats` |
| `GET /api/profiles/{publicId}/stats/weapons?mode=all&limit=8` | `getProfileStatsWeapons` | `ProfileWeapons` | `canSeeStats` |
| `GET /api/profiles/{publicId}/sessions?limit=10` | `getProfileSessions` | `ProfileSessions` | `canSeeStats`; de fora só Modo, mapa, dia e duração (D1) |

`GET /api/profiles/{publicId}/stats/weekly` (a série de 8 semanas, do Relevo) **já existe** e é o "stats/weeks" da proposta: a S12b não o refaz.

Pontos que o cliente precisa saber:

- **Perfil privado** (`canSeeStats`): `visible: false`, listas vazias, `since: null`.
- **`since`** (`CalendarDay`): desde quando há dado detalhado ("coletando desde X"). `visible: true` com `since: null` é "ainda não coletando".
- **`ServerPlayers.scoreboard`** é `false` quando o servidor ainda não manda o placar por jogador (plugin velho): `team`, `kills`, `deaths` e `score` vêm nulos e a lista ordena por nome.
- **`ServerToday.hours`** tem sempre 24 entradas (0 a 23, Brasília). `rounds` é zero no Deathmatch; `players` (jogadores distintos na hora) é o que o Deathmatch mostra. `rounds` do dia é nulo no Deathmatch; `finalScore` de um mapa é nulo sem placar do plugin.
- **`ProfileSession`**: `startedAt`/`endedAt` só para a própria Conta; `live` só para a própria Conta e amigos.
- **Armas** (`StatWeapon`): lista fechada, a API normaliza o nome cru do jogo (`hkp2000` → `p2000`, `knife_t` → `knife`, `inferno` → `molotov`, o resto → `other`). Chave desconhecida no cliente: trate como `other`.
- **Erros**: 404 (Conta ou servidor desconhecido, ou aposentado), 400 (query fora do intervalo; `date` além de 7 dias atrás), 501 enquanto a implementação não entrou.

## Construir contra os contratos antes da API

Importe os tipos e schemas de `@carmine/contracts` (`ServerPlayers`, `serverTodaySchema`, ...) e use fixtures que passem no schema (`schema.parse(fixture)` no teste). O `apps/api/openapi.json` já descreve as rotas para o cliente C# do plugin.
