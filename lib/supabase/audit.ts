import { createClient } from "@/lib/supabase/client";

export type AcaoAuditoria = 
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "REJECT"
  | "LOGIN"
  | "LOGOUT"
  | "SEND_FOR_APPROVAL";

export interface LogAuditoria {
  acao: AcaoAuditoria;
  entidade: string;
  entidadeId: string;
  usuarioId?: string; // opcional — usa sessão ativa como fallback
  detalhes?: string;
}

export async function registrarAuditoria({
  acao,
  entidade,
  entidadeId,
  usuarioId,
  detalhes,
}: LogAuditoria): Promise<{ error?: string; success?: boolean }> {
  const supabase = createClient();
  if (!supabase) return { error: "Supabase não disponível" };

  // Resolver user_id: usa o passado ou obtém da sessão ativa
  let resolvedUserId = usuarioId;
  if (!resolvedUserId || resolvedUserId === "sistema") {
    const { data: { user } } = await supabase.auth.getUser();
    resolvedUserId = user?.id ?? "sistema";
  }

  const { error } = await supabase.from("auditoria").insert({
    acao,
    entidade,
    entidade_id: entidadeId,
    user_id: resolvedUserId,
    detalhes: detalhes || null,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[v0] Erro ao registrar auditoria:", error);
    return { error: error.message };
  }

  return { success: true };
}
