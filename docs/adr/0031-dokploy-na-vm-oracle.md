# Dokploy ao lado do Carmine na VM Oracle

**Estado: proposta.** A decisão sai depois do teste de carga (#266), que mede a folga real da VM.

O [ADR 0009](0009-hospedagem-oracle-arm-e-vps-x86-br.md) pôs web, API, Postgres e Valkey em Docker Compose na VM Oracle Always Free (Ampere A1, 2 OCPU, 12 GB), exposta só pelo Cloudflare Tunnel. O deploy é a CI entrando por SSH pelo túnel e rodando o `deploy.sh` (`docs/operacao/deploy-e-rollback.md`). A homologação é uma segunda pilha na mesma VM (`docs/operacao/homologacao.md`).

O dono quer o Dokploy na VM, em 2026-11-04, por dois motivos: um painel para ver e operar os contêineres, e um lugar para subir outros projetos na única VM gratuita. Os projetos ligados ao Carmine ficam em subdomínios do `stcarmine.com`; os pessoais, no domínio pessoal do dono.

Conferido em 2026-11-04:
- **Na VM** (leitura por SSH): `aarch64`, 2 núcleos, 11 GiB de memória (9,6 livres), 84 GB de disco livres, nada escutando nas portas 80, 443 e 3000.
- **Imagens:** as do Dokploy e do Traefik que o instalador usa têm versão arm64.
- **O painel enxerga contêineres que o Dokploy não implantou:** `docker.getContainers` lista todos (`docker ps -a`), com logs, reinício, parada e partida.

## Decisão (proposta)

- **O Dokploy fica ao lado, e o Carmine continua fora dele.** Produção e homologação seguem com o deploy de hoje: CI verde, SSH com chave restrita, backup antes, `up --wait`, teste de fumaça e volta automática. Nenhum segredo do Carmine entra no Dokploy, e nenhuma chave de API do Dokploy sai da VM.
- **O Dokploy é para os outros projetos**, cada um com rede isolada (`isolatedDeployment`) e limite de CPU e de memória. O Carmine tem prioridade: projeto novo só entra se couber na folga medida no #266.
- **Painel:** alcançável só por um túnel novo do Cloudflare, atrás do Cloudflare Access (só o e-mail do dono), com 2FA no Dokploy. A porta 3000 é despublicada assim que o painel tiver endereço. O endereço não entra no repositório.
- **Portas fechadas de verdade:**
  - Fecham na Security List da Oracle: 80 e 443 do Traefik, 3000 do painel, e 2377, 7946 e 4789 do Swarm.
  - Também fecham por regra na cadeia `DOCKER-USER`, porque o NAT do Docker passa por cima do firewall da VM (o próprio `infra/prod/compose.yml` avisa).
  - Isso emenda o ADR 0009: a VM passa a ter portas publicadas pelo Docker, todas bloqueadas antes da internet.
- **Convivência com o Carmine:**
  - **Limpeza automática do Dokploy desligada:** ela faz `system prune --all` e apagaria as imagens das tags anteriores e os contêineres parados do Carmine (`homologacao.md`: nunca `prune -a`).
  - **Faixas de rede separadas** (`default-address-pools` do Docker e `DOCKER_SWARM_INIT_ARGS`), para nenhuma rede nova tomar 172.30/16 ou 172.31/16 nem colidir com a rede da Oracle.
  - **Limite de memória no próprio Dokploy.**
  - **Versão do Dokploy fixa:** atualizar é operação de produção, com backup e com o dono ciente.
- **Backup do Dokploy** (o banco dele e `/etc/dokploy`) no R2. Como nenhum segredo do Carmine mora ali, ele leva só os dos outros projetos.
- **Instalação em etapas**, cada uma com o "pode" do dono e conferência de que o Carmine segue no ar:
  1. cópia do disco da VM no painel da Oracle;
  2. regras de porta;
  3. instalação;
  4. túnel e Access;
  5. limpeza desligada e limites;
  6. um projeto de teste.

## Consequences

- **Ganha:**
  - Painel com logs, estado e reinício de todos os contêineres, inclusive os do Carmine.
  - Projetos novos com domínio, banco e backup pela tela.
  - O deploy do Carmine continua exatamente como está.
- **Custa:**
  - Uma peça com acesso total ao Docker, o que equivale a root na VM, na mesma máquina da produção. Ela é contida pelo Access, pelo 2FA e pela ausência de chave fora da VM.
  - Cerca de 1 GB de memória.
  - O modo Swarm ligado.
  - Dois jeitos de operar a VM: o Carmine pela CI, o resto pelo painel.
- **O botão de reiniciar do painel** serve para o Carmine, mas parar ou apagar contêineres dele pelo painel fica proibido. O caminho é o deploy.
- **Desfazer:** remover os serviços do Dokploy e sair do Swarm. O Carmine não depende dele.

## Considered Options

- **Migrar o Carmine para dentro do Dokploy:** a revisão adversarial de 2026-11-04 conferiu o código do Dokploy e mostrou o custo.
  - Ele não espera os serviços ficarem saudáveis.
  - Ele baixa a ponta da branch em vez do commit implantado.
  - A virada colide com redes e volumes atuais.
  - O backup passa pelo limite de 100 s do Cloudflare.
  - A chave de API equivale a root na VM: hoje, uma chave roubada só implanta uma versão válida.
  - O backup do próprio Dokploy levaria as senhas da produção para o R2, junto com a chave que cifra os CPFs.

  Tudo tem conserto, menos o nível da chave e as senhas dentro do Dokploy. Fica para reavaliar depois de meses com o Dokploy ao lado; o caminho seria migrar a homologação como ensaio antes da produção.
- **Não instalar:** zero risco, sem o painel e sem os outros projetos. Fica valendo até o #266 mostrar se há folga.
- **Coolify:** o concorrente direto, com a maior comunidade, mas mais pesado e com o mesmo problema de querer ser dono do deploy.
- **Portainer ou Komodo:** cobririam o painel, mas sem a experiência de subir projeto novo em um clique que motivou a escolha.
- **Dokku e Kamal:** não têm painel.
