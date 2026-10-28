# Pacote para o advogado

Documento **interno**, para o dono levar ao advogado. **Não é publicado** (o site só lê os quatro documentos listados em [README.md](README.md)) e **não é parecer jurídico**: é um mapa, em linguagem simples, de tudo o que o Carmine precisa que um profissional confirme ou decida antes de ligar cada parte. Reúne, num só lugar, os pontos que estavam espalhados como `[VALIDAR COM ADVOGADO]` e `[DONO: ...]` nos Termos, na Política de Privacidade, na Política de Reembolso, nas Regras de conduta, nos três rascunhos (analytics, foto de perfil, VIP e pagamentos), nos ADRs e em [riscos-juridicos.md](riscos-juridicos.md).

Atualizado em 2026-10-28, a partir de: Termos v0.3.1, Política de Privacidade v0.5.0, Política de Reembolso, Regras de conduta, ADRs 0010, 0011, 0021, 0022 e 0023.

## Como usar

1. Mande ao advogado este arquivo e, junto, os quatro documentos publicados e os três rascunhos (`rascunho-a1-analytics.md`, `rascunho-foto-de-perfil.md`, `rascunho-s14-vip-e-pagamentos.md`). Cada ponto abaixo diz em qual arquivo está o texto.
2. Peça as respostas **na ordem da tabela de prioridade**: a primeira rodada destrava o VIP; a segunda, a foto; a terceira, o analytics; o resto é antes da abertura ao público.
3. A lista de **perguntas objetivas, numeradas, para colar num e-mail**, está no fim (seção "As perguntas numa lista só"). A seção "O que o dono preenche" lista o que não é pergunta: são dados seus.
4. Quando as respostas chegarem, siga a seção "Depois da resposta".

## Ordem de prioridade (o que bloqueia o quê)

Hoje **tudo isso está desligado** e nada vai ao ar sem o dono ligar a chave certa.

| Rodada | O que destrava | Chave | Pontos | Quem responde |
|---|---|---|---|---|
| **1** | **Vender o VIP** (a cobrança e a guarda dos Itens VIP, no mesmo dia) | `PAYMENTS_ENABLED=true` e `VIP_HOLD_ENABLED=true` | A1 a A9 | Advogado (A10 é do contador) |
| **2** | **Foto de perfil** | variáveis `R2_MEDIA_*` na VM | B1 a B4 (e D1) | Advogado |
| **3** | **Análise de uso (PostHog)** | `POSTHOG_API_KEY` | C1 a C3 (e D1) | Advogado |
| **4** | **Beta e abertura ao público** | (não há chave: é o que precisa estar resolvido antes de divulgar) | D1 a D7 | Advogado |

**Dentro da rodada 1, a ordem que mais pesa:** A1 (idade do pagador), A2 (arrependimento e reembolso), A4 (ban permanente sem reembolso), A6 (quem aparece como vendedor) e A5 (contestação). São os que mudam texto na tela de compra e podem pedir mudança de código. A3, A7, A8 e A9 costumam ser ajuste de texto. A10 não depende do advogado, mas **também bloqueia** ligar a cobrança.

**O que o advogado pode responder rápido e já destrava:** A6 (escritório virtual), A7 (5 anos de guarda), A8 (30 dias), C2 (aceite do DPA) e B3 (30 e 90 dias).

## Como ler cada ponto

- **Hoje:** o que o Carmine faz agora (ou fará quando ligar).
- **Pergunta:** a dúvida objetiva ao advogado.
- **Onde:** o texto e o código em que isso está.
- **Se a resposta for não:** o que muda no produto, em ordem de esforço.

---

# Rodada 1: vender o VIP

## A1. Idade de quem paga: declaração de maioridade e CPF

- **Hoje:** ninguém é bloqueado por idade para jogar, mas **só maiores de 18 anos pagam**. Antes de pagar, quem paga (o Pagador) declara ser maior, e o CPF dele, informado ao Mercado Pago, fica guardado (cifrado) na compra. O VIP é comprado de dentro da Conta que o recebe, mas o Pagador pode ser outra pessoa (pai, mãe). Não há caixas de recompensa nem sorte paga (ADR 0011), então a verificação de idade do art. 23 do Decreto 12.880 não se aplica.
- **Pergunta:** (1) Declaração de maioridade + CPF devolvido pelo Mercado Pago bastam como "verificação" do Pagador adulto, já que o VIP não é conteúdo proibido a menores? (2) Precisamos conferir que o CPF do pagador do Pix é o mesmo que foi declarado? (3) O fato de o pagador poder ser terceiro (pai ou mãe) muda alguma coisa?
- **Onde:** Termos seção 3 e seção 8 ("Quem pode pagar"), `rascunho-s14-vip-e-pagamentos.md` (seção 1); [riscos-juridicos.md](riscos-juridicos.md) item 4; ADR 0011. Código: `packages/contracts/src/payments.ts` (`ADULT_DECLARATION_VERSION`), `apps/web/src/components/vip/confirm-view.tsx` (a declaração na tela), `apps/api/src/payments/payments.ts` (guarda a data e a versão da declaração), `apps/api/src/payments/payer-document.ts` (CPF cifrado).
- **Se a resposta for não:** a cobrança **continua desligada** até haver um método melhor. As opções, da menor para a maior: conferir o CPF do pagador com o declarado (a API já recebe o CPF do Mercado Pago no pagamento aprovado); só aceitar cartão (o titular do cartão é adulto pelo banco); verificação de idade por terceiro. Cada uma muda a tela de compra e o texto da declaração (a versão da declaração sobe no contrato).

## A2. Arrependimento de 7 dias: 100% do valor, mesmo usando o VIP, e reembolso automático pelo site

