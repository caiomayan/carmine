# Homologação (dev.stcarmine.com)

Uma cópia do site, atualizada sozinha a cada merge no `dev`, para o dono validar as telas pelo celular sem depender do notebook. Roda na **mesma VM Oracle A1 da produção**, em uma segunda pilha totalmente separada, atrás do Cloudflare Access (só o e-mail do dono entra). Arquivos: `infra/hml/` (compose, scripts), `.github/workflows/deploy-hml.yml`, `apps/api/src/demo/` (a demonstração).

## Visão geral

```
merge no dev ──> CI do push (imagens api e web, arm64): ghcr.io/caiomayan/carmine-{api,web}:sha-<commit>
             ──> Deploy homologação (só depois da CI verde, só se o commit ainda é a ponta do dev)
                   SSH por ssh.stcarmine.com (o mesmo túnel e service token da produção)
                   usuário `deployhml`, chave PRÓPRIA que só executa /opt/carmine-hml/bin/deploy
VM, projeto compose `carmine-hml` (/opt/carmine-hml):
   cloudflared (túnel NOVO) ─ web ─ api ─ postgres ─ valkey ─ media   + demo-seed (uma vez) + demo-sim
Celular ──> dev.stcarmine.com ──> Cloudflare Access (PIN no e-mail do dono) ──> túnel novo ──> web / api
```

O workflow só dispara depois que `deploy-hml.yml` estiver no `main` (o GitHub exige o arquivo no branch padrão para `workflow_run` e `workflow_dispatch`): a homologação **liga no primeiro release dev → main** depois deste PR.

## Isolamento da produção

| O quê | Produção | Homologação |
| --- | --- | --- |
| Pasta, `.env`, estado, trava de deploy | `/opt/carmine` | `/opt/carmine-hml`, `.env` próprio com senhas novas |
| Projeto, redes, volumes | `carmine`, 172.30.0.0/24 | `carmine-hml`, 172.31.0.0/24, volumes `carmine-hml_*` |
| Banco e cache | Postgres e Valkey de produção | contêineres próprios, rede `data` interna própria |
| Túnel e acesso | túnel `carmine-prod`, site público | túnel `carmine-hml` + Access em `dev.stcarmine.com` |
| Cookies | `__Host-carmine_session` (sem `Domain`: vale só para o host que o emitiu) | idem, no host `dev.stcarmine.com`: não vaza para `stcarmine.com` |
| Login Steam | realm `https://stcarmine.com` | realm `https://dev.stcarmine.com` (`PUBLIC_WEB_URL`); o OpenID não precisa de cadastro |
| Discord, alertas, Sentry, backup (R2) | configurados | **vazios ou ausentes**: nada sai da homologação para ninguém |
| Deploy por SSH | usuário `deploy`, `/opt/carmine/bin/deploy` | usuário `deployhml`, `/opt/carmine-hml/bin/deploy`; nenhuma das duas chaves abre a outra |
| Arquivos de produção tocados | | nenhum (`infra/prod`, `deploy.yml` intactos); só o `ci.yml` ganhou `push` no `dev` |

A homologação cede à produção: `cpu_shares: 128` (só perde CPU quando há disputa), `oom_score_adj: 500` (se a memória da VM acabar, o kernel mata a homologação primeiro) e o deploy **recusa subir** se a VM tem menos de 1,2 GB de memória disponível.

## Pagamentos de mentira (S14)

A homologação vende VIP com o provedor **falso** (`PAYMENTS_PROVIDER=fake`): a página de simulação paga, recusa, expira, estorna e contesta, e o webhook assinado percorre o caminho real. Tudo vem do compose (a chave de dados é sorteada sozinha); nada a preencher no `.env`. Detalhes em `docs/operacao/pagamentos.md`.

## Memória (tetos do compose)

| Serviço | Teto | | Serviço | Teto |
| --- | --- | --- | --- | --- |
| web | 640 MB | | cloudflared | 96 MB |
| api | 640 MB | | valkey | 96 MB |
| postgres | 640 MB | | demo-sim | 128 MB |
| migrate (só no deploy) | 384 MB | | demo-seed (só no deploy) | 384 MB |
| media (fotos de perfil) | 96 MB | | | |

