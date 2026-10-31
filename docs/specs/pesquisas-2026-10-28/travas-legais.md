# Levantamento das travas legais (Q3 do grilling, 2026-10-28)

Fonte: estado de `origin/dev`. "LEI EXIGE" = a própria doc cita a lei (ou é obrigação bem conhecida), não parecer de advogado.

| # | Área | Regra | Classificação |
|---|---|---|---|
| 1 | Pagamento | Só Pagador maior de 18, com declaração | INCERTO |
| 2 | Pagamento | CPF do Pagador guardado cifrado | Guardar: escolha nossa; cifrar: boa prática |
| 3 | Pagamento | Cobrança desligada até decidir idade, fornecedor e tributos | Escolha nossa |
| 4 | Pagamento | Sem caixa/roleta paga, para sempre | Lei exige para menores; "para sempre" vai além |
| 5 | Pagamento | Arrependimento 7 dias, 100% mesmo com o plano usado | 7 dias: lei; 100% mesmo usado: incerto |
| 6 | Pagamento | Pais cancelam compra de menor com devolução | Incerto |
| 7 | Pagamento | Estorno pela Staff em 2 dias úteis, mesmo meio | Mesmo meio: lei; prazo: incerto |
| 8 | Pagamento | Queda > 24 h dá dias; > 7 dias reembolso proporcional | Escolha nossa |
| 9 | Pagamento | Ban permanente encerra o plano sem reembolso (aviso em destaque) | Destaque: lei; perda total: regra nossa com risco |
| 10 | Pagamento | Chargeback tira os dias e bloqueia compras | Escolha nossa |
| 11 | Pagamento | Identificação do fornecedor no site e no recibo | Lei exige |
| 12 | Retenção | Pagamento e declaração guardados 5 anos | Lei exige (segundo a doc) |
| 13 | Retenção | Webhooks 12 meses | Escolha nossa |
| 14 | Retenção | Itens do plano guardados 30 dias após o fim | Escolha nossa |
| 15 | Retenção | Chat dos servidores 30 dias; IDs de eventos 30 dias | Escolha nossa (prazos) |
| 16 | Retenção | Denúncias 90 dias; sessões 90; atividade diária 400 | Escolha nossa |
| 17 | Retenção | IP e registros técnicos 6 meses | Escolha nossa (Marco Civil art. 15 não obriga PF) |
| 18 | Retenção | Conta não reivindicada anonimizada em 24 meses | Escolha nossa |
| 19 | Retenção | Foto removida 30 dias; registros de foto 90 dias | Escolha nossa |
| 20 | Privacidade | Exclusão a pedido em até 15 dias | Lei exige (o prazo é nosso) |
| 21 | Privacidade | Encarregado nomeado (o dono) | Incerto |
| 22 | Privacidade | Todos os Perfis com noindex | Escolha nossa |
| 23 | Privacidade | Histórico de punições só para logados, sem lista pública | Escolha nossa |
| 24 | Moderação | Ban por cheat exige testemunha/evidência; selo "Cheat" só com evidência | Escolha nossa |
| 25 | Menores | `!chat off` opcional (não desligado por padrão) | Incerto (risco aceito) |
| 26 | Menores | Ninguém bloqueado por idade; Termos citam ClassInd 16 | Citar a classificação: lei |
| 27 | Menores | Página "Para pais e responsáveis" não existe | Lei exige se "acesso provável" (lacuna) |
| 28 | Moderação | Assédio sexual/risco a menor: ban permanente + comunicação | Comunicar: lei; ban permanente: nosso |
| 29 | Foto | CSAM Scanning Tool + comunicação às autoridades | Comunicar e guardar: lei; ferramenta: nossa |
| 30 | Foto | Conta < 24 h ou punida não envia | Escolha nossa (sai, Q1) |
| 31 | Foto | 3 envios por 24 h | Escolha nossa (vira 5/30 min + 10 s, Q1) |
| 32 | Foto | 2 denúncias tiram a foto do ar; Staff decide em 24 h | Escolha nossa |
| 33 | Foto | 5 denúncias por pessoa por hora | Escolha nossa |
| 34 | Foto | Bloqueio após remoção 7/30/365 dias | Escolha nossa |
| 35 | Foto | WebP sem EXIF, só o recorte | Escolha nossa (minimização) |
| 36 | Analytics | PostHog só com ID aleatório, sem gravação de tela | Escolha nossa |
| 37 | Analytics | Opção de sair da análise, ligada por padrão | Direito de oposição: lei; padrão: incerto |
| 38 | Analytics | PostHog só com DPA e cláusulas-padrão ANPD | Lei exige (transferência internacional) |
| 39 | Analytics | Contagem sem cookie; GA4 só com consentimento | Desenho: nosso; consentimento: lei |
| 40 | Outros | Sem sorteio de plano sem consulta | Lei exige (Lei 5.768/1971) |

Mais cautelosos que o necessário (segundo o levantamento): IP 6 meses, noindex em todos os Perfis, selo "Cheat" só com evidência; as travas da foto (#30–#34); no plano, o "para sempre" do veto a sorteio, os 100% mesmo usado e a compensação por queda.
