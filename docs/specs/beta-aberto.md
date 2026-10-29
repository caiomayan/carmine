# Spec do beta aberto · até o lançamento oficial (2027)

> Linguagem do domínio: [`CONTEXT.md`](../../CONTEXT.md). Decisões: [`docs/adr/`](../adr/). A spec anterior, [`mvp.md`](mvp.md), vai até a S15 e continua valendo onde esta não muda nada.
>
> Origem: grilling com o dono de 2026-10-28 (rodadas 1 a 9). O registro das respostas está na nota "Carmine · Roadmap futuro" do Maestri.

## Contexto

O lançamento oficial fica entre o 1º e o 2º semestre de 2027, quando o advogado e o contador fecharem. Até lá o Carmine segue em **beta aberto**: qualquer um joga, nada é cobrado de verdade e a plataforma melhora aos poucos. Estas fatias são o que entra nesse período.

**Regras gerais desta fase**
- **Só o essencial da lei.** Valem as obrigações legais (comunicar material de abuso infantil, arrependimento de 7 dias, apagar dados a pedido, transferência internacional, sorteio, identificação do fornecedor) e a página para pais. As outras travas são escolha de produto e podem ser simplificadas. O levantamento das 40 regras está em [`pesquisas-2026-10-28/travas-legais.md`](pesquisas-2026-10-28/travas-legais.md).
- **Nada clicável no jogo.** Toda interação no jogo é por comando no chat.
- **Rotas e comandos em inglês** (S16b), pensando na internacionalização (português e inglês, talvez a partir de 2028). As rotas em português citadas nesta spec passam a ser as equivalentes em inglês da tabela da S16b, e os comandos têm sinônimo em português.
- **Prefixo das mensagens do Carmine no jogo:** `Carmine`, sem colchetes, em vermelho escuro, o carmim (`ChatColors.DarkRed`), seguido da mensagem na cor padrão. É o "detalhe mínimo" em que o carmim é permitido (decisão U3).

## Fatias

| Fatia | O que entrega | Depende de |
|---|---|---|
| **S16 · Jogo, pacote 1** | AWP do Retake, português, prefixo, `!help`, boas-vindas com curiosidade, `!rank` e `!stats`, aviso do plano, DM com mais mapas e sons, Retake com 50 rounds | — |
| **S16b · Rotas e comandos em inglês** | Todas as rotas do site em inglês, com redirecionamento permanente das antigas; comandos do jogo em inglês com sinônimos em português | — |
| **S17 · Coleta por round** | Cada round registrado evento a evento (ordem das kills, dano por vítima, flash assist, sobreviventes, motivo do fim, bomba) | — |
| **S18 · Foto de perfil no beta** | Liga a foto com R2; 5 envios por 30 min e 10 s entre envios; histórico das últimas 5; menos travas | — |
| **S19 · Addon dos servidores abertos** | Card de boas-vindas em Panorama (não clicável), logo do Carmine em algumas paredes, download obrigatório | S16 |
| **S20 · Planos Capo e Padrinho** | "VIP" vira Capo (R$ 9,90) e Padrinho (R$ 19,90); 6 e 25 Presets; benefícios por nível | — |
| **S21 · Rating Carmine** | Rating por Modo (5v5 e Retake), Pontuação DM, Rating geral, Ranking de Retake por Rating, "Calibrando" | S17 |
| **S22 · Perfil público e modo anônimo** | Fim do Perfil privado; modo anônimo do Padrinho com nicks estranhos; página para pais | S20 |
| **S23 · Salas privadas** (em fatias a–d) | Criar, convidar e dar ready no site; servidor com o ritual profissional; séries com veto; histórico e demo | S17, S20, S21 |
| **S24 · 5v5 Casual** | Servidor 5v5 público, aberto 24 h como o Retake e o DM | S16 |
| **S25 · Painel da Staff** | App separado em `staff.stcarmine.com`, com dashboard moderno; as 7 telas de hoje migradas | — (em paralelo) |
| **S26 · Home personalizada** | Home por tipo de pessoa e por momento, com regras simples | S21 (os Primeiros passos podem vir antes) |
| **S27 · Consigliere** | O assistente de IA: responde sobre os dados, faz ações com confirmação, tem memória | S17, S21 |
| **S28 · Amizades, sininho e visitantes** | Amizade mútua com sugestões, notificações no site, visitantes do Perfil para quem tem plano | S16b |
| **S29 · Chat** | Conversa 1 a 1 entre amigos e chat da Sala, num dock | S28 |
| **S30 · Times** | Times com página, desafios que viram Sala, histórico e confronto direto | S23, S28 |
| **S31 · Jogo, pacote 2, e servidores no site** | Resumo de fim de mapa, gag e mute curtos, fila com posição, `!profile`; fase do mapa e sugestão de servidor no site | S16 |
| **S32 · Copiar skins e Loadouts** | Copiar um Item ou o Loadout de outro jogador; crédito para quem é copiado; `!copy` no jogo (v2) | S20 (o sininho, S28) |

---

### S16 · Jogo, pacote 1

Melhorias de dentro do jogo nos servidores abertos (Retake e Deathmatch), saídas do levantamento do plugin de 2026-10-28. Não muda nada no site, a não ser a API que fornece a curiosidade, o `!rank` e o `!stats`.

**1. AWP do Retake (provável bug)**
- Hoje o `RetakesAllocator` só entrega a AWP a quem tem a permissão `@css/vip` (`AwpPermission`, `infra/cs2/profiles/retake/.../RetakesAllocator/config.json`), e nada no Carmine concede essa permissão a ninguém. Então provavelmente ninguém recebe AWP, contra a S02 ("1 AWP por time com chance").
- **Decisão:** a AWP é **para todos**, como diz a S02 (não é benefício de plano). Tirar a exigência de permissão, conferindo no código do allocator qual valor significa "sem permissão". O mesmo vale para `SsgPermission` e `EnemyStuffPermission`, que continuam desligados.
- Confirmar com um teste no servidor da AWS: num round de compra cheia com 2 ou mais por time, a AWP aparece para um jogador de cada lado em cerca de metade dos rounds.

**2. Servidor em português**
- Todos os textos que o jogador vê ficam em português do Brasil: Carmine.Core, `cs2-retakes`, `RetakesAllocator`, `RockTheVote` e `Deathmatch`.
- Usar o idioma do CounterStrikeSharp (`ServerLanguage` no `core.json`) e os arquivos de idioma de cada plugin. Onde o plugin não tiver pt-BR, escrever o nosso arquivo no perfil do servidor (`infra/cs2/profiles/...`), sem alterar o plugin.
- Os nomes de comando continuam os mesmos (`!rtv`, `!guns`, `!ws`), porque são os que a comunidade conhece.

**3. Prefixo e tom**
- Toda mensagem do Carmine.Core no chat começa com `Carmine` em carmim. Nenhuma usa emoji, exclamação de propaganda ou caixa alta.
- As mensagens dos plugins de terceiros que aceitam prefixo configurável usam o mesmo `Carmine`.
- A mensagem solta do VIP em fila (`CorePlugin.ReservedSlots.cs:102`) vai para as constantes, como as outras.

**4. Boas-vindas com curiosidade**
- Sai a mensagem atual de primeiro connect. Em **todo connect** num servidor aberto, uma única linha curta:
  - **Conta nova** (sem Estatísticas no Modo): `Carmine · Bem-vindo, <nome>.`
  - **Conta com dados:** `Carmine · <curiosidade>`. Uma curiosidade por connect, sorteada entre as que se aplicam à pessoa e diferente da última mostrada a ela.
- **Curiosidades da v1** (todas do Modo do servidor e da semana atual, salvo indicado):
  - `Faltam 12 rounds para você entrar no Ranking desta semana.` (Retake; em minutos no DM)
  - `Você está em 8º no Ranking de Retake.`
  - `Sua AK-47 fez 64% dos seus abates esta semana.` (arma com mais abates, só se tiver pelo menos 20 abates na semana)
  - `Você fez 41 headshots esta semana.`
  - `Seu melhor dia da semana foi terça, com 132 rounds vencidos.` (só com 2 dias ou mais de atividade)
  - `Você já jogou 37 horas no Carmine.` (total, todos os Modos)
- **Quem escolhe a frase é a API**, que devolve a linha pronta em português no endpoint que o plugin já chama no connect. O plugin só imprime. Assim, uma curiosidade nova não exige release do plugin.
- **Os termos** continuam aceitos ao jogar. O link `stcarmine.com/termos` sai da mensagem e fica no `!help`.
- Com a API fora, a linha não aparece. O aviso de Loadout fora do ar continua como hoje.

**5. `!help`**
- Lista os comandos do Modo atual, uma linha por comando, em português:
  - **Os dois Modos:** `!ws` (aplicar suas skins), `!rank`, `!stats`, `!rtv` e `!nominate`, `!report`, `!chat off/on`, `!vip`.
  - **Retake:** `!guns`.
  - **Deathmatch:** `!guns`, `!hs` (só headshot), `!dmg` (dano causado), `!hud`, `!noprimary`.
- A última linha leva aos termos: `Carmine · Regras e termos: stcarmine.com/regras`.
- `!ajuda` é sinônimo.

**6. `!rank` e `!stats`**
- `!rank` mostra a posição na semana no Modo do servidor:
  - No Ranking: `Carmine · Retake: 8º da semana · 412 rounds vencidos.` (no DM: KPM)
  - Fora do mínimo: `Carmine · Faltam 12 rounds para você entrar no Ranking desta semana.`
  - Dentro do mínimo, mas fora do top 50: `Carmine · Retake: 73º da semana.`
