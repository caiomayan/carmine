<#
.SYNOPSIS
    Instala (ou atualiza) o servidor CS2 local de desenvolvimento no Windows, com Metamod:Source,
    CounterStrikeSharp, os plugins compilados do repositório e os perfis de gameplay (S02).

.DESCRIPTION
    Etapas, sempre nesta ordem e todas idempotentes (rodar de novo atualiza):
      SteamCmd           baixa o SteamCMD (~3 MB) em -SteamCmdDir.
      Cs2                baixa/atualiza o servidor dedicado do CS2 (app 730, ~60 GB). Só roda com -DownloadCs2.
      Metamod            instala o Metamod:Source 2.0 e registra-o no gameinfo.gi.
      CounterStrikeSharp instala o CounterStrikeSharp (com o runtime .NET) na versão de -CssVersion.
      Plugins            compila plugins/Carmine.Plugins.slnx e copia os plugins para o servidor,
                         criando a config de cada um (URL da API) se ainda não existir.
      InventorySimulator instala o cs2-css-inventory-simulator (sem modificação, ADR 0006) na versão
                         de -InvSimVersion e grava cfg/carmine/inventory-simulator.cfg apontando o
                         plugin para a API (-ApiBaseUrl) com a chave do Carmine.Core, executado pelo
                         server.cfg a cada mapa. Rode depois de colar a ApiKey do Carmine.Core.
      Profiles           monta uma instância por perfil de infra/cs2/profiles (-Profiles) em
                         -ProfilesDir: o CS2 vem do -ServerDir por junções e hardlinks (nada dos ~60 GB
                         é copiado) e só addons/ e cfg/ são da instância. Em cada uma instala o
                         Carmine.Core, o inventory-simulator e os plugins de gameplay do perfil
                         (versões fixadas abaixo, conferidas por SHA-256), copia os arquivos
                         versionados do perfil e grava a config do Carmine.Core (vagas e Vaga
                         reservada do profile.json), mantendo a ApiKey já colada. Suba cada uma com
                         infra/scripts/start-cs2-profile.ps1.

    As etapas Plugins e InventorySimulator cuidam do servidor do -ServerDir (o servidor "local" da
    S01-S07); a etapa Profiles cuida das instâncias e não depende delas.

    Toda atualização do CS2 sobrescreve o gameinfo.gi: depois de atualizar, rode de novo as etapas
    Metamod e Profiles.

    Plugins de terceiros (S02): baixados das releases oficiais na instalação e nunca guardados no
    repositório (o RockTheVote não tem licença: só usamos, sem modificar nem redistribuir).

.EXAMPLE
    # Primeira instalação completa (baixa ~60 GB):
    ./infra/scripts/install-cs2-server.ps1 -DownloadCs2

.EXAMPLE
    # Só recompilar e copiar os plugins para um servidor já instalado:
    ./infra/scripts/install-cs2-server.ps1 -Steps Plugins

.EXAMPLE
    # Montar (ou atualizar) as instâncias Retake · Rotação e Deathmatch · Livre:
    ./infra/scripts/install-cs2-server.ps1 -Steps Profiles
