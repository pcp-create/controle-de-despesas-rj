"use client";

import { useState, useMemo } from "react";
import { Archive, Loader2, AlertTriangle, CheckSquare, Square } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/helpers";
import { extractApiErrorMessage } from "@/lib/backup-comprovantes";
import BackupGerarConfirmar from "@/components/admin/backup-comprovantes/BackupGerarConfirmar";
import BackupHistorico from "@/components/admin/backup-comprovantes/BackupHistorico";

export interface DespesaElegivelItem {
  id: string;
  dataDespesa: string;
  cliente: string;
  numeroOs: string;
  valor: number;
  comprovanteNome: string | null;
  tecnicoNome: string;
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function seisMesesAtrasISO(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export default function BackupComprovantesPageSupabase() {
  const [corteData, setCorteData] = useState(seisMesesAtrasISO());
  const [itens, setItens] = useState<DespesaElegivelItem[] | null>(null);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<"buscar" | "historico">("buscar");

  const totalSelecionado = useMemo(
    () => (itens ?? []).filter((i) => selecionados.has(i.id)).reduce((s, i) => s + i.valor, 0),
    [itens, selecionados],
  );

  async function buscarElegiveis() {
    setBuscando(true);
    setErro(null);
    setItens(null);
    setSelecionados(new Set());
    try {
      const res = await fetch(`/api/backup-comprovantes/elegiveis?corte=${corteData}`);
      const json = await res.json();
      if (!res.ok) throw new Error(extractApiErrorMessage(json, "Erro ao buscar despesas elegíveis."));
      setItens(json.itens);
      setSelecionados(new Set(json.itens.map((i: DespesaElegivelItem) => i.id)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado.");
    } finally {
      setBuscando(false);
    }
  }

  function toggleItem(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTodos() {
    if (!itens) return;
    setSelecionados((prev) => (prev.size === itens.length ? new Set() : new Set(itens.map((i) => i.id))));
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-bold text-foreground">Backup de comprovantes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gere um backup em ZIP dos comprovantes de despesas já lançadas e consolidadas no ERP antes de removê-los do
          armazenamento para liberar espaço. A despesa e seu histórico financeiro nunca são apagados — apenas o
          arquivo do comprovante.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {[
          { key: "buscar" as const, label: "Gerar novo backup" },
          { key: "historico" as const, label: "Histórico de backups" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setAba(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              aba === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {aba === "historico" && <BackupHistorico />}

      {aba === "buscar" && (
        <>
          <div className="bg-white rounded-xl border border-border shadow-sm p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Arquivar comprovantes de despesas até</label>
                <input
                  type="date"
                  value={corteData}
                  max={hojeISO()}
                  onChange={(e) => setCorteData(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <button
                onClick={buscarElegiveis}
                disabled={buscando || !corteData}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 transition"
              >
                {buscando ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />}
                Buscar despesas elegíveis
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Somente despesas já lançadas e atualizadas no ERP entram na lista — despesas em rascunho, aguardando
              aprovação ou com erro de envio nunca são elegíveis.
            </p>
          </div>

          {erro && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              <AlertTriangle className="size-4 shrink-0" />
              {erro}
            </div>
          )}

          {itens !== null && (
            <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                <button onClick={toggleTodos} className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                  {selecionados.size === itens.length && itens.length > 0 ? (
                    <CheckSquare className="size-4 text-primary" />
                  ) : (
                    <Square className="size-4 text-muted-foreground" />
                  )}
                  {itens.length} despesa(s) elegível(is) — {selecionados.size} selecionada(s)
                </button>
                <span className="text-sm text-muted-foreground">
                  Total selecionado: <span className="font-semibold text-foreground">{formatCurrency(totalSelecionado)}</span>
                </span>
              </div>

              {itens.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground text-sm">
                  Nenhuma despesa elegível encontrada para esta data de corte.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-border">
                        {["", "Data", "Funcionário", "Cliente / OS", "Valor", "Comprovante"].map((h) => (
                          <th key={h} className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item) => (
                        <tr
                          key={item.id}
                          onClick={() => toggleItem(item.id)}
                          className="border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition"
                        >
                          <td className="px-4 py-2.5">
                            {selecionados.has(item.id) ? (
                              <CheckSquare className="size-4 text-primary" />
                            ) : (
                              <Square className="size-4 text-muted-foreground" />
                            )}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs text-muted-foreground">{formatDate(item.dataDespesa)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs text-foreground">{item.tecnicoNome}</td>
                          <td className="px-4 py-2.5 text-xs text-foreground">
                            {item.cliente} <span className="text-muted-foreground">· OS {item.numeroOs}</span>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs font-medium text-foreground">{formatCurrency(item.valor)}</td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[200px]" title={item.comprovanteNome ?? ""}>
                            {item.comprovanteNome ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {itens.length > 0 && (
                <BackupGerarConfirmar
                  corteData={corteData}
                  despesaIds={Array.from(selecionados)}
                  onConcluido={() => {
                    setItens(null);
                    setSelecionados(new Set());
                    setAba("historico");
                  }}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
