# Dokploy na VM Oracle, com a CI ainda no comando do deploy

O [ADR 0009](0009-hospedagem-oracle-arm-e-vps-x86-br.md) pôs web, API, Postgres e Valkey em Docker Compose na VM Oracle Always Free (Ampere A1, 2 OCPU, 12 GB), exposta só pelo Cloudflare Tunnel. Hoje o deploy é a CI entrando por SSH pelo túnel e rodando o `deploy.sh` (`docs/operacao/deploy-e-rollback.md`), e a homologação é uma segunda pilha na mesma VM (`docs/operacao/homologacao.md`). O dono decidiu, em 2026-11-04, adotar o Dokploy na VM por três motivos: um painel para ver e operar contêineres, logs e backups; poder hospedar outros projetos na única VM gratuita, os ligados ao Carmine em subdomínios do `stcarmine.com` e os pessoais no domínio pessoal do dono; e aproveitar o resto do Dokploy. O maestro recomendou ficar como está, porque o deploy atual já tem backup, teste de fumaça e volta automática. O dono manteve a decisão.

Conferido em 2026-11-04, antes da decisão:
- **Na VM** (leitura por SSH): `aarch64`, 2 núcleos, 11 GiB de memória (9,6 livres), 96 GB de disco (84 livres), nada escutando nas portas 80, 443 e 3000.
- **Imagens:** as do Dokploy e do Traefik que o instalador usa têm versão arm64.
- **API do Dokploy** (código-fonte):
  - `backup.manualBackupCompose` espera o backup acabar e devolve erro se ele falha.
  - `rollback.rollback` só serve para aplicações, não para apps Compose.

## Decisão

- **O Dokploy orquestra a VM.** A produção e a homologação do Carmine viram dois apps Compose nele. A fonte continua sendo o `compose.yml` do repositório (`infra/prod/`, `infra/hml/`): nada de configuração só no painel, fora segredos e ligações. As imagens continuam prontas no GHCR, arm64, sem build na VM.
- **A CI continua mandando no deploy:**
  - O deploy automático do Dokploy fica desligado.
  - O deploy só sai depois do check `node` verde. Ele vem do workflow, que fixa o commit (`IMAGE_TAG=sha-<commit>`), chama a API do Dokploy (`compose.deploy`) e acompanha o deployment até o fim, porque a chamada só enfileira.
  - A homologação mantém a regra de só implantar a ponta do `dev`.
- **As garantias do `deploy.sh` passam para o workflow:**
  - Antes do deploy, um backup do Postgres para o R2 pelo Dokploy (`backup.manualBackupCompose`). Se ele falha, o deploy não sai.
  - Depois, o teste de fumaça de fora, pelo Cloudflare, como hoje.
  - Se o teste falha, a volta é reimplantar a tag anterior pela mesma API. O rollback nativo do Dokploy não cobre Compose.
- **Nenhuma porta pública:**
  - Os pontos de entrada que o Dokploy publica (80 e 443 do Traefik, 3000 do painel) ficam fechados na Security List da Oracle e no firewall da VM.
  - A porta 3000 é despublicada assim que o painel tiver endereço.
  - O painel só é alcançável por um túnel novo do Cloudflare, atrás do Cloudflare Access (só o e-mail do dono) e com 2FA no próprio Dokploy.
  - O endereço do painel não entra no repositório; ele mora nos secrets do GitHub, com a chave de API do Dokploy e o service token do Access.
- **O Carmine não passa pelo Traefik:**
  - O túnel do Carmine continua dentro do compose dele, apontando direto para web e API, com os IPs fixos da rede `edge` em que a API confia (`docs/operacao/rate-limit-e-ip-real.md`).
  - O Dokploy não acrescenta domínio nem rede aos serviços do Carmine.
  - A rota do SSH pelo túnel continua, para operar a VM.
- **Volumes com nome fixo** no compose (`name:`): o Dokploy roda o compose com um nome de projeto próprio, e sem isso criaria volumes novos e vazios ao lado dos dados de hoje.
- **Os outros projetos entram pelo Traefik do Dokploy**, pelo túnel do Dokploy:
  - Cada um tem rede isolada e limite de CPU e de memória.
  - O Carmine tem prioridade na VM: projeto novo só entra se couber no que sobra sem apertar os limites do Carmine.
- **Ordem:**
  - A homologação vai primeiro e roda alguns dias de merges no `dev`.
  - A produção vai depois, numa janela marcada pelo dono, com a pilha antiga parada e não apagada por 14 dias.
  - Antes de instalar, o dono tira uma cópia de segurança do disco da VM no painel da Oracle.
- **O backup do próprio Dokploy** (o banco dele e `/etc/dokploy`) vai para o R2, agendado.

## Consequences

- **Ganha:** painel com logs, estado e reinício dos serviços; backups agendados pela tela; um lugar para subir outros projetos com domínio e túnel.
- **Custa:**
  - Uma peça com acesso total ao Docker, o que equivale a root na VM, e que precisa de atualização.
  - Cerca de 1 GB de memória.
  - O modo Swarm ligado na VM da produção.
  - Configuração parcialmente fora do repositório: segredos e ligações.
- **CPU e memória são o limite real.**
  - São 2 núcleos para tudo, sem margem para crescer na camada gratuita.
  - Os limites de memória já somam 7,3 GB na produção e 3,6 GB na homologação, perto dos 11 GiB, embora o uso real seja de cerca de 2 GiB.
  - Projeto novo entra com limite apertado. Se faltar espaço, os limites da homologação são revistos antes dos da produção.
- **Sai depois da produção estável no Dokploy:** o `deploy.sh`, o `bootstrap.sh` e as chaves e usuários `deploy` e `deployhml`. Até lá, o caminho antigo continua sendo o plano de volta.
- **Atualizar o Dokploy** é operação de produção: só com backup e com o dono ciente.
- **Desfazer:**
  - Nos primeiros 14 dias, religar a pilha antiga, que está parada.
  - Depois, restaurar o backup do R2 numa pilha Compose comum: o compose do repositório continua servindo sem o Dokploy.
- **Sem custo novo:** o destino dos backups é o R2, que já é usado (`docs/operacao/backup-e-restauracao.md`).

## Considered Options

- **Ficar como está:** tudo já funciona e está testado. Descartado pelo dono, pelo painel e pelos outros projetos.
- **Dokploy só para os outros projetos, Carmine fora dele:** menor risco, mas dois jeitos de operar a mesma VM. Descartado.
- **Deploy automático do Dokploy no push:** pularia a CI e o backup antes do deploy. Descartado.
- **O Carmine atrás do Traefik do Dokploy:** trocaria rotas que funcionam e poria um salto a mais entre o túnel e o web, quebrando a confiança por IP fixo da API. Descartado na v1.
- **Outras ferramentas do mesmo tipo:** não avaliadas a fundo; a escolha do Dokploy é do dono.
