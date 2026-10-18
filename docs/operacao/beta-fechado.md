# Beta fechado (S10)

Como o beta dos amigos (até ~10 pessoas) funciona e como a Staff o opera. A abertura ao público não é um passo de software: é deixar os servidores ligados de forma contínua (VPS definitiva).

## Acesso

Não há lista de permissão na API (decisão do dono, 2026-10-18). Quem controla o acesso é a **instância dos servidores CS2**: ligada, os amigos que receberam o endereço jogam; desligada, ninguém entra (`cs2-beta.ps1 start` / `stop`; custos e rotina em [aws-beta-cs2.md](aws-beta-cs2.md)). O site fica sempre no ar.

## ID reservado para os amigos

Todo mundo nasce com um ID automático (≥ 10.000) no primeiro connect. A Staff troca o ID de um amigo por um reservado (1 a 9.999) com o CLI, **uma única vez por Conta**: depois disso o ID é imutável (ADR 0013).

Peça ao amigo para entrar uma vez num servidor (a Conta nasce no primeiro connect) e rode, com o SteamID64 dele:

```sh
pnpm --filter @carmine/api accounts assign-reserved-id --steam-id <SteamID64 do amigo> --public-id 7 --by <SteamID64 de quem faz> --reason "amigo do beta"
```

Na imagem Docker: `docker run --rm --env-file <...> <imagem> node dist/accounts/accounts.cli.js assign-reserved-id ...`.

- **Escolha com cuidado:** não dá para trocar de novo, nem desfazer. O comando recusa ID fora de 1 a 9.999, ID que já é de outra Conta e Conta que já tem ID reservado.
- **O link antigo continua valendo:** `stcarmine.com/<idAntigo>` responde 301 para `stcarmine.com/<idNovo>` (o web lê a lista de IDs antigos da API e a guarda por 10 s). O histórico fica em `account_public_id_history`; um ID antigo nunca é reaproveitado.
- **No jogo**, o ID novo vale no próximo connect do amigo.
- **Auditoria:** a troca vai para o log da Staff (`account_reserved_id`, com o ID de antes e o de depois, o autor e o motivo), visível em `/staff/auditoria`.

## Registro de atritos

Atrito é qualquer coisa que fez um amigo hesitar, errar ou pedir ajuda ("não achei como equipar", "o Loadout não apareceu", "no celular o botão ficou fora da tela"). O registro é **uma nota no Maestri** ("Carmine · Atritos do beta"), revisada com o dono antes de abrir ao público; não fica no repositório.

A Staff registra assim, **uma linha por atrito**, assim que ele aparece (Discord, no jogo ou ao vivo):

```text
2026-10-19 · #7 · celular · site · Não achou o botão de equipar · gravidade: média · aberto
```

- **Quem:** o ID público da Conta (`#7`), nunca SteamID, nome Steam ou outro dado pessoal.
- **Onde:** a experiência da matriz da S10 (começou pelo IP ou pelo site; sem VIP, VIP concedido, VIP vencido; celular) e se foi no jogo ou no site.
- **O que aconteceu** em uma frase, com as palavras da pessoa quando der.
- **Gravidade:** alta (não conseguiu jogar/equipar), média (conseguiu depois de hesitar ou pedir ajuda), baixa (incômodo).
- **Estado:** `aberto`, `resolvido` (com o link do PR/commit) ou `adiado` (com o motivo). Os critérios de saída da S10 exigem que todo atrito termine resolvido ou conscientemente adiado.

Atrito que é bug vira issue no GitHub; a linha da nota aponta para ela.
