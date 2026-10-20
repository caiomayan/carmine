# Discord integrado (S15): passo a passo do dono

O que a integração faz: a pessoa vincula o Discord nos ajustes do Perfil, o bot dá os cargos **Jogador**, **VIP**, **Staff** e **Dono** no servidor do Carmine (e os atualiza sozinho em até 1 minuto) e mantém uma mensagem com o status dos servidores num canal. As decisões estão no [ADR 0020](../adr/0020-discord-vinculo-rest-e-reconciliacao.md).

Sem as variáveis `DISCORD_*` a integração fica **desligada, sem erro**: o botão do Perfil aparece desabilitado e nenhum job roda. Dá para fazer este passo a passo com calma; nada quebra enquanto ele não termina.

Você vai precisar de uma conta Discord com a permissão de administrar o servidor do Carmine e do acesso ao `/opt/carmine/.env` na VPS.

## 1. Ligar o modo desenvolvedor do Discord

Em **Configurações do usuário > Avançado**, ligue **Modo desenvolvedor**. Com ele, o botão direito em servidor, cargo, canal ou usuário mostra **Copiar ID**, que usaremos abaixo.

## 2. Criar os cargos no servidor

Em **Configurações do servidor > Cargos**, crie quatro cargos (os nomes são livres; sugestão: `Jogador`, `VIP`, `Staff`, `Dono`). Eles só marcam quem a pessoa é, não precisam de nenhuma permissão. Se já existem cargos com esses papéis, use-os: o bot só adiciona e tira os quatro e **nunca mexe nos outros cargos** da pessoa.

Copie o ID de cada um (botão direito no cargo na lista > **Copiar ID**) e o ID do servidor (botão direito no ícone do servidor > **Copiar ID do servidor**).

Qualquer um dos quatro pode ficar de fora (variável vazia): o cargo sem ID simplesmente não é gerenciado.

## 3. Criar o aplicativo no Developer Portal

1. Entre em <https://discord.com/developers/applications> e clique em **New Application**. Nome: `Carmine`.
2. Em **General Information**, copie o **Application ID**. Ele é o `DISCORD_CLIENT_ID`.
3. Em **OAuth2**, clique em **Reset Secret**, confirme e copie o **Client Secret**. Ele é o `DISCORD_CLIENT_SECRET` (só aparece uma vez).
4. Ainda em **OAuth2 > Redirects**, adicione exatamente:

   ```
   https://stcarmine.com/api/auth/discord/callback
   ```

   O endereço precisa ser idêntico ao que a API usa (`PUBLIC_WEB_URL` + `/api/auth/discord/callback`), inclusive o `https` e sem barra no fim. Para testar em outro ambiente, cadastre também o redirect dele.

## 4. Criar o bot e pegar o token

1. Em **Bot**, deixe o bot como **privado** (desligue **Public Bot**, para ninguém mais convidá-lo).
2. Não ligue nenhum **Privileged Gateway Intent**: o Carmine só usa a API REST e não conecta no gateway.
3. Clique em **Reset Token**, confirme e copie. Ele é o `DISCORD_BOT_TOKEN` (só aparece uma vez).

> O Client Secret e o token do bot são senhas. Nunca vão para o repositório, para o chat ou para um print. Se vazarem, use **Reset** de novo no portal e troque no `.env`.

## 5. Convidar o bot para o servidor

Abra este endereço, trocando `SEU_APPLICATION_ID` pelo ID do passo 3, escolha o servidor do Carmine e autorize:

```
https://discord.com/oauth2/authorize?client_id=SEU_APPLICATION_ID&scope=bot&permissions=268454913
```

As permissões pedidas (`268454913`) são as mínimas:

| Permissão | Para quê |
|---|---|
| **Manage Roles** | Dar e tirar os quatro cargos |
| **Create Instant Invite** | O Discord exige para o bot colocar no servidor, com a autorização da pessoa (`guilds.join`), quem vincula sem estar nele |
| **View Channel**, **Send Messages**, **Embed Links** | Postar e editar a mensagem de status (só no canal dela) |

O bot **não** precisa de Administrator nem de Manage Messages (ele edita a própria mensagem).

## 6. Pôr o cargo do bot acima dos cargos sincronizados

Em **Configurações do servidor > Cargos**, o bot ganha um cargo com o nome dele. **Arraste esse cargo para cima dos quatro cargos do Carmine** (o Discord só deixa o bot mexer em cargos abaixo do dele). Sem isso o Discord responde 403 e os cargos não mudam; o log da API mostra `Discord recusou ... HTTP 403`.

## 7. Escolher o canal do status (opcional)

Crie um canal só de leitura para o status, por exemplo `#servidores`, e dê ao cargo do bot **Ver canal**, **Enviar mensagens** e **Inserir links** nele. Copie o ID do canal (botão direito > **Copiar ID do canal**): é o `DISCORD_STATUS_CHANNEL_ID`.

