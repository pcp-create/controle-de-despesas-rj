import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: Request) {
  try {
    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: "Service key not configured" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { email, password, nome, usuario, perfil, gestor_id } = body;

    if (!email || !password || !nome || !usuario || !perfil) {
      return NextResponse.json(
        { error: "Campos obrigatorios: email, password, nome, usuario, perfil" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Criar usuario no Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nome,
        usuario,
        perfil,
      },
    });

    if (authError) {
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "Erro ao criar usuario" },
        { status: 500 }
      );
    }

    // Inserir profile completo no banco
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: authData.user.id,
        nome,
        email,
        usuario,
        perfil,
        ativo: true,
        primeiro_acesso: true,
        gestor_id: gestor_id || null,
      });

    if (profileError) {
      // Reverter: deletar usuário do Auth se o profile falhou
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: "Erro ao criar perfil: " + profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Usuario criado com sucesso",
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });
  } catch (error) {
    console.error("Error creating user:", error);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    );
  }
}
