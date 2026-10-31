#!/usr/bin/env bash
# Prepara uma VPS Ubuntu 24.04 NOVA para os servidores CS2 do Carmine, de ponta a ponta, com um comando.
# Roda a partir de um clone do repositório (que é público: nada de deploy key):
#
#   git clone https://github.com/caiomayan/carmine /opt/carmine-src
#   sudo /opt/carmine-src/infra/cs2/linux/vps-bootstrap.sh --ssh-from <seu IP>/32
#
# O que faz, nesta ordem (tudo idempotente; rodar de novo é seguro):
#   1. carmine-vps-check: x86-64, Ubuntu 24.04, RAM, disco, CPU, banda. FALHA aborta (use --force para ignorar).
#   2. Endurecimento: SSH só por chave (só se já houver uma chave autorizada: nunca te tranca para fora), ufw
#      (22 limitado ou só do seu IP, UDP 27015-27016), fail2ban, atualizações de segurança automáticas (sem reboot),
#      chrony, swap de 2 GB se faltar e ajustes de buffer UDP.
#   3. install.sh --steps deps,user,services: já instala os comandos carmine-secrets, carmine-plugin-deploy, etc.
#   4. install.sh --download-cs2 --core-release <versão> (SteamCMD, ~69 GB, Metamod, CounterStrikeSharp, plugins,
#      perfis, systemd) como unidade do systemd, que sobrevive à queda do terminal. É a parte demorada.
# Enquanto o download roda, faça o `servers create` e o `carmine-secrets` (a mensagem final diz como). Quando ele
# terminar, `carmine-vps-smoke --start` sobe os servidores e confere tudo.
#
#   vps-bootstrap.sh [--core-release latest|X.Y.Z] [--ssh-from CIDR] [--skip-harden] [--skip-check] [--force]
#                    [--foreground] [--dry-run]
#
#   --core-release  a release do Carmine.Core (padrão latest = a promovida no GitHub)
#   --ssh-from      libera a porta 22 só deste IP/CIDR (recomendado). Sem isto, 22 fica aberta com limite de taxa.
#   --skip-harden   não mexe em SSH, firewall, fail2ban, atualizações, swap e sysctl
#   --force         segue mesmo com FALHA no carmine-vps-check
#   --foreground    roda o install.sh na tela em vez de como unidade do systemd
#   --dry-run       só mostra o que faria
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ETC_DIR="${CARMINE_CS2_ETC:-/etc/carmine-cs2}"

