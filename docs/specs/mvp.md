# Spec do MVP · v2

> Linguagem do domínio: [`CONTEXT.md`](../../CONTEXT.md). Decisões: [`docs/adr/`](../adr/). Identidade visual de referência: [`prototypes/identity/liberty-final.html`](../../prototypes/identity/liberty-final.html), com os tokens em [`prototypes/identity/liberty/tokens-exportados-dono-v2.css`](../../prototypes/identity/liberty/tokens-exportados-dono-v2.css) e as cores de contexto em [`prototypes/identity/shared/liberty-status.css`](../../prototypes/identity/shared/liberty-status.css). A direção 2c foi substituída.
>
> v2 incorpora a revisão do Product Owner (2026-10-10): núcleo jogável antes de cobrança, regras de gameplay, estados de pagamento, comportamento em falhas e critérios de saída do beta.

## Objetivo

Colocar no ar Servidores Carmine de **Retake** e **Deathmatch** em que qualquer jogador entra pelo IP e já tem uma Conta, e um site app-first onde ele monta o Inventário com visualização 3D, equipa o Loadout que aparece no jogo, vê quem está jogando agora, acompanha as Estatísticas e pode comprar VIP.

A promessa central, que tem prioridade sobre todo o resto, é: **entrar, equipar e ver a skin no jogo.**

## Fases

| Fase | Fatias | Termina com |
|---|---|---|
| **A · Núcleo jogável** | S00 a S09 | Amigos jogam Retake e DM com o próprio Loadout, com moderação e termos mínimos |
| **Beta fechado** | S10 | Critérios qualitativos de saída atendidos |
| **B · Completo** | S11 a S15 | Perfil completo, Estatísticas, Ranking, Denúncias, VIP pago e Discord integrado |
| **Abertura** | — | Lista de permissão desligada |

## Fora do escopo do MVP

- Matchmaking, fila, ELO e servidores sob demanda (Fase 2, ADR 0001).
- 5v5 casual (entra logo depois do MVP).
- **Cartão de crédito e recorrência** (só Pacotes VIP via Pix no MVP).
- Imagem OG personalizada com o Loadout (o link do Perfil tem prévia simples).
- Feed, seguir, comentários, clips e destaques.
- Demos, anti-cheat próprio e heurísticas além do VAC.
- Bot de Discord e vínculo de conta Discord (fatia S15, depois do beta).
- Atualização do Loadout em tempo real durante a partida (ADR 0006).
- Mapas da Workshop.
- Qualquer mecânica aleatória paga (ADR 0011, permanente).

## Princípios transversais

- **Interface:** app-first, sem landing page. Barra superior com container global de 1080 px e margem lateral mínima de 36 px. Identidade **Liberty**: só neutros (preto quente e creme, escala de cinzas), sem cor de acento de marca; ação primária = preenchido invertido. Arredondamento nível shadcn; botões, abas e filtros sem borda, com fundo mais claro no hover e no ativo; poucas linhas. Rodapé só no fim real da página. Cores de contexto (online, lotado, erro, sucesso, info, VIP) apenas em sinais pequenos. Animações sutis em toda interação, respeitando `prefers-reduced-motion`. Polimento visual com a skill impeccable.
- **Stack de UI:** Tailwind CSS v4 + shadcn/ui + Animate UI, ícones Lucide (animados via lucide-animated) e marcas via Simple Icons (ADR 0014).
- **Texto:** PT-BR, tom sóbrio tratando por "você", com tempero da marca só em momentos leves e nunca em erros, pagamentos ou moderação. Todas as strings externalizadas (i18n desde o dia 1).
- **Acessibilidade:** WCAG 2.2 AA, navegação completa por teclado, foco visível, alvos de 44 px no mobile. Todo controle que existe por arrasto (stickers, charms) também existe por formulário.
- **Responsivo:** 390 px a 1440 px+ sem scroll horizontal.
- **Desempenho:** num celular intermediário com 4G lento (perfil "Slow 4G" do Playwright), a home e o editor ficam interativos em até 4 s.
- **Falhas externas não parecem perda:** quando a Steam, o viewer 3D ou a nossa API falham, o jogador vê o último estado conhecido e uma mensagem do que está acontecendo, nunca uma Conta ou um Inventário vazio.
- **Plugins:** só falam com a API (ADR 0005), com chave por servidor.
- **Limites de uso:** Inventário de até 300 Itens por Conta; Presets: 1 no grátis e até 20 no VIP.
- **Qualidade:** TDD no domínio da API; testes de integração contra Postgres real; Playwright E2E nos fluxos críticos; CI bloqueia merge com lint, typecheck ou teste falhando.

## Dependências

| Fatia | Depende de |
|---|---|
| S00 Fundação | — |
| S01 A Conta nasce no jogo | S00 |
| S02 Gameplay de Retake e Deathmatch | S00 |
| S03 Login Steam e Perfil básico | S01 |
| S04 Inventário | S03 |
| S05 Loadout, Presets e aplicação no jogo | S04 |
| S06 Servidores ao vivo e amigos jogando | S01 (amigos: S03) |
| S07 Moderação essencial | S03 |
| S08 Termos e privacidade mínimos | — |
| S09 Operação de produção | S00, S02 |
| S10 Beta fechado | S00 a S09 |
| S11 Perfil completo | S03 |
| S12 Estatísticas e Ranking | S01, S02 |
| S13 Denúncias e log de chat | S07 |
| S14 VIP e pagamentos | S05, S08, S09 |
| S15 Discord integrado | S07, S14 |

