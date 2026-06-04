"use client";

import { useState, useMemo } from "react";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
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

export default function RelatoriosPageSupabase() {
  const { despesas, isLoading } = useDespesas();
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  
  const now = new Date();
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());

  // Despesas aprovadas do ano
  const despesasAno = useMemo(() => {
    return despesas.filter((d) => {
      const dt = new Date(d.data_despesa);
      return dt.getFullYear() === anoSelecionado && d.status_aprovacao === "AprovadoGestor";
    });
  }, [despesas, anoSelecionado]);

  // Métricas gerais
  const totalAno = despesasAno.reduce((s, d) => s + Number(d.valor), 0);
  const totalLancamentos = despesasAno.length;
  const ticketMedio = totalLancamentos > 0 ? totalAno / totalLancamentos : 0;
  const tecnicosAtivos = new Set(despesasAno.map((d) => d.tecnico_id)).size;

  // Por mês
  const byMes = MESES.map((m, i) => ({
    mes: m,
    valor: despesasAno
      .filter((d) => new Date(d.data_despesa).getMonth() === i)
      .reduce((s, d) => s + Number(d.valor), 0),
    qtd: despesasAno.filter((d) => new Date(d.data_despesa).getMonth() === i).length,
  }));

  // Por tipo
  const byTipo = tiposDespesa.map((t) => ({
    name: t.nome,
    valor: despesasAno
      .filter((d) => d.tipo_despesa_id === t.id)
      .reduce((s, d) => s + Number(d.valor), 0),
  })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);

  // Por técnico
  const byTecnico = useMemo(() => {
    const tecnicos = profiles.filter((u) => u.perfil === "tecnico");
    return tecnicos
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
          <p className="text-sm text-muted-foreground">Análise anual de despesas</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <select
            value={anoSelecionado}
            onChange={(e) => setAnoSelecionado(Number(e.target.value))}
            className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm"
          >
            {[now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()].map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
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
          <p className="text-xs text-muted-foreground mt-1">Total do Ano</p>
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
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{tecnicosAtivos}</p>
          <p className="text-xs text-muted-foreground mt-1">Técnicos Ativos</p>
        </div>
      </div>

      {/* Gráfico evolução mensal */}
      <div className="bg-white rounded-xl border border-border shadow-sm p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Evolução Mensal</h2>
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

        {/* Por técnico */}
        {byTecnico.length > 0 && (
          <div className="bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Top Técnicos</h2>
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
