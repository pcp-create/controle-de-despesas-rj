# Correção dos 144 envios de novembro/2026

O painel Financeiro oferece **Correção dos vencimentos enviados em novembro/2026**, exclusivamente para Administrador e Financeiro ativos. O botão **Corrigir os 144 documentos** executa a conferência e a atualização sequencial usando as credenciais M8 do servidor. Manter a tela aberta até terminar; baixar o relatório com os resultados. Reexecutar é seguro: parcelas já corretas não recebem outro PATCH.

## Seleção e correspondência

- Data de integração concluída (`lancado_erp_em`) de 01/11/2026 00:00 até 01/12/2026 00:00, horário de Brasília. Não usa data da despesa, vencimento ou envio para aprovação.
- `lancado_erp = true` e `erp_status = integrado`.
- O lote deve conter exatamente 144 documentos, sem duplicidade de nota ou número por empresa. Caso contrário, interrompe sem alterar registros.
- Conferência da nota por ERP ID, empresa, pessoa, número e valor; título por empresa, documento exato, série, pessoa/fornecedor e valor. Exige uma correspondência única e uma parcela por nota (formato usado pela integração).
- Parcelas já corretas são ignoradas. Cancelamentos, renegociações, baixas, borderôs, divergências e alterações manuais posteriores ficam para revisão.

## Alteração

Envia somente `vencimento`, usando `despesas.data_vencimento`, ao endpoint documentado:

`PATCH /v1/financeiro/contapagar/{tituloId}/parcela/{id}`

Fonte: https://api.integra.m8sistemas.com.br/docs/index.html#operation/ErpM8FinanceiroContaPagarParcelaPatch

Isso corrige **Contas a Pagar**. A API não documenta edição da parcela da Nota Fiscal de Compra nem sincronização dessa data de volta à nota. Não recria/processa notas, não muda valores, entrada, emissão ou previsão de pagamento. Preserva o payload histórico original da integração.

Antes de aplicar, o servidor revalida os dados e exige a conferência assinada, vinculada ao usuário, à despesa e com validade de 30 minutos. Registra tentativa, confirmação e erros em `auditoria`. Após cada PATCH, consulta novamente o vencimento no M8. Falha de rede após a escrita pode deixar resultado incerto; reexecutar consulta o estado real antes de escrever novamente.

## Execução local alternativa

Necessita das variáveis M8_API_URL, M8_TENANT, M8_USERNAME, M8_PASSWORD, M8_DOMAIN, NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY configuradas em arquivo ignorado pelo Git. Nunca colocar segredos no relatório ou no repositório.

```sh
node --env-file=.env.local scripts/erp/corrigir-vencimentos.mjs conferir /tmp/rj-vencimentos
node --env-file=.env.local scripts/erp/corrigir-vencimentos.mjs aplicar /tmp/rj-vencimentos
```

A execução local grava `conferencia.json`, `resultado.json` e `auditoria.jsonl` no diretório informado, sem credenciais. A execução pelo painel grava a auditoria no Supabase.

## Validação

`node --test scripts/tests/erp-due-repair.test.mjs`

Testes usam um M8 simulado; não representam alterações ou validação dos 144 documentos reais.
