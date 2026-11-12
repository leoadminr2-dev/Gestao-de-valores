# Sorteio de instalação — distribuição atômica (não ativada)

Implementação para a campanha de instalação profissional de Split Inverter 9.000 BTUs.

## Propriedades garantidas pelo servidor

- Uma solicitação aceita recebe **exatamente a quantidade solicitada** de números, até a capacidade disponível, ou nenhum em caso de erro (ROLLBACK). A requisição não gera reserva parcial.
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
- **Página Wix pública:** seleção livre de quantidade com atalhos de 5, 10 e 15, permitindo também informar 1, 2 ou outra quantidade disponível; não há escolha manual dos números da sorte. Os dados pessoais continuam desabilitados enquanto fechado.
- **Painel próprio:** frontend `/painel/sorteio` e API `/painel/api/draw/overview` incluídos NESTE PR; exigem autenticação administrativa existente no Render e ainda não estão implantados em produção.
- **Produção Render:** continua com o serviço anterior. Este PR está em rascunho; não foi feito merge nem deploy.


## Indicador percentual e planejamento de datas — 12/11/2026

- A página pública Wix possui um quadro **Números disponíveis** com percentual (sem mostrar total absoluto) e quadro **Cronograma proposto**.
- O percentual é mantido **indisponível enquanto as inscrições estiverem fechadas**, para não criar escassez fictícia. Nenhuma data fictícia é anunciada como confirmada.
- A futura API \`GET /api/draw/progress\` foi adicionada ao \`draw-route.mjs\` deste PR: retorna somente \`{open,remainingPercent}\`, sem número total, nome, telefone ou contagens absolutas.
- O cálculo é \`round(1000 * (total - distribuídos) / total)/10\`; utiliza os registros reais da tabela \`refrigeracao_draw_allocations\`.
- Testes simulados de \`68%\`, \`0%\`, campanha fechada e origem rejeitada passaram. **Endpoint ainda não implantado no Render.**
- **Planejamento interno sujeito à autorização:** início provisório 15/01/2027; encerramento 28/02/2027; apuração 05/03/2027; instalação até 04/04/2027. Nenhuma data foi publicada como compromisso oficial.
- **Pendência jurídica essencial:** a SPA/MF esclarece que a venda de números por empresas caracteriza rifa não autorizada; promoções comerciais autorizadas são gratuitas para o participante. A lista de prêmios permitidos não enumera instalação de serviços isolados. Antes de seguir, confirmar formalmente o enquadramento do prêmio com o órgão competente e elaborar uma mecânica regular.
- **Valores informados apenas para orçamento interno:** mão de obra R$ 1.600; materiais R$ 400; deslocamento R$ 100; despesas diversas R$ 100; custos R$ 2.200; lucro adicional desejado R$ 1.200; alvo R$ 3.400, sem incluir tributos/taxas. Não usar esse orçamento como estrutura de venda de números.

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

## Revisão de experiência (12/11/2026)

- **Preferência do organizador confirmada:** restaurada a escolha livre de quantidade. Atalhos de **5, 10 ou 15** e campo de número inteiro personalizado. O backend permite de 1 a 500, verifica disponibilidade e atribui a quantidade integral em uma única transação; não permite quantidade parcial.
- Continua necessária verificação efetiva da titularidade do telefone: unicidade por telefone não prova que se trata de uma pessoa distinta.
- Barra de percentual ampliada, avisos repetidos reduzidos e acesso do organizador redirecionado à Central de Operações existente. O módulo de sorteio no Render continua em PR não implantada; inscrições fechadas.
- Página pública sem informações de valores, inclusive sem exibição de preço, Pix ou menção a participação gratuita.
