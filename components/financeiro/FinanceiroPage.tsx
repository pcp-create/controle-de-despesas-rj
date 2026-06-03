"use client";

import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { Search, Eye, RefreshCw } from "lucide-react";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  erpStatusColor,
  erpStatusLabel,
} from "@/lib/helpers";
import DespesaDetailModal from "@/components/despesas/DespesaDetailModal";
import type { Despesa } from "@/lib/types";

export default function FinanceiroPage() {
  const { despesas, users, tiposDespesa, updateDespesaStatus, addAuditoria, currentUser } = useAppStore();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Despesa | null>(null);

  const filtered = despesas.filter((d) => {
    const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
    const tecnico = users.find((u) => u.id === d.tecnicoId);
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      d.cliente.toLowerCase().includes(q) ||
      d.numeroOS.toLowerCase().includes(q) ||
      tipo?.nome.toLowerCase().includes(q) ||
      tecnico?.nome.toLowerCase().includes(q) ||
      (d.erpId ?? "").toLowerCase().includes(q);
    const matchStatus = !statusFilter || d.statusERP === statusFilter;
    return matchSearch && matchStatus;
  }).sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const handleReprocessar = (d: Despesa) => {
    const now = new Date().toISOString();
    updateDespesaStatus(d.id, d.statusAprovacao, "EnviadoAguardandoGestor", {
      erpId: `ERP-REPROCESS-${Date.now()}`,
      erpResposta: JSON.stringify({ success: true, reprocessed: true }),
    });
    addAuditoria({
      usuarioId: currentUser!.id,
      acao: "Reprocessamento ERP",
      entidade: "Despesa",
      entidadeId: d.id,
      detalhes: `Integração reprocessada pelo financeiro.`,
      data: now,
    });
  };

  const erros = despesas.filter((d) => d.statusERP === "ErroEnvioERP" || d.statusERP === "ErroAtualizarERP");

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-foreground">Financeiro / Integração ERP</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Acompanhe as integrações com o ERP M8
        </p>
      </div>

      {/* Erros alert */}
      {erros.length > 0 && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-4 flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-destructive">{erros.length} integração(ões) com erro</p>
            <p className="text-xs text-destructive/80 mt-0.5">Utilize o botão de reprocessar para reenviar ao ERP.</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por técnico, cliente, OS, ID ERP..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring">
          <option value="">Todos os status ERP</option>
          <option value="EnviadoAguardandoGestor">Aguardando Gestor</option>
          <option value="AprovadoGestorERPAtualizado">Aprovado - ERP Atualizado</option>
          <option value="ReprovadoERPAtualizado">Reprovado - ERP Atualizado</option>
          <option value="ErroEnvioERP">Erro ao Enviar</option>
          <option value="ErroAtualizarERP">Erro ao Atualizar</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Data</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Técnico</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Tipo / OS</th>
                <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Valor</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">ID ERP</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Status ERP</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
                const tecnico = users.find((u) => u.id === d.tecnicoId);
                const hasError = d.statusERP === "ErroEnvioERP" || d.statusERP === "ErroAtualizarERP";
                return (
                  <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                    <td className="px-4 py-3 text-foreground">{formatDate(d.dataDespesa)}</td>
                    <td className="px-4 py-3 text-foreground">{tecnico?.nome.split(" ")[0]}</td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-foreground">{tipo?.nome}</span>
                      <br />
                      <span className="text-xs text-muted-foreground">{d.cliente} · {d.numeroOS}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{formatCurrency(d.valor)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">{d.erpId ?? "-"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${erpStatusColor[d.statusERP]}`}>
                        {erpStatusLabel[d.statusERP]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setSelected(d)} className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground" title="Ver detalhes">
                          <Eye className="w-4 h-4" />
                        </button>
                        {hasError && (
                          <button onClick={() => handleReprocessar(d)}
                            className="p-1.5 rounded-lg bg-warning/10 text-warning hover:bg-warning/20 transition" title="Reprocessar">
                            <RefreshCw className="w-4 h-4" />
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

      {selected && <DespesaDetailModal despesa={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
