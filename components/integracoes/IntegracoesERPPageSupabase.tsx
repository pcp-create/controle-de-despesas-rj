"use client";

import React, { useState } from "react";
import { useDespesas, useTiposDespesa } from "@/lib/supabase/hooks";
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
  Rascunho: { label: "Rascunho", color: "bg-muted text-muted-foreground", icon: Clock },
  NaoEnviadoERP: { label: "Não Enviado", color: "bg-muted/50 text-muted-foreground", icon: Clock },
  EnviadoAguardandoGestor: { label: "Enviado", color: "bg-primary/10 text-primary", icon: Send },
  AprovadoGestorERPAtualizado: { label: "Integrado", color: "bg-success/10 text-success", icon: CheckCircle },
  ErroEnvioERP: { label: "Erro Envio", color: "bg-destructive/10 text-destructive", icon: AlertTriangle },
  ErroAtualizarERP: { label: "Erro ERP", color: "bg-destructive/10 text-destructive", icon: AlertTriangle },
};

export default function IntegracoesERPPageSupabase() {
  const { despesas, isLoading, enviarDespesa } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  // Despesas com status de ERP relevante
  const despesasErp = despesas
    .filter((d) => d.status_erp !== "Rascunho")
    .filter((d) => {
      if (filterStatus !== "todos" && d.status_erp !== filterStatus) return false;
      if (search) {
        const term = search.toLowerCase();
        const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
        return (
          d.cliente.toLowerCase().includes(term) ||
          d.numero_os.toLowerCase().includes(term) ||
          (tipo?.nome || "").toLowerCase().includes(term) ||
          (d.erp_id || "").toLowerCase().includes(term)
        );
      }
      return true;
    })
    .sort((a, b) => new Date(b.data_envio || b.created_at).getTime() - new Date(a.data_envio || a.created_at).getTime());

  const erros = despesas.filter((d) => d.status_erp === "ErroEnvioERP" || d.status_erp === "ErroAtualizarERP").length;
  const enviados = despesas.filter((d) => d.status_erp === "EnviadoAguardandoGestor").length;
  const integrados = despesas.filter((d) => d.status_erp === "AprovadoGestorERPAtualizado").length;

  const handleRetry = async (id: string) => {
    setRetrying(id);
    const result = await enviarDespesa(id);
    if (!result.ok) {
      setFeedback({ type: "error", msg: result.msg });
    } else {
      setFeedback({ type: "success", msg: "Reenvio realizado!" });
      setTimeout(() => setFeedback(null), 3000);
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
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-2">
            <Send className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{enviados}</p>
          <p className="text-xs text-muted-foreground">Enviados</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center mb-2">
            <CheckCircle className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{integrados}</p>
          <p className="text-xs text-muted-foreground">Integrados</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center mb-2">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{erros}</p>
          <p className="text-xs text-muted-foreground">Com Erro</p>
        </div>
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
            <option value="EnviadoAguardandoGestor">Enviados</option>
            <option value="AprovadoGestorERPAtualizado">Integrados</option>
            <option value="ErroEnvioERP">Erro Envio</option>
            <option value="ErroAtualizarERP">Erro ERP</option>
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
                const status = statusConfig[d.status_erp] ?? { label: d.status_erp ?? "—", color: "bg-muted text-muted-foreground", icon: Clock };
                const StatusIcon = status.icon;
                const isError = d.status_erp === "ErroEnvioERP" || d.status_erp === "ErroAtualizarERP";

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
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${status.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {d.data_envio ? new Date(d.data_envio).toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(Number(d.valor))}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isError && (
                        <button
                          onClick={() => handleRetry(d.id)}
                          disabled={retrying === d.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-input hover:bg-muted transition disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${retrying === d.id ? "animate-spin" : ""}`} />
                          Reenviar
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
