# Plano de eventos · v1.0.0

> Fonte única dos **nomes, quando disparam e propriedades** dos eventos de analytics do Carmine, para o PostHog, o GA4 e o BI (Metabase). Decisões e limites: [ADR 0021](../adr/0021-analytics-posthog-ga4-metabase.md). Linguagem do domínio: [`CONTEXT.md`](../../CONTEXT.md). Spec: seção "A1 · Analytics de produto" de [`docs/specs/mvp.md`](../specs/mvp.md).
>
> **Estado:** escrito antes da instalação (A1). Nada aqui está implementado. Os "pontos de disparo" foram lidos no código da API em 2026-10-20 (`apps/api/src`, a partir do commit `95be772`); quando o ponto exige uma pequena mudança em código existente, está dito.

## 1. Como ler este plano

- **Nome:** `snake_case` em PT-BR, sem acento, no formato `<coisa>_<particípio>` (`login_concluido`, `item_equipado`). O nome é um fato no passado; nunca um clique ("`botao_clicado`").
- **Fase:** `A1` (entra com a A1), `S14` (entra com o VIP pago; o plano já fixa o nome), `Web` (vem do navegador).
- **Identidade (`distinct_id`):** o `accounts.id` da Conta (UUID aleatório, interno, nunca exposto na API nem na interface). **Nunca** o SteamID64 nem o ID público (ADR 0021). Eventos marcados "anônimo" saem sem identidade e sem perfil de pessoa (`$process_person_profile: false`).
- **Horário:** o do fato, não o do envio (por exemplo, o `connectedAt` original do plugin).
- **Idempotência:** onde há um ID natural (sessão, Denúncia, pagamento, Conta), o `uuid` do evento no PostHog é `UUIDv5(namespace do Carmine, "<evento>:<id natural>")`, então reenviar não duplica. Nos demais é um UUID aleatório (analytics não é contabilidade; perder um evento ocasional é aceito).
- **Quando emitir:** sempre **depois** do commit da transação do caso de uso, sem esperar o envio e sem nunca deixar a requisição falhar por causa do analytics.
- **Quem nunca emite:** Conta anonimizada (S08), Conta com `analytics_opt_out` ligado (ADR 0021), ambiente de desenvolvimento e testes (sem chave do PostHog, o emissor é nulo).
- **Valores:** textos de lista fechada vêm em minúsculas, sem acento (`ct`, `tr`, `ambos`). Booleanos são `true`/`false`, nunca `0`/`1`. Inteiros são ≥ 0, salvo dito. Nenhuma propriedade é opcional-por-omissão: o que não se sabe vai como `null`.

### 1.1 Propriedades comuns (em todo evento)

| Propriedade | Tipo | Valores |
|---|---|---|
| `versao_plano` | texto | versão deste plano quando o evento foi emitido, `MAJOR.MINOR` (`1.0`) |
| `ambiente` | texto | `producao` ou `staging` |
| `origem_evento` | texto | `api` ou `web` |

### 1.2 Propriedades proibidas (em qualquer evento, de qualquer fase)

SteamID64; ID público; nome Steam; Nome de exibição; avatar; IP; user agent bruto vindo do servidor do jogo; **texto de chat**; **texto de nametag**; motivo escrito pela Staff; qualquer dado de Punição, ação da Staff ou conteúdo de Denúncia (quem denunciou, quem foi denunciado, o chat copiado); ID ou nome de usuário do Discord; CPF, nome e e-mail do Pagador; ID do pagamento do Mercado Pago em texto aberto; URL completa. Um evento que precise de qualquer um desses está desenhado errado.

### 1.3 Resumo

| # | Evento | Fase | Origem | Identidade |
|---|---|---|---|---|
| 1 | `pagina_vista` | A1 | Web | anônimo |
| 2 | `login_iniciado` | A1 | API | anônimo |
| 3 | `login_concluido` | A1 | API | Conta |
| 4 | `login_falhou` | A1 | API | anônimo |
| 5 | `conta_criada` | A1 | API | Conta |
| 6 | `item_adicionado` | A1 | API | Conta |
| 7 | `item_editado` | A1 | API | Conta |
| 8 | `item_removido` | A1 | API | Conta |
| 9 | `item_restaurado` | A1 | API | Conta |
| 10 | `item_recusado` | A1 | API | Conta |
| 11 | `recurso_vip_bloqueado` | A1 | API | Conta |
| 12 | `item_equipado` | A1 | API | Conta |
| 13 | `item_desequipado` | A1 | API | Conta |
| 14 | `equipar_desfeito` | A1 | API | Conta |
| 15 | `preset_criado` | A1 | API | Conta |
| 16 | `preset_ativado` | A1 | API | Conta |
| 17 | `preset_apagado` | A1 | API | Conta |
| 18 | `servidor_conectado` | A1 | API (jogo) | Conta |
| 19 | `sessao_de_jogo_encerrada` | A1 | API (jogo) | Conta |
| 20 | `nome_exibicao_alterado` | A1 | API | Conta |
| 21 | `nome_exibicao_revertido` | A1 | API | Conta |
| 22 | `nome_exibicao_recusado` | A1 | API | Conta |
| 23 | `perfil_privado_alterado` | A1 | API | Conta |
| 24 | `denuncia_enviada` | A1 | API (jogo) | Conta (denunciante) |
| 25 | `denuncia_recusada` | A1 | API (jogo) | Conta (denunciante) |
| 26 | `discord_vinculo_iniciado` | A1 | API | Conta |
| 27 | `discord_vinculado` | A1 | API | Conta |
| 28 | `discord_vinculo_falhou` | A1 | API | Conta |
| 29 | `discord_desvinculado` | A1 | API | Conta |
| 30 | `vip_compra_iniciada` | S14 | API | Conta |
| 31 | `vip_pago` | S14 | API | Conta |
| 32 | `vip_pagamento_recusado` | S14 | API | Conta |
| 33 | `vip_pagamento_expirado` | S14 | API | Conta |
| 34 | `vip_reembolsado` | S14 | API | Conta |
| 35 | `vip_expirado` | S14 | API | Conta |

