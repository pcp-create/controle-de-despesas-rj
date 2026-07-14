"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { formatCurrency, formatDate } from "@/lib/helpers";
import {
  Search,
  Filter,
  ChevronDown,
  Banknote,
  CheckCircle,
  Clock,
  Eye,
  RotateCcw,
} from "lucide-react";

const statusReembolsoConfig = {
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
};

export default function ReembolsoPage() {
  const { currentUser } = useAppStore();
  const { despesas, isLoading, aprovarFinanceiro, processarReembolso, estornarReembolso } = useDespesas(
    undefined,
    currentUser?.perfil
  );
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "aguardando_aprovacao" | "aguardando_lancamento" | "enviado_pagamento">("aguardando_aprovacao");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Filtra somente despesas em dinheiro aprovadas pelo gestor
  const despesasReembolso = useMemo(() => {
    return despesas
      .filter((d) => d.pagamento_tipo === "dinheiro")
      .filter((d) => d.status_aprovacao === "AprovadoGestor")
      .filter((d) => {
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
        // Pendentes primeiro, depois por data de vencimento
        if (a.reembolso_processado !== b.reembolso_processado) {
          return a.reembolso_processado ? 1 : -1;
        }
        return new Date(a.data_vencimento || a.created_at).getTime() -
          new Date(b.data_vencimento || b.created_at).getTime();
      });
  }, [despesas, filterStatus, search, tiposDespesa, profiles]);

  const totalPendente = despesas.filter(
    (d) => d.pagamento_tipo === "dinheiro" && d.status_aprovacao === "AprovadoGestor" && !d.reembolso_processado
  ).length;

  const valorTotalPendente = despesas
    .filter(
      (d) => d.pagamento_tipo === "dinheiro" && d.status_aprovacao === "AprovadoGestor" && !d.reembolso_processado
    )
    .reduce((acc, d) => acc + Number(d.valor), 0);

  const handleAprovarFinanceiro = async (id: string) => {
    if (!currentUser?.id) return;
    setLoadingId(id);
    const result = await aprovarFinanceiro(id, currentUser.id);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Reembolso</h1>
          <p className="text-sm text-muted-foreground">
            Despesas pagas em dinheiro aguardando reembolso ao colaborador
          </p>
        </div>

        {/* Cards de resumo */}
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
            {filterStatus === "aguardando_aprovacao"
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
            const processadoPor = profiles.find((p) => p.id === d.reembolso_processado_por);
            const statusKey = d.reembolso_processado
              ? "enviado_pagamento"
              : d.aprovado_financeiro
              ? "aguardando_lancamento"
              : "aguardando_aprovacao";
            const status = statusReembolsoConfig[statusKey];
            const isExpanded = expandedId === d.id;
            const isLoading = loadingId === d.id;

            return (
              <div
                key={d.id}
                className="bg-white rounded-xl border border-border shadow-sm overflow-hidden"
              >
                {/* Header do card */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  {/* Avatar do colaborador */}
                  <div className="w-9 h-9 rounded-full bg-success/10 text-success flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                    {tecnico?.nome?.[0] ?? "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Linha 1: tipo + valor */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{tipo?.nome || "Despesa"}</span>
                      <span className="text-base font-bold text-foreground shrink-0">
                        {formatCurrency(Number(d.valor))}
                      </span>
                    </div>
                    {/* Linha 2: colaborador • cliente • OS • data */}
                    <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground/70">{tecnico?.nome ?? "-"}</span>
                      <span>•</span>
                      <span>{d.cliente || "-"}</span>
                      {d.numero_os && (
                        <>
                          <span>•</span>
                          <span>{d.numero_os}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatDate(d.data_despesa)}</span>
                    </div>
                    {/* Linha 3: status */}
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

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
                    {/* Grid de informações */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                          Colaborador
                        </p>
                        <p className="text-foreground font-medium">{tecnico?.nome ?? "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                          Data da Despesa
                        </p>
                        <p className="text-foreground">
                          {formatDate(d.data_despesa)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                          Documento
                        </p>
                        <p className="text-foreground">{d.documento || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                          Comprovante
                        </p>
                        <p className="text-foreground">{d.comprovante_nome || "Não anexado"}</p>
                      </div>
                      {d.data_envio && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                            Enviado em
                          </p>
                          <p className="text-foreground">
                            {new Date(d.data_envio).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                      {d.data_aprovacao && d.status_aprovacao === "AprovadoGestor" && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                            Aprovado em
                          </p>
                          <p className="text-success font-medium">
                            {new Date(d.data_aprovacao).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      )}
                      {d.observacao && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                            Observação
                          </p>
                          <p className="text-foreground">{d.observacao}</p>
                        </div>
                      )}

                      {/* Info de processamento */}
                      {d.reembolso_processado && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                              Processado em
                            </p>
                            <p className="text-success font-medium">
                              {d.reembolso_processado_em
                                ? new Date(d.reembolso_processado_em).toLocaleString("pt-BR")
                                : "-"}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">
                              Processado por
                            </p>
                            <p className="text-success font-medium">
                              {processadoPor?.nome ?? d.reembolso_processado_por ?? "-"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Status banner */}
                    {d.reembolso_processado ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20 text-success text-sm">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span className="font-medium">Enviado para Pagamento</span>
                      </div>
                    ) : d.aprovado_financeiro ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm">
                        <CheckCircle className="w-4 h-4 shrink-0" />
                        <span className="font-medium">Aprovado pelo Financeiro — Aguardando Lançamento</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20 text-warning text-sm">
                        <Clock className="w-4 h-4 shrink-0" />
                        <span className="font-medium">Aguardando Aprovação do Financeiro</span>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex flex-wrap gap-2">
                      {d.comprovante_url && (
                        <button
                          onClick={() => window.open(d.comprovante_url!, "_blank")}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition"
                        >
                          <Eye className="w-4 h-4" />
                          Ver Comprovante
                        </button>
                      )}

                      {d.reembolso_processado ? (
                        <button
                          onClick={() => handleEstornar(d.id)}
                          disabled={isLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-muted-foreground text-sm hover:bg-muted disabled:opacity-60 transition"
                        >
                          <RotateCcw className="w-4 h-4" />
                          {isLoading ? "Revertendo..." : "Reverter"}
                        </button>
                      ) : (
                        <>
                          {!d.aprovado_financeiro && (
                            <button
                              onClick={() => handleAprovarFinanceiro(d.id)}
                              disabled={isLoading}
                              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 transition"
                            >
                              <CheckCircle className="w-4 h-4" />
                              {isLoading ? "Aprovando..." : "Aprovado Financeiro"}
                            </button>
                          )}
                          <button
                            onClick={() => handleProcessar(d.id)}
                            disabled={isLoading || !d.aprovado_financeiro}
                            title={!d.aprovado_financeiro ? "Aguardando aprovação do financeiro" : undefined}
                            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-success text-white text-sm font-medium hover:bg-success/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            <Banknote className="w-4 h-4" />
                            {isLoading ? "Processando..." : "Lançar Reembolso"}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
