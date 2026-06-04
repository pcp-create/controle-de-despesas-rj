"use client";

import { useState, useMemo } from "react";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { formatCurrency } from "@/lib/helpers";
import { DollarSign, TrendingUp, Search, Eye } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ModoFiltro = "mes" | "periodo";

export default function FinanceiroPageSupabase() {
  const { despesas, isLoading } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch] = useState("");
  const now = new Date();
  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFinal, setDataFinal] = useState(() => now.toISOString().slice(0, 10));

  const anos = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  const todasDespesas = useMemo(() => {
    return despesas.filter((d) => {
      const dataStr = (d.data_despesa || d.created_at || "").slice(0, 10);
      if (modoFiltro === "mes") {
        const dt = new Date(dataStr + "T00:00:00");
        return dt.getMonth() === mesSelecionado && dt.getFullYear() === anoSelecionado;
      } else {
        if (dataInicial && dataStr < dataInicial) return false;
        if (dataFinal && dataStr > dataFinal) return false;
        return true;
      }
    });
  }, [despesas, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal]);

  const despesasAprovadas = todasDespesas.filter((d) => d.status_aprovacao === "AprovadoGestor");
  const totalAprovado = despesasAprovadas.reduce((s, d) => s + Number(d.valor), 0);
  const qtdLancamentos = despesasAprovadas.length;

  const byTipo = tiposDespesa.map((t) => ({
    name: t.nome,
    valor: despesasAprovadas
      .filter((d) => d.tipo_despesa_id === t.id)
      .reduce((s, d) => s + Number(d.valor), 0),
  })).filter((x) => x.valor > 0);

  const byTecnico = useMemo(() => {
    const tecnicos = profiles.filter((u) => u.perfil === "tecnico");
    return tecnicos
      .map((u) => {
        const du = despesasAprovadas.filter((d) => d.tecnico_id === u.id);
        return {
          id: u.id,
          nome: u.nome.split(" ").slice(0, 2).join(" "),
          total: du.reduce((s, d) => s + Number(d.valor), 0),
          qtd: du.length,
        };
      })
      .filter((u) => u.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [profiles, despesasAprovadas]);

  const despesasFiltradas = todasDespesas.filter((d) => {
    if (!search) return true;
    const term = search.toLowerCase();
    const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
    const tecnico = profiles.find((p) => p.id === d.tecnico_id);
    return (
      d.cliente.toLowerCase().includes(term) ||
      d.numero_os.toLowerCase().includes(term) ||
      (tipo?.nome || "").toLowerCase().includes(term) ||
      (tecnico?.nome || "").toLowerCase().includes(term) ||
      (d.erp_id || "").toString().includes(term)
    );
  });

  const handleExportarXLSX = () => {
    const dados = despesasFiltradas.map((d) => {
      const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
      const tecnico = profiles.find((p) => p.id === d.tecnico_id);
      return {
        Data: new Date(d.data_despesa).toLocaleDateString("pt-BR"),
        Técnico: tecnico?.nome || "-",
        Tipo: tipo?.nome || "-",
        Cliente: d.cliente,
        "Número OS": d.numero_os || "-",
        Valor: Number(d.valor),
        "Status Aprovação": d.status_aprovacao === "AprovadoGestor" ? "Aprovado" :
          d.status_aprovacao === "AguardandoGestor" ? "Aguardando" :
          d.status_aprovacao === "Reprovado" ? "Reprovado" : "-",
        Comprovante: d.comprovante_url ? "Sim" : "Não",
        "Status ERP": d.status_erp || "Não enviado",
        "Data Envio": d.data_envio ? new Date(d.data_envio).toLocaleDateString("pt-BR") : "-",
        "ERP ID": d.erp_id || "-",
      };
    });

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(dados);
    worksheet["!cols"] = [
      { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 25 }, { wch: 12 },
      { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, "Despesas");
    const nomeArquivo = `Despesas_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(workbook, nomeArquivo);
  };

  const handleExportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    const periodoLabel = modoFiltro === "mes"
      ? `${MESES_FULL[mesSelecionado]} / ${anoSelecionado}`
      : `${dataInicial} a ${dataFinal}`;

    // Cabeçalho
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Relatório Financeiro — Despesas", 14, 16);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Período: ${periodoLabel}`, 14, 22);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 27);
    doc.text(`Total aprovado: ${formatCurrency(totalAprovado)}   Lançamentos: ${qtdLancamentos}`, 14, 32);
    doc.setTextColor(0);

    const rows = despesasFiltradas.map((d) => {
      const tipo    = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
      const tecnico = profiles.find((p) => p.id === d.tecnico_id);
      const statusAprov = d.status_aprovacao === "AprovadoGestor"   ? "Aprovado"   :
                          d.status_aprovacao === "AguardandoGestor" ? "Aguardando" :
                          d.status_aprovacao === "Reprovado"        ? "Reprovado"  : "-";
      return [
        new Date(d.data_despesa).toLocaleDateString("pt-BR"),
        tecnico?.nome.split(" ").slice(0, 2).join(" ") || "-",
        tipo?.nome || "-",
        d.cliente,
        d.numero_os || "-",
        formatCurrency(Number(d.valor)),
        statusAprov,
        d.comprovante_url ? "Sim" : "Não",
        d.status_erp || "-",
        d.data_envio ? new Date(d.data_envio).toLocaleDateString("pt-BR") : "-",
        d.erp_id || "-",
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [["Data", "Técnico", "Tipo", "Cliente", "OS", "Valor", "Aprovação", "Comprovante", "Status ERP", "Envio", "ERP ID"]],
      body: rows,
      styles: { fontSize: 7.5, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 28 },
        2: { cellWidth: 25 },
        3: { cellWidth: 38 },
        4: { cellWidth: 18 },
        5: { cellWidth: 22, halign: "right" },
        6: { cellWidth: 20 },
        7: { cellWidth: 24 },
        8: { cellWidth: 38 },
        9: { cellWidth: 18 },
        10: { cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 6) {
          const v = data.cell.raw as string;
          if (v === "Aprovado")   { data.cell.styles.textColor = [22, 163, 74]; data.cell.styles.fontStyle = "bold"; }
          if (v === "Aguardando") { data.cell.styles.textColor = [202, 138, 4]; }
          if (v === "Reprovado")  { data.cell.styles.textColor = [220, 38, 38]; data.cell.styles.fontStyle = "bold"; }
        }
      },
    });

    const nomeArquivo = `Despesas_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`;
    doc.save(nomeArquivo);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Financeiro</h1>
        <p className="text-sm text-muted-foreground">Visão financeira das despesas aprovadas</p>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="bg-white rounded-xl border border-border p-3 flex flex-wrap items-center gap-3">
        {/* Toggle modo */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <button
            onClick={() => setModoFiltro("mes")}
            className={`px-3 py-1.5 text-sm font-medium transition ${
              modoFiltro === "mes"
                ? "bg-primary text-white"
                : "bg-white text-foreground hover:bg-muted/60"
            }`}
          >
            Por mês
          </button>
          <button
            onClick={() => setModoFiltro("periodo")}
            className={`px-3 py-1.5 text-sm font-medium transition border-l border-border ${
              modoFiltro === "periodo"
                ? "bg-primary text-white"
                : "bg-white text-foreground hover:bg-muted/60"
            }`}
          >
            Por período
          </button>
        </div>

        {/* Campos de filtro */}
        {modoFiltro === "mes" ? (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={mesSelecionado}
              onChange={(e) => setMesSelecionado(Number(e.target.value))}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
            >
              {MESES_FULL.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <select
              value={anoSelecionado}
              onChange={(e) => setAnoSelecionado(Number(e.target.value))}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
            >
              {anos.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
            />
            <span className="text-sm text-muted-foreground">até</span>
            <input
              type="date"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              className="px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
            />
          </div>
        )}
      </div>

      {/* ── Cards de métricas ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAprovado)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total Aprovado</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{qtdLancamentos}</p>
          <p className="text-xs text-muted-foreground mt-1">Lançamentos</p>
        </div>
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {byTipo.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Por Tipo de Despesa</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byTipo} layout="vertical" barSize={20}>
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$${v}`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Valor"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]} fill="oklch(0.55 0.18 255)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {byTecnico.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Por Técnico</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byTecnico} dataKey="total" nameKey="nome" cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={2}>
                  {byTecnico.map((_, i) => {
                    const colors = ["oklch(0.55 0.18 255)", "oklch(0.35 0.12 255)", "oklch(0.52 0.17 155)", "oklch(0.62 0.18 60)"];
                    return <Cell key={i} fill={colors[i % colors.length]} />;
                  })}
                </Pie>
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Lista de despesas ── */}
      <div className="bg-white rounded-xl border border-border shadow-sm">

        {/* Cabeçalho da lista */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Todas as Despesas — Confronto com Comprovante</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{despesasFiltradas.length} despesa{despesasFiltradas.length !== 1 ? "s" : ""} no período</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar..."
                className="pl-9 pr-4 py-2 rounded-lg border border-input bg-background text-sm w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              onClick={handleExportarXLSX}
              title="Exportar XLSX"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-input bg-white hover:bg-muted transition shrink-0"
            >
              {/* Excel icon */}
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="3" fill="#1D6F42"/>
                <path d="M7 7h4l1.5 3L14 7h4l-3.5 5 3.5 5h-4l-1.5-3L11 17H7l3.5-5L7 7z" fill="white"/>
              </svg>
            </button>
            <button
              onClick={handleExportarPDF}
              title="Exportar PDF"
              className="flex items-center justify-center w-8 h-8 rounded-lg border border-input bg-white hover:bg-muted transition shrink-0"
            >
              {/* PDF icon */}
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="24" height="24" rx="3" fill="#DC2626"/>
                <text x="3.5" y="16" fontFamily="Arial" fontWeight="bold" fontSize="9" fill="white">PDF</text>
              </svg>
            </button>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Técnico</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Tipo</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Cliente</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">OS</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Valor</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Aprovação</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Comprovante</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Status ERP</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Envio</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">ERP ID</th>
              </tr>
            </thead>
            <tbody>
              {despesasFiltradas.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
                const tecnico = profiles.find((p) => p.id === d.tecnico_id);

                const statusAprovacaoCls = {
                  AprovadoGestor:   "bg-success/10 text-success",
                  AguardandoGestor: "bg-warning/10 text-warning",
                  Reprovado:        "bg-destructive/10 text-destructive",
                }[d.status_aprovacao] ?? "bg-muted/20 text-muted-foreground";

                const statusErpCls = {
                  Rascunho:                    "bg-muted/20 text-muted-foreground",
                  EnviadoAguardandoGestor:     "bg-warning/10 text-warning",
                  AprovadoGestorERPAtualizado: "bg-success/10 text-success",
                  Erro:                        "bg-destructive/10 text-destructive",
                }[d.status_erp ?? ""] ?? "bg-muted/20 text-muted-foreground";

                return (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/20 transition">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(d.data_despesa).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tecnico?.nome.split(" ")[0] || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tipo?.nome || "-"}</td>
                    <td className="px-3 py-2 max-w-32 truncate">{d.cliente}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{d.numero_os || "-"}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(Number(d.valor))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${statusAprovacaoCls}`}>
                        {d.status_aprovacao === "AprovadoGestor"   ? "Aprovado"   :
                         d.status_aprovacao === "AguardandoGestor" ? "Aguardando" :
                         d.status_aprovacao === "Reprovado"        ? "Reprovado"  : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.comprovante_url ? (
                        <a href={d.comprovante_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:text-primary/80">
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${statusErpCls}`}>
                        {d.status_erp || "Não enviado"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {d.data_envio ? new Date(d.data_envio).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">
                      {d.erp_id
                        ? <span className="text-success font-semibold">{d.erp_id}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
              {despesasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhuma despesa encontrada no período
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