Os caminhos abaixo são relativos a `apps/api/src`, salvo `Web`.

## 2. Eventos

### 2.1 Aquisição e Conta

#### 1. `pagina_vista` · A1 · Web · anônimo

- **Dispara:** no navegador, depois da hidratação, a cada navegação do App Router (um componente cliente no layout de `apps/web`). Biblioteca do PostHog em modo sem cookies (`cookieless_mode: 'always'`), sem `identify`, sem autocaptura. **Nunca** em `/staff`, `/dev` nem `/healthz`. O GA4 (abertura) envia o seu próprio `page_view`, com a mesma `rota`.
- **O que sai:** só as propriedades abaixo; o `before_send` reescreve a URL (ADR 0021), então `/10016` chega como `perfil`.
- **Propriedades:**
  - `rota` (lista fechada): `inicio`, `perfil`, `ranking`, `inventario`, `loadout`, `entrar`, `configuracoes`, `vip`, `minhas_compras`, `regras`, `termos`, `privacidade`, `reembolso`, `contato`, `outra`
  - `modo` (`retake` | `deathmatch` | `null`): só em `ranking`, vindo do `?modo=`
  - `logado` (booleano): se há sessão (o web já sabe; só o booleano sai)
  - `referenciador` (texto): domínio do site de origem (`discord.com`, `google.com`), ou `direto`, ou `interno`
  - `utm_source`, `utm_medium`, `utm_campaign` (texto, até 40 caracteres, `[a-z0-9_-]`, senão `null`)
  - mantidas do PostHog: `$device_type`, `$browser`, `$os` e o país derivado do IP (o IP é descartado em seguida)
- **Responde:** quantas pessoas chegam, de onde e por qual porta; que parte do site é usada (Perfil? Ranking? Inventário?); quanto do tráfego é celular; "primeira visita → login" no agregado (seção 3.1).

#### 2. `login_iniciado` · A1 · API · anônimo

- **Dispara:** `auth/auth.controller.ts` → `AuthController.start` (`GET /api/auth/steam/login`), depois de `login.start` devolver o redirecionamento para a Steam. Não dispara quando cai em `/entrar?erro=indisponivel`.
- **Propriedades:** `destino` (a mesma lista de `rota` acima, a partir do `returnTo`, `outra` se não reconhecido).
- **Responde:** quantas pessoas clicam em "Entrar com a Steam" e quantas terminam (`login_concluido` ÷ `login_iniciado`, por dia). Em que página a pessoa estava quando decidiu entrar.

#### 3. `login_concluido` · A1 · API · Conta

- **Dispara:** `AuthController.complete` (`GET /api/auth/steam/callback`), depois de `sessions.create`.
- **Propriedades:**
  - `primeiro_login` (booleano): foi este login que reivindicou a Conta (`firstLogin`)
  - `jogou_antes` (booleano): a Conta já tinha `firstConnectedAt` (a pessoa já tinha entrado num servidor)
  - `conta_criada_no_login` (booleano): a Conta não existia e nasceu agora. *Exige* que `AccountsService.claimOnLogin` devolva também se criou (hoje devolve `{ account, firstLogin }`)
  - `dias_desde_primeiro_connect` (inteiro ou `null`): dias entre o primeiro connect e este login; `null` se nunca jogou
  - `destino` (lista de `rota`)
- **Responde:** quanto da base descobre o site (jogou antes e veio depois vs. chegou pelo site); quanto tempo quem joga leva para abrir o site; qual a taxa de retorno ao site (logins repetidos por Conta e por semana).

#### 4. `login_falhou` · A1 · API · anônimo

- **Dispara:** `AuthController.complete`, ramo `!result.ok` e o `catch`; e o `LoginRateLimitFilter` (`auth/login-errors.ts`) quando responde o limite.
- **Propriedades:** `motivo` (`cancelado` | `invalido` | `indisponivel` | `limite`), os valores de `LoginError` do contrato.
- **Responde:** a Steam está nos derrubando? Quanta gente desiste na tela da Steam (`cancelado`) ou esbarra no limite de tentativas.

#### 5. `conta_criada` · A1 · API · Conta

- **Dispara:** `accounts/accounts.service.ts`, **só** quando `insertAccount` devolve uma linha nova: em `AccountsService.registerConnect` (via `upsertOnConnect`, origem `jogo`) e em `claimOnLogin` (via `claimInTransaction`, origem `site`). Um connect de Conta já existente (mesmo a primeira vez que ela joga) não dispara. Horário: o `connectedAt` original, no caso do jogo. `uuid` da Conta.
- **Propriedades:**
  - `origem` (`jogo` | `site`): onde a Conta nasceu
  - `modo` (`retake` | `deathmatch` | `null`): o Modo do servidor onde nasceu; `null` se nasceu no site. *Exige* passar o Servidor Carmine (`@CurrentGameServer()`) do `PlayerConnectsController` até o serviço
