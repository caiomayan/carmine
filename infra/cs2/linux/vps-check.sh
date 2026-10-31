#!/usr/bin/env bash
# Confere se a VPS serve para os servidores CS2 ANTES de gastar 69 GB de download e uma hora de instalação.
# Instalado em /usr/local/sbin/carmine-vps-check; o vps-bootstrap.sh o roda primeiro.
#
#   carmine-vps-check [--no-network] [--home DIR] [--machine]
#
# Cada item sai como OK, AVISO ou FALHA. Qualquer FALHA => saída 1 (o que impede o servidor de funcionar);
# AVISO é o que merece um olhar (por exemplo, CPU lenta ou banda baixa), mas não bloqueia. Hardware e rede não
# têm "certo" absoluto: os limites são o que o orçamento e o ADR 0009 pedem (4 vCPU, 8 GB, ≥ 120 GB, x86).
#   --machine     uma linha "STATUS|item|detalhe" por item (para scripts e testes)
#   --no-network  pula os testes de rede e de banda
set -euo pipefail

HOME_DIR="${CARMINE_CS2_HOME:-/srv/carmine-cs2}"
NETWORK=1
MACHINE=0
while (($#)); do
  case "$1" in
    --no-network) NETWORK=0 ;;
    --machine) MACHINE=1 ;;
    --home) HOME_DIR="${2:?--home pede um valor}"; shift ;;
    -h | --help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done

fails=0
warns=0
report() { # report <OK|AVISO|FALHA> <item> <detalhe>
  case "$1" in FALHA) fails=$((fails + 1)) ;; AVISO) warns=$((warns + 1)) ;; *) ;; esac
  if ((MACHINE)); then printf '%s|%s|%s\n' "$1" "$2" "$3"; else printf '%-6s %-28s %s\n' "$1" "$2" "$3"; fi
}

# --- sistema -----------------------------------------------------------------------------------------
arch="$(uname -m)"
if [[ "$arch" == x86_64 ]]; then report OK "arquitetura" "$arch"; else report FALHA "arquitetura" "$arch (o CS2 dedicado só roda em x86-64; ARM/emulação trava o Metamod e o CounterStrikeSharp)"; fi

os_id="$(. /etc/os-release 2>/dev/null && echo "${ID:-?}")"
os_version="$(. /etc/os-release 2>/dev/null && echo "${VERSION_ID:-?}")"
if [[ "$os_id" == ubuntu && "$os_version" == 24.04 ]]; then
  report OK "sistema" "Ubuntu $os_version"
elif [[ "$os_id" == ubuntu ]]; then
  report AVISO "sistema" "Ubuntu $os_version (o instalador foi testado no 24.04)"
else
  report FALHA "sistema" "$os_id $os_version (o instalador é para Ubuntu 24.04)"
fi

if [[ $EUID -eq 0 ]]; then report OK "root" "sim"; else report FALHA "root" "rode com sudo"; fi
if [[ -d /run/systemd/system ]]; then report OK "systemd" "em execução"; else report FALHA "systemd" "não está em execução (as unidades dos servidores precisam dele)"; fi

virt="$(systemd-detect-virt 2>/dev/null || true)"
case "$virt" in
  kvm | qemu | vmware | microsoft | xen | none | '') report OK "virtualização" "${virt:-desconhecida}" ;;
  lxc | openvz | systemd-nspawn | docker | podman) report AVISO "virtualização" "$virt (contêiner: sem controle do kernel; prefira KVM)" ;;
  *) report OK "virtualização" "$virt" ;;
esac

# --- CPU, memória, disco ------------------------------------------------------------------------------
cores="$(nproc 2>/dev/null || echo 1)"
if ((cores >= 4)); then report OK "núcleos" "$cores"; elif ((cores >= 2)); then report AVISO "núcleos" "$cores (o plano prevê 4)"; else report FALHA "núcleos" "$cores"; fi

model="$(sed -n 's/^model name[[:space:]]*:[[:space:]]*//p' /proc/cpuinfo 2>/dev/null | head -n 1)"
mhz="$(sed -n 's/^cpu MHz[[:space:]]*:[[:space:]]*\([0-9]*\).*/\1/p' /proc/cpuinfo 2>/dev/null | head -n 1)"
if [[ -n "${mhz:-}" && "$mhz" -lt 2500 ]]; then
  report AVISO "CPU" "${model:-?} a ${mhz} MHz (o CS2 depende do clock de UM núcleo; prefira ≥ 3 GHz)"
