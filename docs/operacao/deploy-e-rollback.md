# Deploy e rollback

Como o código do `main` chega à produção (Oracle A1, Docker Compose atrás do Cloudflare Tunnel) e como voltar atrás. Arquivos: `infra/prod/` (compose, scripts), `.github/workflows/deploy.yml`.

## Visão geral

```
PR dev → main ──> CI rápida (node: pnpm verify + OpenAPI) ──> merge no main
merge no main ──> CI do push (imagens api, web e ops, só arm64) ──> Deploy
                   publica ghcr.io/caiomayan/carmine-{api,web,ops}:sha-<commit>
Deploy: GitHub Actions ──SSH pelo Cloudflare Tunnel (Access + service token)──> VM
        usuário `deploy`, chave que só executa /opt/carmine/bin/deploy
VM: baixa as imagens, dump local do banco, `docker compose up -d --wait`
    (migrate -> api -> web), e volta para a tag anterior se algo não ficar saudável
```

A **homologação** (`dev.stcarmine.com`, a cópia do `dev` na mesma VM) tem o próprio fluxo, isolado deste: `docs/operacao/homologacao.md`.

## Quem aprova

A spec pede "sem passo manual além da aprovação". Verificado na documentação do GitHub: *required reviewers* em *environments* só existe em repositório **público** nos planos Free, Pro e Team (em privado, só Enterprise). Então:

- **A aprovação é o merge no `main`**: o ruleset já exige PR e os checks `node`, `dotnet` e `api-image` verdes. O workflow `Deploy` só dispara quando o CI do push no main termina verde.
- **Redeploy e rollback**: *Actions > Deploy > Run workflow* com o commit desejado (40 caracteres). É o botão manual, e funciona mesmo com o freio ligado.
- **Freio**: a variável do repositório `DEPLOY_PAUSED=true` (*Settings > Secrets and variables > Actions > Variables*) suspende o deploy automático. Use enquanto investiga um problema ou antes de uma janela delicada. Apague a variável (ou ponha `false`) para voltar.
- Um deploy automático de um commit que já não é a ponta do `main` é descartado (um mais novo cuida disso).
- Sem os secrets do passo a passo do dono, o job só avisa ("Deploy ainda não configurado") e termina verde.

## Por que SSH pelo Cloudflare Tunnel

Avaliado: (1) SSH direto na porta 22 pública; (2) *self-hosted runner* na VM; (3) SSH pelo próprio túnel com Cloudflare Access e *service token*.

Escolhido o (3):

- Dá para **fechar a 22 de vez** no Security List da Oracle depois de validar (a VM deixa de ter qualquer porta aberta para a internet; a Oracle tem Console Connection como porta de emergência).
- A conexão exige duas coisas: o service token do Access (secret do GitHub) **e** a chave SSH, que só executa o script de deploy (`restrict,command="/opt/carmine/bin/deploy"`): sem shell, sem encaminhamento, sem outro comando. Quem roubar os secrets só consegue pedir o deploy de uma tag `sha-<40 hex>` que existe no nosso GHCR.
- O (2) deixa um processo de longa duração na VM executando código de qualquer workflow do repositório, com acesso ao Docker; o (1) mantém a 22 aberta ao mundo (o fail2ban mitiga, não elimina).
- O token do GHCR que a VM usa para baixar as imagens é o `GITHUB_TOKEN` do próprio job, enviado pelo stdin do SSH: vale só durante o job, nunca vai para o disco da VM (o `docker login` usa um diretório temporário).

Detalhe de rede: o `cloudflared` (contêiner) chega ao `sshd` da VM por `host.docker.internal:22` (o gateway do Docker). A regra de iptables da VM aceita a 22 sem filtrar por interface, então o contêiner alcança. **Valide isso no primeiro deploy** (passo 11 do checklist). Se a rede da VM mudar e isso quebrar, o plano B é o `sshd` escutar também em `172.30.0.1` e a regra do túnel apontar para `ssh://172.30.0.1:22`.

## Túnel: painel ou arquivo versionado?

Recomendado: **túnel gerenciado pelo painel (token)**. O contêiner só precisa de `CLOUDFLARE_TUNNEL_TOKEN`; sem arquivo de credenciais nem `cloudflared tunnel login` no PC do dono; trocar uma rota vale na hora, sem reiniciar. O que se perde (versionamento) é recuperado assim: `infra/prod/tunnel/ingress.json` é a cópia canônica das rotas e `infra/prod/tunnel/apply-ingress.sh` as aplica pela API do Cloudflare (token só com *Cloudflare Tunnel: Edit*). Rotas:

| Hostname | Caminho | Destino |
| --- | --- | --- |
| `stcarmine.com` | `^/api(/|$)` | `http://api:3333` (ADR 0015: direto na API, sem passar pelo Next) |
| `stcarmine.com` | (resto) | `http://web:3000` |
| `ssh.stcarmine.com` | | `ssh://host.docker.internal:22` (só com Access na frente) |
| (qualquer outro) | | `http_status:404` |