- `!stats` mostra a semana no Modo: Retake com K/D, HS%, ADR e rounds jogados; DM com KPM, K/D, HS% e minutos.
- Os dois respondem só para quem pediu. A resposta vem da API, com as mesmas regras do Ranking da S12. Com a API fora: `Carmine · Não deu para consultar agora. Veja em stcarmine.com/ranking`.
- A S21 troca os números pelo Rating Carmine.

**7. Aviso do plano no spawn**
- Só nos servidores abertos, no primeiro spawn de quem tem plano ativo: `Carmine · VIP ativo até 12/11 · sua vaga está garantida.`
- Os avisos de fim de VIP que já existem continuam iguais e substituem esse aviso quando faltarem 3 dias ou menos.
- A S20 troca "VIP" pelo nome do plano.

**8. Deathmatch: mapas e sons**
- O pool passa de 3 para 5 mapas, com `de_ancient` e `de_anubis` (os dois já estão no pool do Retake), mais os pontos de spawn de cada um. A votação mostra 3, e 1 fica em cooldown.
- Os sons de hit e de headshot ficam **ligados por padrão** (`Deathmatch.json`). Cada jogador desliga pelo `!hud`, como hoje.

**9. Retake: 50 rounds por mapa**
- `mp_maxrounds` vai de 30 para **50**, uns 35 a 40 min por mapa. A votação de fim de mapa continua 2 rounds antes do fim.

**Aceite**
- Num round de compra cheia com 2 ou mais por time, a AWP aparece para um jogador de cada lado em parte dos rounds, sem precisar de plano.
- Nenhum texto em inglês aparece para o jogador no Retake e no DM, de nenhum plugin.
- Toda mensagem do Carmine.Core começa com `Carmine` em carmim.
- Uma Conta nova vê `Carmine · Bem-vindo, <nome>.`. Uma Conta com dados vê uma curiosidade da lista, e dois connects seguidos não mostram a mesma.
- `!help` e `!ajuda` listam os comandos do Modo atual.
- `!rank` e `!stats` batem com o que o site mostra no Ranking e no Perfil da mesma semana.
- Quem tem VIP vê o aviso do plano no primeiro spawn; quem não tem, não vê.
- O DM roda os 5 mapas com spawns corretos, e o som de hit toca por padrão.
- Um mapa de Retake vai até 50 rounds.
- Com a API desligada, o jogador entra e joga, sem a curiosidade e com a mensagem de erro no `!rank`.

**Fora desta fatia (pacote 2, depois):** resumo de fim de mapa com o top 3, mensagem curta de gag e mute com o tempo restante, fila do Retake com a posição, `!perfil` com o link da própria Conta. O `!report` continua por comandos no chat, porque não há nada clicável no jogo.

