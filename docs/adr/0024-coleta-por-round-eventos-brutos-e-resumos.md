# Coleta por round: eventos brutos por 12 meses e o resumo do round para sempre

O ADR 0018 decidiu que cada evento do jogo vira soma da semana e do dia na hora, e que o evento em si não se guarda: só o ID, por 30 dias, para a idempotência. Funcionou para as Estatísticas e o Ranking (S12 e S12b), e o adendo da S12b até registrou como **descartado** guardar cada kill. Esse "descartado" muda agora, para os Modos com round (Retake agora; as Salas e o 5v5 Casual quando existirem). O Deathmatch fica de fora da v1: não tem round, o volume é alto, e continua só com as somas de hoje.

**Por que muda.** Três coisas que a spec do beta aberto (S21, S23, S27) exige não saem de somas:

1. **Rating Carmine (S21).** KAST, sobreviveu, trocado, abertura, multi-kill, clutch e dano limitado pela vida são coisas **de um round**: uma soma da semana não diz se a morte foi trocada nem se o jogador era o último vivo. E a fórmula vai evoluir (de um "2.1-like" para um "3.0-lite" com Round Swing e economia, pesquisa de 2026-10-28), o que só é possível recalculando sobre o que aconteceu, não sobre totais.
2. **Consigliere (S27).** O assistente responde "onde eu morro mais?" e "em que lado vou pior?", perguntas por mapa, lado e round.
3. **Matchmaking futuro.** Precisa de histórico por jogador e por partida para balancear.

Tem ainda um custo de não fazer: **o histórico não pode ser recalculado depois.** O Rating só vale a partir do dia em que a coleta começar, então quanto mais cedo ela existir, mais histórico terá quando a primeira tela que usa o Rating nascer. Por isso a coleta vem antes de qualquer tela.

## Decisão

- **O plugin continua só relatando** (ADR 0005 e 0018): manda os eventos no mesmo lote idempotente, com campos a mais, **todos opcionais**, para a API aceitar o plugin atual e o novo. Os campos novos estão em `packages/contracts/src/stats.ts`: o mapa jogado (`mapPlayId`, um UUID v7 que o `MatchTracker` cria a cada mapa novo ou reinício de partida), o número do round, o horário do servidor em milissegundos; `round_start` com lado e valor do equipamento de cada jogador; na kill, o lado da vítima, flash assist, wallbang, fumaça, cego, noscope, distância e posições; no dano, vítima, arma, `hitgroup`, dano na armadura e dano limitado à vida; eventos de bomba; no `round_end`, motivo, duração e quem estava vivo.
- **Quem decide o que conta continua sendo a API**, num lugar só, puro e testado: `apps/api/src/stats/round-summary.ts` recebe os eventos de um round e devolve o resumo por jogador. As regras do ADR 0018 valem (bot como assassino ou vítima anula o evento, kill em aliado não conta kill nem morte, aquecimento não conta) e as da HLTV 3.0 para assistência (40 de dano ou mais). Um round sem humanos nos dois lados (o `cs2-retakes` simula rounds) não gera resumo.
- **Dois níveis de dado, com vidas diferentes:**
  - **Eventos brutos**, numa tabela por mapa jogado e round, **particionada por mês** e guardada **12 meses**. É o que permite recalcular o Rating, corrigir uma regra ou responder ao Consigliere durante um ano.
  - **Resumo do round por jogador e resumo do mapa jogado**, guardados **para sempre**, ligados à Conta. É o que o Rating, o Perfil e a Página da Partida leem.
- **O `RetentionJob` apaga o bruto por partição**: em vez de `delete` em lotes de 5.000 (que serve às tabelas pequenas do ADR 0018), ele cria as partições dos próximos meses e **solta** a partição com mais de 12 meses, o que é instantâneo e não deixa linhas mortas. Os resumos não expiram.
- **Idempotência igual à do ADR 0018.** O ID do evento entra em `game_events` na mesma transação; reenviar o lote, ou parte dele, não duplica evento nem resumo. O resumo é uma função pura dos eventos do round, então refazê-lo (por exemplo, quando chega um evento atrasado depois do `round_end`) dá o mesmo resultado e grava por cima.
- **Privacidade (LGPD).** O resumo e o bruto ficam ligados à Conta pelo ID interno, e nenhuma linha guarda SteamID. Apagar a Conta (S08) **apaga os resumos dela** (por jogador e do mapa), como já faz com as Estatísticas, e **anonimiza os brutos**: as colunas de Conta viram nulas, e o resto do round, que também é dos outros jogadores, fica. Posição e distância não identificam ninguém sozinhas. O prazo de 12 meses do bruto é o mínimo que permite recalcular o Rating, e o resumo guarda só números derivados.

## Volume esperado (estimativa, a confirmar com o tráfego real)

Premissas: um servidor de Retake cheio (10 jogadores) faz cerca de 90 rounds por hora, e um round gera na ordem de 50 eventos (um `round_start`, 6 a 8 kills, 30 a 40 acertos de dano, a bomba e o `round_end`).

| | Por servidor cheio | Com ~8 h cheias por dia |
| --- | --- | --- |
| Eventos brutos | ~4.500 por hora | **dezenas de milhares por dia** (~36.000) |
| Eventos brutos em 12 meses | ~13 milhões | partição mensal de ~1 milhão de linhas |
| Resumos de round (10 por round) | ~900 linhas por hora | ~7.000 por dia, ~2,6 milhões por ano |

