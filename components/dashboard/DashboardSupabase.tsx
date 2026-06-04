"use client";

import { useMemo, useState } from "react";
import type React from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles } from "@/lib/supabase/hooks";
import {
  DollarSign,
  ArrowRight,
  CalendarDays,
  PlusCircle,
  SendHorizonal,
  Clock,
  CircleCheck,
  CircleX,
  FileClock,
} from "lucide-react";
import { formatCurrency, getStatusGeral } from "@/lib/helpers";
import type { PageKey, NavigateFn } from "@/components/layout/AppShellSupabase";
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

interface Props {
  onNavigate: NavigateFn;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type ModoFiltro = "mes" | "periodo";

export default function DashboardSupabase({ onNavigate }: Props) {
  const { currentUser } = useAppStore();
  const { despesas, isLoading: loadingDespesas } = useDespesas(
    currentUser?.perfil === "tecnico" ? currentUser.id : undefined,
    currentUser?.perfil
  );
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  const perfil = currentUser?.perfil;

  const now = new Date();

  // Estado do filtro
  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFinal, setDataFinal] = useState(() => now.toISOString().slice(0, 10));

  const anos = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  // Filtra despesas por data
  const myDespesas = useMemo(() => {
    let filtered = despesas;
    
    // Se for gestor ou admin, mostrar todas. Se for técnico, mostrar só suas
    if (perfil === "tecnico") {
      filtered = despesas.filter((d) => d.tecnico_id === currentUser?.id);
    }
    
    return filtered.filter((d) => {
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
  }, [despesas, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, perfil, currentUser?.id]);

  const labelPeriodo = modoFiltro === "mes"
    ? `${MESES[mesSelecionado]} ${anoSelecionado}`
    : dataInicial && dataFinal
    ? `${dataInicial.split("-").reverse().join("/")} até ${dataFinal.split("-").reverse().join("/")}`
    : "Período personalizado";

  const total       = myDespesas.reduce((s, d) => s + Number(d.valor), 0);
  const naoEnviadas = myDespesas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "nao_enviado").length;
  const enviadas    = myDespesas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "enviado").length;
  const aguardando  = myDespesas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "aguardando_aprovacao").length;
  const aprovadas   = myDespesas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "aprovado").length;
  const reprovadas  = myDespesas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "reprovado").length;

  // Navega para a página correta com o filtro de status
  const handleCardClick = (statusKey: string) => {
    if (statusKey === "aguardando_aprovacao" && (perfil === "administrador" || perfil === "gestor")) {
      onNavigate("aprovacao");
      return;
    }
    if (perfil === "tecnico") {
      onNavigate("minhas-despesas", statusKey);
    } else {
      onNavigate("todas-despesas", statusKey);
    }
  };

  // Chart data por tipo
  const byTipo = tiposDespesa.map((t) => ({
    name: t.nome.split(" ")[0],
    valor: myDespesas
      .filter((d) => d.tipo_despesa_id === t.id)
      .reduce((s, d) => s + Number(d.valor), 0),
  })).filter((x) => x.valor > 0);

  // Despesas por usuário
  const byUsuario = useMemo(() => {
    if (perfil !== "gestor" && perfil !== "administrador") return [];
    const tecnicos = profiles.filter((u) => u.perfil === "tecnico");
    return tecnicos
      .map((u) => {
        const du = myDespesas.filter((d) => d.tecnico_id === u.id);
        return {
          id: u.id,
          nome: u.nome,
          nomeAbrev: u.nome.split(" ").slice(0, 2).join(" "),
          iniciais: u.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(),
          total: du.reduce((s, d) => s + Number(d.valor), 0),
          qtd: du.length,
          aguardando: du.filter((d) => d.status_aprovacao === "AguardandoGestor").length,
          aprovadas: du.filter((d) => d.status_aprovacao === "AprovadoGestor").length,
          reprovados: du.filter((d) => d.status_aprovacao === "Reprovado").length,
        };
      })
      .filter((u) => u.qtd > 0)
      .sort((a, b) => b.total - a.total);
  }, [profiles, perfil, myDespesas]);

  const totalGeral = byUsuario.reduce((s, u) => s + u.total, 0);

  const allCards: {
    key?: string;
    label: string;
    value: string | number;
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
    hint: string;
    onClick: () => void;
  }[] = [
    {
      label: "Total no período",
      value: formatCurrency(total),
      icon: <DollarSign className="w-5 h-5" />,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      hint: "Ver todas as despesas",
      onClick: () => perfil === "tecnico" ? onNavigate("minhas-despesas") : onNavigate("todas-despesas"),
    },
    {
      key: "nao_enviado",
      label: "Não enviadas",
      value: naoEnviadas,
      icon: <FileClock className="w-5 h-5" />,
      iconBg: "bg-slate-100",
      iconColor: "text-slate-500",
      hint: "Rascunhos ainda não enviados",
      onClick: () => handleCardClick("nao_enviado"),
    },
    {
      key: "enviado",
      label: "Enviadas",
      value: enviadas,
      icon: <SendHorizonal className="w-5 h-5" />,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      hint: "Enviadas, aguardando processamento",
      onClick: () => handleCardClick("enviado"),
    },
    {
      key: "aguardando_aprovacao",
      label: "Aguardando aprovação",
      value: aguardando,
      icon: <Clock className="w-5 h-5" />,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      hint: perfil === "administrador" || perfil === "gestor" ? "Ir para Aprovações" : "Aguardando análise do gestor",
      onClick: () => handleCardClick("aguardando_aprovacao"),
    },
    {
      key: "aprovado",
      label: "Aprovadas",
      value: aprovadas,
      icon: <CircleCheck className="w-5 h-5" />,
      iconBg: "bg-success/10",
      iconColor: "text-success",
      hint: "Despesas aprovadas",
      onClick: () => handleCardClick("aprovado"),
    },
    {
      key: "reprovado",
      label: "Reprovadas",
      value: reprovadas,
      icon: <CircleX className="w-5 h-5" />,
      iconBg: "bg-destructive/10",
      iconColor: "text-destructive",
      hint: "Despesas reprovadas",
      onClick: () => handleCardClick("reprovado"),
    },
  ];

  const recentDespesas = [...myDespesas]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  if (loadingDespesas) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header + filtro */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">
            Olá, {currentUser?.nome.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral das despesas &mdash; <span className="text-accent font-medium">{labelPeriodo}</span>
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
                {MESES.map((m, i) => (
                  <option key={m} value={i}>{m}</option>
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

        {perfil === "tecnico" && (
          <button
            onClick={() => onNavigate("nova-despesa")}
            className="hidden lg:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            <PlusCircle className="w-4 h-4" />
            Nova Despesa
          </button>
        )}
      </div>

      {/* 6 cards em grid único */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {allCards.map(({ label, value, icon, iconBg, iconColor, hint, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            title={hint}
            className="group bg-white rounded-xl border border-border shadow-sm p-4 flex flex-col text-left hover:shadow-md hover:border-primary/30 active:scale-[0.98] transition-all"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${iconBg} ${iconColor}`}>
              {icon}
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
            <ArrowRight className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 mt-2 transition-opacity self-end" />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        {byTipo.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-border shadow-sm p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Despesas por Tipo (R$)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byTipo} barSize={32}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={60}
                  tickFormatter={(v) => `R$${v}`} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v), "Valor"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {byTipo.map((_, i) => (
                    <Cell key={i} fill={i % 2 === 0 ? "oklch(0.55 0.18 255)" : "oklch(0.35 0.12 255)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Recent */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Últimos Lançamentos</h2>
            <button
              onClick={() => onNavigate(perfil === "gestor" ? "aprovacao" : "minhas-despesas")}
              className="text-xs text-accent flex items-center gap-1 hover:underline"
            >
              Ver todos <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {recentDespesas.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma despesa no período.</p>
            )}
            {recentDespesas.map((d) => {
              const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
              return (
                <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{tipo?.nome ?? "-"}</span>
                    <span className="text-xs text-muted-foreground">{d.cliente} · {d.numero_os}</span>
                  </div>
                  <span className="text-sm font-semibold text-foreground ml-2">{formatCurrency(Number(d.valor))}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Despesas por Técnico */}
      {(perfil === "gestor" || perfil === "administrador") && byUsuario.length > 0 && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">
            Despesas por Técnico
            <span className="ml-2 text-xs font-normal text-muted-foreground">— {labelPeriodo}</span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="flex flex-col gap-3">
              {byUsuario.map((u, i) => {
                const pct = totalGeral > 0 ? (u.total / totalGeral) * 100 : 0;
                const barColors = ["bg-accent", "bg-primary", "bg-success", "bg-warning", "bg-destructive"];
                return (
                  <div key={u.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {u.iniciais}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{u.nomeAbrev}</span>
                        <span className="text-sm font-semibold text-foreground ml-2 shrink-0">{formatCurrency(u.total)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColors[i % barColors.length]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">{u.qtd} lançamento{u.qtd !== 1 ? "s" : ""}</span>
                        {u.aguardando > 0 && <span className="text-[10px] text-warning font-medium">{u.aguardando} aguardando</span>}
                        {u.aprovadas > 0 && <span className="text-[10px] text-success font-medium">{u.aprovadas} aprovada{u.aprovadas !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 w-9 text-right">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byUsuario} dataKey="total" nameKey="nomeAbrev" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} label={false}>
                    {byUsuario.map((_, i) => {
                      const pieColors = ["oklch(0.55 0.18 255)", "oklch(0.35 0.12 255)", "oklch(0.52 0.17 155)", "oklch(0.62 0.18 60)", "oklch(0.577 0.245 27.325)"];
                      return <Cell key={i} fill={pieColors[i % pieColors.length]} />;
                    })}
                  </Pie>
                  <Tooltip formatter={(v: number) => [formatCurrency(v), "Total"]} contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
