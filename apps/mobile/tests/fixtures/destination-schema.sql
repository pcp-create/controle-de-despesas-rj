-- Test fixture reconstructed from the user-provided destination metadata. Never deploy.
CREATE TABLE public.backup_comprovantes (id uuid primary key); -- external FK target only
CREATE TABLE public."alertas_consumo" (
"id" text NOT NULL,
"frota_id" uuid NOT NULL,
"placa" text NOT NULL,
"modelo" text NOT NULL,
"data" timestamp with time zone NOT NULL,
"litros" numeric NOT NULL,
"km_apontado" numeric DEFAULT 0 NOT NULL,
"km_esperado" numeric NOT NULL,
"percentual" numeric NOT NULL,
"valor" numeric NOT NULL,
"ativo" boolean DEFAULT true NOT NULL,
"resolvido_em" timestamp with time zone,
"resolvido_por" uuid,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"justificativa" text
);
CREATE TABLE public."auditoria" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"acao" text NOT NULL,
"entidade" text,
"entidade_id" text,
"detalhes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public."cartoes" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"user_id" uuid NOT NULL,
"banco" text NOT NULL,
"bandeira" text NOT NULL,
"ultimos_digitos" text NOT NULL,
"apelido" text,
"is_padrao" boolean DEFAULT false NOT NULL,
"ativo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"empresa_id_m8" integer
);
CREATE TABLE public."controle_km" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"frota_id" uuid NOT NULL,
"usuario_id" uuid NOT NULL,
"km_inicial" numeric NOT NULL,
"km_final" numeric,
"data_inicio" timestamp with time zone DEFAULT now() NOT NULL,
"data_fim" timestamp with time zone,
"destino" text,
"motivo" text,
"observacao" text,
"status" text DEFAULT 'aberto'::text NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"km_percorrido" integer,
"duracao_minutos" integer,
"ocorrencia" text
);
CREATE TABLE public."despesas" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"tecnico_id" uuid NOT NULL,
"tipo_despesa_id" uuid NOT NULL,
"cartao_id" uuid,
"cliente" text NOT NULL,
"numero_os" text NOT NULL,
"valor" numeric NOT NULL,
"documento" text,
"observacao" text,
"comprovante_nome" text,
"comprovante_url" text,
"data_despesa" date NOT NULL,
"data_checkin" timestamp with time zone,
"data_checkout" timestamp with time zone,
"numero_diarias" integer,
"status_aprovacao" text DEFAULT 'AguardandoGestor'::text NOT NULL,
"status_erp" text DEFAULT 'Rascunho'::text NOT NULL,
"gestor_aprovador_id" uuid,
"justificativa_reprovacao" text,
"data_envio" timestamp with time zone,
"data_aprovacao" timestamp with time zone,
"erp_id" text,
"erp_payload" jsonb,
"erp_resposta" jsonb,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"frota_id" uuid,
"km_atual" numeric,
"parcelado" boolean DEFAULT false NOT NULL,
"numero_parcelas" integer DEFAULT 1 NOT NULL,
"parcela_atual" integer DEFAULT 1 NOT NULL,
"grupo_parcela_id" uuid,
"data_vencimento" date,
"pagamento_tipo" text DEFAULT 'cartao'::text NOT NULL,
"reembolso_processado" boolean DEFAULT false NOT NULL,
"reembolso_processado_em" timestamp with time zone,
"reembolso_processado_por" text,
"aprovado_financeiro" boolean DEFAULT false NOT NULL,
"aprovado_financeiro_em" timestamp with time zone,
"aprovado_financeiro_por" text,
"lancado_erp" boolean DEFAULT false NOT NULL,
"lancado_erp_em" timestamp with time zone,
"lancado_erp_por" text,
"lancado_sistema" boolean DEFAULT false NOT NULL,
"lancado_sistema_em" timestamp with time zone,
"lancado_sistema_por" text,
"erp_status" text DEFAULT 'pendente'::text NOT NULL,
"erp_etapa_erro" integer,
"erp_erro" text,
"numero_documento_erp" bigint,
"litros_abastecidos" numeric,
"valor_litro" numeric,
"tipo_combustivel" text,
"observacao_financeiro" text,
"anexo_financeiro_url" text,
"anexo_financeiro_nome" text,
"lancamento_cancelado" boolean DEFAULT false NOT NULL,
"lancamento_cancelado_em" timestamp with time zone,
"lancamento_cancelado_por" uuid,
"lancamento_cancelado_motivo" text,
"hora_despesa" text,
"comprovante_arquivado_em" timestamp with time zone,
"comprovante_backup_id" uuid
);
CREATE TABLE public."frotas" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"placa" text NOT NULL,
"modelo" text NOT NULL,
"marca" text NOT NULL,
"ano" integer,
"cor" text,
"tipo" text,
"quilometragem" numeric DEFAULT 0 NOT NULL,
"observacao" text,
"ativo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"km_atualizado_em" timestamp with time zone,
"km_media_litro" numeric,
"alerta_ativo" boolean DEFAULT false NOT NULL,
"ultimo_calculo_em" timestamp with time zone,
"ultimo_calculo_km_apontado" numeric,
"ultimo_calculo_km_esperado" numeric,
"ultimo_calculo_percentual" numeric,
"saldo_inicial_combustivel_litros" numeric DEFAULT 0 NOT NULL
);
CREATE TABLE public."profiles" (
"id" uuid NOT NULL,
"nome" text NOT NULL,
"email" text NOT NULL,
"usuario" text NOT NULL,
"perfil" text NOT NULL,
"ativo" boolean DEFAULT true NOT NULL,
"gestor_id" uuid,
"primeiro_acesso" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"area" text,
"empresa_id" text,
"fornecedor_id" text,
"condicao_pagamento_id" text,
"operacao_financeira_id" text,
"moeda_id" text,
"centro_custo_id" text,
"senha" text,
"telefone" text,
"frota_padrao_id" uuid,
"pessoa_id" integer,
"chave_pix" text
);
CREATE TABLE public."tipos_despesa" (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"nome" text NOT NULL,
"descricao" text,
"limite_maximo" numeric,
"limite_ocorrencias_diarias" integer,
"calcula_diarias" boolean DEFAULT false NOT NULL,
"exige_comprovante" boolean DEFAULT false NOT NULL,
"documento_padrao" text,
"centro_custo_erp_id" text,
"ativo" boolean DEFAULT true NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"codigo_produto_erp" text
);
ALTER TABLE public."alertas_consumo" ADD CONSTRAINT "alertas_consumo_pkey" PRIMARY KEY (id);
ALTER TABLE public."auditoria" ADD CONSTRAINT "auditoria_pkey" PRIMARY KEY (id);
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_pkey" PRIMARY KEY (id);
ALTER TABLE public."controle_km" ADD CONSTRAINT "controle_km_pkey" PRIMARY KEY (id);
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_pkey" PRIMARY KEY (id);
ALTER TABLE public."frotas" ADD CONSTRAINT "frotas_pkey" PRIMARY KEY (id);
ALTER TABLE public."frotas" ADD CONSTRAINT "frotas_placa_key" UNIQUE (placa);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_usuario_key" UNIQUE (usuario);
ALTER TABLE public."tipos_despesa" ADD CONSTRAINT "tipos_despesa_pkey" PRIMARY KEY (id);
ALTER TABLE public."alertas_consumo" ADD CONSTRAINT "alertas_consumo_frota_id_fkey" FOREIGN KEY (frota_id) REFERENCES frotas(id) ON DELETE CASCADE;
ALTER TABLE public."alertas_consumo" ADD CONSTRAINT "alertas_consumo_resolvido_por_fkey" FOREIGN KEY (resolvido_por) REFERENCES profiles(id);
ALTER TABLE public."auditoria" ADD CONSTRAINT "auditoria_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public."cartoes" ADD CONSTRAINT "cartoes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."controle_km" ADD CONSTRAINT "controle_km_frota_id_fkey" FOREIGN KEY (frota_id) REFERENCES frotas(id) ON DELETE CASCADE;
ALTER TABLE public."controle_km" ADD CONSTRAINT "controle_km_status_check" CHECK ((status = ANY (ARRAY['aberto'::text, 'finalizado'::text])));
ALTER TABLE public."controle_km" ADD CONSTRAINT "controle_km_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_cartao_id_fkey" FOREIGN KEY (cartao_id) REFERENCES cartoes(id) ON DELETE SET NULL;
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_comprovante_backup_id_fkey" FOREIGN KEY (comprovante_backup_id) REFERENCES backup_comprovantes(id);
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_frota_id_fkey" FOREIGN KEY (frota_id) REFERENCES frotas(id) ON DELETE SET NULL;
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_gestor_aprovador_id_fkey" FOREIGN KEY (gestor_aprovador_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_lancamento_cancelado_por_fkey" FOREIGN KEY (lancamento_cancelado_por) REFERENCES profiles(id);
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_pagamento_tipo_check" CHECK ((pagamento_tipo = ANY (ARRAY['cartao'::text, 'dinheiro'::text, 'faturado'::text, 'boleto'::text])));
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_status_aprovacao_check" CHECK ((status_aprovacao = ANY (ARRAY['AguardandoGestor'::text, 'AprovadoGestor'::text, 'Reprovado'::text])));
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_status_erp_check" CHECK ((status_erp = ANY (ARRAY['Rascunho'::text, 'EnviadoAguardandoGestor'::text, 'AprovadoGestorERPAtualizado'::text, 'ErroEnvioERP'::text, 'ErroAtualizarERP'::text])));
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_tecnico_id_fkey" FOREIGN KEY (tecnico_id) REFERENCES profiles(id) ON DELETE RESTRICT;
ALTER TABLE public."despesas" ADD CONSTRAINT "despesas_tipo_despesa_id_fkey" FOREIGN KEY (tipo_despesa_id) REFERENCES tipos_despesa(id) ON DELETE RESTRICT;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_frota_padrao_id_fkey" FOREIGN KEY (frota_padrao_id) REFERENCES frotas(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_gestor_id_fkey" FOREIGN KEY (gestor_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_perfil_check" CHECK ((perfil = ANY (ARRAY['funcionario'::text, 'gestor'::text, 'financeiro'::text, 'administrador'::text])));
ALTER TABLE "public"."tipos_despesa" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cartoes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."alertas_consumo" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "storage"."objects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."frotas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."despesas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."controle_km" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuário gerencia próprios cartões" ON "public"."cartoes" AS PERMISSIVE FOR ALL TO "public" USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Admin gerencia todos os cartões" ON "public"."cartoes" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text)))));
CREATE POLICY "Gestor vê cartões do time" ON "public"."cartoes" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = cartoes.user_id) AND (p.gestor_id = auth.uid())))));
CREATE POLICY "Lookup público de email por usuario" ON "public"."profiles" AS PERMISSIVE FOR SELECT TO "public" USING (true);
CREATE POLICY "Admin insere perfis" ON "public"."profiles" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.perfil = 'administrador'::text)))));
CREATE POLICY "Admin atualiza perfis" ON "public"."profiles" AS PERMISSIVE FOR UPDATE TO "public" USING (((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.perfil = 'administrador'::text)))) OR (auth.uid() = id))) WITH CHECK (((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.perfil = 'administrador'::text)))) OR (auth.uid() = id)));
CREATE POLICY "Admin deleta perfis" ON "public"."profiles" AS PERMISSIVE FOR DELETE TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles profiles_1
  WHERE ((profiles_1.id = auth.uid()) AND (profiles_1.perfil = 'administrador'::text)))));