---

## Fase A · Núcleo jogável

### S00 · Fundação

Monorepo, ferramentas e ambientes prontos para as fatias seguintes.

- Monorepo pnpm + Turborepo: `apps/web` (Next.js), `apps/api` (NestJS/Fastify + Drizzle), `packages/contracts` (Zod + OpenAPI), `plugins/` (solution .NET, CounterStrikeSharp), `infra/` (Compose e scripts).
- Docker Compose local com Postgres e Valkey.
- Web com o sistema de tokens da 2c (cores, tipografia, motion), container global, barra superior, troca de tema sem flash e wordmark/favicon de `prototypes/identity/brand/`.
- API com health check, logs estruturados e geração de OpenAPI; cliente C# gerado a partir dele.
- CI no GitHub Actions (lint, typecheck, testes, build de imagens no GHCR).
- Servidor CS2 local de desenvolvimento no Windows com Metamod e CounterStrikeSharp, com script de instalação reproduzível.

**Aceite**
- `pnpm dev` sobe web, API, Postgres e Valkey localmente; a home renderiza com os tokens da 2c nos dois temas, com 0 erros de console.
- Um PR com teste falhando é bloqueado pela CI.
- O servidor CS2 local carrega um plugin "hello" do repositório que chama o health check da API.

### S01 · A Conta nasce no jogo

O primeiro connect a um Servidor Carmine cria a Conta (ADR 0007).

- Cadastro de Servidores Carmine na API, cada um com Modo, endereço e chave própria (guardada com hash, rotacionável).
- Plugin próprio **Carmine.Core**: no connect, envia o SteamID64 e o nome atual do jogador para a API, que cria a Conta se não existir e devolve o Nome de exibição.
- Alocação do ID público conforme ADR 0013.
- Avatar buscado na Steam Web API de forma assíncrona; sem resposta, usa um avatar neutro e tenta de novo no próximo connect.
- Nome Steam importado passa pelo filtro de palavras ofensivas; se reprovado, a Conta aparece como "Jogador #ID" até ter um nome aceitável.
- O plugin aplica o Nome de exibição no jogo (ADR 0008).
- No primeiro connect da Conta, mensagem no chat: "Bem-vindo ao Carmine. Ao jogar você concorda com os termos: stcarmine.com/termos".
- A API serve `GET /api/equipped/v5/{steamId}.json` no formato do `cs2-css-inventory-simulator`, ainda vazio (só Armas padrão).
- **API fora do ar no connect:** o jogador joga normalmente com o nome Steam e Armas padrão; o plugin guarda o connect e cria a Conta quando a API voltar.

**Aceite**
- Um SteamID que nunca jogou conecta, e em até 2 s existe uma Conta não reivindicada com ID público ≥ 10.000.
- Duas Contas criadas em sequência recebem IDs crescentes, sem colisão, mesmo com connects simultâneos.
- A mensagem de boas-vindas aparece só no primeiro connect da Conta.
- Uma chave de servidor inválida recebe 401 e não cria nada.
- Com a API desligada, o jogador entra e joga; ao religar, a Conta é criada sem intervenção.

### S02 · Gameplay de Retake e Deathmatch

O jogo em si precisa ser bom, não só os plugins carregados.

- **Retake:** 9 vagas (5 TR × 4 CT) com o cs2-retakes; alocador de armas por tipo de round (pistola, meia compra, compra cheia, sorteados) e 1 AWP por time com chance; plantio automático; balanceamento de times entre rounds.
- **Deathmatch:** FFA com 16 vagas, menu de armas, proteção de spawn de 1 s, pontos de spawn por mapa e mapa de 15 minutos.
- **Mapas:** pool Active Duty nos dois modos, votação ao fim do mapa e `!rtv`; DM com rotação curta de mapas de ação rápida.
- Plugins de gameplay fixados em versão (pesquisa de 2026-10-10):

  | Função | Plugin | Licença |
  |---|---|---|
  | Base | Metamod + CounterStrikeSharp 1.0.376 (.NET 10) | — |
  | Skins | ianlucas/cs2-css-inventory-simulator 3.5.2 (`invsim_fallback_team true` no DM) | MIT |
  | Retake | B3none/cs2-retakes 3.1.1 (`EnableFallbackAllocation=false`) | GPL-3.0 |
  | Alocador de armas | Micka2302/cs2-retakes-allocator-2.0 (`AutoUpdateSignatures=true`, `CapabilityWeaponPaints=true`) | GPL-3.0 |
  | Deathmatch | NockyCZ/CS2-Deathmatch 1.3.6 (agora mantido por mrc4tt) | MIT |
  | Votação de mapa e `!rtv` | M-archand/RockTheVote-CSS 2.4.0 + CS2MenuManager | Sem licença: usar sem modificar nem redistribuir |
  | Vaga reservada | Própria, dentro do Carmine.Core (nenhuma existente lê permissões externas nem retira "o último que entrou") | — |
