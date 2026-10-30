# Addon do Workshop dos servidores abertos (S19)

O **Addon do Carmine** (`CONTEXT.md`) leva o card de boas-vindas e o logo nas paredes. Os servidores abertos (Retake e Deathmatch, `"addon": true` no `profile.json`) exigem que o jogador baixe o item do Workshop; as Salas privadas nunca usam. A fonte do addon, o validador e o roteiro para publicar estão em [`infra/cs2/addon/`](../../infra/cs2/addon/README.md).

## Ligar (depois de publicar o item)

1. Publique o item pelo roteiro do dono ([`infra/cs2/addon/README.md`](../../infra/cs2/addon/README.md), "Roteiro do dono") e anote o **ID**.
2. No arquivo de ambiente de cada servidor aberto (`/etc/carmine-cs2/<perfil>.env`, modelo em `infra/cs2/linux/profile.env.example`):
   ```
   CARMINE_ADDON_WORKSHOP_ID=<ID do item>
   CARMINE_ADDON_ENABLED=1
   ```
3. `sudo systemctl restart carmine-cs2@<perfil>`. O `prestart.sh` grava o `cfg/multiaddonmanager/multiaddonmanager.cfg` (o item vira `mm_extra_addons`) e liga `AddonEnabled` no `Carmine.Core.json`.
4. Na primeira entrada o jogador baixa o addon e o CS2 reconecta uma vez; o cache do Steam (`mm_cache_clients_with_addons 1`) evita repetir.

Sem `CARMINE_ADDON_WORKSHOP_ID`, nada muda: o servidor não exige addon e o card fica desligado.

## Chave de emergência

O MultiAddonManager costuma quebrar a cada atualização do CS2. Para os servidores voltarem a aceitar quem não tem o addon, **sem novo release**:

1. Edite `/etc/carmine-cs2/<perfil>.env`: `CARMINE_ADDON_ENABLED=0`.
2. `sudo systemctl restart carmine-cs2@<perfil>`.

Isso zera `mm_extra_addons` e desliga o card. Para voltar, `CARMINE_ADDON_ENABLED=1` e reiniciar, depois de o MultiAddonManager estar corrigido (veja a versão nova em <https://github.com/Source2ZE/MultiAddonManager/releases> e troque a versão e os hashes em `infra/cs2/linux/versions.sh`; rode a etapa `profiles` do `install.sh`).

## Runtime do MultiAddonManager

O pacote tem duas compilações (`steamrt3` e `steamrt4`). O padrão é a `steamrt4`. Se o Metamod não carregar o plugin (erro de `GLIBC`/`GLIBCXX` no log do servidor), rode a etapa `profiles` de novo com `CARMINE_MAM_RUNTIME=steamrt3`.

## Logo nas paredes

Os pontos ficam em `cfg/carmine/wall-logos.json` do perfil (`infra/cs2/profiles/<perfil>/csgo/cfg/carmine/`), por mapa, no máximo 6 por mapa. Eles começam **vazios**: as coordenadas só existem dentro do jogo.

1. Entre no servidor com uma conta `@css/root`, vá até uma parede discreta e olhe para ela.
2. `css_carmine_logo_here [distância]` (padrão 100) imprime no console uma linha `"de_mirage": [ { ... } ]` com o ponto à frente dos olhos.
3. Cole o ponto no `wall-logos.json` do perfil e ajuste a distância até o logo cair na parede (o decal projeta na parede à frente); faça um PR com o arquivo.

## Windows (staging do autor)

O instalador do Windows (`infra/scripts/install-cs2-server.ps1`) **não** instala o MultiAddonManager nesta entrega: o addon é validado e testado nos servidores Linux. O `Carmine.Core` do staging roda com `AddonEnabled: false`.
