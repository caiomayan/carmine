# Exclusão de dados (S08)

Como atender um pedido de exclusão de dados (LGPD, art. 18), do jeito que a [Política de Privacidade](../legal/politica-de-privacidade.md) promete na seção 8: a Conta é anonimizada. Quem executa é o Dono (o encarregado), pelo painel da Staff ou pelo CLI.

## 1. Receber o pedido

O pedido chega pelo e-mail do encarregado ou pela página de [contato](/contato), assunto "Privacidade", com o ID público da Conta. Pais e responsáveis podem pedir em nome de menores.

1. **Confirme que quem pede é dono da Conta.** Peça para a pessoa entrar com a Steam no site e mandar um print do menu da Conta com o ID público, ou para mandar a mensagem de um perfil Steam com o mesmo SteamID64 da Conta. Sem confirmação, não execute.
2. **Registre o pedido** (data, canal e um número de protocolo). O número vai no motivo da ação e fica no log de auditoria.
3. **Prazo:** responda em até 15 dias.

## 2. Executar

Pelo painel (`/staff`, só o Dono): abra a Conta, "Exclusão de dados" → "Anonimizar a Conta", com o motivo (ex.: `Pedido de exclusão pelo contato, protocolo 12`).

Pelo CLI:

```sh
pnpm --filter "@carmine/api..." build
pnpm --filter @carmine/api accounts anonymize --public-id 10016 --by <SteamID64 do Dono> --reason "Pedido de exclusão pelo contato, protocolo 12"
```

Na imagem Docker: `docker run --rm --env-file <...> <imagem> node dist/accounts/accounts.cli.js anonymize ...`.

Conta da Staff sai da Staff antes (`staff revoke`). Não tem volta.

## 3. O que acontece

| Some | Fica |
| --- | --- |
| Nome Steam, Nome de exibição (vira "Conta excluída"), avatar | As Punições e o log de auditoria da Staff (registro interno de moderação, com o SteamID64 no log), pelo prazo da Política (seção 7) |
| Perfil público (responde 404, também pelo SteamID64) | Com um ban valendo, o SteamID64 na Conta, para o ban continuar valendo; o vínculo some no primeiro connect ou login depois que o ban acabar |
| Inventário, Presets, Loadout, Períodos VIP, a preferência de chat (`!chat off`) e as Estatísticas (semanais, por dia, por arma e as Sessões de jogo) | Os registros de pagamento (S14), pelo prazo legal, em tabela própria |
| O chat que a pessoa escreveu (`chat_messages`) e as linhas dela no chat copiado em Denúncias de outras pessoas (S13); o vínculo com as Denúncias que ela fez | As Denúncias feitas contra ela, com o chat copiado, até os 90 dias (registro de moderação, como as Punições) |
| A foto de perfil própria (ADR 0022): todos os arquivos no R2 (no ar, guardados e já trocados), a purga na CDN e as denúncias contra ela; a Conta sai das denúncias de foto que fez | O registro da ação no log de auditoria, com quantas fotos saíram |
| A pessoa e os eventos dela no PostHog (A1, ADR 0021): a API chama a exclusão de pessoas do PostHog pelo ID interno da Conta, depois do commit | O ID interno da Conta (UUID aleatório) no nosso banco |
| Reivindicação e sessões do site (caem na hora) | O ID público, que nunca é reaproveitado |
| O vínculo com a Steam (`steamId` vira `-publicId`) | |

Se a pessoa voltar a jogar ou entrar no site, nasce uma Conta nova, com outro ID público, sem nada da anterior. As cópias de segurança do banco perdem os dados na rotação (Política, seção 7).

### 3.1 Passo manual: a pessoa no PostHog

Quando o PostHog está ligado, a anonimização apaga a pessoa e os eventos dela sozinha (precisa de `POSTHOG_PERSONAL_API_KEY` e `POSTHOG_PROJECT_ID`). Se não deu (sem essas chaves, ou o PostHog fora), o CLI avisa `não deu para apagar a pessoa no PostHog` com o `distinct_id` (o ID interno da Conta): no painel do PostHog (região UE), *People*, procure por esse `distinct_id` e use *Delete person and events*. O PostHog roda a remoção dos eventos em lote, em geral no fim de semana; diga isso à pessoa. Com a análise desligada (sem `POSTHOG_API_KEY`), não há o que fazer.

## 4. Responder

Avise a pessoa que a Conta foi anonimizada, com a data. Se havia um ban valendo, explique que o SteamID64 fica guardado só até o ban acabar.

## Teste de ponta a ponta (aceite da S08)

O aceite pede um pedido de teste executado no staging. Roteiro:

1. Conecte num Servidor Carmine do staging com uma conta Steam de teste, entre no site, monte um Item e equipe.
2. Faça o pedido pelo canal de contato, como um jogador faria.
3. Execute pelo painel (ou pelo CLI) com o protocolo do pedido.
4. Confira: o Perfil responde 404; o menu da Conta saiu (sessão caiu); `GET /api/staff/audit?action=account_anonymize` mostra a ação; conectar de novo cria uma Conta com outro ID público.

Os testes automáticos cobrem o mesmo caminho: `apps/api/test/account-erasure.int-spec.ts` (API e CLI) e o E2E "o Dono executa um pedido de exclusão" em `apps/web/e2e/moderation.spec.ts`.