- **Responde:** quantas Contas novas por dia e por onde chegam (IP direto vs. site); alimenta a "origem dos jogadores" do mídia kit.

### 2.2 Inventário e Loadout

`tipo` nas propriedades abaixo é sempre: `arma` | `faca` | `luvas` | `agente` | `music_kit` (os `INVENTORY_ITEM_TYPES` do contrato). `item_id` é o id do Item no catálogo da `cs2-lib` (inteiro), que **não** é dado pessoal e diz quais skins as pessoas querem.

#### 6. `item_adicionado` · A1 · API · Conta

- **Dispara:** `inventory/inventory.ts` → `Inventory.add` (`POST /api/inventory/items`), depois da transação.
- **Propriedades:** `tipo`; `item_id`; `exclusivo_vip` (booleano: o Item usa agente, music kit, StatTrak ou nametag); `tem_stattrak` (booleano); `tem_nametag` (booleano; o texto **não** sai); `qtd_stickers` (0 a 5); `tem_charm` (booleano); `total_apos` (inteiro: Itens ativos no Inventário depois de adicionar).
- **Responde:** quantos montam um Inventário e quão rápido; o que escolhem (para o catálogo de "itens populares" do Inventário vazio); quanto do que se escolhe é VIP; quantos Itens por Conta (o limite de 300 faz sentido?).

#### 7. `item_editado` · A1 · API · Conta

- **Dispara:** `Inventory.replace` (`PUT /api/inventory/items/:uid`), depois do `UPDATE`.
- **Propriedades:** as mesmas de `item_adicionado`, menos `total_apos`.
- **Responde:** o editor é usado depois de adicionar (refinar float, seed, stickers) ou o Item fica como entrou? Vale investir no editor 3D?

#### 8. `item_removido` · A1 · API · Conta

- **Dispara:** `Inventory.remove` (`DELETE /api/inventory/items/:uid`), depois da transação.
- **Propriedades:** `tipo`; `item_id`; `em_uso` (booleano: estava equipado no Loadout ou em algum Preset, de `removed.usages`); `total_apos`.
- **Responde:** a pessoa remove Itens que usa (aviso de uso funcionou?); churn de Inventário.

#### 9. `item_restaurado` · A1 · API · Conta

- **Dispara:** `Inventory.restore` (`POST /api/inventory/items/:uid/restore`), quando o Item de fato volta (não quando já estava ativo).
- **Propriedades:** `segundos_ate_desfazer` (inteiro: do `deletedAt` até agora, ≤ `INVENTORY_RESTORE_WINDOW_SECONDS`).
- **Responde:** o "Desfazer" de 8 s salva remoção por engano? (`item_restaurado` ÷ `item_removido`.)

#### 10. `item_recusado` · A1 · API · Conta

- **Dispara:** `inventory/inventory-errors.filter.ts` → `InventoryErrorsFilter`, para todo `InventoryRejection`, **menos** `vip_required` (vai para o evento 11), `not_found` e `invalid_body` (ruído de cliente). Identidade pela sessão da requisição.
- **Propriedades:** `motivo` (o `InventoryErrorCode` estável do contrato: `inventory_full`, `wear_out_of_range`, `seed_out_of_range`, `too_many_stickers`, `stattrak_not_allowed`…); `operacao` (`adicionar` | `editar` | `restaurar`).
- **Responde:** onde o editor confunde ou o jogo recusa (a regra de float/seed é clara?); quantos esbarram no limite de 300 Itens.

#### 11. `recurso_vip_bloqueado` · A1 · API · Conta

- **Dispara:** `InventoryErrorsFilter` (código `vip_required`) e `loadout/loadout-errors.filter.ts` → `LoadoutErrorsFilter` (`vip_required` ao criar Preset; `preset_read_only`). *Exige* expor o `feature` (`agent`, `musicKit`, `statTrak`, `nameTag`) no `ItemRuleViolation` em vez de só o `field`.
- **Propriedades:** `recurso` (`agente` | `music_kit` | `stattrak` | `nametag` | `preset_extra` | `preset_somente_leitura`); `origem` (`inventario` | `loadout`).
- **Responde:** o que desperta vontade de VIP: o topo do funil de compra (S14) **por intenção**. Limite conhecido: se o cadeado da interface barrar antes da chamada, este evento só vê o que escapa dele; medir o clique no cadeado é do navegador e está fora da A1 (ADR 0021).

#### 12. `item_equipado` · A1 · API · Conta

- **Dispara:** `loadout/loadouts.ts` → `Loadouts.equip` (`POST /api/loadout/equip`), **só** se o slot mudou de fato (`previous.length > 0`, como o `listener.loadoutChanged`). *Exige* que `change()` devolva também o Preset (`active`, `main`).
- **Propriedades:** `tipo`; `item_id`; `slot` (o do contrato: `weapon_ak47`… `knife`, `gloves`, `agent`, `musicKit`); `lados` (`ct` | `tr` | `ambos` | `nenhum`, este para o music kit); `substituiu` (booleano: havia outro Item no slot); `preset_ativo` (booleano: o Preset editado é o ativo, ou seja, vai para o jogo); `preset_principal` (booleano).
- **Responde:** a etapa-chave do funil ("equipar"); qual o primeiro slot que as pessoas equipam; quem equipa em Preset inativo.

