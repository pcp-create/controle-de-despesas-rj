"use client";

import { useState, useMemo } from "react";
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
import { Calendar, Download, TrendingUp, DollarSign, Users, FileText, CalendarDays, Gauge, Route, Clock, Car, X } from "lucide-react";

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
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input bg-white text-xs hover:bg-muted transition">
              <Download className="w-3.5 h-3.5" />
              Exportar PDF
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
