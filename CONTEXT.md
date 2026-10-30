# Carmine

Plataforma brasileira de servidores comunitários de Counter-Strike 2 com skins simuladas. O jogador entra num servidor Carmine para jogar e usa o site para gerenciar a sua identidade, o seu loadout e o VIP.

Termos em **PT-BR** são os da interface; o nome entre parênteses é o usado no código.

## Jogador e conta

**Conta** (`Account`):
O registro de uma pessoa na plataforma, identificado pelo SteamID64. Nasce automaticamente no primeiro connect a um Servidor Carmine.
_Evitar_: usuário, perfil, cadastro

**Addon do Carmine** (S19):
O conteúdo do Workshop que os servidores abertos exigem do jogador (card de boas-vindas em Panorama e logo nas paredes). Um item só, neutro, publicado pela conta Steam do dono; as Salas privadas nunca o usam. A chave de emergência (`CARMINE_ADDON_ENABLED=0`) o desliga sem novo release.
_Evitar_: mod, pacote de skins

**Card de boas-vindas** (S19):
O painel que entra deslizando por cerca de 6 s quando o jogador nasce num servidor aberto, com nome, plano, posição no Ranking, amigos online e (a partir da S21) o Rating. Os textos vêm da API; o addon só os desenha.
_Evitar_: popup, toast

**Preferência de jogo** (`GamePreference`):
Uma escolha do jogador que um plugin de jogo guardaria por servidor (estar no sorteio da AWP, as armas do `!guns`, os sons e o HUD do Deathmatch). Fica na Conta, guardada pela API, vale em todo servidor do Modo e o Carmine.Core a aplica no plugin (ADR 0028). Sem linha guardada vale o padrão da chave. Não é uma configuração do site: o jogador a muda dentro do jogo, por comando.
_Evitar_: configuração do servidor, settings, preferências do plugin

**Conta não reivindicada** (`unclaimed`):
Conta que só existe porque a pessoa jogou; ela nunca fez login no site.
_Evitar_: conta fantasma, conta temporária

**Conta reivindicada** (`claimed`):
Conta cuja pessoa já fez login Steam no site ao menos uma vez. É a mesma Conta, nunca uma nova.
_Evitar_: conta registrada, conta ativada

**Vínculo do Discord** (`DiscordLink`):
A ligação opcional de uma Conta a um usuário do Discord (ID e nome), feita pelo OAuth2 em Configurações > Conexões. É só um vínculo: a Steam continua a única autenticação (ADR 0007). Um Discord liga a uma única Conta.
_Evitar_: login com Discord, conta Discord

**Cargo do Discord** (`DiscordRole`):
O cargo que o bot dá a uma Conta vinculada no servidor do Discord: Jogador (todo vinculado), VIP (Período VIP ativo), Staff (qualquer papel de Staff) e Dono (papel `owner`). Só esses quatro são gerenciados; os outros cargos da pessoa não são tocados.
_Evitar_: role, tag

**Conta anonimizada** (`anonymizedAt`):
Conta cujo dono pediu a exclusão dos dados (LGPD): perde nome, avatar, Perfil e o que montou, e o vínculo com a Steam se desfaz (fica só enquanto um ban dela valer). É a mesma Conta, com o mesmo ID público, que nunca é reaproveitado; se a pessoa voltar, nasce uma Conta nova.
_Evitar_: conta apagada, conta deletada

**ID público** (`publicId`):
Número curto e único que identifica a Conta na plataforma; números menores pertencem a Contas mais antigas. Imutável, com uma exceção: a Staff pode trocar o ID automático por um ID reservado, uma única vez por Conta; depois de reservado, é imutável. O ID antigo continua funcionando como link (301 para o atual) e nunca é reaproveitado.
_Evitar_: username, apelido, handle

**ID reservado**:
ID público de 1 a 9.999, atribuído manualmente pela Staff (fundador, beta, Staff, números bonitos), seja no nascimento da Conta, seja por reatribuição do ID automático (uma única vez por Conta; depois de reservado, o ID é imutável). Não há ID reservado de 10.000 para cima: os números bonitos acima de 10.000 ficam numa lista de bloqueio e o sorteio automático os pula (ADR 0013).

