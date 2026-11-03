# Central do Associado — Caixinha 2027

Nova área do associado **isolada do exercício de 2026**. Não altera a base, os empréstimos, as regras de 2026 nem a página Wix já publicada do evento de final de ano.

## O que foi desenvolvido

- Cadastro com nome completo, CPF, telefone, endereço e senha. CPF validado e persistido apenas como HMAC secreto + últimos quatro dígitos. Senha com scrypt e salt único.
- Cadastro aguarda aprovação de um dos responsáveis que já fazem login no Gestão de Valores (dois e-mails autorizados).
- Sessão individual em cookie HttpOnly/Secure/SameSite e acesso segregado por associado.
- Envio de comprovante JPG, PNG ou PDF até 1 MB, com compressão automática de fotos grandes no navegador, data de 2027, valor e múltiplas finalidades cujo total deve fechar.
- Aprovação ou rejeição administrativa com observação; aprovação em transação cria as linhas financeiras uma só vez; rejeição não lança valores. O associado pode corrigir informações de comprovantes rejeitados, preservando o arquivo original para nova conferência.
- Histórico individual dos comprovantes, extrato de lançamentos aprovados por finalidade, dados cadastrais e eventos.
- Criação de eventos pela administração e seleção de números de 001 até o limite configurado (até 500). Índice único no banco impede dupla reserva concorrente.
- Painel administrativo relaciona nome, CPF parcial, telefone/endereço, comprovantes e números escolhidos por pessoa.
- Atalho para a **plataforma de eventos 2026 no Wix**. O evento de 2026 continua independente e não é importado ou alterado.

## Rotas previstas

- Associado: \`/caixinha-2027\`
- Administração: \`/caixinha-2027/admin\`
- Saúde da API: \`/api/2027/ready\`

## Instalação antes de ativar em produção

1. Executar \`caixinha-2027/schema.sql\` em **banco privado autorizado**, após backup e revisão. O arquivo só cria tabelas do esquema privado \`cx27\` e não migra registros antigos. Ideal: ambiente Neon isolado/homologação.
2. Configurar no servidor **sem commitar segredos**:
   - \`PORTAL_DATABASE_URL\`: URL segura do Postgres (existente ou banco 2027 isolado).
   - \`ASSOCIATE27_PEPPER\`: segredo aleatório exclusivo com **pelo menos 32 caracteres**, armazenado em variável protegida. Não trocar sem plano de rotação: usado para identificação por CPF e derivação de senhas.
   - Continuar com \`NEON_AUTH_URL\`, \`NEON_DATA_API_URL\` e \`ALLOWED_EMAILS\` do painel privado para autenticar os responsáveis. Nunca copiar segredos ao repositório.
3. Executar \`npm test\` e \`npm run build\` no ramo de desenvolvimento.
4. Subir em **ambiente separado** de produção ou publicar apenas após a migração aprovada, teste de cadastro, login, aprovação, envio de comprovante, conferência bancária e concorrência de números.
5. Cadastrar os eventos de **2027** no painel. Valores de mensalidade, juros, cotas e regulamento não são predefinidos: devem ser aprovados para o novo exercício.

## Proteções e pendências para lançamento definitivo

- CPF nunca é exibido por inteiro, nem devolvido pelo endpoint público; dados pessoais apenas em área autenticada. Os dados ficam em esquema PostgreSQL privado, sem concessões de acesso público, no banco privado (nunca HTML, repositório ou planilha pública).
- O cadastro **não** verifica automaticamente a posse do telefone. É obrigação do administrador confirmar identidade antes de aprovar. Recomendável evoluir para verificação independente e recuperação segura de senha.
- O envio do comprovante **não** prova entrada no banco; o responsável deve conferir no extrato antes de clicar em Aprovar. Um depósito dividido entre finalidades deve ser conciliado.
- Os valores aprovados representam **depósitos conferidos**, não lucro, saldo líquido nem disponibilidade para saque. Empréstimos, juros e distribuição final continuam na contabilidade dos responsáveis.
- Nenhuma cobrança, transferência, Pix ou sorteio é executado por este código.
- Caso um evento de 2027 exija sorteio, publicação e regras devem ser conferidas quanto à legislação aplicável antes da abertura.
- A integração dos registros existentes na página Wix 2026 não é automática: manter o site atual intacto. Eventos **novos** em 2027 já usam cadastro e números comuns à área do associado.
- **Não publicar no domínio atual sem verificação de ambiente, banco, migrations, testes e autorização de segurança.** O branch não é um deploy.
