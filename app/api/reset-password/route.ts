import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SENHA_PADRAO = "123456";

export async function POST(request: Request) {
  try {
    if (!supabaseServiceKey) {
      return NextResponse.json({ error: "Service key not configured" }, { status: 500 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Atualiza a senha no Supabase Auth (o que valida o login)
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: SENHA_PADRAO,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // 2. Atualiza a senha e marca primeiro_acesso na tabela profiles
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ senha: SENHA_PADRAO, primeiro_acesso: true })
      .eq("id", userId);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, senha: SENHA_PADRAO });
  } catch (error) {
    console.error("Erro ao resetar senha:", error);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
