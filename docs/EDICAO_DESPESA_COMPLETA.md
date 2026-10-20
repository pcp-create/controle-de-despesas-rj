# Edição interna da despesa completa

A tela Todas as Despesas usa o mesmo formulário de edição de Nova Despesa. Administradores e Financeiro ativos podem abrir o grupo, alterar o valor total e salvar todos os registros em uma transação. A aprovação, o vínculo com o ERP, o titular e os vencimentos existentes são preservados. A quantidade pode ser alterada: novas parcelas são criadas e as excedentes removidas na mesma transação. Alterar a quantidade de um grupo já lançado, integrado, aprovado pelo financeiro, reembolsado ou cancelado exige estorno prévio. A última parcela absorve os centavos restantes. Dados já enviados ao ERP não são atualizados automaticamente no sistema externo.

## Publicação

1. No SQL Editor do Supabase deste projeto, executar somente `supabase/migrations/20261020000200_redimensionar_parcelas.sql`.
2. Publicar o código após a aplicação desse SQL. A função exige perfil ativo Administrador/Financeiro no banco antes de qualquer operação. Usa SECURITY DEFINER para permitir criação e remoção de parcelas pelo Financeiro, sem ampliar permissões diretas das tabelas. A nova migração substitui a função anterior; pode ser executada mesmo que a anterior já tenha sido aplicada.

Não executar o schema inicial. A migração acima foi testada localmente, mas não aplicada ao banco remoto. Se a função estiver ausente, a API informa a pendência e não grava parcialmente o grupo.

Testes: `apps/mobile/tests/expense-group-edit.test.ts` verifica o arredondamento, preservação de datas/aprovação, autorização e rollback de todas as parcelas diante de falha em uma delas.
