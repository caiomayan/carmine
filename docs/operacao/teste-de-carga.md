# Teste de carga (homologação)

Quanta gente a plataforma aguenta antes de a divulgação do beta aberto: onde está o limite, qual é o gargalo e quanta folga a VM tem. Issue #266. Roda na **homologação** (`dev.stcarmine.com`), nunca na produção, mas a homologação **divide a VM com a produção** (`docs/operacao/homologacao.md`): por isso o teste tem trava, sonda e hora marcada.

Os roteiros, o workflow e os geradores moram em `infra/teste-de-carga/` e `.github/workflows/teste-de-carga.yml`.

## Como funciona

- **k6**, rodando num runner do GitHub Actions: o gerador de carga fica **fora** da VM, como um jogador de verdade, e não come os 2 núcleos que estão sendo medidos.
- **Escada**: cada cenário sobe em degraus (10, 25, 50, 100, 200 servidores ou visitantes simultâneos). Um processo do k6 por degrau; o degrau **para** quando o p95 passa do limite combinado ou os erros passam de 1% (`bin/escada.mjs`). O último degrau que aguentou e o primeiro que estourou dão o limite: "entre 100 e 200".
- **Sonda da produção**, dentro de cada degrau: a cada 5 s pede a Home e `/api/health` da produção. Mede a Home por 20 s antes de a carga começar; o limite é o maior entre 3 vezes essa mediana e 1000 ms. **Aborta o teste todo** se a mediana das últimas 6 Homes passar do limite ou se 3 pedidos seguidos falharem. Os grupos seguintes não rodam. Ajustes: `SONDA_FATOR`, `SONDA_PISO_MS`, `SONDA_JANELA`, `SONDA_FALHAS`. **Ela só vigia durante cada degrau**: nas pausas entre degraus e entre cenários ninguém olha a produção (cada degrau começa medindo a Home de novo antes de carregar).
- O limite de p95 **não tem padrão** (nem a spec nem o monitoramento fixam um número): quem dispara informa no formulário do workflow.

### Os três cenários (em ordem)

| Cenário | Quem é "simultâneo" | O que cada um faz | Roteiro |
| --- | --- | --- | --- |
| **Coleta por round** | Servidor Carmine de teste (`carga-001`...) | Retake com 10 jogadores. Batimento a cada 10 s e descarga de eventos a cada 5 s (o ritmo do Carmine.Core). Rounds de 75 s com ~8 abates e ~28 danos cada, no formato da S17 (`mapPlayId`, posição, bomba, início de round). | `k6/coleta.js` |
| **Leitura da API** | Visitante | `/api/me`, lista de Servidores, Ranking e Perfil, com pausa de gente entre os cliques; mais uma conexão do stream de Servidores ao vivo aberta por visitante; mais 40 Servidores de fundo batendo o coração para a lista ter o tamanho de um dia cheio. | `k6/api.js` |
| **Páginas** | Visitante | Home, Ranking e Perfil renderizados no servidor (o HTML; o JS e o CSS são da Cloudflare). | `k6/paginas.js` |

### O que o modelo não cobre (leia antes de confiar no número)

- **`/api/me` sem sessão.** O teste é anônimo (o caminho barato: 401). Não há desvio de login para teste, de propósito: isso é decisão de segurança do dono. A carga de quem está logado (sessão no Valkey, Loadout, amigos) não é medida.
- **O stream não é lido.** O k6 não consome SSE. Mede-se a conexão aberta e segura (chegou o cabeçalho, ficou de pé) e o custo de cada uma no processo da API; não se mede o tempo de entrega de cada atualização.
- **Os jogadores dos servidores de teste são contas novas.** Na primeira descarga a API cria as Contas não reivindicadas (o caminho mais caro, uma vez); depois é o regime. Cada servidor tem 10 jogadores próprios (SteamID64 em um bloco fora do que a Steam emite e fora do da demonstração).
- **Retake apenas.** Deathmatch tem outro perfil de evento (muitos abates por minuto); fica para uma segunda rodada se a primeira indicar folga.
- **A homologação não é a produção.** Teto de memória de 640 MB por contêiner, `cpu_shares` 128 (perde a CPU para a produção em qualquer disputa), Valkey com `maxmemory 64mb` e `noeviction`, Postgres com `max_connections=50`. O número de lá vale como **piso**: a produção tem mais folga em memória e CPU, e o Valkey dela é maior. O que o teste ensina é **qual peça cede primeiro**.
- **Um IP só.** O tráfego sai de poucos IPs do runner, como se fosse um CGNAT gigante (ver "Rate limit" abaixo).

