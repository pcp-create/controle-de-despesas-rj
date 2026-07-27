import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SQL = `
-- Tabela de áreas / setores
CREATE TABLE IF NOT EXISTS public.areas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT NOT NULL UNIQUE,
  ativo      BOOLEAN NOT NULL DEFAULT true,
  ordem      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Dados iniciais (mantém compatibilidade com valores já usados nos profiles)
INSERT INTO public.areas (nome, ordem)
VALUES
  ('Administrativo', 1),
  ('Comercial',      2),
  ('Manutenção',     3)
ON CONFLICT (nome) DO NOTHING;

-- RLS
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "todos_leem_areas"   ON public.areas;
DROP POLICY IF EXISTS "admin_gerencia_areas" ON public.areas;

CREATE POLICY "todos_leem_areas"
  ON public.areas FOR SELECT USING (true);

CREATE POLICY "admin_insere_areas"
  ON public.areas FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND perfil IN ('administrador', 'gestor')
    )
  );

CREATE POLICY "admin_atualiza_areas"
  ON public.areas FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND perfil IN ('administrador', 'gestor')
    )
  );

CREATE POLICY "admin_deleta_areas"
  ON public.areas FOR DELETE
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

  const { error } = await supabase.from("areas").select("id").limit(1);

  if (!error) {
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ needsMigration: true, sql: SQL });
}