- Configuração dos servidores versionada em `infra/`.

**Aceite**
- Uma sessão real de 30 minutos com amigos em cada modo, sem bug bloqueante, com troca de mapa por votação e por `!rtv`.
- No DM, trocar de arma pelo menu mantém a skin equipada (sem conflito com o plugin de skins).
- No Retake, os times se rebalanceiam quando um lado fica com 2 jogadores a mais.

### S03 · Login Steam e Perfil básico

- Login Steam (OpenID) no site; é a única forma de autenticação.
- O primeiro login reivindica a Conta existente; se ela não existir (a pessoa nunca jogou), é criada já reivindicada.
- Sessão por cookie `httpOnly`, `Secure`, `SameSite=Lax`, com proteção CSRF nas mutações. Se a sessão expirar durante uma edição, a edição é guardada localmente e restaurada depois do novo login.
- Barra superior mostra avatar e Nome de exibição; logout.
- **Perfil básico** em `stcarmine.com/<idPúblico>`: Nome de exibição, `#ID`, avatar Steam, link para o perfil Steam e o Loadout em vitrine. Uma URL com SteamID64 redireciona (301) para ela.
- **Sinal de reivindicação:** para visitantes, uma diferença sutil de cor ou disposição, nunca parecida com um selo de verificado. Para o dono de uma Conta não reivindicada que abre o próprio Perfil, vira um convite: "É você? Entre com a Steam para personalizar".
- **Primeiros passos** depois do primeiro login: uma orientação curta (o que é o Carmine, vínculo com a Steam, adicionar ao Inventário vs. equipar, usar `!ws` ou reconectar para ver no jogo), que pode ser fechada e reaberta.

**Aceite**
- Quem jogou antes e faz login vê a mesma Conta, com o mesmo ID público.
- Login, logout e expiração de sessão funcionam; uma mutação sem token CSRF é rejeitada; uma edição interrompida pela expiração é restaurada após o novo login.
- `/<id>` inexistente mostra 404 próprio; `/76561198…` válido redireciona.

### S04 · Inventário

- Catálogo de Itens a partir da `@ianlucas/cs2-lib`: skins de arma, facas, luvas, agentes, music kits, stickers e charms. **Armas padrão não aparecem.**
- Busca e filtros (tipo, arma, raridade, coleção), com estado vazio claro.
- Adicionar um Item ao Inventário com seus atributos: float dentro da faixa da skin, seed, StatTrak, nametag, até 5 stickers (posição, rotação e desgaste) e 1 charm (posição e seed). Até 300 Itens por Conta.
- Vários Itens para a mesma arma são permitidos.
- **Editar** um Item equipado ou usado em Presets atualiza o Item em todos os lugares (Loadout e Presets referenciam o Item).
- **Remover** um Item mostra onde ele está em uso (Loadout atual, Presets) antes de confirmar; os slots afetados voltam à Arma padrão. Por 8 s, um aviso oferece "Desfazer".
- Visualizador 3D do 3d.cstrike.app por iframe, controlado por postMessage. Imagens 2D para music kits e como fallback quando o 3D falhar, não houver WebGL ou o limite de uso for atingido; o fallback mantém todos os atributos editáveis por formulário (ADR 0006).
- Arrastar stickers e charms no 3D é a **última tarefa** da fatia, depois de todo o resto aceito.
- Itens exclusivos do VIP (agentes, music kits, StatTrak e nametag) aparecem com um cadeado sutil para quem não tem Período VIP ativo e podem ser vistos, mas não adicionados.
- **Inventário vazio** conduz até a primeira skin no jogo: sugestões de itens populares, "adicionar e equipar" em um passo e a instrução de `!ws`.

**Aceite**
- Adicionar uma AK com float 0,15, seed 661, StatTrak e 2 stickers reflete os mesmos valores no 3D e após recarregar a página.
- Um float fora da faixa da skin e um 301º Item são recusados pela API, não só pelo front.
- Com o 3D bloqueado (iframe sem resposta), todos os atributos continuam editáveis em 2D.
- Remover um Item equipado mostra os usos, e "Desfazer" o restaura nos mesmos slots.
- No perfil "Slow 4G" de celular, o editor fica interativo em até 4 s.

### S05 · Loadout, Presets e aplicação no jogo