Para comparar, o ADR 0018 recusou guardar cerca de 9 milhões de kills por ano no lançamento. Agora o volume é maior, porque o dano por acerto é a maior parte, mas vem com um teto: 12 meses de bruto e partições soltas por mês. A partição mensal mantém cada índice pequeno e a retenção barata; a ordem de grandeza (algumas centenas de MB por partição) é folgada para o Postgres da topologia de lançamento. Se o tráfego passar muito disso, o dano por acerto é o primeiro candidato a ser agregado por vítima e round antes de gravar.

## Consequences

- **O ADR 0018 deixa de dizer "não guarda evento" para os Modos com round.** As somas da semana e do dia seguem iguais e são a fonte das Estatísticas e do Ranking de hoje; nenhuma tela muda nesta fatia. O resto do ADR 0018 (lote idempotente, ID do evento gerado no servidor, Modo vindo da chave) continua valendo.
- **Os dois lados convivem:** o plugin atual não manda nada disso e a API não exige; a API nova aceita o plugin novo. Enquanto o plugin novo não sair, a coleta não começa.
- **A calculadora é a única definição de "trocado", "clutch", "assistência" e "KAST"**, com testes de sequências gravadas. Mudar uma regra é mudar um arquivo e recalcular a partir do bruto, dentro dos 12 meses. Antes disso, só o resumo existe, e ele não se refaz sozinho: por isso o prazo de 12 meses importa.
- **Dois níveis de retenção a documentar para o advogado:** o bruto de 12 meses e o resumo sem prazo, ambos anonimizados com a Conta. O texto de privacidade precisa citá-los antes da coleta ligar em produção.
- **O que o resumo não cobre** (fica para o bruto, até 12 meses): Round Swing, economia detalhada e qualquer coisa que dependa de posição ou tempo fino. Quando o Rating pedir, a calculadora é estendida e roda sobre o bruto.
- **Custo de operação:** um job a mais cuidando das partições (criar o mês seguinte, soltar o mais velho). Se ele falhar, a escrita continua (a partição do mês corrente é criada com antecedência) e o bruto só fica retido por mais tempo.
- **Fatiamento:** o PR A (este) traz só os contratos, o ADR e a calculadora pura, sem banco nem plugin. As tabelas, a gravação, a retenção e o `MatchTracker` vêm nos PRs B e C.

## Considered Options

- **Continuar só com somas (ADR 0018):** o mais barato, mas o Rating por round, o Consigliere e o matchmaking não existiriam, e a cada mês sem coleta é um mês de histórico perdido para sempre.
- **Agregar no plugin e mandar o resumo do round pronto:** lote menor, mas qualquer regra nova exigiria atualizar o plugin em todos os servidores, e o reenvio idempotente de resumos é mais difícil do que o de eventos (mesma razão do ADR 0018).
- **Guardar o bruto para sempre:** permite recalcular qualquer coisa a qualquer hora, mas é um registro de cada abate por mais tempo do que o necessário (LGPD) e cresce sem fim; 12 meses cobrem a evolução do Rating.
- **Guardar só o resumo do round, sem o bruto:** metade do custo, mas uma regra errada ou uma fórmula nova ficariam sem volta, o mesmo problema do ADR 0018.
- **`delete` em lotes, sem partição:** é o jeito do `RetentionJob` hoje, mas em dezenas de milhões de linhas deixa a tabela inchada e demora; a partição por mês resolve com um `drop`.
- **Incluir o Deathmatch:** sem round, sem time e sem vitória, o resumo por round não faz sentido nele (a pesquisa recomenda um "DM score" separado), e o volume é o maior de todos.

## Adendo (PR C): como ficou o armazenamento

- **Uma tabela bruta só**, `round_events`, com uma linha por evento (`kind`: `round_start`, `kill`, `damage`, `bomb`, `round_end`) e linhas derivadas para o elenco do `round_start` (`round_player`) e os vivos do `round_end` (`round_alive`). As Contas estão em colunas (`actor`, `target`, `assist`); o resto do evento, sem identidade, vai em `payload` (jsonb). Sem chaves estrangeiras, para a escrita ser barata e a partição poder cair. A chave inclui `occurred_at`, que a partição exige.
- **Quem não tem Conta** não vira referência: a calculadora o trata como um bot (o evento dele não conta, mas ele ocupa um lugar de vivo). Só entra evento com `mapPlayId` e número do round (o plugin atual não manda, então nada é guardado dele), fora o aquecimento, e só com horário entre 12 meses atrás e um dia à frente.
- **O resumo é gravado dentro da transação do lote.** A cada lote, a API lê as linhas dos rounds tocados, e se o `round_end` já existe roda `summarizeRound` e grava `round_summaries`, `round_player_summaries`, `map_plays` e `map_play_players` (estes dois recalculados por SQL a partir dos resumos de round). Um evento atrasado que chega depois do `round_end` refaz o resumo por cima; um lote reenviado não muda nada. Um bloqueio consultivo por mapa jogado serializa dois lotes do mesmo mapa.
- **Partições:** a migração 0019 cria o mês corrente e os dois seguintes; a API cria o mês de um evento antes da transação; o `RetentionJob` (de hora em hora) mantém os próximos criados, **solta** as partições inteiras mais velhas que o corte e apaga em lotes as linhas do mês do corte que já passaram dele, então nada com mais de 12 meses sobra.
