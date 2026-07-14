import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runSetup() {
  if (!serviceRoleKey) {
    return { error: "Missing SUPABASE_SERVICE_ROLE_KEY", status: 500 };
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

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
    return { error: error.message, status: 400 };
  }

  if (!data.user) {
    return { error: "Usuário não foi criado", status: 500 };
  }

  return {
    success: true,
    message: "Usuário administrador criado com sucesso!",
    credentials: {
      email: "administrador@rjcompressores.com.br",
      password: "Admin@123",
    },
    status: 200,
  };
}

export async function GET() {
  const result = await runSetup();
  const { status, ...body } = result;
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  try {
    const result = await runSetup();
    const { status, ...body } = result;
    return NextResponse.json(body, { status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    );
  }
}