**Nome de exibição** (`displayName`):
O nome que representa a Conta no site e dentro dos Servidores Carmine. Não é único. É o nome Steam, ou o **nome próprio** (`customDisplayName`) que a Conta reivindicada escolhe no site (2 a 24 caracteres, filtro de palavras, uma troca a cada 7 dias). O reset da Staff apaga o nome próprio e recomeça o prazo.
_Evitar_: nick, apelido, username

**Perfil** (`Profile`):
A página pública de uma Conta, com Loadout em vitrine e Estatísticas.

**Perfil privado** (`isPrivate` no Perfil, `profilePrivate` na Conta):
Perfil cuja Conta reivindicada optou por esconder as Estatísticas e aparecer como "Jogador privado" no Ranking. Nome, avatar, Loadout e presença em servidor continuam públicos. A própria Conta vê as suas Estatísticas. Estatísticas e Ranking consultam o ponto único `profile-privacy`.

## Itens e loadout

**Item** (`Item`):
Uma peça cosmética de CS2 simulada pela plataforma (skin de arma, faca, luvas, agente ou music kit), com seus atributos.
_Evitar_: skin (quando se fala de qualquer item)

**Atributos do item**:
Float (desgaste), seed (padrão), StatTrak, nametag, stickers e charms aplicados.

**Sticker** (`sticker`):
Adesivo aplicado numa skin de arma (até 5, com posição, rotação e desgaste). Não é um Item: não existe solto no Inventário.

**Charm** (`keychain`):
Chaveiro aplicado numa skin de arma (até 1, com posição e seed). Não é um Item: não existe solto no Inventário.
_Evitar_: chaveiro (na interface, "charm" é o termo do jogo)

**Arma padrão**:
A arma sem skin, como vem no jogo. Não é um Item e nunca aparece no Inventário; é o que o jogador usa num slot sem Item equipado.
_Evitar_: skin vanilla, item padrão

**Inventário** (`Inventory`):
A coleção de Itens que uma Conta montou na plataforma, podendo ter vários Itens para a mesma arma.
_Evitar_: coleção, mochila

**Equipar** (`equip`):
Colocar um Item do Inventário num slot de arma, de um lado (CT, TR ou ambos).

**Loadout** (`Loadout`):
O que está equipado agora em cada slot e lado; é o que o jogador vê no jogo.
_Evitar_: setup

**Preset** (`Preset`):
Um Loadout salvo com nome, que referencia Itens do Inventário e pode ser ativado de uma vez.

**Preset principal** (`main`):
O Preset que toda Conta tem e que nunca é apagado nem fica somente leitura; é o único do plano grátis. O Preset ativo é o Loadout.
_Evitar_: preset padrão, preset default

## Jogo

**Servidor Carmine** (`GameServer`):
Uma instância de servidor dedicado de CS2 operada pela plataforma, de um único Modo.
_Evitar_: sala, lobby

**Nome de vitrine** (`showcaseName`):
O nome que a Staff dá a um Servidor Carmine para descrever a variante ("Retake · Rotação", "Deathmatch · Livre"). Aparece no site e no hostname do jogo (`Carmine | <nome de vitrine> | <código>`). Não é o identificador curto do CLI (`name`, ex.: `retake-1`).
_Evitar_: título, nome do servidor (ambíguo com o `name`)

**Código do servidor** (`code`):
Identificador curto e único de um Servidor Carmine, região·número (SP·1, SP·2), mostrado pequeno ao lado do IP e no fim do hostname.
_Evitar_: tag, ID do servidor

**Modo** (`Mode`):
O tipo de jogo de um Servidor Carmine: Retake, Deathmatch e, depois, 5v5 casual.
_Evitar_: modalidade, game mode

**Batimento** (`Heartbeat`):
O sinal periódico de um Servidor Carmine com mapa e jogadores conectados.
_Evitar_: ping, keepalive, status do servidor

