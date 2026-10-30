#!/usr/bin/env bash
# Testa, sem rede e sem CS2, o que a release do Carmine.Core e o espelho dos terceiros fazem:
#   - make-manifest.sh gera o manifest.json certo;
#   - install.sh (fetch_verified) cai no espelho quando o oficial some ou entrega outro conteúdo, e recusa quando
#     nenhum dos dois tem o SHA-256 fixado;
#   - versions-check.sh acusa o que mudou, manda ao espelho o que falta e sai com 0/1/2.
# Precisa de bash, jq, curl (com --aws-sigv4), python3 e sha256sum. Rode da raiz do repositório:
#   bash infra/cs2/test/release-and-mirror.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CS2="$REPO/infra/cs2"
T="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T"' EXIT
pass() { echo "ok   - $1"; }
fail() { echo "FALHOU - $1" >&2; exit 1; }

PORT=$((20000 + RANDOM % 20000))
KEY=chave-de-leitura
mkdir -p "$T/official" "$T/s3/bucket"
python3 "$CS2/test/fake-s3.py" "$T/s3" "$PORT" "$KEY" &
python3 -m http.server $((PORT + 1)) --bind 127.0.0.1 --directory "$T/official" >/dev/null 2>&1 &
sleep 1
OFFICIAL="http://127.0.0.1:$((PORT + 1))"
export MIRROR_URL="http://127.0.0.1:$PORT/bucket" MIRROR_ACCESS_KEY_ID="$KEY" MIRROR_SECRET_ACCESS_KEY=segredo MIRROR_REGION=auto
export MIRROR_ENV_FILE=/nonexistent

# --- um versions.sh de mentira ---------------------------------------------------------------------
printf 'plugin um' >"$T/official/um.zip"
printf 'plugin dois' >"$T/official/dois.zip"
SHA_UM="$(sha256sum "$T/official/um.zip" | cut -d' ' -f1)"
SHA_DOIS="$(sha256sum "$T/official/dois.zip" | cut -d' ' -f1)"
cat >"$T/versions.sh" <<VERS
CSS_VERSION='1.0.0'
CSS_URL="$OFFICIAL/um.zip"
CSS_SHA256='$SHA_UM'
METAMOD_BUILD='dois.zip'
METAMOD_URL="$OFFICIAL/dois.zip"
METAMOD_SHA256='$SHA_DOIS'
INVSIM_VERSION='1.0.0'
INVSIM_URL="$OFFICIAL/um.zip"
INVSIM_SHA256='$SHA_UM'
DOTNET_SDK_VERSION='10.0.400'
declare -A GP_URL GP_SHA256
GP_URL[Plugin]="$OFFICIAL/dois.zip"
GP_SHA256[Plugin]='$SHA_DOIS'
ALLOCATOR_GAMEDATA_URL="$OFFICIAL/um.zip"
ALLOCATOR_GAMEDATA_SHA256='$SHA_UM'
DM_SRC_TAG='v1.3.6'
DM_SRC_COMMIT='a309e88e0f635a91b3e8c5576393b7e008b1dd13'
VERS
export VERSIONS_FILE="$T/versions.sh"

# --- manifesto -------------------------------------------------------------------------------------
printf 'zip do plugin' >"$T/carmine-core-9.9.9.zip"
printf '{"openapi":"3.1.0"}' >"$T/openapi.json"
bash "$CS2/release/make-manifest.sh" --version 9.9.9 --commit abc123 --zip "$T/carmine-core-9.9.9.zip" \
  --openapi "$T/openapi.json" --out "$T/manifest.json" >/dev/null
M="$T/manifest.json"
[[ "$(jq -r .version "$M")" == 9.9.9 && "$(jq -r .schema "$M")" == 1 ]] || fail "manifesto: versão e schema"
[[ "$(jq -r .asset.sha256 "$M")" == "$(sha256sum "$T/carmine-core-9.9.9.zip" | cut -d' ' -f1)" ]] || fail "manifesto: sha do zip"
[[ "$(jq -r .apiContractSha256 "$M")" == "$(sha256sum "$T/openapi.json" | cut -d' ' -f1)" ]] || fail "manifesto: sha do openapi"
[[ "$(jq '.thirdParty | length' "$M")" == 5 ]] || fail "manifesto: esperava 5 terceiros, veio $(jq '.thirdParty | length' "$M")"
jq -e '.thirdParty | all(.sha256 | test("^[0-9a-f]{64}$"))' "$M" >/dev/null || fail "manifesto: sha dos terceiros"
if bash "$CS2/release/make-manifest.sh" --version 9.9 --commit x --zip "$T/carmine-core-9.9.9.zip" \
  --openapi "$T/openapi.json" --out "$T/x.json" 2>/dev/null; then
  fail "manifesto: aceitou versão inválida"
