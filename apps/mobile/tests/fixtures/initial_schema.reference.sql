


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."proximo_numero_documento_erp"() RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    proximo_numero BIGINT;
BEGIN
    proximo_numero := nextval('public.erp_documento_seq');

    RETURN proximo_numero;
END;
$$;


ALTER FUNCTION "public"."proximo_numero_documento_erp"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."alertas_consumo" (
    "id" "text" NOT NULL,
    "frota_id" "uuid" NOT NULL,
    "placa" "text" NOT NULL,
    "modelo" "text" NOT NULL,
    "data" timestamp with time zone NOT NULL,
    "litros" numeric NOT NULL,
    "km_apontado" numeric DEFAULT 0 NOT NULL,
    "km_esperado" numeric NOT NULL,
    "percentual" numeric NOT NULL,
    "valor" numeric NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "resolvido_em" timestamp with time zone,
    "resolvido_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "justificativa" "text"
);


ALTER TABLE "public"."alertas_consumo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "ordem" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."auditoria" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "acao" "text" NOT NULL,
    "entidade" "text",
    "entidade_id" "text",
    "detalhes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."auditoria" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."backup_comprovantes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "criado_por" "uuid" NOT NULL,
    "criado_em" timestamp with time zone DEFAULT "now"() NOT NULL,
    "corte_data" "date" NOT NULL,
    "total_itens" integer DEFAULT 0 NOT NULL,
    "total_bytes_estimado" bigint DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'gerado'::"text" NOT NULL,
    "excluido_por" "uuid",
    "excluido_em" timestamp with time zone,
    "zip_storage_path" "text",
    "observacao" "text",
    "zip_storage_paths" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    CONSTRAINT "backup_comprovantes_status_check" CHECK (("status" = ANY (ARRAY['gerado'::"text", 'excluido'::"text", 'expirado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."backup_comprovantes" OWNER TO "postgres";


COMMENT ON TABLE "public"."backup_comprovantes" IS 'Cabeçalho de cada execução de backup de comprovantes gerado por um administrador antes da exclusão física dos arquivos do Storage.';



COMMENT ON COLUMN "public"."backup_comprovantes"."status" IS 'gerado: ZIP criado, originais ainda no bucket comprovantes. excluido: originais já removidos, ZIP é a única cópia. expirado: originais já excluídos e o ZIP também foi removido (backup encerrado). cancelado: ZIP removido sem excluir os originais (backup descartado, comprovantes seguem intactos).';



COMMENT ON COLUMN "public"."backup_comprovantes"."zip_storage_paths" IS 'Caminhos dos arquivos ZIP no bucket backups-comprovantes. Um backup grande é particionado em várias partes para não exceder o limite de tamanho de objeto do Storage; substitui zip_storage_path (mantida apenas por compatibilidade).';



CREATE TABLE IF NOT EXISTS "public"."backup_comprovantes_itens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "backup_id" "uuid" NOT NULL,
    "despesa_id" "uuid" NOT NULL,
    "comprovante_url_original" "text" NOT NULL,
    "comprovante_nome_original" "text",
    "storage_path_original" "text" NOT NULL,
    "excluido" boolean DEFAULT false NOT NULL,
    "erro_exclusao" "text"
);


ALTER TABLE "public"."backup_comprovantes_itens" OWNER TO "postgres";


COMMENT ON TABLE "public"."backup_comprovantes_itens" IS 'Um registro por despesa incluída em um backup — trava o instantâneo de quais despesas fizeram parte, mesmo que o filtro de elegibilidade mude depois.';



CREATE TABLE IF NOT EXISTS "public"."cartoes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "banco" "text" NOT NULL,
    "bandeira" "text" NOT NULL,
    "ultimos_digitos" "text" NOT NULL,
    "apelido" "text",
    "is_padrao" boolean DEFAULT false NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "empresa_id_m8" integer
);


ALTER TABLE "public"."cartoes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."controle_km" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "frota_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "km_inicial" numeric(10,2) NOT NULL,
    "km_final" numeric(10,2),
    "data_inicio" timestamp with time zone DEFAULT "now"() NOT NULL,
    "data_fim" timestamp with time zone,
    "destino" "text",
    "motivo" "text",
    "observacao" "text",
    "status" "text" DEFAULT 'aberto'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "km_percorrido" integer,
    "duracao_minutos" integer,
    "ocorrencia" "text",
    CONSTRAINT "controle_km_status_check" CHECK (("status" = ANY (ARRAY['aberto'::"text", 'finalizado'::"text"])))
);


ALTER TABLE "public"."controle_km" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."despesas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tecnico_id" "uuid" NOT NULL,
    "tipo_despesa_id" "uuid" NOT NULL,
    "cartao_id" "uuid",
    "cliente" "text" NOT NULL,
    "numero_os" "text" NOT NULL,
    "valor" numeric(12,2) NOT NULL,
    "documento" "text",
    "observacao" "text",
    "comprovante_nome" "text",
    "comprovante_url" "text",
    "data_despesa" "date" NOT NULL,
    "data_checkin" timestamp with time zone,
    "data_checkout" timestamp with time zone,
    "numero_diarias" integer,
    "status_aprovacao" "text" DEFAULT 'AguardandoGestor'::"text" NOT NULL,
    "status_erp" "text" DEFAULT 'Rascunho'::"text" NOT NULL,
    "gestor_aprovador_id" "uuid",
    "justificativa_reprovacao" "text",
    "data_envio" timestamp with time zone,
    "data_aprovacao" timestamp with time zone,
    "erp_id" "text",
    "erp_payload" "jsonb",
    "erp_resposta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "frota_id" "uuid",
    "km_atual" numeric(12,2),
    "parcelado" boolean DEFAULT false NOT NULL,
    "numero_parcelas" integer DEFAULT 1 NOT NULL,
    "parcela_atual" integer DEFAULT 1 NOT NULL,
    "grupo_parcela_id" "uuid",
    "data_vencimento" "date",
    "pagamento_tipo" "text" DEFAULT 'cartao'::"text" NOT NULL,
    "reembolso_processado" boolean DEFAULT false NOT NULL,
    "reembolso_processado_em" timestamp with time zone,
    "reembolso_processado_por" "text",
    "aprovado_financeiro" boolean DEFAULT false NOT NULL,
    "aprovado_financeiro_em" timestamp with time zone,
    "aprovado_financeiro_por" "text",
    "lancado_erp" boolean DEFAULT false NOT NULL,
    "lancado_erp_em" timestamp with time zone,
    "lancado_erp_por" "text",
    "lancado_sistema" boolean DEFAULT false NOT NULL,
    "lancado_sistema_em" timestamp with time zone,
    "lancado_sistema_por" "text",
    "erp_status" "text" DEFAULT 'pendente'::"text" NOT NULL,
    "erp_etapa_erro" integer,
    "erp_erro" "text",
    "numero_documento_erp" bigint,
    "litros_abastecidos" numeric(8,3),
    "valor_litro" numeric(8,3),
    "tipo_combustivel" "text",
    "observacao_financeiro" "text",
    "anexo_financeiro_url" "text",
    "anexo_financeiro_nome" "text",
    "lancamento_cancelado" boolean DEFAULT false NOT NULL,
    "lancamento_cancelado_em" timestamp with time zone,
    "lancamento_cancelado_por" "uuid",
    "lancamento_cancelado_motivo" "text",
    "hora_despesa" "text",
    "comprovante_arquivado_em" timestamp with time zone,
    "comprovante_backup_id" "uuid",
    CONSTRAINT "despesas_pagamento_tipo_check" CHECK (("pagamento_tipo" = ANY (ARRAY['cartao'::"text", 'dinheiro'::"text", 'faturado'::"text", 'boleto'::"text"]))),
    CONSTRAINT "despesas_status_aprovacao_check" CHECK (("status_aprovacao" = ANY (ARRAY['AguardandoGestor'::"text", 'AprovadoGestor'::"text", 'Reprovado'::"text"]))),
    CONSTRAINT "despesas_status_erp_check" CHECK (("status_erp" = ANY (ARRAY['Rascunho'::"text", 'EnviadoAguardandoGestor'::"text", 'AprovadoGestorERPAtualizado'::"text", 'ErroEnvioERP'::"text", 'ErroAtualizarERP'::"text"])))
);


