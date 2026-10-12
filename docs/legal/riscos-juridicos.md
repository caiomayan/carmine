---
title: Riscos jurídicos
updatedAt: 2026-10-12
version: 0.3.0
---

Documento interno, para o dono e para o advogado que revisar o Carmine. **Não é para publicar no site.** Não é parecer jurídico: é um mapa honesto dos pontos sensíveis, com o que já mitiga cada um e as perguntas a levar ao advogado.

## Resumo

| # | Ponto | Risco | Mais urgente |
|---|---|---|---|
| 1 | Skins simuladas e as regras da Valve | **Alto** (provável e com impacto direto no produto) | Aceito no ADR 0002; o resto é contratual |
| 2 | Punições públicas no Perfil e a LGPD | **Médio-alto** | Antes do beta (S07/S08) |
| 3 | VIP encerrado sem reembolso em ban permanente e o CDC | **Médio** | Antes de ligar a cobrança (S14) |
| 4 | Idade e ECA Digital | **Alto** (lei nova, fiscalização da ANPD, multas altas) | Antes do beta e antes de cobrar |
| 5 | Operação como pessoa física (CPF) | **Médio** e cresce com a receita | Antes de cobrar |
| 6 | Outros: licenças, músicas, Marco Civil, sorteios, marca | Baixo a médio | Antes da abertura |

## Decisões do dono (12/10/2026)

1. Identificação do fornecedor só quando a cobrança ligar: CPF + endereço de escritório virtual; CNPJ fica como alternativa futura.
2. Encarregado LGPD: o próprio dono, com e-mail de contato.
3. Dados no Brasil: Oracle São Paulo e VPS brasileira; Cloudflare como trânsito.
4. Retenção: Conta não reivindicada inativa, 24 meses; punições internas, 24 meses; IP, 6 meses; chat, 30 dias; backups, pela rotação.
5. Ban permanente por ameaça ou doxxing encerra o VIP sem reembolso, como o de cheat, com destaque obrigatório na tela de compra.
6. Estorno no arrependimento em até 2 dias úteis, pedido pelo mesmo meio da compra.
7. Aprovadas as linhas de assédio sexual ou risco a menores (permanente + comunicação às autoridades) e de denúncia falsa (como ofensa pessoal).
8. Reincidência: janela móvel de 30 dias por categoria.
9. Ninguém é bloqueado por idade para jogar; os termos citam a classificação do ClassInd (16 anos, violência) e o papel do responsável; compra só por Pagador adulto.
10. Mitigações do ECA Digital: todos os Perfis com `noindex`; histórico de punições só para quem está logado (o selo da punição ativa continua público); ban por cheat exige testemunha identificada (jogador ou não) **ou** evidência anexada, ou ambas; `!chat off` opcional para o jogador esconder o chat para si. A página para pais fica para depois.

### Rodada J2 (12/10/2026)

11. Regra única: **todo ban permanente encerra o VIP sem reembolso**, qualquer que seja o motivo, com destaque na tela de compra.
12. Ban por cheat apoiado só em testemunha continua permanente, mas o Perfil mostra a categoria neutra "Violação das regras"; o selo "Cheat" só aparece com evidência anexada.
13. ECA Digital, art. 21: o dono **aceita o risco**. O chat é o do próprio CS2, e o padrão do mercado é chat liberado, salvo punição. O `!chat off` continua opcional e o padrão não é invertido; o ponto segue marcado para o advogado.

## 1. Skins simuladas e as regras da Valve

**Situação.** A Valve proíbe servidores comunitários de oferecer itens que o jogador não possui ("fake inventories"), grátis ou pagos, sob pena de banimento permanente dos tokens GSLT do operador, sem recurso, e de bloqueio do telefone das contas. O Carmine faz isso de propósito (ADR 0002), como fazem servidores brasileiros grandes que são tolerados, e ainda vende VIP com Itens exclusivos.

**Risco.**