#### 13. `item_desequipado` · A1 · API · Conta

- **Dispara:** `Loadouts.unequip` (`POST /api/loadout/unequip`), nas mesmas condições de `item_equipado`.
- **Propriedades:** `slot`; `lados`; `preset_ativo`.
- **Responde:** a pessoa volta à Arma padrão? Isso é arrependimento ou limpeza?

#### 14. `equipar_desfeito` · A1 · API · Conta

- **Dispara:** `Loadouts.assign` (`POST /api/loadout/assign`, que o "Desfazer" do web usa), quando algum slot mudou.
- **Propriedades:** `slots_afetados` (inteiro ≥ 1).
- **Responde:** trocas por engano (`equipar_desfeito` ÷ `item_equipado`).

#### 15. `preset_criado` · 16. `preset_ativado` · 17. `preset_apagado` · A1 · API · Conta

- **Dispara:** `Loadouts.createPreset` (`POST /api/presets`), `Loadouts.activatePreset` (`POST /api/presets/:id/activate`), `Loadouts.deletePreset` (`DELETE /api/presets/:id`), depois da transação. O Preset principal nunca é criado nem apagado por aqui.
- **Propriedades:**
  - `preset_criado`: `copiado_do_atual` (booleano); `total_presets_apos` (inteiro)
  - `preset_ativado`: `total_presets` (inteiro)
  - `preset_apagado`: `era_ativo` (booleano); `total_presets_apos` (inteiro)
- **Responde:** o VIP usa os Presets? (o valor percebido do VIP, dado que os 20 Presets são o benefício mais concreto.) Quem tem Presets extras e deixa de ter VIP.

### 2.3 Jogo

#### 18. `servidor_conectado` · A1 · API (jogo) · Conta

- **Dispara:** `accounts/player-connects.controller.ts` → `PlayerConnectsController.register` (`POST /api/server/player-connects`), depois de `registerConnect`, com o horário `connectedAt` do plugin (se válido). Não dispara para Conta anonimizada.
- **Propriedades:**
  - `modo` (`retake` | `deathmatch`): do Servidor Carmine que autenticou
  - `servidor_codigo` (texto, o `code` do servidor, ex. `SP·1`)
  - `primeiro_connect` (booleano): `isFirstConnect`
  - `eh_vip` (booleano): `vip.active`, que o controller já calcula
  - `conta_reivindicada` (booleano): `claimedAt !== null`. *Exige* devolver o campo em `ConnectedAccount`
  - `itens_equipados` (inteiro ≥ 0): slots do Preset ativo com Item (a única consulta a mais do evento; são os mesmos dados que o `equipped/v5` lê)
  - `reenvio` (booleano): `connectedAt` mais de 60 s no passado (o plugin reenviou um connect que ficou na fila com a API fora)
- **Responde:** o passo "conectar no servidor"; **a promessa central**: quem conecta com `itens_equipados > 0` viu uma skin no jogo; novos vs. recorrentes; quanto do Modo vem de quem.
- **Limites:** reconexões contam; `!ws` e a troca de mapa não chegam à API como evento (o plugin só consulta o `equipped/v5`, que é público e por isso **não** emite evento: qualquer um poderia forjar).

#### 19. `sessao_de_jogo_encerrada` · A1 · API (jogo) · Conta

- **Dispara:** `stats/game-event-ingest.ts` → `GameEventIngest.ingest` (`POST /api/server/events`), para cada `sessionEnd` **novo** (não duplicado, pelo `fresh`) que `collectStats` (`stats/stats-deltas.ts`) aceita (`0 < duração ≤ 24 h`, Conta conhecida). *Exige* que `collectStats` devolva as sessões aceitas. Horário: o `at` do evento; `uuid` derivado do `id` do evento do plugin (UUID v7), então o reenvio do lote não duplica.
- **Propriedades:** `modo` (do `EventSource`); `duracao_segundos` (inteiro, 1 a 86.400).
- **Responde:** horas jogadas, sessões por semana, duração típica; o passo "jogar" do funil (`duracao_segundos ≥ 600`); a retenção diária (seção 3.3).
- **Limites:** uma Sessão sem fim (queda do servidor) não gera evento (ADR 0018). Os eventos do jogo em si (kill, dano, round) **não** vão para o PostHog. O início da Sessão também não: `servidor_conectado` já o cobre.

### 2.4 Perfil

#### 20. `nome_exibicao_alterado` · 21. `nome_exibicao_revertido` · 22. `nome_exibicao_recusado` · A1 · API · Conta

- **Dispara:** `accounts/account-settings.controller.ts` → `AccountSettingsController.changeName` (`PUT /api/me/display-name`) e `revertName` (`DELETE /api/me/display-name`), depois de `DisplayNames.change`/`revert`; e `accounts/display-name-errors.filter.ts` → `DisplayNameErrorsFilter` para as recusas.
- **Propriedades:**
  - `nome_exibicao_alterado`: `primeira_troca` (booleano: a Conta ainda não tinha nome próprio). O nome **não** sai.
  - `nome_exibicao_revertido`: nenhuma além das comuns.
  - `nome_exibicao_recusado`: `motivo` (`too_short` | `too_long` | `invalid_chars` | `offensive` | `too_soon` | `not_claimed`); sem o nome tentado.