#>
[CmdletBinding()]
param(
    [string] $ServerDir = 'C:\carmine\cs2-server',
    [string] $SteamCmdDir = 'C:\carmine\steamcmd',

    [ValidateSet('SteamCmd', 'Cs2', 'Metamod', 'CounterStrikeSharp', 'Plugins', 'InventorySimulator', 'Profiles')]
    [string[]] $Steps = @('SteamCmd', 'Cs2', 'Metamod', 'CounterStrikeSharp', 'Plugins', 'InventorySimulator', 'Profiles'),

    # Sem esta opção a etapa Cs2 é pulada: o download tem ~60 GB.
    [switch] $DownloadCs2,

    # Mesma versão do pacote CounterStrikeSharp.API em plugins/Directory.Packages.props.
    [string] $CssVersion = '1.0.376',

    # Arquivo de um build do Metamod:Source 2.0 (https://mms.alliedmods.net/mmsdrop/2.0/), ou 'latest'.
    [string] $MetamodBuild = 'mmsource-2.0.0-git1474-windows.zip',

    [string] $ApiBaseUrl = 'http://localhost:3333',

    # Versão do cs2-css-inventory-simulator (https://github.com/ianlucas/cs2-css-inventory-simulator/releases).
    [string] $InvSimVersion = '3.5.2',

    # O que o !ws mostra como endereço do site (o plugin imprime o texto como está).
    [string] $WebDisplayUrl = 'localhost:3000',

    [ValidateSet('Debug', 'Release')]
    [string] $Configuration = 'Release',

    # Perfis de infra/cs2/profiles a montar na etapa Profiles.
    [string[]] $Profiles = @('retake', 'deathmatch'),

    # Onde ficam as instâncias dos perfis; no mesmo volume do -ServerDir (hardlinks).
    [string] $ProfilesDir = 'C:\carmine\cs2-profiles',

    # Zips dos plugins de terceiros baixados (conferidos por SHA-256), reaproveitados entre perfis.
    [string] $DownloadsDir = 'C:\carmine\cs2-downloads'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest fica muito mais rápido sem a barra.

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BaseGameDir = Join-Path $ServerDir 'game\csgo'
$ProfilesSource = Join-Path $RepoRoot 'infra\cs2\profiles'
$CarminePlugins = @('Carmine.Core')
$TempDirs = [System.Collections.Generic.List[string]]::new()
$script:PluginsBuilt = $false

# Plugins de gameplay da S02 (docs/specs/mvp.md), com versão e SHA-256 fixados. Para atualizar, troque
# a URL e o hash juntos (Get-FileHash -Algorithm SHA256 no zip novo) e teste no servidor local.
#   Extract: 'csgo' (o zip começa em addons/), 'css' (começa em configs/, plugins/, shared/) ou
#   'csgo-nested' (uma pasta por cima de addons/). Only: só estas pastas do zip.
$GameplayPlugins = [ordered]@{
    # B3none/cs2-retakes (GPL-3.0). Traz os spawns de Retake (map_config) dos mapas Active Duty.
    RetakesPlugin    = @{
        Url     = 'https://github.com/B3none/cs2-retakes/releases/download/3.1.1/RetakesPlugin-3.1.1.zip'
        Sha256  = 'ccb5dade7a5d445d0a172e68f19cb262de0c2a75639be18f3d892db10be93dff'
        Extract = 'csgo'
    }
    # Micka2302/cs2-retakes-allocator-2.0 (GPL-3.0), release 3.0 (traz o menu SharpModMenu).
    RetakesAllocator = @{
        Url     = 'https://github.com/Micka2302/cs2-retakes-allocator-2.0/releases/download/3.0/RetakesAllocator.zip'
        Sha256  = 'b1b562a65ee651d5fcb3a6f06337a99e7081768c540a304c7a6da06fc3d1a44c'
        Extract = 'css'
    }
    # NockyCZ/CS2-Deathmatch (MIT). Traz os spawns de FFA de de_dust2, de_mirage e de_inferno.
    Deathmatch       = @{
        Url     = 'https://github.com/NockyCZ/CS2-Deathmatch/releases/download/v1.3.6/Deathmatch.zip'
        Sha256  = '85d0bb3b0edc1615fa5b32df112e54795cdba36da5643115fd0cb07c03bb5404'
        Extract = 'csgo'
    }
    # M-archand/RockTheVote-CSS: SEM LICENÇA. Só baixar e usar; nunca modificar nem pôr no repositório.
    RockTheVote      = @{
        Url     = 'https://github.com/M-archand/RockTheVote-CSS/releases/download/v2.4.0/RockTheVote-v2.4.0.zip'
        Sha256  = '3cc4c2272846b710d969e457f94af607a767a437c6cf6df6e36fbf276c9c9a6f'
        Extract = 'csgo-nested'
    }
    # schwarper/CS2MenuManager (GPL-3.0), dependência do RockTheVote: só a biblioteca em shared/ (o
    # plugin CS2MenuManager_MenuManager do zip registra css_mm, que colide com o !mm do RockTheVote).
    CS2MenuManager   = @{
        Url     = 'https://github.com/schwarper/CS2MenuManager/releases/download/v1.0.43/CS2MenuManager-v43.zip'
        Sha256  = '4298588c37955704a206fe185cfddf1d422075e33be3aca7627cce92391ad013'
        Extract = 'css'
        Only    = @('shared')
    }
}
# Plugins que trazem outros junto.
$PluginDependencies = @{ RockTheVote = @('CS2MenuManager') }

# Assinaturas do alocador numa versão conhecida para o primeiro boot; com AutoUpdateSignatures=true
# (config do perfil) ele baixa as mais novas do main do repositório dele a cada início.
$AllocatorGamedata = @{
    Url    = 'https://raw.githubusercontent.com/Micka2302/cs2-retakes-allocator-2.0/41da2cd41e6238ce62e1d455839e46f61a9d14ee/Resources/RetakesAllocator_gamedata.json'
    Sha256 = '24090acd7fcaa6f7812b1adc22a770bb9c4c7ab06e66f103067bf0850ccb2d12'
}

function Write-Step([string] $Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-GameInstalled {
    if (-not (Test-Path (Join-Path $BaseGameDir 'gameinfo.gi'))) {
        throw "CS2 não encontrado em '$ServerDir'. Rode com -DownloadCs2 ou ajuste -ServerDir."
    }
}

function New-WorkDir([string] $Name) {
    $work = Join-Path ([IO.Path]::GetTempPath()) "carmine-$Name-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $work | Out-Null
    $TempDirs.Add($work)
    return $work
}

# Baixa e extrai um .zip num diretório temporário próprio; devolve o caminho extraído.
function Get-Archive([string] $Url, [string] $Name) {
    $work = New-WorkDir $Name
    $zip = Join-Path $work "$Name.zip"
    Write-Host "    baixando $Url"
    Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing
    $extracted = Join-Path $work 'extracted'
    Expand-Archive -Path $zip -DestinationPath $extracted
    return $extracted
}

# Baixa uma vez para -DownloadsDir e confere o SHA-256 (download corrompido ou release trocada param aqui).
function Get-VerifiedFile([string] $Url, [string] $Sha256) {
    New-Item -ItemType Directory -Force -Path $DownloadsDir | Out-Null
    $file = Join-Path $DownloadsDir (Split-Path -Leaf ([Uri] $Url).AbsolutePath)
    if (-not (Test-Path $file) -or (Get-FileHash -Path $file -Algorithm SHA256).Hash -ne $Sha256.ToUpperInvariant()) {
        Write-Host "    baixando $Url"
        Invoke-WebRequest -Uri $Url -OutFile $file -UseBasicParsing
    }
    $hash = (Get-FileHash -Path $file -Algorithm SHA256).Hash
    if ($hash -ne $Sha256.ToUpperInvariant()) {
        Remove-Item -Path $file -Force
        throw "SHA-256 de $Url não confere (esperado $Sha256, veio $hash)."
    }
    return $file
}

function Install-SteamCmd {
    Write-Step "SteamCMD em $SteamCmdDir"
    $exe = Join-Path $SteamCmdDir 'steamcmd.exe'
    if (Test-Path $exe) {
        Write-Host '    já instalado'
        return
    }
    $extracted = Get-Archive 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' 'steamcmd'
    New-Item -ItemType Directory -Force -Path $SteamCmdDir | Out-Null
    Copy-Item -Path (Join-Path $extracted '*') -Destination $SteamCmdDir -Recurse -Force
}

function Install-Cs2 {
    if (-not $DownloadCs2) {
        Write-Step 'CS2: pulado (use -DownloadCs2 para baixar/atualizar os ~60 GB)'
        return
    }
    Write-Step "CS2 dedicado em $ServerDir (app 730)"
    $exe = Join-Path $SteamCmdDir 'steamcmd.exe'
    if (-not (Test-Path $exe)) {
        throw "SteamCMD não encontrado em '$SteamCmdDir'. Inclua a etapa SteamCmd."
    }
    New-Item -ItemType Directory -Force -Path $ServerDir | Out-Null
    & $exe +force_install_dir $ServerDir +login anonymous +app_update 730 validate +quit
    # O SteamCMD devolve 7 depois de se atualizar sozinho, mesmo quando tudo deu certo.
    if ($LASTEXITCODE -notin 0, 7) {
        throw "SteamCMD terminou com código $LASTEXITCODE"
    }
}

function Install-Metamod {
    Write-Step 'Metamod:Source 2.0'
    Assert-GameInstalled
    $build = $MetamodBuild
    if ($build -eq 'latest') {
        $build = (Invoke-WebRequest -Uri 'https://mms.alliedmods.net/mmsdrop/2.0/mmsource-latest-windows' -UseBasicParsing).Content.Trim()
    }
    $extracted = Get-Archive "https://mms.alliedmods.net/mmsdrop/2.0/$build" 'metamod'
    Copy-Item -Path (Join-Path $extracted 'addons') -Destination $BaseGameDir -Recurse -Force

    # Registra o Metamod como caminho de busca do jogo, logo após a linha do csgo_lv.
    $gameinfo = Join-Path $BaseGameDir 'gameinfo.gi'
    $content = Get-Content -Path $gameinfo -Raw
    if ($content -match 'csgo/addons/metamod') {
        Write-Host '    gameinfo.gi já registra o Metamod'
        return
    }
    $pattern = '(?m)^(\s*)Game_LowViolence(\s+)csgo_lv.*$'
    if ($content -notmatch $pattern) {
        throw "Linha 'Game_LowViolence csgo_lv' não encontrada em $gameinfo; o formato mudou."
    }
    $patched = [regex]::Replace($content, $pattern, { param($m) "$($m.Value)`r`n$($m.Groups[1].Value)Game$($m.Groups[2].Value)csgo/addons/metamod" }, 1)
    Set-Content -Path $gameinfo -Value $patched -NoNewline
    Write-Host '    gameinfo.gi atualizado'
}

function Install-CounterStrikeSharp {
    Write-Step "CounterStrikeSharp $CssVersion"
    Assert-GameInstalled
    if (-not (Test-Path (Join-Path $BaseGameDir 'addons\metamod'))) {
        throw 'Metamod não instalado. Inclua a etapa Metamod.'
    }
    $url = "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v$CssVersion/counterstrikesharp-with-runtime-windows-$CssVersion.zip"
    $extracted = Get-Archive $url 'counterstrikesharp'
    Copy-Item -Path (Join-Path $extracted 'addons') -Destination $BaseGameDir -Recurse -Force
}

function Build-CarminePlugins {
    if ($script:PluginsBuilt) {
        return
    }
    $solution = Join-Path $RepoRoot 'plugins\Carmine.Plugins.slnx'
    & dotnet build $solution -c $Configuration
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet build falhou (código $LASTEXITCODE)"
    }
    $script:PluginsBuilt = $true
}

# Copia os plugins compilados para o servidor de $GameDir. Sem $CoreSettings, cria a config do
# Carmine.Core só se ela não existir (servidor "local"); com, grava essas chaves mantendo a ApiKey.
function Install-CarminePluginsTo([string] $GameDir, [hashtable] $CoreSettings) {
    $cssDir = Join-Path $GameDir 'addons\counterstrikesharp'
    if (-not (Test-Path $cssDir)) {
        throw 'CounterStrikeSharp não instalado. Inclua a etapa CounterStrikeSharp.'
    }
    Build-CarminePlugins

    # O Carmine.Hello (S00) foi substituído pelo Carmine.Core na S01.
    $retired = Join-Path $cssDir 'plugins\Carmine.Hello'
    if (Test-Path $retired) {
        Remove-Item -Path $retired -Recurse -Force
        Write-Host "    Carmine.Hello removido (substituído pelo Carmine.Core)"
    }

    foreach ($plugin in $CarminePlugins) {
        $output = Join-Path $RepoRoot "plugins\src\$plugin\bin\$Configuration\net10.0"
        $target = Join-Path $cssDir "plugins\$plugin"
        if (Test-Path $target) {
            Remove-Item -Path $target -Recurse -Force
        }
        New-Item -ItemType Directory -Path $target | Out-Null
        Copy-Item -Path (Join-Path $output '*') -Destination $target -Recurse
        Write-Host "    $plugin -> $target"
    }

    $configDir = Join-Path $cssDir 'configs\plugins\Carmine.Core'
    $configFile = Join-Path $configDir 'Carmine.Core.json'
    $existing = if (Test-Path $configFile) { Get-Content -Path $configFile -Raw | ConvertFrom-Json } else { $null }
    if ($existing -and -not $CoreSettings) {
        return
    }
    $config = [ordered]@{
        ApiBaseUrl               = $ApiBaseUrl
        ApiKey                   = if ($existing) { $existing.ApiKey } else { '' }
        TimeoutSeconds           = 5
        RetryIntervalSeconds     = 15
        HeartbeatIntervalSeconds = 10
        PublicSlots              = 0
        ReservedSlots            = ''
        ConfigVersion            = 1
    }
    if ($CoreSettings) {
        foreach ($key in $CoreSettings.Keys) {
            $config[$key] = $CoreSettings[$key]
        }
    }
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    $config | ConvertTo-Json | Set-Content -Path $configFile -Encoding utf8
    Write-Host "    config gravada em $configFile"
    if (-not $config.ApiKey) {
        Write-Host "    cole em ApiKey a chave de 'pnpm --filter @carmine/api servers create' (veja o README)"
    }
}

function Install-Plugins {
    Write-Step "Plugins da Carmine ($Configuration) em $ServerDir"
    Assert-GameInstalled
    Install-CarminePluginsTo -GameDir $BaseGameDir -CoreSettings $null
}

# O CounterStrikeSharp vem com FollowCS2ServerGuidelines ligado, que bloqueia os campos de item que o
# inventory-simulator precisa (m_bInitialized, m_iItemDefinitionIndex...). Desligar é o risco de
# GSLT assumido no ADR 0002; sem isso nenhuma skin é aplicada.
function Disable-FollowGuidelines([string] $GameDir) {
    $cssCore = Join-Path $GameDir 'addons\counterstrikesharp\configs\core.json'
    if (Test-Path $cssCore) {
        $raw = Get-Content -Path $cssCore -Raw
        $patched = $raw -replace '"FollowCS2ServerGuidelines"\s*:\s*true', '"FollowCS2ServerGuidelines": false'
        if ($patched -ne $raw) {
            Set-Content -Path $cssCore -Value $patched -NoNewline -Encoding utf8
        }
        Write-Host "    FollowCS2ServerGuidelines desligado em $cssCore"
    } else {
        Write-Warning "Sem $cssCore (o CounterStrikeSharp cria no primeiro boot): suba o servidor uma vez e rode de novo esta etapa."
    }
}

function Install-InventorySimulatorTo([string] $GameDir, [bool] $FallbackTeam) {
    $cssDir = Join-Path $GameDir 'addons\counterstrikesharp'
    if (-not (Test-Path $cssDir)) {
        throw 'CounterStrikeSharp não instalado. Inclua a etapa CounterStrikeSharp.'
    }
    $url = "https://github.com/ianlucas/cs2-css-inventory-simulator/releases/download/$InvSimVersion/InventorySimulator-v$InvSimVersion.zip"
    $extracted = Get-Archive $url 'inventory-simulator'
    $target = Join-Path $cssDir 'plugins\InventorySimulator'
    if (Test-Path $target) {
        Remove-Item -Path $target -Recurse -Force
    }
    # O zip traz addons/counterstrikesharp/plugins/InventorySimulator e o gamedata do plugin.
    Copy-Item -Path (Join-Path $extracted 'addons') -Destination $GameDir -Recurse -Force
    Write-Host "    InventorySimulator -> $target"
    Disable-FollowGuidelines $GameDir

    # Os convars do plugin só existem depois que ele carrega: o server.cfg (executado a cada mapa)
    # chama o nosso cfg. invsim_require_inventory 0: com a API fora, o connect segue com as Armas
    # padrão. invsim_apikey é a chave do Servidor Carmine (a mesma do Carmine.Core): com ela, o
    # plugin grava cada abate no StatTrak em /api/increment-item-stattrak. invsim_fallback_team 1
    # (Deathmatch): no FFA qualquer um pega qualquer arma, e a skin do outro lado vale.
    $coreConfig = Join-Path $cssDir 'configs\plugins\Carmine.Core\Carmine.Core.json'
    $apiKey = if (Test-Path $coreConfig) { (Get-Content -Path $coreConfig -Raw | ConvertFrom-Json).ApiKey } else { '' }
    if (-not $apiKey) {
        Write-Warning "Sem ApiKey em ${coreConfig}: o StatTrak não será gravado. Cole a chave lá e rode de novo esta etapa."
    }
    $cfgDir = Join-Path $GameDir 'cfg\carmine'
    New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    @(
        '// Gerado por infra/scripts/install-cs2-server.ps1. Não edite: rode de novo.'
        "invsim_url `"$ApiBaseUrl`""
        "invsim_apikey `"$apiKey`""
        'invsim_ws_enabled 1'
        'invsim_ws_cooldown 30'
        'invsim_ws_immediately 0'
        "invsim_ws_url_print_format `"$WebDisplayUrl`""
        'invsim_wslogin 0'
        'invsim_require_inventory 0'
        'invsim_persist_inventory 0'
        "invsim_fallback_team $([int] $FallbackTeam)"
        'invsim_minmodels 0'
        'invsim_spray_enabled 0'
        'invsim_spraychanger_enabled 0'
        'invsim_pet_enabled 0'
    ) | Set-Content -Path (Join-Path $cfgDir 'inventory-simulator.cfg') -Encoding ascii
    # O cfg leva a chave do servidor: fica só na máquina do servidor, nunca no repositório.
    Write-Host "    config gravada em $(Join-Path $cfgDir 'inventory-simulator.cfg')"

    $serverCfg = Join-Path $GameDir 'cfg\server.cfg'
    $execLine = 'exec carmine/inventory-simulator.cfg'
    $current = if (Test-Path $serverCfg) { @(Get-Content -Path $serverCfg) } else { @() }
    if ($current -notcontains $execLine) {
        # O server.cfg padrão do CS2 termina sem quebra de linha: um Add-Content direto colava o exec
        # no fim do comentário da última linha, e ele nunca rodava. Também conserta instalações
        # antigas que ficaram com o exec colado num comentário.
        $lines = @($current | ForEach-Object { $_.Replace($execLine, '').TrimEnd() }) + $execLine
        Set-Content -Path $serverCfg -Value $lines -Encoding ascii
        Write-Host "    '$execLine' adicionado ao $serverCfg"
    }
}

function Install-InventorySimulator {
    Write-Step "cs2-css-inventory-simulator $InvSimVersion em $ServerDir"
    Assert-GameInstalled
    Install-InventorySimulatorTo -GameDir $BaseGameDir -FallbackTeam $false
}

# Instância de um perfil: game/ aponta para o CS2 do -ServerDir (junções nas pastas, hardlinks nos
# arquivos, gameinfo.gi copiado), menos game/csgo/addons e game/csgo/cfg, que são da instância.
function New-ProfileInstance([string] $InstanceDir) {
    $baseGame = Join-Path $ServerDir 'game'
    $instanceGame = Join-Path $InstanceDir 'game'
    $instanceCsgo = Join-Path $instanceGame 'csgo'
    New-Item -ItemType Directory -Force -Path $instanceCsgo | Out-Null

    $link = {
        param([IO.FileSystemInfo] $Item, [string] $TargetDir)
        $path = Join-Path $TargetDir $Item.Name
        if ($Item.PSIsContainer) {
            if (-not (Test-Path $path)) {
                New-Item -ItemType Junction -Path $path -Target $Item.FullName | Out-Null
            }
            return
        }
        if (Test-Path $path) {
            # Mesmo arquivo (hardlink de antes, ou igual): fica, mesmo com o servidor rodando.
            $current = Get-Item -Path $path -Force
            if ($current.Length -eq $Item.Length -and $current.LastWriteTimeUtc -eq $Item.LastWriteTimeUtc) {
                return
            }
            Remove-Item -Path $path -Force
        }
        try {
            New-Item -ItemType HardLink -Path $path -Target $Item.FullName | Out-Null
        } catch {
            throw "Não deu para criar o hardlink $path (o -ProfilesDir precisa estar no mesmo volume NTFS do -ServerDir): $_"
        }
    }
    foreach ($item in Get-ChildItem -Path $baseGame -Force | Where-Object Name -ne 'csgo') {
        & $link $item $instanceGame
    }
    foreach ($item in Get-ChildItem -Path $BaseGameDir -Force | Where-Object Name -notin 'addons', 'cfg', 'gameinfo.gi') {
        & $link $item $instanceCsgo
    }
    Copy-Item -Path (Join-Path $BaseGameDir 'gameinfo.gi') -Destination $instanceCsgo -Force

    # cfg: os da Valve como base (o perfil sobrescreve o server.cfg).
    $instanceCfg = Join-Path $instanceCsgo 'cfg'
    New-Item -ItemType Directory -Force -Path $instanceCfg | Out-Null
    Copy-Item -Path (Join-Path $BaseGameDir 'cfg\*') -Destination $instanceCfg -Recurse -Force

    # addons: Metamod e CounterStrikeSharp do -ServerDir, sem os plugins, as configs de plugin e os
    # dados do servidor local (a instância guarda os dela entre execuções).
    $baseCss = Join-Path $BaseGameDir 'addons\counterstrikesharp'
    & robocopy (Join-Path $BaseGameDir 'addons') (Join-Path $instanceCsgo 'addons') /E /NFL /NDL /NJH /NJS /NP `
        /XD (Join-Path $baseCss 'plugins') (Join-Path $baseCss 'configs\plugins') (Join-Path $baseCss 'data') | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "robocopy de addons falhou (código $LASTEXITCODE)"
    }
    $global:LASTEXITCODE = 0
    $instancePlugins = Join-Path $instanceCsgo 'addons\counterstrikesharp\plugins'
    if (Test-Path $instancePlugins) {
        Remove-Item -Path $instancePlugins -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $instancePlugins | Out-Null
    return $instanceCsgo
}

function Install-GameplayPlugin([string] $Name, [string] $GameDir) {
    foreach ($dependency in @($PluginDependencies[$Name] | Where-Object { $_ })) {
        Install-GameplayPlugin -Name $dependency -GameDir $GameDir
    }
    $plugin = $GameplayPlugins[$Name]
    $zip = Get-VerifiedFile -Url $plugin.Url -Sha256 $plugin.Sha256
    $extracted = Join-Path (New-WorkDir $Name) 'extracted'
    Expand-Archive -Path $zip -DestinationPath $extracted
    $source, $destination = switch ($plugin.Extract) {
        'csgo' { $extracted, $GameDir }
        'css' { $extracted, (Join-Path $GameDir 'addons\counterstrikesharp') }
        'csgo-nested' { (Get-ChildItem -Path $extracted -Directory | Select-Object -First 1).FullName, $GameDir }
    }
    $folders = if ($plugin.ContainsKey('Only')) { $plugin.Only } else { (Get-ChildItem -Path $source).Name }
    foreach ($folder in $folders) {
        # O zip do alocador foi gerado no Windows com "\" nos nomes; o Expand-Archive já separa.
        Copy-Item -Path (Join-Path $source $folder) -Destination $destination -Recurse -Force
    }
    Write-Host "    $Name ($(Split-Path -Leaf $zip))"

    if ($Name -eq 'RetakesAllocator') {
        $gamedataDir = Join-Path $GameDir 'addons\counterstrikesharp\plugins\RetakesAllocator\gamedata'
        New-Item -ItemType Directory -Force -Path $gamedataDir | Out-Null
        $gamedata = Get-VerifiedFile -Url $AllocatorGamedata.Url -Sha256 $AllocatorGamedata.Sha256
        Copy-Item -Path $gamedata -Destination (Join-Path $gamedataDir 'RetakesAllocator_gamedata.json') -Force
        New-Item -ItemType Directory -Force -Path (Join-Path $GameDir 'addons\counterstrikesharp\data\RetakesAllocator') | Out-Null
    }
}

# Copia os arquivos versionados do perfil (infra/cs2/profiles/<perfil>/csgo) por cima da instância.
# {{csgoDir}} vira o game/csgo da instância (com "/", que o Windows aceita), para caminhos absolutos.
function Copy-ProfileFiles([string] $ProfileDir, [string] $GameDir) {
    $source = Join-Path $ProfileDir 'csgo'
    $csgoDir = $GameDir.Replace('\', '/')
    foreach ($file in Get-ChildItem -Path $source -Recurse -File) {
        $relative = $file.FullName.Substring($source.Length + 1)
        $target = Join-Path $GameDir $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        $content = [IO.File]::ReadAllText($file.FullName).Replace('{{csgoDir}}', $csgoDir)
        [IO.File]::WriteAllText($target, $content, [Text.UTF8Encoding]::new($false))
    }
    Write-Host "    arquivos do perfil copiados de $source"
}

function Install-Profiles {
    Assert-GameInstalled
    if (-not (Test-Path (Join-Path $BaseGameDir 'addons\counterstrikesharp'))) {
        throw 'CounterStrikeSharp não instalado. Inclua as etapas Metamod e CounterStrikeSharp.'
    }
    foreach ($name in $Profiles) {
        $profileDir = Join-Path $ProfilesSource $name
        $profileFile = Join-Path $profileDir 'profile.json'
        if (-not (Test-Path $profileFile)) {
            throw "Perfil '$name' não existe em $ProfilesSource."
        }
        $spec = Get-Content -Path $profileFile -Raw | ConvertFrom-Json
        $instanceDir = Join-Path $ProfilesDir $name
        Write-Step "Perfil $($spec.showcaseName) em $instanceDir (porta $($spec.port))"

        $gameDir = New-ProfileInstance $instanceDir
        foreach ($plugin in $spec.plugins) {
            switch ($plugin) {
                'Carmine.Core' {
                    Install-CarminePluginsTo -GameDir $gameDir -CoreSettings @{
                        PublicSlots   = [int] $spec.publicSlots
                        ReservedSlots = [string] $spec.reservedSlots
                    }
                }
                'InventorySimulator' { }
                default {
                    if (-not $GameplayPlugins.Contains($plugin)) {
                        throw "Plugin '$plugin' do perfil '$name' não está em `$GameplayPlugins."
                    }
                    Install-GameplayPlugin -Name $plugin -GameDir $gameDir
                }
            }
        }
        # Depois dos plugins: os arquivos do perfil (configs, maplist.txt) vão por cima dos do zip.
        Copy-ProfileFiles -ProfileDir $profileDir -GameDir $gameDir
        if ($spec.plugins -contains 'InventorySimulator') {
            Install-InventorySimulatorTo -GameDir $gameDir -FallbackTeam ([bool] $spec.inventorySimulator.fallbackTeam)
        }
    }
}

$actions = [ordered]@{
    SteamCmd           = { Install-SteamCmd }
    Cs2                = { Install-Cs2 }
    Metamod            = { Install-Metamod }
    CounterStrikeSharp = { Install-CounterStrikeSharp }
    Plugins            = { Install-Plugins }
    InventorySimulator = { Install-InventorySimulator }
    Profiles           = { Install-Profiles }
}
try {
    foreach ($step in $actions.Keys) {
        if ($Steps -contains $step) {
            & $actions[$step]
        }
    }
}
finally {
    foreach ($dir in $TempDirs) {
        Remove-Item -Path $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Step 'Pronto. Com a API no ar (pnpm dev):'
Write-Host "    Servidor local:  & '$ServerDir\game\bin\win64\cs2.exe' -dedicated -console +sv_lan 1 +game_type 0 +game_mode 1 +map de_dust2"
Write-Host "    Perfis:          ./infra/scripts/start-cs2-profile.ps1 -Name retake   (ou deathmatch)"
Write-Host "    No console do servidor, procure: 'Carmine.Core: API no ar (...)'"
Write-Host "    'css_plugins list' deve listar Carmine.Core e InventorySimulator (e os de gameplay do perfil); no jogo, !ws recarrega o Loadout."
