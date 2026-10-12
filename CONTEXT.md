# Carmine

Plataforma brasileira de servidores comunitários de Counter-Strike 2 com skins simuladas. O jogador entra num servidor Carmine para jogar e usa o site para gerenciar a sua identidade, o seu loadout e o VIP.

Termos em **PT-BR** são os da interface; o nome entre parênteses é o usado no código.

## Jogador e conta

**Conta** (`Account`):
O registro de uma pessoa na plataforma, identificado pelo SteamID64. Nasce automaticamente no primeiro connect a um Servidor Carmine.
_Evitar_: usuário, perfil, cadastro

**Conta não reivindicada** (`unclaimed`):
Conta que só existe porque a pessoa jogou; ela nunca fez login no site.
_Evitar_: conta fantasma, conta temporária

**Conta reivindicada** (`claimed`):
Conta cuja pessoa já fez login Steam no site ao menos uma vez. É a mesma Conta, nunca uma nova.
_Evitar_: conta registrada, conta ativada

**ID público** (`publicId`):
Número curto, imutável e único que identifica a Conta na plataforma; números menores pertencem a Contas mais antigas.
_Evitar_: username, apelido, handle

**ID reservado**:
ID público abaixo de 10.000, ou marcado como número bonito, atribuído manualmente pela Staff (fundador, beta, Staff).

**Nome de exibição** (`displayName`):
O nome que representa a Conta no site e dentro dos Servidores Carmine. Não é único.
_Evitar_: nick, apelido, username

**Perfil** (`Profile`):
A página pública de uma Conta, com Loadout em vitrine e Estatísticas.

**Perfil privado**:
Perfil cuja Conta reivindicada optou por esconder as Estatísticas e aparecer anônima no Ranking.

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
Números de desempenho de uma Conta, por Modo e no total.

**Ranking** (`Leaderboard`):
A classificação semanal das Contas por Modo.

## VIP e pagamento

**VIP**:
O plano pago único da plataforma, que libera Itens e benefícios além do plano grátis.
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
Um aviso de um jogador sobre outro, feito dentro do jogo e enviado à fila da Staff.
_Evitar_: report, reclamação
