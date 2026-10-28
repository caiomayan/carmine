# Cabeçalhos de segurança

O que o web e a API mandam em toda resposta e o que fazer quando o site precisar de algo novo de fora.

## Web (`apps/web`)

| Cabeçalho | Valor | Onde |
| --- | --- | --- |
| `Content-Security-Policy` | por requisição, com nonce | `src/proxy.ts` + `src/lib/security-headers.ts` |
| `X-Content-Type-Options` | `nosniff` | `next.config.ts` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `next.config.ts` |
| `Permissions-Policy` | câmera, microfone, geolocalização, pagamento e USB desligados | `next.config.ts` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`, só em produção, sem `preload` | `next.config.ts` |

### CSP: nonce, não `'unsafe-inline'`

`script-src 'self' 'nonce-<novo a cada requisição>' 'strict-dynamic'`. O proxy gera o nonce, o Next o lê do cabeçalho da requisição e o põe nos próprios scripts, e o layout o passa ao script do tema (`ThemeScript`). Nonce exige renderização por requisição; no Carmine isso já era verdade (o layout lê o cookie da sessão, então nenhuma página é estática), e portanto a escolha não custou cache nem páginas estáticas. Se algum dia uma página precisar ser estática, ela perde o nonce: decida então entre `'unsafe-inline'` só nela ou outro mecanismo.

`style-src` mantém `'unsafe-inline'`: o React escreve `style="..."` no HTML do servidor e atributos não aceitam nonce.

### Origens externas permitidas

| Diretiva | Origem | Para quê |
| --- | --- | --- |
| `frame-src` | `https://3d.cstrike.app` | viewer 3D do editor (ADR 0006) |
| `img-src` | `https://cdn.cstrike.app` | imagens dos Itens (`cs2-lib`) |
| `img-src` | `https://*.steamstatic.com` | avatares da Steam |
| `connect-src` | origem do `SENTRY_DSN` do web | só quando o DSN está configurado (calculada em tempo de execução pelo proxy) |
| `connect-src` | `https://eu.i.posthog.com` (ou o `POSTHOG_HOST`) | só quando o web tem `POSTHOG_API_KEY` (a contagem de páginas, A1d); sem a chave a CSP não muda |

Tudo mais é `'self'` (API em `/api`, SSE, fontes do `next/font`). O login Steam é uma navegação (`/api/auth/steam/login` responde 302), não um formulário, então `form-action 'self'` basta.

### Acrescentar uma origem

1. Edite `src/lib/security-headers.ts` (e o teste ao lado).
2. Rode `pnpm --filter @carmine/web test:e2e -- e2e/security-headers.spec.ts`: o teste carrega a home, o login e o editor e falha em qualquer `securitypolicyviolation`.
3. Bibliotecas que usam `eval`/`new Function` quebram a CSP. O Zod faz essa sondagem na criação do primeiro schema; `@carmine/contracts` o põe em modo sem JIT no navegador (`packages/contracts/src/zod-jitless.ts`).

## API (`apps/api`)

Todas as respostas saem com `Cache-Control: no-store` e `X-Content-Type-Options: nosniff` (`src/default-headers.ts`, um hook `onRequest`, então valem também para 401, 404 e 429). Um handler que precise de outro `cache-control` o troca. O SSE de `/api/servers/live` escreve o seu (`no-cache, no-transform`, ADR 0016). A API não manda CSP: ela só responde JSON e o stream.
