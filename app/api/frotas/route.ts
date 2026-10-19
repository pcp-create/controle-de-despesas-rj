import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// GET - listar frotas
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // A política existente permite aos autenticados consultar as frotas.
  const { data, error } = await supabase
    .from("frotas")
    .select("*")
    .order("placa");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}

// POST - criar frota
export async function POST(request: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { data, error } = await admin
    .from("frotas")
    .insert(body)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ data });
}

// PATCH - atualizar frota
export async function PATCH(request: Request) {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "ID obrigatório" }, { status: 400 });
  }

  const { error } = await admin
    .from("frotas")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
