// ─── Perfis ───────────────────────────────────────────────────────────────────
export type UserProfile = "tecnico" | "gestor" | "financeiro" | "administrador";

// ─── Status ───────────────────────────────────────────────────────────────────
export type ApprovalStatus =
  | "AguardandoGestor"
  | "AprovadoGestor"
  | "Reprovado";

export type ERPStatus =
  | "Rascunho"
  | "EnviadoAguardandoGestor"
  | "ErroEnvioERP"
  | "AprovadoGestor"
  | "AprovadoGestorERPAtualizado"
  | "ReprovadoGestor"
  | "ReprovadoERPAtualizado"
  | "ErroAtualizarERP";

// ─── Usuário ──────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  usuario: string;
  perfil: UserProfile;
  ativo: boolean;
  gestorId?: string;
  senha: string;
  primeiroAcesso: boolean;
  // ERP
  empresaId?: string;
  fornecedorId?: string;
  pessoaCompraId?: string;
  condicaoPagamentoId?: string;
  operacaoFinanceiraId?: string;
  moedaId?: string;
  especieId?: string;
  contaContabilCreditoId?: string;
  historicoId?: string;
  contaContabilDespesaId?: string;
  historicoDespesaId?: string;
  centroCustoId?: string;
  projetoExecucaoTarefaItemId?: string;
  contaBancariaId?: string;
  unidadeNegocioId?: string;
  projetoExecucaoId?: string;
  lancamentoTipoId?: string;
}

// ─── Cartão ───────────────────────────────────────────────────────────────────
export interface Cartao {
  id: string;
  usuarioId: string;
  nome: string;
  banco: string;
  bandeira: string;
  ultimos4: string;
  contaBancariaId?: string;
  padrao: boolean;
  ativo: boolean;
}

// ─── Tipo de Despesa ──────────────────────────────────────────────────────────
export interface TipoDespesa {
  id: string;
  nome: string;
  ativo: boolean;
  limiteMaximo?: number;
  exigeAprovacaoAcimaLimite: boolean;
  exigeComprovante: boolean;
  contaContabilDespesaId?: string;
  historicoDespesaId?: string;
  centroCustoId?: string;
  tipoDocumentoPadrao?: string;
  observacaoPadrao?: string;
}

// ─── Despesa ─────────────────────────────────────────────────────────────────
export interface Despesa {
  id: string;
  tecnicoId: string;
  dataDespesa: string;
  cliente: string;
  numeroOS: string;
  tipoDespesaId: string;
  valor: number;
  documento?: string;
  cartaoId?: string;
  observacao?: string;
  comprovanteUrl?: string;
  comprovanteNome?: string;
  statusAprovacao: ApprovalStatus;
  statusERP: ERPStatus;
  erpId?: string;
  erpPayload?: string;
  erpResposta?: string;
  gestorAprovadorId?: string;
  dataAprovacao?: string;
  justificativaReprovacao?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ─── Auditoria ────────────────────────────────────────────────────────────────
export interface AuditoriaEntry {
  id: string;
  usuarioId: string;
  acao: string;
  entidade?: string;
  entidadeId?: string;
  detalhes?: string;
  data: string;
}
