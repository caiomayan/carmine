# Spec do MVP

> Linguagem do domínio: [`CONTEXT.md`](../../CONTEXT.md). Decisões: [`docs/adr/`](../adr/). Identidade visual de referência: [`prototypes/identity/direcao-2c.html`](../../prototypes/identity/direcao-2c.html).

## Objetivo

Colocar no ar Servidores Carmine de **Retake** e **Deathmatch** em que qualquer jogador entra pelo IP e já tem uma Conta, e um site app-first onde ele monta o Inventário com visualização 3D, equipa o Loadout que aparece no jogo, vê quem está jogando agora, acompanha as Estatísticas e pode comprar VIP.

## Fora do escopo do MVP

- Matchmaking, fila, ELO e servidores sob demanda (Fase 2, ADR 0001).
- 5v5 casual (entra logo depois do MVP).
- Feed, seguir, comentários, clips e destaques.
- Demos, anti-cheat próprio e heurísticas além do VAC.
- Bot de Discord e vínculo de conta Discord.
- Atualização do Loadout em tempo real durante a partida (ADR 0006).
- Mapas da Workshop.
- Qualquer mecânica aleatória paga (ADR 0011, permanente).

## Princípios transversais

- **Interface:** app-first, sem landing page. Barra superior com container global de ~1280 px. Tema escuro quente padrão e claro papel creme, com tokens e motion da direção 2c. Animações sutis em toda interação, respeitando `prefers-reduced-motion`. Polimento visual com a skill impeccable.
- **Texto:** PT-BR, tom sóbrio tratando por "você", com tempero da marca só em momentos leves e nunca em erros, pagamentos ou moderação. Todas as strings externalizadas (i18n desde o dia 1).
- **Acessibilidade:** WCAG 2.2 AA, navegação completa por teclado, foco visível, alvos de 44 px no mobile.
- **Responsivo:** 390 px a 1440 px+ sem scroll horizontal.
- **Plugins:** só falam com a API (ADR 0005), com chave por servidor.
- **Qualidade:** TDD no domínio da API; testes de integração contra Postgres real; Playwright E2E nos fluxos críticos; CI bloqueia merge com lint, typecheck ou teste falhando.

## Fatias

Cada fatia é vertical: entrega algo verificável de ponta a ponta. A ordem respeita as dependências.

| Fatia | Depende de |
|---|---|
| S00 Fundação | — |
| S01 A Conta nasce no jogo | S00 |
| S02 Login Steam e reivindicação | S01 |
| S03 Perfil público | S02 |
| S04 Inventário | S02 |
| S05 Loadout, Presets e aplicação no jogo | S04 |
| S06 Servidores ao vivo e amigos jogando | S01 (amigos: S02) |
| S07 Estatísticas e Ranking | S01 |
| S08 VIP e pagamentos | S05, S10 |
| S09 Moderação | S02 |
| S10 Páginas legais (contínua) | — |
| S11 Operação (contínua) | S00 |
| S12 Beta fechado | todas |

---

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
- Plugin próprio **Carmine.Core**: no connect, envia o SteamID64 para a API, que cria a Conta se não existir e devolve o Nome de exibição.
- Alocação do ID público conforme ADR 0013.
- Nome e avatar buscados na Steam Web API e sincronizados a cada connect enquanto a Conta não tiver nome próprio.
- O plugin aplica o Nome de exibição no jogo (ADR 0008).
- No primeiro connect da Conta, mensagem no chat: "Bem-vindo ao Carmine. Ao jogar você concorda com os termos: stcarmine.com/termos".
- A API serve `GET /api/equipped/v5/{steamId}.json` no formato do `cs2-css-inventory-simulator`, ainda vazio (só Armas padrão).

**Aceite**
- Um SteamID que nunca jogou conecta, e em até 2 s existe uma Conta não reivindicada com ID público ≥ 10.000 e nome e avatar Steam.
- Duas Contas criadas em sequência recebem IDs crescentes, sem colisão, mesmo com connects simultâneos.
- A mensagem de boas-vindas aparece só no primeiro connect da Conta.
- Uma chave de servidor inválida recebe 401 e não cria nada.

