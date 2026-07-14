import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { usuario } = await request.json();

    console.log("[v0] lookup-usuario - usuario recebido:", usuario);

    if (!usuario) {
      return NextResponse.json({ error: "Usuário não informado" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log("[v0] lookup-usuario - supabaseUrl:", supabaseUrl);
    console.log("[v0] lookup-usuario - serviceRoleKey presente:", !!serviceRoleKey);

    if (!supabaseUrl || !serviceRoleKey) {
      console.log("[v0] lookup-usuario - env vars faltando!");
      return NextResponse.json({ error: "Configuração inválida" }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const usuarioNormalizado = usuario.trim().toLowerCase();
    console.log("[v0] lookup-usuario - buscando usuario normalizado:", usuarioNormalizado);

    const { data, error } = await supabase
      .from("profiles")
      .select("email")
      .eq("usuario", usuarioNormalizado)
      .eq("ativo", true)
      .single();

    console.log("[v0] lookup-usuario - data:", data, "error:", error);

    if (error || !data) {
      return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 404 });
    }

    console.log("[v0] lookup-usuario - email encontrado:", data.email);
    return NextResponse.json({ email: data.email });
  } catch (err) {
    console.log("[v0] lookup-usuario - exception:", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