ALTER TABLE "public"."despesas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."despesas"."numero_documento_erp" IS 'Número sequencial utilizado no campo documento da Nota Fiscal do ERP M8';



COMMENT ON COLUMN "public"."despesas"."comprovante_arquivado_em" IS 'Data em que o arquivo do comprovante foi removido do Storage via backup administrativo. A despesa e seus dados financeiros permanecem intactos.';



COMMENT ON COLUMN "public"."despesas"."comprovante_backup_id" IS 'Backup (backup_comprovantes) responsável pela remoção física do arquivo do comprovante desta despesa, se aplicável.';



CREATE SEQUENCE IF NOT EXISTS "public"."erp_documento_seq"
    START WITH 4
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."erp_documento_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."frotas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "placa" "text" NOT NULL,
    "modelo" "text" NOT NULL,
    "marca" "text" NOT NULL,
    "ano" integer,
    "cor" "text",
    "tipo" "text",
    "quilometragem" numeric(12,2) DEFAULT 0 NOT NULL,
    "observacao" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "km_atualizado_em" timestamp with time zone,
    "km_media_litro" numeric(6,2),
    "alerta_ativo" boolean DEFAULT false NOT NULL,
    "ultimo_calculo_em" timestamp with time zone,
    "ultimo_calculo_km_apontado" numeric,
    "ultimo_calculo_km_esperado" numeric,
    "ultimo_calculo_percentual" numeric,
    "saldo_inicial_combustivel_litros" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."frotas" OWNER TO "postgres";


