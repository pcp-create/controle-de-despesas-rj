-- SOMENTE LEITURA. Executar o arquivo inteiro no SQL Editor do Supabase do painel.
-- Retorna UMA linha, coluna diagnostico: copie/exporte o JSON completo.
-- Nenhuma migração é aplicada. Não retorna registros de usuários ou segredos.
-- A referência completa pode conter colunas opcionais: revisar as diferenças.
WITH colunas_referencia AS (
WITH esperado(tabela, coluna) AS (VALUES
    ('profiles', 'id'),
    ('profiles', 'nome'),
    ('profiles', 'email'),
    ('profiles', 'usuario'),
    ('profiles', 'perfil'),
    ('profiles', 'ativo'),
    ('profiles', 'gestor_id'),
    ('profiles', 'primeiro_acesso'),
    ('profiles', 'created_at'),
    ('profiles', 'updated_at'),
    ('profiles', 'area'),
    ('profiles', 'empresa_id'),
    ('profiles', 'fornecedor_id'),
    ('profiles', 'condicao_pagamento_id'),
    ('profiles', 'operacao_financeira_id'),
    ('profiles', 'moeda_id'),
    ('profiles', 'centro_custo_id'),
    ('profiles', 'senha'),
    ('profiles', 'telefone'),
    ('profiles', 'frota_padrao_id'),
    ('profiles', 'pessoa_id'),
    ('profiles', 'chave_pix'),
    ('tipos_despesa', 'id'),
    ('tipos_despesa', 'nome'),
    ('tipos_despesa', 'descricao'),
    ('tipos_despesa', 'limite_maximo'),
    ('tipos_despesa', 'limite_ocorrencias_diarias'),
    ('tipos_despesa', 'calcula_diarias'),
    ('tipos_despesa', 'exige_comprovante'),
    ('tipos_despesa', 'documento_padrao'),
    ('tipos_despesa', 'centro_custo_erp_id'),
    ('tipos_despesa', 'ativo'),
    ('tipos_despesa', 'created_at'),
    ('tipos_despesa', 'updated_at'),
    ('tipos_despesa', 'codigo_produto_erp'),
    ('cartoes', 'id'),
    ('cartoes', 'user_id'),
    ('cartoes', 'banco'),
    ('cartoes', 'bandeira'),
    ('cartoes', 'ultimos_digitos'),
    ('cartoes', 'apelido'),
    ('cartoes', 'is_padrao'),
    ('cartoes', 'ativo'),
    ('cartoes', 'created_at'),
    ('cartoes', 'updated_at'),
    ('cartoes', 'empresa_id_m8'),
    ('despesas', 'id'),
    ('despesas', 'tecnico_id'),
    ('despesas', 'tipo_despesa_id'),
    ('despesas', 'cartao_id'),
    ('despesas', 'cliente'),
    ('despesas', 'numero_os'),
    ('despesas', 'valor'),
    ('despesas', 'documento'),
    ('despesas', 'observacao'),
    ('despesas', 'comprovante_nome'),
    ('despesas', 'comprovante_url'),
    ('despesas', 'data_despesa'),
    ('despesas', 'data_checkin'),
    ('despesas', 'data_checkout'),
    ('despesas', 'numero_diarias'),
    ('despesas', 'status_aprovacao'),
    ('despesas', 'status_erp'),
    ('despesas', 'gestor_aprovador_id'),
    ('despesas', 'justificativa_reprovacao'),
    ('despesas', 'data_envio'),
    ('despesas', 'data_aprovacao'),
    ('despesas', 'erp_id'),
    ('despesas', 'erp_payload'),
    ('despesas', 'erp_resposta'),
    ('despesas', 'created_at'),
    ('despesas', 'updated_at'),
    ('despesas', 'frota_id'),
    ('despesas', 'km_atual'),
    ('despesas', 'parcelado'),
    ('despesas', 'numero_parcelas'),
    ('despesas', 'parcela_atual'),
    ('despesas', 'grupo_parcela_id'),
    ('despesas', 'data_vencimento'),
    ('despesas', 'pagamento_tipo'),
    ('despesas', 'reembolso_processado'),
    ('despesas', 'reembolso_processado_em'),
    ('despesas', 'reembolso_processado_por'),
    ('despesas', 'aprovado_financeiro'),
    ('despesas', 'aprovado_financeiro_em'),
    ('despesas', 'aprovado_financeiro_por'),
    ('despesas', 'lancado_erp'),
    ('despesas', 'lancado_erp_em'),
    ('despesas', 'lancado_erp_por'),
    ('despesas', 'lancado_sistema'),
    ('despesas', 'lancado_sistema_em'),
    ('despesas', 'lancado_sistema_por'),
    ('despesas', 'erp_status'),
    ('despesas', 'erp_etapa_erro'),
    ('despesas', 'erp_erro'),
    ('despesas', 'numero_documento_erp'),
    ('despesas', 'litros_abastecidos'),
    ('despesas', 'valor_litro'),
    ('despesas', 'tipo_combustivel'),
    ('despesas', 'observacao_financeiro'),
    ('despesas', 'anexo_financeiro_url'),
    ('despesas', 'anexo_financeiro_nome'),
    ('despesas', 'lancamento_cancelado'),
    ('despesas', 'lancamento_cancelado_em'),
    ('despesas', 'lancamento_cancelado_por'),
    ('despesas', 'lancamento_cancelado_motivo'),
    ('despesas', 'hora_despesa'),
    ('despesas', 'comprovante_arquivado_em'),
    ('despesas', 'comprovante_backup_id'),
    ('frotas', 'id'),
    ('frotas', 'placa'),
    ('frotas', 'modelo'),
    ('frotas', 'marca'),
    ('frotas', 'ano'),
    ('frotas', 'cor'),
    ('frotas', 'tipo'),
    ('frotas', 'quilometragem'),
    ('frotas', 'observacao'),
    ('frotas', 'ativo'),
    ('frotas', 'created_at'),
    ('frotas', 'updated_at'),
    ('frotas', 'km_atualizado_em'),
    ('frotas', 'km_media_litro'),
    ('frotas', 'alerta_ativo'),
    ('frotas', 'ultimo_calculo_em'),
    ('frotas', 'ultimo_calculo_km_apontado'),
    ('frotas', 'ultimo_calculo_km_esperado'),
    ('frotas', 'ultimo_calculo_percentual'),
    ('frotas', 'saldo_inicial_combustivel_litros'),
    ('controle_km', 'id'),
    ('controle_km', 'frota_id'),
    ('controle_km', 'usuario_id'),
    ('controle_km', 'km_inicial'),
    ('controle_km', 'km_final'),
    ('controle_km', 'data_inicio'),
    ('controle_km', 'data_fim'),
    ('controle_km', 'destino'),
    ('controle_km', 'motivo'),
    ('controle_km', 'observacao'),
    ('controle_km', 'status'),
    ('controle_km', 'created_at'),
    ('controle_km', 'updated_at'),
    ('controle_km', 'km_percorrido'),
    ('controle_km', 'duracao_minutos'),
    ('controle_km', 'ocorrencia'),
    ('auditoria', 'id'),
    ('auditoria', 'user_id'),
    ('auditoria', 'acao'),
    ('auditoria', 'entidade'),
    ('auditoria', 'entidade_id'),
    ('auditoria', 'detalhes'),
    ('auditoria', 'created_at'),
    ('alertas_consumo', 'id'),
    ('alertas_consumo', 'frota_id'),
    ('alertas_consumo', 'placa'),
    ('alertas_consumo', 'modelo'),
    ('alertas_consumo', 'data'),
    ('alertas_consumo', 'litros'),
    ('alertas_consumo', 'km_apontado'),
    ('alertas_consumo', 'km_esperado'),
    ('alertas_consumo', 'percentual'),
    ('alertas_consumo', 'valor'),
    ('alertas_consumo', 'ativo'),
    ('alertas_consumo', 'resolvido_em'),
    ('alertas_consumo', 'resolvido_por'),
    ('alertas_consumo', 'created_at'),
    ('alertas_consumo', 'updated_at'),
    ('alertas_consumo', 'justificativa')
)
SELECT e.tabela, e.coluna,
       CASE WHEN c.column_name IS NULL THEN 'AUSENTE' ELSE 'PRESENTE' END AS resultado,
       c.data_type, c.udt_name, c.is_nullable, c.column_default
FROM esperado e LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public' AND c.table_name = e.tabela AND c.column_name = e.coluna
ORDER BY e.tabela, e.coluna
),

