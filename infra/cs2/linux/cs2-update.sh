#!/usr/bin/env bash
# Atualiza o CS2 sozinho quando a Valve publica um build novo. Instalado em /usr/local/sbin/carmine-cs2-update
# e chamado a cada 10 minutos pelo carmine-cs2-update.timer. Hoje o jogo só avisa ("server is out of date") e os
# jogadores ficam de fora até alguém rodar o runbook (docs/operacao/atualizacao-do-cs2.md): isto tira essa espera.
#
#   carmine-cs2-update [--check] [--force] [--wait MINUTOS]
#
#   --check   só diz o build instalado e o mais novo, e se haveria atualização (não muda nada).
#   --force   tenta de novo um build que já falhou neste host (o timer não o repete sozinho).
#   --wait    quanto esperar os servidores esvaziarem antes de parar (padrão 20); passado o prazo, atualiza assim
#             mesmo (a Valve já impede os jogadores de entrar com o servidor desatualizado).
#
# Fluxo: compara o buildid do app 730 (SteamCMD) com o do appmanifest instalado. Diferente: espera esvaziar,
# avisa no Discord, traz o repositório (git pull --ff-only, para pegar versões de plugin novas já aprovadas),
# para os servidores, roda `install.sh --download-cs2 --steps cs2,metamod,css,build,profiles,services` (com a
# mesma release do Carmine.Core que já estava), sobe e confere a saúde de cada servidor. Tudo certo: aviso verde.
# Qualquer falha: os servidores FICAM PARADOS (subir sem o CounterStrikeSharp funcionando enganaria o jogador:
# conectado, mas sem skins nem Loadout), o build fica marcado como falho e o alerta vermelho traz o trecho do log.
# Não há como voltar a versão do CS2: a saída é a correção do plugin (versions.sh / release do Carmine.Core), que os
# outros dois mecanismos entregam, e depois `carmine-cs2-update --force`.
#
# Códigos de saída: 0 em dia (ou atualizado), 1 falhou, 2 uso.
set -euo pipefail

SERVICE_USER="${CARMINE_CS2_USER:-carmine-cs2}"
SRC="${CARMINE_SRC:-/opt/carmine-src}"
STEAMCMD="${CARMINE_STEAMCMD:-}"
INSTALL="${CARMINE_INSTALL:-}"
LOCK_FILE="${CARMINE_UPDATE_LOCK:-/run/carmine-cs2-update.lock}"
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"

log() { printf '[carmine-cs2-update %s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERRO: $*"; exit 1; }
usage() { sed -n '2,/^set -euo/p' "${BASH_SOURCE[0]}" | sed -e '$d' -e 's/^# \{0,1\}//'; }

# shellcheck source=lib-servers.sh
source "$SCRIPT_DIR/lib-servers.sh"
[[ -n "$STEAMCMD" ]] || STEAMCMD="$HOME_DIR/steamcmd/steamcmd.sh"
# O install.sh instalado mora no clone do repositório; o do clone é sempre o que combina com o versions.sh dele.
[[ -n "$INSTALL" ]] || INSTALL="$SRC/infra/cs2/linux/install.sh"

CHECK=0
FORCE=0
NO_WAIT=0
WAIT_MIN=20
while (($#)); do
  case "$1" in
    --check) CHECK=1 ;;
    --force) FORCE=1 ;;
    --wait) WAIT_MIN="${2:?--wait pede um valor}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$(dirname "$LOCK_FILE")"
exec 9>"$LOCK_FILE"
flock -n 9 || die "outra atualização do CS2 (ou o install.sh) está em andamento"

# O buildid do ramo público, a partir da saída `app_info_print` do SteamCMD.
parse_latest_buildid() {
  awk '
    /"branches"/ { in_branches = 1 }
    in_branches && /"public"/ { in_public = 1 }
    in_public && /"buildid"/ { gsub(/[^0-9]/, "", $0); print; exit }
  '
}

installed_buildid() {
  local manifest="$HOME_DIR/server/steamapps/appmanifest_730.acf"
  [[ -f "$manifest" ]] || return 1
  sed -n 's/.*"buildid"[[:space:]]*"\([0-9]*\)".*/\1/p' "$manifest" | head -n 1
}

latest_buildid() {
  local out id attempt
  for attempt in 1 2 3; do
    if out="$(as_service_user "$STEAMCMD" +login anonymous +app_info_update 1 +app_info_print 730 +quit 2>/dev/null)"; then
      id="$(parse_latest_buildid <<<"$out")"
      if [[ -n "$id" ]]; then echo "$id"; return 0; fi
    fi
    sleep $((attempt * 5))
  done
  return 1
}

