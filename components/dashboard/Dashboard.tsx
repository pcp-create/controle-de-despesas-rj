"use client";

import { useAppStore } from "@/lib/store";
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Send,
  AlertTriangle,
  TrendingUp,
  PlusCircle,
  ArrowRight,
} from "lucide-react";
import { formatCurrency, erpStatusColor, erpStatusLabel } from "@/lib/helpers";
import type { PageKey } from "@/components/layout/AppShell";
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
  onNavigate: (page: PageKey) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const { currentUser, despesas, users, tiposDespesa } = useAppStore();
  const perfil = currentUser?.perfil;

  // Filter despesas by profile
  const myDespesas =
    perfil === "tecnico"
      ? despesas.filter((d) => d.tecnicoId === currentUser?.id)
      : perfil === "gestor"
      ? despesas.filter((d) => {
          const tecnico = users.find((u) => u.id === d.tecnicoId);
          return tecnico?.gestorId === currentUser?.id;
        })
      : despesas;

  const now = new Date();
  const mesAtual = myDespesas.filter((d) => {
    const dt = new Date(d.dataDespesa);
    return dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
  });

  const total = mesAtual.reduce((s, d) => s + d.valor, 0);
  const aguardando = myDespesas.filter((d) => d.statusAprovacao === "AguardandoGestor").length;
  const aprovadas = myDespesas.filter((d) => d.statusAprovacao === "AprovadoGestor").length;
  const reprovadas = myDespesas.filter((d) => d.statusAprovacao === "Reprovado").length;
  const enviadas = myDespesas.filter((d) => d.statusERP !== "Rascunho" && d.statusERP !== "ErroEnvioERP").length;
  const erros = myDespesas.filter((d) => d.statusERP === "ErroEnvioERP" || d.statusERP === "ErroAtualizarERP").length;

  // Chart data: despesas por tipo
  const byTipo = tiposDespesa.map((t) => ({
    name: t.nome.split(" ")[0],
    valor: myDespesas
      .filter((d) => d.tipoDespesaId === t.id)
      .reduce((s, d) => s + d.valor, 0),
  })).filter((x) => x.valor > 0);

  // Despesas por usuário — apenas gestor e administrador
  const byUsuario = (perfil === "gestor" || perfil === "administrador")
    ? users
        .filter((u) => u.perfil === "tecnico")
        .filter((u) => perfil === "gestor" ? u.gestorId === currentUser?.id : true)
        .map((u) => {
          const despesasUsuario = myDespesas.filter((d) => d.tecnicoId === u.id);
          const totalUsuario = despesasUsuario.reduce((s, d) => s + d.valor, 0);
          const aguardandoUsuario = despesasUsuario.filter((d) => d.statusAprovacao === "AguardandoGestor").length;
          const aprovadasUsuario = despesasUsuario.filter((d) => d.statusAprovacao === "AprovadoGestor").length;
          const reprovadosUsuario = despesasUsuario.filter((d) => d.statusAprovacao === "Reprovado").length;
          return {
            id: u.id,
            nome: u.nome,
            nomeAbrev: u.nome.split(" ").slice(0, 2).join(" "),
            iniciais: u.nome.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(),
            total: totalUsuario,
            qtd: despesasUsuario.length,
            aguardando: aguardandoUsuario,
            aprovadas: aprovadasUsuario,
            reprovados: reprovadosUsuario,
          };
        })
        .filter((u) => u.qtd > 0)
        .sort((a, b) => b.total - a.total)
    : [];

  const totalGeral = byUsuario.reduce((s, u) => s + u.total, 0);

  const cards = [
    { label: "Total do Mês", value: formatCurrency(total), icon: <DollarSign className="w-5 h-5" />, color: "bg-primary/10 text-primary", big: true },
    { label: "Lançamentos do Mês", value: mesAtual.length, icon: <TrendingUp className="w-5 h-5" />, color: "bg-accent/10 text-accent" },
    { label: "Aguardando Gestor", value: aguardando, icon: <Clock className="w-5 h-5" />, color: "bg-warning/10 text-warning" },
    { label: "Aprovadas", value: aprovadas, icon: <CheckCircle className="w-5 h-5" />, color: "bg-success/10 text-success" },
    { label: "Reprovadas", value: reprovadas, icon: <XCircle className="w-5 h-5" />, color: "bg-destructive/10 text-destructive" },
    { label: "Enviadas ao ERP", value: enviadas, icon: <Send className="w-5 h-5" />, color: "bg-primary/10 text-primary" },
    { label: "Erros de Integração", value: erros, icon: <AlertTriangle className="w-5 h-5" />, color: "bg-destructive/10 text-destructive" },
  ];

  const recentDespesas = [...myDespesas]
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Olá, {currentUser?.nome.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral das despesas
          </p>
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

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`bg-white rounded-xl p-4 border border-border shadow-sm flex flex-col gap-2 ${card.big ? "col-span-2 sm:col-span-1" : ""}`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${card.color}`}>
              {card.icon}
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{card.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{card.label}</p>
            </div>
          </div>
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
                    <Cell
                      key={i}
                      fill={i % 2 === 0 ? "oklch(0.55 0.18 255)" : "oklch(0.35 0.12 255)"}
                    />
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
              <p className="text-sm text-muted-foreground">Nenhuma despesa lançada.</p>
            )}
            {recentDespesas.map((d) => {
              const tipo = tiposDespesa.find((t) => t.id === d.tipoDespesaId);
              const tecnico = users.find((u) => u.id === d.tecnicoId);
              return (
                <div key={d.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-foreground truncate">{tipo?.nome ?? "-"}</span>
                    <span className="text-xs text-muted-foreground">{d.cliente} · {d.numeroOS}</span>
                    {perfil !== "tecnico" && (
                      <span className="text-xs text-muted-foreground">{tecnico?.nome.split(" ")[0]}</span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(d.valor)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${erpStatusColor[d.statusERP]}`}>
                      {erpStatusLabel[d.statusERP]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Despesas por Usuário — gestor e administrador */}
      {byUsuario.length > 0 && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Despesas por Técnico</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ranking com barra de progresso */}
            <div className="flex flex-col gap-3">
              {byUsuario.map((u, i) => {
                const pct = totalGeral > 0 ? (u.total / totalGeral) * 100 : 0;
                const barColors = [
                  "bg-accent",
                  "bg-primary",
                  "bg-success",
                  "bg-warning",
                  "bg-destructive",
                ];
                return (
                  <div key={u.id} className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                      {u.iniciais}
                    </div>

                    {/* Info + barra */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground truncate">{u.nomeAbrev}</span>
                        <span className="text-sm font-semibold text-foreground ml-2 shrink-0">{formatCurrency(u.total)}</span>
                      </div>
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColors[i % barColors.length]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex gap-3 mt-1">
                        <span className="text-[10px] text-muted-foreground">{u.qtd} lançamento{u.qtd !== 1 ? "s" : ""}</span>
                        {u.aguardando > 0 && (
                          <span className="text-[10px] text-warning font-medium">{u.aguardando} aguardando</span>
                        )}
                        {u.aprovadas > 0 && (
                          <span className="text-[10px] text-success font-medium">{u.aprovadas} aprovada{u.aprovadas !== 1 ? "s" : ""}</span>
                        )}
                        {u.reprovados > 0 && (
                          <span className="text-[10px] text-destructive font-medium">{u.reprovados} reprovada{u.reprovados !== 1 ? "s" : ""}</span>
                        )}
                      </div>
                    </div>

                    {/* Percentual */}
                    <span className="text-xs text-muted-foreground shrink-0 w-9 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Gráfico de pizza */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={byUsuario}
                    dataKey="total"
                    nameKey="nomeAbrev"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    label={false}
                  >
                    {byUsuario.map((_, i) => {
                      const pieColors = [
                        "oklch(0.55 0.18 255)",
                        "oklch(0.35 0.12 255)",
                        "oklch(0.52 0.17 155)",
                        "oklch(0.62 0.18 60)",
                        "oklch(0.577 0.245 27.325)",
                      ];
                      return <Cell key={i} fill={pieColors[i % pieColors.length]} />;
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Total"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 11 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
