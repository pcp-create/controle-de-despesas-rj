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

  // Verifica se a coluna pessoa_id já existe
  const { error: checkError } = await supabase
    .from("profiles")
    .select("pessoa_id")
    .limit(1);

  if (!checkError) {
    return NextResponse.json({ success: true, message: "Coluna pessoa_id já existe." });
  }

  // Tenta criar a coluna automaticamente via rpc exec_sql
  const { error: rpcError } = await supabase.rpc("exec_sql", {
    sql: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pessoa_id INTEGER;",
  });

  if (!rpcError) {
    return NextResponse.json({ success: true, message: "Coluna pessoa_id criada com sucesso." });
  }

  // Fallback: retorna SQL para execução manual
  return NextResponse.json({
    needsMigration: true,
    message: "Execute o SQL abaixo no Supabase SQL Editor (Dashboard > SQL Editor):",
    sql: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pessoa_id INTEGER;",
  });
}
