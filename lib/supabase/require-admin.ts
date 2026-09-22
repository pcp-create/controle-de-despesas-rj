import "server-only";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/lib/supabase/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export interface AdminSession {
  userId: string;
  email: string | null;
  nome: string | null;
  perfil: string;
}

export type RequireAdminResult =
  | { ok: true; admin: AdminSession }
  | { ok: false; status: number; error: string };

/**
 * Valida, a partir dos cookies de sessão da requisição, que existe um usuário
 * autenticado E que o perfil dele em `profiles` está entre os perfis
 * permitidos (por padrão, apenas 'administrador').
 *
 * Esta é a ÚNICA verificação de admin usada pelas rotas de backup de
 * comprovantes — nenhuma delas confia em um `userId`/`perfil` enviado pelo
 * corpo da requisição. Rotas administrativas mais antigas do projeto (ex.:
 * integrar-erp) não faziam essa validação no servidor; este helper existe
 * para que as rotas novas, que apagam arquivos, não repitam esse padrão.
 */
export async function requireAdmin(
  allowedProfiles: string[] = ["administrador"],
): Promise<RequireAdminResult> {
  const sessionClient = await createSessionClient();
  const { data: userData, error: userError } = await sessionClient.auth.getUser();

  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: "Sessão inválida ou expirada. Faça login novamente." };
  }

  const { data: profile, error: profileError } = await sessionClient
    .from("profiles")
    .select("id, nome, perfil, ativo")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return { ok: false, status: 403, error: "Perfil não encontrado." };
  }

  if (!profile.ativo) {
    return { ok: false, status: 403, error: "Usuário inativo." };
  }

  if (!allowedProfiles.includes(profile.perfil)) {
    return { ok: false, status: 403, error: "Você não tem permissão para executar esta ação." };
  }

  return {
    ok: true,
    admin: {
      userId: userData.user.id,
      email: userData.user.email ?? null,
      nome: profile.nome ?? null,
      perfil: profile.perfil,
    },
  };
}

/**
 * Reautentica o admin com email + senha atuais (usados apenas para confirmar
 * a identidade antes de uma exclusão definitiva — não abre uma nova sessão).
 */
export async function reauthenticateAdmin(
  email: string,
  senha: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabaseUrl || !supabaseServiceKey) {
    return { ok: false, error: "Configuração do Supabase ausente no servidor." };
  }
  if (!email || !senha) {
    return { ok: false, error: "Informe a senha para confirmar a exclusão." };
  }

  // Cliente descartável, sem persistir sessão — usado só para checar a senha.
  const checkClient = createServiceClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await checkClient.auth.signInWithPassword({ email, password: senha });

  if (error) {
    return { ok: false, error: "Senha incorreta." };
  }

  return { ok: true };
}

/** Cliente com a service role key — usado só após requireAdmin() confirmar a sessão. */
export function createServiceRoleClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Configuração do Supabase ausente no servidor.");
  }
  return createServiceClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
