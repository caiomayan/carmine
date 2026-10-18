#!/usr/bin/env bash
# Instala (ou atualiza) os servidores CS2 da Carmine num Ubuntu 24.04 x86_64: SteamCMD, CS2 dedicado,
# Metamod:Source, CounterStrikeSharp, o plugin Carmine.Core, o InventorySimulator, os plugins de
# gameplay e uma instância por perfil de infra/cs2/profiles, cada uma com a sua unidade systemd.
# Equivalente Linux de infra/scripts/install-cs2-server.ps1 (mesmas versões e SHA-256, ver versions.sh).
# Nada aqui é específico de nuvem: serve para a instância AWS do beta e para a VPS definitiva.
#
# Rode como root (sudo), a partir de um clone do repositório:
#
#   sudo ./infra/cs2/linux/install.sh --download-cs2    # primeira vez (baixa ~69 GB)
#   sudo ./infra/cs2/linux/install.sh --steps profiles  # remontar as instâncias
#
# Etapas, sempre nesta ordem e todas idempotentes (rodar de novo atualiza):
#   deps       pacotes do apt (SteamCMD de 32 bits, ICU do .NET, unzip, jq...).
#   user       usuário de sistema sem privilégio `carmine-cs2` e os diretórios em --home.
#   steamcmd   baixa o SteamCMD e liga o steamclient.so que o CS2 procura em ~/.steam/sdk64.
#   cs2        baixa/atualiza o servidor dedicado (app 730, ~69 GB). Só roda com --download-cs2.
#   metamod    instala o Metamod:Source e o registra no gameinfo.gi.
#   css        instala o CounterStrikeSharp (com o runtime .NET).
#   build      compila o Carmine.Core (dotnet publish) neste host; instala o SDK em /opt/dotnet se faltar.
#   profiles   monta uma instância por perfil em <home>/profiles/<perfil> (ver "Instâncias" abaixo).
#   services   instala prestart.sh, as unidades systemd e os arquivos /etc/carmine-cs2/<perfil>.env.
#
# Instâncias: a instalação do CS2 (~69 GB) existe UMA vez, em <home>/server. Cada perfil tem a sua
# árvore em <home>/profiles/<perfil> feita de HARDLINKS dos arquivos do CS2 (dois nomes para os mesmos
# blocos: nada é copiado) e de diretórios de verdade. Só addons/, cfg/ e gameinfo.gi são da instância.
# Hardlink e não symlink porque, no Linux, /proc/self/exe é o caminho resolvido do executável
# e, com symlinks, as duas instâncias acabariam nos addons da instalação base.
# Todo update do CS2 (etapa cs2) pede de novo as etapas metamod e profiles, com os servidores parados.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PROFILES_SRC="$REPO_ROOT/infra/cs2/profiles"
# shellcheck source=versions.sh
source "$SCRIPT_DIR/versions.sh"

HOME_DIR=/srv/carmine-cs2
SERVICE_USER=carmine-cs2
LIB_DIR=/usr/local/lib/carmine-cs2
ETC_DIR=/etc/carmine-cs2
UNIT_DIR=/etc/systemd/system
DOTNET_DIR=/opt/dotnet
API_BASE_URL='https://stcarmine.com/api'
WEB_DISPLAY_URL='stcarmine.com'
PLUGIN_DIR=''
DOWNLOAD_CS2=0
PROFILES=(retake deathmatch)
ALL_STEPS=(deps user steamcmd cs2 metamod css build profiles services)
STEPS=("${ALL_STEPS[@]}")

