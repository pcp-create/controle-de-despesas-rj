import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { usuario } = await request.json();

    if (!usuario) {
      return NextResponse.json({ error: "Usuário não informado" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("usuario", usuario.trim().toLowerCase())
      .eq("ativo", true)
      .single();

    if (error || !data) {
      // Retorna erro genérico para não revelar se o usuário existe
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 404 });
    }

    return NextResponse.json({ email: data.email });
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
