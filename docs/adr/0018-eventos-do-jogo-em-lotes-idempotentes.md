# Eventos do jogo chegam em lotes idempotentes, com ID gerado no servidor

As Estatísticas e o Ranking (S12) nascem de eventos do jogo: kill (com headshot, arma, bot, aliado), dano em inimigo, fim de round (vencedor e quem jogou) e início e fim de Sessão de jogo. O Carmine.Core enfileira cada evento em memória, com um ID próprio (UUID v7, gerado na hora em que acontece), e o manda a `POST /api/server/events` em lotes de até 200 eventos (o limite da API é 500), a cada 5 s, no fim do mapa e uma última vez ao descarregar o plugin. A API só conta um evento se o ID dele entrar na tabela `game_events` na mesma transação que soma nas Estatísticas; reenviar o lote inteiro, ou parte dele em outro lote, devolve `duplicates` e não muda nenhum número. O plugin só tira um evento da fila depois do 200; com a API fora, tenta de novo com recuo (5 s, 10 s, 20 s... até 5 min), e uma fila acima de 5.000 eventos descarta os mais antigos (com log). Um lote que a API recusa (400 ou 413) é descartado, para não travar a fila.

O plugin só relata o que aconteceu; a API decide o que conta, em um lugar só (`stats-deltas.ts`, testado): aquecimento e bots não contam (um bot como assassino ou vítima anula o evento para todos; um bot só na assistência tira só a assistência); kill em aliado não conta kill nem morte e fica em `team_kills` para a moderação; suicídio e mundo (queda, bomba) contam só a morte; a Sessão de jogo soma `fim − início` quando acaba (uma Sessão sem fim, de uma queda do servidor, não soma; acima de 24 h é lixo); um round conta como jogado para todos os que estavam nele no começo, inclusive quem saiu no meio. O Modo vem do Servidor Carmine que autenticou o lote (a chave), não do evento.

As somas ficam em `account_stats_weekly`, uma linha por Conta × Modo × semana (segunda-feira às 00:00 de Brasília, sem horário de verão), atualizadas por `insert ... on conflict do update` na mesma transação. O Perfil lê somando as semanas da Conta (poucas linhas); o Ranking semanal (S12, parte B) lê a semana direto: rounds vencidos e jogados, kills, mortes, assistências, headshots, dano e segundos jogados, de onde saem K/D, HS%, ADR e KPM. Uma Sessão que atravessa a segunda-feira se divide entre as duas semanas.

## Consequences

- O reenvio é sempre seguro, então o plugin não precisa saber se um 5xx ou um timeout perdeu o pedido ou só a resposta: manda de novo.
- Uma queda do servidor de jogo perde o que estava na fila em memória (alguns segundos de eventos) e o tempo das Sessões abertas. Aceito: as Estatísticas são de recreio, e gravar a fila em disco custaria mais do que vale.
- `game_events` guarda só o ID e a hora de recebimento (sem dado pessoal), e o plugin nunca guarda um evento por mais que algumas horas. Por isso o `RetentionJob` (o mesmo da S13) apaga as linhas com `received_at` acima de 30 dias (`GAME_EVENT_RETENTION_DAYS`), em lotes de 5.000 para não segurar a tabela. Um evento reenviado depois dos 30 dias seria contado de novo, o que o plugin não faz.
- O início da Sessão é aceito e deduplicado, mas não soma nada hoje (o fim carrega `startedAt`). Fica no contrato para a Presença e a moderação.
- A anonimização da Conta (S08) apaga as suas linhas de `account_stats_weekly`; `team_kills` fica (registro de moderação, sem dado que identifique a pessoa depois da anonimização).
- Um servidor com o relógio errado distorce a semana de um evento. A chave de servidor é de confiança (ADR 0005), então a API não desconfia do horário.
- A migração é só aditiva (três tabelas novas), então o rollback é de imagem.

## Considered Options

- Um `POST` por evento: simples, mas dano gera dezenas de chamadas por segundo e o rate limit do servidor (600/min) estoura.
- Agregar no plugin (kills, mortes, dano por jogador e por round) e mandar só totais: lote menor, mas qualquer regra nova (ou correção de regra) exigiria atualizar o plugin nos servidores, e o reenvio idempotente de totais é bem mais difícil do que o de eventos.
- Idempotência por número de sequência do lote: exige estado persistente no plugin (o contador sobreviver a reinício) e não deduplica o reenvio de parte do lote; o ID por evento não precisa de nada disso.
- Calcular as Estatísticas somando os eventos na hora da leitura: guardaria cada evento para sempre (dano por acerto é volumoso) e deixaria o Perfil mais lento; as somas semanais já respondem ao Perfil e ao Ranking.

## Adendo (S12, parte B): Ranking semanal

O Ranking lê `account_stats_weekly` direto, uma semana e um Modo por vez, sem tabela nova de classificação.

