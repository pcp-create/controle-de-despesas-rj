"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useFiltrosPersistidos } from "@/lib/supabase/use-filtros-persistidos";
import type { FiltrosFinanceiro } from "@/lib/supabase/use-filtros-persistidos";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth-context";
import { formatCurrency, formatDate, getStatusGeral, statusGeralConfig, pagamentoTipoConfig } from "@/lib/helpers";
import { DollarSign, TrendingUp, Search, Eye, CalendarDays, Pencil, Check, X, ChevronUp, ChevronDown, ChevronsUpDown, Filter, SendHorizonal, RotateCcw, AlertCircle, AlertTriangle, Clock, Send, CheckCircle, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ModoFiltro = "mes" | "periodo";

export default function FinanceiroPageSupabase() {
  const { despesas, isLoading, updateDespesaDocumento, updateDespesaVencimento, lancarSistema, lancarERP, tentarNovamenteERP, estornarLancamento } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch] = useState("");
  // Lançamento ERP
  const [filtroLancamento, setFiltroLancamento] = useState<"todos" | "pendente" | "lancado" | "integrado">("todos");
  const [confirmLancar, setConfirmLancar] = useState<string | null>(null); // despesa id
  const [confirmNFERP, setConfirmNFERP] = useState(false); // alerta NF antes de enviar ao ERP (modal lançar)
  const [confirmNFERPDireto, setConfirmNFERPDireto] = useState<string | null>(null); // id da despesa aguardando confirmação NF no envio direto
  const [lancando, setLancando] = useState<Record<string, boolean>>({});
  const [erroLancar, setErroLancar] = useState<string | null>(null);
  const [enviandoERP, setEnviandoERP] = useState<Record<string, boolean>>({});
  const [erroERP, setErroERP] = useState<Record<string, string>>({});
  const [feedbackERP, setFeedbackERP] = useState<{ type: "success" | "warning" | "error"; msg: string } | null>(null);
  const { currentUser } = useAppStore();
  const { user: authUser } = useAuth();

  // Ordenação
  type SortKey = "data" | "vencimento" | "funcionario" | "tipo" | "pagamento" | "cliente" | "os" | "valor" | "status" | "documento" | "cartao";
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  // Filtros por coluna — cada chave armazena um conjunto de valores selecionados
  const [colFilters, setColFilters] = useState<Partial<Record<SortKey, Set<string>>>>({});
  const [filterOpen, setFilterOpen] = useState<SortKey | null>(null);
  const [filterSearch, setFilterSearch] = useState<Partial<Record<SortKey, string>>>({});
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

  // Lança apenas no sistema interno
  const handleLancarSistema = async (id: string) => {
    const userId = authUser?.id ?? currentUser?.id;
    if (!userId) return;
    setErroLancar(null);
    setLancando((prev) => ({ ...prev, [id]: true }));
    const result = await lancarSistema(id, userId);
    if (result?.error) setErroLancar("Erro ao lançar: " + result.error);
    setLancando((prev) => ({ ...prev, [id]: false }));
    setConfirmLancar(null);
  };

  const mostrarFeedbackERP = (result: { error?: string | null; erp_id?: string; simulado?: boolean; etapa?: number | null; campos?: string[] | null }) => {
    if (result.campos && result.campos.length > 0) {
      // Validação: campos obrigatórios faltando
      setFeedbackERP({ type: "error", msg: `__campos__${JSON.stringify(result.campos)}` });
    } else if (result.simulado && result.error) {
      // Variáveis de ambiente M8 não configuradas — não altera banco
      setFeedbackERP({ type: "warning", msg: result.error });
    } else if (result.error) {
      const etapa = result.etapa != null ? ` (Etapa ${result.etapa})` : "";
      setFeedbackERP({ type: "error", msg: `Erro ao integrar com ERP M8${etapa}: ${result.error}` });
    } else {
      setFeedbackERP({ type: "success", msg: `Integração com ERP M8 concluída! ID do documento: ${result.erp_id || "—"}` });
    }
    setTimeout(() => setFeedbackERP(null), 12000);
  };

  // Lança no sistema + envia para integração ERP M8
  const handleLancarEnviarERP = async (id: string) => {
    const userId = authUser?.id ?? currentUser?.id;
    if (!userId) return;
    setErroLancar(null);
    setFeedbackERP(null);
    setLancando((prev) => ({ ...prev, [id]: true }));
    setEnviandoERP((prev) => ({ ...prev, [id]: true }));
    const result = await tentarNovamenteERP(id, userId);
    mostrarFeedbackERP(result as any);

    if (!result?.error && !result?.simulado) {
      // Integração real bem sucedida: lança no sistema também
      await lancarSistema(id, userId);
      setErroERP((prev) => { const n = { ...prev }; delete n[id]; return n; });
    } else if (result?.error && !result?.simulado && !result?.campos?.length) {
      // Erro real de integração (não é validação nem vars): lança no sistema e registra erro
      await lancarSistema(id, userId);
      setErroERP((prev) => ({ ...prev, [id]: result.error! }));
    } else {
      // Vars faltando ou campos incompletos: não lança no sistema
      setErroERP((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }

    setLancando((prev) => ({ ...prev, [id]: false }));
    setEnviandoERP((prev) => ({ ...prev, [id]: false }));
    setConfirmLancar(null);
    setConfirmNFERP(false);
  };

  // Reenvio ao ERP quando já lançado no sistema mas com erro
  const handleEnviarERP = async (id: string) => {
    const userId = authUser?.id ?? currentUser?.id;
    if (!userId) return;
    setFeedbackERP(null);
    setEnviandoERP((prev) => ({ ...prev, [id]: true }));
    const result = await tentarNovamenteERP(id, userId);
    mostrarFeedbackERP(result as any);
    if (result?.error) {
      setErroERP((prev) => ({ ...prev, [id]: result.error! }));
    } else {
      setErroERP((prev) => { const n = { ...prev }; delete n[id]; return n; });
    }
    setEnviandoERP((prev) => ({ ...prev, [id]: false }));
  };

  // Mantido para compatibilidade com estornar
  const handleLancar = async (id: string) => handleLancarSistema(id);

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

  // Estado para edição inline de documento: { [despesaId]: string }
  const [editandoDocumento, setEditandoDocumento] = useState<Record<string, string>>({});
  const [salvandoDocumento, setSalvandoDocumento] = useState<Record<string, boolean>>({});

  const OPCOES_DOCUMENTO = ["Nota Fiscal (NF)", "Cupom"];

  const handleEditarDocumento = (id: string, valorAtual: string | null) => {
    setEditandoDocumento((prev) => ({ ...prev, [id]: valorAtual || "" }));
  };
  const handleCancelarDocumento = (id: string) => {
    setEditandoDocumento((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };
  const handleSalvarDocumento = async (id: string) => {
    const novoDoc = editandoDocumento[id];
    setSalvandoDocumento((prev) => ({ ...prev, [id]: true }));
    await updateDespesaDocumento(id, novoDoc);
    setSalvandoDocumento((prev) => { const next = { ...prev }; delete next[id]; return next; });
    handleCancelarDocumento(id);
  };
  const now = new Date();
  const { filtrosSalvos: filtrosFin, carregado: carregadoFin, salvar: salvarFin } = useFiltrosPersistidos<FiltrosFinanceiro>(currentUser?.id, "financeiro");
  const aplicadoFin = useRef(false);

  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFinal, setDataFinal] = useState(() => now.toISOString().slice(0, 10));

  // Restaurar filtros salvos ao montar — roda uma única vez quando carregado=true
  useEffect(() => {
    if (!carregadoFin || aplicadoFin.current) return;
    aplicadoFin.current = true;
    if (!filtrosFin) return;
    setModoFiltro(filtrosFin.modoFiltro);
    setMesSelecionado(filtrosFin.mesSelecionado);
    setAnoSelecionado(filtrosFin.anoSelecionado);
    setDataInicial(filtrosFin.dataInicial);
    setDataFinal(filtrosFin.dataFinal);
    setFiltroLancamento(filtrosFin.filtroLancamento);
  }, [carregadoFin, filtrosFin]);

  // Salvar ao alterar qualquer filtro
  useEffect(() => {
    if (!carregadoFin || !aplicadoFin.current) return;
    salvarFin({ modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroLancamento });
  }, [modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroLancamento]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Extrai valores únicos de uma coluna para o popover de filtro — deve vir APÓS todasDespesas
  const getColValues = useCallback((key: SortKey): string[] => {
    const vals = new Set<string>();
    todasDespesas.forEach((d) => {
      const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
      const tecnico = profiles.find((p) => p.id === d.tecnico_id);
      const sg = getStatusGeral(d.status_erp ?? "", d.status_aprovacao);
      let cellVal = "";
      switch (key) {
        case "data":        cellVal = formatDate(d.data_despesa); break;
        case "vencimento":  cellVal = d.data_vencimento ? formatDate(d.data_vencimento) : "—"; break;
        case "funcionario": cellVal = tecnico?.nome || "—"; break;
        case "tipo":        cellVal = tipo?.nome || "—"; break;
        case "pagamento":   cellVal = pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"]?.label || "—"; break;
        case "cliente":     cellVal = d.cliente; break;
        case "os":          cellVal = d.numero_os || "—"; break;
        case "valor":       cellVal = formatCurrency(Number(d.valor)); break;
        case "status":      cellVal = statusGeralConfig[sg]?.label || "—"; break;
        case "documento":   cellVal = d.documento || "—"; break;
        case "cartao": {
          const c = d.cartao;
          cellVal = c ? `${c.banco} — ${c.bandeira} — **** ${c.ultimos_digitos}` : "—";
          break;
        }
      }
      if (cellVal) vals.add(cellVal);
    });
    return Array.from(vals).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [todasDespesas, tiposDespesa, profiles]);

  const toggleColFilterValue = (key: SortKey, val: string) => {
    setColFilters((prev) => {
      const current = new Set(prev[key] ?? []);
      if (current.has(val)) current.delete(val);
      else current.add(val);
      if (current.size === 0) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: current };
    });
  };

  const clearColFilter = (key: SortKey) => {
    setColFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

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
    const pagamentoLabel = (pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"]?.label || "").toLowerCase();
    const sg = getStatusGeral(d.status_erp ?? "", d.status_aprovacao);
    const statusLabel = (statusGeralConfig[sg]?.label || "").toLowerCase();
    const dataFmt = formatDate(d.data_despesa);
    const vencimentoFmt = d.data_vencimento ? formatDate(d.data_vencimento) : "";
    return (
      d.cliente.toLowerCase().includes(term) ||
      (d.numero_os || "").toLowerCase().includes(term) ||
      (tipo?.nome || "").toLowerCase().includes(term) ||
      (tecnico?.nome || "").toLowerCase().includes(term) ||
      (d.erp_id || "").toString().includes(term) ||
      (d.documento || "").toLowerCase().includes(term) ||
      cartaoLabel.includes(term) ||
      pagamentoLabel.includes(term) ||
      statusLabel.includes(term) ||
      dataFmt.includes(term) ||
      vencimentoFmt.includes(term) ||
      formatCurrency(Number(d.valor)).includes(term)
    );
  });

  // Contadores dos 3 status ERP (sobre todas as despesas do período filtrado)
  const qtdErpPendente  = despesasFiltradas.filter((d) => !d.lancado_sistema).length;
  const qtdErpLancado   = despesasFiltradas.filter((d) => d.lancado_sistema && d.erp_status !== "integrado").length;
  const qtdErpIntegrado = despesasFiltradas.filter((d) => d.erp_status === "integrado").length;

  // Aplica filtros por coluna e ordenação
  const despesasExibidas = useMemo(() => {
    let list = despesasFiltradas;

    // Filtro lançamento — 3 status
    if (filtroLancamento === "pendente")  list = list.filter((d) => !d.lancado_sistema);
    if (filtroLancamento === "lancado")   list = list.filter((d) => d.lancado_sistema && d.erp_status !== "integrado");
    if (filtroLancamento === "integrado") list = list.filter((d) => d.erp_status === "integrado");

    // Filtros por coluna — cada chave tem um Set de valores permitidos
    Object.entries(colFilters).forEach(([key, selected]) => {
      if (!selected || selected.size === 0) return;
      list = list.filter((d) => {
        const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
        const tecnico = profiles.find((p) => p.id === d.tecnico_id);
        const sg = getStatusGeral(d.status_erp ?? "", d.status_aprovacao);
        let cellVal = "";
        switch (key as SortKey) {
          case "data":        cellVal = formatDate(d.data_despesa); break;
          case "vencimento":  cellVal = d.data_vencimento ? formatDate(d.data_vencimento) : "—"; break;
          case "funcionario": cellVal = tecnico?.nome || "—"; break;
          case "tipo":        cellVal = tipo?.nome || "—"; break;
          case "pagamento":   cellVal = pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"]?.label || "—"; break;
          case "cliente":     cellVal = d.cliente; break;
          case "os":          cellVal = d.numero_os || "—"; break;
          case "valor":       cellVal = formatCurrency(Number(d.valor)); break;
          case "status":      cellVal = statusGeralConfig[sg]?.label || "—"; break;
          case "documento":   cellVal = d.documento || "—"; break;
          case "cartao": {
            const c = d.cartao;
            cellVal = c ? `${c.banco} — ${c.bandeira} — **** ${c.ultimos_digitos}` : "—";
            break;
          }
          default: return true;
        }
        return selected.has(cellVal);
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
        formatDate(d.data_despesa),
        d.data_vencimento ? new Date(d.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "-",
        d.parcelado ? `${d.parcela_atual}/${d.numero_parcelas}` : "-",
        tecnico?.nome.split(" ").slice(0, 2).join(" ") || "-",
        tipo?.nome || "-",
        d.cliente,
        d.numero_os || "-",
        formatCurrency(Number(d.valor)),
        d.documento || "-",
        d.comprovante_url ? "Sim" : "Não",
        cartaoLabel,
        statusLabel,
        d.status_erp || "-",
        d.data_envio ? new Date(d.data_envio).toLocaleDateString("pt-BR") : "-",
        d.erp_id || "-",
      ];
    });

    autoTable(doc, {
      startY: 36,
      head: [["Data", "Vencimento", "Parcela", "Funcionário", "Tipo", "Cliente", "OS", "Valor", "Doc.", "Comprovante", "Cartão", "Status", "Status ERP", "Envio", "ERP ID"]],
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
          if (v === "Aguardando Aprova��ão")  { data.cell.styles.textColor = [202, 138, 4]; }
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

      {/* ── Erro de lançamento ── */}
      {erroLancar && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          <span>{erroLancar}</span>
          <button onClick={() => setErroLancar(null)} className="shrink-0 font-bold hover:opacity-70">&times;</button>
        </div>
      )}

      {/* ── Feedback ERP M8 ── */}
      {feedbackERP && (() => {
        const isCampos = feedbackERP.msg.startsWith("__campos__");
        const camposFaltando: string[] = isCampos ? JSON.parse(feedbackERP.msg.replace("__campos__", "")) : [];
        const colorCls = feedbackERP.type === "success"
          ? "bg-success/10 border-success/30 text-success"
          : feedbackERP.type === "warning"
          ? "bg-warning/10 border-warning/30 text-warning"
          : "bg-destructive/10 border-destructive/30 text-destructive";
        return (
          <div className={`flex items-start justify-between gap-3 px-4 py-3 rounded-lg border text-sm ${colorCls}`}>
            <div className="flex flex-col gap-1.5">
              {isCampos ? (
                <>
                  <p className="font-semibold">Campos obrigatórios incompletos para integração com o ERP M8:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">
                    {camposFaltando.map((campo, i) => (
                      <li key={i}>{campo}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <span>{feedbackERP.msg}</span>
              )}
            </div>
            <button onClick={() => setFeedbackERP(null)} className="shrink-0 font-bold hover:opacity-70 mt-0.5">&times;</button>
          </div>
        );
      })()}

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
          {/* Cards de status ERP */}
          <div className="grid grid-cols-3 gap-3 mb-2">
            <button
              type="button"
              onClick={() => setFiltroLancamento(filtroLancamento === "pendente" ? "todos" : "pendente")}
              className={`rounded-xl border p-3 text-left transition ${filtroLancamento === "pendente" ? "border-warning ring-1 ring-warning/30 bg-warning/5" : "border-border bg-white hover:border-warning/40"}`}
            >
              <div className="w-7 h-7 rounded-lg bg-warning/10 text-warning flex items-center justify-center mb-1.5">
                <Clock className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-foreground">{qtdErpPendente}</p>
              <p className="text-xs text-muted-foreground">Pendente</p>
            </button>
            <button
              type="button"
              onClick={() => setFiltroLancamento(filtroLancamento === "lancado" ? "todos" : "lancado")}
              className={`rounded-xl border p-3 text-left transition ${filtroLancamento === "lancado" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border bg-white hover:border-primary/40"}`}
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-1.5">
                <CheckCircle className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-foreground">{qtdErpLancado}</p>
              <p className="text-xs text-muted-foreground">Lançado</p>
            </button>
            <button
              type="button"
              onClick={() => setFiltroLancamento(filtroLancamento === "integrado" ? "todos" : "integrado")}
              className={`rounded-xl border p-3 text-left transition ${filtroLancamento === "integrado" ? "border-success ring-1 ring-success/30 bg-success/5" : "border-border bg-white hover:border-success/40"}`}
            >
              <div className="w-7 h-7 rounded-lg bg-success/10 text-success flex items-center justify-center mb-1.5">
                <Send className="w-4 h-4" />
              </div>
              <p className="text-xl font-bold text-foreground">{qtdErpIntegrado}</p>
              <p className="text-xs text-muted-foreground">Enviado ERP</p>
            </button>
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
                onChange={(e) => setFiltroLancamento(e.target.value as "todos" | "pendente" | "lancado" | "integrado")}
                className="pl-9 pr-8 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
              >
                <option value="todos">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="lancado">Lançado</option>
                <option value="integrado">Enviado ERP</option>
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
                    { key: null,          label: "Comprovante", align: "left"  },
                    { key: "cartao",      label: "Cartão",      align: "left"  },
                    { key: "status",      label: "Status",      align: "left"  },
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
                            onClick={(e) => {
                              e.stopPropagation();
                              if (filterOpen !== key) setFilterSearch((s) => ({ ...s, [key]: "" }));
                              setFilterOpen(filterOpen === key ? null : key);
                            }}
                            className={`p-0.5 rounded hover:bg-background transition-colors ${colFilters[key]?.size ? "text-primary" : "text-muted-foreground opacity-50 hover:opacity-100"}`}
                            title="Filtrar"
                          >
                            <Filter className="w-3 h-3" />
                          </button>
                          {filterOpen === key && (() => {
                            const allVals = getColValues(key);
                            const searchTerm = (filterSearch[key] || "").toLowerCase();
                            const visible = searchTerm ? allVals.filter((v) => v.toLowerCase().includes(searchTerm)) : allVals;
                            const selected = colFilters[key] ?? new Set<string>();
                            return (
                              <div
                                data-filter-popover
                                className="absolute left-0 top-full mt-1 z-50 bg-background border border-input rounded-lg shadow-xl min-w-48 max-w-64"
                                style={{ minWidth: "12rem" }}
                              >
                                {/* Busca interna */}
                                <div className="p-2 border-b border-input">
                                  <input
                                    autoFocus
                                    type="text"
                                    placeholder="Buscar..."
                                    value={filterSearch[key] || ""}
                                    onChange={(e) => setFilterSearch((s) => ({ ...s, [key]: e.target.value }))}
                                    className="w-full px-2 py-1 text-xs rounded border border-input bg-muted/30 focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                </div>
                                {/* Lista de valores */}
                                <ul className="overflow-y-auto max-h-52 py-1">
                                  {visible.length === 0 && (
                                    <li className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado</li>
                                  )}
                                  {visible.map((val) => (
                                    <li key={val}>
                                      <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50 cursor-pointer text-xs">
                                        <input
                                          type="checkbox"
                                          checked={selected.has(val)}
                                          onChange={() => toggleColFilterValue(key, val)}
                                          className="accent-primary rounded"
                                        />
                                        <span className="truncate">{val}</span>
                                      </label>
                                    </li>
                                  ))}
                                </ul>
                                {/* Rodapé */}
                                {selected.size > 0 && (
                                  <div className="border-t border-input p-2">
                                    <button
                                      type="button"
                                      onClick={() => { clearColFilter(key); setFilterOpen(null); }}
                                      className="text-xs text-destructive hover:underline w-full text-left"
                                    >
                                      Limpar filtro ({selected.size} selecionado{selected.size > 1 ? "s" : ""})
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
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
                    {/* Coluna Lançar */}
                    <td className="px-3 py-2">
                      {(() => {
                        const fmtDtHr = (iso: string) => {
                          const dt = new Date(iso);
                          return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                            + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                        };

                        return (
                          <div className="flex flex-col gap-1.5 min-w-[130px]">

                            {/* ── Linha 1: Lançamento no sistema ── */}
                            {d.lancado_sistema ? (
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-1">
                                  <span className="text-[10px] font-semibold text-success leading-none">✓ Lançado</span>
                                  {d.erp_status !== "integrado" && (
                                    <button
                                      type="button"
                                      title="Estornar lançamento"
                                      onClick={() => estornarLancamento(d.id)}
                                      className="ml-0.5 p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                                    >
                                      <RotateCcw className="w-2.5 h-2.5" />
                                    </button>
                                  )}
                                </div>
                                {d.lancado_sistema_por && (() => {
                                  const p = profiles.find((x) => x.id === d.lancado_sistema_por);
                                  return (
                                    <span className="text-[10px] text-success/70 leading-tight pl-2.5">
                                      {p ? p.nome.split(" ")[0] : "—"}
                                      {d.lancado_sistema_em && <> · {fmtDtHr(d.lancado_sistema_em)}</>}
                                    </span>
                                  );
                                })()}
                              </div>
                            ) : aprovado ? (
                              <button
                                type="button"
                                disabled={lancando[d.id]}
                                onClick={() => setConfirmLancar(d.id)}
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/10 hover:bg-primary hover:text-white transition disabled:opacity-50"
                              >
                                <SendHorizonal className="w-2.5 h-2.5" />
                                Lançar
                              </button>
                            ) : (
                              <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-muted/30 border border-border cursor-not-allowed opacity-50">
                                Aguardando aprovação
                              </span>
                            )}

                            {/* ── Linha 2: ERP M8 ── */}
                            {d.lancado_sistema && (() => {
                              const erpStatus = d.erp_status || "pendente";

                              if (erpStatus === "integrado") {
                                const p = profiles.find((x) => x.id === d.lancado_erp_por);
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-semibold text-primary leading-none">✓ Enviado ERP</span>
                                    </div>
                                    <span className="text-[10px] text-primary/70 leading-tight pl-2.5">
                                      {p ? p.nome.split(" ")[0] : "—"}
                                      {d.lancado_erp_em && <> · {fmtDtHr(d.lancado_erp_em)}</>}
                                    </span>
                                  </div>
                                );
                              }

                              if (erpStatus === "processando") {
                                return (
                                  <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 border border-warning border-t-transparent rounded-full animate-spin" />
                                    <span className="text-[10px] text-warning font-medium">Processando...</span>
                                  </div>
                                );
                              }

                              if (erpStatus === "erro") {
                                return (
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-1">
                                      <AlertCircle className="w-2.5 h-2.5 text-destructive shrink-0" />
                                      <span className="text-[10px] font-semibold text-destructive leading-none">
                                        Erro ERP{d.erp_etapa_erro ? ` (E${d.erp_etapa_erro})` : ""}
                                      </span>
                                    </div>
                                    {d.erp_erro && (
                                      <span className="text-[9px] text-destructive/70 leading-tight max-w-[128px] truncate pl-3.5" title={d.erp_erro}>
                                        {d.erp_erro}
                                      </span>
                                    )}
                                    {d.pagamento_tipo !== "faturado" && (
                                      <button
                                        type="button"
                                        disabled={enviandoERP[d.id]}
                                        onClick={() => handleEnviarERP(d.id)}
                                        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border border-destructive/30 text-destructive hover:bg-destructive hover:text-white transition disabled:opacity-50 mt-0.5"
                                      >
                                        <RotateCcw className="w-2.5 h-2.5" />
                                        Tentar novamente
                                      </button>
                                    )}
                                  </div>
                                );
                              }

                              // pendente: faturado não vai ao ERP M8 — exibe aviso informativo
                              if (d.pagamento_tipo === "faturado") return (
                                <span
                                  title="Pagamento Faturado não é enviado ao ERP M8"
                                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 px-1.5 py-0.5 italic"
                                >
                                  ERP N/A (Faturado)
                                </span>
                              );
                              const isNFDireto = /^nf$/i.test((d.documento || "").trim()) || /nota\s*fiscal/i.test((d.documento || "").trim());
                              return (
                                <button
                                  type="button"
                                  disabled={enviandoERP[d.id]}
                                  onClick={() => isNFDireto ? setConfirmNFERPDireto(d.id) : handleEnviarERP(d.id)}
                                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border border-muted text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/10 transition disabled:opacity-50"
                                >
                                  {enviandoERP[d.id]
                                    ? <span className="w-2 h-2 border border-primary border-t-transparent rounded-full animate-spin" />
                                    : <SendHorizonal className="w-2.5 h-2.5" />}
                                  Enviar ao ERP
                                </button>
                              );
                            })()}

                          </div>
                        );
                      })()}
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
                          {!d.lancado_sistema && (
                            <button
                              onClick={() => handleEditarVencimento(d.id, d.data_vencimento)}
                              title="Editar vencimento"
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition hover:bg-muted text-muted-foreground"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
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
                        ) : <span className="text-muted-foreground">��</span>;
                      })()}
                    </td>
                    <td className="px-3 py-2 max-w-32 truncate">{d.cliente}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{d.numero_os || "-"}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(Number(d.valor))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {editandoDocumento[d.id] !== undefined ? (
                        <div className="flex items-center gap-1">
                          <select
                            value={editandoDocumento[d.id]}
                            onChange={(e) => setEditandoDocumento((prev) => ({ ...prev, [d.id]: e.target.value }))}
                            className="px-2 py-1 rounded border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                          >
                            <option value="">Selecione...</option>
                            {OPCOES_DOCUMENTO.map((op) => (
                              <option key={op} value={op}>{op}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleSalvarDocumento(d.id)}
                            disabled={salvandoDocumento[d.id]}
                            title="Salvar"
                            className="p-1 rounded hover:bg-success/10 text-success disabled:opacity-40 transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleCancelarDocumento(d.id)}
                            title="Cancelar"
                            className="p-1 rounded hover:bg-destructive/10 text-destructive transition"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group">
                          {d.documento ? (
                            <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-muted/60 text-foreground font-medium">
                              {d.documento}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                          {!d.lancado_sistema && (currentUser?.perfil === "administrador" || currentUser?.perfil === "financeiro") && (
                            <button
                              onClick={() => handleEditarDocumento(d.id, d.documento)}
                              title="Editar documento"
                              className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition hover:bg-muted text-muted-foreground"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
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
                    {/* Status ERP */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {(() => {
                        const erpStatusKey = d.erp_status || "pendente";
                        const erpStatusConfigMap: Record<string, { label: string; color: string; icon: React.ElementType }> = {
                          pendente:    { label: "Pendente",          color: "bg-muted text-muted-foreground",            icon: Clock },
                          processando: { label: "Processando",       color: "bg-warning/10 text-warning",                icon: RefreshCw },
                          integrado:   { label: "Integrado",         color: "bg-success/10 text-success",                icon: CheckCircle },
                          erro:        { label: "Erro Integração",   color: "bg-destructive/10 text-destructive",        icon: AlertTriangle },
                        };
                        const cfg = erpStatusConfigMap[erpStatusKey] ?? erpStatusConfigMap["pendente"];
                        const Icon = cfg.icon;
                        const isProcessing = erpStatusKey === "processando";
                        const isError = erpStatusKey === "erro";
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${cfg.color}`}>
                              <Icon className={`w-3 h-3 ${isProcessing ? "animate-spin" : ""}`} />
                              {cfg.label}
                              {isError && d.erp_etapa_erro ? ` — E${d.erp_etapa_erro}` : ""}
                            </span>
                            {isError && d.erp_erro && (
                              <span className="text-[10px] text-destructive/70 max-w-[160px] truncate pl-1" title={d.erp_erro}>
                                {d.erp_erro}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Data Envio */}
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                      {d.lancado_erp_em
                        ? <span>{new Date(d.lancado_erp_em).toLocaleString("pt-BR")}</span>
                        : <span>—</span>
                      }
                    </td>
                    {/* ERP ID */}
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
    {/* ── Modal confirmação NF — envio direto ao ERP ── */}
    {confirmNFERPDireto && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-sm p-6 flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-warning" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Atenção — Nota Fiscal (NF)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Esta despesa foi lançada com documento <strong>Nota Fiscal (NF)</strong>. Antes de enviar ao ERP M8, verifique se esta nota fiscal ainda não foi lançada para evitar duplicidade no sistema.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmNFERPDireto(null)}
              className="px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => { const id = confirmNFERPDireto; setConfirmNFERPDireto(null); handleEnviarERP(id); }}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition"
            >
              NF verificada — Enviar ao ERP
            </button>
          </div>
        </div>
      </div>
    )}

    {confirmLancar && (() => {
      const despLancar = despesasFiltradas.find((d) => d.id === confirmLancar);
      const isFaturado = despLancar?.pagamento_tipo === "faturado";
      const isNF = /^nf$/i.test((despLancar?.documento || "").trim()) ||
                   /nota\s*fiscal/i.test((despLancar?.documento || "").trim());

      return (
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

            {/* Alerta NF */}
            {isNF && !confirmNFERP && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-warning/40 bg-warning/8">
                <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <p className="text-xs text-warning leading-relaxed">
                  Esta despesa foi lançada com documento <strong>Nota Fiscal (NF)</strong>. Antes de enviar ao ERP M8, verifique se esta nota fiscal ainda não foi lançada para evitar duplicidade no sistema.
                </p>
              </div>
            )}

            {/* Opções */}
            <div className="flex flex-col gap-3">
              {/* Lançar apenas no sistema */}
              <button
                type="button"
                disabled={!!lancando[confirmLancar as string]}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirmLancar) handleLancarSistema(confirmLancar); }}
                className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition text-left disabled:opacity-50"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center mt-0.5">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {lancando[confirmLancar as string] ? "Lançando..." : "Lançar no sistema"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Registra o lançamento internamente. Você poderá enviar ao ERP M8 separadamente depois.
                  </p>
                </div>
              </button>

              {/* Lançar e enviar ao ERP */}
              {isFaturado ? (
                <div className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-muted bg-muted/20 opacity-60 cursor-not-allowed">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center mt-0.5">
                    <SendHorizonal className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">Lançar e Enviar ao ERP (M8)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Indisponivel para despesas com pagamento <strong>Faturado</strong>. O envio ao ERP M8 nao se aplica a este tipo de pagamento.
                    </p>
                  </div>
                </div>
              ) : isNF && !confirmNFERP ? (
                <button
                  type="button"
                  disabled={!!lancando[confirmLancar as string]}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirmNFERP(true); }}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-warning/40 bg-warning/5 hover:bg-warning/10 transition text-left disabled:opacity-50"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-warning/15 flex items-center justify-center mt-0.5">
                    <SendHorizonal className="w-4 h-4 text-warning" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Lançar e Enviar ao ERP (M8)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Clique para confirmar que verificou a nota fiscal e prosseguir com o envio.
                    </p>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!!lancando[confirmLancar as string]}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (confirmLancar) { setConfirmNFERP(false); handleLancarEnviarERP(confirmLancar); } }}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-accent/30 bg-accent/5 hover:bg-accent/10 transition text-left disabled:opacity-50"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center mt-0.5">
                    <SendHorizonal className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {lancando[confirmLancar as string] ? "Processando..." : isNF ? "Confirmar — Enviar ao ERP (NF verificada)" : "Lançar e Enviar ao ERP (M8)"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isNF
                        ? "Nota fiscal verificada. Lanca no sistema e integra ao ERP M8."
                        : "Lanca no sistema e integra imediatamente ao ERP M8. As 6 etapas de integração são executadas automaticamente."}
                    </p>
                  </div>
                </button>
              )}
            </div>

            {/* Cancelar */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setConfirmLancar(null); setConfirmNFERP(false); }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium text-muted-foreground hover:bg-muted transition"
              >
                <X className="w-4 h-4" /> Cancelar
              </button>
            </div>

          </div>
        </div>
      );
    })()}
    </>
  );
}
