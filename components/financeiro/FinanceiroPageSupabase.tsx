"use client";

import { useState, useMemo } from "react";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { formatCurrency, getStatusGeral, statusGeralConfig, pagamentoTipoConfig } from "@/lib/helpers";
import { DollarSign, TrendingUp, Search, Eye, CalendarDays, Pencil, Check, X } from "lucide-react";
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
  const { despesas, isLoading, updateDespesaVencimento } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch] = useState("");
  // Estado para edição inline de vencimento: { [despesaId]: string }
  const [editandoVencimento, setEditandoVencimento] = useState<Record<string, string>>({});
  const [salvandoVencimento, setSalvandoVencimento] = useState<Record<string, boolean>>({});
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
      // Despesas em dinheiro vão para a aba Reembolso, não aparecem aqui
      if (d.pagamento_tipo === "dinheiro") return false;
      const dataStr = (d.data_vencimento || d.data_despesa || d.created_at || "").slice(0, 10);
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
    const tecnicos = profiles;
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
    const cartao = d.cartao;
    const cartaoLabel = cartao
      ? `${cartao.banco} ${cartao.bandeira} ${cartao.ultimos_digitos} ${cartao.apelido || ""}`.toLowerCase()
      : "";
    return (
      d.cliente.toLowerCase().includes(term) ||
      d.numero_os.toLowerCase().includes(term) ||
      (tipo?.nome || "").toLowerCase().includes(term) ||
      (tecnico?.nome || "").toLowerCase().includes(term) ||
      (d.erp_id || "").toString().includes(term) ||
      (d.documento || "").toLowerCase().includes(term) ||
      cartaoLabel.includes(term)
    );
  });

  const totalFiltrado = despesasFiltradas.reduce((s, d) => s + Number(d.valor), 0);

  const handleExportarXLSX = () => {
    const dados = despesasFiltradas.map((d) => {
      const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
      const tecnico = profiles.find((p) => p.id === d.tecnico_id);
      const cartao = d.cartao;
      const cartaoLabel = cartao
        ? `${cartao.banco} — ${cartao.bandeira} — **** ${cartao.ultimos_digitos}`
        : "-";
      return {
        Data: new Date(d.data_despesa).toLocaleDateString("pt-BR"),
        Vencimento: d.data_vencimento ? new Date(d.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "-",
        "Parcela": d.parcelado ? `${d.parcela_atual}/${d.numero_parcelas}` : "-",
        Funcionário: tecnico?.nome || "-",
        Tipo: tipo?.nome || "-",
        Cliente: d.cliente,
        "Número OS": d.numero_os || "-",
        Valor: Number(d.valor),
        Documento: d.documento || "-",
        Cartão: cartaoLabel,
        "Status": statusGeralConfig[getStatusGeral(d.status_erp ?? "", d.status_aprovacao)].label,
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
      { wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 15 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 15 },
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
      const cartao  = d.cartao;
      const cartaoLabel = cartao
        ? `${cartao.banco} — ${cartao.bandeira} — **** ${cartao.ultimos_digitos}`
        : "-";
      const sg = getStatusGeral(d.status_erp ?? "", d.status_aprovacao);
      const statusLabel = statusGeralConfig[sg].label;
      return [
        new Date(d.data_despesa).toLocaleDateString("pt-BR"),
        d.data_vencimento ? new Date(d.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "-",
        d.parcelado ? `${d.parcela_atual}/${d.numero_parcelas}` : "-",
        tecnico?.nome.split(" ").slice(0, 2).join(" ") || "-",
        tipo?.nome || "-",
        d.cliente,
        d.numero_os || "-",
        formatCurrency(Number(d.valor)),
        d.documento || "-",
        cartaoLabel,
        statusLabel,
        d.comprovante_url ? "Sim" : "Não",
        d.status_erp || "-",
        d.data_envio ? new Date(d.data_envio).toLocaleDateString("pt-BR") : "-",
        d.erp_id || "-",
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [["Data", "Vencimento", "Parcela", "Funcionário", "Tipo", "Cliente", "OS", "Valor", "Doc.", "Cartão", "Status", "Comprovante", "Status ERP", "Envio", "ERP ID"]],
      body: rows,
      styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: "bold", fontSize: 7.5 },
      alternateRowStyles: { fillColor: [245, 247, 255] },
      columnStyles: {
        0: { cellWidth: 16 },
        1: { cellWidth: 22 },
        2: { cellWidth: 20 },
        3: { cellWidth: 28 },
        4: { cellWidth: 14 },
        5: { cellWidth: 18, halign: "right" },
        6: { cellWidth: 16 },
        7: { cellWidth: 32 },
        8: { cellWidth: 18 },
        9: { cellWidth: 20 },
        10: { cellWidth: 20 },
        11: { cellWidth: 14 },
        12: { cellWidth: 22 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 8) {
          const v = data.cell.raw as string;
          if (v === "Aprovado")              { data.cell.styles.textColor = [22, 163, 74];  data.cell.styles.fontStyle = "bold"; }
          if (v === "Aguardando Aprovação")  { data.cell.styles.textColor = [202, 138, 4]; }
          if (v === "Reprovado")             { data.cell.styles.textColor = [220, 38, 38];  data.cell.styles.fontStyle = "bold"; }
          if (v === "Enviado")               { data.cell.styles.textColor = [30, 58, 138]; }
          if (v === "Não enviado")           { data.cell.styles.textColor = [120, 120, 120]; }
        }
      },
    });

    const nomeArquivo = `Despesas_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`;
    doc.save(nomeArquivo);
  };

  const handleEditarVencimento = (id: string, dataAtual: string | null) => {
    setEditandoVencimento((prev) => ({ ...prev, [id]: dataAtual || "" }));
  };

  const handleCancelarVencimento = (id: string) => {
    setEditandoVencimento((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleSalvarVencimento = async (id: string) => {
    const novaData = editandoVencimento[id];
    if (!novaData) return;
    setSalvandoVencimento((prev) => ({ ...prev, [id]: true }));
    await updateDespesaVencimento(id, novaData);
    setSalvandoVencimento((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    handleCancelarVencimento(id);
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
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão financeira das despesas aprovadas &mdash;{" "}
            <span className="text-accent font-medium">
              {modoFiltro === "mes"
                ? `${MESES_FULL[mesSelecionado]} ${anoSelecionado}`
                : dataInicial && dataFinal
                ? `${dataInicial.split("-").reverse().join("/")} até ${dataFinal.split("-").reverse().join("/")}`
                : "Período personalizado"}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg self-start sm:self-end">
            <button
              onClick={() => setModoFiltro("mes")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${modoFiltro === "mes" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Por Mês
            </button>
            <button
              onClick={() => setModoFiltro("periodo")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${modoFiltro === "periodo" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Período
            </button>
          </div>

          {modoFiltro === "mes" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />
              </div>
              <select
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {MESES_FULL.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
              />
              <span className="text-xs text-muted-foreground">até</span>
              <input
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
              />
            </div>
          )}
        </div>
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
            <h2 className="text-sm font-semibold text-foreground mb-4">Por Funcion��rio</h2>
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
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground">{despesasFiltradas.length} despesa{despesasFiltradas.length !== 1 ? "s" : ""} no período</p>
              <span className="text-xs text-muted-foreground">•</span>
              <p className="text-xs font-semibold text-foreground">
                Total filtrado: <span className="text-primary">{formatCurrency(totalFiltrado)}</span>
              </p>
            </div>
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
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Vencimento</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Funcionário</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Tipo</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Pagamento</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Cliente</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">OS</th>
                <th className="text-right px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Valor</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Documento</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Cartão</th>
                <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground whitespace-nowrap">Status</th>
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
                const cartao = d.cartao;
                const sg = getStatusGeral(d.status_erp ?? "", d.status_aprovacao);
                const statusCfg = statusGeralConfig[sg];

                const cartaoLabel = cartao
                  ? `${cartao.banco} — ${cartao.bandeira} — **** ${cartao.ultimos_digitos}`
                  : null;

                const statusErpCls = {
                  Rascunho:                    "bg-muted/20 text-muted-foreground",
                  EnviadoAguardandoGestor:     "bg-warning/10 text-warning",
                  AprovadoGestorERPAtualizado: "bg-success/10 text-success",
                  ErroAtualizarERP:            "bg-destructive/10 text-destructive",
                  ErroEnvioERP:                "bg-destructive/10 text-destructive",
                }[d.status_erp ?? ""] ?? "bg-muted/20 text-muted-foreground";

                return (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/20 transition">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(d.data_despesa).toLocaleDateString("pt-BR")}</td>
                    {/* Vencimento editável */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editandoVencimento[d.id] !== undefined ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={editandoVencimento[d.id]}
                            onChange={(e) =>
                              setEditandoVencimento((prev) => ({ ...prev, [d.id]: e.target.value }))
                            }
                            className="px-2 py-1 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary w-32"
                          />
                          <button
                            onClick={() => handleSalvarVencimento(d.id)}
                            disabled={!editandoVencimento[d.id] || salvandoVencimento[d.id]}
                            title="Salvar"
                            className="p-1 rounded hover:bg-success/10 text-success disabled:opacity-40 transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCancelarVencimento(d.id)}
                            title="Cancelar"
                            className="p-1 rounded hover:bg-destructive/10 text-destructive transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          <span className={d.data_vencimento ? "text-foreground" : "text-muted-foreground"}>
                            {d.data_vencimento
                              ? new Date(d.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")
                              : "—"}
                          </span>
                          <button
                            onClick={() => handleEditarVencimento(d.id, d.data_vencimento)}
                            title="Editar vencimento"
                            className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition hover:bg-muted text-muted-foreground"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{tecnico?.nome.split(" ")[0] || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span>{tipo?.nome || "-"}</span>
                      {d.parcelado && d.numero_parcelas > 1 && (
                        <span className="ml-1.5 text-xs font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                          {d.parcela_atual}/{d.numero_parcelas}
                        </span>
                      )}
                      {d.pagamento_tipo === "faturado" && (
                        <span className="ml-1.5 text-xs font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full">
                          Faturado
                        </span>
                      )}
                      {d.pagamento_tipo === "boleto" && (
                        <span className="ml-1.5 text-xs font-semibold text-warning bg-warning/10 px-1.5 py-0.5 rounded-full">
                          Boleto
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const pc = pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"];
                        return pc ? (
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${pc.color}`}>
                            {pc.label}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 max-w-32 truncate">{d.cliente}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{d.numero_os || "-"}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(Number(d.valor))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.documento ? (
                        <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-muted/60 text-foreground font-medium">
                          {d.documento}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {cartaoLabel ? (
                        <span className="text-xs text-foreground font-mono">{cartaoLabel}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusCfg.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
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
                  <td colSpan={14} className="px-3 py-10 text-center text-muted-foreground">
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
