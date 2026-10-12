# Documentos legais

Textos publicados pelo web, um markdown por documento, lidos em tempo de requisição:

| Arquivo | Página |
|---|---|
| `regras-de-conduta.md` | `/regras` (a seção "Recurso" vira a âncora `/regras#recurso`, para onde a mensagem do jogo aponta) |
| `termos-de-uso.md` | `/termos` |
| `politica-de-privacidade.md` | `/privacidade` |
| `politica-de-reembolso.md` | `/reembolso` |

Formato: front-matter com `title`, `updatedAt` (AAAA-MM-DD) e `version` (semver), e markdown básico (`##`/`###`, listas, **negrito**, links relativos como `/termos`, tabelas GFM). HTML cru é ignorado. Abaixo da versão 1.0.0 o documento é rascunho: a página mostra um aviso, tira os marcadores `[VALIDAR COM ADVOGADO]` e o bloco `>` final, e destaca como pendência as lacunas `[DONO: ...]` e `[CONFIRMAR: ...]`. Enquanto um arquivo não existe, a página mostra o aviso de redação.
