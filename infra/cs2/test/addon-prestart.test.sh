#!/usr/bin/env bash
# Testa, sem Docker nem CS2, o que o prestart.sh faz com o addon do Workshop (S19): o ID do item, a chave de
# emergência e a regra de que só os perfis com "addon": true (os servidores abertos) o usam, nunca as Salas.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
PRESTART="$REPO/infra/cs2/linux/prestart.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fails=0
check() { # check <descrição> <comando...>
  local description="$1"
  shift
  if "$@"; then
    echo "ok   $description"
  else
    echo "FALHOU $description"
    fails=$((fails + 1))
  fi
}
contains() { grep -qF -- "$2" "$1"; }
lacks() { ! grep -qF -- "$2" "$1"; }

# Monta uma instância mínima (o prestart só exige o diretório do CounterStrikeSharp e o core.example.json).
new_home() { # new_home <perfil> -> imprime o HOME
  local home="$TMP/home-$1-$RANDOM"
  local css="$home/profiles/$1/game/csgo/addons/counterstrikesharp"
  mkdir -p "$css/configs"
  printf '{ "FollowCS2ServerGuidelines": true, "ServerLanguage": "en" }\n' >"$css/configs/core.example.json"
  echo "$home"
}

run_prestart() { # run_prestart <home> <perfil> [VAR=valor...]
  local home="$1" profile="$2"
  shift 2
  env -i PATH="$PATH" CARMINE_CS2_HOME="$home" CARMINE_API_KEY=chave-do-teste CS2_GSLT=ABCDEF0123456789 \
    PUBLIC_SLOTS=9 INVSIM_FALLBACK_TEAM=0 RESERVED_SLOTS=retake "$@" bash "$PRESTART" "$profile" >/dev/null
}

core_json() { echo "$1/profiles/$2/game/csgo/addons/counterstrikesharp/configs/plugins/Carmine.Core/Carmine.Core.json"; }
mm_cfg() { echo "$1/profiles/$2/game/csgo/cfg/multiaddonmanager/multiaddonmanager.cfg"; }

# 1. Servidor aberto, addon ainda não publicado (sem ID): nada muda.
home="$(new_home retake)"
run_prestart "$home" retake ADDON=1
check "sem ID do item: o card fica desligado" contains "$(core_json "$home" retake)" '"AddonEnabled": false'
check "sem ID do item: nenhum addon é exigido" contains "$(mm_cfg "$home" retake)" 'mm_extra_addons ""'

# 2. Servidor aberto com o item publicado: card ligado e o item exigido.
home="$(new_home retake)"
run_prestart "$home" retake ADDON=1 CARMINE_ADDON_WORKSHOP_ID=3789924061
check "com ID do item: o card liga" contains "$(core_json "$home" retake)" '"AddonEnabled": true'
check "com ID do item: o addon é exigido" contains "$(mm_cfg "$home" retake)" 'mm_extra_addons "3789924061"'
check "o cache do Steam evita baixar de novo" contains "$(mm_cfg "$home" retake)" 'mm_cache_clients_with_addons 1'
check "quem recusa o download é solto em 30 s" contains "$(mm_cfg "$home" retake)" 'mm_addon_connection_timeout 30'

# 3. Chave de emergência: desliga a exigência e o card, sem novo release.
home="$(new_home retake)"
run_prestart "$home" retake ADDON=1 CARMINE_ADDON_WORKSHOP_ID=3789924061 CARMINE_ADDON_ENABLED=0
check "chave de emergência: o card desliga" contains "$(core_json "$home" retake)" '"AddonEnabled": false'
check "chave de emergência: o addon deixa de ser exigido" contains "$(mm_cfg "$home" retake)" 'mm_extra_addons ""'

# 4. Perfil sem "addon": true (as Salas privadas): nunca usa addon, mesmo com o ID no ambiente.
home="$(new_home sala)"
run_prestart "$home" sala ADDON=0 CARMINE_ADDON_WORKSHOP_ID=3789924061
check "perfil sem addon: o card fica desligado" contains "$(core_json "$home" sala)" '"AddonEnabled": false'
check "perfil sem addon: nenhum cfg do MultiAddonManager" test ! -e "$(mm_cfg "$home" sala)"

# 5. Sem a variável ADDON (perfis antigos): também desligado.
home="$(new_home retake)"
run_prestart "$home" retake CARMINE_ADDON_WORKSHOP_ID=3789924061
check "sem ADDON no ambiente: o card fica desligado" contains "$(core_json "$home" retake)" '"AddonEnabled": false'

# 6. Valores inválidos recusam o início (código 78), sem gravar configuração pela metade.
home="$(new_home retake)"
rc=0
run_prestart "$home" retake ADDON=1 CARMINE_ADDON_WORKSHOP_ID='3789;rm' 2>/dev/null || rc=$?
check "ID do item com caracteres inválidos: código 78" test "$rc" -eq 78
rc=0
run_prestart "$home" retake ADDON=1 CARMINE_ADDON_ENABLED=talvez 2>/dev/null || rc=$?
check "chave de emergência inválida: código 78" test "$rc" -eq 78

# 7. Os dois servidores abertos do repositório têm "addon": true (os de Salas, quando existirem, não terão).
for profile in retake deathmatch; do
  check "o perfil $profile é aberto (addon: true)" node -e '
    const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    process.exit(p.addon === true ? 0 : 1);
  ' "$REPO/infra/cs2/profiles/$profile/profile.json"
done

if ((fails > 0)); then
  echo "$fails verificação(ões) falharam."
  exit 1
fi
echo "Addon no prestart: tudo certo."
