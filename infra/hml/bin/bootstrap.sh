#!/usr/bin/env bash
# Prepara a VM para a homologação. Rode UMA vez (e de novo quando bin/deploy.sh mudar) NA VM, como
# root, a partir de uma cópia de infra/hml:
#
#   sudo ./bin/bootstrap.sh "ssh-ed25519 AAAA... carmine-hml"
#
# O argumento é a chave PÚBLICA do deploy da homologação (a privada vai só para o secret
# DEPLOY_HML_SSH_KEY do GitHub). Cria o usuário `deployhml` (outro que o `deploy` de produção, com
# a própria chave), /opt/carmine-hml e instala deploy, dc e tunnel com dono root. A chave só roda
# o deploy: sem shell, sem encaminhamento de portas. Não toca em /opt/carmine nem no usuário `deploy`.
set -euo pipefail

[[ $EUID -eq 0 ]] || { echo "rode como root (sudo)" >&2; exit 1; }
PUBKEY="${1:-}"
[[ "$PUBKEY" =~ ^ssh-ed25519\ [A-Za-z0-9+/=]+(\ .*)?$ ]] || { echo "uso: bootstrap.sh \"ssh-ed25519 AAAA... comentario\"" >&2; exit 2; }
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT=/opt/carmine-hml

id deployhml >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/deployhml --shell /bin/bash deployhml
usermod -aG docker deployhml

install -d -o root -g root -m 0755 "$ROOT" "$ROOT/bin"
install -d -o deployhml -g deployhml -m 0755 "$ROOT/releases" "$ROOT/state"
install -o root -g root -m 0755 "$HERE/bin/deploy.sh" "$ROOT/bin/deploy"
install -o root -g root -m 0755 "$HERE/bin/dc.sh" "$ROOT/bin/dc"
install -o root -g root -m 0755 "$HERE/bin/tunnel.sh" "$ROOT/bin/tunnel"
install -d -o root -g root -m 0755 "$ROOT/releases/bootstrap"
install -o root -g root -m 0644 "$HERE/compose.yml" "$ROOT/releases/bootstrap/compose.yml"

if [[ ! -f "$ROOT/.env" ]]; then
  install -o root -g deployhml -m 0640 "$HERE/.env.example" "$ROOT/.env"
  # Senhas e segredo da demonstração sorteados aqui: só hexadecimal, porque entram em URLs.
  for key in POSTGRES_PASSWORD VALKEY_PASSWORD DEMO_SEED_SECRET; do
    sed -i "s|^${key}=\$|${key}=$(openssl rand -hex 24)|" "$ROOT/.env"
  done
  # A chave dos dados de pagamento (32 bytes em base64; o base64 não tem `|`, então o sed é seguro).
  sed -i "s|^PAYMENTS_DATA_KEY=\$|PAYMENTS_DATA_KEY=$(openssl rand -base64 32)|" "$ROOT/.env"
  echo "Criado $ROOT/.env com as senhas sorteadas. Falta colar CLOUDFLARE_TUNNEL_TOKEN (sudoedit $ROOT/.env)."
fi

install -d -o deployhml -g deployhml -m 0700 /home/deployhml/.ssh
printf 'restrict,command="%s/bin/deploy" %s\n' "$ROOT" "$PUBKEY" >/home/deployhml/.ssh/authorized_keys
chown deployhml:deployhml /home/deployhml/.ssh/authorized_keys
chmod 0600 /home/deployhml/.ssh/authorized_keys

echo "Pronto. Usuário deployhml criado e $ROOT/bin/deploy instalado."
echo "Próximo: cole o token do túnel novo no .env e rode: sudo $ROOT/bin/tunnel"
echo "Memória da VM agora (a homologação precisa de ~1,5 GB livres além da produção):"
free -h
