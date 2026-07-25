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

  // Verifica se a coluna já existe tentando selecionar
  const { error: checkError } = await supabase
    .from("profiles")
    .select("frota_padrao_id")
    .limit(1);

  if (!checkError) {
    return NextResponse.json({ success: true, message: "Coluna frota_padrao_id já existe." });
  }

  // Coluna não existe — retornar o SQL para o usuário executar manualmente
  const sql = `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS frota_padrao_id UUID REFERENCES frotas(id) ON DELETE SET NULL;`;

  return NextResponse.json({
    needsMigration: true,
    message: "Execute o SQL abaixo no Supabase SQL Editor (Dashboard > SQL Editor):",
    sql,
  }, { status: 200 });
}
