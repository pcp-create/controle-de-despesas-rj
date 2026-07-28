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

  const { error: checkFrota }         = await supabase.from("frotas").select("km_media_litro").limit(1);
  const { error: checkLitros }        = await supabase.from("despesas").select("litros_abastecidos").limit(1);
  const { error: checkValorLitro }    = await supabase.from("despesas").select("valor_litro").limit(1);
  const { error: checkTipoCombust }   = await supabase.from("despesas").select("tipo_combustivel").limit(1);

  const missing: { col: string; sql: string }[] = [];

  if (checkFrota)
    missing.push({
      col: "frotas.km_media_litro",
      sql: "ALTER TABLE frotas ADD COLUMN IF NOT EXISTS km_media_litro NUMERIC(6,2);",
    });
  if (checkLitros)
    missing.push({
      col: "despesas.litros_abastecidos",
      sql: "ALTER TABLE despesas ADD COLUMN IF NOT EXISTS litros_abastecidos NUMERIC(8,3);",
    });
  if (checkValorLitro)
    missing.push({
      col: "despesas.valor_litro",
      sql: "ALTER TABLE despesas ADD COLUMN IF NOT EXISTS valor_litro NUMERIC(8,3);",
    });
  if (checkTipoCombust)
    missing.push({
      col: "despesas.tipo_combustivel",
      sql: "ALTER TABLE despesas ADD COLUMN IF NOT EXISTS tipo_combustivel TEXT;",
    });

  if (missing.length === 0) {
    return NextResponse.json({ success: true, message: "Todas as colunas já existem." });
  }

  const sql = missing.map((m) => m.sql).join("\n");

  return NextResponse.json({
    needsMigration: true,
    message: "Execute o SQL abaixo no Supabase SQL Editor (Dashboard > SQL Editor):",
    sql,
  });
}
