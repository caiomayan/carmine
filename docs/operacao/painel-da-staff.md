# Painel da Staff em produção (staff.stcarmine.com, S25)

O painel da Staff é um app à parte (`apps/staff`), em `staff.stcarmine.com`, com duas travas: o **Cloudflare Access** (código por e-mail, só para os e-mails da Staff) e, depois, o **login Steam próprio do painel**, que só deixa entrar Conta com papel de Staff. A homologação (`staff-dev.stcarmine.com`) já roda assim: o roteiro dela está em [homologacao.md](homologacao.md). Decisões: [ADR 0015](../adr/0015-web-e-api-na-mesma-origem.md) (uma sessão por host) e a S25 em [beta-aberto.md](../specs/beta-aberto.md).

**Este documento é só o roteiro.** Nada nele foi executado: o Cloudflare, a VM e a produção não foram tocados. O dono executa os passos, ou autoriza quem for executar, na ordem abaixo.

> **Nenhuma release antes dos passos 1 a 3.** A release que traz a #233 tira o painel antigo do site; sem o Access e as rotas, a Staff fica sem painel até o rollback.

## O que a release traz

A release que levar a issue #233 muda, na produção, só o que está no repositório:

- `infra/prod/compose.yml`: o serviço `staff` (imagem `carmine-staff`, o mesmo `IMAGE_TAG`), sem porta publicada; `PUBLIC_STAFF_URL` na API e no web; o painel entra na lista de proxies confiáveis da API (ele repassa o IP real, como o web). Memória: +512 MB, de 7,3 GB para 7,8 GB dos 12 GB da VM.
- O site deixa de ter qualquer tela da Staff. `stcarmine.com/staff` (e o que vem abaixo) responde 307 para `staff.stcarmine.com`: `/staff` vai para o Início do painel; `/staff?q=…`, a busca antiga, para `/contas?q=…`; `/staff/auditoria?acao=x` vai para `/auditoria?acao=x`. Os links antigos (favoritos, avisos no Discord) continuam valendo. Sem `PUBLIC_STAFF_URL` no web, o site responde 404 nesses caminhos.
- `infra/prod/tunnel/ingress.json`: a cópia versionada das duas rotas novas do túnel (o painel do Cloudflare é a fonte; a cópia é só referência).

**Por isso a ordem importa.** Enquanto o Access e as rotas não existirem, a release deixaria a Staff sem painel (o site já não tem as telas, e o endereço novo não responde). Faça os passos 1 a 3 **antes** de cortar a release, e o 4 e o 5 com ela.

## Passos do dono (~15 min)

- [ ] **1. Access do painel (primeiro, antes de qualquer rota).** Zero Trust > Access > Applications > *Add an application* > *Self-hosted*. Nome `Carmine produção painel`; domínio `staff.stcarmine.com` (o host inteiro, `/api` incluído); duração da sessão 1 mês. Política *Allow* com a regra *Emails* = só os e-mails da Staff; login por *One-time PIN*. Nenhuma política *Bypass* nem *Everyone*. **Por que primeiro:** a rota do túnel (passo 2) põe o endereço no ar na hora; sem o Access já criado, ele ficaria público por alguns minutos, sem a primeira trava.
- [ ] **2. Rotas do túnel de produção (só depois do Access).** Zero Trust > Networks > Tunnels > o túnel da produção > Public Hostnames. Duas rotas novas, **nesta ordem** (a de `/api` primeiro): `staff.stcarmine.com` com o caminho `/api` → o serviço da API; `staff.stcarmine.com` sem caminho → o serviço do painel. Os destinos exatos são as duas linhas `staff.stcarmine.com` de `infra/prod/tunnel/ingress.json`. As regras que já existem (`stcarmine.com` e a do SSH) não mudam. A cópia versionada é `infra/prod/tunnel/ingress.json`. Não rode `apply-ingress.sh` antes de o Access existir: ele troca a configuração inteira do túnel de uma vez.
- [ ] **3. DNS.** O registro de `staff` é criado pelo próprio painel do túnel ao salvar a rota (CNAME proxied para o túnel); confira em DNS > Records. Até a release subir, o endereço responde erro de gateway atrás do Access, o que é o esperado.
- [ ] **4. Cortar a release** pelo fluxo de sempre ([deploy-e-rollback.md](deploy-e-rollback.md)). O deploy sobe o serviço `staff` junto, e o `--wait` espera a checagem de saúde dele.
- [ ] **5. Conferir.** Abra `https://staff.stcarmine.com`: o Access pede o código por e-mail; depois, *Entrar com a Steam*. Uma Conta **sem** papel de Staff volta para a entrada com "sem acesso" e nenhuma sessão; a sua Conta (Dono) entra no Início. Abra `https://stcarmine.com/staff` com a sessão do site: tem de ir para o Início do painel (`https://staff.stcarmine.com/`). Confira uma tela de cada papel que você usa (Denúncias, Fotos, uma ficha de Conta).

## Se algo der errado

- **O painel não abre ou a release trouxe problema:** volte a tag anterior pelo `deploy-e-rollback.md`. O site antigo (com `/staff`) volta junto; as rotas do túnel podem ficar (sem o serviço `staff`, respondem erro de gateway atrás do Access).
- **Tirar o painel do ar sem desfazer a release:** desative as duas rotas `staff.stcarmine.com` no painel do túnel. O Access fica de pé; nada fica público.
- **A Staff não consegue entrar pelo Access:** confira o e-mail na política do passo 1 (o código só vai para e-mail listado).
- **O login Steam volta com erro:** a API monta o endereço de retorno com `PUBLIC_STAFF_URL` (`https://staff.stcarmine.com`, no compose). A Steam não pede cadastro do endereço.

## O que saiu do site e onde ficou no painel

A S25 pede que o painel cubra "o que funciona hoje" antes de apagar. Conferido por tela e pelas chamadas à API: o painel usa os mesmos endpoints `/api/staff/*` do site antigo, sem nenhum a menos.

| Era no site (`/staff/...`) | Agora no painel |
| --- | --- |
| `/staff` (busca de Contas, quem é da Staff) | `/contas` (o `/staff` puro vai para o Início `/`) |
| `/staff/contas/<ID>` (ficha: Punição, VIP, Ranking, papel, nome, foto, exclusão) | `/contas/<ID>` |
| `/staff/denuncias` | `/denuncias` (casos agrupados, ADR 0027) |
| `/staff/fotos` | `/fotos` |
| `/staff/pagamentos`, `/staff/pagamentos/<id>` | `/pagamentos`, `/pagamentos/<id>` |
| `/staff/servidores` | `/servidores` |
| `/staff/auditoria` | `/auditoria` |
| Protótipo `/dev/staff` (vitrine da direção) | o próprio painel |

Uma diferença de forma: a exclusão de dados (anonimizar a Conta) pedia um diálogo de confirmação no site; no painel, o formulário pede o motivo e a marca "entendo que não tem volta". A regra (só o Dono, sem volta) é a mesma.