- **Contratual com a Valve, não criminal:** o pior cenário provável é o bloqueio dos tokens e das contas Steam usadas para gerá-los. Isso para o produto, mas não gera multa nem processo por si só.
- **Propriedade intelectual:** skins, agentes e marcas são da Valve e dos artistas da Workshop. Os **music kits** têm músicas de terceiros. Vender acesso a eles no VIP é uso comercial de propriedade intelectual alheia. Uma notificação de remoção (DMCA ou extrajudicial) é possível, e uma ação por danos é improvável, mas não impossível. [VALIDAR COM ADVOGADO]
- **Termos da Steam Web API:** (a) a política de privacidade deve dizer em que país os dados da Steam ficam guardados (já há um campo para isso na política); (b) "só buscar dados Steam de um usuário quando ele pedir": buscar o avatar de Contas não reivindicadas no connect é defensável (o próprio jogador conectou), mas é uma leitura nossa; (c) não pode sugerir vínculo com a Valve. A violação pode levar à revogação da chave da API, o que quebra avatares e "amigos jogando", não o login, que usa OpenID.
- **Steam Subscriber Agreement, seção 2.G:** oferecer **matchmaking** sem consentimento escrito da Valve é proibido. Isso não afeta o MVP (servidores fixos), mas afeta a Fase 2 (ADR 0001).

**Mitigação que já existe.** Módulo de skins desligável (ADR 0002); tokens em várias contas; benefícios do VIP que não dependem de skins (Vaga reservada, Presets); cláusula de indisponibilidade com dias congelados e reembolso proporcional; aviso claro de não afiliação; nenhum Item vendido avulso e nenhuma mecânica aleatória.

**Recomendação.** Não usar logos da Valve nem imagens de skins em anúncios pagos; não vender Itens avulsos nunca; antes da Fase 2, ter parecer específico sobre matchmaking; considerar tirar os music kits do VIP (ou só mostrá-los, sem vendê-los como benefício). [VALIDAR COM ADVOGADO]

## 2. Punições públicas no Perfil e a LGPD

**Situação.** O selo da punição ativa é público. O histórico de 12 meses (tipo, categoria genérica, data e duração, sem o motivo) só aparece para quem está logado, e nenhum Perfil é indexado por buscadores. Ban permanente por cheat fica sempre visível, e o Perfil privado não esconde punições. Ban por cheat exige testemunha identificada ou evidência anexada; o selo "Cheat" só aparece com evidência, e com só testemunha o Perfil mostra "Violação das regras" (decisões do dono). Muitos titulares são adolescentes, e as Contas não reivindicadas nunca aceitaram nada no site.

**Risco.**

- **Base legal:** a única base viável é o legítimo interesse (art. 7º, IX), que exige finalidade concreta, necessidade e balanceamento documentados (art. 10 e Guia da ANPD de 2024). A ANPD pode pedir o relatório de impacto (art. 10, § 3º).
- **Adolescentes:** o tratamento tem de respeitar o melhor interesse (art. 14 da LGPD; Enunciado CD/ANPD nº 1/2023; ECA Digital, arts. 3º e 7º). Expor publicamente que um adolescente foi punido é o ponto mais frágil do desenho.
- **Alto risco e perda dos benefícios de pequeno porte:** pela Resolução CD/ANPD nº 2/2022 (art. 4º), tratamento que pode afetar a reputação (critério geral) envolvendo dados de adolescentes (critério específico) é de alto risco. Nesse caso, o Carmine perde a dispensa de encarregado e os prazos em dobro. Por isso a política de privacidade já indica um encarregado e promete resposta em 15 dias.
- **Honra e reputação:** o selo "Cheat" é uma acusação pública e permanente. Se estiver errado, há risco de ação por dano moral (Código Civil, arts. 186 e 927) e, em tese, de difamação. Esse risco foi reduzido: o selo "Cheat" só aparece com evidência anexada. Continua um risco menor: um ban permanente apoiado só em testemunha também encerra o VIP e fica visível como "Violação das regras", e se for contestado na Justiça a defesa depende do relato registrado. [VALIDAR COM ADVOGADO]
- **Indexação:** resolvida pelo `noindex` em todos os Perfis.

