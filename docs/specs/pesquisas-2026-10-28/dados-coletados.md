# O que coletamos hoje x o que um rating estilo HLTV precisa (2026-10-28)

Fonte: `origin/dev` (plugins/src/Carmine.Core, packages/contracts/src/stats.ts, apps/api/src/stats, ADR 0018).

## Hoje
- Eventos: kill (killer, vítima, assistente, HS, arma, lado do killer, team kill), damage (só atacante e valor bruto, sem vítima nem arma), round_end (vencedor, jogadores e lados, mapa, nº do round, placar), sessões.
- **Nada é guardado evento a evento:** tudo vira soma semanal/diária na hora (decisão do ADR 0018 para não guardar ~9 milhões de linhas/ano). **O histórico não pode ser recalculado.**
- Não existe "Partida" no banco nem matchId; o placar por mapa só existe na memória do plugin.
- Dá para calcular hoje: K/D, HS%, ADR aproximado (dano sem corte pela vida da vítima), KPM, % de rounds vencidos.

## Falta para o rating
- Kills, mortes e assistências **por round** (a kill não tem nº do round).
- KAST: sobreviveu e foi trocado (precisa da ordem das kills com tempo dentro do round).
- Flash assist, multi-kills, duelos de abertura, clutches.
- Economia (dinheiro, valor do equipamento, tipo de compra).
- Motivo do fim do round, plant/defuse.
- Dano por vítima limitado pela vida que ela tinha.

## Consequência
O rating só vale a partir do dia em que a coleta por round começar. Quanto antes, mais histórico.