- **Responde:** a troca de nome é usada? O filtro de palavras recusa demais (`offensive` alto numa base que não xinga)? O prazo de 7 dias (`too_soon`) atrapalha?

#### 23. `perfil_privado_alterado` · A1 · API · Conta

- **Dispara:** `AccountSettingsController.setPrivacy` (`PUT /api/me/privacy`), depois de `setProfilePrivate` devolver `true`.
- **Propriedades:** `privado` (booleano: o estado novo).
- **Responde:** quanta gente esconde as Estatísticas; ajuda a decidir o padrão do Perfil e a medir o impacto no Ranking.
- **Visitas ao Perfil e ao Ranking** não são evento da API: o Next lê a API no servidor, então a API não vê o visitante. Saem de `pagina_vista` (`rota = perfil` | `ranking`).

### 2.5 Denúncias

#### 24. `denuncia_enviada` · 25. `denuncia_recusada` · A1 · API (jogo) · Conta (denunciante)

- **Dispara:** `reports/server-reports.controller.ts` → `ServerReportsController.create` (`POST /api/server/reports`), depois de `Reports.create`: `denuncia_enviada` se `created`, `denuncia_recusada` se recusada **e** com denunciante conhecido (`same_target_cooldown`, `hourly_limit`). *Exige* que `CreatedReport` traga o `reporterAccountId` (hoje traz só o alvo, que **não** pode sair). `uuid` da Denúncia.
- **Propriedades:**
  - `denuncia_enviada`: `motivo` (`cheat` | `voice` | `offensive_chat` | `griefing` | `other`); `modo`
  - `denuncia_recusada`: `recusa` (`same_target_cooldown` | `hourly_limit`); `modo`
- **Responde:** quanto e por que as pessoas denunciam, por Modo (por 100 horas jogadas, com o banco); os limites de 1 por alvo e 5 por hora estão apertados? Nada do alvo, do chat ou do status da Denúncia sai (moderação não vai para terceiros).

### 2.6 Discord

#### 26. `discord_vinculo_iniciado` · 27. `discord_vinculado` · 28. `discord_vinculo_falhou` · 29. `discord_desvinculado` · A1 · API · Conta

- **Dispara:** `discord/discord.controller.ts` → `DiscordController.start` (`GET /api/auth/discord/link`) depois de `flow.start`; `complete` (`GET /api/auth/discord/callback`) conforme o `result` de `flow.complete`; `unlink` (`DELETE /api/discord/link`) depois de `roles.unlink` (ou `links.remove`, com a integração desligada).
- **Propriedades:**
  - `discord_vinculado`: nenhuma além das comuns (o ID e o nome do Discord **não** saem)
  - `discord_vinculo_falhou`: `resultado` (`em-uso` | `conta-ja-vinculada` | `cancelado` | `invalido` | `indisponivel`, os `DiscordLinkResult` do contrato; `sem-sessao` e `desligado` não emitem)
  - `discord_desvinculado`: `dias_vinculado` (inteiro)
- **Responde:** quantos vinculam (`discord_vinculado` ÷ `discord_vinculo_iniciado`); onde falha (`em-uso` é gente tentando com o Discord de outra Conta?); quanto tempo dura um vínculo. A reconciliação dos cargos não emite nada.

### 2.7 VIP (S14)

O VIP ainda não tem pagamento no código; os nomes ficam fixados agora para a S14 nascer medida. Os módulos abaixo são os da spec da S14 (`vip/`, a criar). **Regra de identidade:** `vip_compra_iniciada`, `vip_pago`, `vip_pagamento_recusado` e `vip_pagamento_expirado` usam a Conta que **iniciou** a compra (a da sessão), para o funil não quebrar; `vip_reembolsado` e `vip_expirado` usam a Conta **beneficiada** (a dona do Período). Concessão manual pela Staff **não** gera evento de compra (e nunca soma na receita).

Propriedades comuns do VIP: `pacote` (`1_mes` | `3_meses` | `6_meses`); `meio` (`pix` | `cartao`); `valor_centavos` (inteiro, BRL).

#### 30. `vip_compra_iniciada` · S14 · API · Conta

- **Dispara:** a criação da compra, no caso de uso que gera o Pix ou abre o pagamento no cartão (a spec chama de "Minhas compras" o estado `Pendente`), depois de gravada.
- **Propriedades:** `pacote`; `meio`; `valor_centavos`; `renovacao` (booleano: já havia VIP ativo, ou seja, estende); `ja_foi_vip` (booleano: teve VIP antes, ativo ou não); `presente` (booleano: Conta beneficiada ≠ da sessão).
- **Responde:** quantos que veem a página iniciam a compra; qual pacote e meio escolhem; quem está renovando.

#### 31. `vip_pago` · S14 · API · Conta

- **Dispara:** o processamento do webhook do Mercado Pago, depois de validar a assinatura, consultar o pagamento e conceder o VIP **na mesma transação** (idempotente). `uuid` do identificador do pagamento (um webhook repetido não emite duas vezes).
- **Propriedades:** `pacote`; `meio`; `valor_centavos`; `renovacao`; `ja_foi_vip`; `presente`; `dias_concedidos` (30, 90 ou 180); `segundos_ate_pagar` (inteiro: da compra iniciada à aprovação).
- **Responde:** a conversão; o tempo até pagar (o Pix de 30 min é suficiente?); o que vende mais.

