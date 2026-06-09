"use client";

import { useState, useMemo } from "react";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { formatCurrency } from "@/lib/helpers";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Calendar, Download, TrendingUp, DollarSign, Users, FileText } from "lucide-react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MESES_FULL = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

type ModoFiltro = "mes" | "periodo";

export default function RelatoriosPageSupabase() {
  const { currentUser } = useAppStore();
  const isFuncionario = currentUser?.perfil === "funcionario";

  const { despesas, isLoading } = useDespesas(isFuncionario ? currentUser?.id : undefined);
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  
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

  // Todas as despesas aprovadas — sem filtro de período (usado no gráfico de evolução)
  const despesasAprovadas = useMemo(() => {
    return despesas.filter((d) => d.status_aprovacao === "AprovadoGestor");
  }, [despesas]);

  // Despesas aprovadas filtradas pelo período selecionado (métricas, por tipo, top técnicos)
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

  // Métricas gerais
  const totalAno = despesasAno.reduce((s, d) => s + Number(d.valor), 0);
  const totalLancamentos = despesasAno.length;
  const ticketMedio = totalLancamentos > 0 ? totalAno / totalLancamentos : 0;
  const tecnicosAtivos = new Set(despesasAno.map((d) => d.tecnico_id)).size;

  // Por mês — usa todas as despesas aprovadas, sem filtro de período
  const byMes = useMemo(() => {
    const anoAtual = now.getFullYear();
    return MESES.map((m, i) => ({
      mes: m,
      valor: despesasAprovadas
        .filter((d) => {
          const dt = new Date(d.data_despesa + "T12:00:00");
          return dt.getMonth() === i && dt.getFullYear() === anoAtual;
        })
        .reduce((s, d) => s + Number(d.valor), 0),
    }));
  }, [despesasAprovadas]);

  // Por tipo
  const byTipo = tiposDespesa.map((t) => ({
    name: t.nome,
    valor: despesasAno
      .filter((d) => d.tipo_despesa_id === t.id)
      .reduce((s, d) => s + Number(d.valor), 0),
  })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);

  // Por técnico
  const byTecnico = useMemo(() => {
    const funcionarios = profiles.filter((u) => u.perfil === "funcionario");
    return funcionarios
      .map((u) => {
        const du = despesasAno.filter((d) => d.tecnico_id === u.id);
        return {
          nome: u.nome.split(" ").slice(0, 2).join(" "),
          total: du.reduce((s, d) => s + Number(d.valor), 0),
          qtd: du.length,
        };
      })
      .filter((u) => u.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [profiles, despesasAno]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            {isFuncionario ? "Suas despesas aprovadas no período" : "Análise de despesas aprovadas"}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Modo filtro */}
          <div className="flex gap-2">
            <button
              onClick={() => setModoFiltro("mes")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                modoFiltro === "mes"
                  ? "bg-primary text-white"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              Por mês
            </button>
            <button
              onClick={() => setModoFiltro("periodo")}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                modoFiltro === "periodo"
                  ? "bg-primary text-white"
                  : "bg-muted text-foreground hover:bg-muted/80"
              }`}
            >
              Por período
            </button>
          </div>

          {/* Filtros */}
          {modoFiltro === "mes" ? (
            <>
              <select
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
              >
                {MESES_FULL.map((m, i) => (
                  <option key={i} value={i}>{m}</option>
                ))}
              </select>
              <select
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
              >
                {anos.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </>
          ) : (
            <>
              <input
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <input
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
              />
            </>
          )}

          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition">
            <Download className="w-4 h-4" />
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(totalAno)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total do Período</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center mb-3">
            <FileText className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{totalLancamentos}</p>
          <p className="text-xs text-muted-foreground mt-1">Lançamentos</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatCurrency(ticketMedio)}</p>
          <p className="text-xs text-muted-foreground mt-1">Ticket Médio</p>
        </div>
        {!isFuncionario && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-4">
            <div className="w-9 h-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center mb-3">
              <Users className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-foreground">{tecnicosAtivos}</p>
            <p className="text-xs text-muted-foreground mt-1">Funcionários Ativos</p>
          </div>
        )}
      </div>

      {/* Gráfico evolução mensal */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">
          Evolução Mensal — {now.getFullYear()}
          <span className="ml-2 text-xs font-normal text-muted-foreground">(todos os meses, independente do filtro)</span>
        </h2>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={byMes}>
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={70}
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(v: number) => [formatCurrency(v), "Valor"]}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
            />
            <Line type="monotone" dataKey="valor" stroke="oklch(0.55 0.18 255)" strokeWidth={2} dot={{ fill: "oklch(0.55 0.18 255)", r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por tipo */}
        {byTipo.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Por Tipo de Despesa</h2>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byTipo} dataKey="valor" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {byTipo.map((_, i) => {
                    const colors = ["oklch(0.55 0.18 255)", "oklch(0.35 0.12 255)", "oklch(0.52 0.17 155)", "oklch(0.62 0.18 60)", "oklch(0.577 0.245 27.325)"];
                    return <Cell key={i} fill={colors[i % colors.length]} />;
                  })}
                </Pie>
                <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 10 }}>{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Técnicos — apenas para gestor/admin */}
        {!isFuncionario && byTecnico.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Top Funcionários</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byTecnico} layout="vertical" barSize={16}>
                <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nome" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={70} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Total"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="total" radius={[0, 4, 4, 0]} fill="oklch(0.55 0.18 255)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
