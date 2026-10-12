<#
.SYNOPSIS
    Instala (ou atualiza) o servidor CS2 local de desenvolvimento no Windows, com Metamod:Source,
    CounterStrikeSharp e os plugins compilados do repositório.

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

    Toda atualização do CS2 sobrescreve o gameinfo.gi: depois de atualizar, rode de novo a etapa Metamod.

.EXAMPLE
    # Primeira instalação completa (baixa ~60 GB):
    ./infra/scripts/install-cs2-server.ps1 -DownloadCs2

.EXAMPLE
    # Só recompilar e copiar os plugins para um servidor já instalado:
    ./infra/scripts/install-cs2-server.ps1 -Steps Plugins
#>
[CmdletBinding()]
param(
    [string] $ServerDir = 'C:\carmine\cs2-server',
    [string] $SteamCmdDir = 'C:\carmine\steamcmd',

    [ValidateSet('SteamCmd', 'Cs2', 'Metamod', 'CounterStrikeSharp', 'Plugins', 'InventorySimulator')]
    [string[]] $Steps = @('SteamCmd', 'Cs2', 'Metamod', 'CounterStrikeSharp', 'Plugins', 'InventorySimulator'),

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
    [string] $Configuration = 'Release'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # Invoke-WebRequest fica muito mais rápido sem a barra.

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$GameDir = Join-Path $ServerDir 'game\csgo'
$AddonsDir = Join-Path $GameDir 'addons'
$CssDir = Join-Path $AddonsDir 'counterstrikesharp'
$Plugins = @('Carmine.Core')
$TempDirs = [System.Collections.Generic.List[string]]::new()

function Write-Step([string] $Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-GameInstalled {
    if (-not (Test-Path (Join-Path $GameDir 'gameinfo.gi'))) {
        throw "CS2 não encontrado em '$ServerDir'. Rode com -DownloadCs2 ou ajuste -ServerDir."
    }
}

# Baixa e extrai um .zip num diretório temporário próprio; devolve o caminho extraído.
function Get-Archive([string] $Url, [string] $Name) {
    $work = Join-Path ([IO.Path]::GetTempPath()) "carmine-$Name-$([Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $work | Out-Null
    $TempDirs.Add($work)
    $zip = Join-Path $work "$Name.zip"
    Write-Host "    baixando $Url"
    Invoke-WebRequest -Uri $Url -OutFile $zip -UseBasicParsing
    $extracted = Join-Path $work 'extracted'
    Expand-Archive -Path $zip -DestinationPath $extracted
    return $extracted
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
    Copy-Item -Path (Join-Path $extracted 'addons') -Destination $GameDir -Recurse -Force

    # Registra o Metamod como caminho de busca do jogo, logo após a linha do csgo_lv.
    $gameinfo = Join-Path $GameDir 'gameinfo.gi'
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
    if (-not (Test-Path (Join-Path $AddonsDir 'metamod'))) {
        throw 'Metamod não instalado. Inclua a etapa Metamod.'
    }
    $url = "https://github.com/roflmuffin/CounterStrikeSharp/releases/download/v$CssVersion/counterstrikesharp-with-runtime-windows-$CssVersion.zip"
    $extracted = Get-Archive $url 'counterstrikesharp'
    Copy-Item -Path (Join-Path $extracted 'addons') -Destination $GameDir -Recurse -Force
}

function Install-Plugins {
    Write-Step "Plugins da Carmine ($Configuration)"
    Assert-GameInstalled
    if (-not (Test-Path $CssDir)) {
        throw 'CounterStrikeSharp não instalado. Inclua a etapa CounterStrikeSharp.'
    }
    $solution = Join-Path $RepoRoot 'plugins\Carmine.Plugins.slnx'
    & dotnet build $solution -c $Configuration
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet build falhou (código $LASTEXITCODE)"
    }

    # O Carmine.Hello (S00) foi substituído pelo Carmine.Core na S01.
    $retired = Join-Path $CssDir 'plugins\Carmine.Hello'
    if (Test-Path $retired) {
        Remove-Item -Path $retired -Recurse -Force
        Write-Host "    Carmine.Hello removido (substituído pelo Carmine.Core)"
    }

    foreach ($plugin in $Plugins) {
        $output = Join-Path $RepoRoot "plugins\src\$plugin\bin\$Configuration\net10.0"
        $target = Join-Path $CssDir "plugins\$plugin"
        if (Test-Path $target) {
            Remove-Item -Path $target -Recurse -Force
        }
        New-Item -ItemType Directory -Path $target | Out-Null
        Copy-Item -Path (Join-Path $output '*') -Destination $target -Recurse
        Write-Host "    $plugin -> $target"

        $configDir = Join-Path $CssDir "configs\plugins\$plugin"
        $configFile = Join-Path $configDir "$plugin.json"
        if (-not (Test-Path $configFile)) {
            New-Item -ItemType Directory -Force -Path $configDir | Out-Null
            [ordered]@{ ApiBaseUrl = $ApiBaseUrl; ApiKey = ''; TimeoutSeconds = 5; RetryIntervalSeconds = 15; ConfigVersion = 1 } |
                ConvertTo-Json | Set-Content -Path $configFile -Encoding utf8
            Write-Host "    config criada em $configFile"
            Write-Host "    cole em ApiKey a chave de 'pnpm --filter @carmine/api servers create' (veja o README)"
        }
    }
}

function Install-InventorySimulator {
    Write-Step "cs2-css-inventory-simulator $InvSimVersion"
    Assert-GameInstalled
    if (-not (Test-Path $CssDir)) {
        throw 'CounterStrikeSharp não instalado. Inclua a etapa CounterStrikeSharp.'
    }
    $url = "https://github.com/ianlucas/cs2-css-inventory-simulator/releases/download/$InvSimVersion/InventorySimulator-v$InvSimVersion.zip"
    $extracted = Get-Archive $url 'inventory-simulator'
    $target = Join-Path $CssDir 'plugins\InventorySimulator'
    if (Test-Path $target) {
        Remove-Item -Path $target -Recurse -Force
    }
    # O zip traz addons/counterstrikesharp/plugins/InventorySimulator e o gamedata do plugin.
    Copy-Item -Path (Join-Path $extracted 'addons') -Destination $GameDir -Recurse -Force
    Write-Host "    InventorySimulator -> $target"

    # O CounterStrikeSharp vem com FollowCS2ServerGuidelines ligado, que bloqueia os campos de item
    # que o plugin precisa (m_bInitialized, m_iItemDefinitionIndex...). Desligar é o risco de GSLT
    # assumido no ADR 0002; sem isso nenhuma skin é aplicada.
    $cssCore = Join-Path $CssDir 'configs\core.json'
    if (Test-Path $cssCore) {
        $raw = Get-Content -Path $cssCore -Raw
        $patched = $raw -replace '"FollowCS2ServerGuidelines"\s*:\s*true', '"FollowCS2ServerGuidelines": false'
        if ($patched -ne $raw) {
            Set-Content -Path $cssCore -Value $patched -NoNewline -Encoding utf8
        }
        Write-Host "    FollowCS2ServerGuidelines desligado em $cssCore"
    } else {
        Write-Warning "Sem $cssCore (o CounterStrikeSharp cria no primeiro boot): suba o servidor uma vez e rode de novo -Steps InventorySimulator."
    }

    # Os convars do plugin só existem depois que ele carrega: o server.cfg (executado a cada mapa)
    # chama o nosso cfg. invsim_require_inventory 0: com a API fora, o connect segue com as Armas
    # padrão. invsim_apikey é a chave do Servidor Carmine (a mesma do Carmine.Core): com ela, o
    # plugin grava cada abate no StatTrak em /api/increment-item-stattrak.
    $coreConfig = Join-Path $CssDir 'configs\plugins\Carmine.Core\Carmine.Core.json'
    $apiKey = if (Test-Path $coreConfig) { (Get-Content -Path $coreConfig -Raw | ConvertFrom-Json).ApiKey } else { '' }
    if (-not $apiKey) {
        Write-Warning "Sem ApiKey em ${coreConfig}: o StatTrak não será gravado. Cole a chave lá e rode de novo -Steps InventorySimulator."
    }
    $cfgDir = Join-Path $GameDir 'cfg\carmine'
    New-Item -ItemType Directory -Force -Path $cfgDir | Out-Null
    @(
        '// Gerado por infra/scripts/install-cs2-server.ps1 (etapa InventorySimulator). Não edite: rode de novo.'
        "invsim_url `"$ApiBaseUrl`""
        "invsim_apikey `"$apiKey`""
        'invsim_ws_enabled 1'
        'invsim_ws_cooldown 30'
        'invsim_ws_immediately 0'
        "invsim_ws_url_print_format `"$WebDisplayUrl`""
        'invsim_wslogin 0'
        'invsim_require_inventory 0'
        'invsim_persist_inventory 0'
        'invsim_fallback_team 0'
        'invsim_minmodels 0'
        'invsim_spray_enabled 0'
        'invsim_spraychanger_enabled 0'
        'invsim_pet_enabled 0'
    ) | Set-Content -Path (Join-Path $cfgDir 'inventory-simulator.cfg') -Encoding ascii
    # O cfg leva a chave do servidor: fica só na máquina do servidor, nunca no repositório.
    Write-Host "    config gravada em $(Join-Path $cfgDir 'inventory-simulator.cfg')"

    $serverCfg = Join-Path $GameDir 'cfg\server.cfg'
    $execLine = 'exec carmine/inventory-simulator.cfg'
    $current = if (Test-Path $serverCfg) { Get-Content -Path $serverCfg } else { @() }
    if ($current -notcontains $execLine) {
        Add-Content -Path $serverCfg -Value $execLine -Encoding ascii
        Write-Host "    '$execLine' adicionado ao $serverCfg"
    }
}

$actions = [ordered]@{
    SteamCmd           = { Install-SteamCmd }
    Cs2                = { Install-Cs2 }
    Metamod            = { Install-Metamod }
    CounterStrikeSharp = { Install-CounterStrikeSharp }
    Plugins            = { Install-Plugins }
    InventorySimulator = { Install-InventorySimulator }
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

Write-Step 'Pronto. Para subir o servidor local (com a API no ar, via pnpm dev):'
Write-Host "    & '$ServerDir\game\bin\win64\cs2.exe' -dedicated -console +sv_lan 1 +game_type 0 +game_mode 1 +map de_dust2"
Write-Host "    No console do servidor, procure: 'Carmine.Core: API no ar (...)'"
Write-Host "    'css_plugins list' deve listar Carmine.Core e InventorySimulator; no jogo, !ws recarrega o Loadout."