`www.stcarmine.com` → `stcarmine.com`: um *Redirect Rule* do Cloudflare (301, mantendo caminho e query), mais um registro DNS `www` proxied. Redirecionamento não é papel do ingress.

## O que o deploy faz (`infra/prod/bin/deploy.sh`)

1. Recebe a tag (`sha-<commit>`), o usuário e o token do GitHub e o tar de `infra/prod/` do commit.
2. Extrai em `/opt/carmine/releases/<tag>/` e entra no GHCR com um `DOCKER_CONFIG` temporário.
3. `docker compose pull`.
4. Se já havia uma versão no ar: **dump local do Postgres** (`backup.sh local`, volume `backups`, guarda os 3 últimos). Se o dump falha, o deploy para sem alterar nada.
5. `docker compose up -d --remove-orphans --wait --wait-timeout 240`: o `migrate` roda as migrações do Drizzle; a API só sobe se ele terminar com sucesso; web e túnel sobem depois, todos com healthcheck.
6. Tudo saudável: grava `/opt/carmine/state/current.tag` (e `previous.tag`). Senão, **rollback automático** para a tag anterior e o job termina vermelho com o log dos serviços.
7. Mantém as 5 últimas releases e poda imagens com mais de 30 dias.

Nada publica porta. O deploy não reinicia o Postgres nem o Valkey a menos que a imagem deles mude no compose.

## Rollback

- **Automático na VM**: item 6 acima (contêiner que não fica saudável).
- **Automático pelo teste de fumaça**: depois de implantar, o deploy.yml confere de fora (pelo Cloudflare) as páginas e APIs públicas por até 2 min. Se alguma falha, ele implanta de novo o commit anterior do `main` (o primeiro pai do commit que subiu) com `sem_volta`, para não entrar em laço.
- **Manual**: *Run workflow* com o commit bom anterior (o `previous.tag` da VM e o histórico do `main` dizem qual). É um deploy normal de uma versão antiga: baixa as imagens daquela tag e usa o compose daquele commit.
- **Migrações só andam para a frente.** O rollback troca as imagens, não desfaz o schema. Por isso toda migração deve ser compatível com a versão anterior do código (expandir, depois contrair em outro deploy: coluna nova nullable ou com default; só apague coluna/tabela uma versão depois que nada mais a lê). Uma migração que quebra a versão anterior exige restaurar o backup (`docs/operacao/backup-e-restauracao.md`): o dump local pré-deploy mais recente está no volume `backups`.
- **Se até o rollback falhar** (log: "O ROLLBACK TAMBÉM FALHOU"): entre na VM (SSH do `ubuntu`) e use `/opt/carmine/bin/dc ps` e `/opt/carmine/bin/dc logs api` (o `dc` é o `docker compose` apontado para a release no ar; se a `current.tag` ficou desatualizada, rode o compose da release que quiser a partir de `/opt/carmine/releases/<tag>`). O site fica fora do ar até corrigir; o alerta do monitor externo avisa no Discord.

## Primeira vez e manutenção do script

`infra/prod/bin/bootstrap.sh` (root, na VM) cria o usuário `deploy`, `/opt/carmine` e instala o `deploy.sh` como `/opt/carmine/bin/deploy`, dono root, para o próprio `deploy` não conseguir alterá-lo. Instala também o `tunnel.sh` (`/opt/carmine/bin/tunnel`): o deploy chega pelo túnel, então na primeira vez o cloudflared sobe antes do deploy (`sudo /opt/carmine/bin/tunnel`, depois de preencher o `.env`); o deploy normal adota o contêiner sem reiniciá-lo (a configuração do cloudflared não muda com a tag). Se um PR mudar `infra/prod/bin/deploy.sh`, o deploy avisa ("difere do instalado"); rode o bootstrap de novo a partir da release nova para atualizar. O compose e o resto de `infra/prod` seguem o commit automaticamente (vão no tar).

## Variáveis de ambiente de produção

`/opt/carmine/.env` (root:deploy, `0640`, **fora do git**; modelo em `infra/prod/.env.example`). Mudou um valor: edite o arquivo e rode *Run workflow* no commit atual (ou `docker compose ... up -d` na VM).

## Conferir depois de um deploy

- `https://stcarmine.com/api/health` responde `{"status":"ok"}` e a home abre.
- Nos logs da API (`/opt/carmine/bin/dc logs api | grep clientIp`), `clientIp` é o IP real de quem acessou, nunca `172.30.0.x` (`docs/operacao/rate-limit-e-ip-real.md`).
- `curl -I https://stcarmine.com/` traz `content-security-policy`, `strict-transport-security`, `x-content-type-options`.
- `docker ps` não mostra nenhuma porta publicada (`0.0.0.0:`), só `*/tcp` interno.