**Mitigação que já existe.** Categoria genérica, sem motivo livre; avisos fora do Perfil; janela de 12 meses; histórico só para logados; Perfis fora de buscadores; decisão sempre humana; testemunha ou evidência para cheat; recurso que remove do Perfil; sem lista pública de banidos.

**Recomendação.**

1. Escrever o teste de balanceamento do legítimo interesse (1 a 2 páginas) antes do beta.
2. Registrar no painel, para todo ban por cheat, quem é a testemunha (identificação e contato) e o que ela relatou, ou anexar a evidência. O painel deve escolher a categoria pública sozinho: "Cheat" só com evidência anexada e "Violação das regras" sem ela.
3. Avaliar se o "sempre visível" do ban por cheat deve ter um limite (por exemplo, 24 meses) em vez de ser perpétuo. [VALIDAR COM ADVOGADO]

## 3. VIP encerrado sem reembolso em ban permanente e o CDC

**Situação.** Regra única (decisão do dono): **todo ban permanente encerra o VIP** sem devolver os dias restantes, qualquer que seja o motivo (cheat, ameaça, doxxing, discriminação reincidente, conta alternativa, assédio sexual ou risco a menores, abuso de bug reincidente, fraude ou contestação indevida), com destaque obrigatório na tela de compra. Ban temporário não congela o VIP.

**Risco.**

- Perder todo o valor pago pelos dias restantes funciona como uma multa. O CDC anula cláusulas que coloquem o consumidor em "desvantagem exagerada" (art. 51, IV e § 1º), e o Código Civil manda reduzir a penalidade manifestamente excessiva (art. 413).
- O consumidor é o **Pagador**, que pode ser um pai ou uma mãe que não trapaceou. Um juiz tende a ser menos rigoroso com quem pagou do que com quem jogou.
- Cláusulas que limitam direitos precisam aparecer em destaque no resumo do contrato **antes** da compra (Decreto 7.962/2013, art. 4º, I; CDC, art. 54, § 4º).
- "Chargeback" quase não existe no Pix; o mecanismo é o MED, que é para fraude ou falha operacional. O texto já fala em "contestação indevida", que cobre os dois.
- O ban temporário sem congelar o VIP é mais defensável: a pessoa causou a própria indisponibilidade.
- A regra única é mais simples de explicar, mas alcança casos menos graves. O "abuso de bug" só chega a ban permanente na 4ª vez em 30 dias, e a perda total por esse motivo é a mais fácil de ser chamada de desproporcional.

**Mitigação que já existe.** Ban permanente só para condutas graves ou reincidentes; cláusula em destaque na tela de compra (S14); um recurso por ban permanente, com revisor diferente quando houver Staff; o direito de arrependimento de 7 dias não é afetado.

**Recomendação.** Como alternativa mais segura, devolver os dias restantes com desconto de uma multa razoável (por exemplo, 20% do valor do Pacote) em vez de perda total. Guardar evidência de cada ban por cheat. [VALIDAR COM ADVOGADO]

## 4. Idade e ECA Digital

**Situação.** O ECA Digital (Lei 15.211/2025) vale desde 17/03/2026 e foi regulamentado pelo Decreto 12.880/2026, com a **ANPD** como fiscalizadora. Ele se aplica a serviços "de acesso provável" por crianças e adolescentes (art. 1º): um servidor de CS2 grátis, com skins e chat, é claramente atraente para adolescentes. Hoje, o Carmine não sabe a idade de ninguém e só pede a declaração de maioridade do Pagador, com o CPF informado ao Mercado Pago (ADR 0011).

**O que já está ok.**

- **Caixas de recompensa (art. 20):** proibidas para sempre no Carmine (ADR 0011). Como não há loot boxes, a verificação de idade do art. 23 do Decreto não se aplica.
- **Política contra assédio e canal de denúncia (arts. 6º e 28):** cobertos pelas regras de conduta, pelo `!report` e pelo contato.
- **Recurso com prazos (art. 30) e regras sobre denúncia abusiva (arts. 32 e 33):** cobertos pelas regras de conduta.
- **Compra só por adulto:** atende ao art. 18, II, e ao art. 17 do Marco Legal dos Games.