- **Hoje:** em até 7 dias da aprovação, "Pedir reembolso" em Minhas compras estorna **na hora, sem análise e sem pedir motivo**, 100% do valor, **mesmo que a pessoa já tenha usado o VIP** naqueles dias (decisão D1). O dinheiro volta pelo mesmo meio de quem pagou. Pelo contato ou pelo Discord, a Staff estorna em até 2 dias úteis; o texto reconhece que "a lei pede que a devolução seja imediata". Pais ou responsáveis podem pedir o cancelamento e a devolução integral da compra feita por menor.
- **Pergunta:** (1) Devolver 100% no arrependimento é obrigatório para serviço digital já consumido (CDC art. 49)? Dá para descontar o uso? (2) O estorno automático pelo site cumpre "imediata" e "mesmo meio" (Decreto 7.962, art. 5º, § 1º)? (3) Os 2 dias úteis pelo contato são aceitáveis ou precisam ser imediatos? (4) O que dizer sobre o prazo do estorno no cartão?
- **Onde:** Política de Reembolso (resumo, seções 1 a 3, 6), Termos seção 8 ("Reembolso"), `rascunho-s14-vip-e-pagamentos.md` (seção 2). Código: `packages/contracts/src/payments.ts` (`REFUND_WINDOW_DAYS = 7`), `apps/api/src/payments/payments.ts` (reembolso pela própria Conta e pela Staff), `apps/web/src/components/settings/refund-action.tsx`, painel `/staff/pagamentos`.
- **Se a resposta for não:** (a) se o uso puder ser descontado: o valor devolvido passa a ser proporcional, e o texto e o botão mostram quanto será devolvido antes de confirmar (mudança na API, que hoje estorna o total); (b) se os 2 dias úteis não servirem: a Staff passa a estornar pelo painel na hora do pedido, ou o pedido por contato vira o do site; (c) se o prazo do cartão precisar ser exato, conferir com o Mercado Pago (`[CONFIRMAR]` na Política de Reembolso, seção 3).

## A3. Servidores fora do ar: compensação em dias e reembolso proporcional

- **Hoje:** mais de 24 horas seguidas sem nenhum Servidor Carmine (ou sem os benefícios do VIP chegando ao jogo): a Staff soma os dias a **todos** os VIPs ativos, sem pedido. Mais de 7 dias: a pessoa também pode pedir **reembolso proporcional** (valor do Pacote × dias não usados ÷ dias do Pacote).
- **Pergunta:** (1) Esses limites (24 horas e 7 dias) e a fórmula são razoáveis, ou a lei pede algo mais protetivo? (2) A compensação em dias (em vez de dinheiro) vale para quem prefere o dinheiro?
- **Onde:** Termos seção 9, Política de Reembolso seção 5, `rascunho-s14-vip-e-pagamentos.md`. Código: `apps/api/src/vip/vip-compensation.ts` (compensação em lote), painel `/staff/pagamentos` (Compensar), `apps/api/src/payments/payments.ts` (reembolso parcial por dias).
- **Se a resposta for não:** muda só o texto e os limites (são constantes da operação, não da lei do produto); se for preciso reembolso em dinheiro já nas 24 horas, o painel da Staff já faz o parcial por dias, e o que muda é a regra de quando usá-lo.

## A4. Ban permanente encerra o VIP, sem devolver os dias que sobram

- **Hoje:** **todo** ban permanente, qualquer que seja o motivo (cheat, ameaça, doxxing, discriminação reincidente, conta alternativa, assédio sexual ou risco a menores, abuso de bug reincidente, fraude ou contestação indevida), encerra o VIP sem reembolso dos dias restantes, **exceto se o recurso for aceito**. Ban temporário não congela o VIP. O aviso aparece **em destaque na tela de compra**, antes do pagamento. Não afeta o arrependimento de 7 dias.
- **Pergunta:** (1) Perder todo o valor dos dias restantes resiste ao CDC (art. 51, IV e § 1º) e ao Código Civil (art. 413, penalidade excessiva), mesmo com o destaque na compra? (2) O Pagador pode ser um terceiro que não trapaceou: isso piora? (3) É melhor devolver os dias restantes com desconto de uma multa razoável (por exemplo 20% do Pacote)? (4) A regra deve valer igual para um abuso de bug reincidente (o caso mais fácil de chamar de desproporcional)?
- **Onde:** Termos seção 8 e seção 10, Política de Reembolso seção 6, Regras de conduta (resumo), [riscos-juridicos.md](riscos-juridicos.md) item 3. Código: `apps/api/src/moderation/sanctions.ts` (`permanentBan`), `apps/api/src/staff/staff-panel.ts` (encerra o VIP quando aplica o ban permanente), `apps/web/src/components/vip/confirm-view.tsx` (o aviso em destaque).
- **Se a resposta for não:** trocar a perda total por devolução proporcional com desconto (o painel da Staff já sabe reembolsar por dias: muda a regra no ban permanente e o texto da tela de compra), ou limitar a perda total aos casos mais graves (cheat, ameaça, assédio, fraude) e devolver nos demais.

## A5. Contestação do pagamento (chargeback e MED do Pix) e bloqueio de compras

- **Hoje:** quando o Mercado Pago avisa uma contestação, o pagamento vira "Contestado", **os dias do Pacote saem do VIP**, a Conta fica **sem poder fazer novas compras** até a Staff revisar e reabrir (com motivo registrado), e a Staff recebe um alerta. Contestar um pagamento legítimo para ficar com o VIP sem pagar é fraude (ban permanente, A4). Pedir o reembolso à Carmine primeiro evita o problema.
- **Pergunta:** (1) Tirar os dias e bloquear novas compras enquanto a Staff revisa é proporcional, ou é preciso esperar o fim da contestação? (2) O texto "contestação indevida" cobre tanto o chargeback do cartão quanto o MED do Pix? (3) Há dever de avisar a pessoa e dar chance de resposta antes do bloqueio?
- **Onde:** Termos seção 10, Política de Reembolso seção 7, `rascunho-s14-vip-e-pagamentos.md`. Código: `apps/api/src/payments/payments.ts` (estado `charged_back`, bloqueio da Conta), `/staff/pagamentos` (reabrir as compras), `docs/operacao/pagamentos.md` e `docs/operacao/mercadopago.md`.
- **Se a resposta for não:** o bloqueio vira um aviso à Staff (sem tirar os dias até a decisão final); a regra é um ajuste na aplicação do estado contestado (`applyProvider`), e o texto dos Termos acompanha.

## A6. Quem aparece como vendedor: CPF, endereço de escritório virtual e conta pessoal no Mercado Pago

