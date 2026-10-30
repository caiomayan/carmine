# Addon do Carmine (S19)

Addon do Workshop do CS2, **único e pequeno** (poucos MB), exigido nos servidores abertos (Retake, Deathmatch e o 5v5 Casual quando existir). Salas privadas nunca usam addon. Spec: seção "S19 · Addon dos servidores abertos" de [`docs/specs/beta-aberto.md`](../../../docs/specs/beta-aberto.md); pesquisa: [`addon-workshop.md`](../../../docs/specs/pesquisas-2026-10-28/addon-workshop.md).

O addon leva duas coisas:

1. **Card de boas-vindas** em Panorama (`custom_hud_layout`): não clicável, entra deslizando ao conectar, fica uns 6 s e sai. Mostra nome, selo do plano, posição no Ranking da semana, amigos online e (a partir da S21) o Rating do Modo. Preto e branco da marca, no canto esquerdo abaixo do radar, longe da mira.
2. **Logo do Carmine** como material de decal (`env_decal`), para o plugin colocar em 2 ou 3 paredes por mapa. Item neutro: só a marca da casa, nada de terceiros.

O addon só guarda o **visual**. Quem cria a entidade `CCSCustomHudLayout`, define os textos por jogador e liga/desliga as classes é o plugin (`plugins/`); quem exige o download é o MultiAddonManager. O contrato entre os dois lados está em [`addon.contract.json`](addon.contract.json).

## Estrutura

```
infra/cs2/addon/
  addon.contract.json            painel, classes, variáveis e caminho do layout (o plugin lê isto num teste)
  src/                           fontes; o build copia para a pasta de conteúdo do Workshop Tools
    addoninfo.txt
    panorama/
      preprocessor_config.txt
      layout/custom_game/carmine_card.xml     vira .vxml_c
      styles/custom_game/carmine_card.css     vira .vcss_c
      images/carmine/logo.png                 512x512, transparente
      images/carmine/logo.vtex                receita da textura do Panorama (BGRA8888, sRGB)
    materials/carmine/
      wall_logo.vmat                          decal da parede
      wall_logo.png                           cor (logo sobre cinza 50%)
      wall_logo_trans.png                     máscara de translucidez (branco = opaco)
  tools/
    render-logo.mjs              gera os três PNGs a partir de apps/web/src/app/icon.svg (usa o sharp do apps/web)
    validate-addon.mjs           validador sem dependências (não precisa do jogo)
    validate-addon.test.mjs      testes do validador (node:test)
    build-addon.ps1              Validate / Compile / Pack / Build (Windows)
  dist/                          saída local do Pack (ignorada pelo git)
```

Contrato com o plugin (resumo; a fonte é o JSON):

| Item | Valor |
| --- | --- |
| Layout (`StrLayout`) | `panorama/layout/custom_game/carmine_card.xml` |
| Painel do card (variáveis de diálogo e classe de mostrar/esconder) | `carmine_card` |
| Classe do card escondido | `CarmineCardHidden` (o card **nasce com ela**; o plugin remove para mostrar e põe de volta para sair) |
| Variáveis (`SetDialogVariableStringForPlayer` no painel `carmine_card`) | `name`, `plan`, `rank`, `friends`, `rating` |
| Linha sem valor | o plugin liga `CarmineRowHidden` no painel da linha: `carmine_row_plan`, `carmine_row_rank`, `carmine_row_friends`, `carmine_row_rating` |
| Material do logo | `materials/carmine/wall_logo.vmat` |

O Panorama não tem `:empty` para `Label`, por isso a linha vazia é decidida pelo plugin: variável vazia **e** classe `CarmineRowHidden` ligada. Os rótulos fixos ("Ranking da semana", "Amigos online", "Rating") ficam no addon; mudar um texto exige publicar versão nova.

## Validar (sem o jogo)

```powershell
node infra/cs2/addon/tools/validate-addon.mjs
node --test "infra/cs2/addon/tools/*.test.mjs"
```

(No Node 24 o `node --test` não aceita a pasta, só arquivo ou glob; por isso as aspas e o `*.test.mjs`.)

O validador falha quando: o XML está mal formado; o layout referencia CSS ou imagem que não existe; há variável `{s:...}` fora de `name, plan, rank, friends, rating`; há `<scripts>`, `<Image>`, `<Button>` ou `hittest="true"`; o CSS usa o combinador `~`, `@keyframes`, `animation` com `infinite` ou `transition` de qualquer propriedade além de `transform` e `opacity`; faltam o painel `carmine_card` (nascendo com `CarmineCardHidden`) ou as classes no CSS; um PNG está ilegível ou passa de 2 MB; o `.vtex` não é BGRA8888; o addon passa de 5 MB.

Para regerar as imagens depois de mexer no ícone da marca: `node infra/cs2/addon/tools/render-logo.mjs` (precisa do `pnpm install` do repositório, por causa do `sharp`).

## Compilar (Windows)

Pré-requisito: CS2 com o **Counter-Strike 2 Workshop Tools** instalado (veja o passo 1 do roteiro abaixo) e Node 24.