usage() {
  cat <<'EOF'
Uso: sudo install.sh [opções]
  --download-cs2          baixa/atualiza o CS2 (~69 GB); sem isto a etapa cs2 é pulada
  --steps a,b,c           só estas etapas: deps,user,steamcmd,cs2,metamod,css,build,profiles,services
  --profiles a,b          perfis de infra/cs2/profiles (padrão: retake,deathmatch)
  --home DIR              onde ficam SteamCMD, CS2 e instâncias (padrão: /srv/carmine-cs2)
  --api-base-url URL      API usada nos arquivos de ambiente novos (padrão: https://stcarmine.com/api)
  --web-display-url TEXTO endereço do site que o !ws mostra (padrão: stcarmine.com)
  --plugin-dir DIR        usa um Carmine.Core já compilado em vez de compilar (saída do dotnet publish)
  -h, --help
EOF
}

die() {
  echo "ERRO: $*" >&2
  exit 1
}

step() {
  echo "==> $*"
}

split_csv() {
  local IFS=,
  # shellcheck disable=SC2206  # a divisão por vírgula é o objetivo
  REPLY_ARRAY=($1)
}

while (($#)); do
  case "$1" in
    --download-cs2) DOWNLOAD_CS2=1 ;;
    --steps) split_csv "${2:?--steps pede um valor}"; STEPS=("${REPLY_ARRAY[@]}"); shift ;;
    --profiles) split_csv "${2:?--profiles pede um valor}"; PROFILES=("${REPLY_ARRAY[@]}"); shift ;;
    --home) HOME_DIR="${2:?--home pede um valor}"; shift ;;
    --api-base-url) API_BASE_URL="${2:?--api-base-url pede um valor}"; shift ;;
    --web-display-url) WEB_DISPLAY_URL="${2:?--web-display-url pede um valor}"; shift ;;
    --plugin-dir) PLUGIN_DIR="${2:?--plugin-dir pede um valor}"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) usage >&2; die "opção desconhecida: $1" ;;
  esac
  shift
done

[[ $EUID -eq 0 ]] || die "rode como root (sudo)"
for s in "${STEPS[@]}"; do
  [[ " ${ALL_STEPS[*]} " == *" $s "* ]] || die "etapa desconhecida: $s (válidas: ${ALL_STEPS[*]})"
done
for p in "${PROFILES[@]}"; do
  [[ "$p" =~ ^[a-z0-9-]+$ ]] || die "nome de perfil inválido: $p"
  [[ -f "$PROFILES_SRC/$p/profile.json" ]] || die "perfil '$p' não existe em $PROFILES_SRC"
done

STEAMCMD_DIR="$HOME_DIR/steamcmd"
SERVER_DIR="$HOME_DIR/server"
BASE_GAME="$SERVER_DIR/game"
BASE_CSGO="$BASE_GAME/csgo"
INSTANCES_DIR="$HOME_DIR/profiles"
DOWNLOADS_DIR="$HOME_DIR/downloads"
BUILD_DIR="$HOME_DIR/build"
WORK_DIRS=()

cleanup() {
  local d
  for d in "${WORK_DIRS[@]}"; do
    rm -rf "$d"
  done
}
trap cleanup EXIT

# Cria um diretório temporário (limpo na saída) e o devolve em WORK; não use em $(...): o subshell perderia o registro.
WORK=""
new_work_dir() {
  WORK="$(mktemp -d "${TMPDIR:-/tmp}/carmine-cs2-XXXXXX")"
  WORK_DIRS+=("$WORK")
}

as_service_user() {
  runuser -u "$SERVICE_USER" -- env HOME="$HOME_DIR" "$@"
}

fix_owner() {
  chown -R "$SERVICE_USER:$SERVICE_USER" "$@"
}

assert_game_installed() {
  [[ -f "$BASE_CSGO/gameinfo.gi" ]] || die "CS2 não encontrado em $SERVER_DIR. Rode com --download-cs2 ou ajuste --home."
}

# Baixa uma vez para DOWNLOADS_DIR e confere o SHA-256 (download corrompido ou release trocada param aqui).
fetch_verified() {
  local url="$1" sha="$2" name="$3" file="$DOWNLOADS_DIR/$3"
  mkdir -p "$DOWNLOADS_DIR"
  if [[ ! -f "$file" ]] || ! echo "$sha  $file" | sha256sum --check --status; then
    echo "    baixando $url" >&2
    curl -fsSL --retry 3 --retry-delay 3 -o "$file.part" "$url"
    mv -f "$file.part" "$file"
  fi
  if ! echo "$sha  $file" | sha256sum --check --status; then
    local got
    got="$(sha256sum "$file" | cut -d' ' -f1)"
    rm -f "$file"
    die "SHA-256 de $url não confere (esperado $sha, veio $got)."
  fi
  echo "$file"
}