**2,3 GB em regime e 2,7 GB no pico** (a migração e o seed nunca rodam juntos). Somados aos 6,8 GB em regime e 7,3 GB no pico da produção (`infra/prod/compose.yml`): **9,1 GB e 10,0 GB dos 12 GB** da VM. São tetos; o uso real é bem menor.

## A foto de perfil

Ligada **só na homologação**, para o dono validar o fluxo inteiro (enviar, recortar, denunciar, a Staff decidir) sem conta nem bucket da Cloudflare. A produção continua desligada até o dono criar os buckets do R2 (`docs/operacao/foto-de-perfil.md`).

- O serviço **`media`** é a imagem da API com o comando `media` (`apps/api/src/demo/demo-media.ts`): um R2 de mentira que guarda os arquivos num volume (`media-data`, 96 MB de memória). Tem duas portas: a **9000** é o S3 que a API usa (rede interna, com a chave `carmine-hml`) e a **8080** é a pública, só `GET`/`HEAD` das fotos no ar em `/avatars/<id>/<tamanho>.webp`, o mesmo caminho de `img.stcarmine.com` em produção; ela nunca é publicada. O bucket privado (fotos suspensas e removidas) nunca sai por ela. Só sobe com a trava da homologação (`CARMINE_DEMO=homologacao`, `PUBLIC_WEB_URL` de homologação e `SENTRY_ENVIRONMENT` diferente de `production`).
- A API recebe as `R2_MEDIA_*` e `MEDIA_PUBLIC_URL=https://dev.stcarmine.com`; o web recebe `MEDIA_PUBLIC_URL` (liga o convite no Perfil; o CSP já aceita a própria origem, `'self'`) e `MEDIA_INTERNAL_URL=http://media:8080`: a rota `apps/web/src/app/avatars/[id]/[file]/route.ts` repassa `/avatars/<id>/<tamanho>.webp` ao `media` pela rede interna, lendo a variável a cada pedido (o web é a mesma imagem da produção, onde ela não existe e o caminho é um 404 comum). Sem purga de CDN: o navegador guarda a foto por um ano (a URL muda a cada envio).
- **Nenhum passo manual:** o túnel segue com as duas rotas de sempre (`/api` e o resto para o web); as fotos passam pelo web, atrás do Access como o resto do `dev.stcarmine.com`.
- Os arquivos sobrevivem aos deploys; o `reset` (que apaga o banco) apaga o volume junto.

## As vitrines /dev/*

O web da homologação roda com `CARMINE_UI_GALLERY=1` (só em `infra/hml/compose.yml`; a produção não tem a variável e as rotas respondem 404). É por onde o dono vê **protótipos de tela** antes de a tela existir de verdade: cada protótipo é uma vitrine `/dev/<nome>` no `dev` (hoje `/dev/componentes`, `/dev/servidor`), com dados fixos de exemplo e a mesma CI dos outros PRs. Protótipo = vitrine no `dev`, não branch solto.

## A demonstração

Com `DEMO_ENABLED=true` no `.env` (o padrão do bootstrap), cada deploy roda o `demo-seed` e deixa o `demo-sim` ligado. A homologação nunca fica vazia.

- **34 contas fictícias** (nomes inventados, SteamID64 num bloco fora do que a Steam emite), criadas pelo mesmo caminho do connect do jogo; **3 Servidores Carmine** (`retake-1` "Retake · Rotação" com 5 a 8 jogadores, `retake-2` "Retake · Competitivo" sempre lotado, `dm-1` "Deathmatch · Arena" com 8 a 13), com endereços de documentação (RFC 5737) que não existem.
- **Estatísticas das últimas 4 semanas** por jogador (semente fixa: os mesmos números a cada deploy), então Ranking dos dois Modos, Perfis e "semana" da home têm o que mostrar. Alguns jogadores ficam abaixo do mínimo do Ranking, de propósito.
- **Inventário e Loadout** de exemplo (armas, faca, luvas, agentes, music kit, StatTrak), escolhidos do catálogo da cs2-lib e conferidos pelas regras do Inventário. Contas VIP têm mais Itens.
- **Partidas simuladas** (`demo-sim`, um processo de ~64 MB): a cada 10 s manda o batimento de cada servidor e, quando há partida, os eventos (kills, dano, rounds, entrada e saída de jogadores), pela API de verdade com a chave de cada servidor. Presença, faixa de atividade, Estatísticas e Ranking andam pelos mesmos caminhos da produção.
- **A Conta do dono** (`DEMO_OWNER_STEAM_ID` no `.env`): o mesmo tratamento, mais VIP, o papel de **Dono** (para validar também o painel da Staff) e os Presets "Competitivo" e "Casual". Sem a chave da Steam Web API (`STEAM_WEB_API_KEY`), a Conta do dono aparece com um nome fictício fixo e avatar neutro; para ver o seu nome e avatar, cole a mesma chave de produção no `.env`.
- Idempotente: o seed só completa o que falta, não soma duas vezes e não mexe no que já existe. Para recomeçar do zero, `zerar_banco` (abaixo).