**Lacunas.** Os arts. 7º, 8º, 16, 21 e 24 **não** estão na lista de obrigações moduladas pelo porte do fornecedor (art. 39), então valem por inteiro:

- **Art. 7º (privacidade máxima por padrão):** Perfis públicos por padrão, inclusive de Contas não reivindicadas, vão contra a "configuração mais protetiva" por padrão para menores. O `noindex` e o histórico de punições só para logados reduzem a exposição, mas nome, avatar, Loadout, presença e Estatísticas continuam abertos por padrão.
- **Art. 21 (jogos com chat), risco aceito pelo dono:** jogos de acesso provável por menores com chat de texto ou voz devem, **por padrão, limitar a interação** para garantir o consentimento dos pais. Os Servidores Carmine têm chat aberto, como todo servidor de CS2. O dono aceita o risco: o chat é o do próprio CS2 (o Carmine não cria um canal de conversa novo) e o padrão do mercado é chat liberado, salvo punição. O `!chat off` opcional ajuda, mas não inverte o padrão. O argumento "o chat é do CS2" é razoável, mas não é garantido: o art. 21 fala do jogo de acesso provável, e quem opera o servidor controla o chat (gag, mute, logs). **Continua sendo a maior lacuna.** [VALIDAR COM ADVOGADO]
- **Arts. 16 a 18 (supervisão parental):** não há ferramenta para os pais; a página com informações para eles ficou para depois (decisão do dono). O art. 16 exige essas informações para "acesso provável", sem modulação por porte.
- **Art. 8º, V, e Decreto 12.880, art. 12, § 4º:** resolvido. Os termos citam a classificação do CS2 (16 anos, violência), conforme o selo DEJUS/ClassInd exibido na loja Steam brasileira. Vale conferir uma vez no portal do ClassInd.
- **Classificação 16 e ninguém bloqueado por idade:** a classificação indicativa é orientação, não proibição, e o ECA Digital (art. 3º, parágrafo único) põe a supervisão nos pais. Mas um serviço que sabe que o jogo é "16" e deixa menores de 16 jogarem e conversarem por padrão reforça o enquadramento como "acesso provável". [VALIDAR COM ADVOGADO]
- **Art. 24 (contas de menores de 16 vinculadas a um responsável):** está no capítulo de redes sociais, mas o texto fala em "produtos ou serviços". O Carmine não é rede social, mas o Perfil, o Ranking e os amigos o aproximam disso.
- **Declaração de maioridade + CPF:** a vedação expressa à autodeclaração (art. 9º, § 1º) vale para conteúdo **proibido** a menores, e o VIP não é. Mesmo assim, o CPF informado ao Mercado Pago não prova que quem está pagando é o titular nem que é adulto.

**Sanções.** Advertência; multa de até 10% do faturamento ou, sem faturamento, de R$ 10 a R$ 1.000 por usuário cadastrado, limitada a R$ 50 milhões por infração; suspensão e proibição da atividade, estas pelo Judiciário (art. 35). A ANPD deve considerar o porte e a capacidade econômica (art. 34, § 2º; art. 35, § 1º, III).

**Recomendação.**

1. Não adiar demais a página "Para pais e responsáveis" (art. 16): com riscos, ferramentas do CS2 e `!chat off` para silenciar jogadores, e o canal para pedir dados, exclusão ou bloqueio da Conta do filho. Idealmente, publicá-la antes da abertura ao público.
2. Avaliar um padrão mais protetivo nos Perfis (por exemplo, Estatísticas e presença visíveis só para quem está logado) e um bloqueio de Conta a pedido dos responsáveis.
3. Para o VIP, conferir que o CPF do pagador do Pix (devolvido pelo Mercado Pago) é o mesmo CPF declarado, e manter a cobrança desligada até a decisão sobre verificação de idade (S14).
4. Levar ao advogado a pergunta central: **o Carmine é de "acesso provável" por adolescentes e, se for, o que basta para cumprir o art. 21 sem quebrar o jogo?** [VALIDAR COM ADVOGADO]

## 5. Operação como pessoa física (CPF)

