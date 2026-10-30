# Rating Carmine: a fórmula v1

A S21 da [spec do beta aberto](../specs/beta-aberto.md) define o Rating Carmine em linhas gerais: 5 partes por lado, comparadas com a nossa população, média 1,00, "Calibrando" até 100 rounds, amostra pequena puxada para 1,00. Faltava a conta. Este ADR a fixa como **v1**, para a calculadora (S21 P3) ter uma definição só e para o Aceite ("o Rating bate com a planilha de conferência") ter contra o que conferir. A base são os resumos de round da S17 ([ADR 0024](0024-coleta-por-round-eventos-brutos-e-resumos.md)). A pesquisa de onde isto vem é [`rating.md`](../specs/pesquisas-2026-10-28/rating.md): a HLTV 2.1 tem as mesmas 5 partes e **não publica a fórmula**, então esta é nossa, "parecida com a 2.1" e nunca chamada de "HLTV Rating".

Vale para o Retake agora e para o 5v5 quando existir (S23): cada Modo tem a própria população e o próprio 1,00. O Deathmatch não tem Rating (tem a Pontuação DM, ADR 0030).

## Decisão

**O que conta.** Cada linha de `round_player_summaries` da Conta no Modo (o Modo vem de `map_plays.mode`). Aquecimento, bot, round sem humano nos dois lados e kill em aliado já ficam fora na calculadora da S17 (ADR 0018 e 0024). Quando a S23 existir, a partida de Sala marcada "não conta" também sai, na leitura.

**As contagens.** O Rating lê, por Conta, Modo e **lado**, somas dos resumos de round, e só elas. A agregação diária do P3 guarda **contagens, não pontos**, para mudar um peso não pedir reler os resumos:

| Contagem | Vem de |
|---|---|
| `rounds` | linhas do resumo |
| `kills` | `kills` |
| `survivedRounds` | `survived` |
| `kastRounds` | `kast` |
| `damage` | `damage` (já limitado pela vida da vítima) |
| `openingKills`, `openingDeaths` | `openingKill`, `openingDeath` |
| `mk2`, `mk3`, `mk4`, `mk5` | `multiKill` |
| `cw1` a `cw5` | `clutchAgainst` das linhas com `clutchWon` verdadeiro (acima de 5, conta como 5) |

**As 5 partes, por round, em cada lado:** abates (`kills / rounds`), sobrevivência (`survivedRounds / rounds`), KAST (`kastRounds / rounds`), dano (`damage / rounds`) e impacto (`pontos de impacto / rounds`).

**O impacto.** Soma de pontos por round (decisão do dono de 2026-10-29: pesos iniciais calibrados na planilha e escritos aqui como v1):

| O que | Pontos |
|---|---|
| Abertura ganha (primeira kill do round) | +1,0 |
| Abertura perdida (primeira morte do round) | −0,5 |
| Multi-kill de 2, 3, 4, 5 abates | +0,5, +1,5, +3,0, +5,0 (meio ponto por par de abates: 0,5 · k(k−1)/2) |
| Clutch vencido contra 1, 2, 3, 4, 5 | +1,0, +2,0, +3,5, +5,0, +7,0 |
| Clutch perdido | 0 |

Por que estes números: a abertura é o que mais muda a chance de ganhar o round, e perdê-la pesa metade porque a morte já pesa na sobrevivência e no KAST, e para o entry não ser punido duas vezes; o multi-kill premia concentrar os abates e cresce com o número de pares, já que cada abate sozinho está em `kills`; o clutch cresce como a raridade dele (1v1 se ganha perto de metade das vezes, 1v3 raramente), e o perdido não tira nada porque a morte já está contada. **Calibração:** ainda não há dado real (a coleta do plugin não rodou em produção). Na amostra sintética da planilha nenhuma peça passa de 39% dos pontos (abertura ganha 39%, multi-kill 36%, abertura perdida 19%, clutch 6%), que é o que se checou. Com dados de verdade a calibração é refeita e vira outra versão.

