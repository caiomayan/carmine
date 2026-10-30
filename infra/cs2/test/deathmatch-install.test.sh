#!/usr/bin/env bash
# Testa, sem CS2 nem rede, o que o install.sh faz com o Deathmatch patchado da release (ADR 0028): troca o
# Deathmatch.dll e o DeathmatchAPI.dll do zip oficial pelos da release, recusa uma release feita com outro commit do
# plugin e, sem release (ou numa release que não traz o Deathmatch), só avisa. O host nunca compila nada.
# Precisa de bash e jq. Da raiz do repositório: bash infra/cs2/test/deathmatch-install.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
INSTALL="$REPO/infra/cs2/linux/install.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
pass() { echo "ok   - $1"; }
fail() { echo "FALHOU - $1" >&2; exit 1; }

# shellcheck source=../linux/versions.sh
source "$REPO/infra/cs2/linux/versions.sh"
die() { echo "$*" >&2; exit 1; }
log() { echo "$*"; }
# shellcheck source=../linux/lib-release.sh
source "$REPO/infra/cs2/linux/lib-release.sh"
# A função de verdade, tirada do install.sh (que só roda inteiro como root, num host).
# shellcheck disable=SC1090
source <(awk '/^install_patched_deathmatch\(\) \{/,/^\}/' "$INSTALL")
declare -F install_patched_deathmatch >/dev/null || fail "não achei install_patched_deathmatch no install.sh"

HOME_DIR="$T/home"
export HOME_DIR
mkdir -p "$HOME_DIR/releases"

new_game() { # new_game <nome>: um game/csgo com as DLLs do zip oficial
  local g="$T/game-$1"
  mkdir -p "$g/addons/counterstrikesharp/plugins/Deathmatch" "$g/addons/counterstrikesharp/shared/DeathmatchAPI"
  printf 'oficial' >"$g/addons/counterstrikesharp/plugins/Deathmatch/Deathmatch.dll"
  printf 'oficial-api' >"$g/addons/counterstrikesharp/shared/DeathmatchAPI/DeathmatchAPI.dll"
  echo "$g"
}
make_release() { # make_release <versão> <commit do fonte> [sem-deathmatch]
  local commit="$2" dir="$HOME_DIR/releases/core-$1"
  mkdir -p "$dir/plugin"
  jq -n --arg c "$commit" '{version: "x", deathmatch: {sourceTag: "v1.3.6", sourceCommit: $c}}' >"$dir/manifest.json"
  if [[ "${3:-}" != sem-deathmatch ]]; then
    mkdir -p "$dir/deathmatch"
    printf 'patchada' >"$dir/deathmatch/Deathmatch.dll"
    printf 'patchada-api' >"$dir/deathmatch/DeathmatchAPI.dll"
  fi
}
dll() { cat "$1/addons/counterstrikesharp/plugins/Deathmatch/Deathmatch.dll"; }
api() { cat "$1/addons/counterstrikesharp/shared/DeathmatchAPI/DeathmatchAPI.dll"; }

# 1. Release com o Deathmatch e o mesmo commit do plugin: as duas DLLs são trocadas.
make_release 1.0.0 "$DM_SRC_COMMIT"
echo 1.0.0 >"$HOME_DIR/releases/installed"
g="$(new_game ok)"
out="$(install_patched_deathmatch "$g" 2>&1)"
[[ "$(dll "$g")" == patchada && "$(api "$g")" == patchada-api ]] || fail "as DLLs não foram trocadas pelas da release"
[[ "$out" == *"Deathmatch patchado"* ]] || fail "faltou a linha de confirmação"
pass "release com o Deathmatch patchado: as duas DLLs são trocadas pelas conferidas"

# 2. Release feita com outro commit do plugin: recusa e não toca nas DLLs.
make_release 1.1.0 0000000000000000000000000000000000000000
echo 1.1.0 >"$HOME_DIR/releases/installed"
g="$(new_game outro-commit)"
rc=0
out="$( (install_patched_deathmatch "$g") 2>&1)" || rc=$?
[[ "$rc" -eq 1 && "$out" == *"outro commit"* ]] || fail "deveria recusar uma release de outro commit do plugin (rc=$rc, saída: $out)"
[[ "$(dll "$g")" == oficial && "$(api "$g")" == oficial-api ]] || fail "recusou mas tocou nas DLLs"
pass "release feita com outro commit do plugin: recusada, DLLs intactas"

# 3. Release antiga, sem o Deathmatch: só avisa e segue.
make_release 0.9.0 "$DM_SRC_COMMIT" sem-deathmatch
echo 0.9.0 >"$HOME_DIR/releases/installed"
g="$(new_game antiga)"
out="$(install_patched_deathmatch "$g" 2>&1)"
[[ "$out" == *"AVISO"* && "$out" == *"não seguem a Conta"* ]] || fail "faltou o aviso para a release sem o Deathmatch"
[[ "$(dll "$g")" == oficial ]] || fail "release sem o Deathmatch mexeu nas DLLs"
pass "release sem o Deathmatch: só avisa, o servidor segue com o plugin oficial"

# 4. Sem release instalada (instalação com --plugin-dir ou compilada no host): só avisa.
rm -f "$HOME_DIR/releases/installed"
g="$(new_game sem-release)"
out="$(install_patched_deathmatch "$g" 2>&1)"
[[ "$out" == *"AVISO"* ]] || fail "faltou o aviso sem release instalada"
[[ "$(dll "$g")" == oficial ]] || fail "sem release mexeu nas DLLs"
pass "sem release instalada: só avisa, nada é compilado nem trocado"

# 5. O install.sh não compila o Deathmatch (o SDK do .NET não é pré-requisito do servidor para isto).
if awk '/^install_patched_deathmatch\(\) \{/,/^\}/' "$INSTALL" | grep -Eq 'dotnet|build\.sh|git clone'; then
  fail "install_patched_deathmatch voltou a compilar no host"
fi
pass "install_patched_deathmatch não chama dotnet, build.sh nem git clone"

echo "### TUDO CERTO"