### S02 · Login Steam e reivindicação

- Login Steam (OpenID) no site; é a única forma de autenticação.
- O primeiro login reivindica a Conta existente; se ela não existir (a pessoa nunca jogou), é criada já reivindicada.
- Sessão por cookie `httpOnly`, `Secure`, `SameSite=Lax`, com proteção CSRF nas mutações.
- Barra superior mostra avatar e Nome de exibição; logout.
- Contas não reivindicadas e reivindicadas se distinguem por um **sinal visual sutil** (cor ou disposição), sem rótulo explícito.

**Aceite**
- Quem jogou antes e faz login vê a mesma Conta, com o mesmo ID público e as mesmas Estatísticas.
- Login, logout e expiração de sessão funcionam; uma mutação sem token CSRF é rejeitada.

### S03 · Perfil público

- Página `stcarmine.com/<idPúblico>`; uma URL com SteamID64 redireciona (301) para ela.
- Mostra Nome de exibição, `#ID`, avatar Steam, link para o perfil Steam, vitrine do Loadout e Estatísticas (estas preenchidas pela S07).
- Edição do Nome de exibição para Contas reivindicadas: 2 a 24 caracteres, não-único, filtro de palavras ofensivas, troca a cada 7 dias, reset pela Staff.
- Perfil privado: a Conta reivindicada pode esconder as Estatísticas e aparecer como "Jogador privado" no Ranking.
- Imagem OG do Perfil com o Loadout, para compartilhar no Discord e no X.

**Aceite**
- `/<id>` inexistente mostra 404 próprio; `/76561198…` válido redireciona para o ID público.
- Trocar o nome antes de 7 dias é recusado com mensagem clara; o novo nome aparece no jogo no próximo connect.
- Colar o link do Perfil no Discord gera a prévia com nome e Loadout.

### S04 · Inventário

- Catálogo de Itens a partir da `@ianlucas/cs2-lib`: skins de arma, facas, luvas, agentes, music kits, stickers e charms. **Armas padrão não aparecem.**
- Busca e filtros (tipo, arma, raridade, coleção).
- Adicionar um Item ao Inventário com seus atributos: float dentro da faixa da skin, seed, StatTrak, nametag, até 5 stickers (com posição, rotação e desgaste) e 1 charm (com posição e seed).
- Remover e editar Itens. Vários Itens para a mesma arma são permitidos.
- Visualizador 3D do 3d.cstrike.app por iframe, controlado por postMessage; arrastar stickers e charms no 3D atualiza os atributos. Imagens 2D para music kits e como fallback quando o 3D falhar, não houver WebGL ou o limite de uso for atingido (ADR 0006).
- Itens exclusivos do VIP (agentes, music kits, StatTrak e nametag) aparecem com um cadeado sutil para quem não é VIP e podem ser vistos, mas não adicionados.

**Aceite**
- Adicionar uma AK com float 0,15, seed 661, StatTrak e 2 stickers reflete os mesmos valores no 3D e após recarregar a página.
- Um float fora da faixa da skin é recusado pela API, não só pelo front.
- Com o 3D bloqueado (iframe sem resposta), o editor continua utilizável em 2D.

### S05 · Loadout, Presets e aplicação no jogo

- Equipar um Item do Inventário num slot, para CT, TR ou ambos; desequipar volta à Arma padrão.
- Presets: o plano grátis tem 1 (o Loadout atual); o VIP tem Presets ilimitados com nome, ativáveis de uma vez.
- `equipped/v5` passa a devolver o Loadout real; Itens VIP só entram na resposta se a Conta tiver Período VIP ativo.
- O `cs2-css-inventory-simulator`, sem modificação, aplica o Loadout no connect e com `!ws`.
- Quando o VIP vence: os Itens VIP continuam no Inventário mas deixam de ir para o jogo; Presets extras ficam somente leitura até renovar.