COMMENT ON COLUMN "public"."frotas"."saldo_inicial_combustivel_litros" IS 'Saldo de combustível (em litros) no tanque no momento do primeiro abastecimento cadastrado no sistema. Usado como ponto de partida do cálculo de saldo estimado, evitando assumir tanque vazio antes do primeiro registro.';



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nome" "text" NOT NULL,
    "email" "text" NOT NULL,
    "usuario" "text" NOT NULL,
    "perfil" "text" NOT NULL,
    "ativo" boolean DEFAULT true NOT NULL,
    "gestor_id" "uuid",
    "primeiro_acesso" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "area" "text",
    "empresa_id" "text",
    "fornecedor_id" "text",
    "condicao_pagamento_id" "text",
    "operacao_financeira_id" "text",
    "moeda_id" "text",
    "centro_custo_id" "text",
    "senha" "text",
    "telefone" "text",
    "frota_padrao_id" "uuid",
    "pessoa_id" integer,
    "chave_pix" "text",
    CONSTRAINT "profiles_perfil_check" CHECK (("perfil" = ANY (ARRAY['funcionario'::"text", 'gestor'::"text", 'financeiro'::"text", 'administrador'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_despesa" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nome" "text" NOT NULL,
    "descricao" "text",
    "limite_maximo" numeric(12,2),
    "limite_ocorrencias_diarias" integer,
    "calcula_diarias" boolean DEFAULT false NOT NULL,
    "exige_comprovante" boolean DEFAULT false NOT NULL,
    "documento_padrao" "text",
    "centro_custo_erp_id" "text",
    "ativo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "codigo_produto_erp" "text"
);


ALTER TABLE "public"."tipos_despesa" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tipos_despesa_centro_custo" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo_despesa_id" "uuid" NOT NULL,
    "area" "text" NOT NULL,
    "centro_custo_erp" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "descritivo_custo_erp" "text"
);


ALTER TABLE "public"."tipos_despesa_centro_custo" OWNER TO "postgres";


ALTER TABLE ONLY "public"."alertas_consumo"
    ADD CONSTRAINT "alertas_consumo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_nome_key" UNIQUE ("nome");



ALTER TABLE ONLY "public"."areas"
    ADD CONSTRAINT "areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_comprovantes_itens"
    ADD CONSTRAINT "backup_comprovantes_itens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."backup_comprovantes"
    ADD CONSTRAINT "backup_comprovantes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cartoes"
    ADD CONSTRAINT "cartoes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."controle_km"
    ADD CONSTRAINT "controle_km_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."frotas"
    ADD CONSTRAINT "frotas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."frotas"
    ADD CONSTRAINT "frotas_placa_key" UNIQUE ("placa");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_usuario_key" UNIQUE ("usuario");



ALTER TABLE ONLY "public"."tipos_despesa_centro_custo"
    ADD CONSTRAINT "tipos_despesa_centro_custo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tipos_despesa_centro_custo"
    ADD CONSTRAINT "tipos_despesa_centro_custo_tipo_area_unique" UNIQUE ("tipo_despesa_id", "area");



ALTER TABLE ONLY "public"."tipos_despesa_centro_custo"
    ADD CONSTRAINT "tipos_despesa_centro_custo_tipo_despesa_id_area_key" UNIQUE ("tipo_despesa_id", "area");



ALTER TABLE ONLY "public"."tipos_despesa"
    ADD CONSTRAINT "tipos_despesa_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "backup_comprovantes_itens_backup_despesa_key" ON "public"."backup_comprovantes_itens" USING "btree" ("backup_id", "despesa_id");



CREATE INDEX "idx_despesas_erp_status" ON "public"."despesas" USING "btree" ("erp_status");



CREATE INDEX "idx_despesas_lancado_sistema" ON "public"."despesas" USING "btree" ("lancado_sistema");



CREATE INDEX "idx_despesas_numero_documento_erp" ON "public"."despesas" USING "btree" ("numero_documento_erp");



ALTER TABLE ONLY "public"."alertas_consumo"
    ADD CONSTRAINT "alertas_consumo_frota_id_fkey" FOREIGN KEY ("frota_id") REFERENCES "public"."frotas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alertas_consumo"
    ADD CONSTRAINT "alertas_consumo_resolvido_por_fkey" FOREIGN KEY ("resolvido_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."auditoria"
    ADD CONSTRAINT "auditoria_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."backup_comprovantes"
    ADD CONSTRAINT "backup_comprovantes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."backup_comprovantes"
    ADD CONSTRAINT "backup_comprovantes_excluido_por_fkey" FOREIGN KEY ("excluido_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."backup_comprovantes_itens"
    ADD CONSTRAINT "backup_comprovantes_itens_backup_id_fkey" FOREIGN KEY ("backup_id") REFERENCES "public"."backup_comprovantes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."backup_comprovantes_itens"
    ADD CONSTRAINT "backup_comprovantes_itens_despesa_id_fkey" FOREIGN KEY ("despesa_id") REFERENCES "public"."despesas"("id");



ALTER TABLE ONLY "public"."cartoes"
    ADD CONSTRAINT "cartoes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."controle_km"
    ADD CONSTRAINT "controle_km_frota_id_fkey" FOREIGN KEY ("frota_id") REFERENCES "public"."frotas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."controle_km"
    ADD CONSTRAINT "controle_km_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_cartao_id_fkey" FOREIGN KEY ("cartao_id") REFERENCES "public"."cartoes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_comprovante_backup_id_fkey" FOREIGN KEY ("comprovante_backup_id") REFERENCES "public"."backup_comprovantes"("id");



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_frota_id_fkey" FOREIGN KEY ("frota_id") REFERENCES "public"."frotas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_gestor_aprovador_id_fkey" FOREIGN KEY ("gestor_aprovador_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_lancamento_cancelado_por_fkey" FOREIGN KEY ("lancamento_cancelado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_tecnico_id_fkey" FOREIGN KEY ("tecnico_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."despesas"
    ADD CONSTRAINT "despesas_tipo_despesa_id_fkey" FOREIGN KEY ("tipo_despesa_id") REFERENCES "public"."tipos_despesa"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_frota_padrao_id_fkey" FOREIGN KEY ("frota_padrao_id") REFERENCES "public"."frotas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_gestor_id_fkey" FOREIGN KEY ("gestor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tipos_despesa_centro_custo"
    ADD CONSTRAINT "tipos_despesa_centro_custo_tipo_despesa_id_fkey" FOREIGN KEY ("tipo_despesa_id") REFERENCES "public"."tipos_despesa"("id") ON DELETE CASCADE;



CREATE POLICY "Admin atualiza perfis" ON "public"."profiles" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."perfil" = 'administrador'::"text")))) OR ("auth"."uid"() = "id"))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."perfil" = 'administrador'::"text")))) OR ("auth"."uid"() = "id")));