log() { printf '==> %s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
die() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

DRY=0
run() { # run <comando...>: respeita --dry-run
  if ((DRY)); then printf '    [dry-run] %s\n' "$*"; else "$@"; fi
}

# Há alguma chave SSH autorizada para entrar? Sem isso, desligar a senha trancaria o dono do lado de fora.
# CARMINE_AUTHORIZED_KEYS_GLOB só existe para o teste.
has_ssh_key() {
  local glob="${CARMINE_AUTHORIZED_KEYS_GLOB:-/root/.ssh/authorized_keys /home/*/.ssh/authorized_keys}" file
  # shellcheck disable=SC2086  # a lista de padrões é de propósito expandida aqui
  for file in $glob; do
    if [[ -s "$file" ]] && grep -Eq '^(ssh-(rsa|ed25519)|ecdsa-sha2-|sk-)' "$file"; then
      return 0
    fi
  done
  return 1
}

harden_ssh() {
  if ! has_ssh_key; then
    warn "nenhuma chave SSH autorizada em /root/.ssh ou /home/*/.ssh: NÃO desliguei a senha (te trancaria para fora). Coloque sua chave e rode de novo."
    return 0
  fi
  log "SSH só por chave"
  run install -d -m 0755 /etc/ssh/sshd_config.d
  if ((DRY)); then return 0; fi
  # O sshd usa o PRIMEIRO valor que lê; "10-" vem antes do 50-cloud-init.conf (que costuma ligar a senha).
  cat >/etc/ssh/sshd_config.d/10-carmine.conf <<'EOF'
# Gerado por infra/cs2/linux/vps-bootstrap.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
PubkeyAuthentication yes
MaxAuthTries 3
X11Forwarding no
EOF
  if sshd -t; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || warn "não consegui recarregar o sshd; vale a partir do próximo restart"
  else
    rm -f /etc/ssh/sshd_config.d/10-carmine.conf
    warn "a configuração do sshd não passou no sshd -t; removi o ajuste e deixei o SSH como estava"
  fi
}

harden_firewall() {
  log "firewall (ufw): UDP 27015-27016${SSH_FROM:+, SSH só de $SSH_FROM}"
  run apt-get install -y -qq ufw
  run ufw default deny incoming
  run ufw default allow outgoing
  run ufw allow 27015:27016/udp comment 'CS2 Carmine'
  # O SSH entra ANTES de ligar o firewall, para não derrubar a sessão em andamento.
  if [[ -n "$SSH_FROM" ]]; then
    run ufw allow from "$SSH_FROM" to any port 22 proto tcp comment 'SSH do dono'
  else
    run ufw limit 22/tcp comment 'SSH com limite de taxa'
  fi
  run ufw --force enable
}

harden_misc() {
  log "fail2ban, atualizações de segurança, chrony, swap e sysctl"
  run apt-get install -y -qq fail2ban unattended-upgrades chrony
  if ((!DRY)); then
    install -d -m 0755 /etc/fail2ban/jail.d
    cat >/etc/fail2ban/jail.d/carmine.local <<'EOF'
[sshd]
enabled = true
maxretry = 5
findtime = 10m
bantime = 1h
EOF
    cat >/etc/apt/apt.conf.d/52carmine-unattended <<'EOF'
// Só segurança, SEM reboot automático (um reboot derruba os servidores; marque uma janela).
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
    cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
    cat >/etc/sysctl.d/60-carmine-cs2.conf <<'EOF'
# Buffers UDP maiores para o jogo e menos swap.
net.core.rmem_max = 26214400
net.core.wmem_max = 26214400
net.core.netdev_max_backlog = 5000
vm.swappiness = 10
EOF
    sysctl --system >/dev/null 2>&1 || true
    systemctl enable --now fail2ban chrony >/dev/null 2>&1 || warn "não consegui habilitar fail2ban/chrony agora"
    if [[ "$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)" == 0 && ! -e /swapfile ]]; then
      fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile \
        && echo '/swapfile none swap sw 0 0' >>/etc/fstab && echo "    swap de 2 GB criado"
    fi
  fi
}

main() {
  local core_release=latest ssh_from='' skip_harden=0 skip_check=0 force=0 foreground=0
  while (($#)); do
    case "$1" in
      --core-release) core_release="${2:?--core-release pede um valor}"; shift ;;
      --ssh-from) ssh_from="${2:?--ssh-from pede um valor}"; shift ;;
      --skip-harden) skip_harden=1 ;;
      --skip-check) skip_check=1 ;;
      --force) force=1 ;;
      --foreground) foreground=1 ;;
      --dry-run) DRY=1 ;;
      -h | --help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
      *) die "opção desconhecida: $1 (--help)" ;;
    esac
    shift
  done
  [[ -z "$ssh_from" || "$ssh_from" =~ ^[0-9a-fA-F:.]+(/[0-9]+)?$ ]] || die "--ssh-from precisa ser um IP ou CIDR (ex.: 203.0.113.7/32)"
  SSH_FROM="$ssh_from"
  [[ $EUID -eq 0 ]] || ((DRY)) || die "rode como root (sudo)"
  [[ -f "$REPO_ROOT/infra/cs2/linux/install.sh" ]] || die "não achei o install.sh em $REPO_ROOT (rode a partir do clone do repositório)"

  if ((!skip_check)); then
    log "1/4 conferindo a VPS (carmine-vps-check)"
    if ! bash "$SCRIPT_DIR/vps-check.sh"; then
      ((force)) || die "a VPS tem FALHA(S) acima. Resolva ou rode de novo com --force."
      warn "seguindo mesmo assim (--force)"
    fi
  fi

  if ((skip_harden)); then
    log "2/4 endurecimento: pulado (--skip-harden)"
  else
    log "2/4 endurecimento"
    run apt-get update -qq
    harden_ssh
    harden_firewall
    harden_misc
  fi

  log "3/4 comandos e unidades (install.sh --steps deps,user,services)"
  run bash "$SCRIPT_DIR/install.sh" --steps deps,user,services
  # O carmine-cs2-update usa este clone (git pull e o install.sh dele).
  if ((!DRY)); then
    install -d -m 0750 "$ETC_DIR"
    printf 'CARMINE_SRC=%s\n' "$REPO_ROOT" >"$ETC_DIR/update.env"
  fi

  log "4/4 CS2, Metamod, CounterStrikeSharp, plugins e perfis (install.sh --download-cs2 --core-release $core_release)"
  if ((foreground)); then
    run bash "$SCRIPT_DIR/install.sh" --download-cs2 --core-release "$core_release"
  elif ((DRY)); then
    run systemd-run --unit=carmine-install --collect "$SCRIPT_DIR/install.sh" --download-cs2 --core-release "$core_release"
  else
    systemd-run --unit=carmine-install --collect "$SCRIPT_DIR/install.sh" --download-cs2 --core-release "$core_release"
  fi

  cat <<EOF

Pronto por enquanto. O download do CS2 (~69 GB) roda em segundo plano:
    journalctl -fu carmine-install        # termina com "Pronto."

Enquanto ele baixa, faça (na VM de produção, o cadastro; aqui, os segredos):
  1. servers create --name retake-1 --mode retake     --address retake.stcarmine.com:27015
     servers create --name dm-1     --mode deathmatch --address dm.stcarmine.com:27016
     (DNS dos dois nomes: registro A só-DNS, "nuvem cinza", apontando para o IP desta VPS)
  2. sudo carmine-secrets profile retake      # chave do servidor + GSLT, digitados sem eco
     sudo carmine-secrets profile deathmatch
     sudo carmine-secrets alerts              # webhook do Discord dos alertas da VPS
     sudo carmine-secrets mirror              # (opcional) espelho R2 dos terceiros, token de leitura
Quando o install terminar:
  3. sudo carmine-vps-smoke --start           # sobe os dois e confere (A2S, Metamod, Carmine.Core, site)
EOF
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  main "$@"
fi