**Aceite**
- Equipar uma faca no site e digitar `!ws` no servidor aplica a faca, em CT e TR conforme escolhido.
- Uma Conta com agente equipado e VIP vencido recebe o agente padrão no jogo.
- `equipped/v5` responde em p95 < 200 ms com cache.

### S06 · Servidores ao vivo e amigos jogando

- **Home = lista de servidores ao vivo:** Modo, mapa, jogadores/máximo, ping estimado, estado (online, lotado, offline) e botão Conectar (`steam://connect`).
- O Carmine.Core envia batimento a cada ~10 s com mapa e jogadores conectados; servidor sem batimento por 45 s fica offline.
- Atualização ao vivo no site por WebSocket ou SSE, com transição numérica suave dos contadores.
- Bloco "Seus amigos jogando agora" para Contas reivindicadas: amigos Steam em Servidores Carmine, com botão de entrar no mesmo servidor. Se a lista de amigos Steam for privada, mostra como torná-la visível.
- Filtros por Modo e estado vazio.

**Aceite**
- Um jogador entra num servidor e o contador da home muda em até 15 s sem recarregar a página.
- Desligar o servidor o marca offline em até 60 s.
- Um amigo Steam conectado aparece no bloco, e "Entrar" abre o jogo no mesmo servidor.

### S07 · Estatísticas e Ranking

- O Carmine.Core envia eventos (kill, morte, assistência, dano, headshot, fim de round, início e fim de Sessão de jogo) em lotes.
- Estatísticas por Modo e no total: kills, mortes, assistências, K/D, HS%, ADR e tempo jogado; no Retake, rounds jogados e vencidos.
- Ranking semanal por Modo (top 50), reiniciando na segunda-feira às 00:00 (horário de Brasília), com mínimo de participação para entrar.
- Perfis privados aparecem como "Jogador privado".

**Aceite**
- Uma kill com headshot no servidor aparece no Perfil em até 1 minuto.
- Eventos repetidos (reenvio de lote) não duplicam Estatísticas.
- O Ranking da semana anterior fica consultável depois do reinício.

### S08 · VIP e pagamentos

- Página do VIP: o que é grátis e o que é VIP, preços e compra.
- **Pix pelo Mercado Pago:** Pacotes de 1 mês (R$ 9,90), 3 meses (R$ 26,90) e 6 meses (R$ 49,90); QR com validade de 30 minutos.
- **Cartão:** Assinatura VIP mensal de R$ 9,90; cancelável a qualquer momento, mantendo o VIP até o fim do período pago.
- Antes de pagar: declaração de que o Pagador é maior de idade; o CPF do Pagador fica registrado (ADR 0011).
- O VIP só é concedido depois que o webhook é validado (assinatura do Mercado Pago) e o pagamento é consultado na API dele; o processamento é idempotente.
- Pacotes se somam: comprar com VIP ativo estende a data de fim.
- Lembrete 3 dias antes do fim de um Pacote VIP, no site e no chat do jogo.
- Benefícios no jogo: slot reservado (o servidor aceita VIPs quando lotado) e destaque no Perfil.
- Direito de arrependimento de 7 dias: no MVP, reembolso feito pela Staff no painel do Mercado Pago, com revogação do VIP registrada no log de auditoria.

**Aceite**
- Fluxo Pix completo no sandbox do Mercado Pago: comprar, pagar, receber o webhook e ver o VIP ativo no site e no jogo.
- O mesmo webhook entregue duas vezes concede o VIP uma vez só.
- Um webhook com assinatura inválida é rejeitado e registrado.
- Comprar 3 meses com 10 dias de VIP restantes resulta em 3 meses + 10 dias.

### S09 · Moderação

- Papéis de Staff: Dono, Admin e Moderador, com permissões na API valendo no site e no jogo.
- Punições globais (ban, mute, gag), temporárias ou permanentes, com motivo; aplicadas no connect (ban impede a entrada, com mensagem) e durante a Sessão de jogo.
- `!report` no jogo: escolher o jogador e o motivo; a Denúncia leva servidor, round, horário e as últimas linhas do chat para a fila da Staff.
- Log de chat dos servidores, retido por 30 dias.
- Painel de moderação no site: fila de Denúncias, busca de Conta, aplicar e revogar Punições, resetar Nome de exibição.
- Log de auditoria de toda ação de Staff (autor, ação, alvo, motivo, horário).
- Webhook no canal da Staff no Discord a cada nova Denúncia.