CREATE POLICY "Admin deleta perfis" ON "public"."profiles" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin gerencia auditoria" ON "public"."auditoria" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin gerencia frotas" ON "public"."frotas" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin gerencia tipos_despesa" ON "public"."tipos_despesa" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin gerencia tipos_despesa_centro_custo" ON "public"."tipos_despesa_centro_custo" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin gerencia todas despesas" ON "public"."despesas" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin gerencia todos os cartões" ON "public"."cartoes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admin insere perfis" ON "public"."profiles" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "profiles_1"
  WHERE (("profiles_1"."id" = "auth"."uid"()) AND ("profiles_1"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admins podem tudo em backup_comprovantes" ON "public"."backup_comprovantes" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Admins podem tudo em backup_comprovantes_itens" ON "public"."backup_comprovantes_itens" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = 'administrador'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."perfil" = 'administrador'::"text")))));



CREATE POLICY "Autenticados leem frotas" ON "public"."frotas" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Autenticados leem tipos_despesa" ON "public"."tipos_despesa" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Autenticados leem tipos_despesa_centro_custo" ON "public"."tipos_despesa_centro_custo" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Financeiro atualiza despesas" ON "public"."despesas" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['financeiro'::"text", 'administrador'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['financeiro'::"text", 'administrador'::"text"]))))));



