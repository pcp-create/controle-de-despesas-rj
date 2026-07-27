"use client";

import React, { useState } from "react";
import { useDespesas, useTiposDespesa } from "@/lib/supabase/hooks";
import { useAuth } from "@/lib/supabase/auth-context";
import { useAppStore } from "@/lib/store";
import { formatCurrency, pagamentoTipoConfig } from "@/lib/helpers";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  Search,
  Filter,
  ChevronDown,
} from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  // erp_status (novos)
  pendente:    { label: "Pendente",    color: "bg-muted text-muted-foreground",           icon: Clock },
  processando: { label: "Processando", color: "bg-warning/10 text-warning",               icon: RefreshCw },
  integrado:   { label: "Integrado",   color: "bg-success/10 text-success",               icon: CheckCircle },
  erro:        { label: "Erro",        color: "bg-destructive/10 text-destructive",        icon: AlertTriangle },
  // status_erp (legado — mantidos para retrocompatibilidade)
  Rascunho:                    { label: "Rascunho",        color: "bg-muted text-muted-foreground",    icon: Clock },
  NaoEnviadoERP:               { label: "Não Enviado",     color: "bg-muted/50 text-muted-foreground", icon: Clock },
  EnviadoAguardandoGestor:     { label: "Enviado",         color: "bg-primary/10 text-primary",        icon: Send },
  AprovadoGestorERPAtualizado: { label: "Integrado",       color: "bg-success/10 text-success",        icon: CheckCircle },
  ErroEnvioERP:                { label: "Erro Envio",      color: "bg-destructive/10 text-destructive",icon: AlertTriangle },
  ErroAtualizarERP:            { label: "Erro ERP",        color: "bg-destructive/10 text-destructive",icon: AlertTriangle },
};