## Antes de rodar

Nada disto é feito pelo workflow, e **nada disto está feito por padrão**. O maestro dispara o teste, com o dono ciente.

| # | O quê | Quem | Detalhe |
| --- | --- | --- | --- |
| 1 | Aviso ao dono | maestro | O teste carrega a VM da produção. De madrugada, com a sonda ligada. Ninguém acessa a homologação nesse horário. |
| 2 | **Service token do Access** para o runner | dono (Cloudflare) | Zero Trust > Access > Service Auth > criar um token **só para o teste** (`carmine-teste-de-carga`). No app `Carmine homologação` (`dev.stcarmine.com`), acrescente uma política **Service Auth** com esse token (sem *Bypass*, sem *Everyone*). Cole o ID e o segredo nos secrets **`LOADTEST_CF_ACCESS_CLIENT_ID`** e **`LOADTEST_CF_ACCESS_CLIENT_SECRET`**. Revogue o token depois da rodada. Não reuse o `CF_ACCESS_CLIENT_*` do deploy: ele é do `ssh.stcarmine.com`. |
| 3 | Segredo das chaves | dono | Sorteie um texto de 32 ou mais caracteres e guarde no secret **`LOADTEST_KEY_SECRET`**. Dele saem as chaves dos servidores de teste, tanto na VM (só o hash) quanto no runner (a chave). |
| 4 | **Pausar o deploy** da homologação | dono | Variável do repositório `DEPLOY_HML_PAUSED=true`. O workflow se recusa a rodar sem ela: um merge no `dev` no meio do teste redeployaria a pilha, e o seed da demonstração recusa um banco com os servidores de teste. |
| 5 | **Cadastrar os servidores de teste** na VM | dono (SSH) | Ver "Servidores de teste" abaixo. |
| 6 | **Subir o limite `public` do rate limit** na VM | dono (SSH) | Ver "Rate limit" abaixo. |
| 7 | WAF / Bot Fight | dono (Cloudflare) | Se o *Bot Fight Mode* ou uma regra de WAF barrar o runner (esperado: tráfego de datacenter, em volume), crie uma exceção **só para `dev.stcarmine.com` e só para o service token**. Nunca na produção. O pré-teste do workflow acusa se o acesso falhou. |
| 8 | Coletor de CPU e memória | dono (SSH) | `infra/teste-de-carga/bin/vm-stats.sh`, na VM, durante o teste (ver "Folga da VM"). Opcional, mas sem ele não há resposta para "quanto sobra na VM inteira". |

### Servidores de teste

O CLI da API cadastra `carga-001`... `carga-N` na homologação (idempotente: rodar de novo refaz). Ele só funciona na homologação (a mesma trava da demonstração: `CARMINE_DEMO`, `PUBLIC_WEB_URL` de homologação, `SENTRY_ENVIRONMENT` diferente de `production`) e **não imprime chaves**: elas saem do `LOADTEST_KEY_SECRET`, que o runner usa para calcular as mesmas.

```bash
# na VM, com o mesmo valor do secret LOADTEST_KEY_SECRET exportado (não o escreva no histórico: use `read -rs`)
docker exec -e LOADTEST_KEY_SECRET carmine-hml-api-1 node dist/game-servers/servers.cli.js load-test --count 210
```

`--count` é o **maior passo da coleta mais 10** (a coleta usa o número da VU como índice do servidor, e a sonda ocupa uma). Para os passos padrão (até 200), 210. Ele cobre também os 40 servidores de fundo da leitura da API (o workflow calcula o mesmo total para o runner).

### Rate limit

Os limites são por IP (`docs/operacao/rate-limit-e-ip-real.md`) e todo o tráfego do runner sai de poucos IPs: com os 240 por minuto do `public`, o teste de leitura levaria 429 no primeiro degrau e mediria o rate limit, não a VM. Na coleta isso não acontece (o balde `server` é por servidor, 600 por minuto, e cada servidor de teste tem o seu).

O `infra/hml/compose.yml` lê `RATE_LIMIT_PUBLIC_PER_MINUTE` do `.env` da VM (padrão 240, o da produção; não é segredo). Para a rodada:

