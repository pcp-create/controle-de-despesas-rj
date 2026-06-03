"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { PlusCircle, Search, Eye, Edit2, Send, FileText } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  erpStatusColor,
  erpStatusLabel,
  approvalStatusColor,
  approvalStatusLabel,
} from "@/lib/helpers";
import DespesaDetailModal from "./DespesaDetailModal";
import type { Despesa } from "@/lib/types";

interface Props {
  onNova: () => void;
  onEditar: (despesa: Despesa) => void;
}

export default function MinhasDespesasPage({ onNova, onEditar }: Props) {
  const { currentUser, despesas, tiposDespesa, cartoes, enviarDespesa } = useAppStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Despesa | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const myDespesas = despesas
    .filter((d) => d.tecnicoId === currentUser?.id)
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const filtered = myDespesas.filter((d) => {
    const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.cliente.toLowerCase().includes(q) ||
      d.numeroOS.toLowerCase().includes(q) ||
      tipo?.nome.toLowerCase().includes(q);
    const matchStatus = !statusFilter || d.statusERP === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleEnviar = (despesa: Despesa) => {
    const result = enviarDespesa(despesa.id);
    if (result.ok) {
      setFeedback({ type: "success", msg: result.msg });
    } else {
      setFeedback({ type: "error", msg: result.msg });
    }
    setTimeout(() => setFeedback(null), 4000);
  };

  const isRascunho = (d: Despesa) => d.statusERP === "Rascunho";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Minhas Despesas</h1>
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
        <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
          feedback.type === "success" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, OS ou tipo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os status</option>
          <option value="Rascunho">Rascunho</option>
          <option value="EnviadoAguardandoGestor">Aguardando Gestor</option>
          <option value="AprovadoGestorERPAtualizado">Aprovado</option>
          <option value="ReprovadoERPAtualizado">Reprovado</option>
          <option value="ErroEnvioERP">Erro ERP</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Cliente / OS</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">ERP</th>
                <th className="px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhuma despesa encontrada.
                  </td>
                </tr>
              )}
              {filtered.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
                const rascunho = isRascunho(d);
                return (
                  <tr key={d.id} className={`border-b border-border last:border-0 hover:bg-muted/20 transition ${rascunho ? "bg-warning/5" : ""}`}>
                    <td className="px-4 py-3 text-foreground">{formatDate(d.dataDespesa)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{tipo?.nome ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className="text-foreground">{d.cliente}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{d.numeroOS}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground">
                      {formatCurrency(d.valor)}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {rascunho ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning">
                          Rascunho
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${approvalStatusColor[d.statusAprovacao]}`}>
                          {approvalStatusLabel[d.statusAprovacao]}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${erpStatusColor[d.statusERP]}`}>
                        {erpStatusLabel[d.statusERP]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* Ver detalhes */}
                        <button
                          onClick={() => setSelected(d)}
                          className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        
                        {/* Ver comprovante */}
                        {d.comprovanteNome && (
                          <button
                            onClick={() => setSelected(d)}
                            className="p-1.5 rounded-lg hover:bg-muted transition text-accent hover:text-accent/80"
                            title="Ver comprovante"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Editar (apenas rascunho) */}
                        {rascunho && (
                          <button
                            onClick={() => onEditar(d)}
                            className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
                            title="Editar despesa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        
                        {/* Enviar (apenas rascunho) */}
                        {rascunho && (
                          <button
                            onClick={() => handleEnviar(d)}
                            className="p-1.5 rounded-lg hover:bg-accent/10 transition text-accent"
                            title="Enviar despesa"
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <DespesaDetailModal despesa={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