#### 32. `vip_pagamento_recusado` · 33. `vip_pagamento_expirado` · S14 · API · Conta

- **Dispara:** `recusado`: o webhook com o estado "Recusado". `expirado`: a rotina que vence o QR do Pix (30 min) sem pagamento.
- **Propriedades:** `pacote`; `meio`; `valor_centavos`; em `recusado`, `categoria` (`recusado_pelo_emissor` | `dados_invalidos` | `outro`, um mapeamento fechado do que o Mercado Pago devolve; o texto original não sai).
- **Responde:** onde a compra morre: cartão recusado? Pix não pago? Vale oferecer outro meio ou estender o QR?

#### 34. `vip_reembolsado` · S14 · API · Conta (beneficiada)

- **Dispara:** o processamento do reembolso (arrependimento de 7 dias, indisponibilidade), depois de retirar os dias do Período VIP. `uuid` do identificador do reembolso.
- **Propriedades:** `pacote`; `meio`; `valor_centavos`; `dias_removidos` (inteiro); `dias_desde_pagamento` (inteiro); `motivo` (`arrependimento_7_dias` | `indisponibilidade` | `outro`).
- **Responde:** a taxa de reembolso e por que (a promessa do VIP está clara?). A Staff que fez o reembolso não sai.

#### 35. `vip_expirado` · S14 · API · Conta (beneficiada)

- **Dispara:** a rotina de vencimento do VIP, a mesma que a S14 já precisa para o "lembrete 3 dias antes do fim" (hoje o fim do Período não gera evento nenhum, ADR 0020), com um marcador de última passada, para cada Período que acabou desde a passada anterior e não foi encadeado a outro. `uuid` do Período.
- **Propriedades:** `origem_vip` (`compra` | `concessao`); `dias_ativo_total` (inteiro: soma dos Períodos contíguos).
- **Responde:** o VIP é renovado? (`vip_pago` com `ja_foi_vip = true` e `renovacao = false` nos 30 dias seguintes a `vip_expirado` é a "reativação"); quanto tempo dura o VIP típico. *Alternativa se o dono preferir não criar o marcador:* tirar esta métrica só do banco (`vip_periods`), sem evento.

## 3. Funis e métricas

Convenção: um **funil por pessoa** só existe depois que a pessoa tem Conta, porque o navegador não carrega identidade (ADR 0021). Antes disso o plano mede **taxas agregadas por dia**.

### 3.1 Aquisição (agregado, por dia)

| Etapa | Fonte |
|---|---|
| Visitantes únicos | `pagina_vista` (PostHog, contagem do dia) e, após a abertura, GA4 |
| Clicaram em entrar | `login_iniciado` (contagem) |
| Entraram | `login_concluido` (contagem) |
| Contas novas | `conta_criada`, por `origem` |

Taxas: `login_iniciado` ÷ visitantes; `login_concluido` ÷ `login_iniciado`. É uma taxa por dia, não um funil por pessoa: duas pessoas que entram em dias diferentes não se juntam. O GA4 responde "de onde vieram" (canal, fonte/meio, campanha); o `referenciador` e os `utm_*` do `pagina_vista` fazem o mesmo antes da abertura.

### 3.2 Ativação: primeira visita → login → Inventário → equipar → conectar → jogar (por Conta, janela de 14 dias)

Dois caminhos de entrada, o mesmo destino:

- **Pelo site:** `conta_criada` (`origem = site`) ou `login_concluido` → ...
- **Pelo jogo:** `conta_criada` (`origem = jogo`) → `servidor_conectado` (primeiro) → `login_concluido` (`jogou_antes = true`) → ...

Funil de ativação (a ordem é a do produto; as etapas contam a primeira ocorrência da Conta):

| # | Etapa | Evento e filtro |
|---|---|---|
| 1 | Tem Conta no site | `login_concluido` |
| 2 | Montou Inventário | `item_adicionado` |
| 3 | Equipou | `item_equipado` com `preset_ativo = true` |
| 4 | Conectou **com skin** | `servidor_conectado` com `itens_equipados > 0` |
| 5 | Jogou de verdade | `sessao_de_jogo_encerrada` com `duracao_segundos ≥ 600` |

**Conta ativada** = chegou à etapa 5 em até 14 dias da `conta_criada`. **Tempo até a primeira skin no jogo** = da `conta_criada` (ou do 1º `login_concluido`) até o 1º `servidor_conectado` com `itens_equipados > 0`. É a métrica da promessa central ("entrar, equipar e ver a skin no jogo"). O limiar de 10 minutos da etapa 5 é uma escolha inicial; revisar com os dados do beta.

Quebras úteis: por `modo`, por `eh_vip`, por `origem` da Conta e por `tipo` do primeiro Item. Para entender onde trava, cruze cada etapa com `item_recusado` e `recurso_vip_bloqueado` da mesma Conta.

### 3.3 Retenção

- **Semanal (fonte da verdade: o banco).** Coorte = semana (segunda a domingo, horário de Brasília) da primeira linha com `seconds_played > 0` em `account_stats_weekly`; "voltou" = linha com `seconds_played > 0` na semana +1, +4 e +8. Tem histórico desde a S12. Não depende da A1.
- **Diária e por Modo (PostHog).** Retenção com `sessao_de_jogo_encerrada` como evento inicial e de retorno, janela de 1, 7 e 30 dias, a partir da A1 (sem retroativo).
- **Retenção do site.** `login_concluido`, mesma ideia, semanal.
- **Qual vale:** as duas dependem da Sessão de jogo encerrada, mas o PostHog só tem eventos a partir da A1, perde o que o emissor descartar e não conhece a semana de Brasília. Se divergirem, a oficial (e a do mídia kit) é a do banco.

