#!/usr/bin/env bash
# Confere os terceiros de infra/cs2/linux/versions.sh: cada URL oficial ainda entrega exatamente o SHA-256
# fixado? E, havendo espelho configurado (lib-assets.sh), manda a cópia que falta. Roda toda semana e a cada
# mudança no versions.sh (workflow versions-check.yml). Escreve um relatório em markdown e sai com:
#   0  tudo certo (oficial confere; espelho em dia, ou sem espelho configurado)
#   1  algo mudou ou sumiu no oficial, mas o espelho tem a cópia certa (instalar ainda funciona)
#   2  algum terceiro não existe em lugar nenhum com o SHA fixado: a instalação do zero quebra
#
#   versions-check.sh [--report relatorio.md] [--no-upload]
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT=''
UPLOAD=1
while (($#)); do
  case "$1" in
    --report) REPORT="${2:?}"; shift 2 ;;
    --no-upload) UPLOAD=0; shift ;;
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
done

# shellcheck source=../linux/versions.sh
source "${VERSIONS_FILE:-$HERE/../linux/versions.sh}"
# shellcheck source=../linux/lib-assets.sh
source "$HERE/../linux/lib-assets.sh"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
has_mirror=0
mirror_configured && has_mirror=1

lines=()
worst=0
bump() { ((worst >= $1)) || worst=$1; }

while IFS=$'\t' read -r name version url sha file; do
  official=bad
  detail=''
  if curl -fsSL --retry 3 --retry-delay 3 -o "$WORK/$file" "$url" 2>"$WORK/err"; then
    got="$(sha256sum "$WORK/$file" | cut -d' ' -f1)"
    if [[ "$got" == "$sha" ]]; then
      official=ok
    else
      detail="o oficial agora entrega outro conteúdo (SHA-256 $got)"
    fi
  else
    detail="o oficial não respondeu ($(tr '\n' ' ' <"$WORK/err" | cut -c1-120))"
  fi

  mirror='sem espelho'
  if ((has_mirror)); then
    if mirror_has "$sha"; then
      mirror=ok
    elif [[ "$official" == ok && "$UPLOAD" == 1 ]]; then
      if mirror_put "$sha" "$WORK/$file"; then mirror='enviado agora'; else mirror='FALHOU ao enviar'; bump 1; fi
    else
      mirror=ausente
    fi
  fi

  if [[ "$official" == ok ]]; then
    lines+=("| $name | $version | ok | $mirror | |")
  elif [[ "$mirror" == ok ]]; then
    lines+=("| $name | $version | **FALHOU** | ok | $detail; o espelho cobre |")
    bump 1
  else
    lines+=("| $name | $version | **FALHOU** | $mirror | $detail; **sem cópia com o SHA fixado** |")
    bump 2
  fi
  rm -f "$WORK/$file"
done < <(versions_assets)

{
  echo "# Terceiros do CS2 (versions.sh)"
  echo
  echo "| Terceiro | Versão | Oficial | Espelho | Detalhe |"
  echo "| --- | --- | --- | --- | --- |"
  printf '%s\n' "${lines[@]}"
  echo
  case "$worst" in
    0) echo "Tudo certo." ;;
    1) echo "O oficial mudou ou sumiu, mas o espelho tem a cópia certa (ou o envio ao espelho falhou). Atualize o versions.sh quando houver versão nova." ;;
    *) echo "**Há terceiros sem nenhuma cópia com o SHA-256 fixado: a instalação do zero quebra.** Troque a URL e o hash em versions.sh (e valide no staging) antes do lançamento." ;;
  esac
} | { if [[ -n "$REPORT" ]]; then tee "$REPORT"; else cat; fi; }

exit "$worst"
