# Web e API na mesma origem: a API vive em `stcarmine.com/api`

O navegador sempre chama a API por caminhos relativos em `/api/*` da própria origem do web, nunca por um subdomínio (`api.stcarmine.com`) nem por outra porta. Assim a sessão do login Steam (S03) é um cookie first-party `__Host-` com `SameSite=Lax`, sem CORS nem cookies de domínio compartilhado, e a proteção CSRF fica simples (token sincronizador; outro site não lê nada da nossa origem). Em produção, o Cloudflare Tunnel (ADR 0009) separa por caminho: `stcarmine.com/api/*` vai direto para o contêiner da API e o resto para o web, sem passar pelo Next. Em desenvolvimento e no E2E, o Next repassa `/api/*` para a API com um rewrite em `beforeFiles` (`API_URL`, padrão `http://localhost:3333`), o que reproduz a mesma origem em `http://localhost:3000`.

## Consequences

- `PUBLIC_WEB_URL` na API é a origem pública do web: o realm do OpenID, a base do `return_to` (`<origem>/api/auth/steam/callback`) e dos redirecionamentos depois do login. Nunca é derivada do cabeçalho `Host`.
- O web não pode ter rotas próprias em `/api` (o rewrite e o túnel as encobririam); route handlers do Next, se precisar, vão para outro prefixo.
- Server Components chamam a API pela rede interna (ex.: `http://api:3333`), repassando o cookie da sessão. Um `Set-Cookie` de renovação nessa chamada não chega ao navegador, então a renovação deslizante da sessão depende das chamadas do navegador a `/api` (o web deve consultar `/api/me` do navegador ao menos uma vez por carga).
- Atrás do túnel, todo pedido chega à API vindo do `cloudflared`: o IP real do visitante vem em `CF-Connecting-IP`, e limites por IP precisam ler esse cabeçalho antes de valer para rotas do site.
- O túnel precisa de duas regras de ingress por caminho (S09); o rewrite do Next fica no build de produção como alternativa inofensiva.

## Considered Options

- Subdomínio `api.stcarmine.com`: mesmo site para o `SameSite`, mas exige CORS com credenciais, cookie com `Domain=stcarmine.com` (sem o prefixo `__Host-`, sobrescrevível por qualquer subdomínio) e um segundo hostname no túnel.
- Rewrite do Next também em produção: uma regra só no túnel, mas cada chamada à API passaria pelo Next (mais CPU na Oracle ARM e o IP do visitante escondido atrás do web).
- API dentro do Next (route handlers): descartado pelo ADR 0004.
