#!/usr/bin/env bash
# Roda antes de cada início do servidor (ExecStartPre da unidade carmine-cs2@<perfil>): grava, a
# partir do arquivo de ambiente /etc/carmine-cs2/<perfil>.env, as configs que levam segredo. Assim a
# chave da API e o token GSLT vivem num lugar só, fora do git, e trocar um deles é editar o arquivo
# e reiniciar (docs/operacao/troca-de-token-gslt.md).
#
# Instalado em <libdir>/prestart.sh pelo install.sh; roda como o usuário do serviço.
# Código de saída 78 (EX_CONFIG) = configuração faltando: a unidade não tenta de novo sozinha.
set -euo pipefail

PROFILE="${1:?uso: prestart.sh <perfil>}"
HOME_DIR="${CARMINE_CS2_HOME:-/srv/carmine-cs2}"
GAME_DIR="$HOME_DIR/profiles/$PROFILE/game/csgo"
CSS_DIR="$GAME_DIR/addons/counterstrikesharp"

fail() {
  echo "carmine-cs2@$PROFILE: $*" >&2
  exit 78
}

[[ -d "$CSS_DIR" ]] || fail "instância não montada em $GAME_DIR (rode install.sh --steps profiles)"

# Valores que vão para JSON e cfg sem escape: só caracteres seguros.
require_match() {
  local name="$1" pattern="$2" value="${!1:-}"
  [[ -n "$value" ]] || fail "$name vazio no arquivo de ambiente /etc/carmine-cs2/$PROFILE.env"
  [[ "$value" =~ $pattern ]] || fail "$name tem caracteres inválidos"
}
require_match CARMINE_API_KEY '^[A-Za-z0-9._~+/=-]+$'
require_match CS2_GSLT '^[A-Za-z0-9]+$'
# A origem do site, sem /api (como o -ApiBaseUrl do install-cs2-server.ps1): o InventorySimulator
# concatena /api/equipped/v5/... e, com /api no fim, pediria /api/api/... (404, sem skins). Arquivos
# de ambiente antigos com /api no fim continuam valendo: a barra e o /api finais são removidos.
CARMINE_API_BASE_URL="${CARMINE_API_BASE_URL:-https://stcarmine.com}"
CARMINE_API_BASE_URL="${CARMINE_API_BASE_URL%/}"
CARMINE_API_BASE_URL="${CARMINE_API_BASE_URL%/api}"
CARMINE_WEB_DISPLAY_URL="${CARMINE_WEB_DISPLAY_URL:-stcarmine.com}"
require_match CARMINE_API_BASE_URL '^https?://[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
require_match CARMINE_WEB_DISPLAY_URL '^[A-Za-z0-9._~:/?#@!$&()*+,;=%-]+$'
# Do profile.env (gerado pelo install.sh a partir do profile.json).
require_match PUBLIC_SLOTS '^[0-9]+$'
require_match INVSIM_FALLBACK_TEAM '^[01]$'
RESERVED_SLOTS="${RESERVED_SLOTS:-}"
[[ "$RESERVED_SLOTS" =~ ^[A-Za-z0-9,_-]*$ ]] || fail "RESERVED_SLOTS tem caracteres inválidos"

umask 077

# Escreve num temporário e renomeia: um crash no meio nunca deixa a config pela metade.
write_atomic() {
  local target="$1" tmp
  tmp="$(mktemp "$target.XXXXXX")"
  cat >"$tmp"
  mv -f "$tmp" "$target"
}

# Carmine.Core: mesmas chaves que a etapa Profiles do install-cs2-server.ps1 grava.
core_dir="$CSS_DIR/configs/plugins/Carmine.Core"
mkdir -p "$core_dir"
write_atomic "$core_dir/Carmine.Core.json" <<EOF
{
  "ApiBaseUrl": "$CARMINE_API_BASE_URL",
  "ApiKey": "$CARMINE_API_KEY",
  "TimeoutSeconds": 5,
  "RetryIntervalSeconds": 15,
  "HeartbeatIntervalSeconds": 10,
  "PublicSlots": $PUBLIC_SLOTS,
  "ReservedSlots": "$RESERVED_SLOTS",
  "ConfigVersion": 1
}
EOF

# InventorySimulator: o server.cfg (executado a cada mapa) chama este cfg. A chave grava o StatTrak.
cfg_dir="$GAME_DIR/cfg/carmine"
mkdir -p "$cfg_dir"
write_atomic "$cfg_dir/inventory-simulator.cfg" <<EOF
// Gerado a cada início por prestart.sh a partir de /etc/carmine-cs2/$PROFILE.env. Não edite.
invsim_url "$CARMINE_API_BASE_URL"
invsim_apikey "$CARMINE_API_KEY"
invsim_ws_enabled 1
invsim_ws_cooldown 30
invsim_ws_immediately 0
invsim_ws_url_print_format "$CARMINE_WEB_DISPLAY_URL"
invsim_wslogin 0
invsim_require_inventory 0
invsim_persist_inventory 0
invsim_fallback_team $INVSIM_FALLBACK_TEAM
invsim_minmodels 0
invsim_spray_enabled 0
invsim_spraychanger_enabled 0
invsim_pet_enabled 0
EOF

# FollowCS2ServerGuidelines=true bloqueia os campos de item do InventorySimulator; desligar é o risco
# de GSLT assumido no ADR 0002. O CounterStrikeSharp só cria o core.json no primeiro boot: partimos
# do exemplo do próprio pacote.
core_json="$CSS_DIR/configs/core.json"
if [[ ! -f "$core_json" ]]; then
  [[ -f "$CSS_DIR/configs/core.example.json" ]] || fail "sem $CSS_DIR/configs/core.example.json (CounterStrikeSharp instalado?)"
  cp "$CSS_DIR/configs/core.example.json" "$core_json"
fi
sed -i -E 's/"FollowCS2ServerGuidelines"[[:space:]]*:[[:space:]]*true/"FollowCS2ServerGuidelines": false/' "$core_json"
# Servidor em português (S16): é o idioma que o CounterStrikeSharp usa para quem não escolheu outro, e
# cada plugin carrega o lang/pt-BR.json dele (os que não trazem, o perfil entrega).
sed -i -E 's/"ServerLanguage"[[:space:]]*:[[:space:]]*"[^"]*"/"ServerLanguage": "pt-BR"/' "$core_json"

echo "carmine-cs2@$PROFILE: configs gravadas (API $CARMINE_API_BASE_URL)"
