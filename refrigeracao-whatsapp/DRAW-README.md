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

## Integração (não habilitar antes das etapas)

1. Revisar/autorizar a migração em `draw-migration.sql` no Neon da refrigeração; a migração foi testada **somente em branch temporária**.
2. Inspecionar e importar números reservados e cadastros legados que ainda existam no Wix CMS para evitar conflito com a base histórica.
3. Adicionar ao `server.mjs` a rota `createDrawRoute` e configurar o env de serviço; antes disso garantir CAPTCHA.
4. Publicar `DRAW_REGISTRATION_API_ENABLED=false` por padrão.
5. Substituir o formulário no Wix para chamar **exclusivamente** o backend; remover escritas diretas do navegador no Wix CMS.
6. Testar gravação real, retry, concorrência, falha de banco e cancelamento sem vazamento de dados.
7. Obter regularização legal e regulamento; só então autorizar a abertura.

**Atenção:** um link de `wa.me` só preenche mensagem, não envia automaticamente notificação ao organizador. WhatsApp automático exige canal transacional configurado e regras da Meta/fornecedor.

A confirmação de dados pessoais deve ficar limitada ao titular e ao administrador; não publicar telefones nem listas de inscritos na página pública.
