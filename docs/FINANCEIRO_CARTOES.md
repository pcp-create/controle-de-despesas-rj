# Cartões na edição financeira

Na tela Financeiro / ERP, a edição de despesas com pagamento em cartão permite escolher cartões de qualquer titular, incluindo inativos (identificados na lista). Ao mudar o pagamento para outro meio, o vínculo com o cartão é removido ao salvar.

## Atualização do banco existente

Execute no SQL Editor do Supabase deste projeto somente o arquivo `supabase/migrations/20261019000100_financeiro_cartoes_select.sql` para habilitar a leitura de todos os cartões por usuários ativos com perfil `financeiro` ou `administrador`.

Essa política adicional concede apenas SELECT. Não altera as políticas existentes nem amplia a permissão de gravação de cartões. Não execute o schema inicial. A migração foi preparada e testada localmente, mas não aplicada ao banco remoto.

Os testes em `apps/mobile/tests/financeiro-cards.test.ts` verificam a leitura pelo financeiro, a restrição de funcionários aos próprios cartões, o bloqueio anônimo e a retirada desse acesso global ao desativar o perfil financeiro.
