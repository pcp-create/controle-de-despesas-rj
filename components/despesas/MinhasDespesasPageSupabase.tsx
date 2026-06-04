"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles, type Despesa } from "@/lib/supabase/hooks";
import { formatCurrency, getStatusGeral, statusGeralConfig } from "@/lib/helpers";
import {
  PlusCircle,
  Search,
  Filter,
  Send,
  Edit2,
  Trash2,
  Eye,
  ChevronDown,
} from "lucide-react";

interface Props {
  onNova: () => void;
  onEditar: (despesa: Despesa) => void;
}

export default function MinhasDespesasPageSupabase({ onNova, onEditar }: Props) {
  const { currentUser, loadSupabaseData } = useAppStore();
  const { despesas, isLoading, deleteDespesa, enviarDespesa } = useDespesas(currentUser?.id);
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const minhasDespesas = useMemo(() => {
    return despesas
      .filter((d) => d.tecnico_id === currentUser?.id)
      .filter((d) => {
        if (filterStatus !== "todos") {
          const sg = getStatusGeral(d.status_erp, d.status_aprovacao);
          if (sg !== filterStatus) return false;
        }
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
            <option value="nao_enviado">Não enviado</option>
            <option value="enviado">Enviado</option>
            <option value="aguardando_aprovacao">Aguardando Aprovação</option>
            <option value="aprovado">Aprovado</option>
            <option value="reprovado">Reprovado</option>
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
            const sg = getStatusGeral(d.status_erp, d.status_aprovacao);
            const status = statusGeralConfig[sg];
            const isExpanded = expandedId === d.id;

            return (
              <div key={d.id} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : d.id)}
                  className="w-full p-4 flex items-center gap-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    {/* Linha 1: tipo + valor */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{tipo?.nome || "Despesa"}</span>
                      <span className="text-base font-bold text-foreground shrink-0">{formatCurrency(Number(d.valor))}</span>
                    </div>
                    {/* Linha 2: cliente • OS • data */}
                    <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
                      <span>{d.cliente}</span>
                      {d.numero_os && <><span>•</span><span>{d.numero_os}</span></>}
                      <span>•</span>
                      <span>{new Date(d.data_despesa).toLocaleDateString("pt-BR")}</span>
                    </div>
                    {/* Linha 3: status geral único */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">
                    {/* Informações da despesa */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Criado em</p>
                        <p className="text-foreground">{new Date(d.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Documento</p>
                        <p className="text-foreground">{d.documento || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Comprovante</p>
                        <p className="text-foreground">{d.comprovante_nome || "Não anexado"}</p>
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

                      {/* Aprovação/Reprovação */}
                      {d.status_aprovacao === "AprovadoGestor" && d.data_aprovacao && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Aprovado em</p>
                            <p className="text-success font-medium">{new Date(d.data_aprovacao).toLocaleString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Aprovado por</p>
                            <p className="text-success font-medium">
                              {d.gestor_aprovador_id
                                ? (profiles.find((p) => p.id === d.gestor_aprovador_id)?.nome ?? d.gestor_aprovador_id)
                                : "Aprovação automática"}
                            </p>
                          </div>
                        </>
                      )}
                      {d.status_aprovacao === "Reprovado" && d.data_aprovacao && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reprovado em</p>
                            <p className="text-destructive font-medium">{new Date(d.data_aprovacao).toLocaleString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reprovado por</p>
                            <p className="text-destructive font-medium">
                              {profiles.find((p) => p.id === d.gestor_aprovador_id)?.nome ?? d.gestor_aprovador_id ?? "-"}
                            </p>
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

                    {/* Ações */}
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
                            Enviar Despesa
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
