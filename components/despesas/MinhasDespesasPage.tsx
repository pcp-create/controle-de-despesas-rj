"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { PlusCircle, Search, Eye, Edit2, Send, Paperclip, CheckCircle2 } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
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
  const { currentUser, despesas, tiposDespesa, enviarDespesa } = useAppStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Despesa | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [confirmEnviar, setConfirmEnviar] = useState<Despesa | null>(null);

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

  const handleConfirmarEnvio = (despesa: Despesa) => {
    const result = enviarDespesa(despesa.id);
    setConfirmEnviar(null);
    if (result.ok) {
      setFeedback({ type: "success", msg: result.msg });
    } else {
      setFeedback({ type: "error", msg: result.msg });
    }
    setTimeout(() => setFeedback(null), 5000);
  };

  const isRascunho = (d: Despesa) => d.statusERP === "Rascunho";
  const jaEnviado = (d: Despesa) => d.statusERP !== "Rascunho";

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
          feedback.type === "success"
            ? "bg-success/10 text-success border border-success/20"
            : "bg-destructive/10 text-destructive border border-destructive/20"
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

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tipo</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Cliente / OS</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Aprovacao</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Enviado em</th>
                <th className="text-center px-3 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Anexo</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Acoes</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Enviar</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhuma despesa encontrada.
                  </td>
                </tr>
              )}
              {filtered.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
                const rascunho = isRascunho(d);
                const enviado = jaEnviado(d);

                return (
                  <tr
                    key={d.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/20 transition ${rascunho ? "bg-warning/5" : ""}`}
                  >
                    {/* Data */}
                    <td className="px-4 py-3 text-foreground whitespace-nowrap">
                      {formatDate(d.dataDespesa)}
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">
                      {tipo?.nome ?? "-"}
                    </td>

                    {/* Cliente / OS */}
                    <td className="px-4 py-3">
                      <span className="text-foreground">{d.cliente}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{d.numeroOS}</span>
                    </td>

                    {/* Valor */}
                    <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">
                      {formatCurrency(d.valor)}
                    </td>

                    {/* Aprovacao */}
                    <td className="px-4 py-3 hidden sm:table-cell">
                      {rascunho ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-warning/10 text-warning border border-warning/20">
                          Rascunho
                        </span>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${approvalStatusColor[d.statusAprovacao]}`}>
                          {approvalStatusLabel[d.statusAprovacao]}
                        </span>
                      )}
                    </td>

                    {/* Enviado em */}
                    <td className="px-4 py-3 hidden md:table-cell">
                      {d.dataEnvio ? (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(d.dataEnvio)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Anexo — coluna dedicada */}
                    <td className="px-3 py-3 text-center">
                      {d.comprovanteNome ? (
                        <button
                          onClick={() => setSelected(d)}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 transition"
                          title={d.comprovanteNome}
                        >
                          <Paperclip className="w-4 h-4" />
                        </button>
                      ) : (
                        <span className="text-muted-foreground/30 text-xs">—</span>
                      )}
                    </td>

                    {/* Acoes: visualizar + editar (se rascunho) */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelected(d)}
                          className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
                          title="Ver detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {rascunho && (
                          <button
                            onClick={() => onEditar(d)}
                            className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground hover:text-foreground"
                            title="Editar despesa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Enviar — ultima coluna */}
                    <td className="px-4 py-3 text-right">
                      {rascunho ? (
                        <button
                          onClick={() => setConfirmEnviar(d)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 transition whitespace-nowrap"
                          title="Enviar despesa"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Enviar
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground/50 text-xs font-medium cursor-default whitespace-nowrap"
                          title={d.dataEnvio ? `Enviado em ${formatDateTime(d.dataEnvio)}` : "Ja enviada"}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Enviada
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalhe */}
      {selected && (
        <DespesaDetailModal despesa={selected} onClose={() => setSelected(null)} />
      )}

      {/* Modal confirmacao envio */}
      {confirmEnviar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 flex flex-col gap-4">
            <h3 className="font-semibold text-foreground">Confirmar Envio</h3>
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p>
                Tem certeza que deseja enviar a despesa{" "}
                <strong className="text-foreground">{confirmEnviar.numeroOS}</strong>?
              </p>
              <p className="mt-1">
                Valor:{" "}
                <strong className="text-foreground">{formatCurrency(confirmEnviar.valor)}</strong>
              </p>
              <p className="mt-2 text-xs bg-muted/50 rounded-lg px-3 py-2">
                Apos o envio a despesa nao podera ser editada.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmEnviar(null)}
                className="flex-1 py-2 rounded-lg border border-input text-sm font-medium hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleConfirmarEnvio(confirmEnviar)}
                className="flex-1 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent/90 transition flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Confirmar Envio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