CREATE POLICY "Financeiro e admin leem todas despesas" ON "public"."despesas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['financeiro'::"text", 'administrador'::"text"]))))));



CREATE POLICY "Gestor atualiza todas despesas" ON "public"."despesas" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'gestor'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'gestor'::"text")))));



CREATE POLICY "Gestor lê todas despesas" ON "public"."despesas" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'gestor'::"text")))));



CREATE POLICY "Gestor vê cartões do time" ON "public"."cartoes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "cartoes"."user_id") AND ("p"."gestor_id" = "auth"."uid"())))));



CREATE POLICY "Lookup público de email por usuario" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Sistema insere auditoria" ON "public"."auditoria" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Técnico atualiza próprias despesas" ON "public"."despesas" FOR UPDATE USING (("auth"."uid"() = "tecnico_id")) WITH CHECK (("auth"."uid"() = "tecnico_id"));



CREATE POLICY "Técnico deleta próprias despesas" ON "public"."despesas" FOR DELETE USING (("auth"."uid"() = "tecnico_id"));



CREATE POLICY "Técnico insere próprias despesas" ON "public"."despesas" FOR INSERT WITH CHECK (("auth"."uid"() = "tecnico_id"));



CREATE POLICY "Técnico lê próprias despesas" ON "public"."despesas" FOR SELECT USING (("auth"."uid"() = "tecnico_id"));



CREATE POLICY "Usuário gerencia próprios cartões" ON "public"."cartoes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Usuário lê própria auditoria" ON "public"."auditoria" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "admin_atualiza_areas" ON "public"."areas" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['administrador'::"text", 'gestor'::"text"]))))));



CREATE POLICY "admin_atualiza_centro_custo" ON "public"."tipos_despesa_centro_custo" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['administrador'::"text", 'gestor'::"text"]))))));



CREATE POLICY "admin_deleta_areas" ON "public"."areas" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "admin_deleta_centro_custo" ON "public"."tipos_despesa_centro_custo" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['administrador'::"text", 'gestor'::"text"]))))));



CREATE POLICY "admin_deleta_km" ON "public"."controle_km" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = 'administrador'::"text")))));



