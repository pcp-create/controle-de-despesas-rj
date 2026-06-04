"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, type Despesa } from "@/lib/supabase/hooks";
import { formatCurrency } from "@/lib/helpers";
import {
  PlusCircle,
  Search,
  Filter,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  AlertTriangle,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
} from "lucide-react";

interface Props {
  onNova: () => void;
  onEditar: (despesa: Despesa) => void;
}

const statusAprovacaoConfig = {
  AguardandoGestor: { label: "Aguardando", color: "bg-warning/10 text-warning", icon: Clock },
  AprovadoGestor: { label: "Aprovado", color: "bg-success/10 text-success", icon: CheckCircle },
  Reprovado: { label: "Reprovado", color: "bg-destructive/10 text-destructive", icon: XCircle },
};

const statusErpConfig = {
  Rascunho: { label: "Rascunho", color: "bg-muted text-muted-foreground" },
  EnviadoAguardandoGestor: { label: "Enviado", color: "bg-primary/10 text-primary" },
  AprovadoGestorERPAtualizado: { label: "Integrado", color: "bg-success/10 text-success" },
  ErroEnvioERP: { label: "Erro Envio", color: "bg-destructive/10 text-destructive" },
  ErroAtualizarERP: { label: "Erro ERP", color: "bg-destructive/10 text-destructive" },
};

export default function MinhasDespesasPageSupabase({ onNova, onEditar }: Props) {
  const { currentUser, loadSupabaseData } = useAppStore();
  const { despesas, isLoading, deleteDespesa, enviarDespesa } = useDespesas(currentUser?.id);
  const { tiposDespesa } = useTiposDespesa();
  
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const minhasDespesas = useMemo(() => {
    return despesas
      .filter((d) => d.tecnico_id === currentUser?.id)
      .filter((d) => {
        if (filterStatus !== "todos" && d.status_aprovacao !== filterStatus) return false;
        if (search) {
          const term = search.toLowerCase();
          const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
          return (
            d.cliente.toLowerCase().includes(term) ||
            d.numero_os.toLowerCase().includes(term) ||
            (tipo?.nome || "").toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [despesas, currentUser, search, filterStatus, tiposDespesa]);

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    const result = await deleteDespesa(id);
    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: "Despesa excluída!" });
      await loadSupabaseData();
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleEnviar = async (id: string) => {
    const result = await enviarDespesa(id);
    if (!result.ok) {
      setFeedback({ type: "error", msg: result.msg });
    } else {
      setFeedback({ type: "success", msg: result.msg });
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
          <h1 className="text-xl font-bold text-foreground">Minhas Despesas</h1>
          <p className="text-sm text-muted-foreground">{minhasDespesas.length} lançamento(s)</p>
        </div>
        <button
          onClick={onNova}
          className="hidden lg:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
        >
          <PlusCircle className="w-4 h-4" />
          Nova Despesa
        </button>
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
            placeholder="Buscar por cliente, OS ou tipo..."
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
      {minhasDespesas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Send className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma despesa encontrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Clique em "Nova Despesa" para começar</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {minhasDespesas.map((d) => {
            const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
            const statusAprov = statusAprovacaoConfig[d.status_aprovacao];
            const statusERP = statusErpConfig[d.status_erp];
            const isExpanded = expandedId === d.id;
            const IconAprov = statusAprov.icon;

            return (
              <div key={d.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="w-full p-4 flex items-center gap-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-foreground">{tipo?.nome || "Despesa"}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusAprov.color}`}>
                        {statusAprov.label}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusERP.color}`}>
                        {statusERP.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <span>{d.cliente}</span>
                      <span>•</span>
                      <span>{d.numero_os}</span>
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
                      {d.justificativa_reprovacao && (
                        <div className="col-span-2 p-2 rounded-lg bg-destructive/10 text-destructive">
                          <span className="font-medium">Motivo da reprovação:</span>
                          <span className="ml-2">{d.justificativa_reprovacao}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {d.status_erp === "Rascunho" && (
                        <>
                          <button
                            onClick={() => onEditar(d)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition"
                          >
                            <Edit2 className="w-4 h-4" />
                            Editar
                          </button>
                          <button
                            onClick={() => handleDelete(d.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                            Excluir
                          </button>
                          <button
                            onClick={() => handleEnviar(d.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm hover:bg-accent/90 transition"
                          >
                            <Send className="w-4 h-4" />
                            Enviar para Aprovação
                          </button>
                        </>
                      )}
                      {d.comprovante_url && (
                        <button
                          onClick={() => window.open(d.comprovante_url!, "_blank")}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition"
                        >
                          <Eye className="w-4 h-4" />
                          Ver Comprovante
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
  );
}
