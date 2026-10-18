# shellcheck shell=bash disable=SC2034  # lido pelo install.sh (source)
# Versões fixadas do que o install.sh baixa, com SHA-256. Mesmas versões e hashes do
# infra/scripts/install-cs2-server.ps1 (Windows); os pacotes de plataforma (Metamod e
# CounterStrikeSharp) são os equivalentes Linux. Para atualizar, troque a URL e o hash juntos
# (sha256sum no arquivo novo), valide no staging e abra um PR.

# Mesma versão do pacote CounterStrikeSharp.API em plugins/Directory.Packages.props.
CSS_VERSION='1.0.376'
CSS_SHA256='8d50a25a467fe9c7ebbbc7032028d402cd428e118308f1c4d627a0a5ddf36783'
CSS_URL="https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v${CSS_VERSION}/counterstrikesharp-with-runtime-linux-${CSS_VERSION}.zip"

# Build do Metamod:Source 2.0 (https://mms.alliedmods.net/mmsdrop/2.0/); o AlliedModders só guarda os recentes.
METAMOD_BUILD='mmsource-2.0.0-git1474-linux.tar.gz'
METAMOD_SHA256='f6add0e54a84bcc9582b3e093c1270890113344ee34683268dfb59942cfebcf2'
METAMOD_URL="https://mms.alliedmods.net/mmsdrop/2.0/${METAMOD_BUILD}"

# ianlucas/cs2-css-inventory-simulator, sem modificação (ADR 0006).
INVSIM_VERSION='3.5.2'
INVSIM_SHA256='e6060cc62a1f8b0606d07c4f3813205bc6500d6632e68f530625f79c94d31c2b'
INVSIM_URL="https://github.com/ianlucas/cs2-css-inventory-simulator/releases/download/${INVSIM_VERSION}/InventorySimulator-v${INVSIM_VERSION}.zip"

# SDK do .NET que compila o Carmine.Core no próprio host (plugins/global.json pede 10.0.400+).
DOTNET_SDK_VERSION='10.0.400'

# Plugins de gameplay da S02. Extract: 'csgo' (o zip começa em addons/), 'css' (começa em configs/,
# plugins/, shared/) ou 'csgo-nested' (uma pasta por cima de addons/). ONLY: só estas pastas do zip.
# RockTheVote (M-archand) não tem licença: só usamos, sem modificar nem redistribuir.
declare -A GP_URL GP_SHA256 GP_EXTRACT GP_ONLY GP_DEPENDS

GP_URL[RetakesPlugin]='https://github.com/B3none/cs2-retakes/releases/download/3.1.1/RetakesPlugin-3.1.1.zip'
GP_SHA256[RetakesPlugin]='ccb5dade7a5d445d0a172e68f19cb262de0c2a75639be18f3d892db10be93dff'
GP_EXTRACT[RetakesPlugin]='csgo'

GP_URL[RetakesAllocator]='https://github.com/Micka2302/cs2-retakes-allocator-2.0/releases/download/3.0/RetakesAllocator.zip'
GP_SHA256[RetakesAllocator]='b1b562a65ee651d5fcb3a6f06337a99e7081768c540a304c7a6da06fc3d1a44c'
GP_EXTRACT[RetakesAllocator]='css'

GP_URL[Deathmatch]='https://github.com/NockyCZ/CS2-Deathmatch/releases/download/v1.3.6/Deathmatch.zip'
GP_SHA256[Deathmatch]='85d0bb3b0edc1615fa5b32df112e54795cdba36da5643115fd0cb07c03bb5404'
GP_EXTRACT[Deathmatch]='csgo'

GP_URL[RockTheVote]='https://github.com/M-archand/RockTheVote-CSS/releases/download/v2.4.0/RockTheVote-v2.4.0.zip'
GP_SHA256[RockTheVote]='3cc4c2272846b710d969e457f94af607a767a437c6cf6df6e36fbf276c9c9a6f'
GP_EXTRACT[RockTheVote]='csgo-nested'
GP_DEPENDS[RockTheVote]='CS2MenuManager'

# schwarper/CS2MenuManager, dependência do RockTheVote: só a biblioteca em shared/ (o plugin
# CS2MenuManager_MenuManager do zip registra css_mm, que colide com o !mm do RockTheVote).
GP_URL[CS2MenuManager]='https://github.com/schwarper/CS2MenuManager/releases/download/v1.0.43/CS2MenuManager-v43.zip'
GP_SHA256[CS2MenuManager]='4298588c37955704a206fe185cfddf1d422075e33be3aca7627cce92391ad013'
GP_EXTRACT[CS2MenuManager]='css'
GP_ONLY[CS2MenuManager]='shared'

# Assinaturas do alocador numa versão conhecida para o primeiro boot (com AutoUpdateSignatures=true
# ele baixa as mais novas a cada início).
ALLOCATOR_GAMEDATA_URL='https://raw.githubusercontent.com/Micka2302/cs2-retakes-allocator-2.0/41da2cd41e6238ce62e1d455839e46f61a9d14ee/Resources/RetakesAllocator_gamedata.json'
ALLOCATOR_GAMEDATA_SHA256='24090acd7fcaa6f7812b1adc22a770bb9c4c7ab06e66f103067bf0850ccb2d12'
