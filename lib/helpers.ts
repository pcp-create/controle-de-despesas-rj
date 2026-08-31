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

// ─── Data/hora local (para valores de NEGÓCIO como Data/Hora da Despesa) ────
// NUNCA usar `new Date().toISOString().slice(0, 10)` para obter "a data de hoje":
// toISOString() converte o instante atual para UTC antes de extrair a data, e no
// fuso do Brasil (UTC-3) qualquer horário a partir das 21:00 local já corresponde
// ao dia seguinte em UTC. Isso faz a data "virar" incorretamente.
// Estas funções usam os componentes de data/hora LOCAIS (getFullYear/getMonth/...),
// preservando o dia correto no fuso do usuário.
export function getLocalDateString(date: Date = new Date()): string {
  const ano = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, "0");
  const dia = String(date.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

export function getLocalTimeString(date: Date = new Date()): string {
  const horas = String(date.getHours()).padStart(2, "0");
  const minutos = String(date.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// Status geral unificado — combina status_erp + status_aprovacao numa sequência lógica
export type StatusGeral = "nao_enviado" | "enviado" | "aguardando_aprovacao" | "aprovado" | "reprovado";

export function getStatusGeral(statusErp: string, statusAprovacao: string): StatusGeral {
  if (statusAprovacao === "Reprovado") return "reprovado";
  if (statusAprovacao === "AprovadoGestor") return "aprovado";
  if (statusErp === "EnviadoAguardandoGestor" && statusAprovacao === "AguardandoGestor") return "aguardando_aprovacao";
  if (statusErp === "EnviadoAguardandoGestor") return "enviado";
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

// ─── Regras de bloqueio de envio ao ERP (Financeiro / ERP) ──────────────────
// Faturado, Boleto e documento "Nota Fiscal (NF)" participam normalmente do
// lançamento interno (ação "Lançar"), mas NUNCA podem ser enviados ao ERP M8.
// Esta é a ÚNICA fonte de verdade para essa regra — tabela, cards, filtros,
// ações em lote/individuais e a API de integração (/api/integrar-erp) devem
// sempre consultar estas funções, nunca reimplementar a condição.
export function isDocumentoNotaFiscal(documento: string | null | undefined): boolean {
  const valor = (documento || "").trim();
  if (!valor) return false;
  return /^nf$/i.test(valor) || /nota\s*fiscal/i.test(valor);
}

export function isPagamentoBloqueadoParaERP(pagamentoTipo: string | null | undefined): boolean {
  return pagamentoTipo === "faturado" || pagamentoTipo === "boleto";
}

type DespesaParaBloqueioERP = {
  pagamento_tipo?: string | null;
  documento?: string | null;
};

// Retorna o motivo do bloqueio (para exibir ao usuário) ou null se o envio ao
// ERP é permitido para esta despesa.
export function motivoBloqueioEnvioERP(despesa: DespesaParaBloqueioERP): string | null {
  if (isPagamentoBloqueadoParaERP(despesa.pagamento_tipo)) {
    const label = despesa.pagamento_tipo === "faturado" ? "Faturado" : "Boleto";
    return `Envio ao ERP não disponível para esta forma de pagamento (${label}).`;
  }
  if (isDocumentoNotaFiscal(despesa.documento)) {
    return "Envio ao ERP não disponível para esta forma de pagamento/documento (Nota Fiscal — NF).";
  }
  return null;
}

export function podeEnviarAoERP(despesa: DespesaParaBloqueioERP): boolean {
  return motivoBloqueioEnvioERP(despesa) === null;
}