- Equipar um Item do Inventário num slot, para CT, TR ou ambos; equipar outro Item no mesmo slot substitui o anterior, com aviso e "Desfazer". Desequipar volta à Arma padrão.
- **Período VIP sem pagamento:** a Staff pode conceder e revogar Períodos VIP manualmente (com log de auditoria). Isso permite testar as regras de VIP no beta antes da S14.
- Presets: o plano grátis tem 1 (o Loadout atual); o VIP tem até 20, com nome, ativáveis de uma vez.
- `equipped/v5` passa a devolver o Loadout real; Itens VIP só entram na resposta se a Conta tiver Período VIP ativo.
- O `cs2-css-inventory-simulator`, sem modificação, aplica o Loadout no connect e com `!ws`.
- **Fim do Período VIP:** quem está conectado mantém os Itens VIP até a próxima troca de mapa, `!ws` ou reconexão (o que vier primeiro). Os Itens VIP continuam no Inventário, mas deixam de ir para o jogo. Presets extras ficam somente leitura; se um Preset extra estava ativo, o Loadout atual continua, só sem os Itens VIP. O site avisa 3 dias antes e no dia do fim.
- **Renovação:** os Itens VIP voltam no próximo `!ws` ou connect.
- **API fora do ar:** quem já está conectado mantém o Loadout carregado; um novo connect recebe Armas padrão e a mensagem "Não conseguimos carregar seu Loadout agora; tente !ws em alguns minutos".
- Itens ou atributos que o plugin não consegue aplicar no jogo são sinalizados no editor antes de salvar.

**Aceite (matriz no jogo)**

| Categoria | Verificação no servidor |
|---|---|
| Skin de arma | Float, seed, StatTrak, nametag, stickers e charm corretos, em CT e em TR |
| Faca | Modelo e skin corretos nos dois lados |
| Luvas | Modelo e skin corretos nos dois lados |
| Agente | Agente CT e agente TR corretos |
| Music kit | Toca no MVP e no fim do round |
| Fim do VIP | Agente vencido vira o padrão no momento prometido |

- `equipped/v5` responde em p95 < 200 ms com cache.

### S06 · Servidores ao vivo e amigos jogando

- **Home = lista de servidores ao vivo:** Modo, mapa, jogadores/máximo, região (São Paulo), estado (online, lotado, offline) e Conectar.
- **Conectar:** abre `steam://connect`; ao lado, o IP copiável com uma instrução curta ("no console do CS2: `connect <ip>`"). No celular, mostra só o IP e a instrução para abrir no PC.
- Lotado mostra o estado claramente; offline desabilita Conectar.
- O Carmine.Core envia batimento a cada ~10 s com mapa e jogadores conectados; servidor sem batimento por 45 s fica offline.
- Atualização ao vivo por WebSocket ou SSE, com transição numérica suave. Se a conexão ao vivo cair, a home mostra o último estado conhecido com "atualizado há X s".
- **"Seus amigos jogando agora"** para Contas reivindicadas, com botão de entrar no mesmo servidor. Três estados distintos: nenhum amigo jogando; lista de amigos Steam privada (orientação opcional de como torná-la visível, explicando a consequência de privacidade); Steam indisponível.
- Filtros por Modo, com estado vazio.

**Aceite**
- Um jogador entra num servidor e o contador da home muda em até 15 s sem recarregar a página.
- Desligar o servidor o marca offline em até 60 s.
- Um amigo Steam conectado aparece no bloco, e "Entrar" abre o jogo no mesmo servidor; os três estados do bloco são distinguíveis.
- Sem `steam://` disponível, o jogador consegue entrar pelo IP copiado.

### S07 · Moderação essencial

Decisões do dono (2026-10-12) sobre conduta: trash talk e palavrão são liberados; ofensa pessoal repetida e direcionada leva gag ou mute; discriminação (racismo, homofobia, xenofobia, misoginia) é tolerância zero; ameaça e doxxing são ban permanente; cheat comprovado pela Staff é ban permanente já na 1ª vez (contas com VAC a Steam já barra). Voz ofensiva só é punida com gravação enviada ao suporte.

- **Papéis de Staff:** Dono, Admin e Moderador, com permissões na API valendo no site e no jogo (`STAFF_PERMISSIONS` em `packages/contracts`). Só o Dono altera papéis; o CLI `staff grant/revoke` cria o primeiro Dono e serve de recuperação, e a plataforma nunca fica sem Dono.
  - Moderador: busca Conta, vê o histórico, aplica Punições temporárias, kick e aviso, revoga só as que aplicou e reseta Nome de exibição.
  - Admin: tudo do Moderador, mais Punição permanente, revogar qualquer Punição, conceder e revogar Período VIP, editar os Servidores Carmine e ler o log de auditoria inteiro.
  - Ninguém pune a si mesmo; só o Dono pune alguém da Staff com papel igual ou maior.
- **Punições** globais (ban, mute, gag, kick e aviso), temporárias ou permanentes, sempre com uma **Categoria de infração** e um motivo livre interno. Ban, mute e gag expiram sozinhos no horário; kick e aviso são instantâneos.
- **Sugestão por reincidência:** o painel mostra o histórico e sugere a Punição da tabela abaixo, contando as ocorrências da mesma Categoria nos últimos 30 dias (ocorrências, não medidas; recurso aceito não conta). Quem decide é a Staff (no início, só o dono), que confirma ou ajusta; a sugestão do momento vai para o log de auditoria.

  | Categoria de infração | 1ª | 2ª | 3ª | 4ª+ |
  |---|---|---|---|---|
  | Chat ofensivo pessoal | aviso | gag 1 h | gag 24 h | gag 7 d |
  | Voz ofensiva | aviso | mute 1 h | mute 24 h | mute 7 d |
  | Griefing / AFK proposital / TK proposital | kick | ban 1 d | ban 7 d | ban 30 d |
  | Abuso de bug / exploit | ban 1 d | ban 7 d | ban 30 d | permanente |
  | Discriminação | gag 7 d + ban 1 d | ban 30 d | permanente | — |
  | Cheat / ameaça / doxxing / conta alternativa para fugir de ban | permanente | — | — | — |

