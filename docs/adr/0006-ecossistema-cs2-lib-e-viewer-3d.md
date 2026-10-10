# Reaproveitar o ecossistema de Ian Lucas para itens, 3D e aplicação no jogo

Os Itens são armazenados no formato `CS2BaseInventoryItem` da `@ianlucas/cs2-lib` (MIT). O editor embute o viewer 3d.cstrike.app por iframe e o controla por postMessage, com imagens 2D para music kits e como fallback. No jogo, usamos o plugin `cs2-css-inventory-simulator` (MIT) sem modificação, apontado para a nossa API, que serve o formato `equipped/v5`; a regra do VIP é aplicada na resposta da API. Isso evita escrever um renderizador e um plugin de skins no MVP.

## Consequences

- O viewer não tem licença nem termos: o uso depende de permissão informal e revogável. Antes do lançamento, pedir uma partner key a support@ianlucas.net. Se o acesso cair, o editor volta a 2D.
- Atualização do Loadout em tempo real dentro do jogo exige um fork do plugin; no MVP, o Loadout é carregado no connect e com `!ws`.
- Futuro distante (ideia, não decisão): lib e viewer próprios.
