import type { ERPStatus, ApprovalStatus } from "./types";

export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return "-";
  // Adiciona T12:00:00 para evitar deslocamento de fuso UTC → BRT
  const normalized = dateStr.length === 10 ? dateStr + "T12:00:00" : dateStr;
  const d = new Date(normalized);
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTime(dateStr: string): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleString("pt-BR");
}

// Status geral unificado — combina status_erp + status_aprovacao numa sequência lógica
export type StatusGeral = "nao_enviado" | "enviado" | "aguardando_aprovacao" | "aprovado" | "reprovado";

export function getStatusGeral(statusErp: string, statusAprovacao: string): StatusGeral {
  if (statusAprovacao === "Reprovado" || statusErp === "ReprovadoGestor" || statusErp === "ReprovadoERPAtualizado") return "reprovado";
  if (statusAprovacao === "AprovadoGestor" || statusErp === "AprovadoGestor" || statusErp === "AprovadoGestorERPAtualizado") return "aprovado";
  if (statusErp === "EnviadoAguardandoGestor") return "aguardando_aprovacao";
  return "nao_enviado";
}

export const statusGeralConfig: Record<StatusGeral, { label: string; color: string; dot: string }> = {
  nao_enviado:         { label: "Não enviado",        color: "bg-destructive/10 text-destructive border border-destructive/20",  dot: "bg-destructive" },
  enviado:             { label: "Enviado",             color: "bg-primary/10 text-primary border border-primary/20",              dot: "bg-primary" },
  aguardando_aprovacao:{ label: "Aguardando Aprovação",color: "bg-warning/10 text-warning border border-warning/20",              dot: "bg-warning" },
  aprovado:            { label: "Aprovado",            color: "bg-success/10 text-success border border-success/20",              dot: "bg-success" },
  reprovado:           { label: "Reprovado",           color: "bg-destructive/10 text-destructive border border-destructive/20",  dot: "bg-destructive" },
};

export const erpStatusLabel: Record<ERPStatus, string> = {
  Rascunho: "Não enviado",
  EnviadoAguardandoGestor: "Aguardando Gestor",
  ErroEnvioERP: "Erro ao Enviar ERP",
  AprovadoGestor: "Aprovado pelo Gestor",
  AprovadoGestorERPAtualizado: "Aprovado - ERP Atualizado",
  ReprovadoGestor: "Reprovado pelo Gestor",
  ReprovadoERPAtualizado: "Reprovado - ERP Atualizado",
  ErroAtualizarERP: "Erro ao Atualizar ERP",
};

export const erpStatusColor: Record<ERPStatus, string> = {
  Rascunho: "bg-destructive/15 text-destructive",
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

export const pagamentoTipoConfig: Record<string, { label: string; color: string }> = {
  cartao:   { label: "Cartão",           color: "bg-primary/10 text-primary border border-primary/20" },
  dinheiro: { label: "Dinheiro",         color: "bg-success/10 text-success border border-success/20" },
  faturado: { label: "Faturado",         color: "bg-accent/10 text-accent border border-accent/20" },
  boleto:   { label: "Boleto",           color: "bg-warning/10 text-warning border border-warning/20" },
};
