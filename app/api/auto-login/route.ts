import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cmndhqfifljthmqiqemt.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST() {
  if (!supabaseServiceKey) {
    return Response.json({ error: "Service role key not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Criar usuário com email confirmado
    const { data, error } = await supabase.auth.admin.createUser({
      email: "administrador@rjcompressores.com.br",
      password: "317622",
      email_confirm: true,
      user_metadata: {
        nome: "Administrador",
        usuario: "admin",
        perfil: "administrador",
      },
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({
      success: true,
      message: "Usuário criado com sucesso!",
      user: data.user,
      credentials: {
        email: "administrador@rjcompressores.com.br",
        password: "317622",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, { status: 500 });
  }
}
