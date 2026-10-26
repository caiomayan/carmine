# Foto de perfil própria: publica na hora, moderação depois, em um R2 de mídia separado do backup

Hoje o avatar de toda Conta é o da Steam (ou o neutro). O dono decidiu (2026-10-26) que **todas as Contas** podem enviar uma foto própria, que a foto **publica na hora** e que a moderação é **depois**: denúncia, remoção rápida pela Staff e a ferramenta de varredura de abuso da Cloudflare. A proposta com as alternativas e os números está em `carmine-avatar-proposta.md` (fora do repositório); este ADR guarda o que ficou decidido e os limites.

**Decisões do dono de 2026-10-26.**
1. Todos enviam (não é benefício do VIP).
2. Pós-moderação, não pré-moderação: a foto aparece na hora. Como mitigação: a foto **denunciada por 2 Contas diferentes sai do ar sozinha** (volta a da Steam) até a Staff decidir; **Contas com menos de 24 h ou com Punição ativa não enviam**; remoção em um clique, com log; bloqueio de reincidente **só no histórico da Staff**; Cloudflare CSAM Scanning Tool ligado na zona.
3. A prévia do link do Perfil mostra a foto própria.
4. A fila de denúncias de foto é do Dono e dos Moderadores (o Admin, que tem tudo do Moderador, também), com prazo de **até 24 h**.
5. Sem bucket de quarentena (não há pré-moderação). As removidas ficam **privadas** por tempo limitado, para a Staff e o advogado.

**Onde fica cada coisa.** Dois buckets do R2, **separados do bucket de backup** (que nunca fica público e tem token próprio): `carmine-media`, **público** pelo domínio `img.stcarmine.com` (cache da Cloudflare, saída do R2 grátis), e `carmine-media-removidas`, **privado**. Os 4 tamanhos (64, 128, 256 e 512 px, WebP) de uma foto `<id>` ficam em `avatars/<id>/<tamanho>.webp` no público; o ID é novo a cada envio, então a URL é **imutável** (`cache-control: immutable` de 1 ano) e trocar a foto não exige purga. A foto que sai do ar (suspensa ou removida) é copiada para `removed/<id>/<tamanho>.webp` no privado, antes de sair do público. Sem as variáveis `R2_MEDIA_*` e `MEDIA_PUBLIC_URL`, a funcionalidade fica **desligada** (como o Discord e a Steam Web API) e o resto do site não muda.

**Processamento na API (`sharp`).** O navegador manda só o **recorte** (nunca o original), até 1 MiB, quadrado de 256 a 1024 px, em JPEG, PNG ou WebP, como corpo cru da requisição. A API confere o tipo **pelos bytes**, recusa foto animada, aplica a orientação do EXIF e **recodifica** em WebP sem metadados (EXIF e GPS saem), nunca guardando o arquivo recebido. `limitInputPixels` baixo contra bomba de descompressão e no máximo 2 fotos processadas ao mesmo tempo. Sem AVIF: nesses tamanhos a economia é de poucos kB e o custo de CPU na ARM é bem maior. O `sharp` traz binário nativo, então a imagem Docker da API passa a ser construída **na arquitetura de destino** (o CI já usa o runner ARM nativo).

**Regras.** 3 envios por Conta em 24 h; Conta com menos de 24 h, com Punição ativa, com envio bloqueado ou com a foto suspensa não envia (o motivo do bloqueio de reincidente nunca aparece para a pessoa: só "indisponível"). Voltar à foto da Steam é na hora, sem moderação, e apaga a foto própria. O avatar da Steam é **sempre guardado** (`accounts.steam_avatar_url`) e continua atualizado pelo `AvatarRefresher`; `accounts.avatar_url` segue sendo o **avatar efetivo**, o campo que todo o resto da API já lê, então nenhum módulo de leitura muda.

