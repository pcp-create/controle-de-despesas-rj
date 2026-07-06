"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { formatCurrency, formatDate, formatDateTime, getStatusGeral, statusGeralConfig, pagamentoTipoConfig } from "@/lib/helpers";
import { DollarSign, TrendingUp, Search, Eye, CalendarDays, Pencil, Check, X, ChevronUp, ChevronDown, ChevronsUpDown, Filter, SendHorizonal, RotateCcw, AlertCircle } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ModoFiltro = "mes" | "periodo";

export default function FinanceiroPageSupabase() {
  const { despesas, isLoading, updateDespesaVencimento, lancarERP, estornarLancamento } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch] = useState("");
  // Lançamento ERP
  const [filtroLancamento, setFiltroLancamento] = useState<"todos" | "lancado" | "pendente">("pendente");
  const [confirmLancar, setConfirmLancar] = useState<string | null>(null); // despesa id
  const [lancando, setLancando] = useState<Record<string, boolean>>({});
  const { currentUser } = useAppStore();

  // Ordenação
  type SortKey = "data" | "vencimento" | "funcionario" | "tipo" | "pagamento" | "cliente" | "os" | "valor" | "status" | "documento" | "cartao";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Filtros por coluna
  const [colFilters, setColFilters] = useState<Partial<Record<SortKey, string>>>({});
  const [filterOpen, setFilterOpen] = useState<SortKey | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      // Fechar popover de filtro ao clicar fora — mas nunca ao clicar no modal de lançamento
      if (modalRef.current && modalRef.current.contains(e.target as Node)) return;
      const target = e.target as HTMLElement;
      // Fechar se o clique não foi num popover de filtro de coluna
      if (!target.closest("[data-filter-popover]")) {
        setFilterOpen(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleLancar = async (id: string) => {
    if (!currentUser?.id) return;
    setLancando((prev) => ({ ...prev, [id]: true }));
    await lancarERP(id, currentUser.id);
    setLancando((prev) => ({ ...prev, [id]: false }));
    setConfirmLancar(null);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

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

  // Cards: Total de Despesas, Total Aprovado, Total Lançado
  const totalDespesasQtd = todasDespesas.length;
  const totalDespesasValor = todasDespesas.reduce((s, d) => s + Number(d.valor), 0);

  const totalAprovadoQtd = despesasAprovadas.length;
  // totalAprovado já calculado acima

  const despesasLancadas = todasDespesas.filter((d) => d.lancado_erp);
  const totalLancadoQtd = despesasLancadas.length;
  const totalLancadoValor = despesasLancadas.reduce((s, d) => s + Number(d.valor), 0);


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

  // Aplica filtros por coluna e ordenação
  const despesasExibidas = useMemo(() => {
    let list = despesasFiltradas;

    // Filtro lançamento
    if (filtroLancamento === "lancado")  list = list.filter((d) => d.lancado_erp);
    if (filtroLancamento === "pendente") list = list.filter((d) => !d.lancado_erp);

    // Filtros por coluna
    Object.entries(colFilters).forEach(([key, val]) => {
      if (!val) return;
      const v = val.toLowerCase();
      list = list.filter((d) => {
        const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
        const tecnico = profiles.find((p) => p.id === d.tecnico_id);
        const sg = getStatusGeral(d.status_erp ?? "", d.status_aprovacao);
        switch (key as SortKey) {
          case "data":        return formatDate(d.data_despesa).includes(v);
          case "vencimento":  return d.data_vencimento ? formatDate(d.data_vencimento).includes(v) : false;
          case "funcionario": return (tecnico?.nome || "").toLowerCase().includes(v);
          case "tipo":        return (tipo?.nome || "").toLowerCase().includes(v);
          case "pagamento":   return (pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"]?.label || "").toLowerCase().includes(v);
          case "cliente":     return d.cliente.toLowerCase().includes(v);
          case "os":          return (d.numero_os || "").toLowerCase().includes(v);
          case "valor":       return formatCurrency(Number(d.valor)).includes(v);
          case "status":      return (statusGeralConfig[sg]?.label || "").toLowerCase().includes(v);
          case "documento":   return (d.documento || "").toLowerCase().includes(v);
          case "cartao": {
            const c = d.cartao;
            const label = c ? `${c.banco} ${c.bandeira} ${c.ultimos_digitos}`.toLowerCase() : "";
            return label.includes(v);
          }
          default: return true;
        }
      });
    });

    // Ordenação
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const tipo_a = tiposDespesa.find((t) => t.id === a.tipo_despesa_id);
        const tipo_b = tiposDespesa.find((t) => t.id === b.tipo_despesa_id);
        const tec_a  = profiles.find((p) => p.id === a.tecnico_id);
        const tec_b  = profiles.find((p) => p.id === b.tecnico_id);
        let va: string | number = "";
        let vb: string | number = "";
        switch (sortKey) {
          case "data":        va = a.data_despesa;  vb = b.data_despesa; break;
          case "vencimento":  va = a.data_vencimento || ""; vb = b.data_vencimento || ""; break;
          case "funcionario": va = tec_a?.nome || ""; vb = tec_b?.nome || ""; break;
          case "tipo":        va = tipo_a?.nome || ""; vb = tipo_b?.nome || ""; break;
          case "pagamento":   va = pagamentoTipoConfig[a.pagamento_tipo ?? "cartao"]?.label || ""; vb = pagamentoTipoConfig[b.pagamento_tipo ?? "cartao"]?.label || ""; break;
          case "cliente":     va = a.cliente; vb = b.cliente; break;
          case "os":          va = a.numero_os || ""; vb = b.numero_os || ""; break;
          case "valor":       va = Number(a.valor); vb = Number(b.valor); break;
          case "status":      va = getStatusGeral(a.status_erp ?? "", a.status_aprovacao); vb = getStatusGeral(b.status_erp ?? "", b.status_aprovacao); break;
          case "documento":   va = a.documento || ""; vb = b.documento || ""; break;
          case "cartao": {
            const ca = a.cartao; const cb = b.cartao;
            va = ca ? `${ca.banco} ${ca.bandeira} ${ca.ultimos_digitos}` : "";
            vb = cb ? `${cb.banco} ${cb.bandeira} ${cb.ultimos_digitos}` : "";
            break;
          }
        }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [despesasFiltradas, colFilters, sortKey, sortDir, tiposDespesa, profiles, filtroLancamento]);

  const totalFiltrado = despesasExibidas.reduce((s, d) => s + Number(d.valor), 0);

  const handleExportarXLSX = () => {
    const dados = despesasFiltradas.map((d) => {
      const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
      const tecnico = profiles.find((p) => p.id === d.tecnico_id);
      const cartao = d.cartao;
      const cartaoLabel = cartao
        ? `${cartao.banco} — ${cartao.bandeira} — **** ${cartao.ultimos_digitos}`
        : "-";
      return {
        Data: formatDate(d.data_despesa),
        Vencimento: d.data_vencimento ? formatDate(d.data_vencimento) : "-",
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
        "Data Envio": d.data_envio ? formatDateTime(d.data_envio) : "-",
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
        formatDate(d.data_despesa),
        d.data_vencimento ? formatDate(d.data_vencimento) : "-",
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
        d.data_envio ? formatDateTime(d.data_envio) : "-",
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
    <>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total de Despesas */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalDespesasValor)}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">Total de Despesas</p>
            <span className="text-xs font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {totalDespesasQtd} {totalDespesasQtd === 1 ? "despesa" : "despesas"}
            </span>
          </div>
        </div>

        {/* Total Aprovado */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAprovado)}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">Total Aprovado</p>
            <span className="text-xs font-semibold bg-success/10 text-success px-2 py-0.5 rounded-full">
              {totalAprovadoQtd} {totalAprovadoQtd === 1 ? "despesa" : "despesas"}
            </span>
          </div>
        </div>

        {/* Total Lançado */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
            <SendHorizonal className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalLancadoValor)}</p>
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground">Total Lançado</p>
            <span className="text-xs font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {totalLancadoQtd} {totalLancadoQtd === 1 ? "despesa" : "despesas"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Lista de despesas ── */}
      <div className="bg-white rounded-xl border border-border shadow-sm">

        {/* Cabeçalho da lista */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Todas as Despesas — Confronto com Comprovante</h2>
            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
              <p className="text-xs text-muted-foreground">{despesasExibidas.length} despesa{despesasExibidas.length !== 1 ? "s" : ""} no período</p>
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
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <select
                value={filtroLancamento}
                onChange={(e) => setFiltroLancamento(e.target.value as "todos" | "lancado" | "pendente")}
                className="pl-9 pr-8 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="todos">Todos</option>
                <option value="lancado">Lançado</option>
                <option value="pendente">Pendentes</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
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
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "calc(100vh - 320px)", minHeight: "400px" }}>
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                {(
                  [
                    { key: null,          label: "Lançar",      align: "left"  },
                    { key: "data",        label: "Data",        align: "left"  },
                    { key: "vencimento",  label: "Vencimento",  align: "left"  },
                    { key: "funcionario", label: "Funcionário",  align: "left"  },
                    { key: "tipo",        label: "Tipo",        align: "left"  },
                    { key: "pagamento",   label: "Pagamento",   align: "left"  },
                    { key: "cliente",     label: "Cliente",     align: "left"  },
                    { key: "os",          label: "OS",          align: "left"  },
                    { key: "valor",       label: "Valor",       align: "right" },
                    { key: "documento",    label: "Documento",   align: "left"  },
                    { key: "cartao",      label: "Cartão",      align: "left"  },
                    { key: "status",      label: "Status",      align: "left"  },
                    { key: null,          label: "Comprovante", align: "left"  },
                    { key: null,          label: "Status ERP",  align: "left"  },
                    { key: null,          label: "Envio",       align: "left"  },
                    { key: null,          label: "ERP ID",      align: "left"  },
                  ] as { key: SortKey | null; label: string; align: "left" | "right" }[]
                ).map(({ key, label, align }) => (
                  <th
                    key={label}
                    className={`px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap ${align === "right" ? "text-right" : "text-left"}`}
                  >
                    <div className={`flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
                      {key ? (
                        <button
                          type="button"
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-0.5 hover:text-foreground transition-colors"
                        >
                          <span>{label}</span>
                          {sortKey === key ? (
                            sortDir === "asc"
                              ? <ChevronUp className="w-3 h-3" />
                              : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronsUpDown className="w-3 h-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        <span>{label}</span>
                      )}
                      {key && (
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFilterOpen(filterOpen === key ? null : key); }}
                            className={`p-0.5 rounded hover:bg-background transition-colors ${colFilters[key] ? "text-primary" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
                            title="Filtrar"
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                          {filterOpen === key && (
                            <div data-filter-popover className="absolute left-0 top-full mt-1 z-50 bg-background border border-input rounded-lg shadow-lg p-2 min-w-36">
                              <input
                                autoFocus
                                type="text"
                                placeholder={`Filtrar ${label}...`}
                                value={colFilters[key] || ""}
                                onChange={(e) => setColFilters((f) => ({ ...f, [key]: e.target.value }))}
                                className="w-full px-2 py-1 text-xs rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              {colFilters[key] && (
                                <button
                                  type="button"
                                  onClick={() => { setColFilters((f) => { const n = { ...f }; delete n[key]; return n; }); setFilterOpen(null); }}
                                  className="mt-1 text-xs text-destructive hover:underline w-full text-left"
                                >
                                  Limpar filtro
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {despesasExibidas.map((d) => {
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
                  NaoEnviadoERP:               "bg-muted/30 text-muted-foreground",
                }[d.status_erp ?? ""] ?? "bg-muted/20 text-muted-foreground";

                const statusErpLabel: Record<string, string> = {
                  Rascunho:                    "Rascunho",
                  EnviadoAguardandoGestor:     "Aguardando Gestor",
                  AprovadoGestorERPAtualizado: "Aprovado",
                  ErroAtualizarERP:            "Erro ao Atualizar",
                  ErroEnvioERP:                "Erro de Envio",
                  NaoEnviadoERP:               "Não Enviado ao ERP",
                };

                const aprovado = sg === "aprovado";

                return (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/20 transition">
                    {/* Coluna Lançar — primeira */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.lancado_erp ? (() => {
                        const lancadoPorProfile = profiles.find((p) => p.id === d.lancado_erp_por);
                        const lancadoEm = d.lancado_erp_em
                          ? new Date(d.lancado_erp_em).toLocaleString("pt-BR")
                          : null;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-success">
                                <Check className="w-3.5 h-3.5" /> Lançado
                              </span>
                              <button
                                type="button"
                                title="Estornar lançamento"
                                onClick={() => estornarLancamento(d.id)}
                                className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                            {lancadoPorProfile && (
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {lancadoPorProfile.nome}
                              </span>
                            )}
                            {lancadoEm && (
                              <span className="text-[10px] text-muted-foreground leading-tight">
                                {lancadoEm}
                              </span>
                            )}
                          </div>
                        );
                      })() : aprovado ? (
                        <button
                          type="button"
                          disabled={lancando[d.id]}
                          title="Lançar no ERP (M8)"
                          onClick={() => setConfirmLancar(d.id)}
                          className="inline-flex items-center justify-center p-1.5 rounded-lg text-primary border border-primary/20 bg-primary/10 hover:bg-primary hover:text-white transition disabled:opacity-50"
                        >
                          <SendHorizonal className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span
                          title="Despesa não aprovada — aguarde a aprovação para lançar"
                          className="inline-flex items-center justify-center p-1.5 rounded-lg text-muted-foreground border border-border bg-muted/30 cursor-not-allowed opacity-50"
                        >
                          <SendHorizonal className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{formatDate(d.data_despesa)}</td>
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
                    {/* Status ERP */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {!d.lancado_erp ? (
                        <span className="text-muted-foreground">—</span>
                      ) : d.status_erp ? (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusErpCls}`}>
                          {statusErpLabel[d.status_erp] ?? d.status_erp}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-muted/30 text-muted-foreground">
                          Não Enviado ao ERP
                        </span>
                      )}
                    </td>
                    {/* Envio — futuramente retorna a data de integração com o ERP */}
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {d.data_envio ? formatDateTime(d.data_envio) : "—"}
                    </td>
                    {/* ERP ID — futuramente retorna o número do documento gerado pelo ERP */}
                    <td className="px-3 py-2 whitespace-nowrap font-mono">
                      {d.erp_id
                        ? <span className="text-success font-semibold">{d.erp_id}</span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
              {despesasExibidas.length === 0 && (
                <tr>
                  <td colSpan={16} className="px-3 py-10 text-center text-muted-foreground">
                    Nenhuma despesa encontrada no período
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    {/* ���─ Modal de lançamento ── */}
    {confirmLancar && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div ref={modalRef} className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md p-6 flex flex-col gap-5">

          {/* Cabeçalho */}
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Lançar despesa</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Escolha como deseja registrar esta despesa. O status será atualizado para <strong>Lançado</strong> e o responsável e data/hora do lançamento serão registrados.
              </p>
            </div>
          </div>

          {/* Opções */}
          <div className="flex flex-col gap-3">
            {/* Lançar apenas */}
            <button
              type="button"
              disabled={!!lancando[confirmLancar as string]}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirmLancar) handleLancar(confirmLancar); }}
              className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition text-left disabled:opacity-50"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                <Check className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {lancando[confirmLancar as string] ? "Lançando..." : "Lançar"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registra o lançamento da despesa no sistema. O status é atualizado para Lançado e a despesa fica disponível para conferência pelo financeiro.
                </p>
              </div>
            </button>

            {/* Lançar e enviar ao ERP */}
            <button
              type="button"
              disabled={!!lancando[confirmLancar as string]}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirmLancar) handleLancar(confirmLancar); }}
              className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition text-left disabled:opacity-50"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center mt-0.5">
                <SendHorizonal className="w-4 h-4 text-accent" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Lançar e Enviar ao ERP</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lança a despesa e envia automaticamente ao sistema ERP (M8). A integração automática está em desenvolvimento — o lançamento será registrado e a sincronização ocorrerá em breve.
                </p>
              </div>
            </button>
          </div>

          {/* Cancelar */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirmLancar(null)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition"
            >
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>

        </div>
      </div>
    )}
    </>
  );
}
