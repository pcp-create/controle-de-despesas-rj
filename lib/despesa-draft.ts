// Persistência local (rascunho) do formulário de "Nova Despesa".
//
// Objetivo: se o usuário começar a preencher uma despesa e navegar para outra
// tela (ou recarregar a página) antes de salvar, os dados digitados não se
// perdem — ao voltar para "Nova Despesa" o formulário é restaurado.
//
// Escopo: apenas o formulário de CRIAÇÃO (não se aplica à edição de despesas
// existentes). Nunca persiste o arquivo do comprovante em si (File/base64) —
// apenas a referência (nome/url/path) de um upload já concluído no Storage.

const DRAFT_VERSION = 1;

export interface DespesaDraftData {
  form: {
    tipoDespesaId: string;
    cartaoId: string;
    cliente: string;
    numeroOS: string;
    valor: string;
    documento: string;
    observacao: string;
    dataDespesa: string;
    horaDespesa: string;
    dataCheckin: string;
    dataCheckout: string;
    frotaId: string;
    kmAtual: string;
    litrosAbastecidos: string;
    valorLitro: string;
    tipoCombustivel: string;
  };
  pagamentoTipo: "cartao" | "dinheiro" | "faturado" | "boleto";
  parcelado: boolean;
  numeroParcelas: number;
  // Apenas a referência de um comprovante já enviado ao Storage — nunca o arquivo.
  comprovante: { nome: string; url: string; path?: string } | null;
}

interface DraftEnvelope {
  version: number;
  updatedAt: string;
  data: DespesaDraftData;
}

function draftKey(userId: string): string {
  return `despesa_draft_${userId}`;
}

export function salvarRascunhoDespesa(userId: string, data: DespesaDraftData): void {
  if (!userId || typeof window === "undefined") return;
  try {
    const envelope: DraftEnvelope = { version: DRAFT_VERSION, updatedAt: new Date().toISOString(), data };
    window.localStorage.setItem(draftKey(userId), JSON.stringify(envelope));
  } catch {
    // Armazenamento indisponível ou cheio — falha silenciosa, não é crítico.
  }
}

export function carregarRascunhoDespesa(userId: string): DespesaDraftData | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const envelope = JSON.parse(raw) as DraftEnvelope;
    if (!envelope || envelope.version !== DRAFT_VERSION || !envelope.data) return null;
    return envelope.data;
  } catch {
    return null;
  }
}

export function limparRascunhoDespesa(userId: string): void {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(draftKey(userId));
  } catch {
    // Falha silenciosa.
  }
}

// Um rascunho é considerado "vazio" quando nenhum campo relevante foi
// preenchido — usado para evitar salvar/restaurar rascunhos inúteis.
export function rascunhoEstaVazio(data: DespesaDraftData): boolean {
  const f = data.form;
  return (
    !f.tipoDespesaId &&
    !f.cartaoId &&
    !f.cliente &&
    !f.numeroOS &&
    !f.valor &&
    !f.documento &&
    !f.observacao &&
    !f.dataCheckin &&
    !f.dataCheckout &&
    !f.kmAtual &&
    !f.litrosAbastecidos &&
    !f.valorLitro &&
    !f.tipoCombustivel &&
    !data.comprovante
  );
}