**Dados.** `account_avatars` (a foto, o estado `active`, `suspended`, `removed`, `replaced` ou `reverted`, a decisão da Staff), `avatar_reports` (uma denúncia por Conta e foto; as arquivadas ficam marcadas) e `media_deletions` (a fila de remoção de arquivos). Colunas novas em `accounts`: `steam_avatar_url`, `avatar_source`, `avatar_upload_blocked_until`.

**Remover arquivos do R2 nunca é direto.** O R2 não participa da transação do Postgres. Trocar, voltar à Steam, excluir a Conta, retirar uma foto do ar e a retenção só **enfileiram** em `media_deletions`, na mesma transação; um job (a cada 30 s, `MEDIA_SWEEP_SECONDS`) apaga com nova tentativa e espera crescente (30 s até 1 h) e **purga a URL na CDN** (`POST /zones/{zona}/purge_cache`, `CLOUDFLARE_ZONE_ID` e `CLOUDFLARE_PURGE_TOKEN`) depois de apagar, já que o cache de 1 ano não some sozinho. A linha só sai da fila quando o arquivo **e** a purga deram certo. Um arquivo tem uma linha só: enfileirar de novo antecipa o `runAt`. Recolocar uma foto no ar cancela as remoções pendentes **antes** de copiar de volta (senão a fila apagaria a cópia nova).

**Privacidade e exclusão.** A foto é dado pessoal e pode ser de menor (LGPD art. 14, no melhor interesse): guardamos só o recorte, sem metadados, e a Política de Privacidade ganha a categoria (com `[VALIDAR COM ADVOGADO]`). O pedido de exclusão (S08) enfileira **todos** os arquivos da Conta, apaga as fotos e as denúncias contra elas e solta a Conta das denúncias que fez; a auditoria registra quantas fotos saíram. A exclusão só mexe no banco, então vale também pelo CLI, sem o R2 configurado: os arquivos saem quando houver armazenamento. Os backups do Postgres guardam só chaves, nunca imagens: ao restaurar um backup antigo, a fila de remoção precisa ser reaplicada.

**Retenção das removidas.** A foto removida pela Staff fica no bucket privado por `AVATAR_REMOVED_RETENTION_DAYS` (30 dias) e depois a fila a apaga. O que o advogado mandar guardar além disso, como evidência, entra por outro caminho. A comunicação às autoridades de material de abuso é nossa, não da ferramenta da Cloudflare, e o procedimento está na lista do advogado.

## Consequences

- A funcionalidade só liga com as seis variáveis base; a purga da CDN é opcional (sem ela, só a expiração do cache tira uma foto apagada de circulação; em produção, configure).
- O web precisa de `https://img.stcarmine.com` em `img-src` da CSP e escolhe o tamanho pela URL (`avatarVariantUrl`, em `@carmine/contracts`).
- A janela entre o envio e uma denúncia é real: uma foto imprópria fica visível até duas Contas a denunciarem ou a Staff agir. É o custo da decisão do dono; as mitigações (Conta com 24 h, sem Punição, 3 envios por dia, suspensão com 2 denúncias, fila de até 24 h) a reduzem, não a eliminam.
- A Cloudflare CSAM Scanning Tool só vê o que já foi publicado e pelo cache; não protege nada antes disso.

## Considered Options

- **Pré-moderação pela Staff** (a recomendação da proposta): descartada pelo dono; a foto da Steam ficaria no ar enquanto a nova esperasse, mas a fila ficaria no caminho de todo envio.
- **Bucket de quarentena para as pendentes:** só faria sentido com pré-moderação.
- **Mesmo bucket do backup, com prefixo:** tornar um bucket público é por bucket; o backup nunca pode ficar público, e um token que publica fotos não deve ler dumps.
- **Moderar por classificador automático no envio:** manda a foto de um possível menor a um terceiro (ou exige hospedar o modelo); fica para depois, só para priorizar, com o parecer do advogado.
- **Guardar o original e recortar no servidor:** mais dado de menor guardado, sem ganho para o produto.
- **Apagar do R2 dentro do handler:** deixaria arquivo órfão (ou foto apagada ainda no cache) a cada falha de rede.