as_service_user() {
  if [[ "$(id -u)" == 0 && "$SERVICE_USER" != root ]] && id "$SERVICE_USER" >/dev/null 2>&1; then
    runuser -u "$SERVICE_USER" -- env HOME="$HOME_DIR" "$@"
  else
    "$@"
  fi
}

installed="$(installed_buildid)" || die "não achei o appmanifest_730.acf em $HOME_DIR/server/steamapps (o CS2 está instalado?)"
latest="$(latest_buildid)" || die "não consegui perguntar à Steam o build mais novo do CS2"
marker="$HOME_DIR/releases/cs2-update-failed"

if [[ "$installed" == "$latest" ]]; then
  log "CS2 em dia (build $installed)"
  exit 0
fi
log "build novo do CS2: instalado $installed, Steam $latest"
if ((CHECK)); then
  log "haveria atualização"
  exit 0
fi
if ((!FORCE)) && [[ -f "$marker" ]] && grep -qx "$latest" "$marker"; then
  log "o build $latest já falhou neste host e os servidores estão parados à espera de uma pessoa; use --force depois de corrigir"
  exit 0
fi

# 1. Espera esvaziar (até WAIT_MIN); passado o prazo, atualiza assim mesmo.
deadline=$((SECONDS + WAIT_MIN * 60))
while true; do
  busy=()
  while IFS= read -r name; do
    [[ -n "$name" ]] && ! is_empty "$name" && busy+=("$name")
  done < <(profiles)
  [[ ${#busy[@]} -eq 0 ]] && break
  if ((SECONDS >= deadline)); then
    log "ainda há jogadores em ${busy[*]}; atualizando assim mesmo (a Valve já barra a entrada com o servidor desatualizado)"
    break
  fi
  log "esperando esvaziar: ${busy[*]} (até $WAIT_MIN min)"
  sleep 30
done

alert "🟡 Atualizando o CS2 (build $installed → $latest). Os servidores ficam fora do ar por alguns minutos."

fail() { # fail <motivo>: deixa tudo parado e avisa
  "$SYSTEMCTL" stop carmine-cs2.target || true
  mkdir -p "$HOME_DIR/releases"
  echo "$latest" >"$marker"
  local excerpt=''
  while IFS= read -r name; do
    [[ -n "$name" ]] || continue
    excerpt+="**$name**: $("$JOURNALCTL" -u "carmine-cs2@$name.service" --since '-10min' --no-pager -o cat 2>/dev/null \
      | { grep -iE 'error|fail|exception|signature|could not' || true; } | tail -n 4 | cut -c1-180 | tr '\n' '|')"$'\n'
  done < <(profiles)
  alert "🔴 A atualização do CS2 para o build $latest FALHOU: $1. Os servidores estão **parados**. ${excerpt:0:900}Veja journalctl -u carmine-cs2-update e carmine-cs2@<perfil>; depois: carmine-cs2-update --force."
  die "$1 (servidores parados; build $latest marcado como falho)"
}

# 2. O repositório (versões de plugin aprovadas) e os servidores.
if [[ -d "$SRC/.git" ]]; then
  git -C "$SRC" pull --ff-only --quiet || log "aviso: git pull falhou; sigo com o checkout atual de $SRC"
else
  log "aviso: $SRC não é um clone do repositório; uso o install.sh de $INSTALL como está"
fi
[[ -x "$INSTALL" ]] || fail "install.sh não encontrado em $INSTALL"
"$SYSTEMCTL" stop carmine-cs2.target

# 3. A mesma release do Carmine.Core que já estava (se foi instalada por release).
core_args=()
[[ -f "$HOME_DIR/releases/installed" ]] && core_args=(--core-release installed)
log "rodando o install.sh (cs2,metamod,css,build,profiles,services)"
if ! "$INSTALL" --download-cs2 --home "$HOME_DIR" --steps cs2,metamod,css,build,profiles,services "${core_args[@]}"; then
  fail "o install.sh falhou"
fi

# 4. Sobe e confere cada servidor.
since="$(date '+%Y-%m-%d %H:%M:%S')"
"$SYSTEMCTL" start carmine-cs2.target
while IFS= read -r name; do
  [[ -n "$name" ]] || continue
  healthy "$name" "$since" || fail "o servidor $name não ficou saudável com o CS2 novo"
done < <(profiles)

rm -f "$marker"
versions="$(while IFS= read -r name; do [[ -n "$name" ]] && printf '%s: Carmine.Core %s; ' "$name" "$(cat "$HOME_DIR/profiles/$name/carmine-core.version" 2>/dev/null || echo '?')"; done < <(profiles))"
alert "✅ CS2 atualizado para o build $latest e os servidores estão no ar. ${versions}"
log "pronto: build $latest"