### 3.4 Perfil, Ranking, Denúncias, Discord

| Área | Perguntas | Eventos |
|---|---|---|
| **Perfil** | O Perfil é visitado? Quem se personaliza? Quem esconde as Estatísticas? | `pagina_vista` (`rota = perfil`), `nome_exibicao_alterado`, `nome_exibicao_recusado`, `perfil_privado_alterado` |
| **Ranking** | Quem olha? Quem joga o suficiente para entrar? | `pagina_vista` (`rota = ranking`, `modo`); do banco: Contas com rounds ou minutos acima do mínimo da semana (`account_stats_weekly`) ÷ Contas ativas |
| **Denúncias** | Quanto e por quê? O sistema está sendo usado ou abusado? | `denuncia_enviada` por `motivo` e `modo`; `denuncia_recusada`; do banco: tempo até a Staff arquivar (`reports`, só os últimos 90 dias) |
| **Discord** | Vincular vale a pena? | `discord_vinculo_iniciado` → `discord_vinculado` (e `discord_vinculo_falhou` por `resultado`); `discord_desvinculado` |

### 3.5 VIP (S14)

Entradas: `pagina_vista` (`rota = vip`) (agregada) e `recurso_vip_bloqueado` (por Conta, com intenção).

| # | Etapa | Evento |
|---|---|---|
| 1 | Sentiu falta do VIP | `recurso_vip_bloqueado` |
| 2 | Iniciou a compra | `vip_compra_iniciada` |
| 3a | Pagou | `vip_pago` |
| 3b | Recusado / QR vencido | `vip_pagamento_recusado`, `vip_pagamento_expirado` |
| 4 | Ficou | sem `vip_reembolsado` em 7 dias |
| 5 | Voltou | `vip_expirado` → `vip_pago` com `ja_foi_vip = true` em 30 dias |

Taxas: `vip_compra_iniciada` ÷ visitantes de `vip` no dia (agregada); `vip_pago` ÷ `vip_compra_iniciada` (por pessoa, 24 h); `vip_reembolsado` ÷ `vip_pago`. O **dinheiro** vem sempre do banco (tabela de pagamentos da S14), nunca da soma dos eventos.

## 4. Mídia kit

Para patrocinadores e anúncios, o dono quer: **jogadores únicos, horas jogadas, retenção e origem**. A tabela diz de onde cada número sai e se já existe. A regra de ouro: **só números agregados**, e nenhum recorte com menos de 20 Contas.

| Métrica | Definição | Fonte | Existe hoje? |
|---|---|---|---|
| **Jogadores únicos por semana** (total e por Modo) | Contas distintas com `seconds_played > 0` na semana | **Banco**: `account_stats_weekly` | Sim (S12) |
| **Jogadores únicos em 28 dias** | Contas distintas com linha de `seconds_played > 0` nas 4 últimas semanas | **Banco** | Sim |
| **Jogadores novos por semana** | Contas com `first_connected_at` na semana | **Banco**: `accounts` | Sim |
| **Horas jogadas** (semana, Modo) | `sum(seconds_played) ÷ 3600` | **Banco** | Sim |
| **Horas por jogador ativo** (média e mediana) | horas ÷ únicos | **Banco** | Sim |
| **Retenção semanal** (semanas +1, +4, +8) | Seção 3.3 | **Banco** | Sim (histórico desde a S12) |
| **Retenção diária** (D1, D7, D30) | Seção 3.3 | **PostHog** (`sessao_de_jogo_encerrada`) | A partir da A1 |
| **Sessões por jogador e duração da sessão** | Contagem e média de `duracao_segundos` | **PostHog** (o banco guarda só a soma de segundos) | A partir da A1 |
| **Jogadores simultâneos** (pico e média por dia/Modo) | Contagem de jogadores nos Batimentos | **Nenhuma: lacuna.** A Presença vive no Valkey e não é guardada. Proposta: uma amostra por minuto por servidor numa tabela aditiva `server_presence_samples (server_id, at, players)` gravada em `live-servers/live-servers.ts` → `LiveServers.recordHeartbeat` (~1.440 linhas/dia/servidor, sem dado pessoal) | **Não** (depende de decisão do dono) |
| **Alcance do site** (visitantes únicos e páginas vistas) | `pagina_vista` agregado | **GA4** após a abertura; **PostHog** antes. São contagens diferentes (o GA4 só vê quem consentiu): o kit usa uma fonte só e diz qual | PostHog: A1. GA4: abertura |
| **Origem das visitas** | Canal, fonte/meio e campanha | **GA4** (abertura); `referenciador` e `utm_*` no PostHog antes | Abertura |
| **Origem das Contas** | Proporção `jogo` × `site` | **PostHog** (`conta_criada.origem`); no banco, aproximável por `claimed_at` e `first_connected_at` | A1 |
| **Contas que entraram no site** | `claimed_at` não nulo ÷ Contas | **Banco** | Sim |
| **Jogadores com skin equipada** | Contas com ao menos um slot no Preset ativo ÷ ativas | **Banco**: `presets` e `loadout_slots` | Sim |
| **Jogadores com VIP ativo** | `vip_periods` com `ends_at > now` ÷ ativas | **Banco** | Sim (sem receita no kit) |
| **País dos visitantes** | País agregado | **GA4** e **PostHog** (do IP, descartado em seguida) | A1 / abertura |
| **Segurança do ambiente** (Denúncias por 100 horas, tempo até resolver) | `reports` agregada | **Banco**, mas `reports` é apagada em 90 dias: **materializar** mensalmente | Parcial |
| **Servidores no ar** | Disponibilidade | Monitoramento de uptime (S09) | Sim, fora deste plano |