export default function IntegracoesERPPageSupabase() {
  const { despesas, isLoading, tentarNovamenteERP } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  const { user: authUser } = useAuth();
  const { currentUser } = useAppStore();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Status helpers:
  // "pendente"   → lançado no sistema, ainda não enviado ao ERP
  // "lancado"    → lançado no sistema (pendente ou com erro — aguardando reenvio)
  // "integrado"  → enviado e confirmado no ERP M8

  const isPendente   = (d: typeof despesas[0]) => d.lancado_sistema && d.erp_status === "pendente";
  const isLancado    = (d: typeof despesas[0]) => d.lancado_sistema && (d.erp_status === "pendente" || d.erp_status === "erro" || d.erp_status === "processando");
  const isIntegrado  = (d: typeof despesas[0]) => d.erp_status === "integrado";

  const despesasErp = despesas
    .filter((d) => d.lancado_sistema || d.erp_status !== "pendente")
    .filter((d) => {
      if (filterStatus === "pendente")  return isPendente(d);
      if (filterStatus === "lancado")   return isLancado(d);
      if (filterStatus === "integrado") return isIntegrado(d);
      if (search) {
        const term = search.toLowerCase();
        const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
        return (
          d.cliente.toLowerCase().includes(term) ||
          (d.numero_os || "").toLowerCase().includes(term) ||
          (tipo?.nome || "").toLowerCase().includes(term) ||
          (d.erp_id || "").toLowerCase().includes(term)
        );
      }
      return true;
    })
    .filter((d) => {
      if (!search) return true;
      const term = search.toLowerCase();
      const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
      return (
        d.cliente.toLowerCase().includes(term) ||
        (d.numero_os || "").toLowerCase().includes(term) ||
        (tipo?.nome || "").toLowerCase().includes(term) ||
        (d.erp_id || "").toLowerCase().includes(term)
      );
    })
    .sort((a, b) => new Date(b.lancado_erp_em || b.lancado_sistema_em || b.created_at).getTime() - new Date(a.lancado_erp_em || a.lancado_sistema_em || a.created_at).getTime());

  const qtdPendente  = despesas.filter(isPendente).length;
  const qtdLancado   = despesas.filter(isLancado).length;
  const qtdIntegrado = despesas.filter(isIntegrado).length;

  const handleRetry = async (id: string) => {
    const userId = authUser?.id ?? currentUser?.id;
    if (!userId) return;
    setRetrying(id);
    const result = await tentarNovamenteERP(id, userId);
    if (result?.error) {
      setFeedback({ type: "error", msg: `Erro: ${result.error}` });
    } else {
      setFeedback({ type: "success", msg: "Integração enviada com sucesso!" });
      setTimeout(() => setFeedback(null), 4000);
    }
    setRetrying(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Integrações ERP</h1>
        <p className="text-sm text-muted-foreground">Status de integração das despesas com o ERP</p>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          feedback.type === "success" 
            ? "bg-success/10 border border-success/20 text-success"
            : "bg-destructive/10 border border-destructive/20 text-destructive"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Cards de status */}
      <div className="grid grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === "pendente" ? "todos" : "pendente")}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition ${filterStatus === "pendente" ? "border-warning ring-1 ring-warning/30" : "border-border hover:border-warning/40"}`}
        >
          <div className="w-9 h-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center mb-2">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{qtdPendente}</p>
          <p className="text-xs text-muted-foreground">Pendente</p>
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === "lancado" ? "todos" : "lancado")}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition ${filterStatus === "lancado" ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/40"}`}
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
            <Send className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{qtdLancado}</p>
          <p className="text-xs text-muted-foreground">Lançado</p>
        </button>
        <button
          type="button"
          onClick={() => setFilterStatus(filterStatus === "integrado" ? "todos" : "integrado")}
          className={`bg-white rounded-xl border shadow-sm p-4 text-left transition ${filterStatus === "integrado" ? "border-success ring-1 ring-success/30" : "border-border hover:border-success/40"}`}
        >
          <div className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center mb-2">
            <CheckCircle className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{qtdIntegrado}</p>
          <p className="text-xs text-muted-foreground">Enviado ERP</p>
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, OS, ERP ID..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm appearance-none"
          >
            <option value="todos">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="lancado">Lançado</option>
            <option value="integrado">Enviado ERP</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Despesa</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Pagamento</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">ERP ID</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Data Envio</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Valor</th>
                <th className="text-right px-4 py-2 font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {despesasErp.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
                const erpStatusKey = d.erp_status || "pendente";
                const status = statusConfig[erpStatusKey] ?? { label: erpStatusKey, color: "bg-muted text-muted-foreground", icon: Clock };
                const StatusIcon = status.icon;
                const isError = erpStatusKey === "erro";
                const isProcessing = erpStatusKey === "processando";
                const integradoEm = d.lancado_erp_em || d.lancado_sistema_em;

                return (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{tipo?.nome || "Despesa"}</p>
                      <p className="text-xs text-muted-foreground">{d.cliente} • {d.numero_os}</p>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const pc = pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"];
                        return pc ? (
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${pc.color}`}>
                            {pc.label}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs">{d.erp_id || "-"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${status.color}`}>
                          <StatusIcon className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />
                          {status.label}
                          {isError && d.erp_etapa_erro ? ` — Etapa ${d.erp_etapa_erro}` : ""}
                        </span>
                        {isError && d.erp_erro && (
                          <span className="text-[10px] text-destructive/70 max-w-[180px] truncate" title={d.erp_erro}>
                            {d.erp_erro}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {integradoEm ? new Date(integradoEm).toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(Number(d.valor))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {(isError || (!d.lancado_erp && d.lancado_sistema)) && (
                        <button
                          onClick={() => handleRetry(d.id)}
                          disabled={retrying === d.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-input hover:bg-muted transition disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${retrying === d.id ? "animate-spin" : ""}`} />
                          {isError ? "Tentar novamente" : "Enviar ao ERP"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {despesasErp.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhuma despesa encontrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
