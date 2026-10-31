#!/usr/bin/env bash
# O Deathmatch patchado (ADR 0028) sem o SDK do .NET: o fonte da tag pinada baixa, o commit confere e os patches
# aplicam. Quebra se alguém sobe a versão do zip sem refazer o patch, se a tag for movida ou se o patch deixar de
# aplicar. A compilação em si roda no job dotnet da CI (build.sh --out).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
BUILD="$REPO/infra/cs2/deathmatch-patch/build.sh"
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

has() { [[ "$1" == *"$2"* ]]; }

# 1. O patch aplica na tag pinada, e o fonte resultante tem a API nova.
check "o patch aplica na tag pinada com o commit conferido" bash "$BUILD" --no-build --work "$TMP/work"
src="$TMP/work/src/source"
check "IDeathmatchAPI ganhou GetPlayerPreference e SetPlayerPreference" \
  grep -q 'GetPlayerPreference' "$src/DeathmatchAPI/DeathmatchAPI.cs"
check "a API ganhou o evento OnPlayerPreferenceChanged" \
  grep -q 'OnPlayerPreferenceChanged' "$src/DeathmatchAPI/Events.cs"
check "o menu e os atalhos avisam a mudança (boolean e texto)" \
  test "$(grep -c 'OnPlayerPreferenceChanged' "$src/Deathmatch/Functions/Players.cs")" -eq 2

# 2. Um patch que não aplica quebra o build com a mensagem de como refazer (e com código diferente de zero).
mkdir -p "$TMP/quebrado"
cat >"$TMP/quebrado/9999-quebrado.patch" <<'EOF'
diff --git a/source/Deathmatch/API.cs b/source/Deathmatch/API.cs
--- a/source/Deathmatch/API.cs
+++ b/source/Deathmatch/API.cs
@@ -1,3 +1,3 @@
-esta linha não existe no fonte do plugin
+nem esta
EOF
rc=0
out="$(DM_PATCH_DIR="$TMP/quebrado" bash "$BUILD" --no-build --work "$TMP/work2" 2>&1)" || rc=$?
check "um patch que não aplica quebra o build (código 1)" test "$rc" -eq 1
check "a mensagem diz que o patch não aplica na tag" has "$out" "não aplica na tag"
check "a mensagem diz onde está o passo a passo para refazê-lo" has "$out" "README.md"

# 3. A versão do zip e a do fonte patchado andam juntas: trocar uma sem a outra quebra.
cp -r "$REPO/infra/cs2/linux" "$TMP/linux-copy"
sed -i "s#^DM_SRC_TAG=.*#DM_SRC_TAG='v0.0.0'#" "$TMP/linux-copy/versions.sh"
mkdir -p "$TMP/dp"
cp "$BUILD" "$TMP/dp/build.sh"
cp "$REPO"/infra/cs2/deathmatch-patch/*.patch "$TMP/dp/"
mkdir -p "$TMP/linux"
cp "$TMP/linux-copy/versions.sh" "$TMP/linux/versions.sh"
rc=0
bash "$TMP/dp/build.sh" --no-build --work "$TMP/work3" >/dev/null 2>&1 || rc=$?
check "versão do zip diferente da do fonte: o build recusa" test "$rc" -ne 0

if ((fails > 0)); then
  echo "$fails verificação(ões) falharam."
  exit 1
fi
echo "Deathmatch patchado: tudo certo."
