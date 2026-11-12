# Sorteio de instalação — distribuição atômica (não ativada)

Implementação para a campanha de instalação profissional de Split Inverter 9.000 BTUs.

## Propriedades garantidas pelo servidor

- Uma solicitação aceita recebe **exatamente** a quantidade pedida; caso contrário, a transação faz ROLLBACK e **não registra nenhum número**.
- A linha da campanha é bloqueada com `SELECT ... FOR UPDATE`, serializando inscrições simultâneas.
- A chave primária composta `(campaign_id,number)` impede distribuição do mesmo número a dois cadastros.
- `(campaign_id,phone_e164)` evita múltiplos cadastros do mesmo número de WhatsApp.
- `(campaign_id,request_id)` torna o reenvio da mesma solicitação idempotente; retorna o comprovante já emitido.
- O sorteio aleatório usa `crypto.randomInt`, não o relógio nem `Math.random()`.
- A rota pública exige validação Turnstile e origem exata.
- A abertura está bloqueada duplamente: `DRAW_REGISTRATION_API_ENABLED` **precisa** ser `true` e `registration_open` precisa ser `true` na linha da campanha.

## Auditoria realizada em 11–12 de novembro de 2026

- **Banco Neon de produção:** migração aplicada à branch principal `br-rough-voice-b62bd1l8`; as três tabelas do sorteio estão criadas.
- **Campanha Neon:** `registration_open=false`; zero cadastros e zero números atribuídos na verificação.
- **Wix CMS legado:** foram verificados `NumerosInstalacaoTeste2026` e `CadastrosInstalacaoTeste2026`; ambos estavam com zero registros.
- **Página Wix pública:** seleção livre de quantidade, sem grade de números, dados pessoais desabilitados enquanto fechado; o formulário chama apenas a API transacional depois de liberado.
- **Painel próprio:** frontend `/painel/sorteio` e API `/painel/api/draw/overview` incluídos NESTE PR; exigem autenticação administrativa existente no Render e ainda não estão implantados em produção.
- **Produção Render:** continua com o serviço anterior. Este PR está em rascunho; não foi feito merge nem deploy.

## Pendências bloqueantes para abrir inscrições

1. Validar o provedor e o fluxo de **verificação da titularidade do WhatsApp**; captcha por si só não comprova que o número pertence ao participante, então há risco de inscrição indevida em nome de terceiros.
2. Configurar credenciais Turnstile no servidor e chave pública no Wix. Nunca colocar o segredo da verificação no frontend.
3. Fazer testes de integração no serviço real com inscrições desligadas, sem inserir participantes falsos na base principal. Usar ambiente/branch separado.
4. Revisar e integrar o PR, confirmar logs e funcionamento do painel administrativo protegido.
5. Planejar notificações automáticas ao organizador (ainda não implementadas), respeitando consentimento e exigências do WhatsApp Business.
6. Regulamento, autorização e critérios de apuração definidos; manter `DRAW_REGISTRATION_API_ENABLED=false` e `registration_open=false` até tudo estar pronto.

## Integração (não habilitar antes das etapas)

1. ✅ Migração aplicada ao Neon de produção, com inscrições fechadas.
2. ✅ Inspecionadas as coleções antigas do Wix: sem números reservados e sem cadastros legados.
3. ✅ Rota preparada no `server.mjs` deste PR (ainda não publicada no Render). Garantir CAPTCHA antes da publicação.
4. Publicar `DRAW_REGISTRATION_API_ENABLED=false` por padrão.
5. ✅ Formulário Wix já direcionado exclusivamente ao endpoint futuro; não realiza gravações diretas.
6. Testar gravação real, retry, concorrência, falha de banco e cancelamento sem vazamento de dados.
7. Obter regularização legal e regulamento; só então autorizar a abertura.

**Atenção:** um link de `wa.me` só preenche mensagem, não envia automaticamente notificação ao organizador. WhatsApp automático exige canal transacional configurado e regras da Meta/fornecedor.

A confirmação de dados pessoais deve ficar limitada ao titular e ao administrador; não publicar telefones nem listas de inscritos na página pública.
