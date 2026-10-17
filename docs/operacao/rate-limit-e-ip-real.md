# Rate limit e IP real

Como a API limita requisições e descobre o IP de quem pediu. Leitura obrigatória da S09 (produção atrás do Cloudflare Tunnel).

## Políticas

Cada rota limitada declara uma política com `@RateLimit('<nome>')` (`apps/api/src/rate-limit/policies.ts`). Todos os limites valem por minuto e mudam por variável de ambiente.

| Política | Conta por | Rotas | Padrão/min | Valkey fora |
| --- | --- | --- | --- | --- |
| `login` | IP | `GET /api/auth/steam/login`, `GET /api/auth/steam/callback` | 20 (`RATE_LIMIT_LOGIN_PER_MINUTE`) | fechada (503) |
| `public` | IP | `GET /api/me`, `GET /api/profiles/*`, `GET /api/servers`, `GET /api/servers/live` (só a abertura do stream), `GET /api/me/friends-playing` | 240 (`RATE_LIMIT_PUBLIC_PER_MINUTE`) | aberta |
| `equipped` | IP | `GET /api/equipped/v5/*` | 120 (`RATE_LIMIT_EQUIPPED_PER_MINUTE`) | aberta |
| `mutations` | sessão (sem sessão, IP) | `POST /api/auth/logout` e as mutações do site daqui em diante | 60 (`RATE_LIMIT_MUTATIONS_PER_MINUTE`) | fechada (503) |
| `server` | Servidor Carmine | `/api/server/*` (plugins) | 600 (`RATE_LIMIT_SERVER_PER_MINUTE`) | aberta |

- As rotas de uma política dividem o mesmo balde: um IP que gastou o `public` nos Perfis também espera no `/api/me`.
- IPv6 conta pelo /64: o provedor entrega uma rede /64 ao cliente, e trocar de endereço dentro dela é de graça.
- No `/api/me`, o limite conta antes da autenticação: quem não tem sessão também gasta.
- Nas rotas de plugin, uma chave inválida é recusada (401) antes de contar: sem servidor, não há balde.
- **CGNAT:** as operadoras móveis brasileiras põem muitos clientes atrás do mesmo IPv4. Os padrões são folgados por isso; se aparecer 429 legítimo nos logs, suba o limite antes de mexer em outra coisa.

### Falha segura (Valkey fora)

- **Aberta** na leitura pública e nos plugins: o site e os Servidores Carmine continuam de pé, e as consultas vão ao Postgres, que não depende do Valkey.
- **Fechada** no login e nas mutações: eles dependem do Valkey de qualquer jeito (state do login, nonce do OpenID, sessão). Deixá-los sem contagem não ganharia disponibilidade, só abriria espaço para abuso (cada volta do login custa uma ida à Steam).
- Sem conexão pronta com o Valkey, a decisão é imediata; a requisição não espera o timeout do comando. A API avisa nos logs no máximo a cada 30 s.

### Algoritmo

GCRA (Generic Cell Rate Algorithm), o token bucket guardado como um único número por balde: o instante teórico em que o balde estaria vazio. Ele foi escolhido em vez das alternativas:

- **Janela fixa** (o `@fastify/rate-limit` usado antes): deixa passar até 2x o limite na virada da janela.
- **Janela deslizante com log** (sorted set): exata, mas guarda um registro por requisição.
- **Janela deslizante aproximada** (dois contadores): barata, mas aproximada.

O GCRA é exato, usa uma chave com um número por cliente (expira sozinha quando o balde enche), permite rajada até o limite e repõe as vagas aos poucos (com 120/min, uma a cada 0,5 s). A decisão é um script Lua (`EVALSHA`), atômico entre instâncias da API, e usa o relógio do Valkey (`TIME`), não o de cada instância.

### Respostas

Toda resposta de rota limitada traz os cabeçalhos do draft IETF [httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/):

```http
RateLimit-Policy: "public";q=240;w=60
RateLimit: "public";r=239;t=1
```

`r` são as vagas restantes e `t` os segundos até o balde encher de novo. Acima do limite, a API responde 429 com `Retry-After` em segundos, e `t` aponta para a próxima vaga:

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 15
RateLimit: "public";r=0;t=15
```

## IP real

Atrás do túnel, todo pedido chega à API vindo do `cloudflared`. O IP do visitante vem no cabeçalho `CF-Connecting-IP`, que o Cloudflare define (e sobrescreve se o cliente mandar um). A API só aceita esse cabeçalho quando o socket é de um proxy confiável:

- `TRUSTED_PROXIES` lista IPs ou redes CIDR separados por vírgula. O padrão é vazio: vale sempre o IP do socket, como em desenvolvimento.
- De qualquer outro endereço, um `CF-Connecting-IP` é forjado e ignorado: o IP considerado é o do socket. O teste `apps/api/test/rate-limit.int-spec.ts` cobre isso.
- Um valor repetido ou que não é um IP também é ignorado, e vale o IP do proxy.
- `X-Forwarded-For` nunca é lido.
- O IP resolvido aparece como `clientIp` nos logs de cada requisição.

Os Server Components do web chamam a API pela rede interna (ADR 0015), então essas requisições saem do contêiner do web. O web repassa o `CF-Connecting-IP` que recebeu do `cloudflared` (`apps/web/src/lib/api-base.ts`). Sem isso, todo visitante cairia no mesmo balde, o do IP do web.

### Configuração na S09

Implementada em `infra/prod/compose.yml` (rede `edge` 172.30.0.0/24, cloudflared em .10, web em .11, `TRUSTED_PROXIES=172.30.0.10/32,172.30.0.11/32`, nenhuma porta publicada). O trecho abaixo é a explicação do porquê.

1. Ponha `cloudflared`, `web` e `api` numa rede Docker própria com sub-rede fixa e IPs fixos para o `cloudflared` e o `web`:

   ```yaml
   networks:
     edge:
       ipam:
         config:
           - subnet: 172.30.0.0/24

   services:
     cloudflared:
       networks:
         edge:
           ipv4_address: 172.30.0.10
     web:
       networks:
         edge:
           ipv4_address: 172.30.0.11
     api:
       networks: [edge]
       environment:
         TRUSTED_PROXIES: 172.30.0.10,172.30.0.11
   ```

2. Confie nos dois endereços (`/32`), não na sub-rede inteira: o gateway da rede (`172.30.0.1`) é por onde chega o tráfego das portas publicadas no host.
3. **Não publique as portas da API nem do web** (`ports:`) em produção: o único caminho até eles deve ser o túnel. Se o web ficar acessível por fora, alguém pode mandar um `CF-Connecting-IP` forjado para ele, e ele o repassaria à API como confiável.
4. Verifique depois do deploy:
   - pelo site, os logs da API mostram `clientIp` com o IP real de quem acessa, não `172.30.0.x`;
   - dentro do host, `curl -H 'CF-Connecting-IP: 1.2.3.4' http://<ip-da-api>:3333/api/profiles/10000` registra o IP de quem fez o curl, nunca `1.2.3.4`.