# O unzip devolve 1 quando só avisa (ex.: zips feitos no Windows com "\" nos nomes, que ele converte).
unzip_to() {
  local rc=0
  unzip -q -o "$1" -d "$2" || rc=$?
  ((rc <= 1)) || die "unzip de $1 falhou (código $rc)"
  # Zips feitos no Windows trazem diretórios sem o bit de acesso (drw-r--r--, visto no alocador de Retake).
  chmod -R u+rwX,go+rX "$2"
}

# ---------------------------------------------------------------------------------------------- deps
step_deps() {
  step "Pacotes do apt"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  # lib32gcc-s1/lib32stdc++6: o SteamCMD é de 32 bits. libicu74: o runtime .NET do CounterStrikeSharp.
  apt-get install -y -qq --no-install-recommends \
    ca-certificates curl unzip tar jq git util-linux libicu74 libssl3t64 zlib1g lib32gcc-s1 lib32stdc++6
}

# ---------------------------------------------------------------------------------------------- user
step_user() {
  step "Usuário $SERVICE_USER e diretórios em $HOME_DIR"
  if ! id "$SERVICE_USER" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "$HOME_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
  fi
  mkdir -p "$HOME_DIR" "$STEAMCMD_DIR" "$SERVER_DIR" "$INSTANCES_DIR" "$DOWNLOADS_DIR"
  chown "$SERVICE_USER:$SERVICE_USER" "$HOME_DIR" "$STEAMCMD_DIR" "$SERVER_DIR" "$INSTANCES_DIR" "$DOWNLOADS_DIR"
  chmod 0755 "$HOME_DIR"
}

# ---------------------------------------------------------------------------------------------- steamcmd
step_steamcmd() {
  step "SteamCMD em $STEAMCMD_DIR"
  id "$SERVICE_USER" >/dev/null 2>&1 || die "usuário $SERVICE_USER não existe (etapa user)"
  if [[ ! -x "$STEAMCMD_DIR/steamcmd.sh" ]]; then
    curl -fsSL --retry 3 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd_linux.tar.gz' |
      tar -xz -C "$STEAMCMD_DIR"
    fix_owner "$STEAMCMD_DIR"
  fi
  # A primeira execução se atualiza sozinha e cria linux64/steamclient.so.
  if [[ ! -e "$STEAMCMD_DIR/linux64/steamclient.so" ]]; then
    as_service_user "$STEAMCMD_DIR/steamcmd.sh" +quit || true
  fi
  [[ -e "$STEAMCMD_DIR/linux64/steamclient.so" ]] || die "o SteamCMD não criou linux64/steamclient.so"
  # O CS2 carrega a biblioteca de ~/.steam/sdk64 (sem ela: "steamclient.so: cannot open shared object file").
  mkdir -p "$HOME_DIR/.steam/sdk64"
  ln -sfn "$STEAMCMD_DIR/linux64/steamclient.so" "$HOME_DIR/.steam/sdk64/steamclient.so"
  fix_owner "$HOME_DIR/.steam"
}

# ---------------------------------------------------------------------------------------------- cs2
step_cs2() {
  if ((!DOWNLOAD_CS2)); then
    step "CS2: pulado (use --download-cs2 para baixar/atualizar os ~69 GB)"
    return
  fi
  step "CS2 dedicado em $SERVER_DIR (app 730)"
  [[ -x "$STEAMCMD_DIR/steamcmd.sh" ]] || die "SteamCMD não encontrado em $STEAMCMD_DIR. Inclua a etapa steamcmd."
  local free_gb
  free_gb="$(df --output=avail -BG "$HOME_DIR" | tail -1 | tr -dc '0-9')"
  if [[ ! -f "$BASE_CSGO/gameinfo.gi" ]] && ((free_gb < 85)); then
    die "só ${free_gb} GB livres em $HOME_DIR; a primeira instalação precisa de ~69 GB e o ideal são 100 GB no disco."
  fi
  # O SteamCMD devolve 7 depois de se atualizar sozinho, mesmo quando tudo deu certo.
  local rc=0
  as_service_user "$STEAMCMD_DIR/steamcmd.sh" +force_install_dir "$SERVER_DIR" +login anonymous +app_update 730 validate +quit || rc=$?
  ((rc == 0 || rc == 7)) || die "SteamCMD terminou com código $rc"
}