- **Ordem determinística.** Retake: rounds vencidos, depois K/D; Deathmatch: KPM, depois HS%. Se ainda empatar, mais kills e, por fim, a Conta mais antiga (menor ID público), que é único e fecha a ordem. K/D e KPM (2 casas) e HS% (1 casa) são comparados como são mostrados, para que um empate visível seja sempre decidido por uma regra visível. A ordenação fica em `stats/ranking.ts` (puro, testado) e roda em memória sobre as Contas elegíveis da semana; só o top 50 vai à tela, e cada pessoa logada recebe a própria posição, mesmo fora dele.
- **Mínimo por jogo, não por vitória.** Entra quem jogou 50 rounds (Retake) ou 30 minutos (Deathmatch) na semana, o que impede que 3 rounds vencidos de 3 joguem alguém no topo.
- **Cache curto no Valkey.** A ordem inteira de cada Modo e semana fica por 45 s (`RANKING_CACHE_TTL_SECONDS`, 0 desliga). O cache guarda só números e IDs internos: nome, avatar e Perfil privado (`rankingIdentity`) são lidos a cada pedido, então ligar o Perfil privado vale na hora. A remoção pela Staff invalida a chave (o painel e o CLI). Com o Valkey fora, o Ranking só fica mais lento.
- **Remoção por Conta × Modo × semana** em `ranking_removals`, com a Staff e o motivo, e `ranking_entry_remove` no log de auditoria. É uma exclusão da classificação, não das Estatísticas: o Perfil continua igual.
- Migração só aditiva (`ranking_removals` e um valor novo no enum de auditoria), então o rollback é de imagem.

## Adendo (S12b): Estatísticas detalhadas

Nenhum evento novo: os cinco tipos bastam. O plugin só passa a mandar **campos a mais, todos opcionais** (plugin velho com API nova, e o contrário, seguem funcionando; campo ausente é `null`): `killerTeam` na kill; `map`, `roundNumber`, `scoreCt` e `scoreT` no fim de round; `map` no início e `maps` no fim da Sessão. Contrato e semântica: `docs/specs/s12b-contratos.md`.

- **Quatro tabelas aditivas, escritas na mesma transação que `account_stats_weekly`**, só com os eventos novos de cada lote (os IDs repetidos já saíram em `game_events`), então reenviar o lote, ou parte dele, não muda nenhuma delas:
  - `account_stats_daily` (Conta × Modo × dia de Brasília): as mesmas somas por dia, pelas mesmas regras de `stats-deltas.ts`; é o mapa de calor. O dia vem da hora do evento, e uma Sessão que atravessa a meia-noite se divide por dia (`splitByDay`, como `splitByWeek`).
  - `account_weapon_stats` (Conta × Modo × arma × lado): a kill que conta nas Estatísticas e veio com `killerTeam`; sem o lado (plugin velho) ela conta no resto mas não no radar. A arma é normalizada para uma das `STAT_WEAPONS` (`stats/weapons.ts`): o que não conhece vira `other`, o que limita a cardinalidade. Armas "de sempre", sem série semanal.
  - `play_sessions` (chave: o `sessionId` do plugin): início e fim são upserts na mesma linha, em qualquer ordem. O fim só fecha uma Sessão ainda aberta (um fim repetido ou atrasado não a reescreve) e cria a linha se o início não chegou; o início só completa o mapa que faltar. A duração só vale entre 0 e 24 h. Sessão sem fim (queda do servidor) fica aberta e sem tempo; a leitura esconde as abertas há mais de 24 h.
  - `server_hours` (Servidor × hora cheia × mapa): rounds, vitórias CT e TR, primeiro e último round e o placar do round mais recente do grupo (o placar final do mapa). Só round de verdade (sem aquecimento) e com `map`; não depende de haver Conta. Alimenta a página do servidor (PR C).
- **Retenção** (o `RetentionJob` existente, em lotes de 5.000): o dado diário e as horas do servidor 400 dias; as Sessões de jogo 90, porque revelam o horário em que uma pessoa joga. `account_weapon_stats` e o semanal não expiram.
- **Privacidade.** Atividade, armas e Sessões passam por `canSeeStats`: Perfil privado, só a própria Conta. De fora, a Sessão só mostra Modo, mapa, dia e duração (nunca servidor nem hora do relógio); o horário exato e o "em andamento" são da própria Conta. A anonimização (S08) apaga as linhas da Conta das três tabelas por Conta (a linha da Conta não é apagada, então o cascade não age).
- **Sem histórico para trás.** `game_events` só guarda o ID, então o que foi jogado antes do plugin novo não vira dado detalhado; o `since` dos endpoints é o primeiro dia com dado detalhado da Conta ("coletando desde").
- **O batimento** ganha `match` (placar de times) e `scoreboard` (placar por jogador) como estado inteiro, opcionais; ficam no Valkey junto da presença (PR C). Em vez de evento de round, porque o estado se perde com o restart da API e o batimento já é o estado inteiro (ADR 0016).
- **Descartado:** guardar cada kill (cerca de 9 milhões de linhas por ano no lançamento, e um registro por abate por mais tempo que o necessário) e derivar as Sessões das diferenças de `players` entre batimentos (resolução de 10 s, perde a Sessão quando um batimento falha e escreve a cada batimento).
- Migração `0014` só aditiva (um enum e quatro tabelas), então o rollback é de imagem.

