import { createClient } from "@supabase/supabase-js";
import { readAllPages } from "@/lib/supabase/paginate";
import { NextResponse } from "next/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// GET - busca todas as despesas para gestor/admin usando service key (ignora RLS)
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

  try {
    const data = await readAllPages((from, to) => admin
    .from("despesas")
    .select(`
      *,
      tipo_despesa:tipos_despesa(*),
      cartao:cartoes(*),
      tecnico:profiles!despesas_tecnico_id_fkey(id, nome, email),
      frota:frotas(id, placa, modelo, km_media_litro)
    `)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to));

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível carregar todas as despesas" }, { status: 500 });
  }
}
