# Foto de perfil: como ligar e operar

Decisões e limites em [ADR 0022](../adr/0022-foto-de-perfil-publica-na-hora-moderacao-depois.md). Sem as variáveis do R2 de mídia a funcionalidade fica **desligada**: o site não muda e `GET /api/me/avatar` responde `enabled: false`.

## 1. Ligar (uma vez, uns 20 minutos: painel da Cloudflare e a VM)

Pré-requisito: `stcarmine.com` já é uma zona na sua conta da Cloudflare. Os caminhos abaixo foram conferidos na documentação oficial da Cloudflare em 2026-10-26; se a tela estiver diferente, vale a documentação.

1. **Dois buckets.** *R2 object storage > Create bucket*, duas vezes: `carmine-media` (vai ser público) e `carmine-media-removidas` (privado). **Não** ligue o "Public Development URL" (`r2.dev`) em nenhum: é só para desenvolvimento, tem limite de taxa e não passa por cache nem regras. Deixe a localização em **Automatic**, a mesma do bucket de backup (decisão do dono: um só perfil de transferência internacional, na lista do advogado; **não** use a jurisdição "União Europeia" do R2).
2. **Domínio das fotos.** Bucket `carmine-media` > *Settings > Custom Domains > Add* > `img.stcarmine.com` > *Continue > Connect Domain*. Espere o status ficar "Active". O domínio precisa estar na mesma conta que o bucket (está). O bucket `carmine-media-removidas` **não** recebe domínio.
3. **Token do R2 (novo).** *R2 object storage > Overview > API Tokens > Manage > Create Account API token*, permissão **Object Read & Write**, escopo só nos dois buckets. Copie o *Access Key ID*, o *Secret Access Key* (aparece uma vez) e o endpoint `https://<ID DA CONTA>.r2.cloudflarestorage.com`. Não reaproveite o token do backup: ele não deve enxergar as fotos nem o contrário.
4. **Token de purga.** *My Profile > API Tokens > Create Token > Custom*, permissão **Cache Purge** na zona `stcarmine.com`. Copie o token e o *Zone ID* (coluna direita da visão geral da zona). Serve para tirar da borda uma foto apagada, já que o cache dela é de 1 ano. Purga por URL existe também no plano Free.
5. **VM.** No `/opt/carmine/.env`: `R2_MEDIA_ENDPOINT`, `R2_MEDIA_ACCESS_KEY_ID`, `R2_MEDIA_SECRET_ACCESS_KEY`, `R2_MEDIA_PUBLIC_BUCKET=carmine-media`, `R2_MEDIA_PRIVATE_BUCKET=carmine-media-removidas`, `MEDIA_PUBLIC_URL=https://img.stcarmine.com`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_PURGE_TOKEN`. Depois `sudo /opt/carmine/bin/dc up -d api`. Faltando qualquer uma das seis primeiras, a API sobe com a funcionalidade desligada e diz no log o que falta (`Foto de perfil desligada: faltam ...`).
6. **CSAM Scanning Tool.** Painel da zona > *Caching > Configuration > CSAM Scanning Tool > Configure*: informe um e-mail (o que a Cloudflare usa para avisar de um acerto) e aceite os termos do serviço. Num acerto, a Cloudflare bloqueia a URL quando consegue e manda **um e-mail por dia** com os caminhos dos arquivos. **Só vê o que já foi publicado, e a comunicação às autoridades continua sendo nossa:** guarde o e-mail e siga o procedimento do advogado (seção 6). A página oficial não diz se a ferramenta é gratuita nem em quais planos: confirme no painel ao ativar.
7. **Homologação:** buckets e domínio próprios (`carmine-media-hml`, `carmine-media-removidas-hml`, outro host); nunca os de produção.

**Conferir que deu certo** (com uma Conta de teste de mais de 24 h):
- `GET /api/me/avatar` responde `enabled: true` e o log da API não diz "Foto de perfil desligada".
- Envie uma foto, abra a URL do avatar e rode `curl -I`: `content-type: image/webp`, `cache-control: public, max-age=31536000, immutable` e, na 2ª vez, `cf-cache-status: HIT`. Se vier `DYNAMIC`, a Cloudflare só coloca no cache certos tipos de arquivo por padrão: crie em *Caching > Cache Rules* uma regra para o host `img.stcarmine.com` com "Eligible for cache" respeitando o cache da origem.
- Troque a foto: em cerca de 1 minuto (fila + purga) a URL da foto antiga passa a dar 404.
- O endereço `r2.dev` dos buckets não abre, e o `carmine-media-removidas` não responde a ninguém de fora.

**Custo:** dentro do plano grátis do R2 (10 GB-mês, 1 milhão de operações de escrita e 10 milhões de leitura por mês; saída de dados grátis; apagar é grátis), conforme a página oficial de preços atualizada em 2026-10-26. Cada Conta usa cerca de 60 kB; copiar uma foto para o privado (tirar do ar) conta como operação de escrita.

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