else
  report OK "CPU" "${model:-?}${mhz:+ a ${mhz} MHz}"
fi

mem_kb="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
mem_gb=$((mem_kb / 1024 / 1024))
if ((mem_kb >= 7500000)); then
  report OK "memória" "$((mem_kb / 1024)) MB"
elif ((mem_kb >= 5500000)); then
  report AVISO "memória" "$((mem_kb / 1024)) MB (dois servidores pedem 3 a 6 GB cada; abaixo de 8 GB o OOM mata um deles)"
else
  report FALHA "memória" "$((mem_kb / 1024)) MB (mínimo ~6 GB para os dois servidores)"
fi
: "$mem_gb"
swap_kb="$(awk '/^SwapTotal:/ { print $2 }' /proc/meminfo)"
report OK "swap" "$((swap_kb / 1024)) MB (o vps-bootstrap cria 2 GB se não houver)"

probe_dir="$HOME_DIR"
while [[ ! -d "$probe_dir" && "$probe_dir" != / ]]; do probe_dir="$(dirname "$probe_dir")"; done
free_gb=$(($(df -Pk "$probe_dir" | awk 'NR == 2 { print $4 }') / 1024 / 1024))
if ((free_gb >= 120)); then
  report OK "disco livre" "${free_gb} GB em $probe_dir"
elif ((free_gb >= 90)); then
  report AVISO "disco livre" "${free_gb} GB em $probe_dir (o CS2 ocupa ~69 GB; 120 GB deixa folga para updates)"
else
  report FALHA "disco livre" "${free_gb} GB em $probe_dir (o CS2 ocupa ~69 GB e cada update pede folga)"
fi

# --- rede -----------------------------------------------------------------------------------------------
sync="$(timedatectl show -p NTPSynchronized --value 2>/dev/null || true)"
if [[ "$sync" == yes ]]; then report OK "relógio" "sincronizado (NTP)"; else report AVISO "relógio" "sem NTP (o vps-bootstrap instala o chrony)"; fi

busy="$(ss -Hulpn 2>/dev/null | awk '$5 ~ /:2701[56]$/ { print $5 }' | tr '\n' ' ' || true)"
if [[ -z "$busy" ]]; then report OK "portas UDP" "27015 e 27016 livres"; else report AVISO "portas UDP" "em uso: $busy"; fi

if ((NETWORK)); then
  for url in https://api.github.com https://steamcommunity.com https://stcarmine.com/api/health; do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
    if [[ "$code" =~ ^[23] ]]; then report OK "alcance $url" "HTTP $code"; else report FALHA "alcance $url" "sem resposta (${code:-erro})"; fi
  done
  ip="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
  if [[ -n "$ip" ]]; then report OK "IP público" "$ip (é o endereço do cadastro do servidor)"; else report AVISO "IP público" "não consegui descobrir"; fi

  speed="$(curl -fsS --max-time 25 -o /dev/null -w '%{speed_download}' 'https://speed.cloudflare.com/__down?bytes=100000000' 2>/dev/null || echo 0)"
  mbit=$(awk -v s="$speed" 'BEGIN { printf "%d", s * 8 / 1000000 }')
  eta=$(awk -v m="$mbit" 'BEGIN { if (m > 0) printf "%d", 69 * 8000 / m / 60; else print 0 }')
  if ((mbit >= 100)); then
    report OK "banda de download" "~${mbit} Mbit/s (os ~69 GB levam cerca de ${eta} min)"
  elif ((mbit >= 20)); then
    report AVISO "banda de download" "~${mbit} Mbit/s (os ~69 GB levam cerca de ${eta} min)"
  else
    report FALHA "banda de download" "~${mbit} Mbit/s (baixa demais para o CS2 e para os updates)"
  fi
fi

if ((!MACHINE)); then
  echo
  if ((fails)); then echo "$fails falha(s) e $warns aviso(s): resolva as FALHAS antes de instalar."
  elif ((warns)); then echo "Sem falhas, $warns aviso(s): vale um olhar, mas dá para instalar."
  else echo "Tudo certo para instalar."; fi
fi
exit $((fails > 0 ? 1 : 0))