fi
pass "manifest.json"
# o Deathmatch patchado (ADR 0028): o zip, o hash de cada DLL e os patches entram no manifesto; sem o zip, não entra
[[ "$(jq 'has("deathmatch")' "$M")" == false ]] || fail "manifesto sem --deathmatch-zip não deveria ter deathmatch"
mkdir -p "$T/dm"
printf 'dll do deathmatch' >"$T/dm/Deathmatch.dll"
printf 'dll da api' >"$T/dm/DeathmatchAPI.dll"
(cd "$T/dm" && zip -qr "$T/carmine-deathmatch-9.9.9.zip" Deathmatch.dll DeathmatchAPI.dll)
bash "$CS2/release/make-manifest.sh" --version 9.9.9 --commit abc123 --zip "$T/carmine-core-9.9.9.zip" \
  --deathmatch-zip "$T/carmine-deathmatch-9.9.9.zip" --openapi "$T/openapi.json" --out "$T/manifest-dm.json" >/dev/null
D="$T/manifest-dm.json"
[[ "$(jq -r .deathmatch.asset.sha256 "$D")" == "$(sha256sum "$T/carmine-deathmatch-9.9.9.zip" | cut -d' ' -f1)" ]] || fail "manifesto: sha do zip do Deathmatch"
[[ "$(jq -r '.deathmatch.files["Deathmatch.dll"]' "$D")" == "$(sha256sum "$T/dm/Deathmatch.dll" | cut -d' ' -f1)" ]] || fail "manifesto: sha da Deathmatch.dll"
[[ "$(jq -r '.deathmatch.files["DeathmatchAPI.dll"]' "$D")" == "$(sha256sum "$T/dm/DeathmatchAPI.dll" | cut -d' ' -f1)" ]] || fail "manifesto: sha da DeathmatchAPI.dll"
[[ "$(jq -r .deathmatch.sourceCommit "$D")" == a309e88e0f635a91b3e8c5576393b7e008b1dd13 && "$(jq -r .deathmatch.sourceTag "$D")" == v1.3.6 ]] || fail "manifesto: tag e commit do fonte"
[[ "$(jq -r '.deathmatch.patches[0].sha256' "$D")" == "$(sha256sum "$CS2"/deathmatch-patch/0001-*.patch | cut -d' ' -f1)" ]] || fail "manifesto: sha do patch"
printf 'sem dll' >"$T/dm/so-uma.txt"
(cd "$T/dm" && zip -qr "$T/incompleto.zip" so-uma.txt)
if bash "$CS2/release/make-manifest.sh" --version 9.9.9 --commit x --zip "$T/carmine-core-9.9.9.zip" --deathmatch-zip "$T/incompleto.zip" \
  --openapi "$T/openapi.json" --out "$T/x.json" >/dev/null 2>&1; then
  fail "manifesto: aceitou um zip do Deathmatch sem as DLLs"
fi
pass "manifesto com o Deathmatch patchado"
# o manifesto com o versions.sh de verdade também sai
VERSIONS_FILE='' bash "$CS2/release/make-manifest.sh" --version 0.0.1 --commit x --zip "$T/carmine-core-9.9.9.zip" \
  --openapi "$T/openapi.json" --out "$T/real.json" >/dev/null
jq -e '.thirdParty | length >= 8' "$T/real.json" >/dev/null || fail "manifesto da árvore real"
pass "manifesto com o versions.sh real"

# --- versions-check --------------------------------------------------------------------------------
# aws de mentira: faz o PUT no s3 de mentira (o awscli de verdade faz o mesmo contra o R2)
mkdir -p "$T/bin"
cat >"$T/bin/aws" <<'AWS'
#!/usr/bin/env bash
# aws s3 cp --only-show-errors --endpoint-url E SRC s3://bucket/chave
args=("$@")
src="${args[-2]}"
dst="${args[-1]}"
endpoint=''
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[i]}" == --endpoint-url ]]; then endpoint="${args[i + 1]}"; fi
done
curl -fsS -T "$src" "$endpoint/${dst#s3://}" >/dev/null
AWS
chmod +x "$T/bin/aws"
export PATH="$T/bin:$PATH"

