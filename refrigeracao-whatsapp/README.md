# Leonardo Moreira Refrigeração — WhatsApp Business + YCloud

## Estado
O número comercial +55 21 97033-8222 aparece como Connected no painel YCloud (confirmado por captura do titular em 04/11/2026).
O bot está preparado no Render, mas **respostas automáticas permanecem desativadas** até validação do webhook, dos segredos e dos custos. O código não altera o site Wix.

- Serviço: https://leonardo-refrigeracao-whatsapp.onrender.com
- Saúde: https://leonardo-refrigeracao-whatsapp.onrender.com/healthz
- Render: https://dashboard.render.com/web/srv-dblasi2jnfac73fej100
- Wix: https://headless-qqhigtkprnz-leoadminr2-140a.wix-site-host.com
- Coleção Wix (privada): OrdensRefrigeracao

## Integração YCloud
Webhook a registrar em YCloud > Developer > Webhooks > Add Endpoints:

https://leonardo-refrigeracao-whatsapp.onrender.com/webhook/ycloud

Selecionar eventos (e apenas estes):
- whatsapp.inbound_message.received — mensagens do cliente
- whatsapp.smb.message.echoes — mensagens enviadas pelo responsável no aplicativo WhatsApp Business, para pausa da automação

A YCloud utiliza assinatura:
YCloud-Signature: t=<unix>,s=<hex-hmac-sha256>
HMAC_SHA256( secret_da_YCloud, timestamp + "." + corpo_HTTP_original ).

**Não confundir com o webhook /webhook/whatsapp**, que recebe o formato nativo da Meta e não serve para YCloud.

Depois de criar o webhook, copiar o segredo de assinatura sem mostrá-lo em screenshots. Configurar no Render > Environment:

- YCLOUD_SENDER_NUMBER=+5521970338222 (já configurado)
- YCLOUD_WEBHOOK_SECRET=(segredo do endpoint YCloud)
- YCLOUD_API_KEY=(chave emitida em YCloud > Developer > API Keys)
- YCLOUD_AUTOREPLY_ENABLED=false (já configurado; somente passar para true após validação)
- DATABASE_URL=(banco Neon; já configurado)
- WIX_CLIENT_ID=(Wix Headless visitor auth; já configurado)

Enquanto o segredo estiver ausente, requisições POST em /webhook/ycloud retornam 503. Quando segredo e chave forem configurados, manter AUTOREPLY_ENABLED=false durante a inspeção inicial: evento válido é confirmado como pausado, sem processar dados de clientes nem emitir respostas. Só ativar após testes controlados e autorização do titular.

## Comportamento
1. Valida assinatura e timestamp, restringe o evento ao número da empresa.
2. Ignora eventos de grupo e outros números.
3. Salva eventos relevantes em Neon, com deduplicação por event_id.
4. Processa em fila persistente, cria contexto de conversa e aguarda confirmação explícita antes de registrar OS.
5. Insere OS na coleção Wix via token de visitante sem permitir leitura pública.
6. Envia respostas via YCloud API com X-API-Key enquanto a janela de conversa permite.
7. Quando há mensagem manual do responsável no aplicativo, evento whatsapp.smb.message.echoes bloqueia respostas pendentes do robô e transfere para humano. Cliente escreve MENU para reiniciar.

## Privacidade e custos
Não inserir tokens em URLs, GitHub, prints ou mensagens de chat. Credenciais devem ficar apenas no Render.
YCloud Free refere-se à mensalidade do provedor; mensagens fora das condições gratuitas, templates e outras operações podem gerar cobranças da Meta. Evite envios iniciados pela empresa até verificar a cobrança aplicável.
Render Free pode suspender após inatividade, provocando atrasos em webhooks; monitorar os registros de entrega em YCloud > Developer > Webhooks.

## Testes
cd refrigeracao-whatsapp && npm install && npm test
Os testes cobrem autenticação HMAC, filtro do número empresarial, transferência por mensagens manuais, valores somente mediante consulta, consentimento antes de gravar e cancelamento.

Documentação YCloud:
- https://docs.ycloud.com/en/documentation/developer/webhooks
- https://nndocs.ycloud.com/reference/webhook-events-payloads
- https://nndocs.ycloud.com/reference/whatsapp_message-send
