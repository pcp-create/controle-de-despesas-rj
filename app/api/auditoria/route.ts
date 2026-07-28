import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET — busca todos os registros de auditoria com service key (ignora RLS)
export async function GET() {
  if (!supabaseServiceKey) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin
    .from("auditoria")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
