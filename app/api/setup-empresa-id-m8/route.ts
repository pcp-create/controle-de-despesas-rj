import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase.from("cartoes").select("empresa_id_m8").limit(1);

  if (!error) {
    return NextResponse.json({ ok: true, message: "Coluna empresa_id_m8 já existe." });
  }

  return NextResponse.json({
    ok: false,
    needsMigration: true,
    sql: "ALTER TABLE cartoes ADD COLUMN IF NOT EXISTS empresa_id_m8 INTEGER;",
    message: "Execute o SQL abaixo no Supabase Dashboard → SQL Editor para adicionar a coluna Empresa ID M8 na tabela cartoes.",
  });
}