O bot posta **uma** mensagem e passa a **editá-la** a cada minuto. Se alguém a apagar, ele posta outra e continua nela. Sem `DISCORD_STATUS_CHANNEL_ID` o bot de status fica desligado e os cargos funcionam igual.

## 8. Preencher o `/opt/carmine/.env`

Na VPS, edite `/opt/carmine/.env` e preencha (sem aspas, sem espaços):

```
DISCORD_CLIENT_ID=<Application ID>
DISCORD_CLIENT_SECRET=<Client Secret>
DISCORD_BOT_TOKEN=<token do bot>
DISCORD_GUILD_ID=<ID do servidor>
DISCORD_ROLE_PLAYER_ID=<ID do cargo Jogador>
DISCORD_ROLE_VIP_ID=<ID do cargo VIP>
DISCORD_ROLE_STAFF_ID=<ID do cargo Staff>
DISCORD_ROLE_OWNER_ID=<ID do cargo Dono>
DISCORD_STATUS_CHANNEL_ID=<ID do canal do status, ou vazio>
```

As quatro primeiras são obrigatórias para ligar; se preencher só parte delas, a integração continua desligada e o log da API, ao subir, diz o que falta (`Discord desligado: faltam ...`). Os IDs são números de 17 a 20 dígitos.

Depois aplique, como nos demais valores do `.env` ([deploy-e-rollback.md](deploy-e-rollback.md)): *Run workflow* no commit atual, ou na VM:

```
sudo /opt/carmine/bin/dc up -d api
```

## 9. Conferir

1. Abra o seu Perfil logado (`https://stcarmine.com/<seu ID>`): em **Ajustes do Perfil**, a linha **Discord** deve ter o botão **Vincular Discord** habilitado.
2. Clique, autorize no Discord e volte: o aviso "Discord ligado" aparece e o seu usuário fica na linha. Você ganha o cargo **Jogador** na hora (e, se não estava no servidor, entra nele).
3. Dê um VIP de teste (painel da Staff ou `vip grant --steam-id ... --days 1 --by ... --reason ...`, ver o README) ou um papel de Staff pelo painel: o cargo muda em até 1 minuto.
4. O canal de status mostra os servidores e o horário da última atualização (o carimbo "Hoje às ..." do embed muda a cada minuto).
5. Em **Desvincular**, os cargos saem e o botão volta.

## Quando algo não funciona

| Sintoma | Causa provável |
|---|---|
| Botão desabilitado: "O vínculo com o Discord não está disponível agora" | Falta alguma das quatro variáveis base, ou a API não foi recriada depois de editar o `.env`. Veja o log da API |
| Volta do Discord com "O pedido expirou ou não era deste navegador" | O fluxo demorou mais de 10 min, ou o navegador bloqueou cookies. Tentar de novo |
| `invalid redirect_uri` na tela do Discord | O redirect do passo 3 não é idêntico ao `PUBLIC_WEB_URL` + `/api/auth/discord/callback` |
| Vincula, mas o cargo não aparece; log com `HTTP 403` | O cargo do bot está abaixo dos cargos do Carmine (passo 6), ou faltam as permissões do passo 5 |
| Vincula, mas a pessoa não entra no servidor | Falta **Create Instant Invite** para o bot (passo 5) |
| O status não aparece; log com `Mensagem de status do Discord não atualizou` | O bot não vê o canal ou não pode enviar mensagens nele (passo 7), ou o `DISCORD_STATUS_CHANNEL_ID` está errado |
| Quem saiu do servidor e voltou ficou sem cargos | O bot reconfere quem não está no servidor a cada 30 minutos |
| O servidor tem "triagem de membros" (regras a aceitar) | Quem entra pelo vínculo fica pendente até aceitar as regras; os cargos são dados mesmo assim, mas só valem depois que a pessoa aceita |

O Discord limita o número de chamadas por segundo. A API respeita os limites sozinha (espera e repete); em picos de muitos VIPs vencendo ao mesmo tempo, os cargos podem levar alguns segundos a mais, nunca mais que o próximo ciclo.

## Trocar ou desligar

- **Trocar um segredo:** gere o novo no portal (**Reset Secret** / **Reset Token**), troque no `.env` e recrie a API (`sudo /opt/carmine/bin/dc up -d api`).
- **Desligar:** deixe as variáveis em branco e recrie a API. Os vínculos continuam no banco, os cargos que já foram dados ficam como estão, e quem desvincular no site deixa de ter o vínculo (sem o bot ligado, os cargos não são tirados).
- **Remover um cargo do Carmine:** limpe só o `DISCORD_ROLE_*_ID` dele. O cargo não é mais gerenciado (o bot não tira mais de ninguém).
