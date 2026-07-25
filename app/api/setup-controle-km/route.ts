import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SQL = `
-- Tabela de controle de KM
CREATE TABLE IF NOT EXISTS public.controle_km (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frota_id        UUID NOT NULL REFERENCES public.frotas(id) ON DELETE CASCADE,
  usuario_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  km_inicial      NUMERIC(10,2) NOT NULL,
  km_final        NUMERIC(10,2),
  km_percorrido   NUMERIC(10,2) GENERATED ALWAYS AS (km_final - km_inicial) STORED,
  data_inicio     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data_fim        TIMESTAMPTZ,
  duracao_minutos INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (data_fim - data_inicio)) / 60
  )::INTEGER STORED,
  destino         TEXT,
  motivo          TEXT,
  observacao      TEXT,
  status          TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'finalizado')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Colunas extras nas tabelas existentes
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS frota_padrao_id UUID REFERENCES public.frotas(id) ON DELETE SET NULL;
ALTER TABLE public.frotas    ADD COLUMN IF NOT EXISTS km_atualizado_em TIMESTAMPTZ;

-- RLS
ALTER TABLE public.controle_km ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "usuarios_veem_proprios_km"
  ON public.controle_km FOR SELECT
  USING (auth.uid() = usuario_id);

CREATE POLICY IF NOT EXISTS "gestores_veem_todos_km"
  ON public.controle_km FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND perfil IN ('gestor', 'administrador', 'financeiro')
    )
  );

CREATE POLICY IF NOT EXISTS "usuarios_inserem_km"
  ON public.controle_km FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY IF NOT EXISTS "usuarios_atualizam_proprio_km"
  ON public.controle_km FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY IF NOT EXISTS "admin_deleta_km"
  ON public.controle_km FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND perfil = 'administrador'
    )
  );
`.trim();

export async function GET() {
  if (!serviceRoleKey) {
    return NextResponse.json({ needsMigration: true, sql: SQL });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.from("controle_km").select("id").limit(1);

  if (!error) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ needsMigration: true, sql: SQL });
}
