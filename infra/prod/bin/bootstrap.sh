#!/usr/bin/env bash
# Prepara a VM de produção para o deploy pela CI. Rode UMA vez (e de novo quando bin/deploy.sh
# mudar) NA VM, como root, a partir de uma cópia de infra/prod:
#
#   sudo ./bin/bootstrap.sh "ssh-ed25519 AAAA... carmine-deploy"
#
# O argumento é a chave PÚBLICA do deploy (a privada vai só para o secret do GitHub). Cria o usuário
# `deploy`, o diretório /opt/carmine e instala o deploy.sh, o dc.sh e o tunnel.sh com dono root (o `deploy` não consegue
# alterá-lo). A chave só roda esse script: sem shell, sem encaminhamento de portas.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "rode como root (sudo)" >&2; exit 1; }
PUBKEY="${1:-}"
[[ "$PUBKEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo "uso: bootstrap.sh \"ssh-ed25519 AAAA... comentario\"" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT=/opt/carmine

id deploy >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/deploy --shell /bin/bash deploy
usermod -aG docker deploy

install -d -o root -g root -m 0755 "$ROOT" "$ROOT/bin"
install -d -o deploy -g deploy -m 0755 "$ROOT/releases" "$ROOT/state"
install -o root -g root -m 0755 "$HERE/bin/deploy.sh" "$ROOT/bin/deploy"
install -o root -g root -m 0755 "$HERE/bin/dc.sh" "$ROOT/bin/dc"
install -o root -g root -m 0755 "$HERE/bin/tunnel.sh" "$ROOT/bin/tunnel"
# O compose do túnel antes do primeiro deploy (bin/tunnel.sh); o deploy normal adota o contêiner.
install -d -o root -g root -m 0755 "$ROOT/releases/bootstrap"
install -o root -g root -m 0644 "$HERE/compose.yml" "$ROOT/releases/bootstrap/compose.yml"
if [[ ! -f "$ROOT/.env" ]]; then
  install -o root -g deploy -m 0640 "$HERE/.env.example" "$ROOT/.env"
  echo "Criado $ROOT/.env a partir do exemplo: preencha os valores (sudoedit $ROOT/.env)."
fi

install -d -o deploy -g deploy -m 0700 /home/deploy/.ssh
printf 'restrict,command="%s/bin/deploy" %s\n' "$ROOT" "$PUBKEY" >/home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 0600 /home/deploy/.ssh/authorized_keys

echo "Pronto. Usuário deploy criado e $ROOT/bin/deploy instalado."
echo "Próximo: preencha o .env e rode: sudo $ROOT/bin/tunnel (sobe o túnel; o 1º deploy chega por ele)."
echo "Confira: sudo -u deploy ls $ROOT ; getent group docker"
