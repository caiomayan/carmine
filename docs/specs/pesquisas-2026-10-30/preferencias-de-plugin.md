# Preferências de jogador nos plugins: inventário e proposta (2026-10-30)

Regra do dono (2026-10-29): **nenhuma preferência de jogador fica presa a um servidor.** Toda preferência vale na plataforma inteira, fica na Conta (guardada pela API) e é aplicada em qualquer servidor do Carmine daquele Modo. Este documento lista o que cada plugin fixado guarda hoje, como dá para ler e escrever de fora, e propõe o mecanismo.

Método: leitura do fonte nas versões fixadas em `infra/cs2/linux/versions.sh` (RetakesAllocator 3.0, Deathmatch v1.3.6, cs2-retakes 3.1.1, RockTheVote 2.4.0), mais os perfis em `infra/cs2/profiles`. Nada foi testado no jogo.

## Inventário

| Plugin | Preferência (por jogador) | Onde fica hoje | Escrever de fora | Ler de fora |
|---|---|---|---|---|
| **RetakesAllocator 3.0** (GPL-3.0) | Sorteio da AWP (slot `Preferred`, vale para os dois times) | SQLite do plugin (`allocator.db`, caminho do nosso perfil), por SteamID | **Explícito:** `css_gun awp` liga; `css_removegun awp` desliga (`OnWeaponCommandHelper`, `remove = true` zera o `Preferred`). O `css_awp` alterna (desliga se existir qualquer `Preferred`). | Nada público; só o arquivo SQLite |
| | Armas por time e tipo de round (pistola, half buy, full buy, secundária), `!guns` | SQLite | **Explícito:** `css_gun <arma> [T\|CT]` define; `css_removegun <arma> [T\|CT]` remove | Só o SQLite; o menu `!guns` grava direto, sem passar por comando |
| | Zeus (`css_zeus`) | SQLite | Só alterna | Só o SQLite |
| | Armas do inimigo (`css_enemy`) | SQLite | **Explícito:** `css_enemy disable\|t\|ct\|both` (exige a permissão; no nosso perfil está desligado) | Só o SQLite |
| **Deathmatch v1.3.6** (MIT) | Sons: `KillSound`, `HeadshotKillSound`, `KnifeKillSound`, `HitSound`, `NewModeSound`; mensagens `HudMessages`, `DamageInfo`; `OnlyHeadshot` (`!hs`), `NoPrimary` | **Memória do servidor, só na sessão** (`playerData[slot].Preferences`): o nosso perfil tem `Save Players Weapons: false`, então nada persiste. Com `true` o plugin usaria MySQL (`dm_players.preferences`) | Só alterna (`SwitchBooleanPrefsValue`), por atalho de comando ou pelo menu `!dm`; o menu não passa por comando | Nada público (a `IDeathmatchAPI` não tem get/set de preferência); dá por reflexão |
| | Armas primária e secundária por time (`!guns`) | Memória da sessão (MySQL se `Save Players Weapons`) | Comandos por arma (`CustomShortcuts`) e o menu | Idem |
| **cs2-retakes 3.1.1** (GPL-3.0) | Voz de anúncio do bombsite (`css_voices`) | Memória (`HashSet<CCSPlayerController>`), só na sessão | Só alterna | Nada |
| **RockTheVote 2.4.0** (sem licença) | Nenhuma por jogador (votos e indicações são por mapa) | — | — | — |
| **Carmine.Core** | `!chat off/on` | Conta, na API (`chatHidden`), aplicada no connect | Já é o padrão da regra | — |
| **Carmine (Loadout/skins)** | Loadout, Presets, nome de exibição | Conta, na API | Já cumpre a regra | — |

Observações:
- O RetakesAllocator aceita MySQL (`DatabaseProvider`), mas apontar todos os servidores para um MySQL comum deixaria a fonte fora da API: contraria a decisão do dono.
- Os comandos do alocador são `CLIENT_ONLY`; o Core os executa pelo jogador com `ExecuteClientCommandFromServer`. A resposta do alocador (`ReplyToCommand`) deve ir para o console do jogador, não para o chat: a confirmar no jogo.
- Nenhum dos dois plugins avisa quando a preferência muda; para a API saber, o Core precisa interceptar o comando ou ler o estado.

