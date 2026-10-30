<#
.SYNOPSIS
  Valida, compila e confere o addon do Carmine (S19) para o Workshop do CS2. Somente Windows.

.DESCRIPTION
  Ações:
    Validate  roda `node tools/validate-addon.mjs` (não precisa do jogo).
    Compile   valida e roda o resourcecompiler do CS2 Workshop Tools sobre src/, gerando o addon compilado em
              <Cs2Root>\game\csgo_addons\<AddonName> (é essa pasta que o Workshop Manager publica).
    Pack      confere a árvore compilada (arquivos esperados, tamanho) e, se -VpkEditCli for informado, grava um
              VPK local em dist\ para teste fora do Workshop. Não é o que se publica.
    Build     Validate + Compile + Pack (padrão).

  Estrutura de build adaptada do projeto de referência MIT CustomHudProbeSW2 (tools/build_hud_resources.ps1).

.EXAMPLE
  .\build-addon.ps1 -Action Validate
  .\build-addon.ps1 -Cs2Root 'D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive'
#>
param(
    [ValidateSet("Validate", "Compile", "Pack", "Build")]
    [string]$Action = "Build",
    [string]$Cs2Root = "C:\Program Files (x86)\Steam\steamapps\common\Counter-Strike Global Offensive",
    [string]$AddonName = "carmine_hud",
    # Opcional: VPKEdit CLI (https://github.com/craftablescience/VPKEdit) só para o VPK local de teste.
    [string]$VpkEditCli = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$addonRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$srcRoot = Join-Path $addonRoot "src"
$distRoot = Join-Path $addonRoot "dist"
$validator = Join-Path $addonRoot "tools\validate-addon.mjs"
$limiteBytes = 5MB

function Assert-SafeAddonName {
    if ([string]::IsNullOrWhiteSpace($AddonName) -or $AddonName -notmatch '^[A-Za-z0-9_-]+$') {
        throw "AddonName deve ser um nome simples (letras, números, _ e -): '$AddonName'"
    }
}

function Get-Paths {
    Assert-SafeAddonName
    $contentAddonsRoot = Join-Path $Cs2Root "content\csgo_addons"
    $gameAddonsRoot = Join-Path $Cs2Root "game\csgo_addons"
    return [pscustomobject]@{
        ContentAddonsRoot = $contentAddonsRoot
        GameAddonsRoot    = $gameAddonsRoot
        ContentAddon      = Join-Path $contentAddonsRoot $AddonName
        GameAddon         = Join-Path $gameAddonsRoot $AddonName
        GameDir           = Join-Path $Cs2Root "game\csgo"
        ResourceCompiler  = Join-Path $Cs2Root "game\bin\win64\resourcecompiler.exe"
    }
}

function Assert-Cs2WorkshopTools {
    param($Paths)
    if (-not (Test-Path -LiteralPath $Cs2Root -PathType Container)) {
        throw "Pasta do CS2 não encontrada: $Cs2Root`nPasse -Cs2Root com a pasta 'Counter-Strike Global Offensive' da sua biblioteca Steam."
    }
    if (-not (Test-Path -LiteralPath $Paths.ResourceCompiler -PathType Leaf)) {
        throw @"
resourcecompiler.exe não encontrado: $($Paths.ResourceCompiler)
O CS2 Workshop Tools não está instalado nesta pasta. No Steam: Counter-Strike 2 > Propriedades > DLC >
marque 'Counter-Strike 2 Workshop Tools' e espere baixar (só Windows). Depois rode de novo.
"@
    }
}

function Remove-ChildDirectory {
    param([string]$Path, [string]$Parent)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolvedPath = (Resolve-Path -LiteralPath $Path).Path.TrimEnd('\', '/')
    $resolvedParent = (Resolve-Path -LiteralPath $Parent).Path.TrimEnd('\', '/')
    if (-not $resolvedPath.StartsWith($resolvedParent + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Recusando apagar caminho fora do esperado: $resolvedPath"
    }
    Remove-Item -LiteralPath $resolvedPath -Recurse -Force
}

function Invoke-Validate {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "Node.js não encontrado no PATH (precisa do 24 ou mais novo, como o resto do repositório)."
    }
    & node $validator $addonRoot
    if ($LASTEXITCODE -ne 0) {
        throw "Validação do addon falhou (veja os problemas acima). Nada foi compilado."
    }
}

# src/ -> pasta de conteúdo do Workshop Tools, com .xml -> .vxml e .css -> .vcss (o resourcecompiler só
# entende as extensões do Source 2). Devolve a lista de arquivos a compilar.
function Copy-SourceToContent {
    param($Paths)
    Remove-ChildDirectory -Path $Paths.ContentAddon -Parent $Paths.ContentAddonsRoot
    New-Item -ItemType Directory -Force -Path $Paths.ContentAddon | Out-Null

    $srcFull = (Resolve-Path -LiteralPath $srcRoot).Path.TrimEnd('\')
    $paraCompilar = New-Object System.Collections.Generic.List[string]
    foreach ($arquivo in Get-ChildItem -LiteralPath $srcFull -Recurse -File) {
        $relativo = $arquivo.FullName.Substring($srcFull.Length + 1)
        if ($relativo -like 'panorama\layout\*' -and $arquivo.Extension -eq '.xml') {
            $relativo = [System.IO.Path]::ChangeExtension($relativo, '.vxml')
        }
        elseif ($relativo -like 'panorama\styles\*' -and $arquivo.Extension -eq '.css') {
            $relativo = [System.IO.Path]::ChangeExtension($relativo, '.vcss')
        }
        $destino = Join-Path $Paths.ContentAddon $relativo
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destino) | Out-Null
        Copy-Item -LiteralPath $arquivo.FullName -Destination $destino -Force
        if ($destino -match '\.(vxml|vcss|vtex|vmat)$') { $paraCompilar.Add($destino) }
    }
    return $paraCompilar
}

function Invoke-ResourceCompiler {
    param($Paths, [string[]]$Inputs)
    $argumentos = @("-game", $Paths.GameDir)
    foreach ($i in $Inputs) { $argumentos += @("-i", $i) }
    $argumentos += @("-f", "-nop4", "-v")
    & $Paths.ResourceCompiler @argumentos
    if ($LASTEXITCODE -ne 0) { throw "resourcecompiler falhou (código $LASTEXITCODE)." }
}

# Arquivos que o "contents preview" do Workshop Manager precisa listar.
function Get-ExpectedOutputs {
    param($Paths)
    $g = $Paths.GameAddon
    return @(
        (Join-Path $g "panorama\layout\custom_game\carmine_card.vxml_c"),
        (Join-Path $g "panorama\styles\custom_game\carmine_card.vcss_c"),
        (Join-Path $g "panorama\images\carmine\logo.vtex_c"),
        (Join-Path $g "materials\carmine\wall_logo.vmat_c")
    )
}

function Invoke-Compile {
    Invoke-Validate
    $paths = Get-Paths
    Assert-Cs2WorkshopTools -Paths $paths

    New-Item -ItemType Directory -Force -Path $paths.ContentAddonsRoot, $paths.GameAddonsRoot | Out-Null
    Remove-ChildDirectory -Path $paths.GameAddon -Parent $paths.GameAddonsRoot
    $entradas = Copy-SourceToContent -Paths $paths
    Invoke-ResourceCompiler -Paths $paths -Inputs $entradas

    # Dependências do material (PNG de cor e de translucidez): o compilador costuma gerar sozinho; se não, compila à parte.
    $texturasDoMaterial = Get-ChildItem -LiteralPath (Join-Path $paths.GameAddon "materials") -Recurse -Filter "*.vtex_c" -ErrorAction SilentlyContinue
    if (-not $texturasDoMaterial) {
        Write-Warning "O resourcecompiler não gerou as texturas do .vmat sozinho; compilando os PNGs de materials\ à parte."
        $pngs = Get-ChildItem -LiteralPath (Join-Path $paths.ContentAddon "materials") -Recurse -Filter "*.png" | ForEach-Object { $_.FullName }
        if ($pngs) { Invoke-ResourceCompiler -Paths $paths -Inputs $pngs }
    }

    foreach ($saida in Get-ExpectedOutputs -Paths $paths) {
        if (-not (Test-Path -LiteralPath $saida -PathType Leaf)) {
            throw "Arquivo compilado esperado não foi gerado: $saida"
        }
    }
    Copy-Item -LiteralPath (Join-Path $paths.ContentAddon "addoninfo.txt") -Destination (Join-Path $paths.GameAddon "addoninfo.txt") -Force
    Write-Host "Addon compilado: $($paths.GameAddon)"
}

function Invoke-Pack {
    $paths = Get-Paths
    if (-not (Test-Path -LiteralPath $paths.GameAddon -PathType Container)) {
        throw "Addon compilado não encontrado: $($paths.GameAddon). Rode -Action Compile antes."
    }
    foreach ($saida in Get-ExpectedOutputs -Paths $paths) {
        if (-not (Test-Path -LiteralPath $saida -PathType Leaf)) { throw "Faltando no addon compilado: $saida" }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $paths.GameAddon "addoninfo.txt"))) { throw "Faltando addoninfo.txt no addon compilado." }

    $arquivos = @(Get-ChildItem -LiteralPath $paths.GameAddon -Recurse -File)
    $total = ($arquivos | Measure-Object -Property Length -Sum).Sum
    Write-Host ("Conteúdo compilado ({0} arquivos, {1:N0} bytes):" -f $arquivos.Count, $total)
    $base = (Resolve-Path -LiteralPath $paths.GameAddon).Path.TrimEnd('\')
    foreach ($a in $arquivos) { Write-Host ("  " + $a.FullName.Substring($base.Length + 1)) }
    if ($total -gt $limiteBytes) { throw "Addon compilado com $total bytes (máximo ${limiteBytes}: poucos MB)." }

    if (-not [string]::IsNullOrWhiteSpace($VpkEditCli)) {
        if (-not (Test-Path -LiteralPath $VpkEditCli -PathType Leaf)) { throw "VPKEdit CLI não encontrado: $VpkEditCli" }
        New-Item -ItemType Directory -Force -Path $distRoot | Out-Null
        $saidaVpk = Join-Path $distRoot "$AddonName.vpk"
        & $VpkEditCli --output $saidaVpk --type vpk --version 2 --single-file $paths.GameAddon
        if ($LASTEXITCODE -ne 0) { throw "vpkeditcli falhou (código $LASTEXITCODE)." }
        Write-Host "VPK local de teste: $saidaVpk (não é o que se publica no Workshop)"
    }

    Write-Host ""
    Write-Host "Próximo passo: Workshop Manager > New > escolher a pasta"
    Write-Host "  $($paths.GameAddon)"
    Write-Host "e conferir se o 'contents preview' lista [vxml_c], [vcss_c], [vtex_c] e [vmat_c]. Roteiro completo: README.md do addon."
}

switch ($Action) {
    "Validate" { Invoke-Validate }
    "Compile" { Invoke-Compile }
    "Pack" { Invoke-Pack }
    "Build" { Invoke-Compile; Invoke-Pack }
}