- **Hoje:** o Carmine é operado por **pessoa física**, que vende o VIP pelo CPF, com a conta pessoal do Mercado Pago (ADR 0010). O Decreto 7.962 pede nome, CPF e endereço do fornecedor no site; para não publicar o endereço de casa, a decisão é um **endereço de escritório virtual**, e a identificação (nome, CPF, endereço) só aparece **quando a cobrança ligar**. O CNPJ fica como alternativa futura.
- **Pergunta:** (1) Um endereço de escritório virtual atende ao "endereço físico" do art. 2º, II, do Decreto 7.962 para um fornecedor pessoa física? (2) Os termos da conta pessoal do Mercado Pago permitem uso comercial recorrente, ou é preciso abrir CNPJ antes? (3) Vender habitualmente no CPF traz outra obrigação além das do CDC (que já vale)?
- **Onde:** Termos seção 1 (os três campos `[DONO]`), [riscos-juridicos.md](riscos-juridicos.md) item 5, ADR 0010. Código: `apps/web/src/lib/receipt-supplier.ts` (a mesma identificação no recibo, vinda de `RECEIPT_SUPPLIER_NAME`, `RECEIPT_SUPPLIER_DOCUMENT` e `RECEIPT_SUPPLIER_ADDRESS`).
- **Se a resposta for não:** se o escritório virtual não servir, a cobrança só liga com outro endereço (o do dono, o que tem risco de segurança) **ou com CNPJ aberto** (o que também destrava o Pix Automático, 6 meses depois, e a retenção de registros do Marco Civil passa a valer; ver A10 e D4). Se a conta pessoal do Mercado Pago não puder vender, a cobrança espera o CNPJ.

## A7. Dados do Pagador: CPF cifrado por 5 anos, e recibo que não é nota fiscal

- **Hoje:** o CPF do Pagador fica cifrado (só os 3 últimos dígitos aparecem), junto com o registro do pagamento e a declaração de maioridade, por **5 anos** depois da compra (CDC art. 27 e obrigações fiscais). O "recibo" em Minhas compras é um comprovante, **não é nota fiscal** (pessoa física).
- **Pergunta:** (1) 5 anos é o prazo certo para esses dados? (2) Um comprovante sem nota fiscal basta para pessoa física que vende o VIP, ou o contador deve emitir algo? (3) A anonimização da Conta pode manter esses registros sem ligação com o nome de exibição?
- **Onde:** Política de Privacidade seção 7 (linha dos registros de pagamento), `rascunho-s14-vip-e-pagamentos.md` (seção 3), ADR 0023. Código: `apps/api/src/payments/payer-document.ts`, `apps/api/src/accounts/account-erasure.ts` (o que a exclusão mantém), `apps/web/src/app/configuracoes/compras/` (o recibo).
- **Se a resposta for não:** o prazo é uma constante de retenção e o texto da Política acompanha; se for preciso nota fiscal, depende do contador (A10) e entra um passo de emissão.

## A8. Itens VIP guardados por 30 dias e depois apagados

- **Hoje:** quando o VIP acaba, os **Itens VIP** (agentes, music kits, StatTrak e nametag) saem do Inventário e do Loadout e **ficam guardados por 30 dias**; se o VIP voltar nesse prazo, voltam aos mesmos lugares; depois, são apagados e não se recuperam. Skins comuns ficam; só o StatTrak e a nametag delas são guardados. Os Termos (seção 6) já dizem que a pessoa não é dona de nenhum Item. **Hoje os Termos e a Política de Reembolso ainda dizem o contrário** ("continuam no Inventário"): o texto novo entra no mesmo dia em que a guarda liga.
- **Pergunta:** (1) Apagar os Itens VIP depois de 30 dias é aceitável, dado que são simulados e a pessoa não é dona deles? (2) O prazo de 30 dias e o aviso (3 dias antes do fim e no dia) bastam como informação clara?
- **Onde:** Termos seções 6 e 8, Política de Reembolso seção 4, `rascunho-s14-vip-e-pagamentos.md` (seções 1 a 3). Código: `apps/api/src/vip/vip-hold.ts` (`VIP_HOLD_DAYS = 30`, a varredura), `VIP_HOLD_ENABLED`.
- **Se a resposta for não:** muda o prazo (uma constante) ou o que é apagado; se a recomendação for não apagar nunca, os Itens ficam guardados sem limite (o custo é de armazenamento, não de código novo).

## A9. Propriedade intelectual e licenças de terceiros: o que o VIP vende e o que o site usa

- **Hoje:** skins, agentes e marcas são da Valve e dos artistas; os **music kits** têm músicas de terceiros e entram como benefício do VIP; nenhum Item é vendido avulso e não há sorte paga. O visualizador 3D (3d.cstrike.app) não tem licença nem termos escritos; o Animate UI declara "MIT + Commons Clause" (restringe a venda do software); o plugin RockTheVote-CSS não tem licença. A Valve proíbe "fake inventories" (risco contratual, ADR 0002) e matchmaking sem consentimento (só na Fase 2).
- **Pergunta:** (1) Vender o VIP com acesso a music kits e agentes simulados cria risco de propriedade intelectual além do contratual com a Valve? Convém tirar os music kits do VIP (ou só mostrar)? (2) Usar o visualizador sem licença, e o Animate UI com Commons Clause, num produto pago exige permissão por escrito? (3) Sem licença, o RockTheVote-CSS pode continuar?
- **Onde:** [riscos-juridicos.md](riscos-juridicos.md) itens 1 e 6, ADRs 0002, 0006 e 0014. Termos seções 6 e 7.
- **Se a resposta for não:** tirar os music kits do VIP é uma mudança de catálogo (sem migração); o visualizador tem o plano B 2D; o RockTheVote pode ser trocado por outro plugin (impacto só nos servidores).

## A10. Tributação de receita de pessoa física e CNPJ (**do contador, não do advogado**)