**Situação.** Um estudante opera o Carmine no próprio CPF, com o Mercado Pago em conta de pessoa física (ADR 0010).

**Risco.**

- **CDC vale do mesmo jeito:** pessoa física que vende serviço habitualmente é fornecedora (CDC, art. 3º). Todas as obrigações de consumo se aplicam.
- **Exposição pessoal:** o Decreto 7.962/2013 (art. 2º) exige mostrar no site o nome, o **CPF** e o **endereço físico** do fornecedor. Para um estudante que bane jogadores, publicar o endereço de casa é um risco real de segurança (o mesmo doxxing que as regras proíbem).
- **Patrimônio pessoal:** dívidas, multas e indenizações do Carmine recaem sobre os bens do dono, sem separação.
- **Tributos:** receita recebida como pessoa física vai para o carnê-leão mensal, com alíquota progressiva. Não há CNAE de MEI que sirva (memória de pesquisa de 2026-10-10). Sem planejamento, a carga pode ser maior que a de uma ME no Simples.
- **Mercado Pago:** os termos da conta pessoal podem limitar o uso comercial recorrente. [VALIDAR COM ADVOGADO]
- **Pix Automático:** exige CNPJ ativo há 6 meses (Resolução BCB 482/2025). Abrir o CNPJ cedo começa a contar esse prazo.
- **LGPD:** pessoa física pode ser agente de pequeno porte (Res. CD/ANPD 2/2022, art. 2º, I), mas perde os benefícios se o tratamento for de alto risco (item 2).
- **Marco Civil:** a guarda obrigatória de registros de acesso por 6 meses (art. 15) só vale para pessoa jurídica. Com CNPJ, passa a valer.

**Decisão do dono.** Continuar no CPF; publicar nome, CPF e endereço de escritório virtual só quando a cobrança ligar; CNPJ como alternativa futura.

**Recomendação.** Confirmar com o advogado se o endereço de escritório virtual atende ao art. 2º, II, do Decreto 7.962 ("endereço físico"). Antes de ligar a cobrança, conversar com um contador sobre o carnê-leão e sobre quando a ME ou SLU passa a compensar (lembrando que o prazo de 6 meses para o Pix Automático só começa a contar com o CNPJ aberto). Separar a conta do Mercado Pago do uso pessoal e guardar todos os comprovantes. [VALIDAR COM ADVOGADO]

## 6. Outros pontos

- **Licenças de terceiros:** o visualizador 3d.cstrike.app não tem licença nem termos (ADR 0006), e o uso num produto pago depende de permissão informal; o Animate UI declara "MIT + Commons Clause", que restringe a venda do software (ADR 0014); o RockTheVote-CSS não tem licença, então tecnicamente não há permissão de uso (spec, S02). Resolver antes de cobrar: pedir a partner key do viewer por escrito, revisar o Commons Clause e pedir licença ao autor do RockTheVote ou trocar o plugin.
- **Conteúdo de jogadores (Marco Civil, art. 19):** em junho de 2025, o STF declarou o art. 19 parcialmente inconstitucional (Temas 533 e 987). Plataformas podem responder por conteúdo ilícito de usuários depois de notificação, em certos casos, sem ordem judicial. Para o Carmine, isso reforça: agir rápido em denúncias graves (discriminação, ameaça, conteúdo sexual com menores) e guardar o registro da ação. [VALIDAR COM ADVOGADO]
- **Conteúdo grave envolvendo menores:** o ECA Digital (art. 27) obriga a remover e comunicar às autoridades o conteúdo de exploração ou abuso sexual, aliciamento e sequestro, e a guardar os dados do caso. Ter um procedimento escrito simples (o que guardar, para quem comunicar) antes do beta.
- **Sorteios e brindes:** sortear VIP em live ou no Discord é promoção comercial e, em regra, precisa de autorização do Ministério da Fazenda (Lei 5.768/1971). Não fazer sorteios sem consultar antes. Brinde para todos (sem sorteio) não tem esse problema.
- **Marca "Carmine":** fazer a busca no INPI antes de investir em divulgação.
- **Aceite por adolescentes:** contratos feitos por menores de 16 anos são nulos e, entre 16 e 18, anuláveis (Código Civil, arts. 3º, 4º, 166 e 171). Para o jogo grátis, isso pesa pouco; para o VIP, é mais um motivo para o Pagador adulto.

