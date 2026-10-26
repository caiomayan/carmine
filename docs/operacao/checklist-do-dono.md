# Checklist do dono: colocar o Carmine no ar (S09a)

Os passos que só o dono faz (contas, painéis, segredos), em ordem. Cada um diz **o que copiar** e **onde colar**. Os nomes dos menus dos painéis mudam de tempos em tempos; o que importa é o valor e o destino. Quem conduz tem os comandos da VM.

Dois destinos de segredo:

- **`.env` da VM** (`/opt/carmine/.env`, modelo em `infra/prod/.env.example`): o que os serviços leem.
- **GitHub** (*repositório > Settings > Secrets and variables > Actions*): só o que a CI precisa para implantar. Quatro secrets: `DEPLOY_SSH_KEY`, `DEPLOY_SSH_HOST_KEY`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`.

Nada disso entra no repositório nem em chat. Cole direto no destino.

## 1. Senhas do banco e do cache

No terminal da VM (ou qualquer lugar com `openssl`), gere duas, só hexadecimal:

```bash
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 24   # VALKEY_PASSWORD
```

→ colar em `POSTGRES_PASSWORD` e `VALKEY_PASSWORD` do **.env da VM**.

## 2. Cloudflare Tunnel

1. <https://one.dash.cloudflare.com> > **Networks > Tunnels > Create a tunnel** > *Cloudflared* > nome `carmine-prod`.
2. Na tela "Install and run a connector", **copie o token**: o texto longo depois de `--token`. Não rode o comando mostrado (o contêiner faz isso). → colar em `CLOUDFLARE_TUNNEL_TOKEN` do **.env da VM**.
3. Em **Published application routes** (ou "Public hostnames"), crie as rotas de `infra/prod/tunnel/ingress.json`, na ordem:
   - `stcarmine.com`, caminho `^/api(/|$)` → HTTP `api:3333`
   - `stcarmine.com` (sem caminho) → HTTP `web:3000`
   - `ssh.stcarmine.com` → SSH `host.docker.internal:22`
   O Cloudflare cria os registros DNS sozinho.
4. **`www`**: DNS > registro `www`, CNAME para `stcarmine.com`, *proxied*; depois **Rules > Redirect Rules** > de `www.stcarmine.com/*` para `https://stcarmine.com/${1}`, 301.
5. **SSL/TLS > Edge Certificates**: *Always Use HTTPS* ligado, versão mínima do TLS 1.2.
6. **Security > Bots**: deixe o *Bot Fight Mode* **desligado**. Os plugins dos servidores CS2 chamam a API a partir de um datacenter (AWS), o Bot Fight Mode os bloqueia, e o plano grátis não aceita exceção. A proteção da API é o rate limit por IP e a chave de cada Servidor Carmine (`docs/operacao/rate-limit-e-ip-real.md`).

## 3. Cloudflare Access para o SSH do deploy

1. **Access > Applications > Add an application > Self-hosted**: nome `carmine-ssh`, hostname `ssh.stcarmine.com`.
2. **Access > Service credentials > Create service token** (nome `github-deploy`, duração: sem expiração ou 1 ano com lembrete). **Copie o Client ID e o Client Secret agora** (o secret não aparece de novo).
   → **GitHub**: `CF_ACCESS_CLIENT_ID` e `CF_ACCESS_CLIENT_SECRET`.
3. Na aplicação `carmine-ssh`, crie uma **policy** com ação **Service Auth** que inclua o token `github-deploy`. Sem policy, ninguém entra (o que é bom).

## 4. Chave SSH do deploy

No PC do dono. **No Git Bash** (ou WSL/Linux/macOS) rode:

```bash
ssh-keygen -t ed25519 -N "" -C carmine-deploy -f carmine-deploy
```

No **PowerShell** o `-N ""` não funciona: ele grava uma senha literal `""` na chave (e o deploy falharia pedindo a senha). Lá, rode só `ssh-keygen -t ed25519 -C carmine-deploy -f carmine-deploy` e aperte **Enter duas vezes** quando pedir a senha (vazia).

**Confira que a chave não tem senha** (qualquer shell): `ssh-keygen -y -f carmine-deploy` deve imprimir a chave pública (`ssh-ed25519 AAAA...`) **sem pedir nada**. Se pedir `Enter passphrase`, apague os dois arquivos e refaça.

- **Chave pública** (`carmine-deploy.pub`, uma linha) → entregue a quem conduz: vai no `bootstrap.sh` da VM (passo 9).
- **Chave privada** (`carmine-deploy`, o arquivo inteiro, com as linhas `BEGIN`/`END`) → **GitHub**: `DEPLOY_SSH_KEY`. Depois **apague o arquivo privado** do PC.
- **Chave do servidor** (para o SSH não aceitar impostor) → **GitHub**: `DEPLOY_SSH_HOST_KEY`, com este valor, que é público (confira o fingerprint na VM antes: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`):

  ```
  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIIxi4MxoZV89Tq7YY6cGZuXRQawt+NI1kkrt4P9xVeNi
  ```

## 5. Cloudflare R2 (backups)

1. Painel > **R2 Object Storage > Create bucket**: `carmine-backups` (localização automática, sem acesso público).
2. **R2 > Manage R2 API Tokens > Create API token**: permissão **Object Read & Write**, restrito ao bucket `carmine-backups`. Copie o **Access Key ID**, o **Secret Access Key** e o endpoint `https://<ID DA CONTA>.r2.cloudflarestorage.com`.
   → **.env da VM**: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ENDPOINT`, e `R2_BUCKET=carmine-backups`.

## 6. Discord (alertas)

Servidor do Carmine > crie o canal privado `#alertas` > ⚙ **Editar canal > Integrações > Webhooks > Novo webhook** > **Copiar URL do webhook**.
→ **.env da VM**: `DISCORD_ALERT_WEBHOOK_URL`.

### Denúncias da Staff (S13)

Outro canal privado, só da Staff (`#denuncias-staff`), com o seu próprio webhook (o mesmo caminho: ⚙ **Editar canal > Integrações > Webhooks > Novo webhook**). Cada `!report` no jogo cai ali em segundos, com o motivo, o alvo, o servidor e o link da fila.
→ **.env da VM**: `STAFF_REPORTS_WEBHOOK_URL`. Depois `sudo /opt/carmine/bin/dc up -d api`. Detalhes em [denuncias-e-log-de-chat.md](denuncias-e-log-de-chat.md).

### Discord integrado (S15, opcional)

Vínculo da Conta, cargos Jogador/VIP/Staff/Dono e a mensagem de status dos servidores. Sem as variáveis, ficam desligados, sem erro. Passo a passo no Developer Portal, cargos, permissões do bot e IDs: [discord.md](discord.md).
→ **.env da VM**: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_ROLE_*_ID` e `DISCORD_STATUS_CHANNEL_ID`.

## 7. Sentry

1. <https://sentry.io>: crie a organização (plano Developer, grátis) e **dois projetos**: `carmine-api` (plataforma *Node.js*) e `carmine-web` (plataforma *Next.js*).
2. Em cada um: **Settings > Client Keys (DSN)** > copie o **DSN**.
   → **.env da VM**: `API_SENTRY_DSN` (do `carmine-api`) e `WEB_SENTRY_DSN` (do `carmine-web`).
3. Se quiser os alertas no Discord: *Settings > Integrations > Discord*, depois uma regra de alerta por projeto.

## 8. Steam Web API

<https://steamcommunity.com/dev/apikey>, domínio `stcarmine.com` → copie a chave.
→ **.env da VM**: `STEAM_WEB_API_KEY` (sem ela, as Contas ficam com avatar neutro e "amigos jogando" fica indisponível).

## 9. Preparar a VM (quem conduz faz, com o dono presente)

```bash
# no PC: copiar infra/prod para a VM (como chegar à VM com a 22 fechada: docs/operacao/homologacao.md, passo 4)
scp -i <sua chave da VM> -r infra/prod ubuntu@<IP da VM>:/tmp/carmine-prod
# na VM
ssh -i <sua chave da VM> ubuntu@<IP da VM>
sudo /tmp/carmine-prod/bin/bootstrap.sh "ssh-ed25519 AAAA... carmine-deploy"   # a chave PÚBLICA do passo 4
sudoedit /opt/carmine/.env                                                       # colar os valores dos passos 1 a 8
sudo /opt/carmine/bin/tunnel                                                     # sobe só o túnel (veja abaixo)
```

**Por que subir o túnel antes do primeiro deploy:** o deploy chega à VM por SSH *dentro do túnel* (`ssh.stcarmine.com`), e o túnel só existiria depois do deploy. O `bin/tunnel` sobe só o cloudflared (precisa de `CLOUDFLARE_TUNNEL_TOKEN` preenchido e das senhas dos passos 1 a 8 no `.env`) e espera ele ficar saudável; no painel do Cloudflare o túnel `carmine-prod` passa a *Healthy*. Pode repetir sem problema. O deploy normal **adota** esse contêiner (mesma configuração: não reinicia o túnel no meio da própria sessão SSH).

## 10. Primeiro deploy

1. **GitHub > Settings > Secrets and variables > Actions**: confira os 4 secrets (passos 3 e 4).
2. Confira que o túnel está *Healthy* no painel (passo 9). Faça o merge do PR da S09a (ou *Actions > Deploy > Run workflow* na ponta do `main`). O job `Deploy` implanta; acompanhe o log.
3. Se o log disser "Deploy ainda não configurado", falta algum dos 4 secrets.

## 11. Conferir

Peça a quem conduz para rodar com você (comandos em `docs/operacao/deploy-e-rollback.md`):

- <https://stcarmine.com/> abre; <https://stcarmine.com/api/health> responde `{"status":"ok"}`.
- Entrar com a Steam funciona de ponta a ponta.
- Os logs da API mostram o IP real em `clientIp` (nunca `172.30.0.x`).
- `docker ps` na VM não mostra nenhuma porta publicada.
- Sentry: `/opt/carmine/bin/dc exec api node dist/sentry/test-event.cli.js` e o evento aparece no `carmine-api`.
- Backup: `/opt/carmine/bin/dc exec backup /opt/ops/backup.sh full` conclui e o arquivo aparece no bucket do R2. Depois, o **ensaio de restauração** de `docs/operacao/backup-e-restauracao.md`.
- Discord: o backup falho e o servidor offline avisam no canal (quem conduz simula).

## 12. Fechar a porta 22 (só depois do passo 11 verde)

Antes: confirme que **você** consegue entrar na VM pelo túnel (`cloudflared access ssh --hostname ssh.stcarmine.com` com a sua conta no Access) **ou** que a *Console Connection* da Oracle funciona (Compute > Instances > a VM > Console connection), porque será a sua porta de emergência.

Depois: Oracle > Networking > a VCN > Security Lists > remova a regra de entrada TCP/22 (e a regra da `iptables` pode ficar). Teste que `ssh -i ... ubuntu@<IP da VM>` agora dá timeout e que *Run workflow* no Deploy ainda funciona.

## 13. Monitor externo (UptimeRobot ou Better Stack)

Crie dois monitores HTTP (1 a 5 min): `https://stcarmine.com/` e `https://stcarmine.com/api/health`, ambos esperando 200, e ligue o aviso a um webhook do canal `#alertas` (ou e-mail). Opcional: um *heartbeat* para o backup; cole a URL em `BACKUP_HEARTBEAT_URL` do **.env da VM**. Detalhes em `docs/operacao/monitoramento-e-alertas.md`.

## 14. Decisão pendente: instância ociosa da Oracle

A A1 pode ser recolhida se ficar ociosa 7 dias (ADR 0009). O Carmine usa pouco (~0,4 GB de 12 GB). Decida com quem conduz: converter a conta Oracle para *Pay As You Go* (continua sem custo dentro do Always Free) ou aceitar o risco e manter os backups no R2 (que já permitem recriar a VM). Veja `docs/operacao/orcamento-operacional.md`.

## 15. Servidores CS2 do beta (S09b)

O site já está no ar; para os amigos jogarem falta a instância AWS com os dois servidores. Tudo está em `docs/operacao/aws-beta-cs2.md`; os pontos que só você faz:

- [ ] Conta AWS com MFA, plano pago (créditos mantidos), região `sa-east-1`, orçamentos de US$ 10/20/40 e usuário IAM `carmine-operator`.
- [ ] Instância `m6a.xlarge` com disco gp3 de 100 GB, Security Group só com UDP 27015–27016 e Elastic IP (o runbook tem os comandos).
- [ ] Deploy key de leitura do repositório na instância.
- [ ] Dois tokens GSLT (um por servidor, contas Steam distintas) e as duas chaves de Servidor Carmine (`servers create` na VM de produção) coladas em `/etc/carmine-cs2/<perfil>.env`.
- [ ] Combinar com quem conduz: o `servers create` usa o Elastic IP, e a instalação baixa ~69 GB (ok para você?).
- [ ] Hábito: `cs2-beta.ps1 stop` ao fim de cada sessão (ligada custa ~US$ 6,7 por dia).

## Depois

- Se faltar um segredo, o serviço correspondente fica desligado, não quebrado: sem DSN, sem Sentry; sem webhook, sem alertas; sem chave da Steam, avatar neutro; **sem as credenciais do R2, o backup noturno falha e avisa**.
- Trocar qualquer valor do `.env`: edite o arquivo e rode *Actions > Deploy > Run workflow*.
