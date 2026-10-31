#!/usr/bin/env bash
# Compila o Deathmatch (NockyCZ/CS2-Deathmatch, MIT) pinado em versions.sh com os patches do Carmine
# (ADR 0028): get/set de preferência por jogador e o evento de mudança, para as Preferências de jogo
# viverem na Conta. Não é um repositório divergente: baixa o fonte da tag pinada, confere o commit, aplica
# os patches desta pasta e compila. Subir de versão é trocar a tag e o commit em versions.sh e rodar de novo.
#
# Uso:  build.sh --out <dir> [--work <dir>] [--no-build]
#   --out       onde ficam Deathmatch.dll e DeathmatchAPI.dll patchados (obrigatório sem --no-build)
#   --work      onde clonar o fonte (padrão: um diretório temporário, apagado ao sair)
#   --no-build  só baixa, confere o commit e aplica os patches (o teste que roda sem o SDK do .NET)
# Variáveis: DOTNET (padrão: dotnet no PATH); DM_PATCH_DIR (padrão: esta pasta; os testes apontam para uma pasta com um patch quebrado).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../linux/versions.sh
source "$HERE/../linux/versions.sh"

OUT=""
WORK=""
BUILD=1
while (($#)); do
  case "$1" in
    --out) OUT="${2:?--out pede um diretório}"; shift 2 ;;
    --work) WORK="${2:?--work pede um diretório}"; shift 2 ;;
    --no-build) BUILD=0; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 64 ;;
  esac
done
if ((BUILD)) && [[ -z "$OUT" ]]; then
  echo "faltou --out <dir> (ou use --no-build)" >&2
  exit 64
fi

# A versão do zip que o perfil instala e a do fonte patchado têm de ser a mesma: trocar uma sem a outra quebra aqui.
if [[ "${GP_URL[Deathmatch]}" != *"/$DM_SRC_TAG/"* ]]; then
  echo "GP_URL[Deathmatch] (${GP_URL[Deathmatch]}) não é da tag $DM_SRC_TAG de DM_SRC_TAG; atualize os dois juntos em versions.sh." >&2
  exit 1
fi

cleanup=""
if [[ -z "$WORK" ]]; then
  WORK="$(mktemp -d)"
  cleanup="$WORK"
fi
trap '[[ -z "$cleanup" ]] || rm -rf "$cleanup"' EXIT

SRC="$WORK/src"
if [[ ! -d "$SRC/.git" ]]; then
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "$DM_SRC_TAG" "$DM_SRC_REPO" "$SRC"
fi
actual="$(git -C "$SRC" rev-parse HEAD)"
if [[ "$actual" != "$DM_SRC_COMMIT" ]]; then
  echo "A tag $DM_SRC_TAG aponta para $actual, e versions.sh espera $DM_SRC_COMMIT (a tag foi movida?)." >&2
  exit 1
fi

shopt -s nullglob
PATCH_DIR="${DM_PATCH_DIR:-$HERE}"
patches=("$PATCH_DIR"/*.patch)
((${#patches[@]})) || { echo "nenhum .patch em $PATCH_DIR" >&2; exit 1; }
for patch in "${patches[@]}"; do
  # O fonte do plugin usa CRLF e o patch guarda os CR: --ignore-whitespace tolera um checkout que converta.
  if ! git -C "$SRC" apply --ignore-whitespace "$patch"; then
    echo "O patch $(basename "$patch") não aplica na tag $DM_SRC_TAG: refaça o patch sobre a versão pinada (infra/cs2/deathmatch-patch/README.md)." >&2
    exit 1
  fi
  echo "patch aplicado: $(basename "$patch")"
done

if ((!BUILD)); then
  echo "ok: ${#patches[@]} patch(es) aplicam na tag $DM_SRC_TAG ($DM_SRC_COMMIT)"
  exit 0
fi

DOTNET="${DOTNET:-dotnet}"
mkdir -p "$OUT"
# O plugin e a API (a biblioteca compartilhada que os outros plugins referenciam) são projetos separados no fonte.
"$DOTNET" publish "$SRC/source/Deathmatch/Deathmatch.csproj" -c Release -o "$WORK/publish" --nologo -v q
"$DOTNET" publish "$SRC/source/DeathmatchAPI/DeathmatchAPI.csproj" -c Release -o "$WORK/publish-api" --nologo -v q
[[ -f "$WORK/publish/Deathmatch.dll" ]] || { echo "o publish não gerou Deathmatch.dll" >&2; exit 1; }
[[ -f "$WORK/publish-api/DeathmatchAPI.dll" ]] || { echo "o publish não gerou DeathmatchAPI.dll" >&2; exit 1; }
cp -f "$WORK/publish/Deathmatch.dll" "$OUT/Deathmatch.dll"
cp -f "$WORK/publish-api/DeathmatchAPI.dll" "$OUT/DeathmatchAPI.dll"
echo "ok: $OUT/Deathmatch.dll e $OUT/DeathmatchAPI.dll (tag $DM_SRC_TAG + $(basename -a "${patches[@]}" | tr '\n' ' '))"
