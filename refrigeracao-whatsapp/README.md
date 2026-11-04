# Leonardo Moreira Refrigeração — WhatsApp (API oficial)

Este módulo fica isolado na branch refrigeracao-whatsapp-api.
Site de atendimento: https://headless-qqhigtkprnz-leoadminr2-140a.wix-site-host.com/
Serviço Render: https://leonardo-refrigeracao-whatsapp.onrender.com
Painel de infraestrutura: https://dashboard.render.com/web/srv-dblasi2jnfac73fej100

## Situação atual
O código e as tabelas foram implantados. A integração com a Meta permanece DESATIVADA até que o titular conclua o cadastro oficial e configure as credenciais protegidas no Render. O WhatsApp existente e o site Wix continuam inalterados.

## Recursos implementados
- Endpoint GET /healthz para leitura do estado de conexão (não retorna segredos).
- Webhook GET /webhook/whatsapp para validação do desafio da Meta.
- Webhook POST /webhook/whatsapp, que exige assinatura HMAC-SHA256 válida sobre o corpo bruto.
- Mensagens duplicadas não geram pedidos duplicados; estado de conversa e filas persistem no Neon.
- Conversa guiada: selecionar serviço, nome, bairro, equipamento, período, revisar e confirmar consentimento.
- Os preços estimados aparecem apenas mediante consulta do cliente.
- A opção 5 transfere para o atendimento humano; MENU reativa o bot.
- Somente pedidos confirmados pelo cliente são enviados à coleção privada OrdensRefrigeracao no Wix.
- A preferência de agendamento nunca é tratada como horário confirmado.

## Credenciais necessárias no Render > Environment
- WHATSAPP_VERIFY_TOKEN: valor gerado e já armazenado no Render. Copiar exatamente para o cadastro de webhook da Meta.
- WHATSAPP_APP_SECRET: segredo da aplicação Meta (NÃO compartilhar por chat).
- WHATSAPP_ACCESS_TOKEN: token de produção com acesso à conta oficial.
- WHATSAPP_PHONE_NUMBER_ID: identificador da linha vinculada na Cloud API.
- GRAPH_API_VERSION: v26.0
- DATABASE_URL: já configurado, valor secreto.
- WIX_CLIENT_ID: já configurado, valor público.

Callback para cadastrar na Meta:
https://leonardo-refrigeracao-whatsapp.onrender.com/webhook/whatsapp

Assinar o tópico messages do WhatsApp Business Platform no painel do provedor/API.

## Manter o número atual
Para usar o MESMO número no aplicativo WhatsApp Business e na API, é necessário que o WhatsApp Business existente seja elegível e vinculado via um fornecedor que dê suporte à coexistência oficial e disponibilize acesso à API. Não desinstalar o app nem migrar o número para o Wix Inbox sem autorização expressa.

## Testes locais
Na pasta refrigeracao-whatsapp:
npm install
npm test
npm start

O Render executa automaticamente os testes durante a implantação. Sem as credenciais Meta, o estado do servidor é awaiting_meta_onboarding e nenhuma mensagem automática é enviada.

## Limites e cuidados
O Render Free pode suspender após inatividade, causando atraso para reativar o webhook. Neon tem cotas gratuitas de armazenamento e processamento. Serviços da Meta ou de fornecedores podem cobrar por templates e mensagens, conforme modalidade contratada. Não existe integração de mensagens de entrada validada em produção até o onboarding.

Dados de clientes permanecem privados no Neon/Wix. O servidor não registra conteúdo de conversas em logs de aplicação. Não adicionar segredos ao GitHub.
