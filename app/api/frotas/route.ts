import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://xyvupybgnvzzdrpkfuwb.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5dnVweWJnbnZ6emRycGtmdXdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1MjQ1MzMsImV4cCI6MjA5NjEwMDUzM30.6M3323i61eenzPwTsK9T7Xp7wwfdyYPMBfHuULTd-b8";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getAuthenticatedUser() {
  // Lê o access_token diretamente do cookie de sessão do Supabase
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();

  // O Supabase armazena a sessão em cookie com nome que contém "auth-token"
  console.log("[v0] cookies disponíveis:", allCookies.map((c) => c.name));

  const sessionCookie = allCookies.find(
    (c) => c.name.includes("auth-token") && !c.name.includes("code-verifier")
  );

  if (!sessionCookie) {
    console.log("[v0] cookie de sessão não encontrado");
    return null;
  }

  try {
    const sessionData = JSON.parse(sessionCookie.value);
    const accessToken = Array.isArray(sessionData)
      ? sessionData[0]?.access_token
      : sessionData?.access_token;

    if (!accessToken) return null;

    // Valida o token usando o cliente Supabase com anon key
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    });

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

// GET - listar frotas
export async function GET() {
  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Configuração do servidor incompleta" },
      { status: 500 }
    );
  }
  const { data, error } = await admin
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
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

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
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

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
