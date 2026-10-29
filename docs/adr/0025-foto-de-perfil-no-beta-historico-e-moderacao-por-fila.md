# Foto de perfil no beta: limites internos, histórico das últimas 5 e denúncia que só entra na fila

O [ADR 0022](0022-foto-de-perfil-publica-na-hora-moderacao-depois.md) deixou a foto de perfil pronta e desligada. A S18 da [spec do beta aberto](../specs/beta-aberto.md) a liga e muda as regras que eram escolha de produto, mantendo só o essencial. Este ADR registra o que muda no 0022 e **o substitui nesses pontos**; o resto do 0022 (publica na hora, R2 de mídia separado do backup, processamento na API, fila de remoção de arquivos, exclusão da Conta) segue valendo.

## O que substitui o ADR 0022

| ADR 0022 | Agora |
|---|---|
| Decisão 2: a foto denunciada por 2 Contas diferentes **sai do ar sozinha** até a Staff decidir | **A denúncia não tira nada do ar.** Só entra na fila da Staff. Quem tira uma imagem do ar na hora é só a ferramenta de abuso infantil da Cloudflare (CSAM Scanning Tool), ligada na zona; ela não passa pelo nosso código. O estado `suspended` não é mais criado (a coluna e o valor ficam para as linhas antigas; a Staff as decide como antes) |
| Decisão 2 e "Regras": Conta com menos de 24 h não envia | **Sai.** Uma Conta de 1 minuto envia (ADR 0007: quem joga já é Conta, não reivindicada, e tudo conta) |
| "Regras": 3 envios por Conta em 24 h | **5 envios a cada 30 min** (janela deslizante, por Conta) e **10 s** entre um envio e outro. Regra interna: nenhuma tela mostra números. Mensagens: `Espere alguns segundos para enviar outra foto.` e `Você trocou de foto muitas vezes. Tente de novo mais tarde.` |
| "Regras": bloqueio de reincidente, só no histórico da Staff, em escada (7, 30 e 365 dias) | **Sai a escada.** Ao remover uma foto, a Staff escolhe se bloqueia novos envios e por quantos dias (0 a 365; a tela sugere 7; sem o campo, não bloqueia). A pessoa continua vendo só "indisponível" |
| "Regras": trocar a foto apaga a anterior; voltar à Steam apaga a foto própria | **Histórico das últimas 5 fotos.** A foto trocada ou devolvida à Steam fica no histórico, com os arquivos. Escolher uma volta na hora e **não conta** nos limites de envio. "Apagar" a tira do histórico e do armazenamento. Quando entra a 6ª, a mais velha sai e é apagada (pela fila de remoção, com purga da CDN) |
| Decisão 6: os registros de foto trocada ou devolvida são apagados 90 dias depois de a foto deixar de ser a da Conta | **Muda para o histórico:** a foto que ainda está no histórico (com arquivos) não é apagada por tempo; a retenção de 90 dias passa a contar só para as linhas que já saíram dele (`deleted_at`) e para as removidas. Uma foto pode, portanto, ficar guardada além dos 90 dias enquanto a pessoa a mantiver no histórico; sai quando ela a apaga, quando entram 5 fotos mais novas ou na exclusão da Conta. A Política de privacidade (rascunho) e a lista do advogado foram ajustadas |

## Regra única de moderação de imagem

Vale para a foto de perfil e vale também, quando existirem, para a logo de Time (S30) e a logo de Sala (S23c). Essas fatias herdam estas quatro regras:

1. **A denúncia não tira nada do ar sozinha.** Só entra na fila da Staff (prazo de até 24 h, como antes).
2. **Imagem aprovada fica imune.** Depois que a Staff mantém uma imagem (`decision = keep`), as novas denúncias contra **aquela mesma imagem** são descartadas: nada é gravado, a Staff não é avisada e a resposta é a mesma de uma denúncia aceita (quem denuncia não aprende se o que enviou valeu). Uma imagem nova (novo envio, novo ID) pode ser denunciada de novo. A imunidade é por imagem: reenviar o mesmo arquivo cria outra imagem.
3. **Só a ferramenta de abuso infantil da Cloudflare tira uma imagem do ar na hora.**
4. **Quem denuncia muito o que a Staff mantém perde peso.** A Conta com pelo menos **3** denúncias mantidas pela Staff nos últimos **90 dias** e **mais mantidas do que confirmadas** (foto removida) tem as denúncias dela no fim da fila: uma foto só entra no grupo do fim se **todas** as denúncias abertas contra ela são de Contas assim; com ao menos uma de peso normal, fica no grupo normal. Dentro de cada grupo, as mais antigas primeiro. Os números (3 e 90) são uma escolha desta fatia, ajustáveis em `avatar-rules.ts`; a spec não os fixa.

## Decisões desta fatia que a spec não cobre

- **O histórico conta a foto no ar: são 5 fotos no total**, com a atual marcada (a spec diz "a 6ª" e "no máximo 5"). Depois de "Voltar à foto da Steam", nenhuma está marcada.
- **Os arquivos do histórico ficam no bucket público**, por URL imutável com UUID (a mesma do envio). Escolher uma é só trocar o estado, sem copiar nada no R2. O custo é que a URL de uma foto que saiu do ar continua abrindo para quem a tiver; "Apagar", a 6ª foto e a remoção pela Staff a tiram.
- **Apagar do histórico não zera os limites:** a linha fica (`deleted_at`, sem arquivos) e continua contando na janela de 30 min e nos 10 s; sai na retenção de 90 dias.
- **Quem tem Punição ativa ou envio bloqueado não escolhe uma foto do histórico** (o bloqueio depois de uma remoção valeria nada se bastasse escolher uma foto antiga). Voltar à Steam vale sempre.
- **A Staff pode remover uma foto que está só no histórico** e ela aparece na fila enquanto tem denúncia aberta e arquivos; sair do histórico para sempre é o efeito da remoção ("nunca volta"). Apagar uma foto denunciada tira o caso da fila (nada mais a decidir), como acontecia antes ao trocar a foto.
- **O limite de 30 min vale antes do intervalo de 10 s** quando os dois se aplicam (a mensagem do limite é a que não engana). O estado (`GET /api/me/avatar`) não inclui o intervalo de 10 s: ele passa sozinho e travaria a tela.

## Consequences

- A janela entre o envio e a decisão da Staff cresce: uma foto imprópria fica no ar até a Staff agir (a fila é de até 24 h) ou a Cloudflare bloquear. É o custo de a denúncia não derrubar nada; a mitigação é a fila ordenada e o peso de quem denuncia.
- A fila de remoção de arquivos passa a receber trabalho em outros momentos (6ª foto, "Apagar"), não só na troca.
- Migração `0020`: coluna `account_avatars.deleted_at`.
- Para ligar em produção, o roteiro do dono está em [foto-de-perfil.md](../operacao/foto-de-perfil.md).

## Considered Options

- **Manter a suspensão por denúncias com um limite maior:** descartada pela spec (a denúncia em dupla era uma forma de tirar a foto de alguém sem a Staff).
- **Histórico no bucket privado, copiando de volta ao escolher:** a foto não ficaria acessível por URL fora do ar, mas cada escolha passaria a gastar operações de escrita no R2 e a falhar com ele; a URL é um UUID não adivinhável e a decisão do dono é que a escolha seja "na hora".
- **Apagar a linha ao apagar a foto do histórico:** simples, mas abriria a brecha de enviar, apagar e enviar de novo sem limite.
- **Contar o peso de quem denuncia na hora da denúncia (descartando-a):** a spec pede que as denúncias vão para o fim da fila, não que sumam.
