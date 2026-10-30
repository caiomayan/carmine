# Denúncias na API e o chat dos servidores no mesmo lote de eventos

> **Estendido pelo [ADR 0027](0027-regra-unica-de-denuncia.md) (regra única de denúncia, S18).** Ao limite de 1 por alvo a cada 10 minutos e 5 por hora soma-se o teto de 10 por dia, contando todos os tipos de Denúncia; a fila da Staff passa a ter um item por caso (mesma Conta, mesmo motivo, mesmo Mapa jogado), com o peso de quem denuncia e o prazo por tipo. O resto continua valendo.

A S13 tem duas peças que se encontram: o log de chat dos servidores (30 dias) e a Denúncia (`!report`), que leva um recorte desse chat para a fila da Staff.

**Chat no lote do ADR 0018.** Cada mensagem dita vira um evento `chatMessages` do lote `POST /api/server/events`, com ID próprio (UUID v7 do plugin), horário, SteamID64, lado (`ct`, `t` ou `spectator`) e se foi chat de time. O plugin enfileira na mesma fila em memória, com o mesmo recuo e a mesma idempotência (a chave é o ID da mensagem em `chat_messages`; reenviar não duplica). Mensagem de Conta que a API não conhece é aceita e ignorada. O lote antigo (sem o campo) continua válido. Fica de fora do log só o que ninguém lê: comandos silenciosos (`/algo`) e os comandos do próprio Carmine.Core (`!report`, `!chat`). Mensagem barrada pelo gag nunca chegou a ninguém e também não entra.

**`!chat off` não muda o log.** O `!chat off` esconde, para quem o usou, as mensagens dos outros (é uma preferência de quem lê). O log registra o que foi dito, não quem leu: uma ofensa dita a um jogador que a escondeu continua na moderação. A Política de Privacidade diz isso.

**A Denúncia é um `POST` síncrono, não um evento.** O jogador precisa da resposta na hora (aceita, ou recusada com "tente de novo em X min"), e os limites têm de valer em um lugar só, por isso a Denúncia vai a `POST /api/server/reports` e não pela fila. A API aplica os limites (1 por alvo a cada 10 minutos, 5 por hora, por denunciante, contados só nas aceitas) dentro de uma transação que trava o denunciante (`pg_advisory_xact_lock`), então duas Denúncias ao mesmo tempo não passam juntas. A recusa volta com a mensagem pronta para o chat; o plugin só a repassa, o texto fica num lugar (`report-limits.ts`, testado). Quando dois limites valem, vale o prazo mais longo.

**O chat do momento.** Antes de enviar a Denúncia, o plugin esvazia a fila de eventos, para as últimas linhas já estarem na API. A API copia para a Denúncia as **20 últimas linhas do servidor nos 5 minutos anteriores** (qualquer jogador: o contexto de uma ofensa inclui a resposta), marcando as do denunciado. A cópia (`reports.chat_context`, jsonb) sobrevive à limpeza dos 30 dias do chat, porque é a evidência da análise.

**Retenção.** Chat: 30 dias, por `received_at`. Denúncia (com a cópia): 90 dias depois de criada, aberta, arquivada ou punida. Um job na API (`RetentionJob`, ao subir e a cada hora; `RETENTION_SWEEP_MINUTES`, 0 desliga) apaga os dois. A Punição que saiu de uma Denúncia é outro registro e não depende dela. Os 90 dias são três vezes o prazo de 72 h da Staff e cobrem um recurso (também em 72 h) com folga, sem guardar por 24 meses o que é só uma acusação.

**Anonimização da Conta (S08).** Apaga o chat da pessoa (`chat_messages`), desvincula as Denúncias que ela fez (`reporter_account_id` fica nulo) e tira o nome e o texto das linhas dela dentro do chat copiado em Denúncias de outras pessoas. As Denúncias contra ela ficam, com o chat copiado, até os 90 dias: são registro de moderação, como as Punições.

**Cheat e voz.** A Denúncia fica registrada, mas não gera Punição sozinha: sem demo nem gravação de voz, só com evidência adicional (testemunha ou link). A regra de ban por cheat (S08) já existia; a S13 a estende às Punições aplicadas a partir de uma Denúncia de cheat ou voz (`report_needs_evidence`), de qualquer tipo, mesmo um kick. A Punição aplicada pela fila fecha a Denúncia na mesma transação (`status = sanctioned`, `reportId` no log de auditoria); arquivar exige motivo e vai para o log (`report_archive`).

**Aviso no Discord.** Cada Denúncia aceita dispara um aviso no canal da Staff (`STAFF_REPORTS_WEBHOOK_URL`, separado do webhook de alertas): motivo, nome e ID público do alvo, servidor e link da fila. Nada de denunciante, SteamID64 nem chat. Sem a variável, não envia e não dá erro; Discord fora do ar vai para o log e nunca atrapalha a Denúncia (que já está na fila).

## Consequences

- O chat trafega com os eventos: um servidor com muito chat enche a fila mais devagar do que com o dano (que é por acerto), então o limite de 5.000 eventos continua valendo para tudo. Uma queda do servidor perde alguns segundos de chat, como perde de eventos.
- `chat_messages` cresce com o volume de chat e é limpa por `received_at`; o índice por horário mantém a limpeza barata.
- A Denúncia chega ao Discord e à fila ao mesmo tempo que é gravada; o critério de "em até 1 minuto" tem folga (a ida do plugin é imediata, sem esperar o ciclo de 5 s da fila).
- A menção do denunciante só existe no painel da Staff (nunca no Discord) e some quando ele pede a exclusão dos dados.
- A migração é só aditiva (duas tabelas, três enums e um valor novo no enum de auditoria), então o rollback é de imagem.

## Considered Options

- Chat num endpoint próprio (`POST /api/server/chat`): fila, recuo e idempotência duplicados no plugin para um ganho nulo; o lote com ID por mensagem já resolve.
- A API consultar o chat na hora de exibir a Denúncia, em vez de copiá-lo: a limpeza dos 30 dias apagaria a evidência de uma Denúncia ainda em análise ou recorrida.
- Registrar o chat só de quem não usou `!chat off` ou só do que foi entregue: o log deixaria de mostrar justamente o que foi dito a quem escondeu o chat.
- Contar os limites no plugin: o plugin reinicia, o jogador troca de servidor e as regras mudariam com cada deploy do plugin; na API valem para todos os servidores.
- Menu do `!report` com CS2MenuManager: ele existe nos perfis só como dependência do RockTheVote (GPL-3.0, sem pacote NuGet para referenciar); o chat numerado não adiciona dependência nem licença e funciona igual no console.