**A população.** Para cada Modo e lado: as Contas com **100 rounds ou mais naquele lado nos últimos 90 dias**. Para cada uma das 5 partes, a média e o desvio-padrão (divisor N, cada Conta pesa igual) entre essas Contas. Recalculada **toda semana** (job do P3) e gravada com a **versão da fórmula**. Com **menos de 20 Contas elegíveis** no Modo e lado, a população não existe e ninguém tem Rating naquele Modo (sem dado inventado).

**Do desvio ao Rating do lado.** Para cada parte, `z = (parte da Conta − média) / desvio`, **limitado a ±3** (nada domina o número) e `0` se o desvio for zero. O Rating do lado é `1 + 0,20 · (média dos 5 z)`. Peso igual entre as partes, como a spec pede; **0,20** é quanto um desvio vale (uma Conta 1 desvio acima da população em tudo fica com 1,20).

**Dos lados ao Modo.** O Rating bruto é a média dos Ratings dos lados **pesada pelos rounds** de cada lado. Quem jogou um lado só tem o bruto desse lado. Se um lado jogado não tem população, não há Rating.

**O puxão (amostra pequena).** `Rating = 1 + (bruto − 1) · n / (n + 50)`, com `n` os rounds da janela no Modo e `k = 50`. A 50 rounds o desvio de 1,00 vale metade; a 100, dois terços; a 300, 86%; a 1.000, 95%.

**"Calibrando".** O Rating do Modo só aparece com **100 rounds ou mais no Modo, contados desde o início da coleta** (não só na janela), e antes o Perfil mostra `Calibrando 37/100`. Com 100 já se vê o número. O número de destaque continua sendo o dos 90 dias, com o puxão pelos rounds dessa janela; quem tem 100 rounds na vida e nenhum nos 90 dias não tem Rating nessa janela (`Sem rounds nos últimos 90 dias`).

**Janelas.** O Perfil usa os **90 dias**; o Ranking usa **a semana**. As duas contas são a mesma, só mudam os rounds lidos; **as médias e desvios são sempre os da população de 90 dias**. No Ranking, com o mínimo de 50 rounds, o puxão deixa o Rating em metade da distância até 1,00: é de propósito, e é o primeiro parâmetro a revisar.

**Rating geral.** A média dos Ratings dos Modos que **aparecem** (sem Calibrando, com rounds na janela), pesada pelos rounds da janela em cada Modo. Sem nenhum Modo visível, não há geral. O DM não entra.

**Arredondamento.** O Rating aparece com **2 casas**. O Ranking ordena pelo valor **já arredondado**, para a ordem ser a do que se vê, e desempata por rounds jogados e depois pela Conta mais antiga (spec).

**Estados.** Quem consome devolve um destes e nunca um número inventado: `calibrando` (com os rounds feitos), `sem rounds na janela`, `sem população` e o Rating.

**Versão.** `RATING_FORMULA_VERSION = 1`. Mudar uma peça (os pesos do impacto, `k`, 0,20, o limite de 3 desvios, o mínimo de 100 rounds ou de 20 Contas, a lista de partes) é **versão nova**: a população gravada guarda a versão, e o Rating é recalculado dos resumos, que ficam para sempre. A v2 (Round Swing, economia) vem do bruto de 12 meses, quando houver milhares de rounds de 5v5.

## A planilha de conferência

Fica em [`apps/api/test/support/rating-v1/`](../../apps/api/test/support/rating-v1/), com **dados sintéticos** (semente fixa, 29 Contas): `planilha-populacao.csv` (médias e desvios), `planilha-contas.csv` (cada Conta, parte a parte, abre no Excel em português) e os JSON que os testes leem (`population.json` de entrada, `expected.json` com a resposta, `rounds-sample.json` com 12 linhas de resumo e a soma delas). `oracle.ts` é a fórmula escrita do jeito mais direto, só para conferir; `gerar.ts` regera tudo e `rating-v1.spec.ts` prova que os arquivos batem com a fórmula. **A calculadora do P3 não reaproveita o oráculo**: ela é escrita à parte e os testes dela comparam com `expected.json` (Rating de cada Conta) e com as contagens de `rounds-sample.json`. As Contas `x01` a `x05` são as bordas: Calibrando 37/100, 130 rounds fora da população, 12 rounds na janela, um lado só e nenhum round na janela.

