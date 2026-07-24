"use client";

import { useState, useMemo, useRef } from "react";
import { useDespesas, useTiposDespesa, useProfiles, useControleKm, useFrotas } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/helpers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
  CartesianGrid,
} from "recharts";
import { Calendar, Download, TrendingUp, DollarSign, Users, FileText, CalendarDays, Gauge, Route, Clock, Car, X, ChevronDown, ChevronUp, Table2 } from "lucide-react";
import { formatDate } from "@/lib/helpers";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ModoFiltro = "mes" | "periodo";

function formatKmRel(val: number): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " km";
}

function formatDuracaoRel(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

// Paleta para tipos de despesa — do mais forte ao mais suave
const TIPO_COLORS = [
  "oklch(0.45 0.22 255)",
  "oklch(0.52 0.20 255)",
  "oklch(0.58 0.18 255)",
  "oklch(0.64 0.16 255)",
  "oklch(0.70 0.14 255)",
  "oklch(0.76 0.12 255)",
  "oklch(0.82 0.10 255)",
];

const FUNC_COLORS = [
  "oklch(0.55 0.18 255)",
  "oklch(0.52 0.17 155)",
  "oklch(0.62 0.18 60)",
  "oklch(0.577 0.245 27.325)",
  "oklch(0.35 0.12 255)",
  "oklch(0.65 0.16 310)",
  "oklch(0.60 0.18 190)",
];

// Label personalizado para BarChart horizontal (rótulo ao lado da barra)
function CustomBarLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  return (
    <text
      x={x + width + 6}
      y={y + height / 2}
      fill="var(--muted-foreground)"
      fontSize={10}
      dominantBaseline="middle"
    >
      {formatCurrency(value)}
    </text>
  );
}

// Label no topo da barra vertical
function CustomTopLabel(props: any) {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text
      x={x + width / 2}
      y={y - 5}
      textAnchor="middle"
      fill="var(--muted-foreground)"
      fontSize={9}
    >
      {formatCurrency(value)}
    </text>
  );
}

// Label km horizontal
function KmBarLabel(props: any) {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  return (
    <text x={x + width + 5} y={y + height / 2} fill="var(--muted-foreground)" fontSize={10} dominantBaseline="middle">
      {value.toLocaleString("pt-BR")} km
    </text>
  );
}

