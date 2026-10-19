# Discord: vínculo (não login), só REST e cargos por reconciliação

A S15 liga o Discord ao Carmine em três frentes: o vínculo da Conta, os cargos no servidor e a mensagem de status. Três decisões a sustentam.

**O Discord é um vínculo, não um login.** A Steam continua a única autenticação (ADR 0007). O OAuth2 do Discord só roda com a sessão Steam ativa e liga o usuário do Discord à Conta da sessão; não existe "entrar com Discord", não cria Conta e não abre sessão. O `state` é aleatório, de uso único e preso à Conta que começou (Valkey) e ao navegador (cookie), então um link forjado não liga o Discord de alguém à Conta de outra pessoa. O `redirect_uri` é fixo (`<PUBLIC_WEB_URL>/api/auth/discord/callback`). Guardamos só o ID e o nome do Discord; o token do OAuth2 é usado uma vez (ler o usuário e, com `guilds.join`, pôr a pessoa no servidor) e descartado. Um Discord só liga a uma Conta (índice único): a segunda tentativa volta com uma mensagem clara. Se o Discord falha na hora do vínculo, ele é desfeito em vez de ficar pela metade, porque sem o token não dá para pôr a pessoa no servidor depois.

**Só REST, sem gateway.** A spec pede cargos, um vínculo e uma mensagem de status. Tudo isso é chamada REST com o token do bot: dar e tirar cargo, ler os cargos de um membro, postar e editar uma mensagem. O gateway (conexão WebSocket permanente) só serviria para reagir a eventos do Discord (alguém entra, sai, usa um comando), e a S15 não precisa de nenhum. Ficar sem ele evita uma conexão que precisa de heartbeat, reconexão e _sharding_, e deixa a API sem estado do Discord para reiniciar. O custo é não reagir na hora a quem entra no servidor depois de vinculado; o job reconfere esses casos num prazo maior (abaixo). Um cliente `DiscordRest` respeita o rate limit (`X-RateLimit-Remaining`/`Reset-After` por rota e `retry_after` do 429, com o global travando tudo) e falha em vez de esperar mais de 30 s, deixando para o próximo ciclo.

**Cargos por reconciliação, não por evento.** O VIP que vence não gera evento, então um job periódico (`DISCORD_SYNC_SECONDS`, 30 s, dentro do 1 minuto do aceite) calcula o que cada Conta vinculada deve ter (Jogador sempre, VIP com Período ativo, Staff com qualquer papel, Dono com o papel `owner`) e compara com o que a última passada deixou aplicado (`discord_links.synced_roles`). Só quando há diferença ele lê os cargos reais da pessoa no Discord e aplica a diferença, mexendo apenas nos cargos com ID configurado; os cargos da comunidade nunca são tocados. Repetir é inofensivo: o estado desejado é recalculado do banco e comparado com o real a cada vez. Por isso concessão, revogação e vencimento do VIP, mudança de papel da Staff e o vínculo passam todos pelo mesmo caminho e nenhum precisa chamar o Discord direto (acoplando o VIP e o painel da Staff ao Discord). Quem sai do servidor volta a ser conferido a cada 30 min; a cada 6 h todos são conferidos mesmo sem mudança, para pegar um cargo mexido à mão. Três falhas seguidas encerram a passada (Discord fora do ar não é martelado) e a Conta que falhou espera 10 s.

**A mensagem de status** é uma só por canal, editada a cada minuto; o ID dela fica no banco (`discord_status_messages`), então um reinício não posta outra. Se alguém a apagar, a próxima passada posta uma nova e passa a editá-la.

## Consequences

- Sem as variáveis `DISCORD_*` (as quatro base) a integração é nula: o botão do Perfil fica desabilitado e nenhum job roda. Variáveis pela metade desligam também e a API avisa no boot o que falta.
- O vínculo é dado pessoal (ID e nome de usuário do Discord): consta na Política de Privacidade e é apagado ao desvincular e na anonimização da Conta (S08).
- Uma pessoa que revoga o app nas configurações do Discord continua com o vínculo e os cargos até desvincular no site, porque não guardamos token nem escutamos eventos.
- Quem sai e volta ao servidor recebe os cargos em até 30 min, não na hora.
- O bot precisa de um cargo acima dos que sincroniza e das permissões Manage Roles, Create Instant Invite (exigida pelo `guilds.join`) e, no canal de status, View Channel, Send Messages e Embed Links (ver `docs/operacao/discord.md`).
- Uma única instância da API roda os jobs (como os demais); com mais instâncias seria preciso um lock no Valkey.
- A migração é só aditiva (duas tabelas), então o rollback é de imagem.

## Considered Options

- **Login com Discord:** descartada pelo ADR 0007 (a Steam identifica a Conta, e uma segunda identidade reabriria a fusão de contas).
- **Gateway do Discord (discord.js):** descartada, pelos motivos acima.
- **Guardar o token do OAuth2 (cifrado) para pôr a pessoa no servidor depois:** descartada. Um token de longa duração guardado é um segredo a mais para vazar, sem necessidade (o `guilds.join` roda na hora do vínculo).
- **Atualizar os cargos por evento (VIP e Staff chamam o Discord):** descartada, por não cobrir o vencimento do VIP e por acoplar domínios que não precisam saber do Discord. Um evento poderia acelerar o job no futuro, mas o prazo de 30 s já cumpre o aceite.