### Impossível em produção

A imagem da API é a mesma da produção, então a trava é em tempo de execução (`apps/api/src/demo/demo-guard.ts`, com testes). Quatro chaves, todas obrigatórias, e a produção não tem nenhuma: `CARMINE_DEMO=homologacao` (só o compose da homologação define); `PUBLIC_WEB_URL` num host da lista (`dev.stcarmine.com`, `localhost`; nunca `stcarmine.com`, nem omitida); `SENTRY_ENVIRONMENT` diferente de `production`; `DEMO_SEED_SECRET` de 32+ caracteres (deriva as chaves dos servidores fictícios). Além disso o seed **recusa um banco com Servidor Carmine de verdade** (qualquer servidor em operação que não seja `retake-1`, `retake-2` ou `dm-1`). O compose de produção não tem os serviços `demo-*` nem essas variáveis.

## Checklist do dono

Ordem importa: o Access vem antes de o site existir, para nunca ficar exposto sem proteção.

- [ ] **1. Access.** Zero Trust > Access > Applications > *Add an application* > *Self-hosted*. Nome `Carmine homologação`; domínio `dev.stcarmine.com`; duração da sessão **1 mês** (celular). Política *Allow* com a regra *Emails* = o seu e-mail; login por *One-time PIN*. Nenhuma política *Bypass* nem *Everyone*.
- [ ] **2. Túnel novo.** Zero Trust > Networks > Tunnels > *Create a tunnel* > *Cloudflared*, nome `carmine-hml` (**não** reuse o `carmine-prod`). Copie o token (o texto longo depois de `--token`; não rode o comando mostrado). Em *Published application routes*, nesta ordem:
  - `dev.stcarmine.com`, caminho `^/api(/|$)` → HTTP `api:3333`
  - `dev.stcarmine.com` (sem caminho) → HTTP `web:3000`

  O painel cria o registro DNS `dev` sozinho.
- [ ] **3. Chave de deploy.** No PC: `ssh-keygen -t ed25519 -C carmine-hml -f hml_key -N ""` (PowerShell: sem o `-N ""`, aperte Enter duas vezes quando pedir a senha). Confira que não tem senha: `ssh-keygen -y -f hml_key` imprime a chave sem pedir nada.
  - `hml_key.pub` (uma linha) → usada no passo 4.
  - `hml_key` (o arquivo inteiro, com as linhas `BEGIN`/`END`) → GitHub, *Settings > Secrets and variables > Actions > New repository secret*: **`DEPLOY_HML_SSH_KEY`**. Depois apague `hml_key` do PC.
  - Os secrets `DEPLOY_SSH_HOST_KEY`, `CF_ACCESS_CLIENT_ID` e `CF_ACCESS_CLIENT_SECRET` já existem e são reaproveitados.
