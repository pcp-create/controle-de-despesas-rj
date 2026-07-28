"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { formatCurrency, formatDate } from "@/lib/helpers";
import { uploadComprovante } from "@/lib/supabase/storage";
import DespesaExpandida from "@/components/despesas/DespesaExpandida";
import {
  Search,
  Filter,
  ChevronDown,
  Banknote,
  CheckCircle,
  Clock,
  RotateCcw,
  Layers,
  X,
  Paperclip,
  Loader2,
} from "lucide-react";

// ─── Configs de status ────────────────────────────────────────────────────────
const statusConfig = {
  aguardando_aprovacao: {
    label: "Ag. Aprovação Financeiro",
    color: "bg-warning/10 text-warning",
    dot: "bg-warning",
  },
  aguardando_lancamento: {
    label: "Ag. Lançamento",
    color: "bg-accent/10 text-accent",
    dot: "bg-accent",
  },
  enviado_pagamento: {
    label: "Enviado para Pagamento",
    color: "bg-success/10 text-success",
    dot: "bg-success",
  },
} as const;

type StatusKey = keyof typeof statusConfig;

// ─── Modal de Aprovação Financeiro ────────────────────────────────────────────
interface ModalAprovacaoProps {
  despesaId: string;
  onClose: () => void;
  onConfirmar: (obs: string, anexoUrl: string | null, anexoNome: string | null) => Promise<void>;
}