**Conta de uma Conta, para conferir à mão** (`c01`, lado CT: 338 rounds, 163 abates, 146 sobreviveu, 251 KAST, 20.272 de dano, 27 aberturas ganhas, 43 perdidas, 21 duplos, 4 triplos, 2 quádruplos; população do CT com 25 Contas):

| Parte | Da Conta | Média | Desvio | z |
|---|---|---|---|---|
| Abates | 163/338 = 0,482 | 0,641 | 0,204 | −0,781 |
| Sobrevivência | 146/338 = 0,432 | 0,480 | 0,071 | −0,682 |
| KAST | 251/338 = 0,743 | 0,815 | 0,070 | −1,026 |
| Dano | 20272/338 = 59,98 | 78,80 | 22,32 | −0,843 |
| Impacto | 28,0/338 = 0,0828 (27 − 21,5 + 10,5 + 6 + 6) | 0,157 | 0,112 | −0,661 |

Média dos z = −0,799, então o Rating do CT é 1 + 0,20 · (−0,799) = **0,840**. No T dá 0,836. Bruto = (338 · 0,840 + 298 · 0,836) / 636 = 0,838. Puxão com n = 636: 636/686 = 0,927, então Rating = 1 + (0,838 − 1) · 0,927 = **0,85**.

## Consequences

- **Os pesos do impacto estão num repositório público.** A spec quer a página `/rating` sem os pesos, "como faz a HLTV", para ninguém otimizar o número. A página segue sem eles, mas quem lê este ADR os vê. Foi o pedido do dono (pesos escritos no ADR como v1); se a abertura ao público mudar de ideia, os valores vão para uma nota privada e o ADR guarda só a forma. As defesas contra farm que a pesquisa lista (limitar o peso de kill em quem salvou arma e na pistola inicial) **não entram na v1**.
- O P3 implementa isto, com a agregação diária por Conta, Modo, mapa e lado; a população e a versão ficam em tabela. O mapa só filtra as Estatísticas detalhadas (P5): a população não é por mapa na v1.
- Não há Rating enquanto o Modo tem menos de 20 Contas elegíveis, o que no começo do beta será a regra, não a exceção: as telas dizem isso (`sem população`), e o Ranking de Retake mantém a ordenação de hoje até haver cobertura (decisão do dono de 2026-10-29, ADR do P4).
- A população inclui Contas pouco acima de 100 rounds, cujas taxas são ruidosas, o que **infla um pouco os desvios** e portanto aproxima os Ratings de 1,00. A v2 pode corrigir a variância pela amostra.
- O "5v5" não existe no banco ainda (`game_mode` tem `retake` e `deathmatch`); entra com a S23, com população própria.

## Considered Options

- **Dividir cada parte pela média (a 2.0 de 2017) em vez de padronizar:** mais simples e conhecida, mas a spec pede média **e desvio** da nossa população, e o desvio é o que deixa as partes comparáveis entre si (dano em dezenas, KAST em frações).
- **Pesos tirados da regressão que a comunidade publica (awpy):** descartado; são ajustados a partidas profissionais e ao Rating 2.0, não aos nossos Modos, e a spec pede peso igual.
- **Fixar o desvio do Rating em 0,20 e deixá-lo variar o espalhamento (`k` por recálculo):** daria "1,20 é sempre um desvio", mas faz o mesmo desempenho valer números diferentes de uma semana para a outra. O 0,20 fixo troca isso por previsibilidade.
- **População por mapa:** a pesquisa sugere normalizar por mapa também, mas a spec pede Modo e lado, e com poucas Contas dividir por mapa deixaria as populações vazias.
- **Contar os 100 rounds só na janela de 90 dias:** quem joga pouco e há tempo nunca sairia do Calibrando. Contam desde o início da coleta no Modo.
- **Penalizar o clutch perdido:** a morte já pesa na sobrevivência e no KAST; punir de novo desestimula tentar.

## O que ainda falta

Com dados reais: conferir os pesos do impacto (algum evento domina?), o espalhamento de 0,20 (o desvio do Rating da população dá quanto?), o `k = 50` e o mínimo de 20 Contas. Cada mudança é uma versão nova (v2) e recalcula do resumo de round.
