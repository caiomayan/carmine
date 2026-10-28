#!/usr/bin/env bash
# Gera o manifest.json de uma release do Carmine.Core (workflow release-plugin.yml): a versão, o commit, o
# zip com o SHA-256, com o que foi compilado e os terceiros com SHA fixo (versions.sh) que os servidores
# precisam. O carmine-plugin-deploy e o install.sh leem este arquivo; o schema muda só com o número `schema`.
#
#   make-manifest.sh --version 0.11.0 --commit <sha> --zip carmine-core-0.11.0.zip --openapi apps/api/openapi.json --out manifest.json
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION='' COMMIT='' ZIP='' OPENAPI='' OUT=''
while (($#)); do
  case "$1" in
    --version) VERSION="${2:?}"; shift 2 ;;
    --commit) COMMIT="${2:?}"; shift 2 ;;
    --zip) ZIP="${2:?}"; shift 2 ;;
    --openapi) OPENAPI="${2:?}"; shift 2 ;;
    --out) OUT="${2:?}"; shift 2 ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done
for v in VERSION COMMIT ZIP OPENAPI OUT; do
  [[ -n "${!v}" ]] || { echo "falta --${v,,}" >&2; exit 2; }
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "versão inválida: $VERSION" >&2; exit 2; }
[[ -f "$ZIP" && -f "$OPENAPI" ]] || { echo "zip ou openapi não existe" >&2; exit 2; }

# shellcheck source=../linux/versions.sh
source "${VERSIONS_FILE:-$HERE/../linux/versions.sh}"
# shellcheck source=../linux/lib-assets.sh
source "$HERE/../linux/lib-assets.sh"

third_party="$(versions_assets | jq -R -s '
  split("\n") | map(select(length > 0) | split("\t")
    | {name: .[0], version: .[1], url: .[2], sha256: .[3], file: .[4]})')"

jq -n \
  --arg version "$VERSION" --arg commit "$COMMIT" \
  --arg zipName "$(basename "$ZIP")" --arg zipSha "$(sha256sum "$ZIP" | cut -d' ' -f1)" \
  --arg openapiSha "$(sha256sum "$OPENAPI" | cut -d' ' -f1)" \
  --arg css "$CSS_VERSION" --arg dotnet "$DOTNET_SDK_VERSION" \
  --argjson thirdParty "$third_party" '
  {
    schema: 1,
    name: "Carmine.Core",
    version: $version,
    commit: $commit,
    asset: {name: $zipName, sha256: $zipSha},
    builtWith: {counterStrikeSharp: $css, dotnetSdk: $dotnet},
    apiContractSha256: $openapiSha,
    thirdParty: $thirdParty
  }' >"$OUT"
echo "manifesto em $OUT"
