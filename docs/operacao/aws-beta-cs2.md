# Servidores CS2 do beta na AWS (sa-east-1)

Runbook do dono. Decisão: no beta (até ~10 amigos, até ~26/11/2026) os servidores Retake (27015) e Deathmatch (27016) rodam numa instância EC2 em **São Paulo**, paga com os créditos (US$ 72) e **ligada só nas sessões de jogo**. A VPS brasileira definitiva (ADR 0009) vem no fim de 2026 e usa **o mesmo instalador** (`infra/cs2/linux/`), sem nada da AWS nele.

Preços abaixo: lista de preços pública da AWS (Linux sob demanda, sa-east-1), lida em 2026-10-15. Confira na [calculadora](https://calculator.aws/) antes de gastar; marcado *estimativa* o que não é tarifa publicada.

## O que você vai ter

| Peça | Escolha | Por quê |
| --- | --- | --- |
| Região | `sa-east-1` (São Paulo) | Latência para os amigos. Tudo que sai daqui é mais caro que nos EUA (instância ~+34%, disco ~+90%). |
| Instância | **`m6a.xlarge`**: 4 vCPU AMD EPYC (3,6 GHz), 16 GiB, **US$ 0,2754/h** | Dois servidores CS2 pesam 3–6 GB de RAM cada (`orcamento-operacional.md`): 8 GiB não dá folga. Alternativa só se você medir e sobrar memória: `c6a.xlarge`, mesma CPU, 8 GiB, **US$ 0,2358/h**. |
| Por que não outras | `c7a` (a família mais nova da AMD) **não existe em sa-east-1**; `c7i.xlarge` custa 0,2751 com 8 GiB e `m7i.xlarge` 0,3213; as `t3`/`t3a` (burstáveis) engasgam quando o crédito de CPU acaba, ruim para servidor de jogo. | |
| Disco | **gp3 de 100 GB** (raiz, 3000 IOPS / 125 MB/s incluídos), US$ 0,152/GB-mês | O CS2 ocupa ~69 GB (ADR 0009); 100 GB deixa folga para updates. As duas instâncias de perfil são hardlinks: não pesam. |
| IP | **Elastic IP** | Veja abaixo. |
| Acesso | **SSM Session Manager**, sem SSH | Security Group sem porta de administração. |
| Rede | Security Group `carmine-cs2`: **só UDP 27015–27016** de entrada | |

### Custo

| Situação | US$/hora | US$/mês (730 h) |
| --- | --- | --- |
| Ligada (m6a.xlarge 0,2754 + IPv4 público 0,005) | **~0,28** | ~205 se ficasse 24/7 (não fique) |
| Desligada (disco 100 GB 0,0208 + Elastic IP 0,005) | **~0,026** | **~19** |
| Tráfego de saída | 0,15/GB depois dos 100 GB/mês grátis *(estimativa)* | uma sessão de 3 h com 10 jogadores ≈ 1 GB: cabe nos grátis |

Conta do beta (≈ 40 dias, de 17/10 a 26/11): disco ~US$ 20 + IP ~US$ 5 = **~US$ 25 fixos** com a instância desligada. Sobram **~US$ 47 de créditos ≈ 170 h de jogo** no m6a (≈ 4 h por dia) ou ~200 h no c6a. A instalação inicial (download de ~69 GB + compilação, 1–2 h) sai do mesmo saldo (~US$ 0,50).

**Depois dos créditos o custo continua**: com a instância desligada são ~US$ 19/mês de disco e IP. Veja "Encerrando o beta".

### Elastic IP, não IP dinâmico

O endereço `ip:porta` fica **gravado no cadastro do Servidor Carmine na API** (`servers create --address`) e é o que o site mostra em "Conectar"; não existe comando para editar o endereço (só criar outro servidor e perder a chave/ID). Sem Elastic IP a AWS entrega um IP novo a cada vez que a instância liga, e o cadastro ficaria errado a cada sessão. O Elastic IP custa US$ 0,005/h o tempo todo (US$ 3,65/mês), o mesmo que o IPv4 público dinâmico custaria ligado, então a diferença é só o tempo desligada (~US$ 3/mês). Vale. Se a Valve ou a AWS exigirem trocar o IP um dia, é `servers create` de novo.

### Segurança

- Security Group com **uma regra de entrada**: UDP 27015–27016 de `0.0.0.0/0`. Nada de SSH (22), RDP, nem TCP. O RCON do CS2 (TCP) não é usado e fica fechado. A consulta A2S do monitor (S09b) usa a mesma porta UDP do jogo.
- Saída liberada (padrão): a instância precisa chegar na Steam (GSLT), na API em `https://stcarmine.com/api`, no GitHub e na AWS (SSM).
- Administração por **SSM Session Manager**: o agente da instância faz uma conexão *de saída* com a AWS; você abre o terminal com `aws ssm start-session` autenticado pelo IAM, sem chave SSH nem porta aberta. As sessões podem ser auditadas no CloudTrail. A alternativa é o *EC2 Instance Connect Endpoint* (SSH tunelado pelo console), que exige criar um endpoint na VPC; não vale a complexidade aqui.
- IMDSv2 obrigatório; disco raiz criptografado (criptografia do EBS por padrão, ver passo 1).
- A AWS dá o Shield Standard (filtro de ataques volumétricos comuns) de graça, mas **não é anti-DDoS de jogo** como o da VPS brasileira do ADR 0009. Para ~10 amigos é aceitável; mantenha o IP só entre eles.

## Passo a passo (uma vez)

Faça no **AWS CloudShell** (botão `>_` no console, região São Paulo; já vem com o AWS CLI e a sessão) ou no seu terminal com `aws configure`. Substitua o que está entre `<...>`.

### 1. Conta, orçamento e proteção

1. Entre em <https://console.aws.amazon.com/>, **troque a região para São Paulo (sa-east-1)** e ative MFA na conta raiz.
2. **Plano da conta**: contas novas começam no *Free plan*, que só permite tipos de instância elegíveis ao free tier (`t3.micro` etc.) e **não deixa lançar `m6a`**. Se o console recusar o tipo, faça *Upgrade plan* → *Paid plan* em Billing: os créditos restantes continuam valendo. Confirme em *Billing → Credits* o saldo (US$ 72) e a validade.
3. **Alarmes de gasto** (Billing → Budgets, ou pela CLI). O orçamento precisa medir o uso **bruto** — se descontar os créditos, o valor nunca sobe e o alarme nunca dispara (`IncludeCredit: false`). Três orçamentos mensais de custo, alerta a 100% do valor real:

   ```sh
   ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
   for LIMIT in 10 20 40; do
     aws budgets create-budget --account-id "$ACCOUNT" \
       --budget "{\"BudgetName\":\"carmine-cs2-${LIMIT}usd\",\"BudgetType\":\"COST\",\"TimeUnit\":\"MONTHLY\",\"BudgetLimit\":{\"Amount\":\"${LIMIT}\",\"Unit\":\"USD\"},\"CostTypes\":{\"IncludeCredit\":false,\"IncludeRefund\":false}}" \
       --notifications-with-subscribers "[{\"Notification\":{\"NotificationType\":\"ACTUAL\",\"ComparisonOperator\":\"GREATER_THAN\",\"Threshold\":100,\"ThresholdType\":\"PERCENTAGE\"},\"Subscribers\":[{\"SubscriptionType\":\"EMAIL\",\"Address\":\"<seu-email>\"}]}]"
   done
   ```

   Os avisos chegam com atraso de horas (a AWS atualiza o custo algumas vezes por dia): eles pegam "esqueci ligada por dias", não "esqueci ligada esta noite". Para a noite, use o desligamento por ociosidade (passo 7) e o hábito de rodar `cs2-beta.ps1 stop`.
4. Em *EC2 → Settings → Data protection and security*, ligue **EBS encryption** por padrão (região sa-east-1).
5. Crie um usuário IAM só para operar (não use a conta raiz no dia a dia): *IAM → Users → `carmine-operator`*, com a política `infra/cs2/aws/operator-policy.json` (permite apenas ver, ligar, desligar e abrir terminal **na instância com a tag `Name=carmine-cs2-beta`**), chave de acesso e `aws configure --profile carmine`.

### 2. Rede e papel da instância

```sh
export AWS_DEFAULT_REGION=sa-east-1
VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)

# Security Group: só o jogo.
SG=$(aws ec2 create-security-group --group-name carmine-cs2 --vpc-id "$VPC" \
  --description 'CS2 Carmine: UDP 27015-27016, sem SSH' --query GroupId --output text)
aws ec2 authorize-security-group-ingress --group-id "$SG" --protocol udp --port 27015-27016 --cidr 0.0.0.0/0

# Papel que deixa o agente SSM falar com a AWS (nenhuma outra permissão).
aws iam create-role --role-name carmine-cs2-ec2 --assume-role-policy-document \
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name carmine-cs2-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name carmine-cs2-ec2
aws iam add-role-to-instance-profile --instance-profile-name carmine-cs2-ec2 --role-name carmine-cs2-ec2
sleep 10   # o perfil leva alguns segundos para propagar
```

### 3. Instância e IP fixo

```sh
ID=$(aws ec2 run-instances \
  --image-id resolve:ssm:/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --instance-type m6a.xlarge \
  --iam-instance-profile Name=carmine-cs2-ec2 \
  --security-group-ids "$SG" \
  --block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=100,VolumeType=gp3,DeleteOnTermination=false}' \
  --metadata-options 'HttpTokens=required,HttpEndpoint=enabled' \
  --instance-initiated-shutdown-behavior stop \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=carmine-cs2-beta}]' \
                       'ResourceType=volume,Tags=[{Key=Name,Value=carmine-cs2-beta}]' \
  --query 'Instances[0].InstanceId' --output text)
aws ec2 wait instance-running --instance-ids "$ID"

# IP fixo: este é o endereço que vai para o cadastro da API.
ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=carmine-cs2-beta}]' --query AllocationId --output text)
aws ec2 associate-address --instance-id "$ID" --allocation-id "$ALLOC"
aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text
```

Anote o IP (`<IP>`). Dois minutos depois, `aws ssm describe-instance-information` deve listar a instância (o Ubuntu da Canonical já traz o agente SSM). Para abrir o terminal você precisa do [session-manager-plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html) no PC.

### 4. Instalar os servidores (na instância)

```sh
aws ssm start-session --target "$ID"      # ou: ./infra/cs2/aws/cs2-beta.ps1 shell
sudo -i
```

O repositório é privado: a instância usa uma *deploy key* só de leitura.

```sh
apt-get update && apt-get install -y git
ssh-keygen -t ed25519 -N '' -C carmine-cs2-aws -f /root/.ssh/carmine_deploy
cat /root/.ssh/carmine_deploy.pub
```

No GitHub: *Settings → Deploy keys → Add deploy key* (cole a chave, **deixe "Allow write access" desmarcado**). Depois:

```sh
export GIT_SSH_COMMAND='ssh -i /root/.ssh/carmine_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new'
git clone git@github.com:caiomayan/carmine.git /opt/carmine-src
cd /opt/carmine-src            # (enquanto o PR da S09b não for ao main: git checkout feat/s09b-cs2-linux)

# ~69 GB, 30–90 min: rode como unidade do systemd para não morrer se o terminal cair.
systemd-run --unit=carmine-install --collect \
  /opt/carmine-src/infra/cs2/linux/install.sh --download-cs2
journalctl -fu carmine-install        # acompanhe; termina com "Pronto."
```

O instalador é idempotente: se falhar, corrija e rode de novo. O que ele faz está no cabeçalho de `infra/cs2/linux/install.sh` e em `infra/cs2/linux/README.md`.

### 5. Cadastrar os servidores na API e colar as chaves

Na VM de **produção** (Oracle; o mesmo acesso dos outros runbooks), um Servidor Carmine por perfil, **com o Elastic IP**:

```sh
/opt/carmine/bin/dc exec api node dist/game-servers/servers.cli.js create --name retake-beta --mode retake --address <IP>:27015
/opt/carmine/bin/dc exec api node dist/game-servers/servers.cli.js create --name dm-beta --mode deathmatch --address <IP>:27016
```

Cada comando imprime a chave **uma única vez**. Na instância AWS, uma por arquivo (`sudoedit` abre o editor; mantenha os arquivos 0600):

```sh
sudoedit /etc/carmine-cs2/retake.env       # CARMINE_API_KEY=<chave retake-beta>   CS2_GSLT=<token 1>
sudoedit /etc/carmine-cs2/deathmatch.env   # CARMINE_API_KEY=<chave dm-beta>       CS2_GSLT=<token 2>
```

Os tokens GSLT vêm do estoque descrito em `troca-de-token-gslt.md` (um por servidor, em contas Steam distintas). Depois:

```sh
systemctl start carmine-cs2.target
journalctl -u carmine-cs2@retake -f        # procure "Carmine.Core: API no ar"
systemctl status carmine-cs2@retake carmine-cs2@deathmatch
```

Os dois serviços sobem sozinhos sempre que a instância liga e reiniciam sozinhos se caírem. Confira na home do site que os dois aparecem online e entre no jogo (`connect <IP>:27015`) para ver o Loadout.

### 6. Desligar e conferir o custo parado

`./infra/cs2/aws/cs2-beta.ps1 stop` (ou `sudo shutdown -h now` dentro da instância). Em *Billing → Cost Explorer* o custo do dia seguinte deve ser ~US$ 0,6 (disco + IP).

### 7. (Opcional) Desligar sozinha quando ociosa

Rede de segurança contra esquecer a instância ligada: o CloudWatch para a instância depois de uma hora de CPU baixa. **Calibre o limite antes**: na primeira sessão, olhe o gráfico `CPUUtilization` da instância com os servidores vazios e com jogadores; o limite deve ficar entre os dois (a ideia é que vazia fique abaixo e jogando fique bem acima; começo sugerido: 5%).

```sh
aws cloudwatch put-metric-alarm --alarm-name carmine-cs2-ociosa \
  --namespace AWS/EC2 --metric-name CPUUtilization --dimensions Name=InstanceId,Value="$ID" \
  --statistic Average --period 300 --evaluation-periods 12 --threshold 5 \
  --comparison-operator LessThanThreshold --treat-missing-data notBreaching \
  --alarm-actions arn:aws:automate:sa-east-1:ec2:stop
```

## No dia a dia

Do PowerShell (AWS CLI v2 e o perfil `carmine`):

```powershell
./infra/cs2/aws/cs2-beta.ps1 start  -Profile carmine    # liga, espera ficar pronta, mostra o IP
./infra/cs2/aws/cs2-beta.ps1 status -Profile carmine    # estado, IP e quanto custou a sessão
./infra/cs2/aws/cs2-beta.ps1 stop   -Profile carmine    # desliga (pergunta antes)
./infra/cs2/aws/cs2-beta.ps1 shell  -Profile carmine    # terminal na instância, sem SSH
```

Sem o script, o mesmo com a CLI: `aws ec2 start-instances --instance-ids <id> --region sa-east-1` e `aws ec2 stop-instances ...`. Ligar leva 1–3 minutos e os servidores aparecem na home logo depois (~1 min). Avise os amigos do horário.

**Alertas no Discord**: cada vez que a instância desliga, a API manda "🔴 *servidor* está offline" para os dois servidores (e "🟢 voltou" ao ligar). No beta isso é esperado; ignore, ou tire `DISCORD_ALERT_WEBHOOK_URL` da produção durante o beta se incomodar (volta a valer quando a VPS definitiva entrar). Os dias de VIP congelam com indisponibilidade acima de 24 h (Termos): no beta ainda não há VIP pago.

## Atualizar, trocar token, consertar

- Update do CS2 ou dos plugins: `atualizacao-do-cs2.md` (seção produção).
- Token GSLT banido: `troca-de-token-gslt.md` (editar `/etc/carmine-cs2/<perfil>.env` e `systemctl restart carmine-cs2@<perfil>`).
- Logs: `journalctl -u carmine-cs2@retake` (e `@deathmatch`). Reiniciar um: `systemctl restart carmine-cs2@retake`.
- Memória: `free -h` e `systemctl status carmine-cs2.target`. Se a RAM de 16 GiB ficar apertada com 10+18 jogadores, reduza o `maxPlayers` do perfil ou suba o tipo (`aws ec2 modify-instance-attribute --instance-id <id> --instance-type Value=m6a.2xlarge` com a instância desligada).

## Encerrando o beta (e a transição para a VPS)

1. Na VPS definitiva siga `lancamento-cs2.md` (um clone e `vps-bootstrap.sh`: o mesmo `install.sh` por baixo, com o endurecimento, o plugin por release e a atualização automática do CS2); nada da AWS é usado.
2. Avise os amigos, `servers retire --name retake-beta` / `dm-beta` na API.
3. Na AWS, para zerar o custo: terminar a instância, **liberar o Elastic IP** (cobra mesmo parado) e **apagar o volume** (o `DeleteOnTermination=false` o deixa vivo):

   ```sh
   aws ec2 terminate-instances --instance-ids "$ID" && aws ec2 wait instance-terminated --instance-ids "$ID"
   aws ec2 release-address --allocation-id "$ALLOC"
   aws ec2 delete-volume --volume-id <vol-...>     # aws ec2 describe-volumes --filters Name=tag:Name,Values=carmine-cs2-beta
   aws ec2 delete-security-group --group-id "$SG"
   ```
