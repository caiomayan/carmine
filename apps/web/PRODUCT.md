# Product

<!-- impeccable:product-schema 1 -->

> Branch `proto/vida` (protótipo, sem merge). Escrito sem entrevista: tudo abaixo vem do `CONTEXT.md`
> do repositório e do pedido do dono ("o site parece morto, como um blog cru"). Fatos inferidos
> estão marcados com (inferido).

## Platform

web

## Users
Jogadores brasileiros de Counter-Strike 2 que querem entrar num servidor comunitário e usar skins
simuladas (o Loadout deles vale dentro do jogo). Chegam do Discord, de um amigo ou de uma busca; abrem
o site para ver quem está jogando, entrar num servidor, montar o Loadout e acompanhar o Ranking. (inferido)

## Product Purpose
Plataforma de Servidores Carmine (Retake e Deathmatch hoje; 5v5 casual depois). O site é onde a pessoa
vê a Presença ao vivo, gerencia Conta, Inventário, Loadout e VIP, e consulta Perfil e Ranking semanal.
Sucesso: a pessoa entra num servidor e volta toda semana.

## Positioning
Skins simuladas que aparecem de verdade nos servidores comunitários brasileiros, com Loadout, Presets e
Ranking semanal próprios. Nenhum outro site mostra o seu Loadout rodando no servidor onde os seus amigos estão.

## Operating Context
Dados ao vivo vêm dos Batimentos dos servidores (10 s; offline após 45 s) e dos eventos do jogo. Hoje há
poucos servidores e poucos jogadores: o estado mais comum da Home é "nenhum servidor online". A semana
vai de segunda a domingo (Brasília); o Ranking recomeça na segunda às 00:00.

## Capabilities and Constraints
- Termos da interface vêm do CONTEXT.md. "Partida" só existe no 5v5; Retake e Deathmatch têm rounds e
  Sessões de jogo: nunca chamar o que há hoje de "partidas".
- Perfil privado esconde Estatísticas e some no Ranking como "Jogador privado".
- Next.js 16 (App Router), Tailwind v4, tokens em `apps/web/src/app/tokens.css`, i18n em PT-BR
  (`next-intl`), temas escuro e claro "papel", `prefers-reduced-motion` respeitado.
- Orçamento de JS da primeira carga em `e2e/performance.spec.ts`; no protótipo isso não é critério.

## Brand Commitments
Em código hoje (Liberty City): monocromática e quente, sem acento de marca; carmim só no losango dos
títulos de seção; DM Serif Display nos numerais e no wordmark; Inter na interface; escuro é o padrão.
**Decisão do dono em 2026-10-23, só para o protótipo `proto/vida`:** o P&B de filme não é mais
obrigatório; o monocromático deixa o site morto, então pode e deve ter cor. A tipografia de títulos
pode mudar (DM Serif só no logotipo, se fizer sentido) e o orçamento de JS pode subir por causa das
animações, com o que for pesado carregado sob demanda. Segue valendo: fundos em vez de bordas, o carmim
#c23a41 como cor-marca possível, escuro como base, e a cor das skins e dos mapas como conteúdo.

## Evidence on Hand
- Miniaturas dos 8 mapas da rotação em `apps/web/public/maps/` (coloridas, originais da Valve).
- Catálogo de Itens da cs2-lib (nome, raridade e imagem) para as skins reais.
- Ausências: não há capturas próprias em P&B, nem dados reais de atividade/Ranking neste worktree.
  O protótipo usa dados de exemplo fixos, rotulados como tal.

## Product Principles
1. Mostrar o jogo acontecendo: Presença, atividade e números da semana são o conteúdo, não a decoração.
2. A cor é evidência: skins, raridade e lados; nada de acento novo.
3. Vazio também é uma tela: o estado sem jogadores precisa ter vida e um próximo passo.
4. Movimento sutil e opcional: tudo para com `prefers-reduced-motion`.

## Accessibility & Inclusion
WCAG 2.2 AA (axe nas telas), alvos de 44 px no celular, foco visível por teclado, texto não depende só
de cor, contagens ao vivo anunciadas com moderação.