- **Hoje:** a receita entra como pessoa física (carnê-leão, alíquota progressiva). Não há CNAE de MEI que sirva. O Pix Automático exige CNPJ ativo há 6 meses; abrir o CNPJ cedo começa a contar o prazo. O dono ainda não conversou com um contador.
- **Pergunta (ao contador):** (1) Como declarar a receita do VIP e quando uma ME ou SLU passa a compensar? (2) Nota fiscal: como ficam as vendas ao consumidor? (3) A conta do Mercado Pago deve ser separada do uso pessoal desde o início?
- **Onde:** [riscos-juridicos.md](riscos-juridicos.md) item 5, `docs/operacao/pagamentos.md`, spec S14.
- **Se a resposta for não:** (a ME compensa) abrir o CNPJ antes de ligar: vira A6 com outra identificação do fornecedor e o Mercado Pago em nome da empresa.

---

# Rodada 2: foto de perfil

## B1. Foto de adolescente e o ECA Digital

- **Hoje:** **todos** podem enviar uma foto de perfil (opcional); ela **aparece na hora**, antes de qualquer análise (publica na hora, modera depois). Não pedimos a idade de ninguém. Quem tem menos de 24 horas de Conta ou uma Punição ativa não envia. O texto recomenda arte, imagem de jogo ou animal em vez de rosto, e proíbe foto de outras pessoas e menor em situação indevida. Os arquivos saem **sem metadados** (data, local, aparelho).
- **Pergunta:** (1) O que o ECA Digital e o art. 14 da LGPD (melhor interesse) exigem de um serviço que deixa qualquer pessoa, inclusive adolescente, enviar uma imagem pública? (2) A verificação de idade pendente (A1) deve valer também para enviar foto? (3) Publicar na hora e moderar depois é aceitável, ou a foto de uma Conta que pode ser de menor precisa ser vista antes?
- **Onde:** `rascunho-foto-de-perfil.md` (pontos 1 e 7, Política seções 2, 3 e 10, Regras), ADR 0022, [riscos-juridicos.md](riscos-juridicos.md) item 4. Código: `apps/api/src/avatars/` (envio, denúncias, moderação, varredura), `docs/operacao/foto-de-perfil.md`.
- **Se a resposta for não:** (a) pré-moderação: exige um bucket de quarentena e uma fila de aprovação antes de publicar (o ADR 0022 descartou por custo; a fila da Staff já existe); (b) restringir o envio a quem declarar 18 anos ou ter VIP; (c) desligar a foto (é só deixar `R2_MEDIA_*` vazio: o site volta ao avatar da Steam).

## B2. Material de abuso: comunicação às autoridades e guarda de evidência

- **Hoje:** a ferramenta de varredura da Cloudflare (CSAM Scanning Tool) bloqueia a URL e **avisa por e-mail** num acerto, mas **a comunicação às autoridades é nossa**. Qualquer pessoa logada pode denunciar uma foto; duas Contas diferentes tiram a foto do ar até a Staff decidir; imagem de menor em situação indevida é removida na hora e, nos casos graves, comunicada (ECA Digital, art. 27), com ban permanente. **O procedimento exato não está definido**: a quem comunicar, como, o que guardar e por quanto tempo.
- **Pergunta:** (1) Qual é o procedimento correto e simples para a Staff (a quem comunicar, em que prazo, por qual canal)? (2) O que guardar como evidência (a imagem? os dados da Conta?) e por quanto tempo, e como guardar sem a Staff ter de manter ou reencaminhar a imagem? (3) Quem na equipe pode tratar esses casos?
- **Onde:** `rascunho-foto-de-perfil.md` (ponto 2), `docs/operacao/foto-de-perfil.md` (passo 6 do "Ligar" e seção 6, "Quando a Staff remove uma foto"), ADR 0022, [riscos-juridicos.md](riscos-juridicos.md) item 6 ("Conteúdo grave envolvendo menores"). Código: `apps/api/src/avatars/avatar-moderation.ts`.
- **Se a resposta for não:** o procedimento é texto operacional (cabe em uma página para a Staff), sem código novo; se o advogado mandar guardar evidência além dos 30 dias (B3), a imagem passa a ficar num local privado sem expiração para esses casos, por um caminho próprio.

## B3. Retenção: foto removida por 30 dias e registros por 90 dias

- **Hoje:** a foto **removida pela Staff** (ou tirada do ar por denúncias) fica **30 dias** num bucket **privado**, só para a Staff e para uma ordem judicial; depois é apagada. Os **registros** de foto trocada, devolvida ou removida, e as denúncias contra elas, são apagados **90 dias** depois de a foto deixar de ser a da Conta (o mesmo prazo das Denúncias do jogo). Excluir a Conta apaga tudo na hora. A limpeza dos 90 dias **já está no ar**.
- **Pergunta:** (1) 30 dias para a foto removida e 90 dias para os registros servem (atender a uma ordem judicial, contestação)? (2) Precisa guardar algo além, por exemplo para a comunicação do B2?
- **Onde:** `rascunho-foto-de-perfil.md` (pontos 3 e 5, Política seção 7), ADR 0022. Código: `apps/api/src/avatars/avatar-retention.ts` (`AVATAR_RECORD_RETENTION_DAYS = 90`; os 30 dias são `AVATAR_REMOVED_RETENTION_DAYS`).
- **Se a resposta for não:** são duas constantes de retenção e o texto da Política.

## B4. Foto pública, prévia do link e a cláusula do que a pessoa envia

- **Hoje:** a foto aparece onde o avatar da Steam aparecia (Perfil, Ranking, busca, listas) e **na prévia do link do Perfil** (WhatsApp, Discord, redes), **mesmo para quem nunca entrou no Carmine**; o Perfil privado **não esconde a foto**. Quem tem o link pode baixar a imagem. Voltar à foto da Steam apaga a nossa na hora (e a CDN em minutos), mas **não dá para apagar o que outros já copiaram**. Hoje **não há cláusula nos Termos sobre conteúdo enviado**; o rascunho propõe: a foto continua da pessoa, ela nos autoriza de graça e sem exclusividade a mostrá-la no Carmine e nas prévias, declara ter direito sobre a imagem e que não mostra outra pessoa sem autorização.
- **Pergunta:** (1) A cláusula proposta é suficiente (e a licença, a autorização de uso de imagem de terceiros e a remoção)? (2) Mostrar a foto na prévia do link, e mesmo no Perfil privado, é compatível com o que dizemos de privacidade e com o ECA Digital (art. 7º, privacidade por padrão)?
- **Onde:** `rascunho-foto-de-perfil.md` (ponto 6, Política seção 4, Termos seção 12), Regras de conduta (seção "Nome de exibição e foto de perfil", proposta).
- **Se a resposta for não:** a foto pode deixar de aparecer na prévia do link (muda o que o Perfil publica para as prévias de link) e passar a respeitar o Perfil privado; o texto da Política acompanha.