- [ ] **4. Na VM.** A porta 22 da VM está **fechada** na Oracle (de propósito: `checklist-do-dono.md`, passo 12), então `ssh ubuntu@<IP da VM>` dá timeout. O caminho recomendado é o SSH **pelo Cloudflare**, que não abre nada para a internet e serve sempre, não só desta vez:

  **4a. Uma vez só, o seu acesso humano.** Zero Trust > Access > Applications > `carmine-ssh` > *Policies* > *Add a policy*: nome `dono`, ação **Allow**, regra *Emails* = o seu e-mail. Mantenha a política *Service Auth* do deploy como está. (Hoje o app só tem a política do token do GitHub, então ninguém além do deploy entra.)

  **4b. Uma vez só, o atalho no PC.** No arquivo `config` da pasta `.ssh` do seu usuário (no Windows, `%USERPROFILE%\.ssh\config`), com o `cloudflared` no PATH:
  ```
  Host vm-carmine
    HostName ssh.stcarmine.com
    User ubuntu
    IdentityFile <caminho da sua chave da VM>
    ProxyCommand cloudflared access ssh --hostname %h
  ```
  Na primeira conexão o `cloudflared` abre o navegador para o login do Access (PIN no seu e-mail); depois o login fica guardado por um tempo.

  **4c. Copiar e rodar.**
  ```bash
  # no PC, na pasta do repositório (dev atualizado)
  scp -r infra/hml vm-carmine:/tmp/carmine-hml
  ssh vm-carmine
  # na VM
  free -h && docker stats --no-stream            # antes: me mande esta saída
  sudo bash /tmp/carmine-hml/bin/bootstrap.sh "ssh-ed25519 AAAA... carmine-hml"   # a chave PÚBLICA do passo 3
  sudoedit /opt/carmine-hml/.env                  # colar só CLOUDFLARE_TUNNEL_TOKEN (passo 2); as senhas já vêm sorteadas
  sudo /opt/carmine-hml/bin/tunnel                # sobe só o túnel novo
  ```
  **O deploy se atualiza sozinho.** O bootstrap instala o `deploy` em `/opt/carmine-hml/self/` (dono `deployhml`; `/opt/carmine-hml/bin/deploy` é um link para ele). Quando o `deploy.sh` da release difere do instalado, o instalado verifica a versão nova (`bash -n`, shebang, tamanho), troca-se por ela de forma atômica (guardando `deploy.anterior`), registra os dois sha256 no log e refaz o mesmo deploy com ela. Por isso mudar o `deploy.sh` **não pede mais o bootstrap**: rode-o de novo só uma vez, para sair do `deploy` antigo (que só avisava), ou se mudar o próprio `bootstrap.sh`. A confiança é a do `compose.yml` que vem no mesmo tar (o usuário já está no grupo `docker`); a produção tem deploy próprio, com dono root, e não se autoatualiza. Se uma versão quebrada do `deploy.sh` entrar no `dev`, a seguinte, corrigida, se instala sozinha; em último caso, o bootstrap reinstala. Teste: `bash infra/hml/test/deploy-self-update.test.sh` (roda no CI).
  No `.env`, opcionais: `DEMO_OWNER_STEAM_ID` (o seu SteamID64: a sua Conta ganha a demonstração e o papel de Dono) e `STEAM_WEB_API_KEY` (a mesma de produção, para o seu nome e avatar).

  **Se o 4c não entrar** (o Access deixou passar, mas o `ssh` recusou a chave para `ubuntu`), plano B: abrir a 22 só para você por alguns minutos. Oracle > Networking > a VCN > Security Lists > *Add Ingress Rules*: origem `<seu IP público>/32` (busque "meu ip"), TCP, porta 22. No atalho, troque `HostName` por `<IP da VM>` e tire a linha `ProxyCommand`. Terminou? **Remova a regra** na hora. Último recurso, sem mexer em regra: *Compute > Instances > a VM > Console connection*.

- [ ] **5. Ligar.** Depois do próximo release dev → main (o maestro faz), o workflow *Deploy homologação* passa a rodar a cada push no `dev`. Para o primeiro deploy sem esperar um push: *Actions > Deploy homologação > Run workflow*.
- [ ] **6. Conferir no celular.** Abra `https://dev.stcarmine.com`, passe pelo PIN do Access, entre com a Steam. A home mostra 3 servidores, o Ranking tem gente nos dois Modos.

## Operação