check() { # check <descrição> <código esperado> <comando...>
  local what="$1" want="$2" rc=0
  shift 2
  "$@" >"$T/out.txt" 2>&1 || rc=$?
  if [[ "$rc" != "$want" ]]; then
    cat "$T/out.txt" >&2
    fail "$what (código $rc, esperado $want)"
  fi
  pass "$what"
}

check "versions-check: oficial confere, espelho vazio recebe as cópias" 0 bash "$CS2/release/versions-check.sh" --report "$T/r.md"
[[ -f "$T/s3/bucket/assets/$SHA_UM" && -f "$T/s3/bucket/assets/$SHA_DOIS" ]] || fail "versions-check: não enviou ao espelho"
grep -q 'enviado agora' "$T/r.md" || fail "versions-check: relatório sem 'enviado agora'"
check "versions-check: segunda vez, espelho em dia" 0 bash "$CS2/release/versions-check.sh"
check "versions-check sem espelho configurado" 0 env MIRROR_URL= bash "$CS2/release/versions-check.sh"

rm "$T/official/dois.zip"
check "versions-check: oficial sumiu mas o espelho tem a cópia (1)" 1 bash "$CS2/release/versions-check.sh" --report "$T/r.md"
grep -q 'o espelho cobre' "$T/r.md" || fail "relatório sem 'o espelho cobre'"
printf 'conteúdo trocado' >"$T/official/dois.zip"
check "versions-check: oficial entrega outro conteúdo, espelho cobre (1)" 1 bash "$CS2/release/versions-check.sh"

rm "$T/s3/bucket/assets/$SHA_DOIS"
check "versions-check: sem cópia em lugar nenhum (2)" 2 bash "$CS2/release/versions-check.sh" --report "$T/r.md"
grep -q 'sem cópia com o SHA fixado' "$T/r.md" || fail "relatório sem o aviso grave"

# --- install.sh: fetch_verified (a função é extraída do install.sh de verdade) ----------------------
{
  echo 'set -euo pipefail'
  echo 'die() { echo "ERRO: $*" >&2; exit 1; }'
  echo "source '$CS2/linux/lib-assets.sh'"
  sed -n '/^fetch_verified() {/,/^}/p' "$CS2/linux/install.sh"
} >"$T/fetch.sh"
fetch() { # fetch <url> <sha> <nome>
  DOWNLOADS_DIR="$T/dl" bash -c "source '$T/fetch.sh'; fetch_verified '$1' '$2' '$3'"
}
printf 'plugin dois' >"$T/official/dois.zip"
cp "$T/official/dois.zip" "$T/s3/bucket/assets/$SHA_DOIS"
rm -rf "$T/dl"
check "install: oficial confere" 0 fetch "$OFFICIAL/dois.zip" "$SHA_DOIS" dois.zip
rm -rf "$T/dl"
check "install: oficial 404, cai no espelho" 0 fetch "$OFFICIAL/nao-existe.zip" "$SHA_DOIS" dois.zip
[[ "$(sha256sum "$T/dl/dois.zip" | cut -d' ' -f1)" == "$SHA_DOIS" ]] || fail "install: arquivo do espelho com SHA errado"
rm -rf "$T/dl"
printf 'trocado' >"$T/official/dois.zip"
check "install: oficial com outro conteúdo, cai no espelho" 0 fetch "$OFFICIAL/dois.zip" "$SHA_DOIS" dois.zip
[[ "$(sha256sum "$T/dl/dois.zip" | cut -d' ' -f1)" == "$SHA_DOIS" ]] || fail "install: o arquivo ruim ficou"
rm -rf "$T/dl"
check "install: nem o oficial nem o espelho têm o SHA: recusa" 1 fetch "$OFFICIAL/dois.zip" "$(printf '%064d' 7)" dois.zip
[[ ! -f "$T/dl/dois.zip" ]] || fail "install: deixou arquivo inválido em downloads/"
rm -rf "$T/dl"
fetch_sem_espelho() { MIRROR_URL='' fetch "$@"; }
check "install: sem espelho configurado e oficial ruim: recusa" 1 fetch_sem_espelho "$OFFICIAL/nao-existe.zip" "$SHA_DOIS" dois.zip

echo "### TUDO CERTO"