---

# Rodada 3: análise de uso (PostHog)

## C1. Legítimo interesse, menores e a chave "Participar da análise de uso" ligada por padrão

- **Hoje:** a API manda ao PostHog avisos de uso (entrou, equipou, conectou, sessão de jogo...) ligados a um **identificador interno e aleatório da Conta** (nunca o SteamID64 nem o ID público); o navegador só manda a contagem de páginas (C3). Não gravamos tela, não guardamos texto (nem chat, nem nametag), não mandamos nada de punição, denúncia ou Staff, e não usamos para anúncios nem para perfil de comportamento. A base legal é o **legítimo interesse**, com direito de oposição pela chave em Configurações, que **vem ligada por padrão** (decisão do dono, 2026-10-21): a Conta participa até desligar, **sem pergunta no cadastro**. Anúncios e patrocínios só de posição fixa ou contextual. Muitos titulares são adolescentes.
- **Pergunta:** (1) O legítimo interesse sustenta a análise de uso de produto, inclusive de adolescentes, ou é preciso consentimento (a chave desligada por padrão)? (2) O texto avaliado por escrito (teste de finalidade, necessidade e balanceamento) está suficiente? (3) A retenção de até 13 meses no PostHog serve?
- **Onde:** ADR 0021, `rascunho-a1-analytics.md` (seções 1 a 3, 6 a 8), `docs/analytics/plano-de-eventos.md`. Código: `apps/api/src/analytics/` (a porta e os adaptadores; a Conta com `analytics_opt_out` não emite), `apps/web/src/components/settings/analytics-setting.tsx` (a chave), `GET/PUT /api/me/analytics`.
- **Se a resposta for não:** a chave passa a "ligada só depois do aceite" **sem mudar o plano** (o ADR já prevê: é inverter o padrão da coluna `analytics_opt_out` e pedir o aceite); o sinal de "quem desistiu no funil" fica menor.

## C2. Transferência para a União Europeia e o DPA do PostHog

- **Hoje:** o PostHog é usado na **região UE**, mas o Carmine é brasileiro: enviar dado pseudonimizado a um fornecedor no exterior é **transferência internacional** (LGPD art. 33; Resolução CD/ANPD nº 19/2024). Depois de 23/08/2025 só valem as **cláusulas-padrão da ANPD** (ou decisão de adequação, que não conferimos para a UE). O dono ainda **não criou a conta nem aceitou o DPA** do PostHog; o texto da Política tem `[CONFIRMAR: DPA do PostHog com as cláusulas-padrão da ANPD aceito pelo Dono]`. O projeto no PostHog liga o "cookieless server hash mode" e **descarta o IP** depois do uso (opção do projeto).
- **Pergunta:** (1) O DPA do PostHog (qual versão, com quais cláusulas) cobre a exigência da ANPD? (2) A UE tem decisão de adequação? (3) Precisamos de algo além do DPA?
- **Onde:** ADR 0021, `rascunho-a1-analytics.md` (seção 5), Política seção 6, spec (tabela do dono: "Revisar com advogado o legítimo interesse, a transferência internacional e o texto de `rascunho-a1-analytics.md`").
- **Se a resposta for não:** sem as cláusulas-padrão, o analytics **não liga** (a API já fica em silêncio sem `POSTHOG_API_KEY`); a alternativa é uma ferramenta no Brasil ou autohospedada (descartada no ADR por custo de manutenção).

## C3. Contagem de páginas sem cookies e sem banner; o GA4 na abertura

- **Hoje:** o navegador só manda a contagem de páginas ao PostHog, **sem cookies e sem guardar nada no aparelho**, com a URL reescrita (`/10016` vira "Perfil"; sem ID, sem consulta, referenciador só o domínio). Por isso **não há banner de consentimento na A1**. O **GA4** entra na abertura, com consentimento explícito (negado por padrão, o script nem carrega antes do aceite), retenção de 2 meses, sem Google Signals nem anúncios, e os dados vão aos **EUA**.
- **Pergunta:** (1) Contar páginas sem cookie e sem storage dispensa aviso e consentimento, com a oposição da chave (para quem está logado) e o texto da Política? (2) Para o GA4: o desenho (consentimento, 2 meses, sem identidade) basta, e o termo do Google aceita um site usado por adolescentes de 13 a 17 anos, mas não direcionado a menores de 13?
- **Onde:** ADR 0021 (atualizações), `rascunho-a1-analytics.md` (bloco "abertura (GA4)"). Código: `apps/web/src/components/analytics/page-view-tracker.tsx`, `apps/web/src/lib/analytics-page.ts` (a URL reescrita) e `analytics-client.ts`.
- **Se a resposta for não:** o aviso de cookies passa a existir na A1 (hoje só nasce com o GA4) e a contagem de páginas só roda depois do aceite; o código de contagem não muda, só o gatilho.

---

# Rodada 4: antes do beta e da abertura ao público

## D1. Transferência internacional (todas, num só lugar)

