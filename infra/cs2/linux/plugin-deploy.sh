#!/usr/bin/env bash
# Entrega o Carmine.Core aos servidores CS2 da VPS, UM servidor por vez, com volta. Instalado em
# /usr/local/sbin/carmine-plugin-deploy pelo install.sh (etapa services) e chamado à mão ou pelo timer
# carmine-plugin-sync (a cada 10 minutos, com --when-empty --no-wait).
#
#   carmine-plugin-deploy [--version latest|X.Y.Z] [--server retake|deathmatch|...] [--when-empty [--no-wait]]
#                         [--rollback] [--wait MINUTOS] [--dry-run]
#
#   --version      padrão latest = a release core-v* promovida (não pré-lançamento) no GitHub. Um número vale mesmo
#                  sendo pré-lançamento: serve para testar num servidor só (--server) antes de promover.
#   --server       só este perfil; padrão todos, Retake primeiro.
#   --when-empty   só mexe num servidor sem jogadores (consulta A2S local). Com --no-wait, pula o ocupado e sai com
#                  75 (o timer tenta de novo); sem ele, espera até --wait minutos (padrão 120).
#   --rollback     volta cada servidor à versão que tinha antes do último deploy (sem rede).
#   --dry-run      só diz o que faria.
#
# Para cada servidor: confere a release (SHA-256, manifesto, atestação), para o serviço, troca a pasta do plugin,
# sobe e espera ficar saudável (serviço de pé, Carmine.Core no log e nenhum erro de carga). Se não ficar, devolve a
# pasta anterior, sobe, avisa no Discord e PARA: os outros servidores não são tocados e a versão fica marcada como
# falha (o timer não a repete; peça --version X.Y.Z de novo à mão depois de corrigir).
#
# Códigos de saída: 0 ok (ou nada a fazer), 1 falhou (com volta), 2 uso, 75 adiado (servidor ocupado).
set -euo pipefail

HOME_DIR="${CARMINE_CS2_HOME:-/srv/carmine-cs2}"
SERVICE_USER="${CARMINE_CS2_USER:-carmine-cs2}"
LOCK_FILE="${CARMINE_DEPLOY_LOCK:-/run/carmine-plugin-deploy.lock}"
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

log() { printf '[carmine-plugin-deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; }

# shellcheck source=lib-release.sh
source "$SCRIPT_DIR/lib-release.sh"
# shellcheck source=lib-servers.sh
source "$SCRIPT_DIR/lib-servers.sh"

WANT=latest
ONLY=''
WHEN_EMPTY=0
NO_WAIT=0
ROLLBACK=0
DRY=0
WAIT_MIN=120
while (($#)); do
  case "$1" in
    --version) WANT="${2:?--version pede um valor}"; shift ;;
    --server) ONLY="${2:?--server pede um valor}"; shift ;;
    --when-empty) WHEN_EMPTY=1 ;;
    --no-wait) NO_WAIT=1 ;;
    --wait) WAIT_MIN="${2:?--wait pede um valor}"; shift ;;
    --rollback) ROLLBACK=1 ;;
    --dry-run) DRY=1 ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done
[[ -z "$ONLY" || "$ONLY" =~ ^[a-z0-9-]+$ ]] || { echo "nome de perfil inválido: $ONLY" >&2; exit 2; }

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || die "outro carmine-plugin-deploy (ou o install.sh) está em andamento"

plugin_dir() { echo "$HOME_DIR/profiles/$1/game/csgo/addons/counterstrikesharp/plugins/Carmine.Core"; }
version_file() { echo "$HOME_DIR/profiles/$1/carmine-core.version"; }
previous_file() { echo "$HOME_DIR/profiles/$1/carmine-core.previous"; }
failed_file() { echo "$HOME_DIR/releases/failed-versions"; }
read_or_none() { if [[ -f "$1" ]]; then cat "$1"; else echo none; fi; }

