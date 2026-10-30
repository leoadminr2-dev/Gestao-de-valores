# ROMEU WhatsApp — deploy isolado sem custo pago

Branch dedicada: romeu-whatsapp-render. O aplicativo Gestão de Valores continua na branch main, que não deve ser alterada.

## Segurança
- OUTBOUND_ENABLED=false inicialmente; nenhuma resposta real será enviada até terminar configuração Meta.
- GET /health expõe somente estado da configuração; não expõe segredos.
- POST /webhook exige assinatura HMAC SHA-256 da Meta e lista de telefones autorizados.
- PostgreSQL no projeto Neon exclusivo romeu-assistente. Suprime duplicações e reserva até 800 respostas por mês.
- Não envia templates, mensagens proativas ou publicidade. Não inclui inteligência artificial generativa.
- Cofres offline do ROMEU Web e Android não sincronizam automaticamente com os registros do WhatsApp.
- Render Free pode hibernar e não garante recebimento instantâneo de eventos.

## Render Free
Runtime Node >=20
Branch: romeu-whatsapp-render
Build: cd romeu-whatsapp && npm install --omit=dev && npm test
Start: node romeu-whatsapp/app.mjs
Plan: free

Variáveis a configurar somente no painel do Render:
DATABASE_URL, META_VERIFY_TOKEN, META_APP_SECRET, META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, AUTHORIZED_NUMBERS, OUTBOUND_ENABLED, MAX_MONTHLY_REPLIES=800.
Não registrar tokens no GitHub, no chat ou em screenshots.

## Meta
Usar WhatsApp Cloud API oficial. Callback: https://SERVICO.onrender.com/webhook, challenge com META_VERIFY_TOKEN e assinatura de mensagens (campo messages).
O titular deve verificar um número exclusivo ou usar inicialmente o número de teste Meta.
OUTBOUND_ENABLED=true somente após validar a configuração, autorizar os números e revisar o faturamento.

## Testes locais
cd romeu-whatsapp && npm install && npm test
