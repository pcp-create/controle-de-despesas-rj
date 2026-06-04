"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  ChevronDown,
  ChevronUp,
  Send,
  FileText,
  Server,
  Activity,
} from "lucide-react";
import { formatDateTime, formatCurrency, erpStatusLabel, erpStatusColor } from "@/lib/helpers";
import type { Despesa, ERPStatus } from "@/lib/types";

export default function IntegracoesERPPage() {
  const { despesas, users, tiposDespesa, updateDespesaStatus } = useAppStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "erros" | "pendentes" | "sucesso">("todos");
  const [reenviarLoading, setReenviarLoading] = useState<string | null>(null);

  // Filtra despesas que ja foram enviadas (nao sao rascunho)
  const despesasEnviadas = despesas.filter((d) => d.statusERP !== "Rascunho");

  // Aplica filtro de status
  const filtered = despesasEnviadas.filter((d) => {
    if (filtroStatus === "erros") {
      return d.statusERP === "ErroEnvioERP" || d.statusERP === "ErroAtualizarERP";
    }
    if (filtroStatus === "pendentes") {
      return d.statusERP === "EnviadoAguardandoGestor" || d.statusERP === "AprovadoGestor";
    }
    if (filtroStatus === "sucesso") {
      return d.statusERP === "AprovadoGestorERPAtualizado" || d.statusERP === "ReprovadoERPAtualizado";
    }
    return true;
  }).sort((a, b) => new Date(b.dataAtualizacao).getTime() - new Date(a.dataAtualizacao).getTime());

  // Estatisticas
  const stats = {
    total: despesasEnviadas.length,
    erros: despesasEnviadas.filter((d) => d.statusERP === "ErroEnvioERP" || d.statusERP === "ErroAtualizarERP").length,
    pendentes: despesasEnviadas.filter((d) => d.statusERP === "EnviadoAguardandoGestor" || d.statusERP === "AprovadoGestor").length,
    sucesso: despesasEnviadas.filter((d) => d.statusERP === "AprovadoGestorERPAtualizado" || d.statusERP === "ReprovadoERPAtualizado").length,
  };

  const getTecnico = (id: string) => users.find((u) => u.id === id)?.nome || "-";
  const getTipo = (id: string) => tiposDespesa.find((t) => t.id === id)?.nome || "-";

  const getStatusIcon = (status: ERPStatus) => {
    switch (status) {
      case "ErroEnvioERP":
      case "ErroAtualizarERP":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "EnviadoAguardandoGestor":
      case "AprovadoGestor":
        return <Clock className="w-4 h-4 text-warning" />;
      case "AprovadoGestorERPAtualizado":
      case "ReprovadoERPAtualizado":
        return <CheckCircle2 className="w-4 h-4 text-success" />;
      default:
        return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const handleReenviar = async (despesa: Despesa) => {
    setReenviarLoading(despesa.id);
    
    // Simula reenvio ao ERP
    await new Promise((r) => setTimeout(r, 1500));
    
    // Simula resposta (80% sucesso, 20% erro)
    const sucesso = Math.random() > 0.2;
    
    if (sucesso) {
      updateDespesaStatus(despesa.id, despesa.statusAprovacao, "AprovadoGestorERPAtualizado", {
        erpId: `ERP-${Date.now()}`,
        erpResposta: JSON.stringify({
          success: true,
          id: `ERP-${Date.now()}`,
          message: "Registro atualizado com sucesso no ERP",
          timestamp: new Date().toISOString(),
        }),
      });
    } else {
      updateDespesaStatus(despesa.id, despesa.statusAprovacao, "ErroAtualizarERP", {
        erpResposta: JSON.stringify({
          success: false,
          error: "Timeout ao conectar com o servidor ERP",
          code: "ERP_TIMEOUT",
          timestamp: new Date().toISOString(),
        }),
      });
    }
    
    setReenviarLoading(null);
  };

  const parseErpResponse = (resp?: string) => {
    if (!resp) return null;
    try {
      return JSON.parse(resp);
    } catch {
      return { raw: resp };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Integrações ERP</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitore o status das integrações e visualize erros de sincronização
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Server className="w-5 h-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Servidor ERP:</span>
          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 text-success text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Online
          </span>
        </div>
      </div>

      {/* Cards de estatisticas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <button
          onClick={() => setFiltroStatus("todos")}
          className={`p-4 rounded-xl border transition text-left ${
            filtroStatus === "todos" ? "border-accent bg-accent/5" : "border-border bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase">Total</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
        </button>

        <button
          onClick={() => setFiltroStatus("erros")}
          className={`p-4 rounded-xl border transition text-left ${
            filtroStatus === "erros" ? "border-destructive bg-destructive/5" : "border-border bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-destructive" />
            <span className="text-xs font-medium text-muted-foreground uppercase">Erros</span>
          </div>
          <p className="text-2xl font-bold text-destructive">{stats.erros}</p>
        </button>

        <button
          onClick={() => setFiltroStatus("pendentes")}
          className={`p-4 rounded-xl border transition text-left ${
            filtroStatus === "pendentes" ? "border-warning bg-warning/5" : "border-border bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-warning" />
            <span className="text-xs font-medium text-muted-foreground uppercase">Pendentes</span>
          </div>
          <p className="text-2xl font-bold text-warning">{stats.pendentes}</p>
        </button>

        <button
          onClick={() => setFiltroStatus("sucesso")}
          className={`p-4 rounded-xl border transition text-left ${
            filtroStatus === "sucesso" ? "border-success bg-success/5" : "border-border bg-card hover:border-muted-foreground/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-success" />
            <span className="text-xs font-medium text-muted-foreground uppercase">Sucesso</span>
          </div>
          <p className="text-2xl font-bold text-success">{stats.sucesso}</p>
        </button>
      </div>

      {/* Lista de integrações */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">
            {filtroStatus === "todos" && "Todas as Integrações"}
            {filtroStatus === "erros" && "Integrações com Erro"}
            {filtroStatus === "pendentes" && "Integrações Pendentes"}
            {filtroStatus === "sucesso" && "Integrações Concluídas"}
          </h2>
          <span className="text-sm text-muted-foreground">{filtered.length} registro(s)</span>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Nenhuma integração encontrada</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((d) => {
              const expanded = expandedId === d.id;
              const erpResp = parseErpResponse(d.erpResposta);
              const erpPayload = parseErpResponse(d.erpPayload);
              const isError = d.statusERP === "ErroEnvioERP" || d.statusERP === "ErroAtualizarERP";

              return (
                <div key={d.id} className={`${isError ? "bg-destructive/5" : ""}`}>
                  {/* Linha principal */}
                  <button
                    onClick={() => setExpandedId(expanded ? null : d.id)}
                    className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-muted/30 transition"
                  >
                    <div className="flex-shrink-0">
                      {getStatusIcon(d.statusERP)}
                    </div>

                    <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">OS / Cliente</p>
                        <p className="text-sm font-medium text-foreground truncate">{d.numeroOS} - {d.cliente}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Técnico / Tipo</p>
                        <p className="text-sm text-foreground truncate">{getTecnico(d.tecnicoId)} - {getTipo(d.tipoDespesaId)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Valor</p>
                        <p className="text-sm font-medium text-foreground">{formatCurrency(d.valor)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status ERP</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${erpStatusColor[d.statusERP]}`}>
                          {erpStatusLabel[d.statusERP]}
                        </span>
                      </div>
                    </div>

                    <div className="flex-shrink-0 text-muted-foreground">
                      {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {/* Detalhes expandidos */}
                  {expanded && (
                    <div className="px-5 pb-5 pt-2 bg-muted/20 border-t border-border">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Payload enviado */}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Send className="w-4 h-4 text-accent" />
                            <h4 className="font-medium text-sm text-foreground">Payload Enviado</h4>
                          </div>
                          {erpPayload ? (
                            <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-3 overflow-x-auto max-h-48">
                              {JSON.stringify(erpPayload, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Nenhum payload registrado</p>
                          )}
                        </div>

                        {/* Resposta do ERP */}
                        <div className="bg-card rounded-lg border border-border p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="w-4 h-4 text-accent" />
                            <h4 className="font-medium text-sm text-foreground">Resposta do ERP</h4>
                          </div>
                          {erpResp ? (
                            <div>
                              {erpResp.success === false && (
                                <div className="mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                                  <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                                    <div>
                                      <p className="text-sm font-medium text-destructive">
                                        {erpResp.error || "Erro desconhecido"}
                                      </p>
                                      {erpResp.code && (
                                        <p className="text-xs text-destructive/70 mt-1">
                                          Código: {erpResp.code}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {erpResp.success === true && (
                                <div className="mb-3 p-3 rounded-lg bg-success/10 border border-success/20">
                                  <div className="flex items-start gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-success mt-0.5" />
                                    <div>
                                      <p className="text-sm font-medium text-success">
                                        {erpResp.message || "Processado com sucesso"}
                                      </p>
                                      {erpResp.id && (
                                        <p className="text-xs text-success/70 mt-1">
                                          ID ERP: {erpResp.id}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                              <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-3 overflow-x-auto max-h-48">
                                {JSON.stringify(erpResp, null, 2)}
                              </pre>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">Nenhuma resposta registrada</p>
                          )}
                        </div>
                      </div>

                      {/* Metadados e ações */}
                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          {d.erpId && (
                            <span>ID ERP: <strong className="text-foreground">{d.erpId}</strong></span>
                          )}
                          {d.dataEnvio && (
                            <span>Enviado em: <strong className="text-foreground">{formatDateTime(d.dataEnvio)}</strong></span>
                          )}
                          <span>Atualizado: <strong className="text-foreground">{formatDateTime(d.dataAtualizacao)}</strong></span>
                        </div>

                        {isError && (
                          <button
                            onClick={() => handleReenviar(d)}
                            disabled={reenviarLoading === d.id}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
                          >
                            <RefreshCw className={`w-4 h-4 ${reenviarLoading === d.id ? "animate-spin" : ""}`} />
                            {reenviarLoading === d.id ? "Reenviando..." : "Reenviar ao ERP"}
                          </button>
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
    </div>
  );
}