- **Hoje:** o banco e a API ficam em São Paulo (Oracle); os servidores de jogo, numa VPS no Brasil; mas **vão ou ficam fora do Brasil**: as **cópias de segurança do banco** (e, quando ligada, a **foto de perfil**) no **Cloudflare R2, num bucket no leste da América do Norte (EUA)**, na mesma localização do backup (decisão do dono: um só perfil de transferência); a **Cloudflare** (trânsito, CDN com cópias das fotos em vários países); o **Discord** (EUA); o **Sentry** (Alemanha, UE); o **visualizador 3D** (3d.cstrike.app, possivelmente EUA, com telemetria própria); o **PostHog** (UE, C2); o **Google Analytics** (EUA, C3, na abertura); e o **Mercado Pago** (Brasil). A Política diz que segue o art. 33 e a Resolução CD/ANPD nº 19/2024, "como as cláusulas-padrão contratuais".
- **Pergunta:** (1) Os contratos padrão desses serviços (Cloudflare, Discord, Sentry, viewer) cobrem a exigência da Resolução nº 19/2024, ou é preciso algo a mais para cada um? (2) Só dizer na Política "segue as cláusulas-padrão" é suficiente? (3) O backup nos EUA precisa de atenção especial por conter dados de tudo?
- **Onde:** Política seções 5 e 6, [riscos-juridicos.md](riscos-juridicos.md) (pergunta 8), `rascunho-foto-de-perfil.md` (ponto 4), ADR 0022.
- **Se a resposta for não:** para o R2, trocar a localização para a jurisdição da UE ou para um bucket no Brasil (o ADR 0022 decidiu pela "mesma localização do backup", sem usar a jurisdição UE do R2); o Sentry e o viewer podem ser desligados ou trocados.

## D2. ECA Digital: o Carmine é de "acesso provável" por adolescentes? (a pergunta central)

- **Hoje:** o ECA Digital (Lei 15.211/2025, em vigor desde 17/03/2026, fiscalizada pela ANPD) vale para serviços "de acesso provável" por crianças e adolescentes. O Carmine **não sabe a idade de ninguém** (só pede a declaração do Pagador, A1) e **ninguém é bloqueado por idade para jogar**. O que já cobre: sem caixas de recompensa (art. 20), política contra assédio e canal de denúncia (arts. 6º e 28), recurso com prazo (art. 30), Perfis com `noindex`, histórico de punições só para logados, `!chat off` opcional, classificação ClassInd citada nos Termos. **Lacunas** (valem por inteiro): art. 7º (privacidade máxima por padrão: nome, avatar, Loadout, presença e Estatísticas são públicos por padrão), arts. 16 a 18 (a página "Para pais e responsáveis" não existe; ficou para depois), art. 24 (conta de menor de 16 anos ligada a um responsável) e **art. 21 (jogos com chat: limitar a interação por padrão)**. Sobre o art. 21, o **dono aceitou o risco** (o chat é o do CS2 e o padrão do mercado é chat liberado), mas o ponto segue marcado para o advogado.
- **Pergunta:** (1) **O Carmine é de "acesso provável" por adolescentes e, se for, o que basta para os arts. 7º, 16 e 21 num servidor de CS2 com chat aberto?** O argumento "o chat é do próprio CS2" afasta o art. 21 para quem opera o servidor? (2) Quando a página "Para pais e responsáveis" precisa existir (antes da abertura)? (3) Um padrão mais protetivo (Estatísticas e presença só para logados) é necessário?
- **Onde:** [riscos-juridicos.md](riscos-juridicos.md) item 4 e as decisões do dono de 12/10/2026, Termos seção 3, Regras de conduta. Código: `apps/web/src/app/[publicId]/page.tsx` (`noindex`), `plugins/src/Carmine.Core/ChatPreferences.cs` (`!chat off`).
- **Se a resposta for não:** o que mais custa é a inversão do chat (limitar a interação por padrão: mute global de chat de texto e voz para quem não confirmou idade ou não tem VIP, mexendo no jogo); a página para pais é só conteúdo; tornar Estatísticas e presença visíveis só a logados é uma mudança de visibilidade no Perfil.

## D3. Punições públicas no Perfil e a LGPD; o selo "Cheat"

- **Hoje:** o **selo da punição ativa é público**; o histórico de 12 meses (tipo, categoria genérica, data e duração, sem o motivo) só para quem está logado; Perfis fora de buscadores; não há lista pública de banidos. **Ban permanente por cheat fica sempre visível**, e o Perfil privado não esconde punições. Ban por cheat exige testemunha identificada **ou** evidência anexada; o selo "Cheat" só aparece **com evidência**; com só testemunha, aparece "Violação das regras". Muitos titulares são adolescentes; as Contas não reivindicadas nunca aceitaram nada no site.
- **Pergunta:** (1) O legítimo interesse sustenta expor publicamente que um adolescente foi punido? (2) Qual o limite de tempo razoável para o ban por cheat ficar visível (hoje, enquanto durar; sugerido: 24 meses)? (3) Uma testemunha identificada, sem evidência guardada, basta para sustentar um ban permanente e o texto "Violação das regras"? (4) O teste de balanceamento por escrito (1 a 2 páginas) que a ANPD pede está pronto?
- **Onde:** Política seções 3 e 4 ("Sobre as punições no Perfil"), Regras de conduta (seção "Punições no Perfil"), [riscos-juridicos.md](riscos-juridicos.md) item 2. Código: `apps/api/src/moderation/` e a visibilidade em `apps/web/src/app/[publicId]/`.
- **Se a resposta for não:** limitar o prazo do selo (o selo ativo some quando a punição acaba; o ban permanente passa a expirar da vista do Perfil depois de N meses, uma regra de exibição), ou mostrar o histórico só à Staff.

## D4. Retenções (S12b e as demais) e registros de acesso

- **Hoje:** tudo o que guardamos e por quanto tempo (Política seção 7; as constantes estão em `packages/contracts/src/reports.ts` e o job em `apps/api/src/reports/data-retention.ts`):

  | Dado | Prazo |
  |---|---|
  | Chat de texto copiado dos servidores | 30 dias |
  | Eventos do jogo (só a chave de repetição) | 30 dias |
  | Denúncias, com a cópia do chat | 90 dias |
  | Sessões de jogo (dia, mapa, duração) | 90 dias |
  | Atividade por dia (mapa de calor do Perfil, S12b) | 400 dias |
  | Horas de servidor (vitrine do servidor) | 400 dias |
  | Somas semanais e armas mais usadas (Ranking, Perfil) | enquanto a Conta existir |
  | Registro de avisos de pagamento | 12 meses |
  | Registros de pagamento, CPF cifrado e declaração de maioridade | 5 anos (A7) |
  | Registro interno de punições e ações da Staff | 24 meses depois do fim (permanentes: enquanto durarem) |
  | Endereço IP e registros técnicos | até 6 meses |
  | Conta não reivindicada, sem conectar | 24 meses, depois anonimizada |
  | Cópias de segurança do banco | 30 dias |
  | Foto removida (privada) e registros de foto | 30 e 90 dias (B3) |
  | Avisos de uso no PostHog | até 13 meses (C1) |

  Detalhes por pessoa (horário e duração de cada Sessão de jogo, atividade por dia, armas) aparecem no Perfil público por padrão (o dono do Perfil pode torná-lo privado). O Marco Civil (art. 15) obriga a guardar registros de acesso por 6 meses só pessoa jurídica; como pessoa física, guardamos o mesmo prazo por segurança.