1. No `.env` da homologação na VM, acrescente `RATE_LIMIT_PUBLIC_PER_MINUTE=1000000`.
2. Faça a API ler o valor: Actions > *Deploy homologação* > *Run workflow* com o commit atual (o deploy manual vale mesmo com `DEPLOY_HML_PAUSED=true`; a variável só suspende o automático).
3. **Depois da rodada, tire a linha do `.env` e rode o deploy manual de novo.** Com o limite alto a homologação deixa de se proteger de abuso.

O limite continua ligado (o custo do GCRA no Valkey entra na medida), só deixa de cortar.

## Rodar do notebook (caminho principal até o workflow chegar ao main)

O workflow só aparece em *Run workflow* depois de estar no `main`, e ir ao `main` é release de produção. Até lá o mesmo teste roda do notebook de quem dispara: mesmo k6, mesma escada, mesmas variáveis. As travas do workflow ficam por conta de quem roda: ok do dono, deploy da homologação pausado, de madrugada, "Antes de rodar" cumprido.

```bash
# k6 2.x instalado como binário (https://grafana.com/docs/k6/latest/set-up/install-k6/) e Node 24, no repositório.
export LOADTEST_KEY_SECRET=<o mesmo valor usado na VM>     # leia com read -rs, sem deixar no histórico
export BASE_URL=https://dev.stcarmine.com PROD_URL=https://stcarmine.com
export CF_ACCESS_CLIENT_ID=<service token> CF_ACCESS_CLIENT_SECRET=<service token>
export KEYS_FILE=chaves.txt                                # não commitar; apague ao terminar
node infra/teste-de-carga/bin/chaves.mjs --count 210 --out "$KEYS_FILE"   # maior passo + 10 (ver acima)
for g in coleta api paginas; do
  node infra/teste-de-carga/bin/escada.mjs --grupo $g --passos 10,25,50,100,200 --p95 <ms do grupo> --saida resultados || break
done
```

Saída 3 = a sonda abortou (pare tudo); 4 = defeito no roteiro. `--max-erros`, `--segura` e `--pausa` fazem o papel das entradas de mesmo nome do workflow; `FUNDO` (padrão 40) é variável de ambiente. As tabelas saem em `resultados/escada-<grupo>.md`. O workflow roda de um runner do GitHub e o notebook, da rede de casa: a latência da rede entra na medida, então compare números do mesmo caminho. Para abortar, `Ctrl+C`. O coletor da VM, "Depois" e o resto valem igual.

## Rodar pelo workflow (quando estiver no `main`)

1. Actions > **Teste de carga** > *Run workflow* (o arquivo precisa estar no `main`; o GitHub só oferece o botão assim, como no deploy da homologação).
2. Preencha: "Estou ciente", os **três limites de p95** (sem padrão), e, se quiser, os degraus. Os padrões são 10, 25, 50, 100, 200 (coleta e API) e 10, 25, 50, 100 (páginas), 120 s no patamar e 30 s de pausa entre degraus. Uma rodada completa dura de 40 a 70 minutos.
3. O workflow recusa começar sem "ciente", sem `DEPLOY_HML_PAUSED=true` e sem os secrets; confere que a homologação responde (200) com o token e que a produção responde (200) antes de a primeira requisição de carga.
4. Em paralelo, na VM, o coletor (ver abaixo).
5. O resumo (uma tabela por cenário) aparece na página da execução; os JSONs completos vão no artefato `resultados-teste-de-carga` (só métricas, 30 dias; o repositório é público, então não há nada de infraestrutura neles).

Em caso de erro 429 nos resultados: o passo 6 acima não valeu (ou a API não foi recriada). Em 401 nas rotas de plugin: `LOADTEST_KEY_SECRET` diferente do usado na VM.

### Como abortar

- **Automático:** a sonda da produção (acima). Mensagem `SONDA: ...` no log e o job termina vermelho com "a produção piorou".
- **Manual:** na página da execução, *Cancel workflow*. O runner mata o k6 na hora e a carga some em segundos; as conexões abertas fecham sozinhas. Se a produção estiver sofrendo, cancele **primeiro**, investigue depois.
- Nada do teste persiste na VM além dos servidores `carga-*`, das Contas e das Estatísticas que eles geraram (ver "Depois").

### Folga da VM

O workflow não entra na VM (a chave `deployhml` só roda o deploy). O coletor é um script de **só leitura**, para o dono rodar pelo SSH dele durante o teste:

```bash
ssh vm-carmine 'bash -s -- 10 7200' < infra/teste-de-carga/bin/vm-stats.sh > vm-stats.csv
```