**Como validar:** os testes do plugin (C#) e da API cobrem as mensagens e a escolha da curiosidade. O teste no jogo é no servidor da AWS beta, quando o dono puder jogar, sem pressa. A homologação não tem CS2 de verdade.

---

### S16b · Rotas e comandos em inglês

O Carmine é nacional até por volta de 2028, mas pode ser internacionalizado (português e inglês). Os textos do site já estão no arquivo de idioma (`apps/web/messages/pt-BR.json`). O que ainda está em português são as **rotas** e os **comandos**. Esta fatia muda os dois **agora**, antes de as páginas novas nascerem em português. A interface continua em português.

**Rotas**

| Hoje | Passa a ser |
|---|---|
| `/entrar` | `/login` |
| `/configuracoes` (e `/perfil`, `/aparencia`, `/conexoes`, `/compras`, `/dados`) | `/settings` (e `/profile`, `/appearance`, `/connections`, `/purchases`, `/data`) |
| `/servidores/<id>` | `/servers/<id>` |
| `/inventario` | `/inventory` |
| `/loadout`, `/ranking` | iguais |
| `/vip` (e `/comprar`, `/compra`) | `/plans` (e `/checkout`, `/purchase`) |
| `/regras` (e `#recurso`) | `/rules` (e `#appeal`) |
| `/termos`, `/privacidade`, `/reembolso`, `/contato` | `/terms`, `/privacy`, `/refunds`, `/contact` |
| `/atividade/recentes`, `/vitrine/semana`, `/busca/itens` (internas) | `/activity/recent`, `/showcase/week`, `/search/items` |
| `/<publicId>` (Perfil) | igual |

- Toda rota antiga **redireciona para sempre** (301) para a nova, com a âncora e a query, para que nenhum link compartilhado, nenhuma mensagem do plugin já impressa e nenhum resultado do Google quebre.
- As rotas novas das próximas fatias já nascem em inglês: `/friends`, `/rooms`, `/match/<id>`, `/teams/<tag>`, `/parents`, `/rating`.
- O teste de fumaça do deploy, os links do plugin (`APPEAL_PATH`, `!help`), os e-mails, o Discord e os documentos legais passam a usar as rotas novas.

**Comandos do jogo:** o nome principal fica em inglês, e o sinônimo em português continua onde ajuda:

| Comando | Sinônimos |
|---|---|
| `!help` | `!ajuda` |
| `!profile` | `!perfil` |
| `!plan` | `!plano`, `!vip` |
| `!report` | `!denunciar` |
| `!rank`, `!stats`, `!ws`, `!guns`, `!rtv`, `!nominate`, `!chat` | — |
| Salas: `!ready`, `!start`, `!ct`, `!t`, `!pause`, `!tech`, `!restart`, `!forfeit` | `!restart` = `!reiniciar`, `!forfeit` = `!wo` |

As mensagens continuam em português até a internacionalização.

**Aceite**
- Cada rota antiga da tabela responde 301 para a nova, mantendo a âncora e a query.
- Nenhum link interno do site aponta para uma rota antiga.
- O teste de fumaça do deploy passa com as rotas novas.
- Cada comando e cada sinônimo da tabela funciona no jogo.

**Como ficou (parte das rotas)**
- A tabela de redirecionamentos está em `apps/web/src/lib/legacy-routes.ts`, aplicada pelo `next.config.ts` com `statusCode: 301` (o `permanent` do Next responderia 308). As sub-rotas que a tabela não citava também passaram para o inglês: `/inventory/add`, `/inventory/add/<id>` e `/inventory/applicable`.
- A âncora é a única parte que o servidor não vê: `/regras#recurso` chega em `/rules#recurso` e a página troca para `#appeal` (componente `LegacyAnchors`). No texto legal, o título fixa a âncora com `## Recurso {#appeal}`.
- Os nomes das rotas no plano de eventos (`inventario`, `entrar`, `vip`...) não mudam, para o histórico do PostHog continuar contínuo; só o caminho que cada um reconhece mudou.
- Ficam como estão: `/staff/*` (o painel será refeito na S25), `/dev/*` (vitrines internas) e os caminhos `/api/*`.
- No plugin, `!vip` segue funcionando e ganhou `!plan` e `!plano`; os outros comandos da tabela são das fatias de jogo.

---

### S17 · Coleta por round

A base do Rating Carmine (S21), das Salas (S23), do Consigliere (S27) e do matchmaking futuro. Hoje cada evento vira soma da semana e do dia na hora (ADR 0018), então **o histórico não pode ser recalculado**: o rating só vale a partir do dia em que esta coleta começar. Por isso ela vem cedo, antes de existir qualquer tela que a use.

**Onde vale:** Retake agora, e toda Sala e o 5v5 Casual quando existirem. O Deathmatch fica fora da v1, porque não tem round e o volume é alto: continua só com as somas de hoje.

**O que o plugin passa a mandar** (no mesmo lote idempotente do ADR 0018; cada evento com o horário do servidor em milissegundos e o número do round)
- **Mapa jogado:** um `mapPlayId` (UUIDv7) criado pelo `MatchTracker` a cada mapa novo ou reinício de partida, enviado em todo evento. É o que agrupa os rounds. Não aparece para ninguém.
- **round_start:** número do round e, para cada jogador, o lado e o **valor do equipamento** no fim do freeze (`FreezetimeEndEquipmentValue`).
- **kill:** além do que já vai, o **lado da vítima**, o **flash assist** (`assistedflash`), `penetrated` (wallbang), `thrusmoke`, `attackerblind`, noscope, a **distância** e as **posições** de quem matou e de quem morreu.
- **damage:** passa a levar a **vítima**, a **arma**, o `hitgroup`, o dano na armadura e o **dano limitado à vida que a vítima tinha** antes do hit (o valor bruto continua para as somas de hoje).
- **bomb:** plant, defuse e explosão, com quem e em qual bomb site.
- **round_end:** além do que já vai, o **motivo** (bomba, eliminação, tempo, defuse), a **duração** e **quem estava vivo** no fim.

**O que a API faz**
- Grava os **eventos brutos** numa tabela própria por mapa jogado e round, particionada por mês e guardada por **12 meses**.
- Quando o `round_end` chega, calcula o **resumo do round por jogador** e o guarda **para sempre**:
  - kills, mortes, assistências (com 40 de dano ou mais, como a HLTV 3.0) e flash assists;
  - dano limitado pela vida;
  - **sobreviveu** e **foi trocado**. Trocado vale **só quando o matador dele morre, até 5 s depois (inclusive), numa kill de um companheiro de time da vítima**. Não troca: o matador morrer por queda, bomba ou suicídio (não há companheiro que o tenha matado), por kill de um aliado dele, antes de matar a vítima, ou qualquer lado ser bot (um bot não conta kill, e a morte pelas mãos de um bot não é trocada porque não se sabe qual bot foi);
  - **abertura** (primeira kill ou primeira morte do round);
  - **multi-kill** (2k a 5k);
  - **clutch** (último vivo do time contra N, e se venceu);
  - **KAST** do round (kill, assistência, sobreviveu ou foi trocado);
  - lado e valor do equipamento.
- Calcula também o **resumo do mapa jogado**: mapa, início, fim, placar e jogadores.
- As somas da semana e do dia de hoje continuam iguais. Nenhuma tela muda nesta fatia.
- O resumo do round fica ligado à Conta, então apagar a Conta (LGPD) anonimiza esses resumos como já faz com o resto.

**Novo ADR:** registra por que a decisão do ADR 0018 de não guardar evento a evento muda agora (rating, Consigliere e matchmaking), o volume esperado (na ordem de dezenas de milhares de linhas por dia com o Retake cheio) e as partições por mês.

**Aceite**
- Sequências gravadas de eventos, usadas como testes, dão o resumo certo para: trade dentro e fora de 5 s, clutch 1v2 vencido e perdido, multi-kill de 3, abertura, assistência com menos e com mais de 40 de dano, e dano maior que a vida da vítima.
- Um lote reenviado não duplica eventos nem resumos.
- Rounds de aquecimento e os rounds sintéticos do `cs2-retakes` (sem humanos dos dois lados) não geram resumo.
- Um reinício no meio do mapa abre um novo mapa jogado.
- Eventos brutos com mais de 12 meses são apagados pelo job de retenção, e os resumos ficam.
- As Estatísticas e o Ranking de hoje não mudam.

---

### S18 · Foto de perfil no beta

A foto de perfil (ADR 0022) já está pronta e desligada. Esta fatia a liga no beta e tira as travas que eram escolha nossa, mantendo só o essencial.

**O que muda nas regras** (`packages/contracts/src/avatar-rules.ts`)
- **Saem:** a Conta precisar ter mais de 24 h e o limite de 3 envios por dia.
- **Entram**, como regra interna que **não aparece para o usuário**:
  - **5 envios a cada 30 min** (janela deslizante), contados por Conta;
  - **10 s** entre um envio e outro.
- **Mensagens:** dentro dos 10 s, `Espere alguns segundos para enviar outra foto.`; no limite de 30 min, `Você trocou de foto muitas vezes. Tente de novo mais tarde.` Nenhuma das duas mostra números.
- **Bloqueio depois de remoção:** sai a escada automática de 7, 30 e 365 dias. Quando remove uma foto, a Staff escolhe se bloqueia novos envios e por quantos dias (padrão sugerido de 7).
- **Ficam:** quem tem Punição ativa não envia; a Staff decide em até 24 h; a foto é refeita em WebP sem EXIF; o material de abuso infantil é comunicado às autoridades.

**Regra única de moderação de imagem** (vale para a foto de perfil, a logo de Time da S30 e a logo de Sala da S23c; muda o ADR 0022)
- **A denúncia não tira nada do ar sozinha.** Ela só entra na fila da Staff. Sai a regra de hoje em que 2 denúncias derrubam a foto.
- **Imagem aprovada fica imune:** depois que a Staff aprova uma imagem, as novas denúncias contra **aquela mesma imagem** são descartadas. Só uma imagem nova pode ser denunciada de novo.
- **Só a ferramenta de abuso infantil da Cloudflare** (CSAM Scanning Tool) tira uma imagem do ar na hora.
- **Quem denuncia muito o que a Staff aprova perde peso:** as denúncias dessa Conta vão para o fim da fila.

**Histórico das últimas 5 fotos**
- No diálogo de trocar a foto, abaixo do envio, aparecem as **últimas 5 fotos que ficaram no ar**, da mais nova para a mais velha, junto com "Voltar à foto da Steam".
- **Escolher uma do histórico** volta com ela na hora e **não conta** nos limites de envio.
- Cada foto do histórico tem "Apagar", que a tira do histórico e do armazenamento.
- Foto **removida pela moderação** sai do histórico e nunca volta.
- Quando entra a 6ª, a mais velha sai do histórico e é apagada do armazenamento, seguindo a retenção de hoje.

**Para ligar em produção (passos do dono, ~15 min, num roteiro na PR)**
- Criar os buckets no R2 da Cloudflare (público e privado) e o token de acesso.
- Apontar `img.stcarmine.com` para o bucket público.
- Ligar o **CSAM Scanning Tool** da Cloudflare na zona.
- Colocar as variáveis no `.env` da VM. Nada vai no chat.

**Aceite**
- Uma Conta criada há 1 min consegue enviar uma foto.
- O 6º envio dentro de 30 min é recusado com a mensagem sem números, e um envio 5 s depois do anterior pede para esperar.
- Escolher uma foto do histórico funciona mesmo com o limite de 30 min estourado.
- O histórico mostra no máximo 5 fotos e nunca uma removida pela moderação.
- Apagar uma foto do histórico a tira do bucket.
- A Staff remove uma foto escolhendo ou não um bloqueio, e o bloqueio dura os dias escolhidos.
- Na homologação, tudo funciona com o R2 de mentira que já existe.

---

### S19 · Addon dos servidores abertos

Um addon do Workshop, **único e pequeno** (poucos MB), obrigatório nos servidores abertos (Retake, Deathmatch e o 5v5 Casual quando existir). **As Salas privadas nunca usam addon.** Pesquisa de 2026-10-28: o `custom_hud_layout` (CS2 de 24/08/2026) aceita Panel, Label, Image e Button com CSS, sem script no cliente; o servidor controla os textos por jogador.

**O que o addon leva**
- **Card de boas-vindas** (não clicável): entra deslizando ao conectar, fica cerca de 6 s e sai. Mostra:
  - nome;
  - selo do plano (VIP até a S20, depois Capo ou Padrinho);
  - posição no Ranking da semana no Modo;
  - amigos online no Carmine;
  - a partir da S21, o **Rating do Modo** ou `Calibrando 37/100`.

  Visual P&B da marca, discreto, sem cobrir a mira. A linha de curiosidade da S16 continua no chat.
- **Logo do Carmine em algumas paredes** de cada mapa: 2 ou 3 pontos discretos por mapa, colocados pelo plugin como decal ou prop com o material do addon (como o CS2-Poor-MapAdvertisements faz). A lista de pontos por mapa fica num arquivo de configuração do perfil do servidor. Nada de propaganda de terceiros.

**Obrigatório**
- O servidor exige o addon pelo MultiAddonManager. **Quem recusa o download não entra.** Antes de ser desconectado, quem recusou vê `Carmine · Para jogar aqui, aceite o download do conteúdo do servidor.`
- O addon fica em cache no Steam do jogador (`mm_cache_clients_with_addons 1`), então só a primeira entrada demora mais.
- **Chave de emergência:** como o MultiAddonManager costuma quebrar a cada atualização do CS2, o perfil do servidor tem uma variável que **desliga a exigência e o card** sem novo release. Os servidores voltam a rodar sem addon até a correção, e a operação documenta como desligar.

**Publicação**
- O addon é publicado no Workshop pela conta Steam do dono (passo do dono, num roteiro; o Workshop Tools pode exigir Prime). O item fica neutro, só com a marca da casa, por causa das regras de anúncio do Steam.
- Mudar o layout exige publicar uma versão nova do addon. Quem já está no jogo vê o layout antigo até reiniciar o CS2 (cache do Panorama).
- Imagens do layout como `background-image` .vtex (BGRA8888), porque `<Image>` quebra o layout (pegadinhas do cs2-hud-panel). Recriar as entidades quando o jogador entra.

**Aceite**
- No servidor da AWS, um jogador novo baixa o addon, entra e vê o card com os próprios dados por cerca de 6 s.
- Quem recusa o download não entra e não fica preso em loop eterno.
- O logo aparece nos pontos configurados de cada mapa do pool.
- Com a chave de emergência ligada, o servidor aceita quem não tem o addon e não mostra o card.
- O card não aparece em Sala privada.

---

### S20 · Planos Capo e Padrinho

O "VIP" genérico vira **dois planos com nome próprio**, na linha da família italiana: **Capo** e **Padrinho**. A palavra **VIP sai de tudo**: site, Discord, plugin, card, e-mails e recibos. O termo genérico passa a ser **Plano** ("Seu plano termina em 3 dias").

**Os planos**

| | Grátis | **Capo** | **Padrinho** |
|---|---|---|---|
| Preço | — | R$ 9,90 / mês | R$ 19,90 / mês |
| Itens exclusivos (agentes, music kits, StatTrak, nametag) | — | sim | sim |
| Vaga reservada (Retake e DM) | — | sim | sim |
| Cargo no Discord | Jogador | **Capo** | **Padrinho** |
| Presets | 1 | **6** | **25** |
| Criar Sala privada (S23) | — | sim, com o básico | sim, com tudo |
| Modo anônimo (S22) | — | — | sim |
| Consigliere, o assistente de IA (S27, quando a cobrança for de verdade) | — | — | sim |

- **Pacotes:** 1, 3 e 6 meses em cada plano, com o desconto de hoje (3 meses ≈ 10%, 6 meses ≈ 16%). Os valores exatos ficam em `packages/contracts/src/payments.ts`. A duração é forma de pagamento, não plano. Os números finais podem mudar com o contador.
- **O que é básico e o que é completo na Sala** está na S23.

**Troca de plano**
- Quem tem Capo e compra Padrinho: o Padrinho começa na hora, e os dias restantes do Capo **ficam guardados** e voltam a correr quando o Padrinho acabar.
- Quem tem Padrinho e compra Capo: o Capo entra na fila e começa quando o Padrinho acabar.

**Limite de Presets ao trocar ou perder o plano:** o que passa do limite fica guardado como hoje (`vip-hold`, 30 dias, aviso 3 dias antes), só leitura até voltar a caber.

**Beta: compra de mentira em produção**
- Até o lançamento, **ninguém paga de verdade**. A compra de mentira, que hoje só existe na homologação, fica liberada em `stcarmine.com` para todos testarem os dois planos.
- Toda a tela de compra mostra com destaque: `Beta: compra de teste. Nada é cobrado.`
- O Mercado Pago real continua desligado até o advogado e o contador.

**O que muda no código:** os termos do domínio (`VIP`, `VipPeriod`, `VipPackage` → Plano, Período do plano, Pacote; CONTEXT.md e ADR), as rotas (`/vip` → `/plans`, com redirecionamento), os textos do plugin (`!vip` → `!plan`, com `!plano` e `!vip` como sinônimos), os cargos do Discord e o selo do card. As compras de mentira já feitas viram Capo.

**Aceite**
- Nenhuma tela, mensagem do jogo ou cargo do Discord mostra "VIP".
- `/vip` redireciona para `/plans`, e `!plano` e `!vip` respondem como `!plan`.
- Uma Conta grátis tem 1 Preset, a Capo 6 e a Padrinho 25.
- Comprar Padrinho com Capo ativo guarda os dias do Capo, que voltam depois.
- Em produção, qualquer Conta compra um plano de teste, sem cobrança e com o aviso de beta.
- O cargo do Discord acompanha o plano ativo.

---

### S21 · Rating Carmine

O **Rating Carmine** vira a **estatística principal** da plataforma. É inspirado nas métricas públicas que a HLTV usa (KAST, ADR, sobrevivência, impacto), calculado sobre os resumos de round da S17. **Nunca se chama "HLTV Rating"**, porque HLTV é marca de outra empresa. Pesquisa: [`pesquisas-2026-10-28/rating.md`](pesquisas-2026-10-28/rating.md).

**Por Modo**
- **Retake e 5v5** têm o Rating Carmine, com média **1,00** calibrada em cada Modo separadamente (um 1,10 no Retake não é comparável a um 1,10 no 5v5).
- **v1, parecido com a 2.1 da HLTV:** 5 partes, cada uma calculada por lado (CT e TR) e comparada com a média e o desvio da nossa própria população no Modo e no lado:
  - abates por round;
  - sobrevivência;
  - KAST;
  - dano por round (limitado pela vida);
  - impacto (aberturas, multi-kills e clutches).

  As partes têm peso igual, e o resultado é escalado para média 1,00.
- **v2, parecido com a 3.0**, quando houver milhares de rounds de 5v5: entra o **Round Swing**, que mede quanto cada ação muda a chance de vencer o round, com uma tabela aprendida dos nossos próprios rounds (vivos × vivos × bomba × economia), e o ajuste por economia. O Retake ganha uma versão simples do Swing, sem economia (o allocator dá as armas).
- **Deathmatch não tem Rating**, porque não tem round, time nem vitória. Tem a **Pontuação DM**: abates por minuto, K/D, dano por minuto e HS%, comparados com a população do DM, numa escala própria em torno de **100**, para não ser confundida com o Rating.
- **Rating Carmine geral:** a média dos Ratings de Retake e 5v5, **pesada pelos rounds** jogados em cada um. O DM não entra. Aparece no Perfil como número secundário.

**Regras**
- **Calibrando:** o Rating de um Modo só aparece depois de **100 rounds** nele. Antes, o Perfil mostra `Calibrando · 37/100`.
- **Amostra pequena:** com poucos rounds na janela, o Rating é puxado em direção a 1,00, para não haver um 2,40 depois de 3 rounds bons.
- **Janela do Perfil:** o número de destaque do Perfil é o Rating dos **últimos 90 dias** no Modo, e o Ranking usa o da semana.
- **As médias são recalculadas toda semana**, e a versão da fórmula fica gravada, para dar para recalcular tudo quando ela mudar.
- **Fórmula semiaberta:** uma página `/rating` explica **o que entra** (as 5 partes, e depois o Swing), sem os pesos, como faz a HLTV, para ninguém otimizar o número em vez de jogar.
- **Não contam:** aquecimento, bots, rounds sintéticos do Retake e as partidas de Sala marcadas como "não conta" (S23).

**Onde aparece**
- **Perfil:** o Rating do Modo é o número maior do topo, com o geral abaixo. A Pontuação DM fica na aba do DM.
- **Ranking de Retake** passa a ordenar pelo **Rating da semana**, com o mesmo mínimo de 50 rounds. O DM continua por abates por minuto. Desempate: rounds jogados, depois a Conta mais antiga.
- **`!rank` e `!stats`** (S16) e o **card** (S19) mostram o Rating ou o "Calibrando".

**Estatísticas detalhadas com filtro de período** (como na HLTV)
- O destaque do Perfil é de 90 dias, mas a aba de Estatísticas detalhadas deixa filtrar:
  - **período:** desde o início da Conta, últimos 30, 90 ou 365 dias, um ano específico ou um intervalo de datas;
  - **Modo**, **mapa** e **lado** (CT e TR);
  - **onde:** Tudo, Servidores abertos ou Salas (S23);
  - **time:** quando existirem os Times da plataforma (futuro).
- Em qualquer filtro aparecem o **Rating** e o **K/D**, junto com HS%, ADR, KAST, abates, mortes, assistências, rounds e tempo.
- **De onde vem cada período:**
  - o **K/D e as somas** desde o início da Conta saem das somas semanais, que nunca expiram;
  - um **intervalo de datas** usa as somas diárias, que valem por 400 dias, e as semanais antes disso;
  - o **Rating, o KAST, o mapa e o lado** só existem **a partir da S17**. Para um período anterior, a tela diz `Rating disponível a partir de <data da S17>` em vez de inventar um número.
- **A URL guarda o filtro**, para dar para compartilhar um recorte.

**Rating escondido e FACEIT**
- Além do Rating Carmine, que mede desempenho, existe um **rating de habilidade escondido** (Glicko-2), que ninguém vê. Ele serve para **equilibrar os times das Salas** (S23) e para o **matchmaking** do futuro distante. É atualizado pelos resultados das partidas de 5v5 que contam.
- **FACEIT:** o Carmine procura a conta FACEIT de cada um **pelo ID Steam**, pela API pública da FACEIT (Data API, com uma chave do servidor). Se achar, guarda o **nível e o elo**, atualizados de tempos em tempos. Usos:
  - **ponto de partida** do rating escondido;
  - **selo do nível FACEIT** no Perfil, que a pessoa pode esconder nas Configurações.

**Aceite**
- Com os resumos de round gravados de uma amostra, o Rating de cada jogador bate com a planilha de conferência da fórmula v1.
- A média do Rating da população de um Modo fica em 1,00 (± 0,02) depois do recálculo semanal.
- Uma Conta com 37 rounds no Modo vê `Calibrando · 37/100` no Perfil, no `!rank` e no card.
- O Ranking de Retake ordena pelo Rating da semana e continua exigindo 50 rounds.
- A página `/rating` explica as partes sem mostrar os pesos.
- Uma Conta com FACEIT vinculada à mesma Steam mostra o selo do nível, e esconder o selo funciona.
- Nenhum texto do site usa "HLTV Rating".
- Filtrar as Estatísticas detalhadas por "desde o início" mostra o K/D de toda a vida da Conta, e um período anterior à S17 mostra o aviso no lugar do Rating.
- Um filtro aberto pela URL compartilhada mostra o mesmo recorte.

---

### S22 · Perfil público, modo anônimo e página para pais

**1. Todo Perfil é público**, como na FACEIT. O **Perfil privado deixa de existir**.
- Sai a opção nas Configurações, e o "Jogador privado" some do Ranking, das partidas e da prévia do link. As regras de `profile-privacy.ts` (`canSeeStats`, `rankingIdentity`) ficam simples: todos veem tudo.
- Quem tinha o Perfil privado vê **uma vez**, no próximo login, um aviso de que o Perfil agora é público, com o link para a Política de Privacidade atualizada.
- **O que ainda dá para esconder:** o selo do nível FACEIT e o link do Discord.
- **Os Perfis entram no Google:** sai o `noindex` dos Perfis (decisão da revisão de travas). A Conta não reivindicada continua fora.
- A Política de Privacidade e a página de dados (`/configuracoes/dados`) são atualizadas.

**2. Modo anônimo** (a nossa versão do "Streamer Mode" da FACEIT)
- **Quem tem:** quem tem o **Padrinho**, e os **criadores de conteúdo** que a Staff aprovar (uma marcação na ficha da Conta, no painel da Staff).
- **Liga e desliga** nas Configurações. Vale a partir do próximo connect.
- **Nos servidores abertos:** o nome no jogo vira **uma única palavra estranha** e sem sentido, gerada na hora (por exemplo `Zorblax`, `Quimfro`, `Brelvik`). Não precisa ser em português, não pode ser ofensiva e fica a mesma durante o mapa inteiro. O site, nas listas de "jogando agora" e na página do servidor, mostra a mesma palavra, sem link para o Perfil.
- **Avatar no jogo:** o objetivo é o avatar padrão no lugar do Steam. Isso depende do `sv_reliableavatardata` e da peça nativa testada na S23c. Até lá, só o nome muda, e a tela das Configurações avisa isso.
- **Nas Salas:** os nomes ficam escondidos até a partida acabar. Depois, a página da Partida mostra quem era.
- **O que continua igual:** o Perfil público, o Ranking (com o nome real) e as Estatísticas.

**3. Página "Para pais e responsáveis"** (ECA Digital, art. 16, para serviço de acesso provável por menores)
- Uma rota pública, `/parents`, com link no rodapé e nas regras. Conteúdo em linguagem simples:
  - o que é o Carmine e a classificação indicativa do CS2;
  - os riscos (chat e voz com desconhecidos);
  - como silenciar alguém (`!chat off`, mute do CS2);
  - como denunciar;
  - como pedir para **apagar** os dados ou **bloquear** a Conta do filho, com o canal de contato.
- Um texto curto, revisado antes de publicar e marcado `[VALIDAR COM ADVOGADO]` até a consulta.

**Aceite**
- Nenhuma tela mostra "Jogador privado", e as Configurações não têm mais a opção.
- Quem era privado vê o aviso uma vez e não vê mais.
- Um Perfil público não tem `noindex`.
- Com o modo anônimo ligado, um Padrinho entra no Retake com uma palavra estranha como nome, que não muda até o fim do mapa, e o site mostra a mesma palavra sem link.
- Uma Conta sem Padrinho e sem marcação de criador não vê a opção.
- `/parents` está no ar, com link no rodapé.

---

### S23 · Salas privadas

Uma **Sala** é uma partida privada que um jogador com plano cria no site. Ela escolhe o Modo (**5v5, Retake ou Deathmatch**) e ganha um servidor só para ela, que some quando a partida acaba. **Entrar** numa Sala é grátis, mas **criar** exige um plano: o **Capo** cria com o básico e o **Padrinho** com tudo. A **Staff** administra qualquer Sala pelo painel. A Sala de 5v5 deve parecer uma **partida profissional**.

**Capo e Padrinho**

| Configuração | Capo | Padrinho |
|---|---|---|
| Modo, mapa (só oficiais), senha, link de convite | sim | sim |
| Times: equilibrado, sorteio, manual, capitães | sim | sim |
| Capitães escolhendo um a um (pick) | — | sim |
| Armas, rounds, tempo, só headshot | sim | sim |
| Reinício de round, pausa técnica, contar ou não nas estatísticas | sim | sim |
| Espectadores no servidor (0 a 5) | sim | sim |
| 5v5 em MD1 | sim | sim |
| 5v5 em MD3 ou MD5, com veto | — | sim |
| Logo do servidor | do Carmine ou nenhuma | do Carmine, própria ou nenhuma |
| Trocar o nick dos jogadores na partida | — | sim |
| GOTV | — | sim |
| Admins da Sala | — | sim |

A S23 vai em quatro partes.

#### S23a · A Sala no site

- **Criar:** a Conta com plano escolhe o Modo e o formato e recebe a página da Sala.
- **Convite:** um link com clique. Quem está deslogado faz login antes. A **senha é opcional** e quem cria a escolhe. Se o link vazar, quem cria **gera outro**, e o antigo deixa de valer. Quem já está dentro continua.
- **Membros e times:** quem entra aparece na lista. Os times são montados por **equilibrado** (o padrão, pelo rating escondido da S21), **sorteio**, **manual**, **capitães** ou, no Padrinho, **capitães escolhendo um a um**.
  - **Capitão padrão:** o de maior rating de cada time. Quem cria pode trocar.
  - **Nome padrão do time:** `team_<nick do capitão>`. Quem cria pode renomear.
  - 2 a 10 jogadores no 5v5 (pode ser 4 contra 4), sem bots.
- **Admins da Sala** (Padrinho): quem cria nomeia admins entre os membros. O admin faz tudo o que quem cria faz, menos tirar quem criou, apagar a Sala e nomear ou remover admins.
- **Expulsar:** quem cria e os admins tiram alguém da Sala.
- **Ready no site:** com tudo configurado, **todos os jogadores** nos times dão ready na página. É o ponto de concordância com a configuração, então **qualquer mudança zera todos os readies**. A tela de ready mostra, quando valer, `Esta partida grava uma demo pública.` e `Esta partida não conta nas estatísticas.`. Quem não der ready pode ser tirado por quem cria.
- **Subir o servidor:** com todos prontos, o Carmine sobe o servidor da Sala e mostra o `connect`. Se todas as vagas de Sala estiverem ocupadas: `Todas as salas estão ocupadas agora. Tente de novo em alguns minutos.`
- **Quantas ao mesmo tempo:** limite configurável. Na AWS beta, **1 por vez**, e só com a instância ligada. Na VPS, o que a máquina aguentar.
- **Beta:** quem tem plano de teste (S20) cria Salas.

#### S23b · O servidor da Sala

**Entrada**
- Só os SteamIDs da Sala entram, pelo site ou pelo `connect` com a senha. Espectadores só se quem cria liberou (0 a 5), e eles **não falam nem escrevem para os jogadores**.
- **Depois que a partida começa, ninguém novo entra**, a não ser que ela seja reiniciada. Quem já estava pode **reconectar** a qualquer momento. **Não existe substituto.**
- **Sem addon, sem card e sem boas-vindas.** Quem entra é anunciado de forma profissional: `Carmine · Caio entrou · team_caio`.

**O ritual do 5v5**
1. **Aquecimento sem limite de tempo**, com compra livre. O servidor lembra quem falta: `Carmine · team_caio não está pronto` e, quando os 5 de um time derem `!ready`, `Carmine · team_caio está pronto`. Não há contagem do tipo 7/10.
2. **Início:** quem cria escolhe se a partida **começa sozinha** quando os dois times estão prontos (o padrão) ou se o ready é só requisito para ela dar `!start`.
3. **Round faca**, quando ninguém escolheu o lado no veto. Quem vence escolhe o lado com `!ct` ou `!t`.
4. **Volta ao aquecimento**, e os dois times dão pronto de novo.
5. **Ao vivo:** `Carmine · AO VIVO` três vezes, como nos campeonatos. **A demo começa aqui**, sem aquecimento e sem faca.
6. **MR12**, com **prorrogação ligada por padrão** (MR3, como no Competitivo). Quem cria pode desligar. Placar no intervalo e no fim.

**Durante a partida**
- **Pausas táticas:** 4 de 30 s por time.
- **Pausa técnica:** só quem cria, um admin ou a Staff. Quem cria liga ou desliga a pausa técnica na configuração.
- **Queda sem dano:** se um round começou, **ninguém tomou dano** e alguém caiu, o round pode ser reiniciado. Ele volta em pausa técnica, e o despause continua naquele mesmo round. Quem cria escolhe entre **automático** (o padrão) ou **por pedido**: no pedido, o time que perdeu alguém digita `!reiniciar` e **o time adversário precisa aprovar** com `!reiniciar`. **Se alguém já tomou dano, o round segue. Essa regra não muda.**
- **Queda com dano:** o jogo segue, 4 contra 5 se a pessoa não voltar, e o time pode usar as pausas.
- **W.O.:** a qualquer momento, **3 dos 5** de um time digitam `!wo` em 30 s. O W.O. encerra **a série inteira**, e o outro time vence. Os rounds jogados contam, e a partida fica marcada como W.O.
- Quem cria pode **encerrar** a partida ou **reiniciá-la**, o que libera a entrada de novo.
- **Staff pelo painel:** pausar, reiniciar o round, encerrar e expulsar.
- **Tom:** tudo com o prefixo `Carmine`, sem emoji e sem brincadeira.

**Retake e DM na Sala**
- **Retake:** precisa de **2 jogadores ou mais** (contando quem criou). Os times se ajustam sozinhos, como no Retake aberto. Rodadas: **qualquer número** (padrão **50**) ou **sem limite**. Armas: todas, só pistola (todo round vira de pistola) ou só rifle, com AWP sim ou não.
- **DM:** tempo, só headshot, armas (todas, só pistola, só rifle, só AWP) e AWP sim ou não.
- Skins e Loadout de cada um valem normalmente.

#### S23c · Séries e identidade (Padrinho)

- **MD3 e MD5**, com **veto opcional no site** antes do ready, feito pelos capitães:
  - MD1: os times vetam até sobrar um;
  - MD3: ban, ban, pick, pick, ban, ban e o que sobra;
  - MD5: ban, ban e os picks.

  Sem veto, quem cria escolhe os mapas. Quem não escolheu o mapa escolhe o lado. Os mapas rodam em sequência no mesmo servidor, com uma demo por mapa.
- **Logo no servidor:** pelo `sv_reliableavatardata` e PNGs por SteamID, **o avatar de todos os jogadores no placar e no kill feed** vira a logo escolhida: a do Carmine, uma própria para todos (por exemplo a da comunidade do Discord) ou uma por time. A logo enviada segue as regras da foto de perfil (denúncia e Staff). O site só informa a escolha ("imagem padrão do servidor: X", "team_caio com a logo tal"). **A foto de perfil do Carmine nunca vai para o jogo.**
- **Spike antes:** o CounterStrikeSharp não expõe a string table `ServerAvatarOverrides`, então antes desta parte um teste num servidor local confirma o tamanho certo do PNG (64 ou 512 px) e o caminho: peça nativa (Metamod), SwiftlyS2 ou gravar na pasta e recarregar o mapa.
- **Nicks na partida:** quem cria e os admins trocam o nick de cada jogador **só naquela partida**, no jogo e na página da Partida.
- **GOTV:** atraso padrão de **90 s**, ajustável de 0 a 180 s. O link aparece na página da Sala.

#### S23d · Histórico e demo

- **Partida:** **só as Salas** viram Partidas no histórico. Os servidores abertos e o 5v5 Casual não.
- **Página da Partida:** pública por link, com o placar por mapa, a série e as **estatísticas de cada jogador** (dos resumos da S17: abates, mortes, assistências, ADR, KAST, HS%, Rating da partida). Quem estava em modo anônimo é revelado aqui depois do fim.
- **Demo:** gravada **só em Sala de 5v5 com 5 contra 5**, a partir do **AO VIVO**, uma por mapa. Guardada por **30 dias**, ou **90 dias** quando quem criou a Sala é Padrinho. **Qualquer um pode baixar.** O aviso aparece no ready.
- **Contar ou não:** quem cria ou um admin decide se a partida conta. Se não contar, ela fica no histórico, com página, placar e demo, mas **fora do Perfil, do Rating e do rating escondido**.
- **No Perfil**, as Estatísticas ganham o filtro **Tudo / Servidores abertos / Salas** (padrão Tudo). **As Salas nunca entram no Ranking semanal.** Um Ranking de 5v5 próprio fica para quando o 5v5 estiver rodando.
- **Futuro:** clipes dos melhores momentos na página da Partida, a partir da demo.

**Aceite (S23 inteira)**
- Uma Conta Capo cria uma Sala de 5v5 MD1, convida 9 pessoas pelo link, e o servidor só sobe com os 10 readies. Mudar o mapa zera os readies.
- Uma Conta Capo não vê MD3, pick de capitães, GOTV, admins, nem troca de nicks.
- No servidor da Sala, um SteamID de fora da Sala não entra, e depois do AO VIVO ninguém novo entra.
- O round faca leva à escolha do lado e de volta ao aquecimento. A demo começa no AO VIVO.
- Uma queda sem dano reinicia o round em pausa técnica (automático), e com dano o round segue.
- No modo por pedido, o reinício só acontece com os dois times pedindo.
- `!wo` de 3 jogadores de um time em 30 s encerra a série.
- Com 4 contra 4, a partida roda e não grava demo.
- A página da Partida mostra as estatísticas, e qualquer um baixa a demo.
- Uma partida que não conta não muda o Perfil nem o Rating.
- A Staff pausa e encerra uma Sala pelo painel.
- Com a única vaga da AWS ocupada, criar outra Sala mostra a mensagem de ocupado.

---

### S24 · 5v5 Casual

Um servidor **5v5 público**, aberto como o Retake e o DM: entra quem quiser, sem montar time e sem ready. É a porta de entrada do 5v5. As Salas são para quem já tem o grupo.

**Regras da v1**
- **Formato:** MR12 com troca de lado no meio, compra normal, mapas do pool Active Duty com votação ao fim do mapa. Entrar e sair no meio é livre.
- **Vagas:** 10, mais a vaga reservada dos planos, como no Retake.
- **Times:** balanceados pelo servidor entre os mapas.
- **Servidores abertos:** usa o **addon** com o card (S19) e as mensagens do pacote 1 (S16).
- **Estatísticas:** contam no Perfil e na coleta por round (S17), e o Rating de 5v5 (S21) passa a existir com elas. Não vira Partida no histórico e **não grava demo**.
- **Ranking de 5v5:** fica para depois, quando houver volume.
- **Onde roda:** na AWS beta, quando a instância estiver ligada; na VPS, sempre ligado.

**Aceite**
- O servidor aparece na Home e na lista de servidores como "5v5 Casual".
- Um jogador entra pelo site ou pelo IP no meio de um mapa e joga.
- Os rounds entram na coleta por round e no Rating de 5v5.
- Nenhuma demo é gravada.

---

### S25 · Painel da Staff

O painel da Staff deixa de ser uma seção do site e vira **outra aplicação**: um dashboard administrativo **moderno, bonito e completo**, fora da identidade P&B da plataforma. Pode andar **em paralelo** às fatias de jogo, porque é só frontend sobre a API de hoje.

**Onde fica**
- Um app próprio no monorepo (`apps/staff`, Next) em **`staff.stcarmine.com`**. Na homologação, **`staff-dev.stcarmine.com`**. Fala com a mesma API.
- **Login com duas travas:** a mesma sessão da Steam (o cookie vale nos dois subdomínios) e, na frente, o **Cloudflare Access** com código por e-mail, só para os e-mails da Staff.
- As 7 telas de hoje (`/staff`, `/staff/denuncias`, `/staff/fotos`, `/staff/contas/...`, `/staff/pagamentos`, `/staff/servidores`, `/staff/auditoria`) são **migradas** e **removidas do site**. `stcarmine.com/staff` redireciona para o painel. O site deixa de carregar qualquer código da Staff.

**Visual** (a direção é do maestro, e o dono valida na homologação)
- Linha de Linear, Vercel e Supabase: neutro, preciso e denso, em claro e escuro.
- Barra lateral recolhível, busca e comandos por `Ctrl+K`, números grandes no topo de cada tela, tabelas com filtro, ordenação e paginação, e gráficos onde ajudam.
- O Carmine aparece só como uma marca pequena no canto.
- Antes de migrar as telas, o protótipo da direção vai numa rota de galeria da homologação.

**Início**
- Cartões com:
  - jogadores online agora;
  - servidores no ar;
  - **denúncias e fotos esperando revisão**, com o prazo de 24 h correndo;
  - compras e reembolsos do dia;
  - Salas e partidas ao vivo (quando a S23 existir);
  - alertas (servidor caído, fila de eventos travada).
- Cada cartão leva à tela do assunto.

**Celular:** funciona bem no telefone, com **denúncias e fotos** como prioridade, porque têm prazo. As tabelas grandes podem ser melhores no computador.

**Depois:** a administração de Salas e partidas ao vivo (pausar, reiniciar, encerrar, expulsar) entra com a S23, já no painel novo. A marcação de criador de conteúdo (S22) entra na ficha da Conta.

**Para ligar (passos do dono, num roteiro na PR):** criar os hostnames no túnel da Cloudflare e as políticas do Access com os e-mails da Staff, nos dois ambientes.

**Aceite**
- `staff.stcarmine.com` pede o código do Access e depois a sessão da Steam. Uma Conta sem papel de Staff não entra, mesmo passando pelo Access.
- As 7 telas funcionam no painel novo com o que funcionam hoje.
- `stcarmine.com/staff` redireciona para o painel, e o bundle do site não tem código da Staff.
- O Início mostra os números certos e leva a cada tela.
- Denúncias e fotos funcionam bem num celular de 390 px.

---

---

### S26 · Home personalizada

A Home deixa de ser a mesma para todos. Ela é montada por **regras simples e previsíveis** (tipo de pessoa + momento → quais blocos e em que ordem), **sem algoritmo de recomendação e sem IA**. **A pessoa não mexe na Home**: nada de esconder ou fixar blocos.

**Tipos de pessoa**
- **Deslogado:** a Home de hoje (V2), sem mudança. É a vitrine.
- **Novo:** logou, mas **nunca conectou** num servidor **ou nunca equipou** nada.
- **Frequente:** jogou em **pelo menos 3 dias dos últimos 14**.
- **Jogador:** qualquer outra pessoa logada.
- **Com plano:** Capo ou Padrinho ativo. É uma **camada por cima** do tipo: um Capo frequente vê os blocos de frequente e os do plano.
- A Staff não tem Home própria; tem o painel (S25).

**O que cada tipo vê**
- **Novo:** os **Primeiros passos** no topo. São 3 passos que se marcam sozinhos: conectar num servidor, equipar o Loadout e ver a skin no jogo. O bloco **some quando os 3 estiverem feitos**. Os Primeiros passos **saem do menu e das outras páginas**, onde hoje aparecem em toda rota até serem dispensados.
- **Jogador:**
  - **servidor recomendado** no topo: o Modo que a pessoa mais joga, com vaga agora e, de preferência, com amigos dentro, com o botão de conectar;
  - **Continuar de onde parou:** o último servidor (com a lotação agora), o último Preset mexido e a última Sala, só o que aconteceu nos últimos 14 dias.
- **Frequente:** tudo do jogador, mais:
  - **a sua semana:** o Rating, a posição e o que falta no Ranking;
  - **o mini-Ranking da semana com os amigos** (S28; até lá, os amigos da Steam), com "você está 2 posições atrás do Fulano".
- **Com plano:** as **Salas** (criar, as suas e os convites), os **dias que faltam** do plano e, no Padrinho, o atalho do **modo anônimo**.
- **Os servidores ao vivo** ficam em toda Home: no topo para o deslogado e o novo, e no fim para os outros.

**Destaque do momento**
- O topo mostra **um destaque só**, o mais urgente agora. Ordem de prioridade:
  1. convite para Sala ou Sala sua ao vivo;
  2. amigos jogando agora;
  3. fim do plano em 3 dias ou menos;
  4. fim da semana do Ranking (domingo), quando a pessoa está perto do mínimo ou de subir de posição;
  5. servidor em que a pessoa costuma jogar quase cheio.
- **Formato:** um destaque, **no máximo 4 blocos** do tipo e a lista de servidores.

**Medir:** com o Analytics ligado (A1), cada bloco registra se foi **visto** e **clicado**, sem dado pessoal, para ajustar as regras.

**Orçamento:** a Home logada é renderizada no servidor, e os blocos só levam ao navegador o JS de que precisam. O teto de JS por página continua valendo.

**Aceite**
- O deslogado vê a Home de hoje.
- Uma Conta que nunca conectou vê os Primeiros passos, e eles somem depois dos 3 passos. Nenhuma outra página mostra os Primeiros passos.
- Uma Conta com 3 dias jogados nos últimos 14 vê a sua semana e o mini-Ranking.
- Com um convite pendente e amigos jogando ao mesmo tempo, o destaque é o convite.
- A Home tem no máximo 1 destaque e 4 blocos antes da lista de servidores.
- O teto de JS da Home passa na CI.

---

### S27 · Consigliere

O **Consigliere** é o **único assistente de IA** do Carmine, o conselheiro da família. Ele **responde** sobre os dados da plataforma e **faz coisas** pela pessoa, sempre com confirmação. A ideia de um "Treinador" separado foi descartada: perguntas sobre desempenho ("onde eu mais morro?", "com quem eu jogo melhor?") são respondidas por ele, a partir dos dados.

**O que ele consulta:** **tudo o que a pessoa vê no site, e nada além**:
- os próprios dados: Estatísticas, Rating, Partidas, Inventário, Loadout e plano;
- os dados públicos: Perfis, Ranking, servidores ao vivo e Times;
- os visitantes do Perfil, só para quem tem plano, como no site.

Ele **nunca lê** o chat de ninguém, as denúncias, nem nada da Staff.

**Ações da v1** (cada uma mostra um cartão **Confirmar** antes de executar)
- equipar um Preset ou trocar um item do Loadout;
- mandar um pedido de amizade;
- convidar um amigo para uma Sala;
- criar uma Sala com a configuração pedida (dentro do que o plano permite);
- dar o link para entrar num servidor.

**Nunca:** punir alguém, pagar ou comprar plano, apagar a Conta, nem nada da Staff.

**Regras de resposta**
- **Todo número vem de uma consulta à API e leva o link** da tela de onde saiu (por exemplo, "K/D 1,12 na Mirage este mês → ver Estatísticas").
- Sem o dado, ele diz **"não tenho esse dado"** em vez de estimar.
- Tudo o que vem de jogador (nomes, mensagens, nomes de Time) é **dado, não ordem**, como defesa contra injeção de prompt.

**Memória e conversas**
- **Memória só se a pessoa aceitar:** ele lembra de preferências e da evolução. A pessoa **vê e apaga** o que ele guardou a qualquer momento.
- As **conversas ficam sem prazo**, como o chat (S29). A pessoa apaga qualquer uma, e apagar a Conta apaga tudo.

**Onde:** no **Ctrl+K** que já existe, com a linha "Pergunte ao Consigliere", e numa **página própria** com a conversa completa. No celular, só a página. No jogo, nada.

**Quem usa no beta**
- O **Dono sem limite**, a **Staff com cota** e uma **lista de convidados** escolhida pelo Dono.
- **Teto global de US$ 30 por mês** de API, com **parada automática** quando chega nele, além da **cota por pessoa** (janela de 5 h e limite semanal, contados por custo, com um medidor visível do tipo "40% da semana").
- No lançamento, com a cobrança de verdade, ele vira **benefício do Padrinho** (S20). Uma cota pequena para o Capo ou o grátis se decide perto do lançamento, olhando o custo real do beta.

**Arquitetura** (do roadmap)
- Serviço separado no monorepo (`apps/agent`, TypeScript, Claude Agent SDK), fora da API Nest, para conversas longas não afetarem o caminho do jogo.
- As **ferramentas são os endpoints da nossa API**, com o esquema derivado dos contratos Zod. **Ele chama a API como a pessoa que pediu**, com as mesmas permissões.
- O modelo certo por tarefa: um pequeno para as perguntas simples e um maior quando precisar.

**Qualidade**
- Uma lista de **perguntas de teste** com as respostas certas, rodada a cada mudança.
- **👍 e 👎** em cada resposta. O Dono revisa as respostas com 👎 toda semana.

**Aceite**
- "Qual meu K/D na Mirage este mês?" devolve o número certo com o link das Estatísticas.
- Uma pergunta sem dado devolve "não tenho esse dado".
- "Equipe meu Preset de Mirage" mostra o cartão Confirmar, e só equipa depois do clique.
- Pedir para punir alguém, pagar um plano ou apagar a Conta é recusado.
- Uma Conta fora da lista do beta não vê o Consigliere.
- Com o teto mensal atingido, ele avisa e para de responder até o mês seguinte.
- Apagar a memória e as conversas funciona.
- As perguntas de teste passam na CI.

---

### S28 · Amizades, sininho e visitantes

**Amizade**
- **Mútua:** um pede e o outro aceita, como na Steam e na FACEIT.
- Quando esta fatia entra, **"amigos" passa a ser só quem é amigo no Carmine**: nos amigos jogando, no mini-Ranking e na Home. Os amigos da Steam viram **sugestão**.
- **Sugestões**, nesta ordem:
  1. amigos da Steam que estão no Carmine, com o botão **Adicionar todos**;
  2. quem joga muito com a pessoa: 50 rounds no mesmo servidor nos últimos 30 dias, ou uma Sala juntos;
  3. amigos de amigos, com 2 ou mais em comum.

  Quem foi recusado ou bloqueado nunca volta como sugestão.
- **Página `/friends`:** a lista, os pedidos recebidos e enviados e as sugestões. No Perfil de qualquer um: **Adicionar amigo**, **Desfazer amizade** e **Bloquear**.
- **Bloquear:** quem foi bloqueado não pede amizade, não convida para Sala e não manda mensagem (S29). A pessoa **não fica sabendo**, e o Perfil continua público.
- **Limites** (internos, sem mostrar números): 30 pedidos por dia, 500 amigos, e um pedido recusado só pode ser refeito depois de **1 dia**.
- **Lista de amigos pública** no Perfil: os visitantes veem a contagem e os amigos em comum. A pessoa **pode esconder** a lista nas Configurações.
- **Com um amigo:** você vê onde ele está jogando agora (servidor ou Sala) e entra com um clique, o convida para uma Sala direto da lista e o vê no mini-Ranking. Não existe "online no site", só "jogando".

**Sininho (notificações no site)**
- Um ícone no cabeçalho com o contador de não lidas. Só dentro do site: sem e-mail e sem notificação no celular por enquanto.
- **Avisos da v1:** pedido de amizade, pedido aceito, convite para Sala, convite para Time (S30), **resumo do mapa para quem saiu no meio** num servidor aberto (S31) e plano acabando.

**Visitantes do Perfil** (como na GamersClub)
- **Quem tem plano** (Capo ou Padrinho) vê os **10 últimos visitantes** do **próprio Perfil e do Perfil de qualquer outra pessoa**, com o avatar, o dia e a hora.
- **Quem conta:** só quem está logado, e nunca a própria pessoa. Cada visitante aparece uma vez, com a última visita. Só as 10 últimas ficam guardadas por Perfil.
- **Grátis** vê só a contagem: "3 pessoas visitaram seu Perfil esta semana", com o convite para o Capo.
- **Padrinho visita sem aparecer:** uma opção nas Configurações que tira o Padrinho da lista de visitantes de todo mundo.

**Aceite**
- Um pedido aceito cria a amizade nos dois lados, e a Home e os amigos jogando passam a usar os amigos do Carmine.
- "Adicionar todos" manda pedidos para os amigos da Steam que estão no Carmine, respeitando o limite diário.
- Quem foi bloqueado não consegue pedir amizade nem convidar, e não vê nenhum aviso disso.
- Um pedido recusado pode ser refeito no dia seguinte, não antes.
- O sininho mostra o pedido e o convite, e o contador zera ao abrir.
- Um Capo vê os 10 últimos visitantes de um Perfil qualquer, e um grátis vê só a contagem do próprio.
- Um Padrinho com "visitar sem aparecer" não entra na lista de ninguém.
- Esconder a lista de amigos a tira do Perfil para os visitantes.

---

### S29 · Chat

O ECA Digital (art. 21) pede que jogos com chat limitem a interação por padrão. No Carmine essa limitação é a **amizade mútua**: só amigos conversam.

**O que existe**
- **Conversa direta 1 a 1, só entre amigos.**
- **Chat da Sala**, entre os membros, antes e depois da partida.
- Sem canais públicos e sem chat geral. Grupos de amigos ficam para depois.

**Conteúdo:** texto e emoji. **Links só do Carmine e da Steam**; os outros aparecem como texto, sem clique. **Sem imagem e sem arquivo.**

**Onde:** um **dock no canto inferior direito**, como na FACEIT e na Steam. Ele fica em todas as páginas, abre e fecha, e o código só carrega quando alguém abre (teto de JS). No celular, vira uma página cheia.

**Sinais:** contador de não lidas no ícone do chat e no sininho, e **"digitando..."**. **Sem "visto".**

**Moderação**
- Cada mensagem tem **Denunciar**. A denúncia entra na fila da Staff, com o prazo de hoje.
- **A Staff vê só o trecho denunciado** (as 20 mensagens em volta) e **nunca lê conversas** que ninguém denunciou.
- **Bloquear** (S28) encerra a conversa dos dois lados.
- **Filtro de palavrão** opcional e por pessoa, desligado por padrão.

**Guarda**
- O histórico fica **sem prazo**, enquanto as duas Contas existirem.
- Cada um **apaga as próprias mensagens**. Apagar a Conta (LGPD) apaga as mensagens dela.
- Uma mensagem denunciada fica guardada com a denúncia pelo prazo das denúncias (90 dias), mesmo que tenha sido apagada.

**No jogo:** nada. As mensagens do site não aparecem no CS2.

**Tempo real:** pelo mesmo caminho dos servidores ao vivo (SSE da API e envio por POST), sem um serviço novo.

**Aceite**
- Duas Contas amigas conversam, com "digitando..." e o contador de não lidas.
- Uma Conta que não é amiga não consegue mandar mensagem.
- Um link de fora do Carmine e da Steam aparece sem clique.
- Uma denúncia leva à Staff só as 20 mensagens em volta.
- Apagar uma mensagem a tira dos dois lados, e uma mensagem denunciada continua na denúncia.
- O dock não aumenta o JS da primeira carga de nenhuma página.

---

### S30 · Times

**O Time**
- Nome, **tag** (2 a 5 letras), **logo** e um **dono**. Até **7 membros** (5 titulares e 2 reservas) e, se quiser, **1 técnico**.
- Página pública em `/teams/<tag>`.
- **Criar é grátis**, para qualquer Conta. O plano entra no que o Time faz nos desafios, não em existir.
- **Um jogador pode estar em até 5 Times.**

**Entrar e sair**
- O dono convida, e o convite chega pelo sininho (S28).
- O membro sai quando quiser.
- O dono pode **passar o comando** para outro membro. Se sair sem passar, o comando vai para o membro mais antigo.

**Desafio**
- O dono ou um capitão de um Time **desafia** outro pelo site, e o outro aceita.
- O desafio vira uma **Sala de 5v5 montada sozinha** (S23), com os dois Times, os nomes e as logos no servidor e o veto feito pelos capitães.
- A Sala segue o **plano de quem desafiou**: Capo é MD1; Padrinho tem MD3 ou MD5 e GOTV.
- **Quem está nos dois Times** escolhe por qual joga quando o desafio é montado. O sistema não deixa a mesma pessoa nos dois lados.

**Histórico**
- A página do Time mostra vitórias e derrotas, os mapas mais jogados com a % de vitória em cada um, o Rating médio dos membros e o **confronto direto** com cada rival, com o placar de todos os jogos entre os dois.
- As Estatísticas detalhadas do Perfil (S21) ganham o filtro **por Time**.
- Um **rating do Time**, pelos resultados dos desafios, é guardado desde o começo. O **Ranking público de Times** só abre com volume (por exemplo, 20 Times com 5 jogos ou mais).

**No Perfil:** a lista de **todos os Times** da pessoa, com a logo e a tag. Ela pode escolher **um para destaque** (opcional), que aparece ao lado do nome no Perfil e no Ranking. Sem destaque, nada aparece ao lado do nome. **No jogo não há tag de Time no placar**, porque um jogador pode estar em vários Times. O nome e a logo do Time só aparecem na Sala do desafio.

**Moderação:** o nome, a tag e a logo seguem a **regra única de moderação de imagem** da S18. A denúncia não derruba sozinha, e uma imagem aprovada fica imune.

**Aceite**
- Uma Conta grátis cria um Time e convida membros pelo sininho.
- Uma Conta já em 5 Times não entra num 6º.
- Um desafio aceito cria a Sala de 5v5 com os dois Times, os nomes e as logos.
- Um jogador que está nos dois Times de um desafio só joga por um.
- A página do Time mostra o confronto direto depois de dois desafios entre os mesmos Times.
- Sem Time de destaque, nada aparece ao lado do nome no Perfil e no Ranking.

---

### S31 · Jogo, pacote 2, e servidores no site

**No jogo (servidores abertos)**
- **Resumo de fim de mapa no chat:** quando o mapa acaba, o **top 3 do mapa** (pelo Rating da S21 ou, antes dela, pelo K/D) e **a linha de cada um**, só para ele:
  `Carmine · Você: 18/12 · HS 44% · Rating 1,12`
- **Quem sai no meio do mapa** recebe esse mesmo resumo no **sininho do site** (S28).
- **Gag e mute curtos:** uma linha com o tempo que falta (`Carmine · Chat bloqueado por mais 23 min.`), mostrada **no máximo a cada 30 s**, em vez da mensagem inteira a cada tentativa.
- **Fila do Retake para todos:** quem espera vê a **posição** (`Carmine · Você é o 2º da fila.`) a cada mudança. Quem tem plano vê que a vaga abre no fim do round.
- **`!profile`** (`!perfil`): imprime o link do próprio Perfil. `!profile <nome>` imprime o de quem está no servidor.
- **Nas Salas**, o fim da partida segue o padrão das plataformas de matchmaking: o placar final no jogo e a página da Partida no site (S23d).

**No site**
- **Fase do mapa** no cartão e na página do servidor: **Começou agora** (primeiros 20% dos rounds), **Na metade** ou **Perto de trocar** (últimos 20%), com o round (`round 12/50`). No DM, os minutos que faltam.
- **Servidor lotado sugere outro:** `Lotado · Tente o Retake #2: Mirage, no começo`. A sugestão procura, nesta ordem, o mesmo mapa, um mapa que a pessoa joga muito e qualquer um com vaga, de preferência no começo do mapa. A sugestão só diz a fase, sem o round.

**Aceite**
- No fim de um mapa, cada jogador vê o top 3 e a própria linha no chat.
- Quem saiu no meio recebe o resumo no sininho.
- Um jogador com gag vê no máximo uma mensagem a cada 30 s, com o tempo que falta.
- Na fila do Retake, a posição atualiza a cada mudança.
- O cartão de um Retake no round 45/50 diz "Perto de trocar".
- Um Retake lotado sugere outro com vaga, preferindo o mesmo mapa.

---

### S32 · Copiar skins e Loadouts de outros jogadores

Quem vê uma skin ou um Loadout de que gosta leva para si. As skins são simuladas e o Perfil é público, então **ninguém pode impedir que o copiem**.

**O que se copia**
- **Um Item:** a skin exata, com o desgaste, o padrão (seed), os stickers nas mesmas posições e o chaveiro. Ele vai para o **Inventário** de quem copiou, respeitando o limite de 300 Itens.
- **O Loadout inteiro**, dos dois lados, que vira um **Preset** de quem copiou.
- **A nametag não se copia**: o nome gravado é pessoal, e a arma copiada vem sem nome. O resto vem igual.

**Onde fica o botão Copiar**
- na vitrine do Loadout no **Perfil** de qualquer um;
- nos **Loadouts da semana** da Home;
- no **Inventário** de outra pessoa, quando ele aparece no Perfil.

A página da Partida não mostra Loadouts.

**Limites do plano**
- **Itens exclusivos** (agentes, music kits, StatTrak): quem é grátis copia, mas eles chegam com o **cadeado**, como no catálogo. Aparecem, mas só equipam com Capo ou Padrinho. O resto do Loadout funciona.
- **Copiar um Loadout no grátis**, que tem só 1 Preset, **substitui o Loadout** depois de uma confirmação: `Seu Loadout atual vai ser trocado.`
- **Com plano**, nasce um **Preset novo** chamado `Loadout de <nome>`. Com o limite de Presets cheio, a pessoa escolhe qual trocar.

**Crédito para quem é copiado**
- O Perfil mostra `Loadout copiado 12 vezes`.
- O dono recebe no sininho (S28) `Fulano copiou o seu Loadout`, **no máximo uma vez por dia**.
- No futuro, isso pode virar um Ranking dos Loadouts mais copiados.

**v2: `!copy <nome>` no jogo**
- Copia o **Loadout que o jogador está usando agora**, de alguém no mesmo servidor, como um **Preset novo**.
- **Não equipa.** Quem copiou escolhe equipar depois, no site. A resposta no chat: `Carmine · Loadout de <nome> salvo como Preset. Equipe em stcarmine.com/loadout.`
- **Só funciona com plano e com espaço para um Preset novo.** Sem plano: `Carmine · Copiar no jogo é dos planos Capo e Padrinho.` Sem espaço: `Carmine · Seus Presets estão cheios. Libere um no site.`
- O nome casa com quem está no servidor, como no `!profile`. Se mais de um casar, o plugin lista os candidatos.

**Aceite**
- Copiar um Item de outro Perfil o coloca no Inventário com os mesmos stickers e o mesmo padrão, sem a nametag.
- Com o Inventário em 300 Itens, copiar mostra o aviso de limite.
- Uma Conta grátis copia um Loadout com agente, troca o Loadout depois da confirmação, e o agente fica com o cadeado.
- Uma Conta Capo copia um Loadout e ganha um Preset novo, `Loadout de <nome>`, sem equipar.
- O Perfil de quem foi copiado mostra a contagem, e o sininho avisa no máximo uma vez por dia.
- `!copy` no jogo cria o Preset sem equipar, e é recusado sem plano ou com os Presets cheios.

---

## Depois desta spec

- **Matchmaking (ranqueadas):** num futuro distante, partindo do rating escondido da S21.
- **Clipes de destaque** na página da Partida, a partir das demos das Salas.
- **Grupos de amigos no chat**, depois da S29.
- **Pacote 3 do jogo**, com o que aparecer jogando.
- A ordem entre as fatias é de prioridade, não de "antes ou depois do lançamento": qualquer uma pode entrar antes dele.