**Presença** (`Presence`):
O estado ao vivo de um Servidor Carmine e de quem está nele, derivado dos Batimentos.
_Evitar_: status do servidor, online/offline (são estados da Presença, não ela)

**Sessão de jogo** (`PlaySession`):
O período contínuo em que uma Conta fica conectada a um Servidor Carmine.
_Evitar_: partida (no Retake e no Deathmatch não há partida)

**Partida** (`Match`):
Um jogo com início e fim definidos; só existe no 5v5.

**Estatísticas** (`Stats`):
Números de desempenho de uma Conta, por Modo e no total. Saem dos **eventos do jogo** (`GameEvent`): kill, dano em inimigo, fim de round e início e fim de Sessão de jogo, que o Servidor Carmine envia em lotes idempotentes (cada evento tem o seu ID; ADR 0018). Bots, aquecimento e kill em aliado não contam (a kill em aliado fica registrada para a moderação). As contagens são guardadas por **semana** (segunda a domingo, horário de Brasília), de onde saem o Perfil e o Ranking. Desde a S12b há também o **detalhe**: atividade por dia (o mapa de calor), abates por arma e lado (o radar), Sessões de jogo e o histórico de rounds do servidor por hora e mapa. O detalhe só existe desde que o plugin novo foi para os servidores ("coletando desde"), e Perfil privado o esconde como esconde as Estatísticas.
_Evitar_: stats (na interface), métricas

**Ranking** (`Leaderboard`):
A classificação semanal das Contas por Modo (top 50), que recomeça na segunda-feira às 00:00 de Brasília. Retake ordena por rounds vencidos (desempate: K/D) e Deathmatch por KPM (desempate: HS%); a ordem sempre fecha, por mais kills e depois pela Conta mais antiga. Semanas anteriores continuam consultáveis. Quem tem Perfil privado aparece como "Jogador privado" e ocupa a posição.

**Mínimo da semana** (`minimum`):
O que a Conta precisa jogar na semana para entrar no Ranking de um Modo: 50 rounds jogados no Retake, 30 minutos no Deathmatch. A interface mostra quanto falta ("faltam 12 rounds").

**Remoção do Ranking** (`ranking_removals`):
A Staff tira uma Conta do Ranking de um Modo numa semana, com motivo e registro de auditoria. Não apaga as Estatísticas; o jogador contesta pelo Discord.
_Evitar_: banir do Ranking, punir (a Remoção não é uma Punição)

## VIP e pagamento

**VIP**:
O plano pago único da plataforma, que libera Itens e benefícios além do plano grátis. Na S20 vira o **Plano** (Capo ou Padrinho); "VIP" fica só como **nome legado interno** (tabela `vip_periods`, IDs de pacote `vip-1m`, `vip-3m`, `vip-6m`) e nunca aparece para o usuário.
_Evitar_: premium, gold

**Período VIP** (`VipPeriod`):
O intervalo de tempo em que uma Conta tem VIP ativo.

**Pacote VIP** (`VipPackage`):
Compra avulsa via Pix que adiciona 1, 3 ou 6 meses ao Período VIP.

**Assinatura VIP** (`VipSubscription`):
Cobrança recorrente mensal no cartão que renova o Período VIP. Não existe no MVP.

**Vaga reservada**:
O direito de um VIP entrar num Servidor Carmine lotado: no Retake, pela retirada de um jogador sem VIP; no Deathmatch, por vagas extras.

**Pagador**:
A pessoa maior de idade que paga o VIP; pode não ser o dono da Conta.

## Moderação

**Staff**:
As Contas com papel de Dono, Admin ou Moderador (`StaffRole`: `owner`, `admin`, `moderator`). Só o Dono altera papéis.

**Punição** (`Sanction`):
Uma medida aplicada a uma Conta em todos os Servidores Carmine: ban, mute (voz), gag (chat), kick ou aviso (`warning`). Ban, mute e gag duram até um horário ou são permanentes; kick e aviso são instantâneos. Medidas aplicadas juntas formam uma ocorrência (`incidentId`).
_Evitar_: penalidade, castigo

