# Foto de perfil: como ligar e operar

Decisões e limites em [ADR 0022](../adr/0022-foto-de-perfil-publica-na-hora-moderacao-depois.md). Sem as variáveis do R2 de mídia a funcionalidade fica **desligada**: o site não muda e `GET /api/me/avatar` responde `enabled: false`.

## 1. Ligar (uma vez, quem conduz faz com o dono presente)

1. **Dois buckets novos no R2**, separados do de backup (o de backup **nunca** fica público):
   - `carmine-media`: público. Em *Settings > Custom Domains*, conecte `img.stcarmine.com` (o domínio é da zona `stcarmine.com`, na mesma conta). **Não** ligue o `r2.dev` público.
   - `carmine-media-removidas`: privado, sem domínio nem acesso público.
2. **Token de API do R2** só com *Object Read & Write* nesses dois buckets (um token novo; o do backup não serve e não deve enxergar as fotos).
3. **Token da Cloudflare só com "Cache Purge"** na zona `stcarmine.com` (e o ID da zona). Serve para tirar da borda uma foto apagada, já que o cache é de 1 ano.
4. **`.env` da VM** (`/opt/carmine/.env`): `R2_MEDIA_ENDPOINT` (`https://<ID DA CONTA>.r2.cloudflarestorage.com`), `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`, `R2_MEDIA_PUBLIC_BUCKET=carmine-media`, `R2_MEDIA_PRIVATE_BUCKET=carmine-media-removidas`, `MEDIA_PUBLIC_URL=https://img.stcarmine.com`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_PURGE_TOKEN`. Depois `sudo /opt/carmine/bin/dc up -d api`. Faltando qualquer uma das seis primeiras, a API sobe com a funcionalidade desligada e avisa no log o que falta (`Foto de perfil desligada: faltam ...`).
5. **Cloudflare CSAM Scanning Tool** (grátis): no painel da zona, *Caching > Configuration > CSAM Scanning Tool*, com um e-mail verificado. Ela confere as imagens que entram no cache contra listas de material de abuso conhecido, bloqueia a URL e avisa por e-mail. **Só vê o que já foi publicado, e a comunicação às autoridades continua sendo nossa** (procedimento: lista do advogado).
6. **Regra de cache** do `img.stcarmine.com`: respeitar o `cache-control` da origem (a API grava `public, max-age=31536000, immutable`).
7. **Homologação**: buckets próprios (`carmine-media-hml`, `carmine-media-removidas-hml`) e outro domínio; nunca os de produção.

## 2. O que a API faz sozinha

- **Fila de remoção de arquivos** (`media_deletions`): a cada 30 s (`MEDIA_SWEEP_SECONDS`, 0 desliga) apaga do R2 e purga a URL na CDN, com nova tentativa e espera crescente. Uma linha que falha fica com `attempts` e `last_error`.
- **Retenção das removidas**: o arquivo no bucket privado sai 30 dias depois da remoção pela Staff (a fila usa `run_at` no futuro).
- **Avatar da Steam**: continua sendo atualizado pelo `AvatarRefresher`; com foto própria no ar, só o guardado (`steam_avatar_url`) muda.

## 3. Acompanhar

```sql
-- O que espera para ser apagado, e o que está falhando.
SELECT bucket, count(*) AS arquivos, count(*) FILTER (WHERE attempts > 0) AS com_falha, min(run_at) AS mais_antigo
FROM media_deletions GROUP BY bucket;
SELECT key, attempts, last_error FROM media_deletions WHERE attempts > 0 ORDER BY attempts DESC LIMIT 20;
```

`com_falha` subindo e o mesmo `last_error` repetido costuma ser o token do R2 ou da purga vencido. As linhas com `run_at` no futuro são a retenção das removidas, não um problema.

## 4. Backup e restauração

Os dumps do Postgres guardam só as chaves das fotos, **nunca** as imagens. Ao restaurar um backup antigo: (1) reaplique os pedidos de exclusão e remoções feitos depois do backup, para que uma foto apagada de propósito não reapareça; (2) uma foto "no ar" no banco cujo arquivo foi apagado mostra imagem quebrada até a pessoa trocá-la ou voltar à Steam (a Staff vê pela fila de denúncias; basta a Conta voltar à Steam).

## 5. Exclusão de dados

A anonimização (S08) já enfileira todos os arquivos da Conta (ver [exclusao-de-dados.md](exclusao-de-dados.md)). Depois de executar, confira com a consulta acima que as linhas saíram em até alguns minutos.

## 6. Quando a Staff remove uma foto

A foto sai do público e fica no bucket privado por 30 dias, para a Staff e o advogado; depois a fila a apaga. Se houver suspeita de material de abuso envolvendo menor: **não** reencaminhe a imagem (Discord, e-mail), siga o procedimento definido com o advogado e guarde apenas o necessário.
