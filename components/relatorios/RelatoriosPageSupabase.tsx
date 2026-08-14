"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import { useFiltrosPersistidos } from "@/lib/supabase/use-filtros-persistidos";
import type { FiltrosRelatorio } from "@/lib/supabase/use-filtros-persistidos";
import { useDespesas, useTiposDespesa, useProfiles, useControleKm, useFrotas, useTiposDespesaCentroCustoTodos, ControleKm } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/helpers";
import { calcularEstimativaVeiculo } from "@/lib/consumo-frota";
import { EMPRESAS_ERP, extrairEmpresaErpId, extrairEmpresaErpNome, extrairComplementoErp } from "@/lib/erp-payload";
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
import { Calendar, Download, TrendingUp, DollarSign, Users, FileText, CalendarDays, Gauge, Route, Clock, Car, X, ChevronDown, ChevronUp, Table2, AlertTriangle, Building2 } from "lucide-react";
import { formatDate } from "@/lib/helpers";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ModoFiltro = "mes" | "periodo";

function formatKmRel(val: number): string {
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " km";
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

  // Funcionário: busca só as próprias via hook (respeita RLS)
  // Gestor/Admin: busca via API route server-side com service key (ignora RLS, vê tudo)
  const { despesas: despesasFuncionario, isLoading: loadingFunc } = useDespesas(
    isFuncionario ? currentUser?.id : undefined,
    currentUser?.perfil
  );
  const { data: despesasAdminData, isLoading: loadingAdmin } = useSWR(
    isGestorOuAdmin ? "/api/despesas-relatorio" : null,
    (url: string) => fetch(url).then((r) => r.json()).then((d) => d.data ?? []),
    { revalidateOnFocus: false }
  );
  const despesas = isGestorOuAdmin ? (despesasAdminData ?? []) : despesasFuncionario;
  const isLoading = isGestorOuAdmin ? loadingAdmin : loadingFunc;
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  const { registros: registrosKm } = useControleKm(isFuncionario ? currentUser?.id : undefined);
  const { frotas } = useFrotas();
  const { centrosCustoTodos } = useTiposDespesaCentroCustoTodos();

  const now = new Date();

  const { filtrosSalvos: filtrosRel, carregado: carregadoRel, salvar: salvarRel } = useFiltrosPersistidos<FiltrosRelatorio>(currentUser?.id, "relatorio");
  const aplicadoRel = useRef(false);

  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFinal, setDataFinal] = useState(() => now.toISOString().slice(0, 10));
  const [filtroFuncionario, setFiltroFuncionario] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  // Filtro interativo da seção KM — clicável nos gráficos
  const [kmFuncFiltro, setKmFuncFiltro] = useState<string | null>(null);

  // Restaurar filtros salvos ao montar — apenas uma vez
  // Restaurar filtros salvos ao montar — roda uma única vez quando carregado=true
  useEffect(() => {
    if (!carregadoRel || aplicadoRel.current) return;
    aplicadoRel.current = true;
    if (!filtrosRel) return;
    setModoFiltro(filtrosRel.modoFiltro);
    setMesSelecionado(filtrosRel.mesSelecionado);
    setAnoSelecionado(filtrosRel.anoSelecionado);
    setDataInicial(filtrosRel.dataInicial);
    setDataFinal(filtrosRel.dataFinal);
    setFiltroFuncionario(filtrosRel.filtroFuncionario);
    setFiltroTipo(filtrosRel.filtroTipo);
  }, [carregadoRel, filtrosRel]);

  // Salvar ao alterar qualquer filtro (só após restauração inicial)
  useEffect(() => {
    if (!carregadoRel || !aplicadoRel.current) return;
    salvarRel({ modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroFuncionario, filtroTipo });
  }, [modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroFuncionario, filtroTipo]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Campo de referência do período: data_despesa ou data_vencimento ──
  const [campoPeriodo, setCampoPeriodo] = useState<"data_despesa" | "data_vencimento">("data_despesa");

  // ── Tabela de despesas colapsável ──
  const [tabelaAberta, setTabelaAberta] = useState(false);
 const [abaRelatorio, setAbaRelatorio] = useState<"despesas" | "km" | "centrocusto">("despesas");

  // ── Filtros específicos da aba Centro de Custo ──
  const [campoPeriodoCC, setCampoPeriodoCC] = useState<"data_despesa" | "data_vencimento" | "data_envio">("data_envio");
  const [filtroEmpresaCC, setFiltroEmpresaCC] = useState<number | null>(null);
  const [ccGruposAbertos, setCcGruposAbertos] = useState<Set<string>>(new Set());
  const toggleCcGrupo = (chave: string) => {
    setCcGruposAbertos((prev) => {
      const next = new Set(prev);
      if (next.has(chave)) next.delete(chave);
      else next.add(chave);
      return next;
    });
  };

  // ── Exportação PDF ──
  const [exportando, setExportando] = useState(false);
  const [exportandoReembolso, setExportandoReembolso] = useState(false);
  const [exportandoCC, setExportandoCC] = useState(false);
  const [pdfMenuAberto, setPdfMenuAberto] = useState(false);
  const pdfMenuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu PDF ao clicar fora
  useEffect(() => {
    if (!pdfMenuAberto) return;
    const handler = (e: MouseEvent) => {
      if (pdfMenuRef.current && !pdfMenuRef.current.contains(e.target as Node)) {
        setPdfMenuAberto(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pdfMenuAberto]);

  const periodoLabel = modoFiltro === "mes"
    ? `${MESES_FULL[mesSelecionado]} ${anoSelecionado}`
    : dataInicial && dataFinal
    ? `${dataInicial.split("-").reverse().join("/")} a ${dataFinal.split("-").reverse().join("/")}`
    : "Período personalizado";

  const handleExportarPDF = async () => {
    setExportando(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      // ── Agrupar despesas por funcionário (usando despesasTabela) ──
      const gruposPDF: { nome: string; iniciais: string; despesas: typeof despesasTabela }[] = [];
      const seenPDF = new Map<string, number>();
      despesasTabela.forEach((d) => {
        const key = d.tecnico_id ?? "__sem__";
        if (!seenPDF.has(key)) {
          const tec = profiles.find((p) => p.id === d.tecnico_id);
          const nome = tec?.nome ?? "Sem funcionário";
          const partes = nome.trim().split(" ");
          const iniciais = partes.length >= 2
            ? (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
            : nome.slice(0, 2).toUpperCase();
          seenPDF.set(key, gruposPDF.length);
          gruposPDF.push({ nome, iniciais, despesas: [] });
        }
        gruposPDF[seenPDF.get(key)!].despesas.push(d);
      });
      gruposPDF.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      // ── Constantes de layout ──
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = 210;
      const PH = 297;
      const ML = 12;
      const MR = 12;
      const CW = PW - ML - MR;
      const BOT = 14;

      // ── Paleta ──
      const NAVY:   [number,number,number] = [22,  45,  95];
      const AZURE:  [number,number,number] = [44, 105, 210];
      const C_GREEN:[number,number,number] = [22, 163,  74];
      const C_ORG:  [number,number,number] = [195,110,  10];
      const LIGHT:  [number,number,number] = [230, 238, 252];
      const GREY:   [number,number,number] = [245, 247, 250];
      const BORDER: [number,number,number] = [218, 226, 242];

      // Paleta de avatares (ciclo)
      const AVATAR_COLORS: [number,number,number][] = [
        [44,105,210], [22,163,74], [195,110,10], [139,40,200], [220,50,50],
      ];

      let y = 0;

      // ── Helpers ──
      const t = (str: string, x: number, yy: number, opts?: Parameters<typeof pdf.text>[3]) =>
        pdf.text(str, x, yy, opts);

      const checkY = (needed: number) => {
        if (y + needed > PH - BOT) { pdf.addPage(); y = BOT; }
      };

      // Coluna x baseado em alinhamento (âncora correta para jsPDF)
      const cx = (startX: number, w: number, align?: string) => {
        if (align === "right")  return startX + w;   // jsPDF usa borda direita
        if (align === "center") return startX + w / 2;
        return startX + 2;
      };

      const sectionLine = (label: string, icon?: string) => {
        checkY(12);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        t((icon ? icon + "  " : "") + label, ML, y);
        y += 1.5;
        pdf.setDrawColor(...AZURE);
        pdf.setLineWidth(0.5);
        pdf.line(ML, y, ML + CW, y);
        pdf.setTextColor(17, 24, 39);
        y += 5;
      };

      const tblHeader = (cols: { label: string; w: number; align?: "left"|"right"|"center" }[], startX = ML, totalW = CW) => {
        checkY(7);
        pdf.setFillColor(...LIGHT);
        pdf.rect(startX, y, totalW, 6, "F");
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        let x = startX;
        cols.forEach((col) => {
          t(col.label.toUpperCase(), cx(x, col.w, col.align), y + 4.2, { align: col.align ?? "left" });
          x += col.w;
        });
        pdf.setTextColor(17, 24, 39);
        y += 6;
      };

      const tblRow = (
        cols: { val: string; w: number; align?: "left"|"right"|"center"; bold?: boolean }[],
        odd: boolean,
        startX = ML
      ) => {
        checkY(6);
        if (odd) { pdf.setFillColor(...GREY); pdf.rect(startX, y, CW, 5.5, "F"); }
        let x = startX;
        cols.forEach((col) => {
          pdf.setFont("helvetica", col.bold ? "bold" : "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(17, 24, 39);
          const maxW = col.w - 3;
          const lines = pdf.splitTextToSize(col.val, maxW) as string[];
          t(lines[0], cx(x, col.w, col.align), y + 3.8, { align: col.align ?? "left" });
          x += col.w;
        });
        pdf.setDrawColor(...BORDER);
        pdf.setLineWidth(0.1);
        pdf.line(startX, y + 5.5, startX + CW, y + 5.5);
        y += 5.5;
      };

      // ════════════════════════════════════════
      // 1. CABEÇALHO
      // ════════════════════════════════════════
      // Fundo navy uniforme — cor única
      pdf.setFillColor(...NAVY);
      pdf.rect(0, 0, PW, 32, "F");

      // Logo
      const LOGO_H = 22;
      let logoEndX = ML;
      try {
        const logoUrl = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/RJ%20Branco%202-Pn9QBwHse0Kjls3Cpbdg4mGuwo47pg.png";
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image(); el.crossOrigin = "anonymous";
          el.onload = () => resolve(el); el.onerror = reject; el.src = logoUrl;
        });
        const ratio = img.naturalWidth / img.naturalHeight;
        const logoW = LOGO_H * ratio;
        const cv = document.createElement("canvas");
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        cv.getContext("2d")!.drawImage(img, 0, 0);
        pdf.addImage(cv.toDataURL("image/png"), "PNG", 4, (32 - LOGO_H) / 2, logoW, LOGO_H);
        logoEndX = 4 + logoW + 3;
      } catch { logoEndX = ML; }

      // Linha divisória vertical após logo
      pdf.setDrawColor(255, 255, 255);
      pdf.setLineWidth(0.3);
      pdf.line(logoEndX + 1, 6, logoEndX + 1, 26);

      // Título e período
      const titleX = logoEndX + 5;
      pdf.setFontSize(17);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      t("Relatorio de Despesas", titleX, 14);
      // Ícone calendário simulado + período
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(185, 205, 240);
      t(periodoLabel, titleX + 5, 22);

      // Box "Gerado em" no canto direito
      const boxW = 42; const boxH = 16; const boxX = PW - MR - boxW; const boxY = 8;
      pdf.setFillColor(35, 65, 145);
      pdf.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(185, 205, 240);
      t("Gerado em", boxX + boxW / 2, boxY + 5.5, { align: "center" });
      pdf.setFontSize(8.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      const agora = new Date();
      t(
        `${agora.toLocaleDateString("pt-BR")} as ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        boxX + boxW / 2, boxY + 12, { align: "center" }
      );

      // Filtros ativos (se houver)
      if (filtroFuncionario || filtroTipo) {
        const filtrosAtivos = [
          filtroFuncionario ? profiles.find((p) => p.id === filtroFuncionario)?.nome : "",
          filtroTipo ? tiposDespesa.find((t2) => t2.id === filtroTipo)?.nome : "",
        ].filter(Boolean).join("  |  ");
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(185, 205, 240);
        t(`Filtros: ${filtrosAtivos}`, ML, 29);
      }

      y = 38;

      // ════════════════════════════════════════
      // 2. CARDS DE RESUMO (com círculo ícone)
      // ════════════════════════════════════════
      const cardsData = [
        { label: "Total do Periodo",    val: formatCurrency(totalAno),   color: AZURE  },
        { label: "Lancamentos",          val: String(totalLancamentos),    color: C_GREEN },
        { label: "Ticket Medio",         val: formatCurrency(ticketMedio), color: C_ORG   },
        ...(isGestorOuAdmin ? [{ label: "Funcionarios Ativos", val: String(tecnicosAtivos), color: AZURE as [number,number,number] }] : []),
      ];
      const cardW = CW / cardsData.length;
      const cardH = 20;
      cardsData.forEach((card, i) => {
        const cx2 = ML + i * cardW;
        // Card branco com borda
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(cx2, y, cardW - 2, cardH, 2, 2, "F");
        pdf.setDrawColor(...BORDER);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(cx2, y, cardW - 2, cardH, 2, 2, "S");
        // Linha superior colorida
        pdf.setFillColor(...card.color);
        pdf.rect(cx2, y, cardW - 2, 1.5, "F");

        // Título do card
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(107, 114, 128);
        t(card.label, cx2 + (cardW - 2) / 2, y + 7, { align: "center" });
        // Valor do card
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...card.color);
        t(card.val, cx2 + (cardW - 2) / 2, y + 15, { align: "center" });
      });
      pdf.setTextColor(17, 24, 39);
      y += cardH + 8;

      // ═══���������═════════════��═══════════════�����════���═
      // 3. TOP FUNCIONÁRIOS + POR TIPO (2 colunas)
      // ══���═══����══════════��══════════════════���══��
      const COL2W = CW / 2 - 3; // largura de cada coluna com gap

      const yStart2col = y;

      // ── Coluna esquerda: Top Funcionários ──
      if (byTecnico.length > 0) {
        // Box
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(...BORDER);
        pdf.setLineWidth(0.3);
        // Título da seção dentro do box
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        t("Top Funcionarios", ML, y);
        y += 1.5;
        pdf.setDrawColor(...AZURE);
        pdf.setLineWidth(0.5);
        pdf.line(ML, y, ML + COL2W, y);
        y += 5;

        const colsFun = [
          { label: "Funcionario", w: COL2W * 0.55 },
          { label: "Qtd",         w: COL2W * 0.20, align: "center" as const },
          { label: "Total",       w: COL2W * 0.25, align: "right"  as const },
        ];
        tblHeader(colsFun, ML, COL2W);
        byTecnico.forEach((tec, i) => {
          // Linha da tabela esquerda sem desenhar linha separadora (evita emenda visual com coluna direita)
          checkY(6);
          if (i % 2 !== 0) { pdf.setFillColor(...GREY); pdf.rect(ML, y, COL2W, 5.5, "F"); }
          let rx = ML;
          [
            { val: tec.nome,                  w: colsFun[0].w },
            { val: String(tec.qtd),           w: colsFun[1].w, align: "center" as const },
            { val: formatCurrency(tec.total), w: colsFun[2].w, align: "right" as const, bold: true },
          ].forEach((col) => {
            pdf.setFont("helvetica", col.bold ? "bold" : "normal");
            pdf.setFontSize(8);
            pdf.setTextColor(17, 24, 39);
            const lines = pdf.splitTextToSize(col.val, col.w - 3) as string[];
            t(lines[0], cx(rx, col.w, col.align), y + 3.8, { align: col.align ?? "left" });
            rx += col.w;
          });
          // Linha separadora apenas até a largura da coluna esquerda
          pdf.setDrawColor(...BORDER);
          pdf.setLineWidth(0.1);
          pdf.line(ML, y + 5.5, ML + COL2W, y + 5.5);
          y += 5.5;
        });
      }

      const yAfterLeft = y;
      y = yStart2col;

      // ── Coluna direita: Por Tipo ──
      const colRX = ML + COL2W + 6;
      if (byTipo.length > 0) {
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        t("Por Tipo de Despesa", colRX, y);
        y += 1.5;
        pdf.setDrawColor(...AZURE);
        pdf.setLineWidth(0.5);
        pdf.line(colRX, y, colRX + COL2W, y);
        y += 5;

        const colsTipo = [
          { label: "Tipo",  w: COL2W * 0.50 },
          { label: "Total", w: COL2W * 0.30, align: "right" as const },
          { label: "%",     w: COL2W * 0.20, align: "right" as const },
        ];
        // header manual para a coluna direita
        checkY(7);
        pdf.setFillColor(...LIGHT);
        pdf.rect(colRX, y, COL2W, 6, "F");
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        let x2 = colRX;
        colsTipo.forEach((col) => {
          t(col.label.toUpperCase(), cx(x2, col.w, col.align), y + 4.2, { align: col.align ?? "left" });
          x2 += col.w;
        });
        pdf.setTextColor(17, 24, 39);
        y += 6;

        byTipo.forEach((tp, i) => {
          checkY(6);
          if (i % 2 !== 0) { pdf.setFillColor(...GREY); pdf.rect(colRX, y, COL2W, 5.5, "F"); }
          let rx = colRX;
          const rowTipo = [
            { val: tp.name,                                                          w: colsTipo[0].w },
            { val: formatCurrency(tp.valor),                                         w: colsTipo[1].w, align: "right" as const, bold: true },
            { val: totalAno > 0 ? ((tp.valor / totalAno) * 100).toFixed(1) + "%" : "—", w: colsTipo[2].w, align: "right" as const },
          ];
          rowTipo.forEach((col) => {
            pdf.setFont("helvetica", col.bold ? "bold" : "normal");
            pdf.setFontSize(8);
            pdf.setTextColor(17, 24, 39);
            const lines = pdf.splitTextToSize(col.val, col.w - 3) as string[];
            t(lines[0], cx(rx, col.w, col.align), y + 3.8, { align: col.align ?? "left" });
            rx += col.w;
          });
          pdf.setDrawColor(...BORDER);
          pdf.setLineWidth(0.1);
          pdf.line(colRX, y + 5.5, colRX + COL2W, y + 5.5);
          y += 5.5;
        });
      }

      y = Math.max(yAfterLeft, y) + 8;

      // ════════════════════════════════════════
      // 4. EVOLUÇÃO MENSAL com barras
      // ════════════════════════════════════════
      sectionLine(`Evolucao Mensal - ${anoSelecionado}`);
      checkY(30);

      const mesW = CW / 12;
      const BAR_MAX_H = 12;
      const maxVal = Math.max(...byMes.map((m) => m.valor), 1);

      // Nomes dos meses (abreviados)
      const MESES_ABR = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
      MESES_ABR.forEach((m, i) => {
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(107, 114, 128);
        t(m, ML + i * mesW + mesW / 2, y + 5, { align: "center" });
      });
      y += 7;

      // Barras e valores
      byMes.forEach((m, i) => {
        const bx = ML + i * mesW + mesW / 2;
        if (m.valor > 0) {
          const bh = Math.max((m.valor / maxVal) * BAR_MAX_H, 2);
          const barW = mesW * 0.5;
          pdf.setFillColor(...AZURE);
          pdf.roundedRect(bx - barW / 2, y + (BAR_MAX_H - bh), barW, bh, 1, 1, "F");
          const valStr = m.valor >= 1000 ? `R$${(m.valor / 1000).toFixed(1)}k` : formatCurrency(m.valor);
          pdf.setFontSize(6.5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(...AZURE);
          t(valStr, bx, y + BAR_MAX_H + 5, { align: "center" });
        } else {
          pdf.setFontSize(7.5);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(180, 188, 200);
          t("—", bx, y + BAR_MAX_H / 2 + 3, { align: "center" });
        }
      });
      pdf.setTextColor(17, 24, 39);
      y += BAR_MAX_H + 10;

      // ═══════════════════════════════��════════
      // 5. TABELA AGRUPADA POR FUNCIONÁRIO
      // ════════════════════════════════════════
      sectionLine(`Despesas do Periodo (${despesasTabela.length} registros)`);

      // Colunas — somam 1.00
      const colsDesp = [
        { label: "Data",       w: CW * 0.12 },
        { label: "Tipo",       w: CW * 0.18 },
        { label: "Cliente",    w: CW * 0.24 },
        { label: "OS",         w: CW * 0.10 },
        { label: "Observacao", w: CW * 0.22 },
        { label: "Valor",      w: CW * 0.14, align: "right" as const },
      ];
      // 0.12+0.18+0.24+0.10+0.22+0.14 = 1.00 ✓

      gruposPDF.forEach((grupo) => {
        const subtotal = grupo.despesas.reduce((s, d) => s + Number(d.valor), 0);
        const qtd = grupo.despesas.length;

        // Linha do funcionário — apenas nome, sem avatar
        checkY(10);
        pdf.setFillColor(...LIGHT);
        pdf.rect(ML, y, CW, 8, "F");

        // Nome
        pdf.setFontSize(9);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        t(grupo.nome, ML + 4, y + 5.5);

        // Subtotal e qtd à direita
        pdf.setFontSize(8.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        t(`${formatCurrency(subtotal)}  •  ${qtd} ${qtd === 1 ? "despesa" : "despesas"}`, ML + CW, y + 5.5, { align: "right" });

        y += 8;
        // Linha branca fina separando o cabeçalho do funcionário do cabeçalho das colunas
        pdf.setDrawColor(255, 255, 255);
        pdf.setLineWidth(0.6);
        pdf.line(ML, y, ML + CW, y);
        tblHeader(colsDesp, ML, CW);

        grupo.despesas
          .slice()
          .sort((a, b) => a.data_despesa.localeCompare(b.data_despesa))
          .forEach((d, i) => {
            const tipo = tiposDespesa.find((tp) => tp.id === d.tipo_despesa_id);
            tblRow([
              { val: formatDate(d.data_despesa),      w: colsDesp[0].w },
              { val: tipo?.nome ?? "—",               w: colsDesp[1].w },
              { val: d.cliente,                       w: colsDesp[2].w },
              { val: d.numero_os ?? "—",              w: colsDesp[3].w },
              { val: d.observacao ?? "—",             w: colsDesp[4].w },
              { val: formatCurrency(Number(d.valor)), w: colsDesp[5].w, align: "right", bold: true },
            ], i % 2 !== 0);
          });

        y += 5;
      });

      // ── Total geral ──
      checkY(10);
      pdf.setFillColor(...NAVY);
      pdf.roundedRect(ML, y, CW, 9, 1, 1, "F");
      pdf.setFontSize(9.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      t(`Total Geral  •  ${despesasTabela.length} despesas  •  ${gruposPDF.length} funcionarios`, ML + 3, y + 6);
      t(formatCurrency(despesasTabela.reduce((s, d) => s + Number(d.valor), 0)), ML + CW, y + 6, { align: "right" });

      // ── Rodapé com número de páginas ──
      const totalPages = (pdf as any).internal.getNumberOfPages();
      for (let pg = 1; pg <= totalPages; pg++) {
        pdf.setPage(pg);
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(160, 174, 200);
        pdf.text(`Pagina ${pg} de ${totalPages}`, PW / 2, PH - 5, { align: "center" });
      }

      const nomeArquivo = `relatorio-despesas-${periodoLabel.replace(/[\s/]/g, "-").toLowerCase()}.pdf`;
      pdf.save(nomeArquivo);
    } catch (err) {
      console.error("[v0] Erro ao exportar PDF:", err);
    } finally {
      setExportando(false);
    }
  };

  // ── Exportação de Reembolsos ──
  // Sempre usa data_vencimento como referência, filtra só pagamento_tipo === "dinheiro"
  const handleExportarReembolsos = async () => {
    setExportandoReembolso(true);
    setPdfMenuAberto(false);
    try {
      const { default: jsPDF } = await import("jspdf");

      // Filtra: dinheiro + período (data_vencimento) + demais filtros ativos
      const despesasReembolso = despesas.filter((d) => {
        if (d.status_erp === "Rascunho" && d.status_aprovacao === "AguardandoGestor" && !d.data_envio) return false;
        if (d.pagamento_tipo !== "dinheiro") return false;
        const dataStr = (d.data_vencimento || d.data_despesa || d.created_at || "").slice(0, 10);
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

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = 210, PH = 297, ML = 12, MR = 12, BOT = 14;
      const CW = PW - ML - MR;
      const NAVY:  [number,number,number] = [22, 45, 95];
      const AZURE: [number,number,number] = [44, 105, 210];
      const GREEN: [number,number,number] = [22, 163, 74];
      const LIGHT: [number,number,number] = [230, 238, 252];

      let y = ML;
      let pageNum = 1;

      const newPage = () => {
        pdf.addPage();
        pageNum++;
        y = ML;
      };
      const checkY = (n: number) => { if (y + n > PH - BOT) newPage(); };
      const t = (s: string, x: number, yy: number, opts?: Parameters<typeof pdf.text>[3]) => pdf.text(s, x, yy, opts);

      // Cabeçalho
      pdf.setFillColor(...NAVY);
      pdf.rect(0, 0, PW, 22, "F");
      pdf.setFontSize(14); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
      t("Relatório de Reembolsos", ML, 13);
      pdf.setFontSize(8); pdf.setFont("helvetica", "normal"); pdf.setTextColor(180, 200, 240);
      t(`Período (vencimento): ${periodoLabel}  •  Gerado em ${new Date().toLocaleDateString("pt-BR")}`, ML, 19);
      y = 30;

      // Resumo
      const totalReembolso = despesasReembolso.reduce((s, d) => s + Number(d.valor), 0);
      pdf.setFillColor(...LIGHT);
      pdf.roundedRect(ML, y, CW, 14, 2, 2, "F");
      pdf.setFontSize(9); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...NAVY);
      t(`${despesasReembolso.length} reembolso${despesasReembolso.length !== 1 ? "s" : ""} a pagar`, ML + 4, y + 5.5);
      pdf.setFontSize(12); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...GREEN);
      t(formatCurrency(totalReembolso), ML + CW, y + 9, { align: "right" });
      y += 20;

      // Agrupado por funcionário
      const grupos: { nome: string; despesas: typeof despesasReembolso }[] = [];
      const seen = new Map<string, number>();
      despesasReembolso.forEach((d) => {
        const key = d.tecnico_id ?? "__sem__";
        if (!seen.has(key)) {
          const tec = profiles.find((p) => p.id === d.tecnico_id);
          seen.set(key, grupos.length);
          grupos.push({ nome: tec?.nome ?? "Sem funcionário", despesas: [] });
        }
        grupos[seen.get(key)!].despesas.push(d);
      });
      grupos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

      const cols = [
        { label: "Vencimento", w: CW * 0.14 },
        { label: "Data Desp.", w: CW * 0.14 },
        { label: "Tipo",       w: CW * 0.18 },
        { label: "Cliente",    w: CW * 0.22 },
        { label: "OS",         w: CW * 0.10 },
        { label: "Observação", w: CW * 0.12 },
        { label: "Valor",      w: CW * 0.10, align: "right" as const },
      ];

      const tblHdr = () => {
        checkY(8);
        pdf.setFillColor(...LIGHT); pdf.rect(ML, y, CW, 6.5, "F");
        pdf.setFontSize(7.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...NAVY);
        let cx = ML;
        cols.forEach((c) => {
          const xPos = c.align === "right" ? cx + c.w : cx + 2;
          t(c.label.toUpperCase(), xPos, y + 4.5, { align: c.align ?? "left" });
          cx += c.w;
        });
        pdf.setTextColor(0, 0, 0); y += 6.5;
      };

      grupos.forEach((grupo) => {
        const subtotal = grupo.despesas.reduce((s, d) => s + Number(d.valor), 0);
        const tecProfile = profiles.find((p) => p.id === grupo.despesas[0]?.tecnico_id);
        const chavePix = tecProfile?.chave_pix?.trim() || "Não cadastrada";
        const nomeComPix = `${grupo.nome}  —  Chave PIX: ${chavePix}`;
        checkY(10);
        pdf.setFillColor(...LIGHT); pdf.rect(ML, y, CW, 8, "F");
        pdf.setFontSize(9); pdf.setFont("helvetica", "bold"); pdf.setTextColor(...NAVY);
        t(nomeComPix, ML + 4, y + 5.5);
        pdf.setFontSize(8.5);
        t(`${formatCurrency(subtotal)}  •  ${grupo.despesas.length} item${grupo.despesas.length !== 1 ? "ns" : ""}`, ML + CW, y + 5.5, { align: "right" });
        y += 8;
        tblHdr();

        grupo.despesas
          .slice()
          .sort((a, b) => (a.data_vencimento ?? a.data_despesa).localeCompare(b.data_vencimento ?? b.data_despesa))
          .forEach((d, i) => {
            checkY(6.5);
            if (i % 2 !== 0) { pdf.setFillColor(245, 247, 252); pdf.rect(ML, y, CW, 6, "F"); }
            pdf.setFontSize(8.5); pdf.setFont("helvetica", "normal"); pdf.setTextColor(17, 24, 39);
            const tipo = tiposDespesa.find((tp) => tp.id === d.tipo_despesa_id);
            let cx = ML;
            const vals = [
              { val: d.data_vencimento ? formatDate(d.data_vencimento) : "—", w: cols[0].w },
              { val: formatDate(d.data_despesa),    w: cols[1].w },
              { val: tipo?.nome ?? "—",             w: cols[2].w },
              { val: d.cliente,                     w: cols[3].w },
              { val: d.numero_os ?? "—",            w: cols[4].w },
              { val: d.observacao ?? "—",           w: cols[5].w },
              { val: formatCurrency(Number(d.valor)), w: cols[6].w, align: "right" as const, bold: true },
            ];
            vals.forEach((v) => {
              pdf.setFont("helvetica", v.bold ? "bold" : "normal");
              const xPos = v.align === "right" ? cx + v.w : cx + 2;
              const maxW = v.w - 4;
              const lines = pdf.splitTextToSize(v.val, maxW) as string[];
              t(lines[0], xPos, y + 4.2, { align: v.align ?? "left" });
              cx += v.w;
            });
            pdf.setDrawColor(220, 226, 240); pdf.setLineWidth(0.1); pdf.line(ML, y + 6, ML + CW, y + 6);
            y += 6;
          });
        y += 5;
      });

      // Total geral
      checkY(10);
      pdf.setFillColor(...NAVY); pdf.roundedRect(ML, y, CW, 9, 1, 1, "F");
      pdf.setFontSize(9.5); pdf.setFont("helvetica", "bold"); pdf.setTextColor(255, 255, 255);
      t(`Total Reembolsos  •  ${despesasReembolso.length} registro${despesasReembolso.length !== 1 ? "s" : ""}`, ML + 3, y + 6);
      t(formatCurrency(totalReembolso), ML + CW, y + 6, { align: "right" });

      // Rodapé
      const totalPgs = (pdf as any).internal.getNumberOfPages();
      for (let pg = 1; pg <= totalPgs; pg++) {
        pdf.setPage(pg);
        pdf.setFontSize(7.5); pdf.setFont("helvetica", "normal"); pdf.setTextColor(160, 174, 200);
        pdf.text(`Pagina ${pg} de ${totalPgs}`, PW / 2, PH - 5, { align: "center" });
      }

      pdf.save(`reembolsos-${periodoLabel.replace(/[\s/]/g, "-").toLowerCase()}.pdf`);
    } catch (err) {
      console.error("[v0] Erro ao exportar reembolsos:", err);
    } finally {
      setExportandoReembolso(false);
    }
  };

  // ── Exportação PDF — Centro de Custo ──
  // Respeita 100% os filtros já aplicados (período, "Baseado em", empresa) usando
  // diretamente ccArvore/ccCardsTotais já calculados — sem reconsultar nada.
  const handleExportarPDFCentroCusto = async () => {
    setExportandoCC(true);
    try {
      const { default: jsPDF } = await import("jspdf");

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const PW = 210;
      const PH = 297;
      const ML = 12;
      const MR = 12;
      const CW = PW - ML - MR;
      const BOT = 14;

      const NAVY:   [number,number,number] = [22,  45,  95];
      const AZURE:  [number,number,number] = [44, 105, 210];
      const C_GREEN:[number,number,number] = [22, 163,  74];
      const C_ORG:  [number,number,number] = [195,110,  10];
      const LIGHT:  [number,number,number] = [230, 238, 252];
      const GREY:   [number,number,number] = [245, 247, 250];
      const BORDER: [number,number,number] = [218, 226, 242];

      let y = 0;

      const t = (str: string, x: number, yy: number, opts?: Parameters<typeof pdf.text>[3]) =>
        pdf.text(str, x, yy, opts);

      const checkY = (needed: number) => {
        if (y + needed > PH - BOT) { pdf.addPage(); y = BOT; }
      };

      const cx = (startX: number, w: number, align?: string) => {
        if (align === "right")  return startX + w;
        if (align === "center") return startX + w / 2;
        return startX + 2;
      };

      const sectionLine = (label: string) => {
        checkY(12);
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        t(label, ML, y);
        y += 1.5;
        pdf.setDrawColor(...AZURE);
        pdf.setLineWidth(0.5);
        pdf.line(ML, y, ML + CW, y);
        pdf.setTextColor(17, 24, 39);
        y += 5;
      };

      const tblHeader = (cols: { label: string; w: number; align?: "left"|"right"|"center" }[], startX = ML, totalW = CW) => {
        checkY(7);
        pdf.setFillColor(...LIGHT);
        pdf.rect(startX, y, totalW, 6, "F");
        pdf.setFontSize(7.5);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...NAVY);
        let x = startX;
        cols.forEach((col) => {
          t(col.label.toUpperCase(), cx(x, col.w, col.align), y + 4.2, { align: col.align ?? "left" });
          x += col.w;
        });
        pdf.setTextColor(17, 24, 39);
        y += 6;
      };

      const tblRow = (
        cols: { val: string; w: number; align?: "left"|"right"|"center"; bold?: boolean }[],
        odd: boolean,
        startX = ML
      ) => {
        checkY(6);
        if (odd) { pdf.setFillColor(...GREY); pdf.rect(startX, y, CW, 5.5, "F"); }
        let x = startX;
        cols.forEach((col) => {
          pdf.setFont("helvetica", col.bold ? "bold" : "normal");
          pdf.setFontSize(8);
          pdf.setTextColor(17, 24, 39);
          const maxW = col.w - 3;
          const lines = pdf.splitTextToSize(col.val, maxW) as string[];
          t(lines[0], cx(x, col.w, col.align), y + 3.8, { align: col.align ?? "left" });
          x += col.w;
        });
        pdf.setDrawColor(...BORDER);
        pdf.setLineWidth(0.1);
        pdf.line(startX, y + 5.5, startX + CW, y + 5.5);
        y += 5.5;
      };

      const campoPeriodoCCLabel = campoPeriodoCC === "data_envio"
        ? "Data do Envio"
        : campoPeriodoCC === "data_vencimento"
        ? "Data de Vencimento"
        : "Data da Despesa";
      const empresaLabel = filtroEmpresaCC != null ? EMPRESAS_ERP[filtroEmpresaCC] ?? `Empresa ${filtroEmpresaCC}` : "Todas as empresas";

      // ── 1. Cabeçalho ──
      pdf.setFillColor(...NAVY);
      pdf.rect(0, 0, PW, 32, "F");

      pdf.setFontSize(17);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      t("Relatorio de Centro de Custo", ML, 14);
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(185, 205, 240);
      t(periodoLabel, ML, 22);

      const boxW = 42; const boxH = 16; const boxX = PW - MR - boxW; const boxY = 8;
      pdf.setFillColor(35, 65, 145);
      pdf.roundedRect(boxX, boxY, boxW, boxH, 2, 2, "F");
      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(185, 205, 240);
      t("Gerado em", boxX + boxW / 2, boxY + 5.5, { align: "center" });
      pdf.setFontSize(8.5);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(255, 255, 255);
      const agora = new Date();
      t(
        `${agora.toLocaleDateString("pt-BR")} as ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        boxX + boxW / 2, boxY + 12, { align: "center" }
      );

      pdf.setFontSize(7);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(185, 205, 240);
      t(`Baseado em: ${campoPeriodoCCLabel}  |  Empresa: ${empresaLabel}`, ML, 29);

      y = 38;

      // ── 2. Cards de resumo ──
      const cardsData = [
        { label: "Valor Total", val: formatCurrency(ccCardsTotais.valorTotal), color: AZURE },
        { label: "Total de Lancamentos", val: String(ccCardsTotais.totalLancamentos), color: C_GREEN },
        { label: "Funcionarios Ativos", val: String(ccCardsTotais.funcionariosAtivos), color: C_ORG },
      ];
      const cardW = CW / cardsData.length;
      const cardH = 20;
      cardsData.forEach((card, i) => {
        const cx2 = ML + i * cardW;
        pdf.setFillColor(255, 255, 255);
        pdf.roundedRect(cx2, y, cardW - 2, cardH, 2, 2, "F");
        pdf.setDrawColor(...BORDER);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(cx2, y, cardW - 2, cardH, 2, 2, "S");
        pdf.setFillColor(...card.color);
        pdf.rect(cx2, y, cardW - 2, 1.5, "F");
        pdf.setFontSize(7);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(107, 114, 128);
        t(card.label, cx2 + (cardW - 2) / 2, y + 7, { align: "center" });
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...card.color);
        t(card.val, cx2 + (cardW - 2) / 2, y + 15, { align: "center" });
      });
      pdf.setTextColor(17, 24, 39);
      y += cardH + 8;

      // ── 3. Empresa → Centro de Custo → despesas, com subtotais ──
      if (ccArvore.length === 0) {
        pdf.setFontSize(10);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(107, 114, 128);
        t("Nenhuma despesa integrada ao ERP neste periodo.", ML, y);
      }

      ccArvore.forEach((empresaNode) => {
        sectionLine(`${empresaNode.nome}  —  ${formatCurrency(empresaNode.total)}`);

        empresaNode.centros.forEach((ccNode) => {
          checkY(10);
          pdf.setFontSize(8.5);
          pdf.setFont("helvetica", "bold");
          pdf.setTextColor(...NAVY);
          t(ccNode.label, ML + 2, y);
          pdf.setFont("helvetica", "normal");
          pdf.setTextColor(17, 24, 39);
          t(formatCurrency(ccNode.total), ML + CW, y, { align: "right" });
          y += 3;

          const cols = [
            { label: "ERP ID", w: CW * 0.10 },
            { label: "Data", w: CW * 0.11 },
            { label: "Tipo", w: CW * 0.17 },
            { label: "Funcionario", w: CW * 0.20 },
            { label: "Complemento", w: CW * 0.24 },
            { label: "Valor", w: CW * 0.18, align: "right" as const },
          ];
          tblHeader(cols);
          ccNode.itens.forEach((item, i) => {
            tblRow([
              { val: item.despesa.erp_id ?? "—", w: cols[0].w },
              { val: item.dataRef ? formatDate(item.dataRef) : "—", w: cols[1].w },
              { val: item.tipoNome, w: cols[2].w },
              { val: item.tecnicoNome, w: cols[3].w },
              { val: item.complemento, w: cols[4].w },
              { val: formatCurrency(Number(item.despesa.valor)), w: cols[5].w, align: "right", bold: true },
            ], i % 2 !== 0);
          });
          y += 3;
        });
      });

      pdf.save(`centro-de-custo-${periodoLabel.replace(/[\s/]/g, "-").toLowerCase()}.pdf`);
    } catch (err) {
      console.error("[v0] Erro ao exportar PDF de centro de custo:", err);
    } finally {
      setExportandoCC(false);
    }
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

      // Para align "right": o ponto x é a borda direita da coluna (cx + col.w).
      // Para align "left":  o ponto x é cx + 2 (padding interno).
      // Para align "center": cx + col.w / 2.
      const colX = (cx: number, col: { w: number; align?: string }) => {
        if (col.align === "right")  return cx + col.w;        // âncora na borda direita
        if (col.align === "center") return cx + col.w / 2;
        return cx + 2;                                         // âncora esquerda com padding
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
          text(col.label.toUpperCase(), colX(cx, col), y + 4.5, { align: col.align ?? "left" });
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
          const maxW = col.w - 4;
          const lines = pdf.splitTextToSize(col.val, maxW) as string[];
          text(lines[0], colX(cx, col), y + 4.2, { align: col.align ?? "left" });
          cx += col.w;
        });
        pdf.setDrawColor(220, 226, 240);
        pdf.setLineWidth(0.1);
        pdf.line(ML, y + 6, ML + CW, y + 6);
        y += 6;
      };


  const anos = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  // Helper: extrai a data de referência conforme campoPeriodo
  const getDataRef = (d: typeof despesas[0]): string =>
    campoPeriodo === "data_vencimento"
      ? (d.data_vencimento || d.data_despesa || d.created_at || "").slice(0, 10)
      : (d.data_despesa || d.created_at || "").slice(0, 10);

  // Todas as despesas enviadas do período (exclui apenas rascunhos) — base para gráficos e tabela
  const despesasAno = useMemo(() => {
    return despesas.filter((d) => {
      // Exclui rascunhos nunca enviados
      if (d.status_erp === "Rascunho" && d.status_aprovacao === "AguardandoGestor" && !d.data_envio) return false;
      const dataStr = getDataRef(d);
      if (modoFiltro === "mes") {
        const dt = new Date(dataStr + "T00:00:00");
        return dt.getMonth() === mesSelecionado && dt.getFullYear() === anoSelecionado;
      } else {
        if (dataInicial && dataStr < dataInicial) return false;
        if (dataFinal && dataStr > dataFinal) return false;
        return true;
      }
    });
  }, [despesas, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, campoPeriodo]);

  // Despesas com filtros cruzados (todas enviadas) — usadas nos gráficos e cards
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
      const dataStr = getDataRef(d);
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
  }, [despesas, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroFuncionario, filtroTipo, campoPeriodo]);

  const totalAno = despesasCruzadas.reduce((s, d) => s + Number(d.valor), 0);
  const totalLancamentos = despesasCruzadas.length;
  const ticketMedio = totalLancamentos > 0 ? totalAno / totalLancamentos : 0;
  const tecnicosAtivos = new Set(despesasCruzadas.map((d) => d.tecnico_id)).size;

  // Evolução mensal — considera todas as despesas enviadas do ano selecionado
  const byMes = useMemo(() => {
    const base = despesas.filter((d) => {
      if (d.status_erp === "Rascunho" && d.status_aprovacao === "AguardandoGestor" && !d.data_envio) return false;
      if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
      if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
      return true;
    });
    return MESES.map((m, i) => ({
      mes: m,
      valor: base
        .filter((d) => {
          const dataStr = campoPeriodo === "data_vencimento"
            ? (d.data_vencimento || d.data_despesa || d.created_at || "").slice(0, 10)
            : (d.data_despesa || d.created_at || "").slice(0, 10);
          const dt = new Date(dataStr + "T12:00:00");
          return dt.getMonth() === i && dt.getFullYear() === anoSelecionado;
        })
        .reduce((s, d) => s + Number(d.valor), 0),
    }));
  }, [despesas, anoSelecionado, filtroFuncionario, filtroTipo, campoPeriodo]);

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

  // KM filtrado (período)
  const registrosKmPeriodo = useMemo(() => {
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

  // KM filtrado (período + funcionário selecionado interativamente)
  const registrosKmFiltrados = useMemo(() => {
    if (!kmFuncFiltro) return registrosKmPeriodo;
    // Encontra o profile pelo nome abreviado
    const profile = profiles.find((p) => p.nome.split(" ").slice(0, 2).join(" ") === kmFuncFiltro);
    if (!profile) return registrosKmPeriodo;
    return registrosKmPeriodo.filter((r) => r.usuario_id === profile.id);
  }, [registrosKmPeriodo, kmFuncFiltro, profiles]);

  const kmPercorrido = (r: ControleKm) => r.km_percorrido ?? (r.km_final != null ? Math.max(0, r.km_final - r.km_inicial) : 0);

  const totalKmPeriodo = useMemo(() => registrosKmFiltrados.reduce((s, r) => s + kmPercorrido(r), 0), [registrosKmFiltrados]);
  const totalViagens = registrosKmFiltrados.length;
  const mediaKmViagem = totalViagens > 0 ? totalKmPeriodo / totalViagens : 0;
  const totalSegundosKm = useMemo(
    () =>
      registrosKmFiltrados
        .filter((r) => r.data_fim)
        .reduce((s, r) => {
          const secs = Math.floor(
            (new Date(r.data_fim!).getTime() - new Date(r.data_inicio).getTime()) / 1000
          );
          return s + (secs > 0 ? secs : 0);
        }, 0),
    [registrosKmFiltrados]
  );

  const formatTempoKm = (secs: number) => {
    if (secs === 0) return "—";
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
    return `${m}min`;
  };

  // registros do ano todo respeitando filtro de funcionário
  const registrosKmAno = useMemo(() => {
    const base = registrosKm.filter((r) => {
      if (r.status !== "finalizado") return false;
      if (!isGestorOuAdmin && currentUser?.id && r.usuario_id !== currentUser.id) return false;
      return new Date(r.data_inicio).getFullYear() === anoSelecionado;
    });
    if (!kmFuncFiltro) return base;
    const profile = profiles.find((p) => p.nome.split(" ").slice(0, 2).join(" ") === kmFuncFiltro);
    if (!profile) return base;
    return base.filter((r) => r.usuario_id === profile.id);
  }, [registrosKm, isGestorOuAdmin, currentUser, anoSelecionado, kmFuncFiltro, profiles]);

  const kmByMes = useMemo(() => {
    return MESES.map((m, i) => ({
      mes: m,
      km: registrosKmAno
        .filter((r) => new Date(r.data_inicio).getMonth() === i)
        .reduce((s, r) => s + kmPercorrido(r), 0),
    }));
  }, [registrosKmAno]);

  const kmByFrota = useMemo(() => {
    return frotas
      .map((f) => ({
        nome: f.placa,
        km: registrosKmFiltrados.filter((r) => r.frota_id === f.id).reduce((s, r) => s + kmPercorrido(r), 0),
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
        km: registrosKmFiltrados.filter((r) => r.usuario_id === p.id).reduce((s, r) => s + kmPercorrido(r), 0),
      }))
      .filter((p) => p.km > 0)
      .sort((a, b) => b.km - a.km)
      .slice(0, 8);
  }, [profiles, registrosKmFiltrados, isGestorOuAdmin]);

  // ─── Estimativa KM vs Apontado por funcionário ───────────────────────────────
  // Usa calcularEstimativaVeiculo (consumo-frota.ts) como fonte única de cálculo.
  const estimativaKmFuncionario = useMemo(() => {
    if (!isGestorOuAdmin) return [];

    // Datas de início/fim do período
    let periodoIni: string;
    let periodoFim: string;
    if (modoFiltro === "mes") {
      periodoIni = new Date(anoSelecionado, mesSelecionado, 1).toISOString().slice(0, 10);
      periodoFim = new Date(anoSelecionado, mesSelecionado + 1, 0).toISOString().slice(0, 10);
    } else {
      periodoIni = dataInicial;
      periodoFim = dataFinal;
    }

    return profiles
      .map((p) => {
        // Frotas que este funcionário utilizou (abastecimentos ou apontamentos — qualquer momento)
        const frotasDoFunc = new Set<string>([
          ...despesas.filter((d) => d.tecnico_id === p.id && d.frota_id).map((d) => d.frota_id as string),
          ...registrosKm.filter((r) => r.usuario_id === p.id && r.frota_id).map((r) => r.frota_id as string),
        ]);

        if (frotasDoFunc.size === 0) return null;

        const veiculos = [...frotasDoFunc].map((frotaId) => {
          const frota = frotas.find((f) => f.id === frotaId);
          const placa = (frota as any)?.placa ?? frotaId;
          const frotaKmMedia = (frota as any)?.km_media_litro ?? null;

          const est = calcularEstimativaVeiculo({
            frotaId,
            periodoIni,
            periodoFim,
            frotaKmMedia,
            todasDespesas: despesas,
            todosRegistrosKm: registrosKm,
            usuarioId: p.id,
          });

          return {
            frotaId,
            placa,
            litrosPeriodo:         est.litrosPeriodo,
            saldoInicial:          est.saldoInicial,
            combustivelDisponivel: est.combustivelDisponivel,
            kmEstimado:            est.kmEstimado,
            kmApontadoVeiculo:     est.kmApontado,
            diferenca:             est.diferenca,
            pctVeiculo:            est.percentual,
            saldoFinal:            est.saldoFinal,
            mediaUsada:            est.mediaUsada,
            dadosSuficientes:      est.dadosSuficientes,
            estimativa:            est.estimativa,
          };
        }).filter((v) => v.kmEstimado > 0 || v.kmApontadoVeiculo > 0 || v.litrosPeriodo > 0);

        if (veiculos.length === 0) return null;

        const kmApontado          = veiculos.reduce((s, v) => s + v.kmApontadoVeiculo, 0);
        const kmEstimado          = veiculos.reduce((s, v) => s + v.kmEstimado, 0);
        const totalLitros         = veiculos.reduce((s, v) => s + v.litrosPeriodo, 0);
        const totalSaldoInicial   = veiculos.reduce((s, v) => s + v.saldoInicial, 0);
        const totalCombDisp       = veiculos.reduce((s, v) => s + v.combustivelDisponivel, 0);
        const totalSaldoFinal     = veiculos.reduce((s, v) => s + v.saldoFinal, 0);
        const pct = kmEstimado > 0 ? Math.round((kmApontado / kmEstimado) * 100) : null;
        const kmLReal = totalLitros > 0 ? Math.round((kmApontado / totalLitros) * 100) / 100 : null;
        const semAbastecimento = kmApontado > 0 && totalLitros === 0 && totalSaldoInicial === 0;
        const semViagem = kmApontado === 0 && totalLitros > 0;

        return {
          id: p.id,
          nome: p.nome.split(" ").slice(0, 2).join(" "),
          kmApontado,
          kmEstimado,
          totalLitros,
          totalSaldoInicial,
          totalCombustivelDisponivel: totalCombDisp,
          totalSaldoFinal,
          diferenca: kmEstimado - kmApontado,
          pct,
          kmLReal,
          semAbastecimento,
          semViagem,
          veiculos,
        };
      })
      .filter(Boolean)
      .filter((item) => item!.kmApontado > 0 || item!.totalLitros > 0)
      .sort((a, b) => b!.kmApontado - a!.kmApontado) as {
        id: string; nome: string;
        kmApontado: number; kmEstimado: number;
        totalLitros: number; totalSaldoInicial: number;
        totalCombustivelDisponivel: number; totalSaldoFinal: number;
        diferenca: number; pct: number | null; kmLReal: number | null;
        semAbastecimento: boolean; semViagem: boolean;
        veiculos: {
          frotaId: string; placa: string; litrosPeriodo: number;
          saldoInicial: number; combustivelDisponivel: number;
          kmEstimado: number; kmApontadoVeiculo: number;
          diferenca: number; pctVeiculo: number | null;
          saldoFinal: number; mediaUsada: number;
          dadosSuficientes: boolean; estimativa: boolean;
        }[];
      }[];
  }, [profiles, registrosKm, despesas, frotas, isGestorOuAdmin, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal]);

  const filtroFuncionarioNome = filtroFuncionario ? profiles.find((p) => p.id === filtroFuncionario)?.nome : null;
  const filtroTipoNome = filtroTipo ? tiposDespesa.find((t) => t.id === filtroTipo)?.nome : null;
  const temFiltroAtivo = !!filtroFuncionario || !!filtroTipo;

  // ── Centro de Custo (visão gerencial: gestor/admin) ──

  // Índices O(1) para evitar buscas repetidas dentro do map principal
  const profilesPorId = useMemo(() => {
    const map = new Map<string, typeof profiles[0]>();
    profiles.forEach((p) => map.set(p.id, p));
    return map;
  }, [profiles]);

  const centrosCustoPorChave = useMemo(() => {
    const map = new Map<string, typeof centrosCustoTodos[0]>();
    centrosCustoTodos.forEach((c) => map.set(`${c.tipo_despesa_id}__${c.area}`, c));
    return map;
  }, [centrosCustoTodos]);

  // Data de referência conforme o seletor "Baseado em" desta aba
  const getDataRefCC = (d: typeof despesas[0]): string => {
    if (campoPeriodoCC === "data_envio") return (d.lancado_erp_em || d.data_envio || "").slice(0, 10);
    if (campoPeriodoCC === "data_vencimento") return (d.data_vencimento || d.data_despesa || "").slice(0, 10);
    return (d.data_despesa || "").slice(0, 10);
  };

  // Despesas integradas ao ERP, dentro do período/empresa selecionados, já
  // enriquecidas com área do funcionário, centro de custo e dados do erp_payload.
  const despesasIntegradas = useMemo(() => {
    if (!isGestorOuAdmin) return [];
    return despesas
      .filter((d) => d.erp_status === "integrado")
      .filter((d) => {
        const dataStr = getDataRefCC(d);
        if (!dataStr) return false;
        if (modoFiltro === "mes") {
          const dt = new Date(dataStr + "T12:00:00");
          return dt.getMonth() === mesSelecionado && dt.getFullYear() === anoSelecionado;
        }
        if (dataInicial && dataStr < dataInicial) return false;
        if (dataFinal && dataStr > dataFinal) return false;
        return true;
      })
      .filter((d) => filtroEmpresaCC == null || extrairEmpresaErpId(d) === filtroEmpresaCC)
      .map((d) => {
        const tecnico = profilesPorId.get(d.tecnico_id);
        const area = tecnico?.area ?? null;
        const centroCusto = area ? centrosCustoPorChave.get(`${d.tipo_despesa_id}__${area}`) : undefined;
        const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
        return {
          despesa: d,
          tecnicoNome: tecnico?.nome ?? "Sem funcionário",
          area: area ?? "Sem área",
          centroCustoErp: centroCusto?.centro_custo_erp ?? null,
          tipoNome: tipo?.nome ?? "—",
          empresaId: extrairEmpresaErpId(d),
          empresaNome: extrairEmpresaErpNome(d),
          complemento: extrairComplementoErp(d),
          dataRef: getDataRefCC(d),
        };
      });
  }, [despesas, isGestorOuAdmin, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, campoPeriodoCC, filtroEmpresaCC, profilesPorId, centrosCustoPorChave, tiposDespesa]);

  const ccCardsTotais = useMemo(() => {
    const valorTotal = despesasIntegradas.reduce((s, item) => s + Number(item.despesa.valor), 0);
    const totalLancamentos = despesasIntegradas.length;
    const funcionariosAtivos = new Set(despesasIntegradas.map((item) => item.despesa.tecnico_id)).size;
    return { valorTotal, totalLancamentos, funcionariosAtivos };
  }, [despesasIntegradas]);

  const ccByEmpresa = useMemo(() => {
    const map = new Map<string, { empresaId: number | null; nome: string; valor: number }>();
    despesasIntegradas.forEach((item) => {
      const key = String(item.empresaId ?? "—");
      if (!map.has(key)) map.set(key, { empresaId: item.empresaId, nome: item.empresaNome, valor: 0 });
      map.get(key)!.valor += Number(item.despesa.valor);
    });
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor);
  }, [despesasIntegradas]);

  const ccByArea = useMemo(() => {
    const map = new Map<string, number>();
    despesasIntegradas.forEach((item) => {
      map.set(item.area, (map.get(item.area) ?? 0) + Number(item.despesa.valor));
    });
    return Array.from(map.entries())
      .map(([area, valor]) => ({ area, valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [despesasIntegradas]);

  // Rótulo de um centro de custo: código + todos os tipos de despesa distintos
  // que caem nele (mesmo código pode ter sido cadastrado para tipos diferentes).
  const labelCentroCusto = (codigo: string | null, tipos: Set<string>) => {
    const tiposOrdenados = Array.from(tipos).sort();
    return codigo
      ? `${codigo} - ${tiposOrdenados.join(" / ")}`
      : `Sem centro de custo - ${tiposOrdenados.join(" / ")}`;
  };

  const ccByCentroCusto = useMemo(() => {
    const map = new Map<string, { codigo: string | null; tipos: Set<string>; valor: number }>();
    despesasIntegradas.forEach((item) => {
      const key = item.centroCustoErp ?? "__sem__";
      if (!map.has(key)) map.set(key, { codigo: item.centroCustoErp, tipos: new Set(), valor: 0 });
      const node = map.get(key)!;
      node.tipos.add(item.tipoNome);
      node.valor += Number(item.despesa.valor);
    });
    return Array.from(map.values())
      .map((node) => ({ label: labelCentroCusto(node.codigo, node.tipos), valor: node.valor }))
      .sort((a, b) => b.valor - a.valor);
  }, [despesasIntegradas]);

  // Estrutura hierárquica Empresa → Centro de Custo → despesas, com subtotais em cada nível.
  // O agrupamento do Centro de Custo usa somente o código (centroCustoErp), ignorando o
  // tipo de despesa — assim códigos duplicados cadastrados para tipos diferentes (ex: o
  // mesmo "142" usado em Alimentação e Assistência) aparecem juntos num único grupo.
  const ccArvore = useMemo(() => {
    type ItemCC = typeof despesasIntegradas[0];
    const empresasMap = new Map<string, { empresaId: number | null; nome: string; total: number; centros: Map<string, { codigo: string | null; tipos: Set<string>; total: number; itens: ItemCC[] }> }>();

    despesasIntegradas.forEach((item) => {
      const empresaKey = String(item.empresaId ?? "—");
      if (!empresasMap.has(empresaKey)) {
        empresasMap.set(empresaKey, { empresaId: item.empresaId, nome: item.empresaNome, total: 0, centros: new Map() });
      }
      const empresaNode = empresasMap.get(empresaKey)!;
      empresaNode.total += Number(item.despesa.valor);

      const ccKey = item.centroCustoErp ?? "__sem__";
      if (!empresaNode.centros.has(ccKey)) {
        empresaNode.centros.set(ccKey, { codigo: item.centroCustoErp, tipos: new Set(), total: 0, itens: [] });
      }
      const ccNode = empresaNode.centros.get(ccKey)!;
      ccNode.tipos.add(item.tipoNome);
      ccNode.total += Number(item.despesa.valor);
      ccNode.itens.push(item);
    });

    return Array.from(empresasMap.entries())
      .map(([empresaKey, node]) => ({
        empresaKey,
        empresaId: node.empresaId,
        nome: node.nome,
        total: node.total,
        centros: Array.from(node.centros.entries())
          .map(([ccKey, cc]) => ({
            ccKey,
            label: labelCentroCusto(cc.codigo, cc.tipos),
            total: cc.total,
            itens: cc.itens.slice().sort((a, b) => a.dataRef.localeCompare(b.dataRef)),
          }))
          .sort((a, b) => b.total - a.total),
      }))
      .sort((a, b) => b.total - a.total);
  }, [despesasIntegradas]);

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
            {abaRelatorio === "despesas"
              ? isFuncionario ? "Suas despesas aprovadas" : "Análise de despesas aprovadas"
              : abaRelatorio === "km"
              ? isFuncionario ? "Seus apontamentos de quilometragem" : "Análise de apontamentos de quilometragem"
              : "Despesas integradas ao ERP por empresa e centro de custo"} &mdash;{" "}
            <span className="text-accent font-medium">
              {modoFiltro === "mes"
                ? `${MESES_FULL[mesSelecionado]} ${anoSelecionado}`
                : dataInicial && dataFinal
                ? `${dataInicial.split("-").reverse().join("/")} até ${dataFinal.split("-").reverse().join("/")}`
                : "Período personalizado"}
            </span>
          </p>

          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit overflow-x-auto mt-3">
            <button
              onClick={() => setAbaRelatorio("despesas")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${abaRelatorio === "despesas" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              Despesas
            </button>
            <button
              onClick={() => setAbaRelatorio("km")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${abaRelatorio === "km" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Gauge className="w-3.5 h-3.5" />
              Controle de KM
            </button>
            {isGestorOuAdmin && (
              <button
                onClick={() => setAbaRelatorio("centrocusto")}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-sm font-medium transition whitespace-nowrap ${abaRelatorio === "centrocusto" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Building2 className="w-3.5 h-3.5" />
                Centro de Custo
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-2 sm:self-end flex-wrap justify-end">
            {/* Seletor: Período baseado em (só aplicável a Despesas) */}
            {abaRelatorio === "despesas" && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-border rounded-lg text-xs text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                <span className="font-medium text-foreground/70 hidden sm:inline">Baseado em</span>
                <select
                  value={campoPeriodo}
                  onChange={(e) => setCampoPeriodo(e.target.value as "data_despesa" | "data_vencimento")}
                  className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer"
                >
                  <option value="data_despesa">Data da Despesa</option>
                  <option value="data_vencimento">Data de Vencimento</option>
                </select>
              </div>
            )}

            {/* Seletores próprios da aba Centro de Custo */}
            {abaRelatorio === "centrocusto" && (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-border rounded-lg text-xs text-muted-foreground">
                  <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-medium text-foreground/70 hidden sm:inline">Baseado em</span>
                  <select
                    value={campoPeriodoCC}
                    onChange={(e) => setCampoPeriodoCC(e.target.value as "data_despesa" | "data_vencimento" | "data_envio")}
                    className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer"
                  >
                    <option value="data_envio">Data do Envio</option>
                    <option value="data_despesa">Data da Despesa</option>
                    <option value="data_vencimento">Data de Vencimento</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-border rounded-lg text-xs text-muted-foreground">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-medium text-foreground/70 hidden sm:inline">Empresa</span>
                  <select
                    value={filtroEmpresaCC ?? ""}
                    onChange={(e) => setFiltroEmpresaCC(e.target.value === "" ? null : Number(e.target.value))}
                    className="bg-transparent text-xs font-medium text-foreground focus:outline-none cursor-pointer"
                  >
                    <option value="">Todas</option>
                    {Object.entries(EMPRESAS_ERP).map(([id, nome]) => (
                      <option key={id} value={id}>{nome}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Seletor: Por Mês / Período */}
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

            {/* Dropdown Exportar PDF (só aplicável a Despesas — não há exportação de KM) */}
            {abaRelatorio === "despesas" && (
              <div className="relative" ref={pdfMenuRef}>
                <button
                  onClick={() => setPdfMenuAberto((v) => !v)}
                  disabled={exportando || exportandoReembolso}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input bg-white text-xs hover:bg-muted transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {(exportando || exportandoReembolso) ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Exportar PDF
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    </>
                  )}
                </button>

                {pdfMenuAberto && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-border rounded-xl shadow-lg z-30 overflow-hidden">
                    <button
                      onClick={() => { setPdfMenuAberto(false); handleExportarPDF(); }}
                      className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-muted transition"
                    >
                      <FileText className="w-4 h-4 text-accent mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Exportação Completa</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          Todas as despesas pelo {campoPeriodo === "data_despesa" ? "data da despesa" : "data de vencimento"}
                        </p>
                      </div>
                    </button>
                    <div className="border-t border-border" />
                    <button
                      onClick={handleExportarReembolsos}
                      className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-muted transition"
                    >
                      <DollarSign className="w-4 h-4 text-success mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold text-foreground">Exportação de Reembolsos</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                          Somente pagamentos em dinheiro · sempre por vencimento
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Exportar PDF — aba Centro de Custo */}
            {abaRelatorio === "centrocusto" && (
              <button
                onClick={handleExportarPDFCentroCusto}
                disabled={exportandoCC}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input bg-white text-xs hover:bg-muted transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {exportandoCC ? (
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
            )}
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

      {/* Banner de filtros cruzados ativos (específico de Despesas) */}
      {abaRelatorio === "despesas" && temFiltroAtivo && (
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

      {abaRelatorio === "despesas" && (
      <>
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
      </>
      )}

      {abaRelatorio === "km" && (
      <>
      {/* ── Seção KM ── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center">
          <Gauge className="w-4 h-4" />
        </div>
        <h2 className="text-base font-bold text-foreground">Controle de KM</h2>
        {kmFuncFiltro && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <span>{kmFuncFiltro}</span>
            <button
              onClick={() => setKmFuncFiltro(null)}
              className="hover:text-primary/60 transition"
              title="Limpar filtro"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}
        <div className="h-px flex-1 bg-border" />
        {kmFuncFiltro && (
          <span className="text-xs text-muted-foreground italic">Clique no funcionário novamente para limpar</span>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: <Route className="w-5 h-5" />, value: formatKmRel(totalKmPeriodo), label: "KM Total Percorrido", bg: "bg-accent/10", color: "text-accent" },
          { icon: <Car className="w-5 h-5" />, value: totalViagens, label: "Viagens Finalizadas", bg: "bg-primary/10", color: "text-primary" },
          { icon: <Gauge className="w-5 h-5" />, value: formatKmRel(mediaKmViagem), label: "Média por Viagem", bg: "bg-success/10", color: "text-success" },
          { icon: <Clock className="w-5 h-5" />, value: formatTempoKm(totalSegundosKm), label: "Tempo Total em Rota", bg: "bg-warning/10", color: "text-warning" },
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground">KM por Funcionário</h3>
              <span className="text-[10px] text-muted-foreground italic">Clique para filtrar todos os gráficos</span>
            </div>
            <ResponsiveContainer width="100%" height={Math.max(180, kmByFuncionario.length * 36)}>
              <BarChart
                data={kmByFuncionario}
                layout="vertical"
                barSize={16}
                margin={{ right: 80 }}
                style={{ cursor: "pointer" }}
                onClick={(data) => {
                  if (data?.activePayload?.[0]) {
                    const nome = data.activePayload[0].payload.nome;
                    setKmFuncFiltro((prev) => (prev === nome ? null : nome));
                  }
                }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={75} />
                <Tooltip formatter={(v: number) => [`${v.toLocaleString("pt-BR")} km`, "KM"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar dataKey="km" radius={[0, 4, 4, 0]}>
                  {kmByFuncionario.map((entry) => (
                    <Cell
                      key={entry.nome}
                      fill={kmFuncFiltro === null || kmFuncFiltro === entry.nome
                        ? "oklch(0.577 0.245 27.325)"
                        : "oklch(0.577 0.245 27.325 / 0.3)"}
                    />
                  ))}
                  <LabelList dataKey="km" content={<KmBarLabel />} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Estimativa KM vs Apontado por Funcionário ── */}
      {isGestorOuAdmin && estimativaKmFuncionario.length > 0 && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Estimativa KM vs Apontado por Funcionário</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Considera saldo estimado de combustível do período anterior + abastecimentos do período.
                A estimativa é calculada por veículo e agregada por funcionário.
              </p>
            </div>
            <div className="flex items-center gap-4 shrink-0">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-sm bg-muted-foreground/20 inline-block" />
                KM disponível estimado
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-3 h-3 rounded-sm bg-primary inline-block" />
                KM apontado
              </span>
            </div>
          </div>

          <div className="flex flex-col divide-y divide-border">
            {estimativaKmFuncionario.map((item) => {
              const max = Math.max(item.kmEstimado, item.kmApontado, 1);
              const barEstPct = (item.kmEstimado / max) * 100;
              const barAptPct = (item.kmApontado / max) * 100;

              const barColor =
                item.pct === null
                  ? "bg-primary"
                  : item.pct >= 85 && item.pct <= 115
                  ? "bg-success"
                  : item.pct > 115
                  ? "bg-warning"
                  : "bg-destructive";

              const pctColor =
                item.pct === null ? "text-muted-foreground"
                : item.pct >= 85 && item.pct <= 115 ? "text-success"
                : item.pct > 115 ? "text-warning"
                : "text-destructive";

              const pctLabel =
                item.pct !== null
                  ? item.pct >= 85 && item.pct <= 115
                    ? `${item.pct}% — dentro do estimado`
                    : item.pct > 115
                    ? `${item.pct}% — acima do estimado`
                    : `${item.pct}% — abaixo do estimado`
                  : "sem estimativa";

              return (
                <div key={item.id} className="py-4 first:pt-0 last:pb-0 flex flex-col gap-3">

                  {/* Cabeçalho: nome + % total */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground">{item.nome}</span>
                    <span className={`text-[11px] font-semibold whitespace-nowrap ${pctColor}`}>
                      {pctLabel}
                    </span>
                  </div>

                  {/* Barra */}
                  <div className="relative h-7 rounded-md overflow-hidden bg-muted/30">
                    <div className="absolute inset-y-0 left-0 rounded-md bg-muted-foreground/20 transition-all" style={{ width: `${barEstPct}%` }} />
                    <div className={`absolute inset-y-0 left-0 rounded-md opacity-80 transition-all ${barColor}`} style={{ width: `${barAptPct}%` }} />
                    <div className="absolute inset-0 flex items-center px-2.5">
                      <span className="text-[11px] font-bold text-white drop-shadow leading-none">
                        {item.kmApontado > 0 ? `${item.kmApontado.toLocaleString("pt-BR")} km apontado` : ""}
                      </span>
                    </div>
                  </div>

                  {/* Resumo agregado */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-muted/30 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Saldo inicial est.</span>
                      <span className="text-xs font-semibold text-foreground">{item.totalSaldoInicial.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span>
                    </div>
                    <div className="bg-muted/30 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Abastecido no período</span>
                      <span className="text-xs font-semibold text-foreground">{item.totalLitros.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span>
                    </div>
                    <div className="bg-muted/30 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">KM estimado disponível</span>
                      <span className="text-xs font-semibold text-foreground">{item.kmEstimado.toLocaleString("pt-BR")} km</span>
                    </div>
                    <div className="bg-muted/30 rounded-lg px-3 py-2 flex flex-col gap-0.5">
                      <span className="text-[10px] text-muted-foreground">Saldo final est.</span>
                      <span className="text-xs font-semibold text-foreground">{item.totalSaldoFinal.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span>
                    </div>
                  </div>

                  {/* Detalhes por veículo */}
                  {item.veiculos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {item.veiculos.map((v) => (
                        <div key={v.frotaId} className="border border-border rounded-lg px-3 py-2 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                              <Car className="w-3 h-3 text-muted-foreground" />
                              {v.placa}
                              {v.estimativa && (
                                <span className="text-[9px] text-muted-foreground font-normal italic">(média cadastrada)</span>
                              )}
                              {!v.dadosSuficientes && (
                                <span className="text-[9px] text-warning font-normal italic">(dados insuficientes)</span>
                              )}
                            </span>
                            {v.pctVeiculo !== null && (
                              <span className={`text-[10px] font-semibold ${
                                v.pctVeiculo >= 85 && v.pctVeiculo <= 115 ? "text-success"
                                : v.pctVeiculo > 115 ? "text-warning" : "text-destructive"
                              }`}>{v.pctVeiculo}%</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>Consumo médio: <span className="font-medium text-foreground">{v.mediaUsada > 0 ? `${v.mediaUsada.toFixed(1)} km/L` : "—"}</span></span>
                            <span>Saldo inicial: <span className="font-medium text-foreground">{v.saldoInicial.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span></span>
                            <span>Abastecido: <span className="font-medium text-foreground">{v.litrosPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span></span>
                            <span>Disponível: <span className="font-medium text-foreground">{v.combustivelDisponivel.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span></span>
                            <span>KM est.: <span className="font-medium text-foreground">{v.kmEstimado.toLocaleString("pt-BR")} km</span></span>
                            <span>KM apontado: <span className="font-medium text-foreground">{v.kmApontadoVeiculo.toLocaleString("pt-BR")} km</span></span>
                            <span>Diferença: <span className={`font-medium ${v.diferenca >= 0 ? "text-success" : "text-destructive"}`}>{v.diferenca >= 0 ? "+" : ""}{v.diferenca.toLocaleString("pt-BR")} km</span></span>
                            <span>Saldo final: <span className="font-medium text-foreground">{v.saldoFinal.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Alertas de inconsistência */}
                  <div className="flex flex-wrap items-center gap-2">
                    {item.semAbastecimento && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-warning/8 border border-warning/20 text-warning">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>KM apontado sem abastecimento — verifique lançamentos de combustível</span>
                      </div>
                    )}
                    {item.semViagem && (
                      <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-destructive/8 border border-destructive/20 text-destructive">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>Abastecimento sem viagens apontadas — verifique o controle de KM</span>
                      </div>
                    )}
                    {item.kmLReal !== null && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border bg-muted/30 border-border">
                        <span className="font-mono font-bold text-foreground">{item.kmLReal.toFixed(2)} km/L</span>
                        <span className="text-muted-foreground">real apontado</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legenda de cores */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-border">
            <span className="text-[10px] text-muted-foreground font-medium">Interpretação:</span>
            <span className="flex items-center gap-1 text-[10px] text-success"><span className="w-2 h-2 rounded-full bg-success inline-block" />85–115% — dentro do esperado</span>
            <span className="flex items-center gap-1 text-[10px] text-warning"><span className="w-2 h-2 rounded-full bg-warning inline-block" />{">"}115% — acima do estimado</span>
            <span className="flex items-center gap-1 text-[10px] text-destructive"><span className="w-2 h-2 rounded-full bg-destructive inline-block" />{"<"}85% — abaixo do estimado</span>
            <span className="flex items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground ml-auto italic">
              <span>Estimativa: litros × média KM/L do veículo</span>
              <span>·</span>
              <span>KM/L real: km apontados ÷ litros abastecidos</span>
            </span>
          </div>
        </div>
      )}
      </>
      )}

      {abaRelatorio === "centrocusto" && isGestorOuAdmin && (
      <>
      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { icon: <DollarSign className="w-5 h-5" />, value: formatCurrency(ccCardsTotais.valorTotal), label: "Valor Total", bg: "bg-primary/10", color: "text-primary" },
          { icon: <FileText className="w-5 h-5" />, value: ccCardsTotais.totalLancamentos, label: "Total de Lançamentos", bg: "bg-accent/10", color: "text-accent" },
          { icon: <Users className="w-5 h-5" />, value: ccCardsTotais.funcionariosAtivos, label: "Funcionários Ativos", bg: "bg-warning/10", color: "text-warning" },
        ].map(({ icon, value, label, bg, color }) => (
          <div key={label} className="bg-white rounded-xl border border-border shadow-sm p-4">
            <div className={`w-9 h-9 rounded-lg ${bg} ${color} flex items-center justify-center mb-3`}>{icon}</div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </div>
        ))}
      </div>

      {ccCardsTotais.totalLancamentos === 0 ? (
        <div className="bg-white rounded-xl border border-border shadow-sm p-10 flex flex-col items-center justify-center text-center gap-2">
          <Building2 className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Nenhuma despesa integrada ao ERP neste período</p>
          <p className="text-xs text-muted-foreground">Ajuste o período, a empresa ou o campo &quot;Baseado em&quot; para ver resultados.</p>
        </div>
      ) : (
      <>
      {/* Gráficos: Empresa / Área / Centro de Custo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {ccByEmpresa.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Valores por Empresa</h2>
            <p className="text-xs text-muted-foreground mb-4">Clique para filtrar por empresa</p>
            <ResponsiveContainer width="100%" height={Math.max(160, ccByEmpresa.length * 42)}>
              <BarChart data={ccByEmpresa} layout="vertical" barSize={22} margin={{ right: 90, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar
                  dataKey="valor"
                  radius={[0, 6, 6, 0]}
                  cursor="pointer"
                  onClick={(data) => setFiltroEmpresaCC(filtroEmpresaCC === data.empresaId ? null : data.empresaId)}
                >
                  <LabelList dataKey="valor" content={<CustomBarLabel />} />
                  {ccByEmpresa.map((entry, i) => (
                    <Cell
                      key={entry.nome}
                      fill={TIPO_COLORS[Math.min(i, TIPO_COLORS.length - 1)]}
                      opacity={filtroEmpresaCC != null && filtroEmpresaCC !== entry.empresaId ? 0.3 : 1}
                      stroke={filtroEmpresaCC === entry.empresaId ? "oklch(0.35 0.22 255)" : "transparent"}
                      strokeWidth={filtroEmpresaCC === entry.empresaId ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {ccByArea.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Valores por Área</h2>
            <p className="text-xs text-muted-foreground mb-4">Área do funcionário responsável</p>
            <ResponsiveContainer width="100%" height={Math.max(160, ccByArea.length * 42)}>
              <BarChart data={ccByArea} layout="vertical" barSize={22} margin={{ right: 90, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="area" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={110} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="valor" content={<CustomBarLabel />} />
                  {ccByArea.map((entry, i) => (
                    <Cell key={entry.area} fill={FUNC_COLORS[Math.min(i, FUNC_COLORS.length - 1)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {ccByCentroCusto.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-1">Valores por Centro de Custo</h2>
            <p className="text-xs text-muted-foreground mb-4">Centro de custo ERP + tipo de despesa</p>
            <ResponsiveContainer width="100%" height={Math.max(160, ccByCentroCusto.length * 42)}>
              <BarChart data={ccByCentroCusto} layout="vertical" barSize={22} margin={{ right: 90, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]}>
                  <LabelList dataKey="valor" content={<CustomBarLabel />} />
                  {ccByCentroCusto.map((entry, i) => (
                    <Cell key={entry.label} fill={TIPO_COLORS[Math.min(i, TIPO_COLORS.length - 1)]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Tabela hierárquica: Empresa → Centro de Custo → despesas */}
      <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-semibold text-foreground">Despesas por Empresa e Centro de Custo</h2>
          <span className="text-xs text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{formatCurrency(ccCardsTotais.valorTotal)}</span>
          </span>
        </div>
        <div className="border-t border-border">
          {ccArvore.map((empresaNode) => {
            const empresaAberta = ccGruposAbertos.has(empresaNode.empresaKey);
            return (
              <div key={empresaNode.empresaKey} className="border-b border-border last:border-b-0">
                <button
                  onClick={() => toggleCcGrupo(empresaNode.empresaKey)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-3 bg-muted/40 hover:bg-muted/70 transition text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {empresaAberta ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    <Building2 className="w-4 h-4 text-primary" />
                    {empresaNode.nome}
                  </span>
                  <span className="text-sm font-semibold text-foreground">{formatCurrency(empresaNode.total)}</span>
                </button>

                {empresaAberta && (
                  <div className="pl-4">
                    {empresaNode.centros.map((ccNode) => {
                      const ccKeyCompleta = `${empresaNode.empresaKey}__${ccNode.ccKey}`;
                      const ccAberto = ccGruposAbertos.has(ccKeyCompleta);
                      return (
                        <div key={ccKeyCompleta} className="border-t border-border">
                          <button
                            onClick={() => toggleCcGrupo(ccKeyCompleta)}
                            className="w-full flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-muted/40 transition text-left"
                          >
                            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
                              {ccAberto ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                              {ccNode.label}
                            </span>
                            <span className="text-xs font-semibold text-foreground">{formatCurrency(ccNode.total)}</span>
                          </button>

                          {ccAberto && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-muted/30 text-muted-foreground">
                                    <th className="text-left font-medium px-5 py-2">ERP ID</th>
                                    <th className="text-left font-medium px-2 py-2">Data</th>
                                    <th className="text-left font-medium px-2 py-2">Tipo</th>
                                    <th className="text-left font-medium px-2 py-2">Funcionário</th>
                                    <th className="text-left font-medium px-2 py-2">Complemento</th>
                                    <th className="text-right font-medium px-5 py-2">Valor</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ccNode.itens.map((item, idx) => (
                                    <tr key={item.despesa.id} className={idx % 2 === 1 ? "bg-muted/20" : ""}>
                                      <td className="px-5 py-2 text-muted-foreground">{item.despesa.erp_id ?? "—"}</td>
                                      <td className="px-2 py-2 text-muted-foreground">{item.dataRef ? formatDate(item.dataRef) : "—"}</td>
                                      <td className="px-2 py-2 text-foreground">{item.tipoNome}</td>
                                      <td className="px-2 py-2 text-foreground">{item.tecnicoNome}</td>
                                      <td className="px-2 py-2 text-muted-foreground max-w-[220px] truncate" title={item.complemento}>{item.complemento}</td>
                                      <td className="px-5 py-2 text-right font-medium text-foreground">{formatCurrency(Number(item.despesa.valor))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      </>
      )}
      </>
      )}
    </div>
  );
}
