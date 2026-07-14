import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { usuario, senha } = await request.json();

    if (!usuario || !senha) {
      return NextResponse.json({ error: "Usuário e senha são obrigatórios" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 1. Buscar email pelo usuario com service role (bypassa RLS)
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: profileData, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("email, ativo, nome, perfil")
      .eq("usuario", usuario.trim().toLowerCase())
      .single();

    console.log("[v0] login - profile lookup:", profileData, profileError?.message);

    if (profileError || !profileData) {
      return NextResponse.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
    }

    if (!profileData.ativo) {
      return NextResponse.json({ error: "Usuário inativo. Entre em contato com o administrador." }, { status: 403 });
    }

    // 2. Autenticar no Supabase Auth com o email encontrado
    const supabaseServer = await createServerClient();
    const { data: authData, error: authError } = await supabaseServer.auth.signInWithPassword({
      email: profileData.email,
      password: senha,
    });

    console.log("[v0] login - auth result:", authData?.user?.id, authError?.message);

    if (authError || !authData.user || !authData.session) {
      return NextResponse.json({ error: "Usuário ou senha inválidos" }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      session: {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      },
      user: {
        id: authData.user.id,
        email: authData.user.email,
        nome: profileData.nome,
        perfil: profileData.perfil,
      },
    });
  } catch (err) {
    console.error("[v0] login - erro:", err);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
