# shellcheck shell=bash
# Funções compartilhadas pelo install.sh, pelo versions-check e pelo manifesto da release: a lista dos
# terceiros com SHA fixo (versions.sh) e o espelho privado deles no R2 do dono. Lido com `source`.
#
# O espelho é uma cópia de segurança dos terceiros (o Metamod do AlliedModders só guarda os builds
# recentes; qualquer release do GitHub pode sumir). É endereçado pelo SHA-256: o objeto
# `assets/<sha256>` só existe com exatamente aquele conteúdo, então cair no espelho nunca troca
# a versão fixada. É de uso nosso, sem redistribuir (o RockTheVote não tem licença): o bucket é
# PRIVADO. Credenciais (somente leitura na VPS; de escrita só no GitHub): MIRROR_URL
# (https://<conta>.r2.cloudflarestorage.com/<bucket>), MIRROR_ACCESS_KEY_ID, MIRROR_SECRET_ACCESS_KEY,
# em /etc/carmine-cs2/mirror.env (0600) ou no ambiente.

# Lista os terceiros de versions.sh, um por linha: nome<TAB>versão<TAB>url<TAB>sha256<TAB>arquivo
# (arquivo = o nome com que o install.sh o guarda em downloads/ e o espelha). Pede versions.sh já lido.
versions_assets() {
  local name
  printf 'counterstrikesharp\t%s\t%s\t%s\t%s\n' "$CSS_VERSION" "$CSS_URL" "$CSS_SHA256" "$(basename "$CSS_URL")"
  printf 'metamod\t%s\t%s\t%s\t%s\n' "$METAMOD_BUILD" "$METAMOD_URL" "$METAMOD_SHA256" "$METAMOD_BUILD"
  printf 'inventory-simulator\t%s\t%s\t%s\t%s\n' "$INVSIM_VERSION" "$INVSIM_URL" "$INVSIM_SHA256" "$(basename "$INVSIM_URL")"
  for name in "${!GP_URL[@]}"; do
    printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$(basename "${GP_URL[$name]}")" "${GP_URL[$name]}" "${GP_SHA256[$name]}" "$(basename "${GP_URL[$name]}")"
  done | sort
  printf 'allocator-gamedata\t%s\t%s\t%s\t%s\n' "git" "$ALLOCATOR_GAMEDATA_URL" "$ALLOCATOR_GAMEDATA_SHA256" "$(basename "$ALLOCATOR_GAMEDATA_URL")"
}

mirror_load_env() {
  local file="${MIRROR_ENV_FILE:-/etc/carmine-cs2/mirror.env}"
  if [[ -r "$file" ]]; then
    set -a
    # shellcheck disable=SC1090  # arquivo de ambiente do operador
    source "$file"
    set +a
  fi
}

mirror_configured() {
  [[ -n "${MIRROR_URL:-}" && -n "${MIRROR_ACCESS_KEY_ID:-}" && -n "${MIRROR_SECRET_ACCESS_KEY:-}" ]]
}

mirror_object_url() { # mirror_object_url <sha256>
  echo "${MIRROR_URL%/}/assets/$1"
}

# curl assinado (SigV4) para o R2/S3. O cabeçalho explícito evita depender de como a versão do curl
# calcula o hash do corpo; GET e HEAD não têm corpo.
mirror_curl() {
  curl -fsS --retry 2 --retry-delay 2 \
    --aws-sigv4 "aws:amz:${MIRROR_REGION:-auto}:s3" \
    --user "$MIRROR_ACCESS_KEY_ID:$MIRROR_SECRET_ACCESS_KEY" \
    -H 'x-amz-content-sha256: UNSIGNED-PAYLOAD' "$@"
}

mirror_has() { # mirror_has <sha256>
  mirror_curl -I -o /dev/null "$(mirror_object_url "$1")" 2>/dev/null
}

mirror_get() { # mirror_get <sha256> <destino>
  mirror_curl -o "$2" "$(mirror_object_url "$1")"
}

# Envia (quem escreve é a CI, com o awscli do runner; o R2 é compatível com S3).
mirror_put() { # mirror_put <sha256> <origem>
  local url
  url="$(mirror_object_url "$1")"
  AWS_ACCESS_KEY_ID="$MIRROR_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$MIRROR_SECRET_ACCESS_KEY" \
    AWS_DEFAULT_REGION="${MIRROR_REGION:-auto}" AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
    AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
    aws s3 cp --only-show-errors --endpoint-url "${MIRROR_URL%/*}" \
    "$2" "s3://${MIRROR_URL##*/}/assets/$1" >/dev/null && echo "enviado $url" >&2
}
