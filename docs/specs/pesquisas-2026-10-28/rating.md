# Rating Carmine: pesquisa das fórmulas da HLTV (2026-10-28)

Fontes principais: artigos da HLTV (news/4094, 20695, 40051, 42485, 43047, 45596), awpy 2.0.2 (aproximação da comunidade), Leetify (blog), docs do CounterStrikeSharp.

## Versões
- **1.0 (2010):** a única pública: (KillRating + 0,7·SurvivalRating + MultiKillRating) / 2,7, cada parte dividida por uma média.
- **2.0 / 2.1 (2017 / 2024):** 5 partes por lado (Kills, Sobrevivência, KAST, Impact, Dano), normalizadas por média e desvio, média 1,00. **Fórmula privada.** Aproximação da comunidade (awpy): 0,0073·KAST% + 0,3591·KPR − 0,5329·DPR + 0,2372·Impact + 0,0032·ADR + 0,1587.
- **3.0 (08/2025, ajustes em 10/2025 e 10/2026):** 6 partes (Kills, Dano, Sobrevivência, KAST, Multi-kills, **Round Swing** = quanto cada ação muda a probabilidade de vitória do round) + ajuste por economia. Conceitos públicos, pesos e tabelas não.
- **Leetify:** documentado: média por round da variação de probabilidade de vitória; crédito de cada kill dividido (autor 35%, dano 30%, flash 15%, trade 20%).

## Recomendação
- **5v5:** começar num "2.1-like" (5 partes por lado, com médias da nossa própria população, média 1,00); evoluir para "3.0-lite" (Round Swing + economia) quando houver milhares de rounds para montar a tabela de probabilidade.
- **Retake:** 2.1-like com médias próprias do Retake, sem economia (o allocator dá as armas); Swing simples opcional (vivos × vivos × tempo da bomba). Clutches pesam muito.
- **DM:** rating por round não faz sentido (sem round, time ou vitória). Usar um **"DM score"** separado (kills/min, K/D, dano/min, HS%).
- **Tudo dá para capturar** pelos eventos do CounterStrikeSharp (player_death com flash assist, player_hurt com vida restante, round_end com motivo, valor do equipamento, bomba); trades, clutches, aberturas e Swing são calculados por nós.

## Armadilhas
- **Amostra:** exigir mínimo de rounds e puxar amostras pequenas para 1,00.
- **Normalizar** por modo, lado e mapa; recalibrar as médias de tempos em tempos.
- **Farm:** com fórmula aberta, limitar peso de kills em quem salvou arma e na pistola inicial.
- **Marca:** a HLTV é da Better Collective. Usar "Rating Carmine", nunca "HLTV Rating"; não copiar texto deles. (Não é parecer jurídico.)