- **No jogo:** o ban recusa o connect com a mensagem (Categoria, até quando no horário de Brasília e onde recorrer) e derruba quem está jogando; mute tira a voz e gag bloqueia o chat (comandos como `!ws` continuam). A resposta de cada batimento da S06 leva as Punições dos jogadores conectados (ADR 0017), então tudo vale em até ~10 s; kick e aviso são executados uma vez.
- **No site:** o ban derruba todas as sessões da Conta (índice de sessões por Conta). O banido pode entrar de novo para ver a Punição e como recorrer, mas o site fica só leitura (mutações respondem 403 `account_banned`). A própria Conta vê o motivo escrito pela Staff das Punições ativas; o Perfil público nunca mostra o motivo.
- **Perfil público:** selo da Punição ativa ("Banido até 20/10", "Sem chat até 14h"; a cor de erro só no selo) e histórico dos últimos 12 meses (sem avisos) com tipo, Categoria genérica ("Conduta no chat", "Griefing", "Cheat"...), data e duração. O ban permanente por cheat fica sempre visível. O Perfil privado não esconde Punições; recurso aceito remove a Punição do Perfil. Não há lista pública de banidos. (Validar com LGPD.)
  - Ajustes do dono (2026-10-13): o selo da Punição ativa é público, mas o histórico só aparece para quem está logado no site; nenhum Perfil é indexado por buscadores (`noindex`; o link continua compartilhável). Ban por cheat exige uma testemunha mencionada (da plataforma ou não) ou uma evidência anexada (link), ou as duas; a Categoria "Cheat" só aparece no Perfil com a evidência; só com testemunha, aparece "Violação das regras".
- **Chat no jogo:** `!chat off` oculta para o próprio jogador as mensagens de chat dos outros jogadores e `!chat on` volta; o padrão é o chat visível e a escolha fica na Conta (decisão do dono, 2026-10-13).
- **Recurso:** ticket no Discord, resposta em até 72 h, 1 recurso por ban permanente, revisado por alguém diferente de quem aplicou quando houver mais de uma pessoa na Staff. Página de **regras de conduta** com a tabela e o caminho do recurso (`/regras#recurso`), sem promessa de moderação imediata.
- **VIP:** ban temporário não congela o VIP; ban permanente por cheat encerra o VIP sem reembolso (registrado no log; validar CDC). Fraude e chargeback entram com a S14.
- **Painel de Staff no site** (`/api/staff/*`): buscar Conta (ID público, SteamID64, link Steam ou nome), histórico, aplicar e revogar Punições (revogação com "recurso aceito"), conceder e revogar Período VIP (o CLI `vip` continua), resetar Nome de exibição ("Jogador #ID" enquanto o nome Steam não mudar), papéis e os Servidores Carmine.
- **Nome dos Servidores Carmine:** a Staff edita o **Nome de vitrine** (texto livre da variante: "Retake · Rotação", "Deathmatch · Livre", "Retake · Mirage") e o **Código do servidor** (região·número: SP·1, SP·2, mostrado pequeno ao lado do IP). No jogo, o hostname vira `Carmine | Retake · Rotação | SP·2`, aplicado pelo Carmine.Core no batimento seguinte. Lançamento: Retake · Rotação e Deathmatch · Livre.
- **Log de auditoria** de toda ação de Staff (autor, ação, alvo, motivo, horário e o que mudou), consultável com filtros por autor, alvo e ação.
- **Discord:** moderação manual pela Staff com as ferramentas do próprio Discord, com a mesma tabela; sem espelhamento automático até a S15.

**Aceite**
- Um ban aplicado no site derruba o jogador em até 15 s e impede novo connect; um mute e um gag têm efeito em até 15 s.
- O ban derruba as sessões do site da Conta.
- Uma Punição temporária expira no horário e o jogador volta a jogar ou falar sem intervenção.
- O painel sugere a Punição da tabela conforme a reincidência em 30 dias.
- O Perfil público mostra a Punição ativa e o histórico sem o motivo livre; um recurso aceito a remove.
- Um Moderador não consegue alterar papéis de Staff.
- Toda ação de Staff aparece no log de auditoria.
- Mudar o nome de vitrine ou o código no painel muda o hostname do servidor em até 15 s.

### S08 · Termos e privacidade mínimos

- Termos de Uso (incluindo as regras de conduta), Política de Privacidade (LGPD) e canal de contato, redigidos com IA e revisados pelo dono.
- A Política de Privacidade explica o que o Perfil privado esconde e o que continua público.
- Procedimento de exclusão de dados exercitável: um pedido resulta na Conta anonimizada (procedimento em `docs/operacao/exclusao-de-dados.md`; painel da Staff, só o Dono, ou CLI `accounts anonymize`).
- Links no rodapé e no aviso do primeiro connect.