colunas_reais AS (
SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
       is_generated, generation_expression
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles','tipos_despesa','cartoes','despesas','frotas','controle_km','auditoria','alertas_consumo')
ORDER BY table_name, ordinal_position
),

constraints AS (
SELECT c.relname AS tabela, k.conname, pg_get_constraintdef(k.oid) AS definicao
FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles','tipos_despesa','cartoes','despesas','frotas','controle_km','auditoria','alertas_consumo')
),

politicas AS (
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname IN ('public','storage')
),

rls AS (
SELECT n.nspname AS schema, c.relname AS tabela, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public','storage') AND c.relkind = 'r'
),

triggers AS (
SELECT event_object_table, trigger_name, action_timing, event_manipulation, action_statement
FROM information_schema.triggers WHERE trigger_schema = 'public'
),

permissoes AS (
SELECT grantee, table_schema, table_name, privilege_type FROM information_schema.role_table_grants
WHERE table_schema IN ('public','storage') AND grantee IN ('anon','authenticated')
),

buckets AS (
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets WHERE id = 'comprovantes'
)

SELECT jsonb_build_object(
  'colunas_referencia', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM colunas_referencia r),
  'colunas_reais', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM colunas_reais r),
  'constraints', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM constraints r),
  'politicas', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM politicas r),
  'rls', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM rls r),
  'triggers', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM triggers r),
  'permissoes', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM permissoes r),
  'buckets', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM buckets r)
) AS diagnostico;
