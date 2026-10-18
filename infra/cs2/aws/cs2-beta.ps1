<#
.SYNOPSIS
    Liga, desliga e consulta a instância EC2 dos servidores CS2 do beta (docs/operacao/aws-beta-cs2.md).

.DESCRIPTION
    A instância é achada pela tag Name (padrão carmine-cs2-beta) em sa-east-1, então não há ID para
    guardar. Ligada, ela custa ~US$ 0,28/h; desligada, só o disco e o IP (~US$ 0,03/h): DESLIGUE
    ao fim de cada sessão. Os servidores (carmine-cs2.target) sobem sozinhos no boot.

    Precisa do AWS CLI v2 configurado com um perfil que possa ec2:Start/StopInstances (veja
    operator-policy.json) e, para a ação shell, do session-manager-plugin.

.EXAMPLE
    ./infra/cs2/aws/cs2-beta.ps1 start
    ./infra/cs2/aws/cs2-beta.ps1 status
    ./infra/cs2/aws/cs2-beta.ps1 stop
    ./infra/cs2/aws/cs2-beta.ps1 shell                 # terminal na instância (SSM, sem SSH)
    ./infra/cs2/aws/cs2-beta.ps1 start -Profile carmine -DryRun
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('start', 'stop', 'status', 'shell')]
    [string] $Action,

    [string] $Region = 'sa-east-1',

    # Valor da tag Name da instância.
    [string] $Name = 'carmine-cs2-beta',

    # Perfil do AWS CLI (padrão: o do ambiente).
    [string] $Profile,

    # Custo/hora ligada, só para a estimativa (m6a.xlarge US$ 0,2754 + IPv4 público US$ 0,005).
    [double] $HourlyUsd = 0.28,

    # Não espera a instância ficar pronta/parada.
    [switch] $NoWait,

    # stop sem perguntar.
    [switch] $Yes,

    # Mostra os comandos que mudam coisas, sem executá-los.
    [switch] $DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw 'AWS CLI não encontrado. Instale o v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html'
}

# Executa 'aws ...' e devolve a saída; falha se o código de saída não for 0.
function Invoke-Aws([string[]] $Arguments) {
    $all = @($Arguments) + @('--region', $Region)
    if ($Profile) {
        $all += @('--profile', $Profile)
    }
    $output = & aws @all
    if ($LASTEXITCODE -ne 0) {
        throw "aws $($Arguments -join ' ') falhou (código $LASTEXITCODE)"
    }
    return $output
}

function Get-CarmineInstance {
    $query = 'Reservations[].Instances[].{id:InstanceId,state:State.Name,type:InstanceType,ip:PublicIpAddress,launched:LaunchTime}'
    $json = Invoke-Aws @(
        'ec2', 'describe-instances',
        '--filters', "Name=tag:Name,Values=$Name", 'Name=instance-state-name,Values=pending,running,stopping,stopped',
        '--query', $query, '--output', 'json'
    )
    $found = @(($json -join "`n") | ConvertFrom-Json)
    if ($found.Count -eq 0) {
        throw "Nenhuma instância com a tag Name=$Name em $Region (já foi criada? veja docs/operacao/aws-beta-cs2.md)."
    }
    if ($found.Count -gt 1) {
        throw "Mais de uma instância com a tag Name=${Name}: $($found.id -join ', '). Deixe só uma."
    }
    return $found[0]
}

function Write-Mutation([string[]] $Arguments) {
    if ($DryRun) {
        Write-Host "    (dry-run) aws $($Arguments -join ' ') --region $Region" -ForegroundColor DarkGray
        return
    }
    Invoke-Aws $Arguments | Out-Null
}

function Show-Uptime($Instance) {
    if ($Instance.state -eq 'running') {
        $hours = ((Get-Date).ToUniversalTime() - ([datetime] $Instance.launched).ToUniversalTime()).TotalHours
        Write-Host ('    ligada há {0:N1} h (~US$ {1:N2} nesta sessão)' -f $hours, ($hours * $HourlyUsd))
    }
}

$instance = Get-CarmineInstance
Write-Host "==> $Name ($($instance.id), $($instance.type)): $($instance.state)" -ForegroundColor Cyan

switch ($Action) {
    'status' {
        Write-Host "    IP público: $(if ($instance.ip) { $instance.ip } else { '(sem IP: desligada)' })"
        Show-Uptime $instance
        if ($instance.state -eq 'running') {
            Write-Host '    lembrete: desligue ao fim da sessão (cs2-beta.ps1 stop)' -ForegroundColor Yellow
        }
    }
    'start' {
        if ($instance.state -eq 'running') {
            Write-Host '    já está ligada'
            Show-Uptime $instance
            return
        }
        Write-Mutation @('ec2', 'start-instances', '--instance-ids', $instance.id)
        if (-not $NoWait -and -not $DryRun) {
            Write-Host '    esperando ligar e passar nos testes de status (1 a 3 min)...'
            Invoke-Aws @('ec2', 'wait', 'instance-running', '--instance-ids', $instance.id) | Out-Null
            Invoke-Aws @('ec2', 'wait', 'instance-status-ok', '--instance-ids', $instance.id) | Out-Null
            $instance = Get-CarmineInstance
        }
        if ($instance.ip) {
            Write-Host "    IP público: $($instance.ip)"
        }
        Write-Host '    os servidores sobem sozinhos (~1 min); confira na home do site. Desligue ao fim: cs2-beta.ps1 stop' -ForegroundColor Green
    }
    'stop' {
        if ($instance.state -eq 'stopped') {
            Write-Host '    já está desligada'
            return
        }
        Show-Uptime $instance
        if (-not $Yes -and -not $DryRun) {
            $answer = Read-Host '    Desligar agora? Quem estiver jogando é desconectado (s/N)'
            if ($answer -notmatch '^[sSyY]') {
                Write-Host '    cancelado'
                return
            }
        }
        # O shutdown do EC2 manda o ACPI para o Ubuntu: o systemd para os servidores com calma.
        Write-Mutation @('ec2', 'stop-instances', '--instance-ids', $instance.id)
        if (-not $NoWait -and -not $DryRun) {
            Invoke-Aws @('ec2', 'wait', 'instance-stopped', '--instance-ids', $instance.id) | Out-Null
            Write-Host '    desligada. Custo parada: só o disco e o IP (~US$ 0,03/h).' -ForegroundColor Green
        }
    }
    'shell' {
        if ($instance.state -ne 'running') {
            throw "A instância está $($instance.state): ligue com 'start' antes."
        }
        if (-not (Get-Command session-manager-plugin -ErrorAction SilentlyContinue)) {
            throw 'session-manager-plugin não encontrado: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html'
        }
        $arguments = @('ssm', 'start-session', '--target', $instance.id, '--region', $Region)
        if ($Profile) {
            $arguments += @('--profile', $Profile)
        }
        if ($DryRun) {
            Write-Host "    (dry-run) aws $($arguments -join ' ')" -ForegroundColor DarkGray
            return
        }
        & aws @arguments
    }
}
