"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles, type Despesa } from "@/lib/supabase/hooks";
import { registrarAuditoria } from "@/lib/supabase/audit";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, getStatusGeral, statusGeralConfig } from "@/lib/helpers";
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  MessageSquare,
} from "lucide-react";

const statusAprovacaoConfig = {
  AguardandoGestor: { label: "Aguardando Aprovação", color: "bg-warning/10 text-warning" },
  AprovadoGestor:   { label: "Aprovado",             color: "bg-success/10 text-success" },
  Reprovado:        { label: "Reprovado",             color: "bg-destructive/10 text-destructive" },
};

export default function AprovacaoPageSupabase() {
  const { currentUser, loadSupabaseData } = useAppStore();
  const { despesas, isLoading } = useDespesas(undefined, currentUser?.perfil);
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("AguardandoGestor");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [reprovandoId, setReprovandoId] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");

  // Filtrar despesas da equipe (despesas onde o tecnico tem o gestor atual como gestor)
  const despesasEquipe = useMemo(() => {
    if (!currentUser) return [];
    
    return despesas
      .filter((d) => {
        // Exclui despesas não enviadas — não devem aparecer em aprovações
        if (!d.status_erp || d.status_erp === "Rascunho") return false;
        // Se for admin ou financeiro, vê tudo
        if (currentUser.perfil === "administrador" || currentUser.perfil === "financeiro") {
          return true;
        }
        // Se for gestor, vê apenas despesas dos técnicos sob sua supervisão
        const tecnico = profiles.find((p) => p.id === d.tecnico_id);
        return tecnico?.gestor_id === currentUser.id;
      })
      .filter((d) => {
        if (filterStatus !== "todos" && d.status_aprovacao !== filterStatus) return false;
        if (search) {
          const term = search.toLowerCase();
          const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
          const tecnico = profiles.find((p) => p.id === d.tecnico_id);
          return (
            d.cliente.toLowerCase().includes(term) ||
            d.numero_os.toLowerCase().includes(term) ||
            (tipo?.nome || "").toLowerCase().includes(term) ||
            (tecnico?.nome || "").toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [despesas, currentUser, profiles, search, filterStatus, tiposDespesa]);

  const pendentes = despesasEquipe.filter((d) => d.status_aprovacao === "AguardandoGestor").length;

  const handleAprovar = async (id: string) => {
    const supabase = createClient();
    if (!supabase) {
      setFeedback({ type: "error", msg: "Supabase não disponível" });
      return;
    }

    const { error } = await supabase
      .from("despesas")
      .update({
        status_aprovacao: "AprovadoGestor",
        status_erp: "AprovadoGestor",
        gestor_aprovador_id: currentUser?.id,
        data_aprovacao: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setFeedback({ type: "error", msg: error.message });
    } else {
      // Registrar auditoria
      await registrarAuditoria({
        acao: "APPROVE",
        entidade: "despesa",
        entidadeId: id,
        usuarioId: currentUser?.id || "sistema",
        detalhes: "Despesa aprovada pelo gestor",
      });
      
      setFeedback({ type: "success", msg: "Despesa aprovada!" });
      await loadSupabaseData();
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleReprovar = async (id: string) => {
    if (!justificativa.trim()) {
      setFeedback({ type: "error", msg: "Informe a justificativa da reprovação" });
      return;
    }
    
    const supabase = createClient();
    if (!supabase) {
      setFeedback({ type: "error", msg: "Supabase não disponível" });
      return;
    }

    const { error } = await supabase
      .from("despesas")
      .update({
        status_aprovacao: "Reprovado",
        status_erp: "Reprovado",
        gestor_aprovador_id: currentUser?.id,
        justificativa_reprovacao: justificativa,
        data_aprovacao: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      setFeedback({ type: "error", msg: error.message });
    } else {
      // Registrar auditoria
      await registrarAuditoria({
        acao: "REJECT",
        entidade: "despesa",
        entidadeId: id,
        usuarioId: currentUser?.id || "sistema",
        detalhes: `Despesa reprovada: ${justificativa}`,
      });
      
      setFeedback({ type: "success", msg: "Despesa reprovada" });
      setReprovandoId(null);
      setJustificativa("");
      await loadSupabaseData();
      setTimeout(() => setFeedback(null), 3000);
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Aprovação de Despesas</h1>
          <p className="text-sm text-muted-foreground">
            {pendentes} despesa(s) aguardando aprovação
          </p>
        </div>
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

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por técnico, cliente, OS..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            <option value="todos">Todos</option>
            <option value="AguardandoGestor">Aguardando Aprovação</option>
            <option value="AprovadoGestor">Aprovados</option>
            <option value="Reprovado">Reprovados</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      {despesasEquipe.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma despesa para aprovar</h3>
          <p className="text-sm text-muted-foreground mt-1">As despesas pendentes aparecerão aqui</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {despesasEquipe.map((d) => {
            const tipo    = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
            const tecnico = profiles.find((p) => p.id === d.tecnico_id);
            const gestor  = profiles.find((p) => p.id === d.gestor_aprovador_id);
            const sg      = getStatusGeral(d.status_erp, d.status_aprovacao);
            const status  = statusGeralConfig[sg];
            const isExpanded  = expandedId === d.id;
            const isReprovando = reprovandoId === d.id;

            return (
              <div key={d.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                {/* Cabeçalho do card */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  {/* Avatar técnico */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                    {tecnico?.nome?.[0] ?? "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Linha 1: tipo + valor */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{tipo?.nome || "Despesa"}</span>
                      <span className="text-base font-bold text-foreground shrink-0">{formatCurrency(Number(d.valor))}</span>
                    </div>
                    {/* Linha 2: técnico • cliente • OS • data */}
                    <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground/70">{tecnico?.nome ?? "-"}</span>
                      <span>•</span>
                      <span>{d.cliente}</span>
                      {d.numero_os && <><span>•</span><span>{d.numero_os}</span></>}
                      <span>•</span>
                      <span>{new Date(d.data_despesa).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {/* Linha 3: status geral único */}
                    <div className="mt-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>
                  </div>

                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">

                    {/* Grid de informações */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Criado em</p>
                        <p className="text-foreground">{new Date(d.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                      {d.data_envio && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Enviado em</p>
                          <p className="text-foreground">{new Date(d.data_envio).toLocaleString("pt-BR")}</p>
                        </div>
                      )}

                      {/* Hospedagem */}
                      {d.data_checkin && d.data_checkout && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Check-in</p>
                            <p className="text-foreground">{new Date(d.data_checkin + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Check-out</p>
                            <p className="text-foreground">{new Date(d.data_checkout + "T12:00:00").toLocaleDateString("pt-BR")}</p>
                          </div>
                          {d.numero_diarias && (
                            <div className="col-span-2 flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-sm">
                              <span className="text-muted-foreground"><strong className="text-foreground">{d.numero_diarias}</strong> diária{d.numero_diarias > 1 ? "s" : ""}</span>
                              <span className="text-muted-foreground"><strong className="text-foreground">{formatCurrency(Number(d.valor) / d.numero_diarias)}</strong> / diária</span>
                            </div>
                          )}
                        </>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Documento</p>
                        <p className="text-foreground">{d.documento || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Comprovante</p>
                        <p className="text-foreground">{d.comprovante_nome || "Não anexado"}</p>
                      </div>

                      {/* Aprovação */}
                      {d.status_aprovacao === "AprovadoGestor" && d.data_aprovacao && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Aprovado em</p>
                            <p className="text-success font-medium">{new Date(d.data_aprovacao).toLocaleString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Aprovado por</p>
                            <p className="text-success font-medium">
                              {d.gestor_aprovador_id ? (gestor?.nome ?? d.gestor_aprovador_id) : "Aprovação automática"}
                            </p>
                          </div>
                        </>
                      )}

                      {/* Reprovação */}
                      {d.status_aprovacao === "Reprovado" && d.data_aprovacao && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reprovado em</p>
                            <p className="text-destructive font-medium">{new Date(d.data_aprovacao).toLocaleString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reprovado por</p>
                            <p className="text-destructive font-medium">{gestor?.nome ?? d.gestor_aprovador_id ?? "-"}</p>
                          </div>
                        </>
                      )}

                      {d.observacao && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Observação</p>
                          <p className="text-foreground">{d.observacao}</p>
                        </div>
                      )}
                    </div>

                    {/* Motivo reprovação */}
                    {d.status_aprovacao === "Reprovado" && d.justificativa_reprovacao && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                        <p className="font-semibold mb-0.5">Motivo da reprovação</p>
                        <p>{d.justificativa_reprovacao}</p>
                      </div>
                    )}

                    {/* Formulário de reprovação */}
                    {isReprovando && (
                      <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          Justificativa da Reprovação
                        </label>
                        <textarea
                          value={justificativa}
                          onChange={(e) => setJustificativa(e.target.value)}
                          placeholder="Informe o motivo da reprovação..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setReprovandoId(null); setJustificativa(""); }}
                            className="flex-1 py-2 rounded-lg border border-input text-sm hover:bg-muted transition"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleReprovar(d.id)}
                            className="flex-1 py-2 rounded-lg bg-destructive text-white text-sm hover:bg-destructive/90 transition font-medium"
                          >
                            Confirmar Reprovação
                          </button>
                        </div>
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
                      {d.status_aprovacao === "AguardandoGestor" && !isReprovando && (
                        <>
                          <button
                            onClick={() => setReprovandoId(d.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition"
                          >
                            <XCircle className="w-4 h-4" />
                            Reprovar
                          </button>
                          <button
                            onClick={() => handleAprovar(d.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success text-white text-sm hover:bg-success/90 transition font-medium"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Aprovar
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