**Categoria de infração** (`SanctionCategory`):
O tipo de conduta que levou à Punição (chat ofensivo pessoal, voz ofensiva, griefing, exploit, discriminação, cheat, ameaça, doxxing, conta alternativa para fugir de ban). É o que o jogador e o Perfil público veem, em nome genérico; o motivo livre escrito pela Staff é interno. A reincidência é contada por Categoria.
_Evitar_: tipo de punição, motivo (o motivo é o texto livre)

**Recurso** (`appeal`):
O pedido do jogador para rever uma Punição, feito por ticket no Discord, com resposta em até 72 h. Recurso aceito revoga a Punição, tira do Perfil público e da contagem de reincidência.
_Evitar_: apelação, contestação

**Denúncia** (`Report`):
Um aviso de um jogador sobre outro, feito dentro do jogo com o `!report` e enviado à fila da Staff, com o motivo (cheat, voz ofensiva, chat ofensivo, antijogo ou outro), o servidor, o mapa, o round, o horário e uma cópia das últimas linhas do chat. Vale 1 por alvo a cada 10 minutos e 5 por hora, por denunciante, e no máximo 10 por dia (de Brasília) por Conta, somando todos os tipos de Denúncia, inclusive a de foto (a API recusa o excedente e diz quando tentar de novo). Na fila da Staff, as Denúncias contra a mesma Conta, pelo mesmo motivo, no mesmo Mapa jogado viram um caso só, com a contagem e as provas juntas; arquivar ou punir resolve todas. O prazo da Staff é de 72 h para o jogo e o chat, e de 24 h para a foto e a logo. Quem tem 3 Denúncias arquivadas em 90 dias e mais arquivadas do que confirmadas perde peso: as Denúncias dela vão para o fim da fila e não têm prazo correndo (ADR 0027). Fica na fila até a Staff arquivá-la com motivo ou aplicar uma Punição a partir dela; some 90 dias depois de criada. Denúncia de cheat ou voz sozinha não gera Punição: só com evidência adicional.
_Evitar_: report, reclamação

**Caso** (da fila da Staff):
Um item da fila da Staff: as Denúncias de jogo ou de chat contra a mesma Conta, pelo mesmo motivo, no mesmo Mapa jogado (ou todas as de uma mesma imagem, no caso da foto e da logo), reunidas com a contagem e as provas juntas. A Staff decide o caso uma vez (arquivar ou punir) e a decisão vale para todas as Denúncias dele. Cada caso tem o seu prazo (deadlineAt) ou, quando todas as Denúncias abertas são de quem perdeu peso, nenhum. É o que o painel da Staff (S25) mostra em cada linha e o que o selo do trilho conta.
_Evitar_: ticket, chamado (ticket é o pedido de Recurso, no Discord)

**Log de chat** (`chat_messages`):
O registro de tudo o que é dito no chat dos Servidores Carmine (com o horário, o time de quem falou e se foi chat de time), retido por 30 dias, para a moderação. Registra o que foi dito, mesmo para quem escondeu o chat dos outros com `!chat off`.
_Evitar_: histórico de chat, chat log

## Termos planejados (beta aberto)

Termos já decididos para as fatias de [`docs/specs/beta-aberto.md`](docs/specs/beta-aberto.md). Cada fatia, ao entrar, move o seu termo para a seção certa acima e ajusta os termos que ele substitui.

**Plano** (`Plan`), S20:
O que a Conta assina para ter benefícios. Há dois: **Capo** (`capo`) e **Padrinho** (`padrinho`). Substitui o VIP, que some da interface.
_Evitar_: VIP, premium, assinatura (a assinatura é só uma forma de pagar)

**Concessão do plano** (`PlanGrant`), S20:
Uma compra de pacote, concessão da Staff ou compra de teste: plano, dias e o instante em que foi feita. Não muda depois de gravada. O plano da Conta num instante é **calculado** das concessões (`apps/api/src/plans/plan-timeline.ts`): Padrinho gasta primeiro e o Capo que sobra fica guardado; Capo sobre Padrinho espera na fila. Ver ADR 0026.