export default function RelatoriosPageSupabase() {
  const { currentUser } = useAppStore();
  const isFuncionario = currentUser?.perfil === "funcionario";
  const isGestorOuAdmin = currentUser?.perfil === "administrador" || currentUser?.perfil === "gestor";

  const { despesas, isLoading } = useDespesas(isFuncionario ? currentUser?.id : undefined);
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  const { registros: registrosKm } = useControleKm();
  const { frotas } = useFrotas();

  const now = new Date();
  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFinal, setDataFinal] = useState(() => now.toISOString().slice(0, 10));

  // ── Filtros cruzados ──
  const [filtroFuncionario, setFiltroFuncionario] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);

  // ── Tabela de despesas colapsável ──
  const [tabelaAberta, setTabelaAberta] = useState(false);

  // ── Exportação PDF ──
  const [exportando, setExportando] = useState(false);

  const periodoLabel = modoFiltro === "mes"
    ? `${MESES_FULL[mesSelecionado]} ${anoSelecionado}`
    : dataInicial && dataFinal
    ? `${dataInicial.split("-").reverse().join("/")} a ${dataFinal.split("-").reverse().join("/")}`
    : "Período personalizado";

  const handleExportarPDF = async () => {
    setExportando(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      // Agrupar despesas por funcionário
      const gruposPDF: { nome: string; despesas: typeof despesasCruzadas }[] = [];
      const seenPDF = new Map<string, number>();
      despesasCruzadas.forEach((d) => {
        const key = d.tecnico_id ?? "__sem__";
        if (!seenPDF.has(key)) {
          const tec = profiles.find((p) => p.id === d.tecnico_id);
          seenPDF.set(key, gruposPDF.length);
          gruposPDF.push({ nome: tec?.nome ?? "Sem funcionário", despesas: [] });
        }
        gruposPDF[seenPDF.get(key)!].despesas.push(d);
      });
      gruposPDF.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = 210; // largura A4
      const PH = 297; // altura A4
      const ML = 14;  // margem esquerda
      const MR = 14;  // margem direita
      const CW = PW - ML - MR; // largura útil
      const BOTTOM_MARGIN = 15;

      let y = 0;

      // ── Cores do sistema (Navy Blue RJ Compressores) ──
      const C_NAVY: [number,number,number]  = [35,  55, 110]; // primary oklch(0.35 0.12 255)
      const C_AZURE: [number,number,number] = [44, 105, 210]; // accent  oklch(0.55 0.18 255)
      const C_LIGHT: [number,number,number] = [220, 230, 248]; // fundo suave

      // ── Helpers de desenho ──
      const newPage = () => {
        pdf.addPage();
        y = 14;
      };

      const checkY = (needed: number) => {
        if (y + needed > PH - BOTTOM_MARGIN) newPage();
      };

      const text = (str: string, x: number, yy: number, opts?: Parameters<typeof pdf.text>[3]) => {
        pdf.text(str, x, yy, opts);
      };

      const sectionTitle = (label: string) => {
        checkY(10);
        pdf.setFontSize(11);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...C_NAVY);
        text(label, ML, y);
        y += 1;
        pdf.setDrawColor(...C_AZURE);
        pdf.setLineWidth(0.4);
        pdf.line(ML, y, ML + CW, y);
        pdf.setTextColor(0, 0, 0);
        y += 5;
      };

      const tableHeader = (cols: { label: string; w: number; align?: "left" | "right" | "center" }[]) => {
        checkY(8);
        pdf.setFillColor(...C_LIGHT);
        pdf.rect(ML, y, CW, 6.5, "F");
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...C_NAVY);
        let cx = ML;
        cols.forEach((col) => {
          const align = col.align ?? "left";
          const tx = align === "right" ? cx + col.w - 2 : cx + 2;
          text(col.label.toUpperCase(), tx, y + 4.5, { align });
          cx += col.w;
        });
        pdf.setTextColor(0, 0, 0);
        y += 6.5;
      };

      const tableRow = (
        cols: { val: string; w: number; align?: "left" | "right" | "center"; bold?: boolean }[],
        bgGray: boolean
      ) => {
        checkY(6.5);
        if (bgGray) {
          pdf.setFillColor(245, 247, 252);
          pdf.rect(ML, y, CW, 6, "F");
        }
        pdf.setFontSize(8.5);
        pdf.setTextColor(17, 24, 39);
        let cx = ML;
        cols.forEach((col) => {
          pdf.setFont("helvetica", col.bold ? "bold" : "normal");
          const align = col.align ?? "left";
          const tx = align === "right" ? cx + col.w - 2 : cx + 2;
          const maxW = col.w - 4;
          const lines = pdf.splitTextToSize(col.val, maxW) as string[];
          text(lines[0], tx, y + 4.2, { align });
          cx += col.w;
        });
        pdf.setDrawColor(220, 226, 240);
        pdf.setLineWidth(0.1);
        pdf.line(ML, y + 6, ML + CW, y + 6);
        y += 6;
      };

      // ═══════════════════════════════
      // CABEÇALHO DA PÁGINA — logo + título
      // ═══════════════════════════════
      y = 0;
      // Fundo navy
      pdf.setFillColor(...C_NAVY);
      pdf.rect(0, 0, PW, 26, "F");

      // Logo (imagem PNG da sidebar)
      try {
        const logoUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/RJ%20Branco%202-Pn9QBwHse0Kjls3Cpbdg4mGuwo47pg.png";
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = "anonymous";
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = logoUrl;
        });
        const canvas = document.createElement("canvas");
        const scale = 20 / img.naturalHeight;
        canvas.width  = img.naturalWidth  * scale;
        canvas.height = img.naturalHeight * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const logoData = canvas.toDataURL("image/png");
        pdf.addImage(logoData, "PNG", ML, 3, canvas.width, canvas.height);
        // Título à direita da logo
        const logoW = canvas.width + 4;
        pdf.setFontSize(15);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(255, 255, 255);
        text("Relatório de Despesas", ML + logoW, 12);
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        text(periodoLabel, ML + logoW, 19);
      } catch {
        // Fallback sem logo
        pdf.setFontSize(15);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(255, 255, 255);
        text("Relatório de Despesas", ML, 12);
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "normal");
        text(periodoLabel, ML, 19);
      }

      const dataGeracao = `Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(190, 205, 235);
      text(dataGeracao, PW - MR, 19, { align: "right" });

      if (filtroFuncionario || filtroTipo) {
        const filtrosAtivos = [
          filtroFuncionario ? `Funcionário: ${profiles.find((p) => p.id === filtroFuncionario)?.nome}` : "",
          filtroTipo ? `Tipo: ${tiposDespesa.find((t) => t.id === filtroTipo)?.nome}` : "",
        ].filter(Boolean).join("  |  ");
        pdf.setTextColor(190, 205, 235);
        text(`Filtros: ${filtrosAtivos}`, ML, 23.5);
      }

      pdf.setTextColor(0, 0, 0);
      y = 32;

      // ═══════════════════════════════
      // CARDS DE RESUMO
      // ═══════════════════════════════
      const cards = [
        { label: "Total do Período",   val: formatCurrency(totalAno),       color: C_NAVY  },
        { label: "Lançamentos",         val: String(totalLancamentos),        color: [22, 163, 74]  as [number,number,number] },
        { label: "Ticket Médio",        val: formatCurrency(ticketMedio),     color: [195, 110, 10] as [number,number,number] },
        ...(isGestorOuAdmin ? [{ label: "Funcionários Ativos", val: String(tecnicosAtivos), color: C_AZURE }] : []),
      ];
      const cardW = CW / cards.length;
      cards.forEach((card, i) => {
        const cx = ML + i * cardW;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(cx, y, cardW - 2, 16, 2, 2, "F");
        pdf.setFillColor(...card.color);
        pdf.rect(cx, y, cardW - 2, 1.5, "F");
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(107, 114, 128);
        text(card.label, cx + (cardW - 2) / 2, y + 6, { align: "center" });
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...card.color);
        text(card.val, cx + (cardW - 2) / 2, y + 13, { align: "center" });
      });
      pdf.setTextColor(0, 0, 0);
      y += 22;

      // ═══════════════════════════════
      // TOP FUNCIONÁRIOS
      // ═══════════════════════════════
      if (byTecnico.length > 0) {
        sectionTitle("Top Funcionários");
        const colsFun = [
          { label: "Funcionário", w: CW * 0.55 },
          { label: "Qtd", w: CW * 0.15, align: "center" as const },
          { label: "Total", w: CW * 0.30, align: "right" as const },
        ];
        tableHeader(colsFun);
        byTecnico.forEach((t, i) => {
          tableRow([
            { val: t.nome, w: colsFun[0].w },
            { val: String(t.qtd), w: colsFun[1].w, align: "center" },
            { val: formatCurrency(t.total), w: colsFun[2].w, align: "right", bold: true },
          ], i % 2 !== 0);
        });
        y += 6;
      }

      // ═══════════════════════════════
      // POR TIPO DE DESPESA
      // ═══════════════════════════════
      if (byTipo.length > 0) {
        sectionTitle("Por Tipo de Despesa");
        const colsTipo = [
          { label: "Tipo", w: CW * 0.55 },
          { label: "Total", w: CW * 0.25, align: "right" as const },
          { label: "%", w: CW * 0.20, align: "right" as const },
        ];
        tableHeader(colsTipo);
        byTipo.forEach((t, i) => {
          tableRow([
            { val: t.name, w: colsTipo[0].w },
            { val: formatCurrency(t.valor), w: colsTipo[1].w, align: "right", bold: true },
            { val: totalAno > 0 ? ((t.valor / totalAno) * 100).toFixed(1) + "%" : "—", w: colsTipo[2].w, align: "right" },
          ], i % 2 !== 0);
        });
        y += 6;
      }

      // ═══════════════════════════════
      // EVOLUÇÃO MENSAL
      // ═══════════════════════════════
      sectionTitle(`Evolução Mensal — ${anoSelecionado}`);
      const mesW = CW / 12;
      // Cabeçalho meses
      checkY(14);
      pdf.setFillColor(243, 244, 246);
      pdf.rect(ML, y, CW, 6, "F");
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(107, 114, 128);
      MESES.forEach((m, i) => text(m, ML + i * mesW + mesW / 2, y + 4.2, { align: "center" }));
      y += 6;
      // Valores
      pdf.setFontSize(7.5);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(17, 24, 39);
      byMes.forEach((m, i) => {
        const val = m.valor > 0 ? (m.valor >= 1000 ? `R$${(m.valor / 1000).toFixed(1)}k` : formatCurrency(m.valor)) : "—";
        if (m.valor > 0) {
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(37, 99, 235);
        } else {
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(156, 163, 175);
        }
        text(val, ML + i * mesW + mesW / 2, y + 4.5, { align: "center" });
      });
      pdf.setTextColor(0, 0, 0);
      y += 12;

      // ═══════════════════════════════
      // TABELA AGRUPADA POR FUNCIONÁRIO
      // ═══════════════════════════════
      sectionTitle(`Despesas do Período (${despesasTabela.length} registros)`);

      // Colunas do PDF: Valor na última posição, sem Aprovador/Data Aprovação e sem Status
      const colsDesp = [
        { label: "Data",       w: CW * 0.12 },
        { label: "Tipo",       w: CW * 0.20 },
        { label: "Cliente",    w: CW * 0.27 },
        { label: "OS",         w: CW * 0.12 },
        { label: "Observação", w: CW * 0.29 },
        { label: "Valor",      w: CW * 0.18, align: "right" as const },
      ];

      gruposPDF.forEach((grupo) => {
        const subtotal = grupo.despesas.reduce((s, d) => s + Number(d.valor), 0);
        const qtd = grupo.despesas.length;

        // Linha do funcionário
        checkY(8);
        pdf.setFillColor(...C_LIGHT);
        pdf.rect(ML, y, CW, 7, "F");
        pdf.setFontSize(9.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...C_NAVY);
        text(grupo.nome, ML + 2, y + 5);
        text(`${formatCurrency(subtotal)}  •  ${qtd} ${qtd === 1 ? "despesa" : "despesas"}`, ML + CW - 2, y + 5, { align: "right" });
        pdf.setTextColor(0, 0, 0);
        y += 7;

        // Cabeçalho colunas (apenas no primeiro grupo de cada página se necessário)
        tableHeader(colsDesp);

        grupo.despesas
          .slice()
          .sort((a, b) => a.data_despesa.localeCompare(b.data_despesa))
          .forEach((d, i) => {
            const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
            const rowData = [
              { val: formatDate(d.data_despesa),        w: colsDesp[0].w },
              { val: tipo?.nome ?? "—",                 w: colsDesp[1].w },
              { val: d.cliente,                         w: colsDesp[2].w },
              { val: d.numero_os ?? "—",                w: colsDesp[3].w },
              { val: d.observacao ?? "—",               w: colsDesp[4].w },
              { val: formatCurrency(Number(d.valor)),   w: colsDesp[5].w, align: "right" as const, bold: true },
            ];
            tableRow(rowData, i % 2 !== 0);
          });

        y += 4;
      });

      // ── Total geral ──
      checkY(10);
      pdf.setFillColor(...C_NAVY);
      pdf.rect(ML, y, CW, 9, "F");
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      text(`Total Geral  •  ${despesasTabela.length} despesas  •  ${gruposPDF.length} funcionários`, ML + 2, y + 6);
      text(formatCurrency(despesasTabela.reduce((s, d) => s + Number(d.valor), 0)), ML + CW - 2, y + 6, { align: "right" });

      // ── Número de páginas ──
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        pdf.setPage(pg);
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...C_AZURE);
        pdf.text(`Página ${pg} de ${totalPages}`, PW / 2, PH - 5, { align: "center" });
      }

      const nomeArquivo = `relatorio-despesas-${periodoLabel.replace(/[\s/]/g, "-").toLowerCase()}.pdf`;
      pdf.save(nomeArquivo);
    } catch (err) {
      console.error("[v0] Erro ao exportar PDF:", err);
    } finally {
      setExportando(false);
    }
  };

  const anos = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  const despesasAprovadas = useMemo(() => {
    return despesas.filter((d) => d.status_aprovacao === "AprovadoGestor");
  }, [despesas]);

  const despesasAno = useMemo(() => {
    return despesas.filter((d) => {
      if (d.status_aprovacao !== "AprovadoGestor") return false;
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

  // Despesas após filtros cruzados (apenas aprovadas — usadas nos gráficos e cards)
  const despesasCruzadas = useMemo(() => {
    return despesasAno.filter((d) => {
      if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
      if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
      return true;
    });
  }, [despesasAno, filtroFuncionario, filtroTipo]);

  // Todas as despesas enviadas do período (exceto rascunho) — usadas na tabela
  const despesasTabela = useMemo(() => {
    return despesas.filter((d) => {
      // Exclui apenas rascunhos (nunca enviados)
      if (d.status_erp === "Rascunho" && d.status_aprovacao === "AguardandoGestor" && !d.data_envio) return false;
      const dataStr = (d.data_despesa || d.created_at || "").slice(0, 10);
      if (modoFiltro === "mes") {
        const dt = new Date(dataStr + "T00:00:00");
        if (dt.getMonth() !== mesSelecionado || dt.getFullYear() !== anoSelecionado) return false;
      } else {
        if (dataInicial && dataStr < dataInicial) return false;
        if (dataFinal && dataStr > dataFinal) return false;
      }
      if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
      if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
      return true;
    });
  }, [despesas, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroFuncionario, filtroTipo]);

  const totalAno = despesasCruzadas.reduce((s, d) => s + Number(d.valor), 0);
  const totalLancamentos = despesasCruzadas.length;
  const ticketMedio = totalLancamentos > 0 ? totalAno / totalLancamentos : 0;
  const tecnicosAtivos = new Set(despesasCruzadas.map((d) => d.tecnico_id)).size;

  // Evolução mensal — usa anoSelecionado para respeitar o filtro de ano do topo
  const byMes = useMemo(() => {
    return MESES.map((m, i) => ({
      mes: m,
      valor: despesasAprovadas
        .filter((d) => {
          const dt = new Date(d.data_despesa + "T12:00:00");
          if (dt.getMonth() !== i || dt.getFullYear() !== anoSelecionado) return false;
          if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
          if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
          return true;
        })
        .reduce((s, d) => s + Number(d.valor), 0),
    }));
  }, [despesasAprovadas, anoSelecionado, filtroFuncionario, filtroTipo]);

  // Por tipo — filtrado pelo funcionário selecionado
  const byTipo = useMemo(() => {
    return tiposDespesa.map((t) => ({
      id: t.id,
      name: t.nome,
      valor: despesasAno
        .filter((d) => {
          if (d.tipo_despesa_id !== t.id) return false;
          if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
          return true;
        })
        .reduce((s, d) => s + Number(d.valor), 0),
    }))
    .filter((x) => x.valor > 0)
    .sort((a, b) => b.valor - a.valor);
  }, [tiposDespesa, despesasAno, filtroFuncionario]);

  // Por funcionário — filtrado pelo tipo selecionado
  const byTecnico = useMemo(() => {
    return profiles
      .map((u) => {
        const du = despesasAno.filter((d) => {
          if (d.tecnico_id !== u.id) return false;
          if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
          return true;
        });
        return {
          id: u.id,
          nome: u.nome.split(" ").slice(0, 2).join(" "),
          total: du.reduce((s, d) => s + Number(d.valor), 0),
          qtd: du.length,
        };
      })
      .filter((u) => u.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [profiles, despesasAno, filtroTipo]);

  // KM filtrado
  const registrosKmFiltrados = useMemo(() => {
    return registrosKm.filter((r) => {
      if (r.status !== "finalizado") return false;
      if (!isGestorOuAdmin && currentUser?.id && r.usuario_id !== currentUser.id) return false;
      const dataStr = r.data_inicio.slice(0, 10);
      if (modoFiltro === "mes") {
        const dt = new Date(dataStr + "T00:00:00");
        return dt.getMonth() === mesSelecionado && dt.getFullYear() === anoSelecionado;
      } else {
        if (dataInicial && dataStr < dataInicial) return false;
        if (dataFinal && dataStr > dataFinal) return false;
        return true;
      }
    });
  }, [registrosKm, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, isGestorOuAdmin, currentUser]);

  const totalKmPeriodo = useMemo(() => registrosKmFiltrados.reduce((s, r) => s + (r.km_percorrido ?? 0), 0), [registrosKmFiltrados]);
  const totalViagens = registrosKmFiltrados.length;
  const mediaKmViagem = totalViagens > 0 ? totalKmPeriodo / totalViagens : 0;
  const totalMinutos = registrosKmFiltrados.reduce((s, r) => s + (r.duracao_minutos ?? 0), 0);

  const kmByMes = useMemo(() => {
    return MESES.map((m, i) => ({
      mes: m,
      km: registrosKm
        .filter((r) => {
          if (r.status !== "finalizado") return false;
          if (!isGestorOuAdmin && currentUser?.id && r.usuario_id !== currentUser.id) return false;
          const dt = new Date(r.data_inicio);
          return dt.getMonth() === i && dt.getFullYear() === anoSelecionado;
        })
        .reduce((s, r) => s + (r.km_percorrido ?? 0), 0),
    }));
  }, [registrosKm, isGestorOuAdmin, currentUser, anoSelecionado]);

  const kmByFrota = useMemo(() => {
    return frotas
      .map((f) => ({
        nome: f.placa,
        km: registrosKmFiltrados.filter((r) => r.frota_id === f.id).reduce((s, r) => s + (r.km_percorrido ?? 0), 0),
      }))
      .filter((f) => f.km > 0)
      .sort((a, b) => b.km - a.km)
      .slice(0, 8);
  }, [frotas, registrosKmFiltrados]);

  const kmByFuncionario = useMemo(() => {
    if (!isGestorOuAdmin) return [];
    return profiles
      .map((p) => ({
        nome: p.nome.split(" ").slice(0, 2).join(" "),
        km: registrosKmFiltrados.filter((r) => r.usuario_id === p.id).reduce((s, r) => s + (r.km_percorrido ?? 0), 0),
      }))
      .filter((p) => p.km > 0)
      .sort((a, b) => b.km - a.km)
      .slice(0, 8);
  }, [profiles, registrosKmFiltrados, isGestorOuAdmin]);

  const filtroFuncionarioNome = filtroFuncionario ? profiles.find((p) => p.id === filtroFuncionario)?.nome : null;
  const filtroTipoNome = filtroTipo ? tiposDespesa.find((t) => t.id === filtroTipo)?.nome : null;
  const temFiltroAtivo = !!filtroFuncionario || !!filtroTipo;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isFuncionario ? "Suas despesas aprovadas" : "Análise de despesas aprovadas"} &mdash;{" "}
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
          <div className="flex items-center gap-2 sm:self-end">
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
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
            <button
              onClick={handleExportarPDF}
              disabled={exportando}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input bg-white text-xs hover:bg-muted transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {exportando ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  Exportar PDF
                </>
              )}
            </button>
          </div>

          {modoFiltro === "mes" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />
              </div>
              <select value={mesSelecionado} onChange={(e) => setMesSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {MESES_FULL.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={anoSelecionado} onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input type="date" value={dataInicial} onChange={(e) => setDataInicial(e.target.value)}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm" />
              <span className="text-xs text-muted-foreground">até</span>
              <input type="date" value={dataFinal} onChange={(e) => setDataFinal(e.target.value)}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm" />
            </div>
          )}
        </div>
      </div>

      {/* Banner de filtros cruzados ativos */}
      {temFiltroAtivo && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl text-sm flex-wrap">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide mr-1">Filtrando por:</span>
          {filtroFuncionarioNome && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-white rounded-full text-xs font-medium">
              {filtroFuncionarioNome}
              <button onClick={() => setFiltroFuncionario(null)} className="hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filtroTipoNome && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-accent text-white rounded-full text-xs font-medium">
              {filtroTipoNome}
              <button onClick={() => setFiltroTipo(null)} className="hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          <button onClick={() => { setFiltroFuncionario(null); setFiltroTipo(null); }}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">
            Limpar filtros
          </button>
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <DollarSign className="w-5 h-5" />, value: formatCurrency(totalAno), label: "Total do Período", bg: "bg-primary/10", color: "text-primary" },
          { icon: <FileText className="w-5 h-5" />, value: totalLancamentos, label: "Lançamentos", bg: "bg-accent/10", color: "text-accent" },
          { icon: <TrendingUp className="w-5 h-5" />, value: formatCurrency(ticketMedio), label: "Ticket Médio", bg: "bg-success/10", color: "text-success" },
          ...(!isFuncionario ? [{ icon: <Users className="w-5 h-5" />, value: tecnicosAtivos, label: "Funcionários Ativos", bg: "bg-warning/10", color: "text-warning" }] : []),
        ].map(({ icon, value, label, bg, color }) => (
          <div key={label} className="bg-white rounded-xl border border-border shadow-sm p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} ${color} flex items-center justify-center mb-3`}>{icon}</div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Gráfico evolução mensal */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-foreground">
            Evolução Mensal — {anoSelecionado}
          </h2>
          <span className="text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatCurrency(byMes.reduce((s, m) => s + m.valor, 0))}</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          Todos os meses do ano selecionado{temFiltroAtivo ? " com filtros cruzados ativos" : ""}
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={byMes} margin={{ top: 36, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gradMensal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.55 0.18 255)" stopOpacity={0.18} />
                <stop offset="95%" stopColor="oklch(0.55 0.18 255)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={72}
              tickFormatter={(v) => v === 0 ? "R$0" : `R$${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(v: number) => [formatCurrency(v), "Total"]}
              contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}
              labelStyle={{ fontWeight: 600, color: "var(--foreground)" }}
            />
            <Area
              type="monotone"
              dataKey="valor"
              stroke="oklch(0.48 0.22 255)"
              strokeWidth={2.5}
              fill="url(#gradMensal)"
              dot={{ fill: "oklch(0.48 0.22 255)", r: 5, strokeWidth: 2, stroke: "white" }}
              activeDot={{ r: 7, stroke: "oklch(0.48 0.22 255)", strokeWidth: 2, fill: "white" }}
              label={(props: any) => {
                const { x, y, value } = props;
                if (!value || value === 0) return null;
                return (
                  <g>
                    <rect
                      x={x - 28}
                      y={y - 28}
                      width={56}
                      height={20}
                      rx={4}
                      fill="oklch(0.48 0.22 255)"
                      opacity={0.92}
                    />
                    <text
                      x={x}
                      y={y - 14}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={10}
                      fontWeight={600}
                      fill="white"
                    >
                      {value >= 1000 ? `R$${(value / 1000).toFixed(1)}k` : formatCurrency(value)}
                    </text>
                  </g>
                );
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Por tipo + Top Funcionários lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Por Tipo de Despesa — BarChart horizontal, mais visual */}
        {byTipo.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">Por Tipo de Despesa</h2>
              {filtroTipo && (
                <button onClick={() => setFiltroTipo(null)} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">Clique numa barra para filtrar os demais gráficos</p>
            <ResponsiveContainer width="100%" height={Math.max(200, byTipo.length * 42)}>
              <BarChart data={byTipo} layout="vertical" barSize={22} margin={{ right: 90, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Total"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar
                  dataKey="valor"
                  radius={[0, 6, 6, 0]}
                  cursor="pointer"
                  onClick={(data) => setFiltroTipo(filtroTipo === data.id ? null : data.id)}
                >
                  <LabelList dataKey="valor" content={<CustomBarLabel />} />
                  {byTipo.map((entry, i) => (
                    <Cell
                      key={entry.id}
                      fill={TIPO_COLORS[Math.min(i, TIPO_COLORS.length - 1)]}
                      opacity={filtroTipo && filtroTipo !== entry.id ? 0.3 : 1}
                      stroke={filtroTipo === entry.id ? "oklch(0.35 0.22 255)" : "transparent"}
                      strokeWidth={filtroTipo === entry.id ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Funcionários */}
        {!isFuncionario && byTecnico.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">Top Funcionários</h2>
              {filtroFuncionario && (
                <button onClick={() => setFiltroFuncionario(null)} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-4">Clique numa barra para filtrar os demais gráficos</p>
            <ResponsiveContainer width="100%" height={Math.max(200, byTecnico.length * 38)}>
              <BarChart data={byTecnico} layout="vertical" barSize={18} margin={{ right: 90, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Total"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar
                  dataKey="total"
                  radius={[0, 4, 4, 0]}
                  cursor="pointer"
                  onClick={(data) => setFiltroFuncionario(filtroFuncionario === data.id ? null : data.id)}
                >
                  <LabelList dataKey="total" content={<CustomBarLabel />} />
                  {byTecnico.map((entry) => (
                    <Cell
                      key={entry.id}
                      fill={FUNC_COLORS[byTecnico.indexOf(entry) % FUNC_COLORS.length]}
                      opacity={filtroFuncionario && filtroFuncionario !== entry.id ? 0.3 : 1}
                      stroke={filtroFuncionario === entry.id ? "oklch(0.35 0.22 255)" : "transparent"}
                      strokeWidth={filtroFuncionario === entry.id ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Tabela de despesas colapsável ── */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        {/* Cabeçalho da tabela — sempre visível */}
        <button
          type="button"
          onClick={() => setTabelaAberta((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Table2 className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">
                Despesas do Período
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({despesasTabela.length} {despesasTabela.length === 1 ? "registro" : "registros"} &bull; {formatCurrency(despesasTabela.reduce((s, d) => s + Number(d.valor), 0))})
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {temFiltroAtivo ? "Com filtros cruzados ativos" : "Todas as despesas enviadas do período selecionado"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
            <span className="text-xs">{tabelaAberta ? "Ocultar" : "Expandir"}</span>
            {tabelaAberta
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />
            }
          </div>
        </button>

        {/* Corpo da tabela — colapsável */}
        {tabelaAberta && (() => {
          // Agrupar por funcionário usando despesasTabela (todas as enviadas, não só aprovadas)
          const grupos: { tecnicoId: string | null; nome: string; despesas: typeof despesasTabela }[] = [];
          const seen = new Map<string, number>();
          despesasTabela.forEach((d) => {
            const key = d.tecnico_id ?? "__sem_funcionario__";
            if (!seen.has(key)) {
              const tecnico = profiles.find((p) => p.id === d.tecnico_id);
              seen.set(key, grupos.length);
              grupos.push({ tecnicoId: d.tecnico_id ?? null, nome: tecnico?.nome ?? "Sem funcionário", despesas: [] });
            }
            grupos[seen.get(key)!].despesas.push(d);
          });
          grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

          const colCount = isFuncionario ? 6 : 8;

          return (
            <div className="border-t border-border overflow-x-auto">
              {despesasTabela.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <FileText className="w-8 h-8 opacity-30" />
                  <p className="text-sm">Nenhuma despesa encontrada para os filtros aplicados.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b border-border">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Data</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Tipo</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Cliente</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">OS</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Observação</th>
                      {!isFuncionario && (
                        <>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Aprovador</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Data Aprovação</th>
                        </>
                      )}
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((grupo) => {
                      const subtotal = grupo.despesas.reduce((s, d) => s + Number(d.valor), 0);
                      return (
                        <>
                          {/* Linha de cabeçalho do funcionário */}
                          <tr key={`grupo-${grupo.tecnicoId}`} className="bg-primary/5 border-y border-primary/15">
                            <td colSpan={colCount} className="px-4 py-2.5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                                    <Users className="w-3 h-3" />
                                  </div>
                                  <span className="text-sm font-semibold text-foreground">{grupo.nome}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {grupo.despesas.length} {grupo.despesas.length === 1 ? "despesa" : "despesas"}
                                  </span>
                                </div>
                                <span className="text-sm font-bold text-primary">{formatCurrency(subtotal)}</span>
                              </div>
                            </td>
                          </tr>

                          {/* Linhas de despesas do grupo */}
                          {grupo.despesas
                            .slice()
                            .sort((a, b) => a.data_despesa.localeCompare(b.data_despesa))
                            .map((d) => {
                              const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
                              const aprovador = profiles.find((p) => p.id === d.gestor_aprovador_id);
                              // Aprovação automática: tem data_aprovacao mas gestor_aprovador_id é null
                              const nomeAprovador = aprovador?.nome
                                ?? (d.data_aprovacao && !d.gestor_aprovador_id ? "Automático" : null);
                              return (
                                <tr key={d.id} className="border-b border-border hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2 whitespace-nowrap text-foreground pl-12">{formatDate(d.data_despesa)}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-foreground">
                                    {tipo?.nome ?? <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="px-4 py-2 whitespace-nowrap text-foreground max-w-[150px] truncate">{d.cliente}</td>
                                  <td className="px-4 py-2 whitespace-nowrap text-foreground">
                                    {d.numero_os || <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground max-w-[180px] truncate" title={d.observacao ?? ""}>
                                    {d.observacao || "—"}
                                  </td>
                                  {!isFuncionario && (
                                    <>
                                      <td className="px-4 py-2 whitespace-nowrap text-foreground">
                                        {nomeAprovador ?? <span className="text-muted-foreground">—</span>}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-foreground">
                                        {d.data_aprovacao ? formatDate(d.data_aprovacao.slice(0, 10)) : <span className="text-muted-foreground">—</span>}
                                      </td>
                                    </>
                                  )}
                                  <td className="px-4 py-2 whitespace-nowrap text-right font-medium text-foreground">
                                    {formatCurrency(Number(d.valor))}
                                  </td>
                                </tr>
                              );
                            })}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/40 border-t border-border">
                      <td colSpan={colCount - 1} className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Total geral — {despesasTabela.length} {despesasTabela.length === 1 ? "despesa" : "despesas"} &bull; {grupos.length} {grupos.length === 1 ? "funcionário" : "funcionários"}
                      </td>
                      <td className="px-4 py-2.5 text-right text-sm font-bold text-foreground">
                        {formatCurrency(despesasTabela.reduce((s, d) => s + Number(d.valor), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Seção KM ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <Gauge className="w-4 h-4" />
        </div>
        <h2 className="text-base font-bold text-foreground">Controle de KM</h2>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Route className="w-5 h-5" />, value: formatKmRel(totalKmPeriodo), label: "KM Total Percorrido", bg: "bg-accent/10", color: "text-accent" },
          { icon: <Car className="w-5 h-5" />, value: totalViagens, label: "Viagens Finalizadas", bg: "bg-primary/10", color: "text-primary" },
          { icon: <Gauge className="w-5 h-5" />, value: formatKmRel(mediaKmViagem), label: "Média por Viagem", bg: "bg-success/10", color: "text-success" },
          { icon: <Clock className="w-5 h-5" />, value: totalMinutos > 0 ? formatDuracaoRel(totalMinutos) : "—", label: "Tempo Total em Rota", bg: "bg-warning/10", color: "text-warning" },
        ].map(({ icon, value, label, bg, color }) => (
          <div key={label} className="bg-white rounded-xl border border-border shadow-sm p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} ${color} flex items-center justify-center mb-3`}>{icon}</div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {kmByMes.some((m) => m.km > 0) && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">KM Percorrido por Mês — {now.getFullYear()}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={kmByMes} barSize={28}>
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                tickFormatter={(v) => `${v} km`} />
              <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")} km`, "KM"]}
                contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
              <Bar dataKey="km" radius={[4, 4, 0, 0]} fill="oklch(0.52 0.17 155)">
                <LabelList dataKey="km" position="top" style={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                  formatter={(v: number) => v > 0 ? `${v.toLocaleString("pt-BR")}` : ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {kmByFrota.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">KM por Veículo</h3>
            <ResponsiveContainer width="100%" height={Math.max(180, kmByFrota.length * 36)}>
              <BarChart data={kmByFrota} layout="vertical" barSize={16} margin={{ right: 80 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={65} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")} km`, "KM"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar dataKey="km" radius={[0, 4, 4, 0]} fill="oklch(0.55 0.18 255)">
                  <LabelList dataKey="km" content={<KmBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {isGestorOuAdmin && kmByFuncionario.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">KM por Funcionário</h3>
            <ResponsiveContainer width="100%" height={Math.max(180, kmByFuncionario.length * 36)}>
              <BarChart data={kmByFuncionario} layout="vertical" barSize={16} margin={{ right: 80 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={75} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")} km`, "KM"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar dataKey="km" radius={[0, 4, 4, 0]} fill="oklch(0.577 0.245 27.325)">
                  <LabelList dataKey="km" content={<KmBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