# Troca a pasta do plugin de UM servidor para $2 (uma versão já baixada). 0 ok, 1 falhou e VOLTOU.
swap_one() { # swap_one <perfil> <versão>
  local name="$1" version="$2" dir backup was_active since cur
  dir="$(plugin_dir "$name")"
  backup="$dir.rollback"
  cur="$(read_or_none "$(version_file "$name")")"
  was_active=0
  "$SYSTEMCTL" is-active --quiet "carmine-cs2@$name.service" && was_active=1
  log "$name: $cur -> $version"
  ((was_active)) && "$SYSTEMCTL" stop "carmine-cs2@$name.service"
  rm -rf "$backup"
  [[ -d "$dir" ]] && mv "$dir" "$backup"
  mkdir -p "$dir"
  cp -a "$(release_dir "$version")/plugin/." "$dir/"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$dir" 2>/dev/null || true
  if ((!was_active)); then
    # Servidor parado de propósito: troca só os arquivos, sem subir nem testar.
    rm -rf "$backup"
    [[ "$cur" == none ]] || echo "$cur" >"$(previous_file "$name")"
    echo "$version" >"$(version_file "$name")"
    log "$name: estava parado; plugin trocado para $version sem teste de saúde"
    return 0
  fi
  since="$(date '+%Y-%m-%d %H:%M:%S')"
  "$SYSTEMCTL" start "carmine-cs2@$name.service"
  if healthy "$name" "$since"; then
    rm -rf "$backup"
    [[ "$cur" == none ]] || echo "$cur" >"$(previous_file "$name")"
    echo "$version" >"$(version_file "$name")"
    log "$name: no ar com o Carmine.Core $version"
    return 0
  fi
  log "$name: voltando para $cur"
  "$SYSTEMCTL" stop "carmine-cs2@$name.service" || true
  rm -rf "$dir"
  [[ -d "$backup" ]] && mv "$backup" "$dir"
  "$SYSTEMCTL" start "carmine-cs2@$name.service" || true
  return 1
}

# ---------------------------------------------------------------------------------------------- rollback
if ((ROLLBACK)); then
  status=0
  any=0
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    previous="$(read_or_none "$(previous_file "$name")")"
    if [[ "$previous" == none ]]; then
      log "$name: não há versão anterior registrada"
      status=1
      continue
    fi
    [[ -f "$(release_dir "$previous")/.verified" ]] || { log "$name: a release $previous não está mais no host"; status=1; continue; }
    any=1
    if ((DRY)); then log "$name: voltaria para $previous"; continue; fi
    if ((WHEN_EMPTY)); then wait_until_empty "$name" || exit $?; fi
    cur="$(read_or_none "$(version_file "$name")")"
    if swap_one "$name" "$previous"; then
      echo "$cur" >"$(previous_file "$name")"
      alert "↩️ Carmine.Core de **$name** voltou para $previous (estava em $cur)."
    else
      alert "🔴 A volta do Carmine.Core de **$name** para $previous FALHOU; veja o journal."
      exit 1
    fi
  done < <(profiles)
  ((any)) || log "nada para voltar"
  exit "$status"
fi

# ---------------------------------------------------------------------------------------------- deploy
VERSION="$(release_resolve "$WANT")"
if [[ "$WANT" == latest ]] && [[ -f "$(failed_file)" ]] && grep -qx "$VERSION" "$(failed_file)"; then
  log "a release $VERSION já falhou neste host; não repito sozinho (use --version $VERSION depois de corrigir)"
  exit 0
fi

todo=()
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  [[ "$(read_or_none "$(version_file "$name")")" == "$VERSION" ]] || todo+=("$name")
done < <(profiles)
if [[ ${#todo[@]} -eq 0 ]]; then
  log "nada a fazer: Carmine.Core $VERSION já está em todos os servidores"
  exit 0
fi
if ((DRY)); then
  log "faria: Carmine.Core $VERSION em ${todo[*]}"
  exit 0
fi

release_fetch "$VERSION"
used=()
while IFS= read -r name; do
  [[ -n "$name" ]] && used+=("$(read_or_none "$(version_file "$name")")" "$(read_or_none "$(previous_file "$name")")")
done < <(profiles)
release_prune 3 "${used[@]}" "$VERSION"

postponed=()
for name in "${todo[@]}"; do
  if ((WHEN_EMPTY)); then
    # Servidor ocupado: segue para os outros e o timer volta nele depois.
    wait_until_empty "$name" || { postponed+=("$name"); continue; }
  fi
  if swap_one "$name" "$VERSION"; then
    alert "✅ Carmine.Core **$VERSION** no ar em **$name**."
  else
    mkdir -p "$HOME_DIR/releases"
    echo "$VERSION" >>"$(failed_file)"
    alert "🔴 Carmine.Core **$VERSION** não ficou saudável em **$name**; voltei a versão anterior e parei (os outros servidores não foram tocados). Veja: journalctl -u carmine-cs2@$name."
    exit 1
  fi
done
if [[ ${#postponed[@]} -gt 0 ]]; then
  log "adiado (ocupados): ${postponed[*]}"
  exit 75
fi
log "pronto: Carmine.Core $VERSION em ${todo[*]}"
