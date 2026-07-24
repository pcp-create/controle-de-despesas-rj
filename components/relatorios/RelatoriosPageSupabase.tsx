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
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);

      // Agrupar despesas por funcionário (igual à tabela)
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

      // Montar HTML de impressão
      const container = document.createElement("div");
      container.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1100px;background:#fff;font-family:Inter,sans-serif;color:#111;padding:40px;box-sizing:border-box;";

      const periodoPDF = periodoLabel;
      const tituloFiltros = [
        filtroFuncionario ? `Funcionário: ${profiles.find((p) => p.id === filtroFuncionario)?.nome}` : "",
        filtroTipo ? `Tipo: ${tiposDespesa.find((t) => t.id === filtroTipo)?.nome}` : "",
      ].filter(Boolean).join(" | ");

      container.innerHTML = `
        <div style="border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-end;">
            <div>
              <h1 style="font-size:22px;font-weight:700;margin:0 0 4px;color:#1e40af;">Relatório de Despesas</h1>
              <p style="font-size:13px;color:#6b7280;margin:0;">${periodoPDF}${tituloFiltros ? ` &nbsp;|&nbsp; ${tituloFiltros}` : ""}</p>
            </div>
            <p style="font-size:11px;color:#9ca3af;margin:0;">Gerado em ${new Date().toLocaleDateString("pt-BR")} às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>

        <!-- Cards -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
          ${[
            { label: "Total do Período", val: formatCurrency(totalAno), color: "#2563eb" },
            { label: "Lançamentos", val: String(totalLancamentos), color: "#16a34a" },
            { label: "Ticket Médio", val: formatCurrency(ticketMedio), color: "#d97706" },
            ...(isGestorOuAdmin ? [{ label: "Funcionários", val: String(tecnicosAtivos), color: "#7c3aed" }] : []),
          ].map(c => `
            <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;border-top:3px solid ${c.color};">
              <p style="font-size:11px;color:#6b7280;margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px;">${c.label}</p>
              <p style="font-size:20px;font-weight:700;color:#111;margin:0;">${c.val}</p>
            </div>
          `).join("")}
        </div>

        <!-- Top Funcionários -->
        ${byTecnico.length > 0 ? `
        <div style="margin-bottom:28px;">
          <h2 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#374151;">Top Funcionários</h2>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">Funcionário</th>
                <th style="text-align:center;padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">Qtd</th>
                <th style="text-align:right;padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${byTecnico.map((t, i) => `
                <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};">
                  <td style="padding:7px 10px;border:1px solid #e5e7eb;">${t.nome}</td>
                  <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:center;">${t.qtd}</td>
                  <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(t.total)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ` : ""}

        <!-- Por Tipo de Despesa -->
        ${byTipo.length > 0 ? `
        <div style="margin-bottom:28px;">
          <h2 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#374151;">Por Tipo de Despesa</h2>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="text-align:left;padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">Tipo</th>
                <th style="text-align:right;padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">Total</th>
                <th style="text-align:right;padding:7px 10px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">%</th>
              </tr>
            </thead>
            <tbody>
              ${byTipo.map((t, i) => `
                <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};">
                  <td style="padding:7px 10px;border:1px solid #e5e7eb;">${t.name}</td>
                  <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(t.valor)}</td>
                  <td style="padding:7px 10px;border:1px solid #e5e7eb;text-align:right;">${totalAno > 0 ? ((t.valor / totalAno) * 100).toFixed(1) + "%" : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        ` : ""}

        <!-- Evolução Mensal -->
        <div style="margin-bottom:28px;">
          <h2 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#374151;">Evolução Mensal — ${anoSelecionado}</h2>
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
              <tr style="background:#f3f4f6;">
                ${MESES.map(m => `<th style="text-align:center;padding:7px 6px;border:1px solid #e5e7eb;color:#6b7280;text-transform:uppercase;font-size:10px;">${m}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              <tr>
                ${byMes.map(m => `<td style="padding:8px 6px;border:1px solid #e5e7eb;text-align:center;font-weight:${m.valor > 0 ? "600" : "400"};color:${m.valor > 0 ? "#111" : "#9ca3af"};">${m.valor > 0 ? formatCurrency(m.valor) : "—"}</td>`).join("")}
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Tabela agrupada por funcionário -->
        <div>
          <h2 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#374151;">Despesas do Período (${despesasCruzadas.length} registros)</h2>
          ${gruposPDF.map(grupo => {
            const subtotal = grupo.despesas.reduce((s, d) => s + Number(d.valor), 0);
            const rows = grupo.despesas
              .slice()
              .sort((a, b) => a.data_despesa.localeCompare(b.data_despesa))
              .map((d, i) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
                const aprovador = profiles.find((p) => p.id === d.aprovado_por);
                return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"};">
                  <td style="padding:6px 8px;border:1px solid #e5e7eb;">${formatDate(d.data_despesa)}</td>
                  <td style="padding:6px 8px;border:1px solid #e5e7eb;">${tipo?.nome ?? "—"}</td>
                  <td style="padding:6px 8px;border:1px solid #e5e7eb;">${d.cliente}</td>
                  <td style="padding:6px 8px;border:1px solid #e5e7eb;">${d.numero_os ?? "—"}</td>
                  <td style="padding:6px 8px;border:1px solid #e5e7eb;text-align:right;font-weight:600;">${formatCurrency(Number(d.valor))}</td>
                  <td style="padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;max-width:160px;">${d.observacao ?? "—"}</td>
                  ${!isFuncionario ? `
                    <td style="padding:6px 8px;border:1px solid #e5e7eb;">${aprovador?.nome ?? "—"}</td>
                    <td style="padding:6px 8px;border:1px solid #e5e7eb;">${d.aprovado_em ? formatDate(d.aprovado_em.slice(0, 10)) : "—"}</td>
                  ` : ""}
                </tr>`;
              }).join("");
            return `
              <div style="margin-bottom:20px;page-break-inside:avoid;">
                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0;">
                  <span style="font-size:13px;font-weight:700;color:#1e40af;">${grupo.nome}</span>
                  <span style="font-size:13px;font-weight:700;color:#1e40af;">${formatCurrency(subtotal)} &nbsp;&bull;&nbsp; ${grupo.despesas.length} ${grupo.despesas.length === 1 ? "despesa" : "despesas"}</span>
                </div>
                <table style="width:100%;border-collapse:collapse;font-size:11px;border-top:none;">
                  <thead>
                    <tr style="background:#f3f4f6;">
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Data</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Tipo</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Cliente</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">OS</th>
                      <th style="text-align:right;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Valor</th>
                      <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Observação</th>
                      ${!isFuncionario ? `
                        <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Aprovador</th>
                        <th style="text-align:left;padding:6px 8px;border:1px solid #e5e7eb;color:#6b7280;font-size:10px;text-transform:uppercase;">Data Aprov.</th>
                      ` : ""}
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            `;
          }).join("")}

          <!-- Total geral -->
          <div style="background:#1e40af;color:#fff;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;margin-top:12px;">
            <span style="font-size:13px;font-weight:600;">Total Geral &nbsp;&bull;&nbsp; ${despesasCruzadas.length} despesas &nbsp;&bull;&nbsp; ${gruposPDF.length} funcionários</span>
            <span style="font-size:15px;font-weight:700;">${formatCurrency(totalAno)}</span>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 1.8,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 1100,
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const ratio = canvas.width / canvas.height;
      const imgH = pdfW / ratio;
      let posY = 0;

      while (posY < canvas.height) {
        const sliceH = Math.min(pdfH * (canvas.width / pdfW), canvas.height - posY);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        const ctx = sliceCanvas.getContext("2d")!;
        ctx.drawImage(canvas, 0, posY, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceData = sliceCanvas.toDataURL("image/png");
        if (posY > 0) pdf.addPage();
        pdf.addImage(sliceData, "PNG", 0, 0, pdfW, (sliceH * pdfW) / canvas.width);
        posY += sliceH;
      }

      const nomeArquivo = `relatorio-despesas-${periodoLabel.replace(/\s+/g, "-").toLowerCase()}.pdf`;
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

  // Despesas após filtros cruzados
  const despesasCruzadas = useMemo(() => {
    return despesasAno.filter((d) => {
      if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
      if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
      return true;
    });
  }, [despesasAno, filtroFuncionario, filtroTipo]);

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
                  ({despesasCruzadas.length} {despesasCruzadas.length === 1 ? "registro" : "registros"} &bull; {formatCurrency(totalAno)})
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {temFiltroAtivo ? "Com filtros cruzados ativos" : "Todas as despesas aprovadas do período selecionado"}
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
          // Agrupar por funcionário
          const grupos: { tecnicoId: string | null; nome: string; despesas: typeof despesasCruzadas }[] = [];
          const seen = new Map<string, number>();
          despesasCruzadas.forEach((d) => {
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
              {despesasCruzadas.length === 0 ? (
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
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Valor</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Observação</th>
                      {!isFuncionario && (
                        <>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Aprovador</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Data Aprovação</th>
                        </>
                      )}
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
                              const aprovador = profiles.find((p) => p.id === d.aprovado_por);
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
                                  <td className="px-4 py-2 whitespace-nowrap text-right font-medium text-foreground">
                                    {formatCurrency(Number(d.valor))}
                                  </td>
                                  <td className="px-4 py-2 text-muted-foreground max-w-[180px] truncate" title={d.observacao ?? ""}>
                                    {d.observacao || "—"}
                                  </td>
                                  {!isFuncionario && (
                                    <>
                                      <td className="px-4 py-2 whitespace-nowrap text-foreground">
                                        {aprovador?.nome ?? <span className="text-muted-foreground">—</span>}
                                      </td>
                                      <td className="px-4 py-2 whitespace-nowrap text-foreground">
                                        {d.aprovado_em ? formatDate(d.aprovado_em.slice(0, 10)) : <span className="text-muted-foreground">—</span>}
                                      </td>
                                    </>
                                  )}
                                </tr>
                              );
                            })}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/50 border-t-2 border-border">
                      <td colSpan={colCount - 2} className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Total geral — {despesasCruzadas.length} {despesasCruzadas.length === 1 ? "despesa" : "despesas"} &bull; {grupos.length} {grupos.length === 1 ? "funcionário" : "funcionários"}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-foreground">
                        {formatCurrency(totalAno)}
                      </td>
                      <td colSpan={1} />
                      {!isFuncionario && <td colSpan={2} />}
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