# ---------------------------------------------------------------------------------------------- metamod
step_metamod() {
  step "Metamod:Source 2.0 ($METAMOD_BUILD)"
  assert_game_installed
  local tarball
  tarball="$(fetch_verified "$METAMOD_URL" "$METAMOD_SHA256" "$METAMOD_BUILD")"
  new_work_dir
  tar -xzf "$tarball" -C "$WORK"
  cp -a "$WORK/addons" "$BASE_CSGO/"
  fix_owner "$BASE_CSGO/addons"

  # Registra o Metamod como caminho de busca do jogo, logo após a linha do csgo_lv.
  local gameinfo="$BASE_CSGO/gameinfo.gi"
  if grep -q 'csgo/addons/metamod' "$gameinfo"; then
    echo "    gameinfo.gi já registra o Metamod"
    return
  fi
  grep -Eq '^[[:space:]]*Game_LowViolence[[:space:]]+csgo_lv' "$gameinfo" ||
    die "Linha 'Game_LowViolence csgo_lv' não encontrada em $gameinfo; o formato mudou."
  sed -i -E '0,/^([[:space:]]*)Game_LowViolence([[:space:]]+)csgo_lv.*$/ s//&\n\1Game\2csgo\/addons\/metamod/' "$gameinfo"
  grep -q 'csgo/addons/metamod' "$gameinfo" || die "não consegui registrar o Metamod no gameinfo.gi"
  fix_owner "$gameinfo"
  echo "    gameinfo.gi atualizado"
}

# ---------------------------------------------------------------------------------------------- css
step_css() {
  step "CounterStrikeSharp $CSS_VERSION"
  assert_game_installed
  [[ -d "$BASE_CSGO/addons/metamod" ]] || die "Metamod não instalado. Inclua a etapa metamod."
  local zip
  zip="$(fetch_verified "$CSS_URL" "$CSS_SHA256" "counterstrikesharp-with-runtime-linux-$CSS_VERSION.zip")"
  new_work_dir
  unzip_to "$zip" "$WORK"
  cp -a "$WORK/addons" "$BASE_CSGO/"
  fix_owner "$BASE_CSGO/addons"
}

