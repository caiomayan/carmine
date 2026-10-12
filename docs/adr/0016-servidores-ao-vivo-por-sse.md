# Servidores ao vivo por SSE, não por WebSocket

A home recebe a lista de Servidores Carmine ao vivo (S06) por Server-Sent Events em `GET /api/servers/live`: a cada mudança visível, um evento `servers` com a lista inteira em JSON (é pequena: poucos servidores), mais um comentário de keepalive a cada 15 s. O fluxo é só da API para o navegador, e o SSE é uma resposta HTTP comum: passa pelo Cloudflare Tunnel e pelo rewrite do Next em desenvolvimento (ADR 0015) sem configuração própria, usa os mesmos guards da API (rate limit por `CF-Connecting-IP`), e o `EventSource` do navegador reconecta sozinho com o `retry` que a API manda. Isto ajusta o ADR 0004, que citava WebSocket para a presença ao vivo: a decisão dele (API separada do Next) continua; só o transporte da presença muda.

## Consequences

- O Cloudflare derruba uma resposta sem bytes por 100 s: o keepalive de 15 s evita isso, e a resposta vai com `cache-control: no-cache, no-transform` para nenhum proxy comprimir (e segurar) o stream.
- Um evento só sai quando algo visível muda (estado, mapa, jogadores); o horário de cada batimento sozinho não gera evento. Cada conexão recebe o estado atual logo ao abrir, então reconectar nunca perde nada e não há ids de evento a retomar.
- A API percebe um servidor offline por varredura (a cada 5 s), não por evento do servidor; a varredura também leva aos clientes desta instância o que chegou por outra, que só compartilha o Valkey.
- Pelo HTTP/2 do Cloudflare, o limite de 6 conexões HTTP/1.1 por origem não pesa; em desenvolvimento (HTTP/1.1) cada aba usa uma conexão.

## Considered Options

- WebSocket: bidirecional sem necessidade, precisa de upgrade no túnel e no rewrite do Next, de um gateway à parte no Nest (fora dos guards HTTP) e de reconexão própria no web.
- Polling de `GET /api/servers`: simples, mas o critério "o contador muda em até 15 s" exigiria uma consulta a cada poucos segundos por visitante, mesmo sem mudança.
