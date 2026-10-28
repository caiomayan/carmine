# Addon do Workshop no CS2: o que dá para aproveitar (Q7 do grilling, 2026-10-28)

Pesquisa na web, sem teste prático. Fontes principais: API oficial de notícias do Steam (CS2), READMEs/issues do MultiAddonManager, cs2-hud-panel, z4lab-custom-ui, CS2-Poor-MapAdvertisements, diretrizes de servidor da Valve, Online Conduct do Steam.

## Resumo
- **Dá:** HUD Panorama controlado pelo servidor (card de boas-vindas, toasts, painéis clicáveis); **logo/arte na parede de mapa oficial** com decal ou prop colocado pelo plugin (já existe plugin que faz isso, com flag "assinante sem anúncio"); sons, modelos, partículas; mapas do Workshop.
- **Não dá:** script no cliente; editar e republicar mapa oficial; sobrescrever textura oficial (incerto e arriscado — evitar); mudar o layout só com deploy do plugin (exige republicar o addon).
- **Risco Valve/GSLT:** baixo. As diretrizes só tratam de falsificar inventário/rank/skins; nenhum caso de GSLT banido por propaganda.
- **Risco Workshop:** médio. O Online Conduct proíbe anúncio comercial no Steam: o addon deve ser neutro (marca da casa); arte de patrocinador vem como material genérico trocado pelo servidor. Evitar cassino/skin-gambling.
- **Risco técnico:** médio. Quem recusa o download entra em loop de reconexão (mitigar com timeout ~30 s); GeForce Now não baixa; o MultiAddonManager quebra a cada update do CS2 (3 releases entre 23 e 27/10/2026). O card precisa de fallback no chat/centro.

## Detalhes úteis
- `custom_hud_layout` (24/08/2026): Panel, Label, Image, Button + CSS; servidor controla textos/classes por jogador e cliques; sem eventos/script. Classes de estado (buy menu, placar, chat visível).
- Pegadinhas: Label só texto; imagem como background-image .vtex BGRA8888; Panorama guarda cache até reiniciar o jogo; recriar entidades quando o jogador entra.
- Mapas custom: `host_workshop_map` / `host_workshop_collection` (até 100); cliente baixa pelo Steam com prompt; mapa até 3 GB. Cada addon extra = uma reconexão na 1ª entrada (`mm_cache_clients_with_addons 1` evita repetir).
- Recomendação: **um addon só, pequeno** (poucos MB).
- Publicação: CS2 Workshop Tools (terceiro diz que exige Prime); sem revisão da Valve; item público (unlisted não confirmado).
