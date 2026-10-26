# S12b · O placar do Retake: spike pelo código

Pergunta do PR B: de onde sai um placar de times (CT × TR e o round) em que dá para confiar num servidor Retake, se o `cs2-retakes` pode zerar ou reinterpretar os contadores do jogo? Não há servidor de teste ligado (e o servidor local roda no notebook do dono), então o spike foi **pelo fonte** do `cs2-retakes` 3.1.1 (a versão fixada em `infra/cs2/linux/versions.sh`, tag `3.1.1` de `B3none/cs2-retakes`), lido arquivo a arquivo. O que o código não prova está listado no fim, para validar na beta real.

## O que o cs2-retakes 3.1.1 faz com o placar

| Achado | Onde (arquivo da tag 3.1.1) | Consequência |
| --- | --- | --- |
| **Nunca escreve** `CCSTeam.Score` nem `TotalRoundsPlayed` (nenhuma ocorrência no plugin). O placar de times é o do próprio jogo, somado pelo término normal dos rounds. | `RetakesPlugin/**` (busca por `Score`, `TotalRounds`, `m_iScore`) | O placar do jogo, em condições normais, é o placar real. |
| Tem placar **próprio por jogador** (50 por kill, 25 por assistência, 50 por defuse), usado só para escolher quem troca de lado, e o **zera a cada round** (`ResetPlayerScores` em `OnRoundStart`). | `Managers/GameManager.cs`, `Models/PlayerScore.cs`, `Events/RoundEventHandlers.cs` | É outro número, sem relação com o placar do jogo. O que o jogo mostra por jogador (kills, mortes, pontos) é o do jogo. |
| Só **lê** o vencedor do `round_end` (`_lastRoundWinner`) para decidir a rotação de times e a sequência de vitórias dos TR. | `Events/RoundEventHandlers.cs` (`OnRoundEnd`), `GameManager.cs` (`TerroristRoundWin`, `ScrambleTeams`) | Troca jogadores de lado a cada round (`SetRoundTeams`); o placar pertence ao **time** (CT ou TR), não ao jogador, então a troca não o move. |
| **Termina rounds por conta própria**: `TerminateRound(RoundDraw)` quando não há quem plante e `TerminateRound(TerroristsWin)` em `CheckRoundDone` (um lado sem humanos). | `Utils/GameRulesHelper.cs`, `RoundEventHandlers.cs` (`HandleAutoPlant`) | Esses rounds **são contados pelo jogo** (um deles vira ponto dos TR) mas não foram jogados: inflam o placar do jogo. |
| Roda **`mp_restartgame 1`** quando o servidor esvazia (`RestartGameIfEmpty`) e ao reiniciar o jogo. | `GameManager.cs`, `GameRulesHelper.RestartGame`, `RetakesPlugin.cs` | O jogo zera placar e `TotalRoundsPlayed`: um reinício no meio do mapa é normal. |
| Usa **aquecimento** como sala de espera (`mp_warmup_start` / `mp_warmup_end`) quando falta gente. | `GameManager.cs` | Rounds de aquecimento não contam; ao acabar o aquecimento o jogo recomeça a partida. |

Do perfil do servidor (`infra/cs2/profiles/retake/.../retakes.cfg`): `mp_maxrounds 30` (um mapa = 30 rounds, o RockTheVote vota 2 antes do fim), `mp_halftime 0` (sem troca de lado que inverta o placar), `mp_match_can_clinch 0`, `mp_match_end_restart 0`.

## Decisão

O plugin **conta o próprio placar** (`MatchTracker`, `plugins/src/Carmine.Core/MatchTracker.cs`), a partir do `round_end`, e o placar do jogo é a **fonte secundária**:

- **Conta** um round quando não é aquecimento **e** havia humanos nos dois lados (a lista do round, que já existia para as Estatísticas). Isso deixa de fora exatamente os rounds sintéticos do cs2-retakes. Empate conta como round jogado, sem ponto para ninguém.
- **Zera** no começo do mapa (`OnMapStart`), na partida nova (`begin_new_match`, o evento do `mp_restartgame` e do fim do aquecimento) e quando o jogo diz que recomeçou (`TotalRoundsPlayed` = 0 no começo de um round de verdade com a contagem do plugin adiante).
- **Confere** com o jogo (`CCSGameRules.TotalRoundsPlayed` e `CCSTeam.Score` dos dois times) no começo de cada round de verdade. Se discordar, **vale a contagem do plugin** e o log avisa uma vez por partida (`o placar do jogo diverge da contagem do plugin ...`). Se não der para ler o jogo, a contagem do plugin segue sozinha.
- **Hot reload** com a partida andando: parte do que o jogo já contou (`Adopt`).
- **O Deathmatch fica com `match` nulo** (`mp_teammates_are_enemies`: todos contra todos, sem placar de times) e os fins de round, se existirem, saem sem número nem placar.
- O batimento leva o placar e sai também **no fim de cada round** (hoje saía a cada 10 s e depois de connect/disconnect), para a página do servidor acompanhar o jogo.

Por que contar no plugin em vez de ler o jogo: o jogo conta os rounds sintéticos do cs2-retakes, e a diferença apareceria como placar enganoso (o contrário do "nada de dado inventado"); a contagem do plugin só tem o que a API também usa para as Estatísticas (a lista do round).

## O que não dá para provar pelo código (validar na beta real, com jogadores)

1. **O evento de reinício.** Que `begin_new_match` dispara em `mp_restartgame 1` e no fim do aquecimento do jogo (o nome existe no CounterStrikeSharp, mas o disparo não foi observado). Se não disparar, a conferência de `TotalRoundsPlayed` = 0 é a rede de segurança; o log `a partida recomeçou` mostra qual pegou.
2. **Leitura do jogo.** Que `CCSGameRules.TotalRoundsPlayed` e `CCSTeam.Score` são legíveis no CS2 atual do servidor e já estão atualizados no `round_start`. Se a leitura falhar, só a divergência deixa de ser avisada.
3. **Divergência real.** Num mapa de 30 rounds com jogadores, o log de divergência deve ficar calado, salvo reinício com gente saindo. Uma divergência frequente indica um caso que o código não previu (por exemplo, outro plugin mexendo no placar): olhar o log e o `server_hours` no site.
4. **Empate.** Que `round_end` com vencedor `none` (sem planter) é o que acontece de fato nesse caso, e que o jogo não dá ponto a ninguém nele.
5. **Rotação de times.** Que o `winner` do `round_end` continua sendo o time (CT/TR) e não o jogador que trocou de lado: o código do cs2-retakes sugere que sim; conferir um round em que a rotação acontece logo antes do fim.
6. **Fim do mapa** (30 rounds): o placar fica congelado até o próximo mapa (esperado), e a votação do RockTheVote não altera a contagem.

Se algo disso falhar, o efeito é um placar errado na página do servidor, não perda de Estatísticas: o `match` vem do batimento, e as Estatísticas continuam saindo só dos eventos. O ajuste cabe em `MatchTracker` (puro e testado).