## Proposta

### Na API (um mecanismo, chaves por Modo)
- Tabela `account_game_preferences` (`account_id`, `mode`, `key`, `value jsonb`, `updated_at`), uma linha por preferência alterada; ausente = padrão do Modo. Sem SteamID na linha (ADR 0007, LGPD): apagar a Conta apaga as preferências.
- O connect já devolve o estado da Conta; ele passa a levar `preferences` (as do Modo do servidor). Escrita: `PUT /api/server/players/{steamId}/preferences/{key}` (valor explícito, idempotente) e, para os booleanos que o jogador alterna, `POST …/{key}/toggle` (a API inverte e devolve o novo valor).
- Chaves e valores válidos ficam em `packages/contracts` (um registro `preferenceKeys` por Modo). O padrão de cada chave também mora lá.
- Ficam de fora do site por enquanto; uma tela de "Preferências de jogo" no site pode ler a mesma tabela depois.

### No Core (um adaptador por preferência)
Cada preferência tem um adaptador pequeno: `Apply(player, value)` no connect (e no spawn, quando o plugin só aceita então) e `Capture` quando o jogador muda.
- **AWP (primeiro caso):** `Apply` = `css_gun awp ct` (liga) ou `css_removegun awp ct` (desliga); `Capture` = o Core passa a ser dono do `!awp`/`css_awp`: ouve o comando antes do alocador, chama o toggle da API, aplica o resultado e responde `Carmine · Você entrou/saiu do sorteio da AWP…`.
- **Armas do Retake (`!guns`):** `Apply` = `css_gun <arma> <time>` por slot guardado. `Capture`: o menu do alocador grava direto no SQLite; duas opções: (a) ler o `allocator.db` **só para leitura** (nunca escrever) na saída do jogador e a cada fim de round e mandar a diferença à API; (b) substituir o `!guns` por um menu do Carmine. A (a) é menor; a (b) é mais limpa e fica para depois.
- **Deathmatch (sons, HUD, `!hs`, `!noprimary`, armas):** o plugin não dá nem leitura nem escrita explícita. Duas opções:
  1. **Reflexão** sobre a instância pela capability `deathmatch` (pinada na v1.3.6, com teste que falha se o campo mudar): ler e gravar `playerData[slot].Preferences`. Sem alterar o plugin, frágil a atualização.
  2. **Fork MIT do Deathmatch** com um `GetPreference/SetPreference` na `IDeathmatchAPI` e um evento de mudança. Mais estável; passa a ser um plugin nosso para manter (e dá para propor ao autor).
  Recomendo (2) quando o DM entrar na regra, e (1) só como ponte.
- **`!voices`, zeus:** são toggles sem leitura. O `!voices` começa sempre ligado a cada sessão e só muda por comando, então o Core consegue guardar o estado contando os comandos; o zeus só com leitura do SQLite. Baixo valor: proponho **fora da v1**.

### Ordem proposta
1. AWP na Conta (PR `feat/awp-preferencia-na-conta`): tabela, contrato, toggle, adaptador, mensagens, boas-vindas. É o primeiro caso do mecanismo.
2. `!guns` do Retake (opção a).
3. Deathmatch (decidir fork ou reflexão; precisa também ligar a persistência das armas, que hoje não existe).
4. Regra no Contexto da spec, no `AGENTS.md` e o termo **Preferência de jogo** no `CONTEXT.md` (entram no PR da AWP, que é o primeiro a obedecer a regra).

### O que preciso que o dono/maestro decida
1. **Deathmatch:** fork MIT do plugin (recomendado) ou reflexão?
2. **`!guns` do Retake:** ler o SQLite do alocador só para leitura é aceitável? (O combinado era "nunca escrever direto no banco dele".)
3. `!voices` e zeus: ficam fora da v1?
4. O padrão de cada preferência por Modo (por exemplo: sons do DM ligados, AWP desligada) é decisão do dono; já temos os dois.
