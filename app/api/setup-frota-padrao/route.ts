import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function GET() {
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Verifica colunas necessárias
  const { error: checkProfiles } = await supabase.from("profiles").select("frota_padrao_id").limit(1);
  const { error: checkFrotas } = await supabase.from("frotas").select("km_atualizado_em").limit(1);

  const missingCols: string[] = [];
  if (checkProfiles) missingCols.push("profiles.frota_padrao_id");
  if (checkFrotas) missingCols.push("frotas.km_atualizado_em");

  if (missingCols.length === 0) {
    return NextResponse.json({ success: true, message: "Todas as colunas já existem." });
  }

  const sqls: string[] = [];
  if (checkProfiles) sqls.push("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS frota_padrao_id UUID REFERENCES frotas(id) ON DELETE SET NULL;");
  if (checkFrotas) sqls.push("ALTER TABLE frotas ADD COLUMN IF NOT EXISTS km_atualizado_em TIMESTAMPTZ;");

  const sql = sqls.join("\n");

  return NextResponse.json({
    needsMigration: true,
    message: "Execute o SQL abaixo no Supabase SQL Editor (Dashboard > SQL Editor):",
    sql,
  }, { status: 200 });
}