```powershell
.\infra\cs2\addon\tools\build-addon.ps1 -Action Build -Cs2Root 'C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive'
```

- `-Action Validate`: só o validador.
- `-Action Compile`: valida (aborta se falhar), copia `src/` para `<Cs2Root>\content\csgo_addons\carmine_hud` (`.xml` vira `.vxml`, `.css` vira `.vcss`) e roda o `resourcecompiler.exe`. Saída: `<Cs2Root>\game\csgo_addons\carmine_hud`.
- `-Action Pack`: confere os arquivos compilados e o tamanho e imprime a lista. Com `-VpkEditCli <caminho do vpkeditcli.exe>` também grava `dist\carmine_hud.vpk`, só para teste local (o que se publica é a **pasta**, não o VPK).
- `-Action Build`: os três em sequência (padrão). `-AddonName` muda o nome da pasta (padrão `carmine_hud`).

Se o Workshop Tools não existir, o script para com a instrução de instalação.

## Roteiro do dono: publicar no Workshop

Faça uma vez; o passo 9 em diante se repete a cada versão nova.

1. **Instalar o Workshop Tools.** No Steam: Biblioteca > Counter-Strike 2 > Propriedades > DLC > marque "Counter-Strike 2 Workshop Tools" e espere baixar. É só Windows.
2. **Conta.** Use a conta Steam do dono (a que vai ser a autora do item). O Workshop Tools pode exigir Prime; se o botão de publicar não aparecer, é isso.
3. **Compilar.** Na raiz do repositório, na `dev` ou na branch de release: `.\infra\cs2\addon\tools\build-addon.ps1 -Action Build` (passe `-Cs2Root` se o CS2 não estiver na biblioteca padrão). Termina imprimindo a pasta `...\game\csgo_addons\carmine_hud`.
4. **Abrir o Workshop Manager.** Na biblioteca do Steam, o app "Counter-Strike 2 Workshop Manager" (vem com o Workshop Tools) ou, no launcher do CS2, "Launch Counter-Strike 2 Workshop Tools" e dali o Workshop Manager.
5. **New.** Clique em **New** e escolha a pasta `carmine_hud` de `game\csgo_addons` (a compilada, não `src/` nem `content/`). Não escolha um `.vpk`.
6. **Conferir o "contents preview".** Deve listar `[vxml_c]`, `[vcss_c]`, a textura (`[vtex_c]`) e o material (`[vmat_c]`). Se `vxml_c` e `vcss_c` não aparecerem, feche o Workshop Manager, faça uma cópia de `game\csgo\gameinfo.gi` e, dentro de `AddonConfig` > `VpkDirectories`, acrescente (se faltarem) as linhas `"include" "panorama/layout/custom_game"`, `"include" "panorama/styles/custom_game"` e `"include" "panorama/images/carmine"`; reabra e repita o passo 5.
7. **Título, descrição, imagem, visibilidade.** O item é neutro, só a marca da casa (regras de anúncio do Steam). Sugestão: título `Carmine · Conteúdo dos servidores`; descrição `Conteúdo visual dos servidores comunitários do Carmine: card de boas-vindas e logo. Não é mapa nem modo de jogo.`; imagem de pré-visualização: `src/panorama/images/carmine/logo.png` (ou o ícone do site). Nada de link de venda, plano, preço ou parceiro. Visibilidade: a pesquisa não confirmou se "não listado" funciona para o servidor baixar; comece **público**, só com o conteúdo neutro, e troque depois se o teste mostrar que dá.
8. **Enviar.** Confirme o envio. Quando terminar, a página do item abre no Steam: anote o **ID** (o número depois de `?id=` na URL).
9. **Ligar no servidor.** No arquivo de ambiente do servidor aberto (`/etc/carmine-cs2/<perfil>.env`, modelo em `infra/cs2/linux/profile.env.example`) ponha o ID em `CARMINE_ADDON_WORKSHOP_ID=` (mantenha `CARMINE_ADDON_ENABLED=1`) e reinicie o servidor. Para desligar a exigência e o card sem novo release: `CARMINE_ADDON_ENABLED=0` e reinicie.

**Versão nova.** O layout só muda republicando: edite `src/`, rode o build, abra o Workshop Manager, escolha o item existente e use a opção de **atualizar/enviar de novo** com a pasta compilada (o ID não muda; nada a mexer no servidor, só reiniciar para o servidor baixar a versão nova). Quem já está no jogo vê o card antigo até **reiniciar o CS2** (cache do Panorama). Se mudou um nome do contrato (painel, classe, variável), o plugin precisa de release junto e a versão nova do addon tem de estar publicada antes.

## O que o teste no jogo decide

Tudo abaixo é a versão mais provável; nenhuma foi testada num CS2 real. Cada escolha está isolada num lugar só, para trocar sem mexer no resto.