# ---------------------------------------------------------------------------------------------- build
find_dotnet() {
  local candidate
  for candidate in "$DOTNET_DIR/dotnet" "$(command -v dotnet || true)"; do
    if [[ -x "$candidate" ]] && "$candidate" --list-sdks | grep -q "^$DOTNET_SDK_VERSION "; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

step_build() {
  step "Carmine.Core para Linux"
  if [[ -n "$PLUGIN_DIR" ]]; then
    [[ -f "$PLUGIN_DIR/Carmine.Core.dll" ]] || die "$PLUGIN_DIR/Carmine.Core.dll não existe"
    rm -rf "$BUILD_DIR/Carmine.Core"
    mkdir -p "$BUILD_DIR"
    cp -a "$PLUGIN_DIR" "$BUILD_DIR/Carmine.Core"
    echo "    usando o build pronto de $PLUGIN_DIR"
    return
  fi
  local dotnet
  if ! dotnet="$(find_dotnet)"; then
    echo "    instalando o SDK $DOTNET_SDK_VERSION em $DOTNET_DIR"
    new_work_dir
    curl -fsSL --retry 3 -o "$WORK/dotnet-install.sh" https://dot.net/v1/dotnet-install.sh
    bash "$WORK/dotnet-install.sh" --version "$DOTNET_SDK_VERSION" --install-dir "$DOTNET_DIR" --no-path
    dotnet="$DOTNET_DIR/dotnet"
  fi
  # O CounterStrikeSharp carrega as dependências da pasta do plugin: o publish copia todas. O
  # Carmine.Core é IL puro (net10.0), então a saída vale em qualquer SO; compilar aqui só garante
  # que o plugin é do mesmo commit dos perfis. A saída vai para fora da árvore do repositório.
  local out="$BUILD_DIR/Carmine.Core"
  rm -rf "$out"
  mkdir -p "$BUILD_DIR"
  # O NSwag (gera o cliente da API a partir de apps/api/openapi.json) chama "dotnet" pelo PATH.
  PATH="$(dirname "$dotnet"):$PATH" DOTNET_ROOT="$(dirname "$dotnet")" \
    DOTNET_CLI_HOME="$BUILD_DIR/.dotnet" DOTNET_NOLOGO=1 DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    "$dotnet" publish "$REPO_ROOT/plugins/src/Carmine.Core/Carmine.Core.csproj" \
    -c Release -o "$out" --artifacts-path "$BUILD_DIR/artifacts"
  [[ -f "$out/Carmine.Core.dll" ]] || die "o publish não gerou Carmine.Core.dll"
  fix_owner "$BUILD_DIR"
}

# ---------------------------------------------------------------------------------------------- profiles
# Troca o destino por hardlinks novos da origem (um arquivo que o update trocou deixa de ser ocupado em
# dobro) e apaga o que a Valve removeu da origem. Os nomes depois dos dois diretórios ficam como estão.
refresh_links() {
  local src_dir="$1" dst_dir="$2"; shift 2
  local keep=("$@") entry name
  for entry in "$src_dir"/* "$src_dir"/.[!.]*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename "$entry")"
    [[ " ${keep[*]} " == *" $name "* ]] && continue
    rm -rf "${dst_dir:?}/$name"
    cp -al "$entry" "$dst_dir/"
  done
  for entry in "$dst_dir"/* "$dst_dir"/.[!.]*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="$(basename "$entry")"
    [[ " ${keep[*]} " == *" $name "* ]] && continue
    [[ -e "$src_dir/$name" || -L "$src_dir/$name" ]] || rm -rf "$entry"
  done
}

# Instância de um perfil: game/ é uma árvore de hardlinks do CS2 de SERVER_DIR, menos
# game/csgo/{addons,cfg,gameinfo.gi}, que são da instância.
link_farm() {
  local inst_game="$1/game"
  mkdir -p "$inst_game/csgo"
  refresh_links "$BASE_GAME" "$inst_game" csgo
  # logs e backup_rounds nascem na instância e não existem na origem.
  refresh_links "$BASE_CSGO" "$inst_game/csgo" addons cfg gameinfo.gi logs backup_rounds
  cp -f "$BASE_CSGO/gameinfo.gi" "$inst_game/csgo/gameinfo.gi"

  # cfg: os da Valve como base (o perfil sobrescreve o server.cfg).
  mkdir -p "$inst_game/csgo/cfg"
  cp -a "$BASE_CSGO/cfg/." "$inst_game/csgo/cfg/"

  # addons: Metamod e CounterStrikeSharp da origem, sem os plugins, as configs de plugin e os dados;
  # a instância guarda os dela entre execuções (banco do alocador, por exemplo).
  mkdir -p "$inst_game/csgo/addons"
  (cd "$BASE_CSGO/addons" && tar -cf - \
    --exclude=./counterstrikesharp/plugins --exclude=./counterstrikesharp/configs/plugins \
    --exclude=./counterstrikesharp/data .) | tar -xf - -C "$inst_game/csgo/addons"
  rm -rf "$inst_game/csgo/addons/counterstrikesharp/plugins"
  mkdir -p "$inst_game/csgo/addons/counterstrikesharp/plugins"
}

install_gameplay_plugin() {
  local name="$1" game_dir="$2" dep
  for dep in ${GP_DEPENDS[$name]:-}; do
    install_gameplay_plugin "$dep" "$game_dir"
  done
  [[ -n "${GP_URL[$name]:-}" ]] || die "Plugin '$name' não está em versions.sh."
  local zip source destination folder
  zip="$(fetch_verified "${GP_URL[$name]}" "${GP_SHA256[$name]}" "$name-$(basename "${GP_URL[$name]}")")"
  new_work_dir
  unzip_to "$zip" "$WORK"
  case "${GP_EXTRACT[$name]}" in
    csgo) source="$WORK"; destination="$game_dir" ;;
    css) source="$WORK"; destination="$game_dir/addons/counterstrikesharp" ;;
    csgo-nested) source="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d | sort | head -1)"; destination="$game_dir" ;;
    *) die "Extract inválido para $name" ;;
  esac
  mkdir -p "$destination"
  local folders
  if [[ -n "${GP_ONLY[$name]:-}" ]]; then
    read -r -a folders <<<"${GP_ONLY[$name]}"
  else
    mapfile -t folders < <(find "$source" -mindepth 1 -maxdepth 1 -printf "%f
")
  fi
  for folder in "${folders[@]}"; do
    cp -a "$source/$folder" "$destination/"
  done
  echo "    $name ($(basename "$zip"))"

  if [[ "$name" == RetakesAllocator ]]; then
    local gamedata_dir="$game_dir/addons/counterstrikesharp/plugins/RetakesAllocator/gamedata" gamedata
    mkdir -p "$gamedata_dir" "$game_dir/addons/counterstrikesharp/data/RetakesAllocator"
    gamedata="$(fetch_verified "$ALLOCATOR_GAMEDATA_URL" "$ALLOCATOR_GAMEDATA_SHA256" RetakesAllocator_gamedata.json)"
    cp -f "$gamedata" "$gamedata_dir/RetakesAllocator_gamedata.json"
  fi
}

install_invsim() {
  local game_dir="$1" zip
  zip="$(fetch_verified "$INVSIM_URL" "$INVSIM_SHA256" "InventorySimulator-v$INVSIM_VERSION.zip")"
  new_work_dir
  unzip_to "$zip" "$WORK"
  rm -rf "$game_dir/addons/counterstrikesharp/plugins/InventorySimulator"
  # O zip traz addons/counterstrikesharp/plugins/InventorySimulator e o gamedata do plugin.
  cp -a "$WORK/addons" "$game_dir/"
  echo "    InventorySimulator $INVSIM_VERSION"

  # Os convars do plugin só existem depois que ele carrega: o server.cfg (executado a cada mapa) chama o
  # nosso cfg, que o prestart.sh grava a cada início com a chave do servidor.
  local server_cfg="$game_dir/cfg/server.cfg" exec_line='exec carmine/inventory-simulator.cfg'
  touch "$server_cfg"
  if ! grep -qxF "$exec_line" "$server_cfg"; then
    # O server.cfg padrão do CS2 pode terminar sem quebra de linha: garante uma antes do exec.
    [[ ! -s "$server_cfg" || -z "$(tail -c1 "$server_cfg")" ]] || echo >>"$server_cfg"
    echo "$exec_line" >>"$server_cfg"
  fi
}

# Copia os arquivos versionados do perfil (infra/cs2/profiles/<perfil>/csgo) por cima da instância.
# {{csgoDir}} vira o game/csgo da instância, para caminhos absolutos.
copy_profile_files() {
  local source="$1/csgo" game_dir="$2" file relative
  while IFS= read -r -d '' file; do
    relative="${file#"$source"/}"
    mkdir -p "$(dirname "$game_dir/$relative")"
    sed "s|{{csgoDir}}|$game_dir|g" "$file" >"$game_dir/$relative"
  done < <(find "$source" -type f -print0)
  echo "    arquivos do perfil copiados de $source"
}

# O que o systemd precisa saber do perfil para montar a linha de comando (lido pela unidade).
write_profile_env() {
  local spec="$1/profile.json" target="$2/profile.env"
  jq -r '
    "PORT=\(.port)",
    "MAXPLAYERS=\(.maxPlayers)",
    "GAME_TYPE=\(.gameType)",
    "GAME_MODE=\(.gameMode)",
    "START_MAP=\(.startMap)",
    "PUBLIC_SLOTS=\(.publicSlots)",
    "RESERVED_SLOTS=\(.reservedSlots)",
    "INVSIM_FALLBACK_TEAM=\(if .inventorySimulator.fallbackTeam then 1 else 0 end)"
  ' "$spec" >"$target"
}

step_profiles() {
  assert_game_installed
  [[ -d "$BASE_CSGO/addons/counterstrikesharp" ]] || die "CounterStrikeSharp não instalado. Inclua as etapas metamod e css."
  [[ -f "$BUILD_DIR/Carmine.Core/Carmine.Core.dll" ]] || die "Carmine.Core não compilado. Inclua a etapa build."
  local name spec_dir instance game_dir plugin
  for name in "${PROFILES[@]}"; do
    spec_dir="$PROFILES_SRC/$name"
    instance="$INSTANCES_DIR/$name"
    if systemctl is-active --quiet "carmine-cs2@$name.service" 2>/dev/null; then
      die "carmine-cs2@$name está rodando: pare-o (systemctl stop carmine-cs2.target) antes de remontar a instância."
    fi
    step "Perfil $(jq -r .showcaseName "$spec_dir/profile.json") em $instance (porta $(jq -r .port "$spec_dir/profile.json"))"
    mkdir -p "$instance"
    link_farm "$instance"
    game_dir="$instance/game/csgo"
    while IFS= read -r plugin; do
      case "$plugin" in
        Carmine.Core)
          rm -rf "$game_dir/addons/counterstrikesharp/plugins/Carmine.Core"
          mkdir -p "$game_dir/addons/counterstrikesharp/plugins/Carmine.Core"
          cp -a "$BUILD_DIR/Carmine.Core/." "$game_dir/addons/counterstrikesharp/plugins/Carmine.Core/"
          echo "    Carmine.Core"
          ;;
        InventorySimulator) ;; # depois dos arquivos do perfil, abaixo
        *) install_gameplay_plugin "$plugin" "$game_dir" ;;
      esac
    done < <(jq -r '.plugins[]' "$spec_dir/profile.json")
    # Depois dos plugins: os arquivos do perfil (configs, maplist.txt) vão por cima dos do zip.
    copy_profile_files "$spec_dir" "$game_dir"
    if jq -e '.plugins | index("InventorySimulator")' "$spec_dir/profile.json" >/dev/null; then
      install_invsim "$game_dir"
    fi
    write_profile_env "$spec_dir" "$instance"
    fix_owner "$instance"
  done
}

# ---------------------------------------------------------------------------------------------- services
systemctl_offline_aware() {
  # Sem systemd em execução (contêiner de teste, chroot) só mexe nos links em disco.
  if [[ -d /run/systemd/system ]]; then
    systemctl "$@"
  else
    systemctl --root=/ "$@"
  fi
}

step_services() {
  step "Unidades systemd e arquivos de ambiente"
  install -d -m 0755 "$LIB_DIR"
  install -m 0755 "$SCRIPT_DIR/prestart.sh" "$LIB_DIR/prestart.sh"
  install -d -m 0755 "$UNIT_DIR"
  sed -e "s|@HOME@|$HOME_DIR|g" -e "s|@LIBDIR@|$LIB_DIR|g" "$SCRIPT_DIR/carmine-cs2@.service" >"$UNIT_DIR/carmine-cs2@.service"
  install -m 0644 "$SCRIPT_DIR/carmine-cs2.target" "$UNIT_DIR/carmine-cs2.target"
  chmod 0644 "$UNIT_DIR/carmine-cs2@.service"

  # Segredos: o systemd lê como root, então 0600 root basta. Arquivo que já existe nunca é tocado.
  install -d -m 0750 "$ETC_DIR"
  local name env_file
  for name in "${PROFILES[@]}"; do
    env_file="$ETC_DIR/$name.env"
    if [[ -e "$env_file" ]]; then
      echo "    $env_file já existe (mantido)"
      continue
    fi
    (
      umask 077
      sed -e "s|@PROFILE@|$name|g" -e "s|@API_BASE_URL@|$API_BASE_URL|g" -e "s|@WEB_DISPLAY_URL@|$WEB_DISPLAY_URL|g" \
        "$SCRIPT_DIR/profile.env.example" >"$env_file"
    )
    echo "    $env_file criado: preencha CARMINE_API_KEY e CS2_GSLT"
  done

  if command -v systemctl >/dev/null; then
    [[ -d /run/systemd/system ]] && systemctl daemon-reload
    systemctl_offline_aware enable carmine-cs2.target >/dev/null 2>&1
    for name in "${PROFILES[@]}"; do
      systemctl_offline_aware enable "carmine-cs2@$name.service" >/dev/null 2>&1
    done
  else
    echo "    systemctl não encontrado: unidades instaladas, mas não habilitadas"
  fi
}

# ---------------------------------------------------------------------------------------------- main
for s in "${ALL_STEPS[@]}"; do
  if [[ " ${STEPS[*]} " == *" $s "* ]]; then
    "step_$s"
  fi
done

step "Pronto."
cat <<EOF
    Próximos passos (docs/operacao/aws-beta-cs2.md):
      1. Cadastre um Servidor Carmine por perfil na API e ponha a chave + o token GSLT em
         $ETC_DIR/<perfil>.env  (sudoedit; arquivos 0600 root).
      2. sudo systemctl start carmine-cs2.target   (sobe os dois; no boot já sobem sozinhos)
      3. journalctl -u carmine-cs2@retake -f       e procure "Carmine.Core: API no ar"
EOF
