---
version: 1
slug: "src-app-page-tsx"
primary_target: "src/app/page.tsx"
related_targets: []
---

# Home e Perfil "vida" (protótipo, duas direções)

Modo: Operate (a pessoa vem ver quem joga e entrar), com a Home também persuadindo o visitante deslogado.
Alvo: `/proto/a` e `/proto/b` (Home), `/proto/a/perfil` e `/proto/b/perfil` (Perfil); 1440 e 390; temas
escuro e claro; `prefers-reduced-motion`. Protótipo com dados fixos, sem merge, branch `proto/vida`.

## Pedido e limites
- Dono: "o site parece morto, como um blog cru". Decisão dele: pode e deve ter cor; o P&B de filme saiu.
  Duas direções lado a lado para ele escolher. Orçamento de JS pode subir; o pesado carrega sob demanda.
- Comum às duas: Home em 2 colunas a partir de 1280 com o trilho ao vivo; fundos até as bordas; números
  com contagem (ticker); feed ao vivo com itens entrando animados; cartões de skin com inclinação 3D e brilho
  holográfico nas raras/StatTrak; spotlight no hover dos cartões; View Transitions entre páginas; esqueletos
  com brilho; AO VIVO pulsando. Fundos em vez de bordas continua.
- Estados da Home: logado com amigos, logado sem nada, deslogado, zero servidores online (o mais comum).
- Termo: "Partida" só no 5v5; a faixa da semana usa rounds, abates, HS% e horas.
- Intocado: header, rodapé e rotas reais; o protótipo vive em `/proto/*` e re-tinge o header só ali.

## Direction contract

THESIS: o site é um palco ao vivo, não uma lista de servidores: a cor vem do que está acontecendo (o mapa que
está cheio, a skin que a pessoa usa) e tudo mexe um pouco. Recusa: caixas cinzas iguais numa coluna de 1080 px.

OWN-WORLD: duas.
A "Carmim vivo": base preta quente, o carmim #c23a41 é a marca de verdade (CTA, ativo, foco, barras, destaque
do 1º lugar); a cor ambiente é dinâmica: um brilho suave no alto da página com as cores extraídas da skin
equipada (ou do mapa do servidor; do mapa em destaque para o deslogado) e que troca com o hover nos cartões.
Display: Big Shoulders Display (condensada, pesada, de placar), numerais enormes. Superfícies escuras com
spotlight do ponteiro; sem acento além do carmim.
B "CS2 vibrante": mais saturado e mais claro na energia; uma cor por mapa (Dust2 areia, Inferno laranja, Nuke
azul-petróleo, Ancient verde, Mirage, Anubis, Overpass, Cache, Vertigo) que pinta o cartão e o fundo; CT azul e
TR laranja fortes; raridades exibidas com orgulho (etiquetas cheias, brilho). CTA na cor do mapa em destaque.
Display: uma face larga e enérgica (Unbounded), só nos títulos e numerais.

STORY: quem chega sente que o lugar está vivo antes de ler uma palavra, reconhece amigos e a própria skin em
ação, e entra com um clique; o deslogado vê o mapa em destaque e o convite da Steam; nenhum estado termina
numa caixa de texto vazia (silhueta de arma ou mapa com um próximo passo).

FIRST VIEWPORT (1440): fundo até as bordas com o brilho ambiente; à esquerda o número de jogadores no ar em
display (contando), a linha de apoio e o primário; abaixo, os cartões grandes dos servidores com a arte do
mapa colorida; à direita o trilho de 340 px (amigos jogando, feed ao vivo, top 3 da semana). Em 390: o
número, o primário, os cartões, o trilho empilhado.

FORM: concept pinado pelo brief do dono (painel ao vivo em 2 colunas), sem sorteio do concept-seed; duas
direções de tema sobre a mesma estrutura (posição 1 de 1).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Assinatura de movimento
Contagem dos números ao entrar na tela (uma vez) e a troca com rolo quando mudam; feed com itens entrando de
cima; inclinação 3D com brilho holográfico nas skins raras; spotlight no ponteiro; ambiente que troca de cor
com o foco/hover; View Transition entre rotas. Tudo desliga ou vira fade curto com `prefers-reduced-motion`.

## Em aberto
- Cores ambientes extraídas offline por script (`scripts/vida-palettes.mjs`) das imagens do catálogo e dos
  mapas; no produto seria no upload/cache.
- Origem real dos dados do trilho, da faixa da semana e dos Loadouts da semana (Perfil privado fica de fora).