**O que o kit não entrega, de propósito:** idade, gênero ou renda dos jogadores (o Carmine não coleta, e o público inclui menores); país dos **jogadores** (o IP do jogador fica com o servidor de jogo; só os visitantes do site têm país); origem de quem nunca abre o site; qualquer segmentação por comportamento para anúncio (ECA Digital, art. 26).

**Regras para os números não mexerem sozinhos:**
- Uma Conta anonimizada some de `account_stats_weekly` (S08), então números passados mudam um pouco retroativamente. Quando o kit existir, cada mês é **congelado** numa tabela de fotos (`bi.midia_kit_mensal`), e o kit publica a foto, não a consulta ao vivo.
- A definição de "jogador" é uma só em todo lugar: Conta com ao menos uma Sessão de jogo registrada com tempo maior que zero na janela. Bots e aquecimento já não contam nas Estatísticas (ADR 0018).
- Todo número do kit leva o período, a fonte e a data de corte.

## 5. Versionamento do plano

O objetivo é mudar um evento sem quebrar a série histórica nem os painéis.

- **Versão do plano:** `MAJOR.MINOR.PATCH` no título deste arquivo. `versao_plano` em cada evento leva só `MAJOR.MINOR`.
  - **PATCH** (1.0.1): texto, correção de pergunta ou de ponto de disparo, sem mudar o que sai.
  - **MINOR** (1.1.0): **aditivo**: evento novo, propriedade nova, valor novo numa lista fechada. Painéis existentes continuam certos.
  - **MAJOR** (2.0.0): remoção ou troca de significado. Só junto de um evento `_v2` (abaixo).
- **Nunca renomear** um evento ou uma propriedade. Nunca mudar o tipo de uma propriedade. Nunca reaproveitar um valor de lista fechada removido para outro sentido.
- **Mudar o significado de um evento** (outro ponto de disparo, outra definição) = **evento novo** com sufixo `_v2` (`item_equipado_v2`). O antigo e o novo disparam **em paralelo** por pelo menos 4 semanas (um ciclo completo de retenção semanal), o plano marca o antigo como `obsoleto desde X.Y` e só depois de os painéis migrarem o código deixa de emitir o antigo. O nome `_v2` é permanente: não volta ao nome antigo.
- **Propriedade nova** entra como `null` nos eventos antigos; análises que dependem dela filtram por `versao_plano ≥ X.Y`.
- **Valor novo** numa lista fechada (por exemplo, outro `recurso` de VIP) é MINOR e nunca muda o sentido dos existentes.
- **Descontinuar** um evento sem substituto: marcar `obsoleto` no plano, parar de emitir na versão MAJOR seguinte, manter o evento e a série no PostHog.
- **Como entra no código:** a lista de eventos e o schema Zod de cada um moram em `packages/contracts` (um arquivo `analytics`), são a única forma de emitir (propriedade fora do schema é descartada), e um teste confere que os nomes do código são exatamente os nomes em crase da tabela da seção 1.3 deste arquivo. Mudar o código sem mudar o plano (ou o contrário) quebra a CI.
- **Checklist de PR que mexe em evento:** (1) este arquivo e a versão; (2) o changelog abaixo; (3) o schema e o teste; (4) o ponto de disparo, com teste de que o evento sai **depois** do commit e não sai com `analytics_opt_out`; (5) os painéis do PostHog afetados; (6) a Política de Privacidade, se mudar o tipo de dado.

## 6. Qualidade dos dados

- **Teste por evento:** cada caso de uso do plano tem um teste que usa o emissor falso e confere nome, `distinct_id` (o `accounts.id`), propriedades exatas e ausência de qualquer propriedade proibida.
- **Teste de proibição:** um teste varre os schemas e falha se alguma propriedade tiver nome de dado proibido (`steam_id`, `public_id`, `nome`, `ip`…).
- **Orçamento de volume (estimativa, não medida):** por jogador ativo, algo como 15 `servidor_conectado`, 15 `sessao_de_jogo_encerrada`, ~25 eventos do site e ~30 `pagina_vista` por mês, perto de 85. O 1 milhão de eventos grátis do PostHog cobre da ordem de 10 mil jogadores ativos por mês. O dono acompanha o consumo no painel do PostHog; se passar de 70%, revisar a lista antes de pagar.
- **Perda aceita:** o emissor é não bloqueante e descarta o que não conseguir enviar; os números oficiais (horas, jogadores, receita) vêm do banco.

## 7. Changelog do plano

| Versão | Data | Mudança |
|---|---|---|
| 1.0.0 | 2026-10-20 | Primeira versão: 35 eventos (29 da A1, 6 da S14), funis, mídia kit e versionamento |