**Aceite**
- As páginas estão publicadas antes do beta.
- Um pedido de exclusão de teste é executado de ponta a ponta no ambiente de staging.

### S09 · Operação de produção

- Web, API, Postgres e Valkey na Oracle A1 via Docker Compose atrás do Cloudflare Tunnel; deploy pela CI.
- Backup noturno do Postgres no Cloudflare R2, com restauração testada.
- Servidores Retake e Deathmatch na VPS brasileira com anti-DDoS.
- Sentry no web, na API e nos plugins; monitoramento de uptime do site e dos servidores (A2S); alertas no Discord.
- Runbooks: atualização do CS2 (validar no staging local antes da produção), troca de token GSLT (ADR 0002) e restauração de backup.
- Orçamento operacional mensal registrado e revisado a cada nova fatia que aumente o consumo.

**Aceite**
- Um deploy no `main` chega à produção sem passo manual além da aprovação.
- Uma restauração de backup num banco limpo recupera os dados do dia anterior.
- Derrubar um servidor CS2 gera alerta no Discord em até 5 minutos.

---

## Beta fechado

### S10 · Beta fechado

- Acesso controlado ligando/desligando os servidores do beta (decisão do dono, 2026-10-18).
- Amigos do beta (até ~10) recebem IDs reservados, por reatribuição pela Staff (`accounts assign-reserved-id`): uma única vez por Conta, com auditoria, e o link do ID antigo responde 301 para o novo.
- **Matriz de experiências a cobrir:** jogador que começa pelo IP vs. pelo site; Conta sem VIP, com VIP concedido pela Staff e com VIP vencido; uso no celular.
- Registro de atritos numa nota Maestri, revisado antes de abrir.
- Abertura ao público: servidores ligados de forma contínua (VPS definitiva).

**Critérios de saída (qualitativos)**
- Alguém novo consegue entrar, equipar e jogar sem ajuda.
- Ele entende o que é grátis e o que é VIP.
- Ele sabe resolver um problema sozinho (o Loadout não apareceu, o servidor está cheio).
- Os atritos registrados foram resolvidos ou conscientemente adiados.

---

## Fase B · Completo

### S11 · Perfil completo

- Edição do Nome de exibição para Contas reivindicadas: 2 a 24 caracteres, não-único, filtro de palavras ofensivas, troca a cada 7 dias; a Staff pode resetar, e o nome volta ao nome Steam.
- **Perfil privado:** esconde as Estatísticas e a identidade no Ranking ("Jogador privado"). Nome, avatar, Loadout e presença em servidor continuam públicos, e a interface diz isso ao ativar.

**Decisões da S11**
- **Onde se edita:** no próprio Perfil ("Ajustes do Perfil", visível só para o dono): "Alterar nome" abre um formulário na página e o interruptor "Perfil privado" grava na hora. API: `PUT /api/me/display-name` e `PUT /api/me/privacy` (sessão + CSRF); `GET /api/me` traz `displayNameChange` (tem nome próprio? quando libera a troca) e o Perfil público traz `isPrivate`.
- **Regras do nome** (`normalizeDisplayName`, no domínio da API): NFC; espaços colapsados e aparado; some qualquer caractere de controle ou invisível (zero-width, bidi, BOM, Hangul filler, braille vazio); de 2 a 24 pontos de código; ao menos uma letra ou número; recusa `<`, `>`, `&`, `{` e `}` (podem virar marcação no placar ou token de cor em plugin de chat) e acentos empilhados (mais de 3 marcas seguidas). O filtro de palavras é o mesmo do nome Steam (`name-filter.ts`: PT-BR e EN, acentos, leetspeak, separadores, letras repetidas); a lista fica no repositório e amplia-se editando os conjuntos `WHOLE_WORDS` e `ANYWHERE`.
- **Prazo de 7 dias:** conta da última troca (`display_name_changed_at`), a 7 × 24 h exatas. Antes disso a API responde 409 `too_soon` com `nextChangeAt`, e a interface mostra a data em horário de Brasília. Nome recusado pelas regras não gasta o prazo; repetir o nome atual também não. A primeira troca é livre.
- **Reset da Staff** (painel /staff e CLI `staff reset-name --steam-id … --by … --reason …`, ambos com motivo e registro `display_name_reset` no log de auditoria): apaga o nome próprio e a Conta volta ao nome Steam. **O reset recomeça o prazo de 7 dias** (a pessoa não troca de novo na hora): é a resposta da moderação a um nome ruim, e sem o prazo um nome limítrofe poderia voltar imediatamente, multiplicando o trabalho da Staff; assim a Staff reage no máximo uma vez por semana por Conta. Sem nome próprio (o nome ruim é o da Steam), vale o comportamento da S07: "Jogador #ID" enquanto o nome Steam não mudar, sem mexer no prazo.
- **No jogo:** o connect já devolve o `displayName` efetivo (ADR 0008 e 0017): a troca vale no próximo connect, sem rota nova e **sem mudar o contrato do plugin** (nenhuma atualização do Carmine.Core nos servidores). O plugin já reaplica o nome da plataforma quando o jogador troca o nome na Steam no meio da partida (`player_changename`). Trocar o nome no site com o jogador dentro do servidor só aparece quando ele reconectar; levar para o batimento não compensa a complexidade. O nome Steam também perde `<>&{}` antes de ir ao jogo.
- **Perfil privado:** flag `profile_private` da Conta. A interface descreve o efeito antes e depois de ativar (o que some e o que continua público). A própria Conta continua vendo as suas Estatísticas. Ponto único para a S12: `apps/api/src/accounts/profile-privacy.ts` (`canSeeStats` e `rankingIdentity`); veja a S12.
- **Migração 0008, só aditiva:** colunas `custom_display_name`, `display_name_changed_at` e `profile_private` (default `false`) em `accounts`; a versão anterior da API as ignora, então o rollback de imagem continua seguro.

