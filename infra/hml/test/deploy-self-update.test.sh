#!/usr/bin/env bash
# Teste da autoatualização do deploy.sh da homologação, sem Docker nem VM: `docker` e `flock` são de mentira
# e o ROOT é um diretório temporário. Rode da raiz do repositório: bash infra/hml/test/deploy-self-update.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
ROOT="$WORK/root"
TAG="sha-$(printf 'a%.0s' {1..40})"
fail() { echo "FALHOU: $*" >&2; echo "--- log ---" >&2; cat "$WORK/out.log" >&2 || true; exit 1; }

mkdir -p "$ROOT/self" "$ROOT/state" "$ROOT/bin" "$WORK/fakebin"
printf 'POSTGRES_PASSWORD=x\n' >"$ROOT/.env"

# docker de mentira: aceita tudo e registra os argumentos (sem o token, que só passa por stdin).
cat >"$WORK/fakebin/docker" <<'DOCKER'
#!/usr/bin/env bash
echo "docker $*" >>"$FAKE_DOCKER_LOG"
cat >/dev/null </dev/null || true
exit 0
DOCKER
cat >"$WORK/fakebin/flock" <<'FLOCK'
#!/usr/bin/env bash
exit 0
FLOCK
chmod +x "$WORK/fakebin/docker" "$WORK/fakebin/flock"

# A "release": a árvore infra/hml do commit, com um deploy.sh que se reconhece pelo marcador.
mkdir -p "$WORK/tree/infra/hml/bin"
cp "$REPO/infra/hml/compose.yml" "$WORK/tree/infra/hml/compose.yml"
cp "$REPO/infra/hml/bin/deploy.sh" "$WORK/tree/infra/hml/bin/deploy.sh"
printf '\n# marcador-da-release-nova\n' >>"$WORK/tree/infra/hml/bin/deploy.sh"
tar -czf "$WORK/release.tgz" -C "$WORK/tree" infra/hml

# O instalado é o deploy.sh de hoje sem o marcador: difere do da release.
cp "$REPO/infra/hml/bin/deploy.sh" "$ROOT/self/deploy"
chmod 0755 "$ROOT/self/deploy"
ln -sfn "$ROOT/self/deploy" "$ROOT/bin/deploy"

run() { # run <pedido> : o stdin é usuário, token e o tar, como o do job
  { printf '%s\n%s\n' octocat "token-que-nao-pode-vazar"; cat "$WORK/release.tgz"; } \
    | PATH="$WORK/fakebin:$PATH" FAKE_DOCKER_LOG="$WORK/docker.log" CARMINE_HML_ROOT="$ROOT" \
      DEPLOY_MIN_AVAILABLE_MB=0 DEPLOY_WAIT_TIMEOUT=5 SSH_ORIGINAL_COMMAND="$1" \
      "$ROOT/bin/deploy" >"$WORK/out.log" 2>&1
}

run "$TAG" || fail "o deploy com autoatualização terminou com erro"
grep -q 'marcador-da-release-nova' "$ROOT/self/deploy" || fail "o instalado não virou a versão da release"
[[ -x "$ROOT/self/deploy" ]] || fail "o instalado perdeu o bit de execução"
[[ -f "$ROOT/self/deploy.anterior" ]] || fail "faltou a cópia do deploy anterior"
grep -q 'atualizando' "$WORK/out.log" || fail "faltou o log da atualização"
grep -q "no ar: $TAG" "$WORK/out.log" || fail "a segunda passada não concluiu o deploy"
[[ "$(grep -c 'no ar:' "$WORK/out.log")" == 1 ]] || fail "o deploy rodou mais de uma vez"
grep -q 'token-que-nao-pode-vazar' "$WORK/out.log" "$WORK/docker.log" && fail "o token apareceu no log"
[[ "$(<"$ROOT/state/current.tag")" == "$TAG" ]] || fail "a tag atual não foi gravada"
[[ -e "$ROOT/bin/deploy" ]] || fail "o caminho do comando forçado sumiu"

# Segunda vez: iguais, nada a atualizar.
run "$TAG" || fail "o segundo deploy falhou"
grep -q 'atualizando' "$WORK/out.log" && fail "atualizou de novo sem diferença"

# Release com shell quebrado: não instala, avisa e segue com o instalado.
printf 'if then\n' >>"$WORK/tree/infra/hml/bin/deploy.sh"
tar -czf "$WORK/release.tgz" -C "$WORK/tree" infra/hml
before="$(sha256sum "$ROOT/self/deploy" | cut -d' ' -f1)"
run "$TAG" || fail "o deploy com release quebrada deveria seguir com o instalado"
grep -q 'não passou na verificação' "$WORK/out.log" || fail "faltou o aviso da verificação"
[[ "$(sha256sum "$ROOT/self/deploy" | cut -d' ' -f1)" == "$before" ]] || fail "instalou um script que não passa no bash -n"

# Diretório não gravável: só avisa.
chmod 0555 "$ROOT/self"
sed -i '$d' "$WORK/tree/infra/hml/bin/deploy.sh"
printf '# outro-marcador\n' >>"$WORK/tree/infra/hml/bin/deploy.sh"
tar -czf "$WORK/release.tgz" -C "$WORK/tree" infra/hml
run "$TAG" || fail "o deploy sem permissão de escrita deveria seguir"
chmod 0755 "$ROOT/self"

echo "ok: autoatualização do deploy da homologação"
