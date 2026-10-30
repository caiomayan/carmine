#!/usr/bin/env bash
# Gera o manifest.json de uma release do Carmine.Core (workflow release-plugin.yml): a versão, o commit, o
# zip com o SHA-256, com o que foi compilado e os terceiros com SHA fixo (versions.sh) que os servidores
# precisam. O carmine-plugin-deploy e o install.sh leem este arquivo; o schema muda só com o número `schema`.
#
#   make-manifest.sh --version 0.11.0 --commit <sha> --zip carmine-core-0.11.0.zip --openapi apps/api/openapi.json --out manifest.json \
#     [--deathmatch-zip carmine-deathmatch-0.11.0.zip]
#
# O --deathmatch-zip (ADR 0028) é o Deathmatch patchado que a CI compilou: o host só troca as DLLs do zip oficial por
# estas, conferidas pelo hash do manifesto. O manifesto registra de qual tag e commit do plugin ele saiu.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION='' COMMIT='' ZIP='' OPENAPI='' OUT='' DM_ZIP=''
while (($#)); do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --commit) COMMIT="${2:?}"; shift 2 ;;
    --zip) ZIP="${2:?}"; shift 2 ;;
    --openapi) OPENAPI="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    --deathmatch-zip) DM_ZIP="${2:?}"; shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done
for v in VERSION COMMIT ZIP OPENAPI OUT; do
  [[ -n "${!v}" ]] || { echo "falta --${v,,}" >&2; exit 2; }
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "versão inválida: $VERSION" >&2; exit 2; }
[[ -f "$ZIP" && -f "$OPENAPI" ]] || { echo "zip ou openapi não existe" >&2; exit 2; }
[[ -z "$DM_ZIP" || -f "$DM_ZIP" ]] || { echo "o zip do Deathmatch não existe: $DM_ZIP" >&2; exit 2; }

# shellcheck source=../linux/versions.sh
source "${VERSIONS_FILE:-$HERE/../linux/versions.sh}"
# shellcheck source=../linux/lib-assets.sh
source "$HERE/../linux/lib-assets.sh"

third_party="$(versions_assets | jq -R -s '
  split("\n") | map(select(length > 0) | split("\t")
    | {name: .[0], version: .[1], url: .[2], sha256: .[3], file: .[4]})')"

# O Deathmatch patchado (opcional): o zip e o hash de cada DLL de dentro, para o install.sh conferir de novo.
deathmatch=null
if [[ -n "$DM_ZIP" ]]; then
  dm_tmp="$(mktemp -d)"
  unzip -q -o "$DM_ZIP" -d "$dm_tmp"
  [[ -f "$dm_tmp/Deathmatch.dll" && -f "$dm_tmp/DeathmatchAPI.dll" ]] || { echo "o zip do Deathmatch não traz as duas DLLs" >&2; rm -rf "$dm_tmp"; exit 2; }
  deathmatch="$(jq -n \
    --arg zipName "$(basename "$DM_ZIP")" --arg zipSha "$(sha256sum "$DM_ZIP" | cut -d' ' -f1)" \
    --arg tag "$DM_SRC_TAG" --arg commit "$DM_SRC_COMMIT" \
    --arg dll "$(sha256sum "$dm_tmp/Deathmatch.dll" | cut -d' ' -f1)" \
    --arg api "$(sha256sum "$dm_tmp/DeathmatchAPI.dll" | cut -d' ' -f1)" \
    --argjson patches "$(for p in "$HERE"/../deathmatch-patch/*.patch; do printf '%s\t%s\n' "$(basename "$p")" "$(sha256sum "$p" | cut -d' ' -f1)"; done | jq -R -s 'split("\n") | map(select(length > 0) | split("\t") | {name: .[0], sha256: .[1]})')" '
    {
      asset: {name: $zipName, sha256: $zipSha},
      sourceTag: $tag, sourceCommit: $commit,
      files: {"Deathmatch.dll": $dll, "DeathmatchAPI.dll": $api},
      patches: $patches
    }')"
  rm -rf "$dm_tmp"
fi

jq -n \
  --arg version "$VERSION" --arg commit "$COMMIT" \
  --arg zipName "$(basename "$ZIP")" --arg zipSha "$(sha256sum "$ZIP" | cut -d' ' -f1)" \
  --arg openapiSha "$(sha256sum "$OPENAPI" | cut -d' ' -f1)" \
  --arg css "$CSS_VERSION" --arg dotnet "$DOTNET_SDK_VERSION" \
  --argjson thirdParty "$third_party" --argjson deathmatch "$deathmatch" '
  {
    schema: 1,
    name: "Carmine.Core",
    version: $version,
    commit: $commit,
    asset: {name: $zipName, sha256: $zipSha},
    builtWith: {counterStrikeSharp: $css, dotnetSdk: $dotnet},
    apiContractSha256: $openapiSha,
    thirdParty: $thirdParty
  } + (if $deathmatch == null then {} else {deathmatch: $deathmatch} end)' >"$OUT"
echo "manifesto em $OUT"