function ModalAprovacaoFinanceiro({ despesaId: _, onClose, onConfirmar }: ModalAprovacaoProps) {
  const [obs, setObs] = useState("");
  const [anexo, setAnexo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useAppStore();

  const handleConfirmar = async () => {
    setUploading(true);
    setErro(null);
    let anexoUrl: string | null = null;
    let anexoNome: string | null = null;

    if (anexo && currentUser?.id) {
      const result = await uploadComprovante(currentUser.id, anexo);
      if ("error" in result) {
        setErro(result.error);
        setUploading(false);
        return;
      }
      anexoUrl = result.url;
      anexoNome = result.nome;
    }

    await onConfirmar(obs.trim(), anexoUrl, anexoNome);
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Aprovar Financeiro</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Observação e evidência são opcionais</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Observação */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Observação
            </label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Adicione uma observação (opcional)..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Anexo */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Evidência (anexo)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={(e) => setAnexo(e.target.files?.[0] ?? null)}
            />
            {anexo ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-input bg-muted/30 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="truncate text-foreground">{anexo.name}</span>
                </div>
                <button
                  onClick={() => { setAnexo(null); if (fileRef.current) fileRef.current.value = ""; }}
                  className="shrink-0 text-muted-foreground hover:text-destructive transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input hover:border-primary/40 hover:bg-primary/5 text-sm text-muted-foreground transition"
              >
                <Paperclip className="w-4 h-4" />
                Anexar evidência (imagem ou PDF)
              </button>
            )}
          </div>

          {erro && (
            <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={uploading}
            className="px-4 py-2 rounded-lg border border-input text-sm hover:bg-muted transition disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirmar}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Confirmar Aprovação
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ReembolsoPage() {
  const { currentUser } = useAppStore();
  const { despesas, isLoading, aprovarFinanceiro, processarReembolso, estornarReembolso } = useDespesas(
    undefined,
    currentUser?.perfil
  );
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "pendentes" | StatusKey>("pendentes");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [modalAprovacaoId, setModalAprovacaoId] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState<string | null>(null);

  // Garante que as colunas de observação/anexo existam no banco
  useEffect(() => {
    fetch("/api/setup-financeiro-cols")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsMigration) setNeedsMigration(data.sql);
      })
      .catch(() => null);
  }, []);

  // ── Despesas filtradas ──────────────────────────────────────────────────────
  const despesasReembolso = useMemo(() => {
    return despesas
      .filter((d) => d.pagamento_tipo === "dinheiro" && d.status_aprovacao === "AprovadoGestor")
      .filter((d) => {
        if (filterStatus === "pendentes") return !d.reembolso_processado;
        if (filterStatus === "aguardando_aprovacao") return !d.aprovado_financeiro && !d.reembolso_processado;
        if (filterStatus === "aguardando_lancamento") return d.aprovado_financeiro && !d.reembolso_processado;
        if (filterStatus === "enviado_pagamento") return d.reembolso_processado;
        return true;
      })
      .filter((d) => {
        if (!search) return true;
        const term = search.toLowerCase();
        const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
        const tecnico = profiles.find((p) => p.id === d.tecnico_id);
        return (
          d.cliente.toLowerCase().includes(term) ||
          d.numero_os.toLowerCase().includes(term) ||
          (tipo?.nome || "").toLowerCase().includes(term) ||
          (tecnico?.nome || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        if (a.reembolso_processado !== b.reembolso_processado) return a.reembolso_processado ? 1 : -1;
        return new Date(a.data_vencimento || a.created_at).getTime() -
          new Date(b.data_vencimento || b.created_at).getTime();
      });
  }, [despesas, filterStatus, search, tiposDespesa, profiles]);

  // ── Totais ──────────────────────────────────────────────────────────────────
  const totalPendente = despesas.filter(
    (d) => d.pagamento_tipo === "dinheiro" && d.status_aprovacao === "AprovadoGestor" && !d.reembolso_processado
  ).length;
  const valorTotalPendente = despesas
    .filter((d) => d.pagamento_tipo === "dinheiro" && d.status_aprovacao === "AprovadoGestor" && !d.reembolso_processado)
    .reduce((acc, d) => acc + Number(d.valor), 0);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleAprovarFinanceiro = async (
    id: string,
    obs: string,
    anexoUrl: string | null,
    anexoNome: string | null
  ) => {
    if (!currentUser?.id) return;
    setLoadingId(id);
    const result = await aprovarFinanceiro(id, currentUser.id, {
      observacao: obs,
      anexoUrl: anexoUrl ?? undefined,
      anexoNome: anexoNome ?? undefined,
    });
    setModalAprovacaoId(null);
    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: "Reembolso aprovado pelo financeiro!" });
      setTimeout(() => setFeedback(null), 3000);
    }
    setLoadingId(null);
  };

  const handleProcessar = async (id: string) => {
    if (!currentUser?.id) return;
    setLoadingId(id);
    const result = await processarReembolso(id, currentUser.id);
    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: "Reembolso marcado como processado!" });
      setTimeout(() => setFeedback(null), 3000);
    }
    setLoadingId(null);
  };

  const handleEstornar = async (id: string) => {
    setLoadingId(id);
    const result = await estornarReembolso(id);
    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: "Reembolso revertido para pendente." });
      setTimeout(() => setFeedback(null), 3000);
    }
    setLoadingId(null);
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Banner de migration: colunas de observação/anexo ainda não criadas */}
      {needsMigration && (
        <div className="mb-4 p-4 rounded-xl bg-warning/10 border border-warning/30 text-sm text-warning-foreground">
          <p className="font-semibold mb-1">Ação necessária no banco de dados</p>
          <p className="text-xs text-muted-foreground mb-2">
            Execute o SQL abaixo no Supabase (SQL Editor) para habilitar observação e anexo na aprovação financeira:
          </p>
          <pre className="bg-muted rounded-lg p-3 text-xs font-mono text-foreground whitespace-pre-wrap break-all">
            {needsMigration}
          </pre>
        </div>
      )}

      {/* Modal de aprovação financeiro */}
      {modalAprovacaoId && (
        <ModalAprovacaoFinanceiro
          despesaId={modalAprovacaoId}
          onClose={() => setModalAprovacaoId(null)}
          onConfirmar={async (obs, anexoUrl, anexoNome) =>
            handleAprovarFinanceiro(modalAprovacaoId, obs, anexoUrl, anexoNome)
          }
        />
      )}

      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Reembolso</h1>
            <p className="text-sm text-muted-foreground">
              Despesas pagas em dinheiro aguardando reembolso ao colaborador
            </p>
          </div>
          {totalPendente > 0 && (
            <div className="flex gap-3 shrink-0">
              <div className="flex flex-col items-center justify-center px-4 py-2.5 rounded-xl bg-warning/10 border border-warning/20 text-center min-w-[100px]">
                <span className="text-lg font-bold text-warning">{totalPendente}</span>
                <span className="text-xs text-warning/80">pendente{totalPendente !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex flex-col items-center justify-center px-4 py-2.5 rounded-xl bg-warning/10 border border-warning/20 text-center min-w-[110px]">
                <span className="text-lg font-bold text-warning">{formatCurrency(valorTotalPendente)}</span>
                <span className="text-xs text-warning/80">a reembolsar</span>
              </div>
            </div>
          )}
        </div>

        {/* Feedback */}
        {feedback && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              feedback.type === "success"
                ? "bg-success/10 border border-success/20 text-success"
                : "bg-destructive/10 border border-destructive/20 text-destructive"
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por colaborador, cliente, OS ou tipo..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            >
              <option value="pendentes">Pendentes</option>
              <option value="aguardando_aprovacao">Ag. Aprovação Financeiro</option>
              <option value="aguardando_lancamento">Ag. Lançamento</option>
              <option value="enviado_pagamento">Enviado para Pagamento</option>
              <option value="todos">Todos</option>
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {/* Lista */}
        {despesasReembolso.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Banknote className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">
              {filterStatus === "pendentes"
                ? "Nenhum reembolso pendente"
                : filterStatus === "aguardando_aprovacao"
                ? "Nenhum reembolso aguardando aprovação"
                : filterStatus === "aguardando_lancamento"
                ? "Nenhum reembolso aguardando lançamento"
                : filterStatus === "enviado_pagamento"
                ? "Nenhum reembolso enviado para pagamento"
                : "Nenhum reembolso encontrado"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              Despesas pagas em dinheiro aparecerão aqui
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {despesasReembolso.map((d) => {
              const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
              const tecnico = profiles.find((p) => p.id === d.tecnico_id);
              const statusKey: StatusKey = d.reembolso_processado
                ? "enviado_pagamento"
                : d.aprovado_financeiro
                ? "aguardando_lancamento"
                : "aguardando_aprovacao";
              const status = statusConfig[statusKey];
              const isExpanded = expandedId === d.id;
              const isItemLoading = loadingId === d.id;

              return (
                <div
                  key={d.id}
                  className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
                >
                  {/* Header do card — clicável para expandir */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : d.id)}
                    className="w-full p-4 flex items-center gap-3 text-left"
                  >
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-success/10 text-success flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                      {tecnico?.nome?.[0] ?? "?"}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Linha 1: tipo + valor */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-semibold text-foreground truncate">
                            {tipo?.nome || "Despesa"}
                          </span>
                          {d.parcelado && d.numero_parcelas > 1 && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                              <Layers className="w-3 h-3" />
                              {d.parcela_atual}/{d.numero_parcelas}
                            </span>
                          )}
                        </div>
                        <span className="text-base font-bold text-foreground shrink-0">
                          {formatCurrency(Number(d.valor))}
                        </span>
                      </div>

                      {/* Linha 2: colaborador • cliente • OS • data */}
                      <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
                        <span className="font-medium text-foreground/70">{tecnico?.nome ?? "-"}</span>
                        {d.cliente && <><span>•</span><span>{d.cliente}</span></>}
                        {d.numero_os && <><span>•</span><span>{d.numero_os}</span></>}
                        <span>•</span>
                        <span>{formatDate(d.data_despesa)}</span>
                      </div>

                      {/* Linha 3: status + vencimento */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          {status.label}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Banknote className="w-3.5 h-3.5" />
                          Dinheiro
                        </span>
                        {d.data_vencimento && (
                          <span className="text-xs text-muted-foreground">
                            Vence:{" "}
                            <strong className="text-foreground">
                              {new Date(d.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronDown
                      className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${
                        isExpanded ? "rotate-180" : ""
                      }`}
                    />
                  </button>

                  {/* Detalhes expandidos — usa DespesaExpandida */}
                  {isExpanded && (
                    <DespesaExpandida
                      d={d}
                      parcelas={[d]}
                      parcelado={false}
                      numeroParcelas={1}
                      profiles={profiles}
                      acoes={
                        <>
                          {d.reembolso_processado ? (
                            <button
                              onClick={() => handleEstornar(d.id)}
                              disabled={isItemLoading}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-muted-foreground text-sm hover:bg-muted disabled:opacity-60 transition"
                            >
                              <RotateCcw className="w-4 h-4" />
                              {isItemLoading ? "Revertendo..." : "Reverter"}
                            </button>
                          ) : (
                            <>
                              {!d.aprovado_financeiro && (
                                <button
                                  onClick={() => setModalAprovacaoId(d.id)}
                                  disabled={isItemLoading}
                                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                  Aprovado Financeiro
                                </button>
                              )}
                              {d.aprovado_financeiro && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success text-sm font-medium border border-success/20">
                                  <CheckCircle className="w-4 h-4" />
                                  Financeiro Aprovado
                                </div>
                              )}
                              <button
                                onClick={() => handleProcessar(d.id)}
                                disabled={isItemLoading || !d.aprovado_financeiro}
                                title={!d.aprovado_financeiro ? "Aguardando aprovação do financeiro" : undefined}
                                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                              >
                                <Banknote className="w-4 h-4" />
                                {isItemLoading ? "Processando..." : "Lançar Reembolso"}
                              </button>
                            </>
                          )}

                          {/* Banner de status */}
                          {d.reembolso_processado ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
                              <CheckCircle className="w-4 h-4 shrink-0" />
                              <span className="font-medium">Enviado para Pagamento</span>
                            </div>
                          ) : !d.aprovado_financeiro ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
                              <Clock className="w-4 h-4 shrink-0" />
                              <span className="font-medium">Aguardando Aprovação do Financeiro</span>
                            </div>
                          ) : null}
                        </>
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