**Aceite**
- Trocar o nome antes de 7 dias é recusado com mensagem clara; o novo nome aparece no jogo no próximo connect.
- Com o Perfil privado, nenhuma Estatística da Conta aparece no Perfil, no Ranking nem na prévia do link.

### S12 · Estatísticas e Ranking

- O Carmine.Core envia eventos (kill, morte, assistência, dano, headshot, fim de round, início e fim de Sessão de jogo) em lotes idempotentes.
- **Definições:** K/D = kills ÷ max(mortes, 1); HS% = kills com headshot ÷ kills; ADR = dano em inimigos ÷ rounds jogados (só no Retake); KPM = kills ÷ minutos jogados (só no DM).
- **Não contam:** bots, aquecimento e kill em aliado (registrada para moderação). Suicídio conta como morte, não como kill. Um round abandonado no meio conta como jogado.
- **No Perfil:** Estatísticas por Modo; no total, só kills, mortes, assistências, K/D, HS% e tempo jogado (ADR e KPM não se somam entre Modos).
- **Ranking semanal por Modo** (top 50), reiniciando na segunda-feira às 00:00 (horário de Brasília):
  - Retake: rounds vencidos, com mínimo de 50 rounds na semana; desempate por K/D.
  - Deathmatch: KPM, com mínimo de 30 minutos na semana; desempate por HS%.
- O jogador vê o progresso até o mínimo ("faltam 12 rounds"). Semana sem ninguém elegível mostra estado vazio explicativo.
- **Integridade:** a Staff pode remover uma entrada do Ranking (com registro no log de auditoria); o jogador pode contestar pelo Discord.
- Rankings de semanas anteriores ficam consultáveis.
- **Perfil privado (S11):** Estatísticas e Ranking não decidem sozinhos quem aparece. Consultam `canSeeStats(conta, quemPede)` (Perfil privado: só a própria Conta vê as Estatísticas) e `rankingIdentity(conta)` (privado: "Jogador privado", sem ID, nome nem avatar) em `apps/api/src/accounts/profile-privacy.ts`. Vale também para o Ranking de semanas anteriores e para a prévia do link, que continua só com nome, #ID e avatar (`apps/web/src/lib/profile-metadata.ts`, com teste). Quem ativa o Perfil privado sai do Ranking já existente na hora, não só da próxima semana.

**Aceite**
- Uma kill com headshot aparece no Perfil em até 1 minuto.
- Um lote reenviado não duplica Estatísticas.
- Kills em bots e no aquecimento não entram nas Estatísticas.
- Um empate em rounds vencidos é resolvido pelo K/D.

### S13 · Denúncias e log de chat

- `!report` no jogo: escolher o jogador e o motivo; confirmação no chat ("Denúncia recebida; a Staff analisa em até 72 h").
- Limites: 1 Denúncia por alvo a cada 10 minutos e 5 por hora por jogador.
- A Denúncia leva servidor, round, horário e as últimas linhas do chat para a fila da Staff no painel.
- Denúncias de voz ou trapaça ficam registradas; sem demos, só geram Punição com evidência adicional (por exemplo, um clipe enviado no Discord). A página de regras explica isso.
- Log de chat dos servidores, retido por 30 dias.
- Webhook no canal da Staff no Discord a cada nova Denúncia.

**Aceite**
- Uma Denúncia feita no jogo aparece na fila e no Discord em até 1 minuto, com o chat do momento.
- A segunda Denúncia do mesmo alvo em 10 minutos é recusada com mensagem clara.

### S14 · VIP e pagamentos

- Página do VIP: o que é grátis e o que é VIP, e a política de vagas reservadas.
- **Pacotes VIP via Pix (Mercado Pago):** 1 mês (R$ 9,90), 3 meses (R$ 26,90) e 6 meses (R$ 49,90). Um "mês" são 30 dias.
- **Antes de pagar**, a tela mostra: a Conta beneficiada (avatar, nome e `#ID`), o valor, a duração, a nova data de fim e "pagamento único, sem renovação automática". O Pagador declara ser maior de idade, e o CPF dele fica registrado (ADR 0011).
- **Estados do pagamento**, visíveis em "Minhas compras" mesmo depois de fechar a página:
  - Pendente: QR válido por 30 minutos, recuperável.
  - Expirado: QR vencido, sem cobrança.
  - Aprovado: VIP concedido; normalmente em segundos. Se o webhook atrasar, a tela mostra "processando, até 10 minutos" e, depois disso, um link de suporte com o identificador do pagamento.
  - Recusado.
  - Reembolsado: os dias correspondentes saem do Período VIP.
