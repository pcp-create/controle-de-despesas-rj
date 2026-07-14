import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(request: NextRequest) {
  if (!serviceRoleKey) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    // Criar usuário administrador
    const { data, error } = await supabase.auth.admin.createUser({
      email: "administrador@rjcompressores.com.br",
      password: "Admin@123",
      email_confirm: true,
      user_metadata: {
        nome: "Administrador",
        usuario: "admin",
        perfil: "administrador",
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data.user) {
      return NextResponse.json({ error: "Usuário não foi criado" }, { status: 500 });
    }

    // O trigger deve criar o perfil automaticamente
    return NextResponse.json({
      success: true,
      message: "Usuário administrador criado com sucesso!",
      credentials: {
        email: "administrador@rjcompressores.com.br",
        password: "Admin@123",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