- **Estado**: `sudo /opt/carmine-hml/bin/dc ps` e `... dc logs -f api` (o `dc` é o `docker compose` apontado para a release no ar). Log da demonstração: `... dc logs demo-seed demo-sim`.
- **Pausar o deploy automático**: variável do repositório `DEPLOY_HML_PAUSED=true`. O *Run workflow* continua funcionando.
- **Zerar o banco e o cache** (migração reescrita no `dev`, estado estranho): *Actions > Deploy homologação > Run workflow* com `zerar_banco` marcado. Apaga só os contêineres e volumes do projeto `carmine-hml`; o seed recria a demonstração. Sessões e logins somem (entre de novo).
- **Mudar uma variável do `.env`**: `sudoedit /opt/carmine-hml/.env` e *Run workflow*.
- **Desligar de vez**: `sudo docker compose -p carmine-hml down -v` na VM; apague o app do Access e o túnel `carmine-hml` no painel.
- **Falhou o deploy**: o `deploy.sh` mostra o log dos serviços e volta sozinho para a tag anterior. Migrações só andam para a frente; se a anterior não sobe com o schema novo, `zerar_banco`. A produção não é tocada em nenhum desses passos.
- **Deploy recusado por memória** ("só N MB de memória disponível"): olhe `free -h` e o `docker stats` na VM. A homologação se recusa a subir antes de apertar a produção.
- **Faxina**: o deploy guarda as 3 últimas releases e as 2 últimas imagens baixadas pela homologação; nunca roda `prune -a` (as imagens de rollback da produção não são dela).

## Painel da Staff (staff-dev.stcarmine.com, S25)

O painel da Staff (`apps/staff`) é um segundo app na mesma pilha: serviço `staff` no compose, imagem `carmine-staff` (mesmo `IMAGE_TAG`). Serve o **próprio** `/api/*` pelo túnel, no mesmo padrão do site (ADR 0015): a sessão `__Host-` é do host do painel, o login Steam dele é `/api/auth/steam/staff/*` com o realm de `PUBLIC_STAFF_URL` (já no compose), e só Conta com papel de Staff entra.

**Passos do dono (uma vez, ~10 min, nada de nome interno no repositório):**

- [ ] **1. Access do painel (primeiro, antes de qualquer rota).** Zero Trust > Access > Applications > *Add an application* > *Self-hosted*. Nome `Carmine homologação painel`; domínio `staff-dev.stcarmine.com`; duração da sessão 1 mês. Política *Allow* com a regra *Emails* = só os e-mails da Staff (hoje o seu); login por *One-time PIN*. Nenhuma política *Bypass* nem *Everyone*. (É a primeira trava; a segunda é o login Steam com papel de Staff.) **Por que primeiro:** a rota do túnel (passo 2) põe o endereço no ar na hora; sem o Access já criado, ele ficaria público por alguns minutos, sem a primeira trava.
- [ ] **2. Rotas do túnel `carmine-hml` (só depois do Access).** Zero Trust > Networks > Tunnels > `carmine-hml` > Public Hostnames. Duas rotas novas, nesta ordem (a de `/api` primeiro): `staff-dev.stcarmine.com` com caminho `^/api(/|$)` → HTTP `api:3333`; `staff-dev.stcarmine.com` (sem caminho) → HTTP `staff:3100`. A cópia versionada é `infra/hml/tunnel/ingress.json`.
- [ ] **3. DNS.** O registro do `staff-dev` é criado pelo próprio painel do túnel ao salvar a rota (CNAME proxied para o túnel); confira em DNS > Records.
- [ ] **4. Conferir.** Abra `https://staff-dev.stcarmine.com`, passe pelo PIN do Access, clique em *Entrar com a Steam*. Uma Conta **sem** papel de Staff volta para a tela de entrada com "sem acesso" e nenhuma sessão; a sua Conta (papel de Dono) entra no Início.

A Punição, a revogação e o reset do nome já são feitos **dentro do painel** (tela Contas). A variável `SITE_URL` do serviço `staff` (já no compose, `https://dev.stcarmine.com`) só leva ao Perfil público e ao que ainda mora na ficha do site (VIP, Ranking, papel e exclusão de dados, até migrarem); a sessão do site é outra, então a Staff entra no site uma vez para usar essas partes.

**Produção (`staff.stcarmine.com`)** entra num PR seguinte, com o mesmo roteiro **na mesma ordem** (primeiro o Access `staff.stcarmine.com`, só depois as rotas `staff` e `staff/api` no túnel `carmine-prod`, para o endereço nunca ficar público sem a primeira trava), depois que a homologação estiver validada.
