# Denúncias e log de chat (S13)

Como o `!report` chega à Staff, onde ficam o chat e as Denúncias, quanto tempo duram e o que o dono configura. As decisões estão no [ADR 0019](../adr/0019-denuncias-e-log-de-chat.md).

## O que a Staff vê

- **Painel `/staff/denuncias`** (qualquer papel de Staff): as abertas, das mais antigas (o prazo de 72 h corre desde a primeira), com o motivo, o alvo, quem denunciou, o servidor, o mapa, o round e as últimas linhas do chat (as do denunciado em destaque). Ações: **Abrir a Conta** (histórico de Punições, VIP, auditoria), **Aplicar Punição** (leva à ficha da Conta com o formulário ligado à Denúncia, que é fechada como "punida" ao aplicar) e **Arquivar com motivo**. Tudo vai para o log de auditoria (`report_archive`; a Punição, como qualquer outra, em `sanction_apply` com o `reportId`). As abas "Arquivadas" e "Punidas" são o histórico.
- **Cheat e voz:** o painel avisa que, sem demo, a Denúncia sozinha não gera Punição. A API recusa (`report_needs_evidence`) uma Punição vinda de uma Denúncia de cheat ou voz sem testemunha ou link da evidência.
- **CLI** (`pnpm --filter @carmine/api staff ...`; na imagem, `node dist/staff/staff.cli.js ...`):

  ```sh
  staff reports                       # as abertas, uma por linha, com o id
  staff report-archive --id <id> --by <SteamID64 de quem faz> --reason "<motivo>"
  ```

## Limites do `!report`

Aplicados na API: 1 Denúncia por alvo a cada 10 minutos e 5 por hora, por denunciante (só as aceitas contam). A recusa diz quando tentar de novo ("Você já denunciou este jogador há pouco. Tente de novo em 7 min."). Não dá para denunciar a si mesmo, bots nem quem a API não conhece.

## Webhook da Staff no Discord

Um aviso por Denúncia nova, com o motivo, o alvo (nome e ID público), o servidor e o link da fila. Não leva o denunciante, o SteamID64 nem o chat. Sem a variável, nada é enviado e não há erro (a fila do painel funciona igual). É **outro** webhook, de outro canal, que o de alertas de operação (`DISCORD_ALERT_WEBHOOK_URL`).

**Criar:** no servidor do Carmine, crie um canal privado só da Staff (`#denuncias-staff`) > ⚙ **Editar canal > Integrações > Webhooks > Novo webhook** > **Copiar URL do webhook**.

**Instalar na VM:** edite `/opt/carmine/.env`, acrescente a linha abaixo e recrie a API (ela lê o `.env` ao subir):

```sh
sudo nano /opt/carmine/.env          # STAFF_REPORTS_WEBHOOK_URL=https://discord.com/api/webhooks/...
sudo /opt/carmine/bin/dc up -d api
```

Confirme: `sudo /opt/carmine/bin/dc logs api --tail 20` sem erro de configuração (a URL precisa ser `https`) e, no jogo, uma Denúncia de teste (`!report`) com uma Conta sua contra outra. A mensagem cai no canal em segundos. Para desligar, deixe a variável vazia e recrie a API.

## Retenção e limpeza

| Dado | Quanto tempo | Quem apaga |
| --- | --- | --- |
| Log de chat (`chat_messages`) | 30 dias (por `received_at`) | `RetentionJob` |
| Denúncia (`reports`, com a cópia do chat) | 90 dias depois de criada, em qualquer estado | `RetentionJob` |
| Punição que saiu de uma Denúncia | fica (outro registro, 24 meses depois do fim, conforme a Política de Privacidade) | |

O `RetentionJob` (`apps/api/src/reports/`) roda ao subir a API e a cada `RETENTION_SWEEP_MINUTES` (padrão 60; 0 desliga) e registra no log quantas linhas apagou ("Limpeza de retenção: N mensagem(ns) de chat e M Denúncia(s) apagadas"). Apagar duas vezes não faz mal. Não há tarefa externa para agendar. Com a API fora, a limpeza só atrasa.

Para conferir o tamanho do log: `select count(*), min(received_at) from chat_messages;` no Postgres (`sudo /opt/carmine/bin/dc exec postgres psql -U carmine`).

## Exclusão de dados (S08)

A anonimização da Conta apaga o chat dela, desvincula as Denúncias que ela fez e tira o nome e o texto das linhas dela no chat copiado em Denúncias de outras pessoas. As Denúncias contra ela ficam até os 90 dias (registro de moderação). Veja [exclusao-de-dados.md](exclusao-de-dados.md).

## Atualizar o Carmine.Core

O `!report` e o log de chat vêm no Carmine.Core 0.10.0. O passo a passo da AWS está em [atualizacao-do-cs2.md](atualizacao-do-cs2.md), "Atualizar só o Carmine.Core". Com a API nova e o plugin antigo, nada quebra: o chat só não é registrado e `!report` não existe.
