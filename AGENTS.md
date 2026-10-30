# Carmine · guia para agentes

Plataforma brasileira de servidores comunitários de CS2. Monorepo pnpm + Turborepo: `apps/api` (NestJS, Fastify, Drizzle, Postgres, Valkey), `apps/web` (Next 16, Tailwind), `packages/contracts` (Zod, fonte única dos contratos), `plugins/` (C#, CounterStrikeSharp), `infra/` (Docker, perfis dos servidores de CS2, homologação, produção).

## Antes de mexer
- **O que fazer**: a fatia na spec viva, [`docs/specs/beta-aberto.md`](docs/specs/beta-aberto.md). [`docs/specs/mvp.md`](docs/specs/mvp.md) é o histórico das fatias S00 a S15, entregues; vale onde a beta-aberto não muda nada.
- **Por que algo é assim**: [`docs/adr/`](docs/adr/). Mudar uma decisão registrada pede um ADR novo, que cita o antigo.
- **Como chamar as coisas**: [`CONTEXT.md`](CONTEXT.md). Use os termos dele no código, na interface e nos commits. Termo novo entra lá no mesmo PR.
- **Decisão que a spec não cobre**: confira antes no `CONTEXT.md`, nos ADRs e nas specs, e cite a fonte na descrição do PR (o modelo em `.github/pull_request_template.md` pede). Se contradiz algum deles, não decida: pergunte. Se nenhum cobre e muda o que o jogador vê ou o que conta, é decisão do dono.
- **Mudou uma regra**: atualize no mesmo PR todos os lugares que a citam (procure com `git grep`): spec, `CONTEXT.md`, ADR, comentários de contrato e textos da interface. Documento desatualizado vira a próxima decisão errada.
- **Como operar**: [`docs/operacao/`](docs/operacao/) (deploy, homologação, CS2, pagamentos, foto, Discord).

## Fluxo
- Branch curto a partir do `dev`, PR para o `dev`. A **CI do PR é a verificação**: verify, integração, E2E em 3 partes e .NET, agregados no check `node`. Localmente, rode só o leve do pacote que você tocou (lint, typecheck, unit); build e E2E completos ficam para a CI.
- O `main` é produção e só recebe PR de uma branch de release congelada (`release/<data><letra>`).
- Commits em português, no formato `tipo(escopo): o que mudou` (`feat(web): ...`, `fix(api): ...`, `test(e2e): ...`, `docs(specs): ...`).

## Regras que nenhuma config conta
- **O repositório é público.** Nada de IP, hostname interno, nome de chave, token ou e-mail pessoal em código, docs ou commits.
- **Contratos primeiro**: tipo ou rota nova nasce em `packages/contracts`. O cliente C# do plugin é gerado pelo NSwag na CI a partir do OpenAPI da API.
- **Textos da interface** ficam em `apps/web/messages/pt-BR.json`. **Rotas e comandos do jogo em inglês** (S16b); comandos têm sinônimo em português.
- **fps**: nada anima em loop sem o usuário pedir. Quando precisar: só `transform` e `opacity`, numa camada pequena, pausado fora da tela e com a aba oculta. O teste `apps/web/e2e/fps.spec.ts` mede o repouso.
- **Orçamento de JS** por página (a CI mede): código pesado só carrega quando usado.
- **Plugin**: o `ModuleVersion` em `plugins/src/Carmine.Core/CorePlugin.cs` só sobe ao cortar um release, porque ele dispara a release do plugin para os servidores.
- **O plugin só relata; a API decide** o que conta nas Estatísticas (ADR 0018). Toda mensagem do Carmine no chat do jogo começa com `Carmine` em carmim (`ChatColors.DarkRed`).
- **Quem joga já é Conta** (não reivindicada até o login no site), e tudo dela conta como de qualquer Conta (ADR 0007). Só bot, aquecimento e kill em aliado ficam de fora. Um SteamID humano sem Conta ganha a Conta não reivindicada; nunca vira bot.
- **Preferência de jogo na Conta, não no servidor**: nenhuma preferência de jogador nos plugins (AWP, `!guns`, sons, HUD) fica presa a um servidor. Ela mora na Conta, na API, vale em todo servidor do Modo, e o Carmine.Core a aplica no plugin (ADR 0028). Plugin novo com preferência por jogador entra nessa regra antes de ir para o ar.
- **Sem dado inventado**: quando um número não existe (período antes da coleta, API fora), a tela diz isso.