## Perguntas para o advogado

1. O Carmine é "de acesso provável" por adolescentes no ECA Digital? Se for, o que basta para os arts. 7º, 16 e 21 num servidor de CS2 com chat aberto? O argumento de que "o chat é do próprio CS2" afasta o art. 21 para o operador do servidor?
2. Declaração de maioridade + CPF conferido com o pagador do Pix é suficiente para a regra de Pagador adulto?
3. O legítimo interesse sustenta mostrar o selo de punição de adolescentes publicamente e o histórico para logados? Qual o limite de tempo razoável para o ban por cheat ficar visível? Uma testemunha identificada, sem evidência guardada, basta para sustentar o selo "Cheat"?
4. A perda total dos dias de VIP em **todo** ban permanente (inclusive por reincidência em abuso de bug) resiste ao CDC, mesmo com destaque na tela de compra, ou é melhor uma multa proporcional?
5. Um 100% de reembolso no arrependimento, mesmo com o VIP usado, é obrigatório para serviço digital consumido na hora?
6. Um endereço de escritório virtual atende ao "endereço físico" do art. 2º do Decreto 7.962/2013 para um fornecedor pessoa física?
7. Vender acesso a music kits e agentes simulados como benefício do VIP cria risco de propriedade intelectual além do risco contratual com a Valve?
8. As transferências internacionais (Cloudflare, Discord, Sentry, viewer 3D) estão cobertas pelos contratos padrão desses serviços, ou é preciso algo além da Resolução CD/ANPD nº 19/2024?

## Base legal e fontes

- Lei nº 15.211/2025 (ECA Digital): <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm>
- Decreto nº 12.880/2026 (regulamenta o ECA Digital): <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12880.htm>
- Decreto nº 12.622/2025 (designa a ANPD como autoridade do ECA Digital): <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12622.htm>
- Lei nº 14.852/2024 (Marco Legal dos Games), arts. 16 e 17: <https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14852.htm>
- Lei nº 13.709/2018 (LGPD), arts. 7º, 10, 14 e 41: <https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm>
- Resolução CD/ANPD nº 2/2022 (agentes de pequeno porte), arts. 2º a 4º, 11 e 14: <https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-2-de-27-de-janeiro-de-2022-376562019>
- ANPD, Guia Orientativo sobre Legítimo Interesse (2024): <https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf>
- ANPD, Enunciado CD/ANPD nº 1/2023: <https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes>
- Lei nº 8.078/1990 (CDC), arts. 3º, 49, 51 e 54: <https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm>
- Decreto nº 7.962/2013 (comércio eletrônico): <https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm>
- Lei nº 10.406/2002 (Código Civil), arts. 3º, 4º, 166, 171, 186, 413 e 927: <https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm>
- Lei nº 12.965/2014 (Marco Civil da Internet), arts. 15 e 19: <https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm>
- STF, Temas 533 e 987 (art. 19 do Marco Civil), julgados em junho de 2025: <https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=987>
- Lei nº 5.768/1971 (distribuição gratuita de prêmios): <https://www.planalto.gov.br/ccivil_03/leis/l5768.htm>
- Banco Central, Resolução BCB nº 482/2025 (Pix Automático) e MED: <https://www.bcb.gov.br/estabilidadefinanceira/pix>
- Steam Subscriber Agreement (atualizado em 10/09/2026), seções 1 e 2.G: <https://store.steampowered.com/subscriber_agreement/>
- Steam Web API Terms of Use: <https://steamcommunity.com/dev/apiterms>
- Steam Support, "CS2 - GSLT Bans": <https://help.steampowered.com/en/faqs/view/07AF-502E-A104-BD4B>
- Dust2 Brasil, "'Lei Felca' começa com indefinição sobre Counter-Strike" (17/03/2026): <https://www.dust2.com.br/noticias/71770/lei-felca-comeca-com-indefinicao-sobre-counter-strike>
