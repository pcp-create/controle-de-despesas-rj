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
  entidade: string; // ex: "despesa", "usuario", "tipo_despesa"
  entidadeId: string;
  usuarioId: string;
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

  const { error } = await supabase.from("auditoria").insert({
    acao,
    entidade,
    entidade_id: entidadeId,
    user_id: usuarioId,
    detalhes: detalhes || null,
  });

  if (error) {
    console.error("[v0] Erro ao registrar auditoria:", error);
    return { error: error.message };
  }

  return { success: true };
}
