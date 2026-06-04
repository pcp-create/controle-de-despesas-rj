"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles, type Despesa } from "@/lib/supabase/hooks";
import { registrarAuditoria } from "@/lib/supabase/audit";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/helpers";
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  Clock,
  User,
  MessageSquare,
} from "lucide-react";

const statusAprovacaoConfig = {
  AguardandoGestor: { label: "Aguardando", color: "bg-warning/10 text-warning", icon: Clock },
  AprovadoGestor: { label: "Aprovado", color: "bg-success/10 text-success", icon: CheckCircle },
  Reprovado: { label: "Reprovado", color: "bg-destructive/10 text-destructive", icon: XCircle },
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
            <option value="AguardandoGestor">Aguardando</option>
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
            const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
            const tecnico = profiles.find((p) => p.id === d.tecnico_id);
            const statusAprov = statusAprovacaoConfig[d.status_aprovacao];
            const isExpanded = expandedId === d.id;
            const isReprovando = reprovandoId === d.id;

            return (
              <div key={d.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="w-full p-4 flex items-center gap-4 text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <User className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{tecnico?.nome || "Técnico"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusAprov.color}`}>
                        {statusAprov.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <span>{tipo?.nome || "Despesa"}</span>
                      <span>•</span>
                      <span>{d.cliente}</span>
                      <span>•</span>
                      <span>{new Date(d.data_despesa).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-bold text-foreground">{formatCurrency(Number(d.valor))}</p>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4">
                    <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                      <div>
                        <span className="text-muted-foreground">OS:</span>
                        <span className="ml-2 text-foreground">{d.numero_os}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Documento:</span>
                        <span className="ml-2 text-foreground">{d.documento || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Comprovante:</span>
                        <span className="ml-2 text-foreground">{d.comprovante_nome || "Não anexado"}</span>
                      </div>
                      {d.observacao && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground">Obs:</span>
                          <span className="ml-2 text-foreground">{d.observacao}</span>
                        </div>
                      )}
                    </div>

                    {/* Formulário de reprovação */}
                    {isReprovando && (
                      <div className="mb-4 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                        <label className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
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
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => { setReprovandoId(null); setJustificativa(""); }}
                            className="flex-1 py-2 rounded-lg border border-input text-sm hover:bg-muted transition"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleReprovar(d.id)}
                            className="flex-1 py-2 rounded-lg bg-destructive text-white text-sm hover:bg-destructive/90 transition"
                          >
                            Confirmar Reprovação
                          </button>
                        </div>
                      </div>
                    )}

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
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success text-white text-sm hover:bg-success/90 transition"
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