- O VIP só é concedido depois que o webhook é validado (assinatura do Mercado Pago) e o pagamento é consultado na API dele; o processamento é idempotente.
- Pacotes se somam: comprar com VIP ativo estende a data de fim.
- Lembrete 3 dias antes do fim, no site e no chat do jogo.
- **Vagas reservadas no Retake:** quando o servidor está lotado e um VIP conecta, um jogador sem VIP é retirado para abrir a vaga, nesta ordem: espectadores, depois AFK, depois o último que entrou. A retirada só acontece entre rounds. Quem foi retirado fica protegido por 30 minutos. A mensagem diz: "Vaga liberada para um VIP. Há vaga em: [outro servidor]. Com o VIP, sua vaga é garantida."
- **Vagas reservadas no Deathmatch:** 2 vagas extras acima das 16 públicas, só para VIP, sem retirar ninguém.
- **Indisponibilidade** (banimento de GSLT, update do CS2 que quebre plugins, queda de host): aviso no site e no Discord; com mais de 24 h, os dias de VIP são congelados e devolvidos automaticamente; com mais de 7 dias, reembolso proporcional sob pedido. Tudo descrito nos Termos.
- **Direito de arrependimento de 7 dias:** reembolso feito pela Staff no painel do Mercado Pago, com revogação do VIP registrada no log de auditoria.
- Política de Reembolso publicada e Termos atualizados com VIP, vagas reservadas e indisponibilidade.
- **A cobrança fica desligada** por uma chave de configuração até o dono decidir sobre a verificação de idade (preferencialmente após consulta jurídica).

**Aceite**
- Fluxo completo no sandbox: comprar, pagar, receber o webhook e ver o VIP ativo no site e no jogo.
- Fechar a página com o QR pendente e voltar em "Minhas compras" recupera o QR.
- O mesmo webhook entregue duas vezes concede o VIP uma vez só; um webhook com assinatura inválida é rejeitado e registrado.
- Comprar 3 meses com 10 dias de VIP restantes resulta em 90 + 10 dias.
- Um reembolso de teste remove os dias e registra a ação.
- Retake lotado com um VIP conectando: no fim do round sai o último a ter entrado (ou um espectador/AFK, se houver), que recebe a mensagem combinada e não é retirado de novo por 30 minutos.
- DM com 16 jogadores: um VIP entra numa vaga extra sem ninguém sair; um jogador sem VIP não consegue usar as vagas extras.
- Depois de restaurar um backup, os Períodos VIP são reconciliados com os pagamentos reais do Mercado Pago.

### S15 · Discord integrado

Depois do beta. Hoje a moderação no Discord é manual (S07).

- Login com Discord no site e vínculo da conta Discord à Conta (a Steam continua sendo a única autenticação da Conta, ADR 0007; o Discord é um vínculo).
- Cargos sincronizados no servidor Discord: Jogador, VIP, Staff e Dono, atualizados quando o VIP ou o papel de Staff muda.
- Bot com o status dos Servidores Carmine e links do site.
- Pagamento e configurações ficam só no site.

**Aceite**
- Vincular o Discord dá o cargo de Jogador; um VIP concedido ou vencido muda o cargo em até 1 minuto.
- Um papel de Staff dado no painel aparece como cargo no Discord.

---

## Definição de "MVP pronto"

Retake e Deathmatch em produção; login Steam; Inventário com 3D aplicado no jogo; Perfil e Ranking; servidores ao vivo e amigos jogando; VIP de ponta a ponta (com a cobrança ligada só após a decisão sobre verificação de idade); moderação básica; páginas legais publicadas; monitoramento ativo. Sem metas numéricas de validação: crescer com calma.

## Ações que só o dono pode fazer

| Ação | Necessária para |
|---|---|
| Criar a chave da Steam Web API | S01 |
| Pedir a partner key do viewer 3D a support@ianlucas.net | Antes da abertura (S04) |
| Redimensionar a Oracle A1 para 2 OCPU / 12 GB | S09 |
| Configurar o Cloudflare Tunnel no domínio stcarmine.com | S09 |
| Contratar a VPS de CS2 e gerar os tokens GSLT em contas Steam distintas | S09 |
| Criar o servidor Discord e os webhooks | S07, S09 |
| Criar o primeiro Dono com o CLI `staff grant` | S07 |
| Criar as contas no Sentry e no serviço de uptime | S09 |
| Revisar as páginas legais | S08, S14 |
| Criar a conta Mercado Pago e as credenciais (sandbox e produção) | S14 |
| Decidir sobre a verificação de idade (idealmente com advogado) | Ligar a cobrança (S14) |

## Pontos em aberto

- Validar no servidor local: `invsim_fallback_team` no DM FFA e se o `GiveNamedItem2` do alocador mantém as skins.
- Confirmar se a `cs2-lib` traz nomes de Itens em PT-BR.
- Limites reais e termos do viewer 3D (dependem da resposta do Ian Lucas). Sem partner key, a abertura usa o embed público com fallback 2D.
