# shellcheck shell=bash
# Releases do Carmine.Core (workflow release-plugin.yml) no host: achar a versão, baixar, conferir e guardar.
# Lido com `source` pelo install.sh (--core-release) e pelo carmine-plugin-deploy. Quem lê define `die` e `log`
# e HOME_DIR (padrão /srv/carmine-cs2).
#
# Layout:  $HOME_DIR/releases/core-X.Y.Z/{manifest.json, SHA256SUMS, carmine-core-X.Y.Z.zip, plugin/}
#          $HOME_DIR/releases/installed   a versão que o install.sh pôs nas instâncias (para remontar depois de um update do CS2)
#
# "Latest" é a release `core-v*` que NÃO é pré-lançamento nem rascunho: promover a pré-lançamento no GitHub (depois do
# release da API em produção) é o que a libera para os servidores. Uma versão pedida pelo número vale mesmo sendo
# pré-lançamento (para testar num servidor só antes de promover).

RELEASES_BASE="${CARMINE_RELEASES_BASE:-https://api.github.com/repos/caiomayan/carmine}"
RELEASES_REPO="${CARMINE_RELEASES_REPO:-caiomayan/carmine}"

release_dir() { echo "${HOME_DIR:?}/releases/core-$1"; }

release_installed_version() {
  local file="${HOME_DIR:?}/releases/installed"
  [[ -f "$file" ]] && cat "$file"
  return 0
}

release_api() { # release_api <caminho>
  curl -fsSL --retry 3 --retry-delay 2 -H 'Accept: application/vnd.github+json' "$RELEASES_BASE/$1"
}

# A versão da release Latest (sem o prefixo core-v); vazio se não houver.
release_latest_version() {
  release_api 'releases?per_page=30' | jq -r '
    [.[] | select((.tag_name | test("^core-v[0-9]+\\.[0-9]+\\.[0-9]+$")) and (.prerelease | not) and (.draft | not))][0].tag_name // empty
    | ltrimstr("core-v")'
}

# latest | installed | X.Y.Z => X.Y.Z (ou morre)
release_resolve() {
  local want="$1" version
  case "$want" in
    latest)
      version="$(release_latest_version)"
      [[ -n "$version" ]] || die "nenhuma release core-v* promovida (Latest) no GitHub"
      ;;
    installed)
      version="$(release_installed_version)"
      [[ -n "$version" ]] || die "nenhuma versão instalada registrada em ${HOME_DIR:?}/releases/installed (use latest ou X.Y.Z)"
      ;;
    *)
      [[ "$want" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "versão inválida: $want (use latest, installed ou X.Y.Z)"
      version="$want"
      ;;
  esac
  echo "$version"
}

# Baixa (se preciso), confere e extrai a release. Idempotente: uma release já conferida não baixa de novo.
release_fetch() { # release_fetch <X.Y.Z>
  local version="$1" dir json name url file
  dir="$(release_dir "$version")"
  if [[ -f "$dir/.verified" && -f "$dir/plugin/Carmine.Core.dll" ]]; then
    return 0
  fi
  log "baixando a release core-v$version"
  json="$(release_api "releases/tags/core-v$version")" || die "release core-v$version não existe no GitHub"
  rm -rf "$dir"
  mkdir -p "$dir"
  for name in "carmine-core-$version.zip" manifest.json SHA256SUMS; do
    url="$(jq -r --arg n "$name" '.assets[] | select(.name == $n) | .browser_download_url' <<<"$json")"
    [[ -n "$url" ]] || { rm -rf "$dir"; die "a release core-v$version não tem o arquivo $name"; }
    curl -fsSL --retry 3 --retry-delay 2 -o "$dir/$name" "$url" || { rm -rf "$dir"; die "falha ao baixar $url"; }
  done

  # Três conferências independentes: SHA256SUMS contra os arquivos, e o manifesto contra o zip.
  if ! (cd "$dir" && sha256sum --check --status SHA256SUMS); then
    rm -rf "$dir"
    die "SHA-256 da release core-v$version não confere com o SHA256SUMS"
  fi
  file="$dir/carmine-core-$version.zip"
  if [[ "$(jq -r .asset.sha256 "$dir/manifest.json")" != "$(sha256sum "$file" | cut -d' ' -f1)" \
    || "$(jq -r .version "$dir/manifest.json")" != "$version" ]]; then
    rm -rf "$dir"
    die "o manifesto da release core-v$version não bate com o zip"
  fi
  # A atestação prova que o zip saiu do workflow deste repositório; sem o `gh`, vale só o SHA-256 acima.
  if command -v gh >/dev/null; then
    gh attestation verify "$file" --repo "$RELEASES_REPO" >/dev/null 2>&1 \
      || { rm -rf "$dir"; die "a atestação de proveniência de core-v$version não confere"; }
  else
    log "aviso: 'gh' não instalado; a atestação de proveniência não foi conferida (SHA-256 conferido)"
  fi

  mkdir -p "$dir/plugin"
  unzip -q -o "$file" -d "$dir/plugin" || die "unzip de $file falhou"
  [[ -f "$dir/plugin/Carmine.Core.dll" ]] || { rm -rf "$dir"; die "o zip da release core-v$version não traz Carmine.Core.dll"; }
  chmod -R u+rwX,go+rX "$dir"
  touch "$dir/.verified"
}

# Apaga as releases antigas: guarda as $2 mais novas (padrão 3) e as que algum servidor usa ($3...: versões).
release_prune() { # release_prune <keep> [versão em uso...]
  local keep="${1:-3}" dir version
  shift || true
  local protect installed
  installed="$(release_installed_version)"
  protect=" $* $installed "
  # shellcheck disable=SC2012  # nomes core-X.Y.Z, sem espaços
  for dir in $(ls -1d "${HOME_DIR:?}"/releases/core-* 2>/dev/null | sort -V | head -n "-$keep"); do
    version="${dir##*/core-}"
    [[ "$protect" == *" $version "* ]] && continue
    rm -rf "$dir"
  done
}