CREATE POLICY "admin_insere_areas" ON "public"."areas" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['administrador'::"text", 'gestor'::"text"]))))));



CREATE POLICY "admin_insere_centro_custo" ON "public"."tipos_despesa_centro_custo" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['administrador'::"text", 'gestor'::"text"]))))));



ALTER TABLE "public"."alertas_consumo" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."areas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."auditoria" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_comprovantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."backup_comprovantes_itens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cartoes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."controle_km" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."despesas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."frotas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gestores_veem_todos_km" ON "public"."controle_km" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."perfil" = ANY (ARRAY['gestor'::"text", 'administrador'::"text", 'financeiro'::"text"]))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_despesa" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tipos_despesa_centro_custo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "todos_leem_areas" ON "public"."areas" FOR SELECT USING (true);



CREATE POLICY "todos_leem_centro_custo" ON "public"."tipos_despesa_centro_custo" FOR SELECT USING (true);



CREATE POLICY "usuarios_atualizam_proprio_km" ON "public"."controle_km" FOR UPDATE USING (("auth"."uid"() = "usuario_id"));



CREATE POLICY "usuarios_inserem_km" ON "public"."controle_km" FOR INSERT WITH CHECK (("auth"."uid"() = "usuario_id"));



CREATE POLICY "usuarios_veem_proprios_km" ON "public"."controle_km" FOR SELECT USING (("auth"."uid"() = "usuario_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."proximo_numero_documento_erp"() TO "anon";
GRANT ALL ON FUNCTION "public"."proximo_numero_documento_erp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."proximo_numero_documento_erp"() TO "service_role";


















GRANT ALL ON TABLE "public"."alertas_consumo" TO "anon";
GRANT ALL ON TABLE "public"."alertas_consumo" TO "authenticated";
GRANT ALL ON TABLE "public"."alertas_consumo" TO "service_role";



GRANT ALL ON TABLE "public"."areas" TO "anon";
GRANT ALL ON TABLE "public"."areas" TO "authenticated";
GRANT ALL ON TABLE "public"."areas" TO "service_role";



GRANT ALL ON TABLE "public"."auditoria" TO "anon";
GRANT ALL ON TABLE "public"."auditoria" TO "authenticated";
GRANT ALL ON TABLE "public"."auditoria" TO "service_role";



GRANT ALL ON TABLE "public"."backup_comprovantes" TO "anon";
GRANT ALL ON TABLE "public"."backup_comprovantes" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_comprovantes" TO "service_role";



GRANT ALL ON TABLE "public"."backup_comprovantes_itens" TO "anon";
GRANT ALL ON TABLE "public"."backup_comprovantes_itens" TO "authenticated";
GRANT ALL ON TABLE "public"."backup_comprovantes_itens" TO "service_role";



GRANT ALL ON TABLE "public"."cartoes" TO "anon";
GRANT ALL ON TABLE "public"."cartoes" TO "authenticated";
GRANT ALL ON TABLE "public"."cartoes" TO "service_role";



GRANT ALL ON TABLE "public"."controle_km" TO "anon";
GRANT ALL ON TABLE "public"."controle_km" TO "authenticated";
GRANT ALL ON TABLE "public"."controle_km" TO "service_role";



GRANT ALL ON TABLE "public"."despesas" TO "anon";
GRANT ALL ON TABLE "public"."despesas" TO "authenticated";
GRANT ALL ON TABLE "public"."despesas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."erp_documento_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."erp_documento_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."erp_documento_seq" TO "service_role";



GRANT ALL ON TABLE "public"."frotas" TO "anon";
GRANT ALL ON TABLE "public"."frotas" TO "authenticated";
GRANT ALL ON TABLE "public"."frotas" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_despesa" TO "anon";
GRANT ALL ON TABLE "public"."tipos_despesa" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_despesa" TO "service_role";



GRANT ALL ON TABLE "public"."tipos_despesa_centro_custo" TO "anon";
GRANT ALL ON TABLE "public"."tipos_despesa_centro_custo" TO "authenticated";
GRANT ALL ON TABLE "public"."tipos_despesa_centro_custo" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
