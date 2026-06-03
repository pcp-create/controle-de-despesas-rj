import type { ERPStatus, ApprovalStatus } from "./types";

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR");
}

export const erpStatusLabel: Record<ERPStatus, string> = {
  Rascunho: "Rascunho",
  EnviadoAguardandoGestor: "Aguardando Gestor",
  ErroEnvioERP: "Erro ao Enviar ERP",
  AprovadoGestor: "Aprovado pelo Gestor",
  AprovadoGestorERPAtualizado: "Aprovado - ERP Atualizado",
  ReprovadoGestor: "Reprovado pelo Gestor",
  ReprovadoERPAtualizado: "Reprovado - ERP Atualizado",
  ErroAtualizarERP: "Erro ao Atualizar ERP",
};

export const erpStatusColor: Record<ERPStatus, string> = {
  Rascunho: "bg-muted text-muted-foreground",
  EnviadoAguardandoGestor: "bg-warning/15 text-warning",
  ErroEnvioERP: "bg-destructive/15 text-destructive",
  AprovadoGestor: "bg-success/15 text-success",
  AprovadoGestorERPAtualizado: "bg-success/15 text-success",
  ReprovadoGestor: "bg-destructive/15 text-destructive",
  ReprovadoERPAtualizado: "bg-destructive/15 text-destructive",
  ErroAtualizarERP: "bg-destructive/15 text-destructive",
};

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  AguardandoGestor: "Aguardando Gestor",
  AprovadoGestor: "Aprovado",
  Reprovado: "Reprovado",
};

export const approvalStatusColor: Record<ApprovalStatus, string> = {
  AguardandoGestor: "bg-warning/15 text-warning",
  AprovadoGestor: "bg-success/15 text-success",
  Reprovado: "bg-destructive/15 text-destructive",
};

export const perfilLabel: Record<string, string> = {
  administrador: "Administrador",
  gestor: "Gestor",
  financeiro: "Financeiro",
  tecnico: "Técnico",
};
