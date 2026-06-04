"use client";

import { useState, useMemo } from "react";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import { formatCurrency } from "@/lib/helpers";
import { DollarSign, TrendingUp, Search, Download, Calendar, Eye, FileCheck, AlertCircle } from "lucide-react";
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

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
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

  // Todas as despesas do período (para confronto com comprovante)
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

  // Métricas (apenas aprovadas)
  const despesasAprovadas = todasDespesas.filter((d) => d.status_aprovacao === "AprovadoGestor");
  const totalAprovado = despesasAprovadas.reduce((s, d) => s + Number(d.valor), 0);
  const qtdLancamentos = despesasAprovadas.length;

  // Por tipo (apenas aprovadas)
  const byTipo = tiposDespesa.map((t) => ({
    name: t.nome,
    valor: despesasAprovadas
      .filter((d) => d.tipo_despesa_id === t.id)
      .reduce((s, d) => s + Number(d.valor), 0),
  })).filter((x) => x.valor > 0);

  // Por técnico (apenas aprovadas)
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

  // Filtro de busca
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
          <h1 className="text-xl font-bold text-foreground">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Visão financeira das despesas aprovadas
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
        </div>
      </div>

      {/* Cards */}
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

      {/* Gráficos */}
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

      {/* Lista de despesas */}
      <div className="bg-white rounded-xl border border-border shadow-sm">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Todas as Despesas - Confronto com Comprovante</h2>
            <p className="text-xs text-muted-foreground mt-1">Total: {despesasFiltradas.length} despesas</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente, OS, tipo ou ERP ID..."
                className="pl-9 pr-4 py-1.5 rounded-lg border border-input bg-background text-sm w-64"
              />
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition">
              <Download className="w-4 h-4" />
              Exportar
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Data</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Técnico</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Cliente</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">OS</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Valor</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Status Aprova.</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Comprovante</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Status ERP</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">Data Envio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground whitespace-nowrap">ERP ID</th>
              </tr>
            </thead>
            <tbody>
              {despesasFiltradas.map((d) => {
                const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
                const tecnico = profiles.find((p) => p.id === d.tecnico_id);
                
                const statusAprovacaoBg = {
                  "AprovadoGestor": "bg-success/10 text-success",
                  "AguardandoGestor": "bg-warning/10 text-warning",
                  "Reprovado": "bg-destructive/10 text-destructive",
                }[d.status_aprovacao] || "bg-muted/10 text-muted-foreground";

                const statusErpBg = {
                  "Rascunho": "bg-slate-100 text-slate-700",
                  "Enviado": "bg-blue-100 text-blue-700",
                  "Processado": "bg-purple-100 text-purple-700",
                  "Concluído": "bg-success/10 text-success",
                  "Erro": "bg-destructive/10 text-destructive",
                }[d.status_erp] || "bg-muted/10 text-muted-foreground";

                return (
                  <tr key={d.id} className="border-t border-border hover:bg-muted/20 transition">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(d.data_despesa).toLocaleDateString("pt-BR")}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tecnico?.nome.split(" ")[0] || "-"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{tipo?.nome || "-"}</td>
                    <td className="px-3 py-2 max-w-32 truncate">{d.cliente}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{d.numero_os || "-"}</td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{formatCurrency(Number(d.valor))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusAprovacaoBg}`}>
                        {d.status_aprovacao === "AprovadoGestor" ? "Aprovado" : 
                         d.status_aprovacao === "AguardandoGestor" ? "Aguardando" : 
                         d.status_aprovacao === "Reprovado" ? "Reprovado" : "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {d.comprovante_url ? (
                        <a href={d.comprovante_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:text-primary/80">
                          <Eye className="w-3.5 h-3.5" />
                          Ver
                        </a>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusErpBg}`}>
                        {d.status_erp || "Rascunho"}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {d.data_envio ? new Date(d.data_envio).toLocaleDateString("pt-BR") : "-"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                      {d.erp_id ? (
                        <span className="text-success font-semibold">{d.erp_id}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {despesasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhuma despesa encontrada
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