**Aceite**
- Um ban aplicado no site derruba o jogador do servidor em até 15 s e impede um novo connect.
- Um Moderador não consegue alterar papéis de Staff (só o Dono).
- Toda Punição aparece no log de auditoria.

### S10 · Páginas legais e conformidade (contínua)

- Termos de Uso, Política de Privacidade (LGPD) e Política de Reembolso (CDC art. 49), redigidos com IA e revisados pelo dono antes de cobrar.
- Canal de contato para pedidos de exclusão de dados e procedimento de exclusão.
- Links no rodapé e no aviso do primeiro connect.

**Aceite**
- As três páginas estão publicadas e linkadas antes da S08 ir para produção.

### S11 · Operação (contínua)

- Produção: web, API, Postgres e Valkey na Oracle A1 via Docker Compose atrás do Cloudflare Tunnel; deploy pela CI.
- Backup noturno do Postgres no Cloudflare R2, com restauração testada.
- Servidores Retake e Deathmatch na VPS brasileira com anti-DDoS, com plugins de gameplay fixados em versão (cs2-retakes e um plugin de DM a escolher), pool de mapas Active Duty, votação de mapa e `!rtv`.
- Sentry no web, na API e nos plugins; monitoramento de uptime do site e dos servidores (A2S); alertas no Discord.
- Runbooks: atualização do CS2 (validar no staging local antes da produção) e troca de token GSLT (ADR 0002).

**Aceite**
- Um deploy no `main` chega à produção sem passo manual além da aprovação.
- Uma restauração de backup num banco limpo recupera os dados do dia anterior.
- Derrubar um servidor CS2 gera alerta no Discord em até 5 minutos.

### S12 · Beta fechado

- Lista de permissão por SteamID na API: com o beta ativo, Contas fora da lista recebem uma mensagem e são desconectadas.
- Amigos do beta (até ~10) recebem IDs reservados e VIP grátis durante o beta.
- Abertura ao público desligando a lista, sem deploy.

**Aceite**
- Um SteamID fora da lista não consegue jogar; dentro da lista, sim.
- Desligar a lista libera a entrada imediatamente.

---

## Definição de "MVP pronto"

Retake e Deathmatch em produção; login Steam; Inventário com 3D aplicado no jogo; Perfil e Ranking; servidores ao vivo e amigos jogando; VIP de ponta a ponta; moderação básica; páginas legais publicadas; monitoramento ativo. Sem metas numéricas de validação: crescer com calma.

## Ações que só o dono pode fazer

| Ação | Necessária para |
|---|---|
| Criar a chave da Steam Web API | S01 |
| Redimensionar a Oracle A1 para 2 OCPU / 12 GB | S11 |
| Configurar o Cloudflare Tunnel no domínio stcarmine.com | S11 |
| Pedir a partner key do viewer 3D a support@ianlucas.net | Antes do lançamento (S04) |
| Criar a conta Mercado Pago e as credenciais (sandbox e produção) | S08 |
| Gerar os tokens GSLT em contas Steam distintas | S11 |
| Contratar a VPS de CS2 | S11 |
| Criar o servidor Discord e os webhooks | S09, S11 |
| Criar as contas no Sentry e no serviço de uptime | S11 |
| Revisar as páginas legais (e, idealmente, consultar um advogado) | S10 |

## Pontos em aberto

- Escolher o plugin de Deathmatch (pesquisa antes da S11).
- Confirmar se a `cs2-lib` traz nomes de Itens em PT-BR.
- Limites reais e termos do viewer 3D (dependem da resposta do Ian Lucas).
- Suficiência da verificação de idade da S08 perante o ECA Digital (revisão jurídica).
