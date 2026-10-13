<#
.SYNOPSIS
    Sobe a instância de um perfil de gameplay (S02) montada pela etapa Profiles do
    install-cs2-server.ps1: porta, maxplayers, modo de jogo e mapa vêm de
    infra/cs2/profiles/<perfil>/profile.json.

.DESCRIPTION
    Cada perfil é um Servidor Carmine próprio, com a sua chave na API: cadastre com
    'pnpm --filter @carmine/api servers create' e cole a chave em
    <instância>\game\csgo\addons\counterstrikesharp\configs\plugins\Carmine.Core\Carmine.Core.json
    (depois rode de novo -Steps Profiles, que leva a chave ao cfg do inventory-simulator).

    O servidor abre numa janela própria; feche-a (ou 'quit' no console) para encerrar.

.EXAMPLE
    ./infra/scripts/start-cs2-profile.ps1 -Name retake
    ./infra/scripts/start-cs2-profile.ps1 -Name deathmatch -Map de_mirage
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $Name,

    [string] $ProfilesDir = 'C:\carmine\cs2-profiles',

    # Mapa inicial; sem ele, o startMap do perfil.
    [string] $Map,

    # Sem esta opção o servidor fica só na rede local (sv_lan 1), como no desenvolvimento.
    [switch] $Public,

    # Só mostra o comando, sem subir o servidor.
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$profileFile = Join-Path $RepoRoot "infra\cs2\profiles\$Name\profile.json"
if (-not (Test-Path $profileFile)) {
    throw "Perfil '$Name' não existe em infra\cs2\profiles."
}
$spec = Get-Content -Path $profileFile -Raw | ConvertFrom-Json
$exe = Join-Path $ProfilesDir "$Name\game\bin\win64\cs2.exe"
if (-not (Test-Path $exe)) {
    throw "Instância não encontrada em '$ProfilesDir\$Name'. Rode: ./infra/scripts/install-cs2-server.ps1 -Steps Profiles"
}
$coreConfig = Join-Path $ProfilesDir "$Name\game\csgo\addons\counterstrikesharp\configs\plugins\Carmine.Core\Carmine.Core.json"
if (-not (Test-Path $coreConfig) -or -not (Get-Content -Path $coreConfig -Raw | ConvertFrom-Json).ApiKey) {
    Write-Warning "Sem ApiKey em ${coreConfig}: o servidor sobe, mas a API recusa o connect e o batimento."
}

$arguments = @(
    '-dedicated', '-console'
    '-port', $spec.port
    '-maxplayers', $spec.maxPlayers
    '+sv_lan', $(if ($Public) { 0 } else { 1 })
    '+game_type', $spec.gameType
    '+game_mode', $spec.gameMode
    '+map', $(if ($Map) { $Map } else { $spec.startMap })
)
Write-Host "==> $($spec.showcaseName) na porta $($spec.port) ($($spec.publicSlots) vagas públicas, maxplayers $($spec.maxPlayers))" -ForegroundColor Cyan
Write-Host "    & '$exe' $($arguments -join ' ')"
if ($DryRun) {
    return
}
# O diretório de trabalho é o da instância: o cs2.exe resolve o jogo a partir dele e do próprio caminho.
Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory (Split-Path -Parent $exe)