- **Pergunta:** (1) Esses prazos são proporcionais à finalidade de cada dado? (2) Mostrar publicamente horários de jogo e Sessões recentes de um adolescente é adequado, ou é dado a esconder por padrão (liga com D2, art. 7º)? (3) Guardar os registros de acesso por 6 meses sendo pessoa física é prudente, ou melhor só atender a ordem?
- **Onde:** Política seção 7 e seção 8, `docs/operacao/exclusao-de-dados.md`, a proposta da S12b (`carmine-s12b-proposta.md`, seção 7). Código: `apps/api/src/reports/data-retention.ts`, `retention-job.ts`, `apps/api/src/avatars/avatar-retention.ts`, `apps/api/src/accounts/account-erasure.ts` (a exclusão).
- **Se a resposta for não:** cada prazo é uma constante (e uma linha da Política); esconder Sessões e atividade do Perfil público é uma mudança de visibilidade no Perfil.

## D5. Quem é o controlador e o encarregado; dados a preencher; pequeno porte

- **Hoje:** o controlador e o **encarregado são o próprio dono**, com e-mail de contato (a promessa é responder em até 15 dias). Pela Resolução CD/ANPD nº 2/2022, pessoa física pode ser agente de pequeno porte, mas **perde os benefícios** (dispensa de encarregado, prazos em dobro) se o tratamento for de alto risco: e punições públicas envolvendo adolescentes contam (D3).
- **Pergunta:** (1) O dono pode acumular as funções de controlador e encarregado? (2) O Carmine perde mesmo os benefícios de pequeno porte e precisa de relatório de impacto (RIPD)? (3) O que mais a Política precisa dizer sobre o encarregado?
- **Onde:** Política seção 1 (campos `[DONO]`), [riscos-juridicos.md](riscos-juridicos.md) item 2 e a decisão 2 de 12/10/2026.
- **Se a resposta for não:** alguém de confiança assume o papel de encarregado (muda só o nome e o e-mail da Política) e, se exigido, escreve-se o RIPD (documento, não código).

## D6. Moderação: denúncias graves, Marco Civil e conta alternativa

- **Hoje:** denúncias graves (discriminação, ameaça, conteúdo sexual com menores) são tratadas rápido, com registro; "assédio sexual ou risco a menores" é ban permanente na primeira vez, com comunicação às autoridades (art. 27 do ECA Digital); denúncia falsa é tratada como ofensa pessoal. Para pegar quem volta com outra conta, **a Staff compara contas novas com as punidas (histórico de jogo e amigos Steam em comum)** antes de aplicar a linha de "conta alternativa". Excluir a Conta **não apaga um ban permanente ativo**.
- **Pergunta:** (1) Depois da mudança do STF no art. 19 do Marco Civil (Temas 533 e 987), qual é o dever de agir e de guardar registro nas denúncias graves? (2) Comparar contas pelo histórico de jogo e amigos Steam é tratamento legítimo? (3) Manter um registro mínimo de ban permanente depois da exclusão da Conta é aceitável?
- **Onde:** Regras de conduta (denúncias e conta alternativa), Termos seção 13, Política seção 8 ("Exclusão da Conta"), [riscos-juridicos.md](riscos-juridicos.md) item 6.
- **Se a resposta for não:** ajuste de texto e de procedimento da Staff; a comparação de contas é um passo manual, fácil de mudar.

## D7. Outros pontos antes da abertura

- **Sorteios e brindes:** sortear VIP em live ou no Discord é promoção comercial e, em regra, precisa de autorização do Ministério da Fazenda (Lei 5.768/1971). **Hoje não há sorteio**; a regra interna é não fazer sem consultar. Brinde para todos (sem sorteio) não tem o problema.
- **Marca "Carmine":** fazer a busca no INPI antes de investir em divulgação.
- **Aceite por adolescentes:** contratos de menores de 16 anos são nulos e, de 16 a 18, anuláveis (Código Civil, arts. 3º, 4º, 166 e 171). Para o jogo grátis pesa pouco; para o VIP, é um motivo a mais para o Pagador adulto (A1).
- **Termos da Steam Web API e o Steam Subscriber Agreement:** buscar avatar de Contas não reivindicadas no connect é defensável, mas é leitura nossa; **matchmaking** sem consentimento escrito da Valve é proibido (só na Fase 2).
- **Pergunta:** o advogado confirma cada um (a Fase 2 pede parecer próprio).
- **Onde:** [riscos-juridicos.md](riscos-juridicos.md) item 6, ADR 0001.

---

# O que o dono preenche (não é pergunta ao advogado)

| O quê | Onde | Quando |
|---|---|---|
| Nome completo, CPF e endereço do **escritório virtual** do fornecedor | Termos seção 1; recibo (`RECEIPT_SUPPLIER_*` no `.env` do web) | Antes de ligar a cobrança |
| Nome do controlador/encarregado e e-mail de contato (por exemplo `privacidade@stcarmine.com`) | Política seção 1 | Antes do beta |
| Nome do provedor da VPS dos servidores de jogo, no Brasil | Política seção 5 | Antes do beta |
| Aceitar o **DPA do PostHog** (cláusulas-padrão da ANPD) e criar a conta (região UE) | PostHog; `[CONFIRMAR]` na Política | Antes de ligar `POSTHOG_API_KEY` |
| Confirmar com o PostHog a **retenção** configurável (até 13 meses) | Política seção 7 | Antes de ligar o analytics |
| Confirmar com o Mercado Pago o **prazo de estorno no cartão** | Política de Reembolso seção 3 (`[CONFIRMAR]`) | Antes de ligar a cobrança |
| Conferir **uma vez** no portal do ClassInd a classificação do CS2 (16 anos) | Termos seção 3 | Antes do beta |
| Pedir a **partner key** do viewer 3D por escrito (A9) | support@ianlucas.net | Antes da abertura |
| Conversar com um **contador** (A10) | tributação e CNPJ | Antes de ligar a cobrança |
| Decidir a **verificação de idade** (A1), idealmente com o advogado | cobrança | Antes de ligar a cobrança |