**Período do plano** (`PlanPeriod`), S20:
Um trecho de tempo em que a Conta tem um plano ativo, calculado da agenda (substitui o Período VIP).

**Pacote** (`PlanPackage`), S20:
O que se compra: 1, 3 ou 6 meses de Capo ou de Padrinho. A duração é forma de pagamento, não plano.

**Plano de teste** (`test`), S20:
O plano das compras de teste do beta, em que ninguém paga de verdade. Acaba no dia em que a cobrança real ligar, com aviso 7 dias antes.

**Mapa jogado** (`MapPlay`), S17:
Um mapa do começo ao fim (ou até um reinício) num Servidor Carmine, que agrupa os rounds da coleta por round. Interno: não aparece para o jogador.
_Evitar_: partida (nos servidores abertos não há Partida)

**Resumo do round** (`RoundSummary`), S17:
O que cada jogador fez num round (kills, mortes, assistências, dano, sobreviveu, foi trocado, abertura, multi-kill, clutch, KAST), calculado pela API no fim do round e guardado para sempre.

**Rating Carmine** (`rating`), S21:
A estatística principal de desempenho, com média 1,00, calculada por Modo (Retake e 5v5) a partir dos Resumos do round, mais um **Rating Carmine geral**. Aparece só depois de 100 rounds no Modo ("Calibrando").
A fórmula v1 (5 partes por lado, comparadas com a População do Rating, com puxão para 1,00 em amostra pequena) está no ADR 0029.
_Evitar_: HLTV Rating (é marca de outra empresa), nota, skill

**Calibrando** (`calibrating`), S21:
O estado de quem ainda não tem 100 rounds no Modo desde o início da coleta: o Perfil, o `!rank`, o `!stats` e o card mostram `Calibrando 37/100` no lugar do Rating.

**População do Rating**, S21:
As Contas com 100 rounds ou mais num Modo e lado nos últimos 90 dias, de onde saem a média e o desvio de cada parte do Rating. Recalculada toda semana, com a versão da fórmula gravada. Interna: não aparece para o jogador.

**Pontuação DM** (`dmScore`), S21:
O número de desempenho do Deathmatch, numa escala própria em torno de 100 (a média da população do DM), porque o DM não tem round. Compara abates por minuto, K/D, dano por minuto e HS% com a população dos últimos 90 dias, e só aparece depois dos mesmos 30 minutos do Ranking do DM (ADR 0030).

**Rating escondido** (`skillRating`), S21:
O rating de habilidade (Glicko-2) que ninguém vê, usado para equilibrar os times das Salas e, no futuro, no matchmaking.

**Modo anônimo** (`anonymousMode`), S22:
Benefício do Padrinho: no servidor, o nome vira uma palavra estranha e sem sentido; nas Salas, quem era só aparece na página da Partida depois do fim.
_Evitar_: streamer mode, incógnito

**Sala** (`Room`), S23:
Uma partida privada que uma Conta com Plano cria no site, com o Modo escolhido (5v5, Retake ou Deathmatch) e um servidor só para ela.
_Evitar_: lobby, sala privada (na interface basta "Sala")

**Partida** (`Match`), S23:
Muda de sentido: passa a ser só o jogo de uma **Sala**, com página, placar e, no 5v5 com 5 contra 5, demo. Os servidores abertos e o 5v5 Casual não têm Partida.

**Amizade** (`Friendship`), S28:
Vínculo mútuo entre duas Contas no Carmine (um pede, o outro aceita). Os amigos da Steam viram sugestão.

**Time** (`Team`), S30:
Grupo fixo com nome, tag, logo e dono, que desafia outros Times. Um jogador pode estar em até 5.
_Evitar_: clã, equipe

**Consigliere** (`agent`), S27:
O assistente de IA do Carmine: responde sobre os dados e faz ações com confirmação.
_Evitar_: bot, IA, Treinador