CREATE POLICY "Técnico lê próprias despesas" ON "public"."despesas" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = tecnico_id));
CREATE POLICY "Técnico insere próprias despesas" ON "public"."despesas" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = tecnico_id));
CREATE POLICY "Técnico atualiza próprias despesas" ON "public"."despesas" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = tecnico_id)) WITH CHECK ((auth.uid() = tecnico_id));
CREATE POLICY "Técnico deleta próprias despesas" ON "public"."despesas" AS PERMISSIVE FOR DELETE TO "public" USING ((auth.uid() = tecnico_id));
CREATE POLICY "Autenticados leem frotas" ON "public"."frotas" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Financeiro e admin leem todas despesas" ON "public"."despesas" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = ANY (ARRAY['financeiro'::text, 'administrador'::text]))))));
CREATE POLICY "Admin gerencia todas despesas" ON "public"."despesas" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text)))));
CREATE POLICY "Autenticados leem tipos_despesa" ON "public"."tipos_despesa" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "Admin gerencia tipos_despesa" ON "public"."tipos_despesa" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text)))));
CREATE POLICY "Admin gerencia auditoria" ON "public"."auditoria" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text)))));
CREATE POLICY "Sistema insere auditoria" ON "public"."auditoria" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Usuário lê própria auditoria" ON "public"."auditoria" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = user_id));
CREATE POLICY "Admin gerencia frotas" ON "public"."frotas" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text)))));
CREATE POLICY "Autenticados fazem upload de comprovantes" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'comprovantes'::text));
CREATE POLICY "Autenticados leem comprovantes" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((bucket_id = 'comprovantes'::text));
CREATE POLICY "Autenticados deletam comprovantes" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((bucket_id = 'comprovantes'::text));
CREATE POLICY "Autenticados atualizam comprovantes" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((bucket_id = 'comprovantes'::text)) WITH CHECK ((bucket_id = 'comprovantes'::text));
CREATE POLICY "Financeiro atualiza despesas" ON "public"."despesas" AS PERMISSIVE FOR UPDATE TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = ANY (ARRAY['financeiro'::text, 'administrador'::text])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = ANY (ARRAY['financeiro'::text, 'administrador'::text]))))));
CREATE POLICY "usuarios_veem_proprios_km" ON "public"."controle_km" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() = usuario_id));
CREATE POLICY "gestores_veem_todos_km" ON "public"."controle_km" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = ANY (ARRAY['gestor'::text, 'administrador'::text, 'financeiro'::text]))))));
CREATE POLICY "usuarios_inserem_km" ON "public"."controle_km" AS PERMISSIVE FOR INSERT TO "public" WITH CHECK ((auth.uid() = usuario_id));
CREATE POLICY "usuarios_atualizam_proprio_km" ON "public"."controle_km" AS PERMISSIVE FOR UPDATE TO "public" USING ((auth.uid() = usuario_id));
CREATE POLICY "admin_deleta_km" ON "public"."controle_km" AS PERMISSIVE FOR DELETE TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'administrador'::text)))));
CREATE POLICY "Gestor lê todas despesas" ON "public"."despesas" AS PERMISSIVE FOR SELECT TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'gestor'::text)))));
CREATE POLICY "Gestor atualiza todas despesas" ON "public"."despesas" AS PERMISSIVE FOR UPDATE TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'gestor'::text))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.perfil = 'gestor'::text)))));
GRANT INSERT ON "public"."tipos_despesa" TO "anon";
GRANT SELECT ON "public"."tipos_despesa" TO "anon";
GRANT UPDATE ON "public"."tipos_despesa" TO "anon";
GRANT DELETE ON "public"."tipos_despesa" TO "anon";
GRANT TRUNCATE ON "public"."tipos_despesa" TO "anon";
GRANT REFERENCES ON "public"."tipos_despesa" TO "anon";
GRANT TRIGGER ON "public"."tipos_despesa" TO "anon";
GRANT INSERT ON "public"."tipos_despesa" TO "authenticated";
GRANT SELECT ON "public"."tipos_despesa" TO "authenticated";
GRANT UPDATE ON "public"."tipos_despesa" TO "authenticated";
GRANT DELETE ON "public"."tipos_despesa" TO "authenticated";
GRANT TRUNCATE ON "public"."tipos_despesa" TO "authenticated";
GRANT REFERENCES ON "public"."tipos_despesa" TO "authenticated";
GRANT TRIGGER ON "public"."tipos_despesa" TO "authenticated";
GRANT INSERT ON "public"."auditoria" TO "anon";
GRANT SELECT ON "public"."auditoria" TO "anon";
GRANT UPDATE ON "public"."auditoria" TO "anon";
GRANT DELETE ON "public"."auditoria" TO "anon";
GRANT TRUNCATE ON "public"."auditoria" TO "anon";
GRANT REFERENCES ON "public"."auditoria" TO "anon";
GRANT TRIGGER ON "public"."auditoria" TO "anon";
GRANT INSERT ON "public"."auditoria" TO "authenticated";
GRANT SELECT ON "public"."auditoria" TO "authenticated";
GRANT UPDATE ON "public"."auditoria" TO "authenticated";
GRANT DELETE ON "public"."auditoria" TO "authenticated";
GRANT TRUNCATE ON "public"."auditoria" TO "authenticated";
GRANT REFERENCES ON "public"."auditoria" TO "authenticated";
GRANT TRIGGER ON "public"."auditoria" TO "authenticated";
GRANT INSERT ON "public"."cartoes" TO "anon";
GRANT SELECT ON "public"."cartoes" TO "anon";
GRANT UPDATE ON "public"."cartoes" TO "anon";
GRANT DELETE ON "public"."cartoes" TO "anon";
GRANT TRUNCATE ON "public"."cartoes" TO "anon";
GRANT REFERENCES ON "public"."cartoes" TO "anon";
GRANT TRIGGER ON "public"."cartoes" TO "anon";
GRANT INSERT ON "public"."cartoes" TO "authenticated";
GRANT SELECT ON "public"."cartoes" TO "authenticated";
GRANT UPDATE ON "public"."cartoes" TO "authenticated";
GRANT DELETE ON "public"."cartoes" TO "authenticated";
GRANT TRUNCATE ON "public"."cartoes" TO "authenticated";
GRANT REFERENCES ON "public"."cartoes" TO "authenticated";
GRANT TRIGGER ON "public"."cartoes" TO "authenticated";
GRANT INSERT ON "public"."alertas_consumo" TO "anon";
GRANT SELECT ON "public"."alertas_consumo" TO "anon";
GRANT UPDATE ON "public"."alertas_consumo" TO "anon";
GRANT DELETE ON "public"."alertas_consumo" TO "anon";
GRANT TRUNCATE ON "public"."alertas_consumo" TO "anon";
GRANT REFERENCES ON "public"."alertas_consumo" TO "anon";
GRANT TRIGGER ON "public"."alertas_consumo" TO "anon";
GRANT INSERT ON "public"."alertas_consumo" TO "authenticated";
GRANT SELECT ON "public"."alertas_consumo" TO "authenticated";
GRANT UPDATE ON "public"."alertas_consumo" TO "authenticated";
GRANT DELETE ON "public"."alertas_consumo" TO "authenticated";
GRANT TRUNCATE ON "public"."alertas_consumo" TO "authenticated";
GRANT REFERENCES ON "public"."alertas_consumo" TO "authenticated";
GRANT TRIGGER ON "public"."alertas_consumo" TO "authenticated";
GRANT INSERT ON "storage"."objects" TO "authenticated";
GRANT SELECT ON "storage"."objects" TO "authenticated";
GRANT UPDATE ON "storage"."objects" TO "authenticated";
GRANT DELETE ON "storage"."objects" TO "authenticated";
GRANT TRUNCATE ON "storage"."objects" TO "authenticated";
GRANT REFERENCES ON "storage"."objects" TO "authenticated";
GRANT TRIGGER ON "storage"."objects" TO "authenticated";
GRANT INSERT ON "storage"."objects" TO "anon";
GRANT SELECT ON "storage"."objects" TO "anon";
GRANT UPDATE ON "storage"."objects" TO "anon";
GRANT DELETE ON "storage"."objects" TO "anon";
GRANT TRUNCATE ON "storage"."objects" TO "anon";
GRANT REFERENCES ON "storage"."objects" TO "anon";
GRANT TRIGGER ON "storage"."objects" TO "anon";
GRANT INSERT ON "public"."profiles" TO "anon";
GRANT SELECT ON "public"."profiles" TO "anon";
GRANT UPDATE ON "public"."profiles" TO "anon";
GRANT DELETE ON "public"."profiles" TO "anon";
GRANT TRUNCATE ON "public"."profiles" TO "anon";
GRANT REFERENCES ON "public"."profiles" TO "anon";
GRANT TRIGGER ON "public"."profiles" TO "anon";
GRANT INSERT ON "public"."profiles" TO "authenticated";
GRANT SELECT ON "public"."profiles" TO "authenticated";
GRANT UPDATE ON "public"."profiles" TO "authenticated";
GRANT DELETE ON "public"."profiles" TO "authenticated";
GRANT TRUNCATE ON "public"."profiles" TO "authenticated";
GRANT REFERENCES ON "public"."profiles" TO "authenticated";
GRANT TRIGGER ON "public"."profiles" TO "authenticated";
GRANT INSERT ON "public"."frotas" TO "anon";
GRANT SELECT ON "public"."frotas" TO "anon";
GRANT UPDATE ON "public"."frotas" TO "anon";
GRANT DELETE ON "public"."frotas" TO "anon";
GRANT TRUNCATE ON "public"."frotas" TO "anon";
GRANT REFERENCES ON "public"."frotas" TO "anon";
GRANT TRIGGER ON "public"."frotas" TO "anon";
GRANT INSERT ON "public"."frotas" TO "authenticated";
GRANT SELECT ON "public"."frotas" TO "authenticated";
GRANT UPDATE ON "public"."frotas" TO "authenticated";
GRANT DELETE ON "public"."frotas" TO "authenticated";
GRANT TRUNCATE ON "public"."frotas" TO "authenticated";
GRANT REFERENCES ON "public"."frotas" TO "authenticated";
GRANT TRIGGER ON "public"."frotas" TO "authenticated";
GRANT INSERT ON "public"."despesas" TO "anon";
GRANT SELECT ON "public"."despesas" TO "anon";
GRANT UPDATE ON "public"."despesas" TO "anon";
GRANT DELETE ON "public"."despesas" TO "anon";
GRANT TRUNCATE ON "public"."despesas" TO "anon";
GRANT REFERENCES ON "public"."despesas" TO "anon";
GRANT TRIGGER ON "public"."despesas" TO "anon";
GRANT INSERT ON "public"."despesas" TO "authenticated";
GRANT SELECT ON "public"."despesas" TO "authenticated";
GRANT UPDATE ON "public"."despesas" TO "authenticated";
GRANT DELETE ON "public"."despesas" TO "authenticated";
GRANT TRUNCATE ON "public"."despesas" TO "authenticated";
GRANT REFERENCES ON "public"."despesas" TO "authenticated";
GRANT TRIGGER ON "public"."despesas" TO "authenticated";
GRANT INSERT ON "public"."controle_km" TO "anon";
GRANT SELECT ON "public"."controle_km" TO "anon";
GRANT UPDATE ON "public"."controle_km" TO "anon";
GRANT DELETE ON "public"."controle_km" TO "anon";
GRANT TRUNCATE ON "public"."controle_km" TO "anon";
GRANT REFERENCES ON "public"."controle_km" TO "anon";
GRANT TRIGGER ON "public"."controle_km" TO "anon";
GRANT INSERT ON "public"."controle_km" TO "authenticated";
GRANT SELECT ON "public"."controle_km" TO "authenticated";
GRANT UPDATE ON "public"."controle_km" TO "authenticated";
GRANT DELETE ON "public"."controle_km" TO "authenticated";
GRANT TRUNCATE ON "public"."controle_km" TO "authenticated";
GRANT REFERENCES ON "public"."controle_km" TO "authenticated";
GRANT TRIGGER ON "public"."controle_km" TO "authenticated";
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated;