| Dúvida | Escolha atual | Onde |
| --- | --- | --- |
| Formato do decal | Shader `csgo_projected_decals.vfx`, blend `F_BLEND_MODE 1` (Mod2X), cor e translucidez em PNGs separados, como no exemplo do CS2-Poor-MapAdvertisements (`addons/decalExample`). Em Mod2X, cinza 50% é neutro: o disco preto do logo **escurece** a parede e o anel e o C claros a **clareiam**. Se ficar pesado demais, mude o blend ou reduza o contraste do `wall_logo.png`. | `src/materials/carmine/wall_logo.vmat` (`F_BLEND_MODE`, `g_flDecalZAlphaScale`) e `tools/render-logo.mjs` (cinza de fundo) |
| Rotação do decal | O exemplo avisa que a textura precisa ter a mesma rotação do `exampleTexture.png` (o PNG de cor do exemplo é grande demais para baixar pela API, só vimos a máscara). Se o logo aparecer girado, gire o PNG no `render-logo.mjs`. | `tools/render-logo.mjs` |
| Tamanho do decal na parede | Largura, altura e profundidade do `env_decal` são do plugin (lista de pontos no perfil), não do addon. | plugin e `infra/cs2/profiles/*` |
| As texturas do `.vmat` compilam sozinhas? | O script confere e, se não vierem, compila os PNGs de `materials/` à parte. O contents preview deve listar a textura. | `tools/build-addon.ps1` (`Invoke-Compile`) |
| A pasta `materials/` entra no addon sem mexer no `VpkDirectories`? | Suposto que sim. | roteiro, passo 6 |
| Posição do card | Esquerda, `margin-top: 360px` (abaixo do radar). Pode colidir com o menu de compra ou o chat conforme resolução. | `src/panorama/styles/custom_game/carmine_card.css`, regra `.carmine-card` |
| A entrada deslizando aparece? | O card nasce com `CarmineCardHidden` e a transição dispara quando o plugin remove a classe. Se o card só "aparece" sem deslizar, o plugin deve criar a entidade, esperar 1 tick e só então remover a classe. A saída usa só `opacity` e `transform`, sem `visibility: collapse` (que cortaria a animação); o card invisível fica com `opacity: 0` e `hittest="false"`. | `carmine_card.css` (`.carmine-card`, `.CarmineCardHidden`) e o plugin |
| `visibility: collapse` tira a linha do layout? | Suposto que sim (é o uso da referência para esconder painéis). Se deixar buraco, trocar por `height: 0px; margin: 0px`. | `carmine_card.css`, regra `.CarmineRowHidden` |
| Texto | Fonte `'Arial Unicode MS'` (a da referência, cobre acentos e nomes estranhos), `text-overflow: ellipsis`, `white-space: nowrap` e `height: fit-children`: nenhum deles confirmado numa partida. Larguras em px fixos; se a largura do cartão incluir ou não o padding muda ~28 px, os textos têm folga para os dois casos. | `carmine_card.css` |
| Endereço da imagem | `url("s2r://panorama/images/carmine/logo.vtex")` (sem o `_c`, como a referência faz com o `card_1.vtex`). | `carmine_card.css` (`.carmine-logo`) |
| `addoninfo.txt` e `preprocessor_config.txt` | Copiados da referência (`IsPlayable = false`, `AllowCustomGameUI = true`). Se o Workshop Manager reclamar do item, é aqui. | `src/addoninfo.txt`, `src/panorama/preprocessor_config.txt` |
| Argumentos do `resourcecompiler` | `-game <csgo> -i <arq> ... -f -nop4 -v`, copiados da referência. | `tools/build-addon.ps1` (`Invoke-ResourceCompiler`) |
| A mensagem de quem recusa o download | A spec pede `Carmine · Para jogar aqui, aceite o download do conteúdo do servidor.` antes de desconectar quem recusa. Quem recusa nem chega a entrar no jogo, então o chat não existe para ele, e o MultiAddonManager não tem opção de mensagem. **Não está implementado**: o que vale hoje é o `mm_addon_connection_timeout 30` (o cliente é solto em 30 s, sem loop eterno). Se o teste mostrar um ponto onde dá para dizer a frase (motivo do disconnect), ela entra no plugin. | `infra/cs2/linux/prestart.sh` (cfg do MultiAddonManager) e o plugin |
| Visibilidade do item no Workshop | "Não listado" não está confirmado para o servidor baixar. | roteiro, passo 7 |

## O que conferir dentro do jogo

Peça a um amigo (conta sem o addon, CS2 recém-aberto) para entrar no servidor aberto:

- Baixou o conteúdo ao entrar (só na primeira vez; na segunda entrada não pede de novo)?
- O card apareceu deslizando, ficou uns 6 s e saiu? Mostra o nome, o selo, a posição, os amigos e (se houver) o Rating, sem linha vazia sobrando?
- O texto cabe (nome grande, plano Padrinho, "Calibrando 37/100") e o card não cobre a mira nem o radar, o kill feed ou o chat?
- O logo aparece nas paredes dos pontos configurados, no tamanho e na posição certos, sem estar girado?
- Recusar o download deixa preso em loop de reconexão? (A pessoa deve ser solta em cerca de 30 s, sem ficar tentando para sempre; a mensagem da spec não está implementada, veja a tabela acima.)
- Com `CARMINE_ADDON_ENABLED=0`, entra sem o addon e sem o card?
- Em Sala privada o card não aparece?
