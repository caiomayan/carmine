# Documentos legais

Textos publicados pelo web, um markdown por documento, lidos em tempo de requisição:

| Arquivo | Página |
|---|---|
| `regras-de-conduta.md` | `/regras` (a seção "Recurso" vira a âncora `/regras#recurso`, para onde a mensagem do jogo aponta) |
| `termos-de-uso.md` | `/termos` |
| `politica-de-privacidade.md` | `/privacidade` |
| `politica-de-reembolso.md` | `/reembolso` |

Formato: front-matter com `title`, `updatedAt` (AAAA-MM-DD) e `version` (semver), e markdown básico (`##`/`###`, listas, **negrito**, links relativos como `/termos`, tabelas GFM). HTML cru é ignorado. Abaixo da versão 1.0.0 o documento é rascunho: a página mostra um aviso, tira os marcadores `[VALIDAR COM ADVOGADO]` e o bloco `>` final, e destaca como pendência as lacunas `[DONO: ...]` e `[CONFIRMAR: ...]`. Enquanto um arquivo não existe, a página mostra o aviso de redação.

## Rascunhos que ainda não são publicados

O web só publica os quatro arquivos da tabela acima (lista fixa em `apps/web/src/lib/legal/load.ts`). Texto que depende de uma implementação futura fica aqui como rascunho, fora da lista, até entrar no documento certo junto com o código:

| Arquivo | Entra com | Em |
|---|---|---|
| `rascunho-a1-analytics.md` | A1 (analytics de produto, PostHog) e, o bloco final, a abertura (GA4) | `politica-de-privacidade.md` |
| `rascunho-foto-de-perfil.md` | A foto de perfil (F3 do web e as variáveis `R2_MEDIA_*` na VM), com a revisão do advogado | `politica-de-privacidade.md`, `regras-de-conduta.md` e `termos-de-uso.md` |
| `rascunho-s14-vip-e-pagamentos.md` | A cobrança (`PAYMENTS_ENABLED=true`) e a guarda de 30 dias dos Itens VIP (`VIP_HOLD_ENABLED=true`), no mesmo dia, depois da revisão do advogado | `termos-de-uso.md`, `politica-de-reembolso.md` e `politica-de-privacidade.md` |

## Para o advogado

`para-o-advogado.md` é o **pacote único para o advogado**: reúne os pontos `[VALIDAR COM ADVOGADO]` e `[DONO: ...]` de todos os documentos e rascunhos, com a ordem de prioridade (o que bloqueia ligar o VIP, a foto e o analytics), o que fazemos hoje, a pergunta objetiva, onde está no código e o que muda se a resposta for não. É interno e **não é publicado** (fora da lista fixa de `apps/web/src/lib/legal/load.ts`). Mantenha-o atualizado quando um marcador for resolvido ou surgir um novo.