Uma linha por contêiner (homologação **e** produção) a cada 10 s: CPU (100 = um núcleo; a VM tem 2) e memória; mais `vm:memoria` (usada, não disponível) e `vm:carga-1min`. A pergunta que ele responde é a da VM inteira: enquanto a homologação sofre, a produção ainda tem CPU e memória? Para automatizar isto no workflow seria preciso uma chave SSH nova com comando forçado só de leitura (mudança na VM, decisão do dono); por enquanto é manual.

## Depois

1. **Aposentar os servidores de teste:** `docker exec carmine-hml-api-1 node dist/game-servers/servers.cli.js retire --prefix carga-`. Sem isso, o seed da demonstração recusa o próximo deploy ("o banco tem Servidores Carmine que não são da demonstração").
2. **Tirar `RATE_LIMIT_PUBLIC_PER_MINUTE` do `.env`** da VM.
3. **Zerar o banco da homologação** (Actions > *Deploy homologação* > `zerar_banco`): as ~2.000 Contas de teste e as Estatísticas delas aparecem no Ranking da homologação (jogam mais que qualquer pessoa). O seed recria a demonstração. Este deploy também faz a API reler o `.env` sem o limite alto.
4. Revogar o service token do teste e despausar o deploy (`DEPLOY_HML_PAUSED`).
5. Preencher "Resultados" abaixo (só números, sem dado de infraestrutura).

## Rodar na máquina (validar um roteiro)

Os roteiros se validam contra uma pilha local (Postgres e Valkey do `infra/docker-compose.yml`, a API e, para as páginas, o web), **nunca** contra a homologação sem passar pelo workflow.

```bash
# k6 2.x (https://grafana.com/docs/k6/latest/set-up/install-k6/) ou a imagem grafana/k6; as chaves de teste:
LOADTEST_KEY_SECRET=<32+ caracteres> node infra/teste-de-carga/bin/chaves.mjs --count 60 --out chaves.txt
# cadastre os servidores na pilha local (a API local precisa de CARMINE_DEMO=homologacao e PUBLIC_WEB_URL=http://localhost:3000)
pnpm --filter @carmine/api servers load-test --count 60
# um degrau só, direto no k6:
BASE_URL=http://localhost:3333 KEYS_FILE=chaves.txt PASSO=10 RAMPA_S=5 SEGURA_S=30 P95_MS=1000 k6 run infra/teste-de-carga/k6/coleta.js
# ou a escada inteira:
BASE_URL=http://localhost:3333 KEYS_FILE=chaves.txt node infra/teste-de-carga/bin/escada.mjs --grupo coleta --passos 10,20 --p95 1000 --saida resultados --rampa 5 --segura 30 --pausa 3
```

Sem `PROD_URL` a sonda não roda. Para ver a sonda abortar: `PROD_URL=<a própria API local> SONDA_HOME=/api/health SONDA_FATOR=0.00001 SONDA_PISO_MS=0.001` (o k6 sai com 108 e o JSON marca `abortouPelaSonda`). Os testes dos geradores (`pnpm --filter @carmine/teste-de-carga test`) conferem que cada corpo gerado passa nos schemas de `@carmine/contracts`: se o contrato mudar, quebram aqui.

## Resultados

> **A preencher depois da rodada.** Nenhum número abaixo existe ainda; a regra é não inventar dado (`AGENTS.md`). Cada tabela vem da execução do workflow, que a monta sozinha no resumo.

**Rodada:** _data, commit, limites de p95 usados._

### Limites encontrados

| Cenário | Último degrau que aguentou | Primeiro que estourou | Quem cedeu primeiro (rota, p95, erro) |
| --- | --- | --- | --- |
| Coleta por round (servidores) | | | |
| Leitura da API (visitantes) | | | |
| Páginas (visitantes) | | | |

### Folga da VM

| Momento | CPU da homologação | CPU da produção | Memória usada da VM | Carga 1 min |
| --- | --- | --- | --- | --- |
| Antes (sem carga) | | | | |
| No último degrau que aguentou | | | | |
| No degrau que estourou | | | | |

A produção piorou em algum momento (a sonda)? _sim/não, quando._

### Proposta de referência de capacidade

_Para o dono aprovar e entrar na spec do beta aberto (PR #278): quantos servidores e quantos visitantes simultâneos a VM sustenta com folga, derivados do último degrau que aguentou, com a margem decidida pelo dono. A homologação é o piso; a produção tem mais memória e CPU livres._