# As perguntas numa lista só

Para colar num e-mail. Cada número aponta para o ponto acima.

**VIP e pagamentos (rodada 1)**

1. (A1) Declaração de maioridade + CPF do pagador conferido valem como verificação do Pagador adulto no VIP? Ter um terceiro pagando muda algo?
2. (A2) Devolver 100% no arrependimento de 7 dias é obrigatório para serviço digital já usado? O estorno automático pelo site cumpre "imediato" e "mesmo meio"? São aceitáveis os 2 dias úteis pelo contato?
3. (A3) Os limites de 24 horas (compensação em dias) e 7 dias (reembolso proporcional) e a fórmula do valor são razoáveis?
4. (A4) A perda total dos dias restantes em **todo** ban permanente resiste ao CDC (art. 51) e ao Código Civil (art. 413), mesmo com destaque na compra? É melhor devolver proporcionalmente com uma multa (por exemplo 20%)? E no abuso de bug reincidente?
5. (A5) Tirar os dias e bloquear novas compras durante uma contestação (chargeback ou MED) é proporcional? Precisa avisar a pessoa antes?
6. (A6) Endereço de escritório virtual atende ao "endereço físico" do art. 2º do Decreto 7.962? A conta pessoal do Mercado Pago pode vender recorrentemente?
7. (A7) Cinco anos de guarda do CPF cifrado, do registro de pagamento e da declaração de maioridade estão certos? Um comprovante sem nota fiscal basta?
8. (A8) Apagar os Itens VIP 30 dias depois do fim do VIP, com aviso, é aceitável?
9. (A9) Vender music kits e agentes simulados como benefício cria risco de propriedade intelectual? Precisamos de permissão por escrito para o viewer e o Animate UI? O RockTheVote-CSS sem licença pode continuar?

**Foto de perfil (rodada 2)**

10. (B1) O que o ECA Digital e o art. 14 da LGPD exigem de quem deixa qualquer pessoa, inclusive adolescente, publicar uma imagem? Publicar na hora e moderar depois é aceitável? A verificação de idade vale também aqui?
11. (B2) Qual o procedimento, simples, para comunicar material de abuso às autoridades e o que guardar como evidência e por quanto tempo?
12. (B3) 30 dias (foto removida) e 90 dias (registros) servem?
13. (B4) A cláusula de conteúdo enviado é suficiente? Mostrar a foto na prévia do link e no Perfil privado é aceitável?

**Analytics (rodada 3)**

14. (C1) Legítimo interesse, com chave de oposição ligada por padrão, sustenta a análise de uso inclusive de adolescentes, ou é preciso consentimento prévio?
15. (C2) O DPA do PostHog cobre as cláusulas-padrão da ANPD? A UE tem adequação?
16. (C3) Contar páginas sem cookie e sem storage dispensa aviso? O desenho do GA4 (consentimento, 2 meses, sem identidade) basta?

**Antes do beta e da abertura (rodada 4)**

17. (D1) Os contratos padrão da Cloudflare, do Discord, do Sentry e do viewer cobrem a Resolução CD/ANPD nº 19/2024? O backup e a foto no R2 nos EUA pedem algo além?
18. (D2) **O Carmine é de "acesso provável" por adolescentes e, se for, o que basta para os arts. 7º, 16 e 21 com chat aberto?** Quando a página "Para pais e responsáveis" é necessária?
19. (D3) O legítimo interesse sustenta mostrar o selo de punição de adolescentes? Qual o prazo razoável para o ban por cheat ficar visível? Testemunha sem evidência basta?
20. (D4) Os prazos de retenção da lista são proporcionais? É adequado mostrar horários e Sessões recentes de adolescentes no Perfil público?
21. (D5) O dono pode ser controlador e encarregado? Há RIPD obrigatório?
22. (D6) Qual o dever de agir e de guardar registro nas denúncias graves? Comparar contas pelo histórico e amigos Steam é legítimo? Manter um registro mínimo do ban permanente após a exclusão é aceitável?
23. (D7) Sorteios, marca no INPI e aceite por adolescentes: confirmar.

# Depois da resposta

Siga a ordem das rodadas. **Em cada rodada:**

1. Ajuste os textos dos documentos publicados e do rascunho da rodada conforme as respostas.
2. **Suba a versão e a data** (`updatedAt`, `version`) de cada documento alterado e **tire os marcadores** `[VALIDAR COM ADVOGADO]`, `[DONO]` e `[CONFIRMAR]` resolvidos. A página só deixa de ser "rascunho" na versão 1.0.0 (ver [README.md](README.md)).
3. Mova o texto do rascunho para o documento certo **no mesmo PR que liga a chave**, e avise no site e no Discord (como dizem os Termos e a Política):
   - **Rodada 1:** `PAYMENTS_ENABLED=true` e `VIP_HOLD_ENABLED=true` no mesmo dia, com `termos-de-uso.md`, `politica-de-reembolso.md` e `politica-de-privacidade.md` atualizados (o rascunho S14d); sem isso, a guarda dos Itens VIP descumpre o que está publicado.
   - **Rodada 2:** `R2_MEDIA_*` na VM, com `politica-de-privacidade.md`, `regras-de-conduta.md` e `termos-de-uso.md` (o rascunho da foto).
   - **Rodada 3:** `POSTHOG_API_KEY`, com `politica-de-privacidade.md` (o rascunho A1, versão 0.6.0).
4. Se uma resposta for "não" e pedir mudança de código, abra a tarefa **antes** de ligar a chave; este documento diz, em "Se a resposta for não", onde mexer.
5. Marque aqui a data da resposta de cada ponto (acrescente uma linha "Respondido em AAAA-MM-DD por ..." no ponto) e mantenha este arquivo atualizado.
