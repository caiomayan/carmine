# Punições chegam ao jogo pela resposta do batimento

Um ban, mute ou gag aplicado no site precisa valer no jogo em até 15 s (S07). Em vez de um canal novo da API para os Servidores Carmine (WebSocket, fila ou o plugin consultando Punições à parte), a resposta do batimento da S06, que o Carmine.Core já manda a cada 10 s, devolve as Punições valendo para os jogadores daquele batimento, e o connect devolve as do jogador que entrou. A lista é a verdade: o que some dela (revogado ou vencido) deixa de valer no jogo. Kick e aviso vão nas respostas por 60 s, e o plugin executa cada um uma vez pelo id. A mesma resposta leva o hostname do servidor (nome de vitrine e código).

## Consequences

- Nenhuma infraestrutura nova: mantém o ADR 0005 (plugins só falam com a API, autenticados pela chave) e funciona atrás de NAT/firewall do servidor de jogo, que só faz requisições de saída.
- A latência é a do batimento (até ~10 s, mais 1 s depois de connect/disconnect); o plugin também solta mute e gag sozinho no `endsAt`, sem esperar.
- Com a API fora, nada novo chega ao jogo e quem conecta não é checado (falha aberta): o próximo batimento depois da volta aplica tudo.
- Expirar não precisa de job: a API compara `endsAt` com o agora em toda leitura.

## Considered Options

- Canal de eventos API → servidor (WebSocket/SSE): tempo real, mas exige conexão persistente de saída no plugin, reconexão e reenvio, só para ganhar alguns segundos.
- Plugin consultando Punições a cada N s numa rota própria: duplica o batimento sem ganho.
