#!/usr/bin/env bash
# Fumaça final de uma VPS recém-instalada: sobe (com --start) e confere, por servidor, o que o dono vai ver.
# Instalado em /usr/local/sbin/carmine-vps-smoke.
#
#   carmine-vps-smoke [--start] [--no-api]
#
#   --start    sobe o carmine-cs2.target antes de conferir (e espera até 2 min)
#   --no-api   não pergunta à API do site (sem rede, ou antes do `servers create`)
#
# Por servidor confere: o serviço de pé; o Metamod e o Carmine.Core falando no journal e nenhum erro de carga;
# a consulta A2S local respondendo; e, com a API, o servidor aparecendo ONLINE na lista pública (o batimento
# chegando = chave certa, GSLT aceito e rede liberada). Sai com 1 se qualquer item falhar.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
API_URL="${CARMINE_API_BASE_URL:-https://stcarmine.com}"
log() { printf '%s\n' "$*"; }
die() { log "ERRO: $*" >&2; exit 1; }

# shellcheck source=lib-servers.sh
source "$SCRIPT_DIR/lib-servers.sh"

START=0
USE_API=1
while (($#)); do
  case "$1" in
    --start) START=1 ;;
    --no-api) USE_API=0 ;;
    -h | --help) sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "opção desconhecida: $1" >&2; exit 2 ;;
  esac
  shift
done

fails=0
check() { # check <ok|falha> <item> <detalhe>
  if [[ "$1" == ok ]]; then printf 'OK     %s\n' "$2"; else printf 'FALHA  %s: %s\n' "$2" "$3"; fails=$((fails + 1)); fi
}

if ((START)); then
  "$SYSTEMCTL" start carmine-cs2.target
  log "esperando os servidores subirem (até 2 min)..."
  sleep "${CARMINE_SMOKE_WAIT:-120}"
fi

api_json=''
if ((USE_API)); then
  api_json="$(curl -fsS --max-time 10 "$API_URL/api/servers" 2>/dev/null || true)"
fi

found=0
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  found=1
  unit="carmine-cs2@$name.service"
  port="$(port_of "$name")"
  if "$SYSTEMCTL" is-active --quiet "$unit"; then check ok "$name: serviço de pé" ""; else check falha "$name: serviço" "não está ativo (journalctl -u $unit)"; continue; fi

  text="$("$JOURNALCTL" -u "$unit" --since '-30min' --no-pager -o cat 2>/dev/null || true)"
  if grep -qi 'metamod' <<<"$text"; then check ok "$name: Metamod no log" ""; else check falha "$name: Metamod" "não aparece no log (gameinfo.gi registrado?)"; fi
  if grep -q 'Carmine\.Core: ' <<<"$text"; then check ok "$name: Carmine.Core no log" ""; else check falha "$name: Carmine.Core" "não falou no log (CounterStrikeSharp carregou o plugin?)"; fi
  if grep -Eiq 'failed to load|error loading|could not load|unhandled exception' <<<"$text"; then check falha "$name: erros de carga" "veja journalctl -u $unit"; else check ok "$name: sem erro de carga" ""; fi
  if grep -qi 'logon.*\(fail\|denied\|refused\)\|invalid.*steam.*account\|GSLT.*\(invalid\|banned\)' <<<"$text"; then check falha "$name: GSLT" "a Steam recusou o logon do servidor (token inválido ou banido: carmine-secrets gslt $name)"; else check ok "$name: logon na Steam sem recusa" ""; fi

  if [[ -n "$port" ]] && "$A2S" "$port" >/dev/null 2>&1; then check ok "$name: consulta A2S responde na porta $port" ""; else check falha "$name: A2S" "sem resposta na porta ${port:-?} (o jogo ainda carregando, ou firewall)"; fi

  if ((USE_API)); then
    if [[ -z "$api_json" ]]; then
      check falha "$name: API do site" "não consegui ler $API_URL/api/servers"
    else
      state="$(jq -r --arg p ":$port" '[.servers[]? | select(.address | endswith($p))][0].state // "ausente"' <<<"$api_json")"
      case "$state" in
        online | full) check ok "$name: aparece $state na lista do site" "" ;;
        ausente) check falha "$name: cadastro" "nenhum servidor com a porta $port na API (servers create --address <IP ou nome>:$port)" ;;
        *) check falha "$name: batimento" "o site mostra $state (a chave do servidor está certa? o plugin alcança $API_URL?)" ;;
      esac
    fi
  fi
done < <(profiles)
((found)) || die "nenhum perfil instalado em $HOME_DIR/profiles (rode o install.sh)"

echo
if ((fails)); then echo "$fails item(ns) com FALHA."; exit 1; fi
echo "Tudo certo: os servidores estão no ar."
