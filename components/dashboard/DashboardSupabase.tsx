"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import type React from "react";
import { useFiltrosPersistidos } from "@/lib/supabase/use-filtros-persistidos";
import type { FiltrosDashboard } from "@/lib/supabase/use-filtros-persistidos";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles, useControleKm } from "@/lib/supabase/hooks";
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
  X,
  Fuel,
  AlertTriangle,
} from "lucide-react";
import { formatCurrency, getStatusGeral } from "@/lib/helpers";
import { gerarAlertasConsumo } from "@/lib/consumo-frota";
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
  LabelList,
} from "recharts";

interface Props {
  onNavigate: NavigateFn;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

type ModoFiltro = "mes" | "periodo";

// Paleta de cores para tipos
const TIPO_COLORS = [
  "oklch(0.45 0.22 255)",
  "oklch(0.52 0.20 255)",
  "oklch(0.58 0.18 255)",
  "oklch(0.64 0.16 255)",
  "oklch(0.70 0.14 255)",
  "oklch(0.76 0.12 255)",
];

const FUNC_COLORS = [
  "oklch(0.55 0.18 255)",
  "oklch(0.52 0.17 155)",
  "oklch(0.62 0.18 60)",
  "oklch(0.577 0.245 27.325)",
  "oklch(0.35 0.12 255)",
  "oklch(0.65 0.16 310)",
];

// Rótulo lateral para barras horizontais
function BarLabelRight(props: any) {
  const { x, y, width, height, value } = props;
  if (!value) return null;
  return (
    <text x={x + width + 6} y={y + height / 2} fill="var(--muted-foreground)" fontSize={10} dominantBaseline="middle">
      {formatCurrency(value)}
    </text>
  );
}

// Rótulo no topo para barras verticais
function BarLabelTop(props: any) {
  const { x, y, width, value } = props;
  if (!value) return null;
  return (
    <text x={x + width / 2} y={y - 5} textAnchor="middle" fill="var(--muted-foreground)" fontSize={9}>
      {formatCurrency(value)}
    </text>
  );
}

// Rótulo customizado para pizza
function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function DashboardSupabase({ onNavigate }: Props) {
  const { currentUser } = useAppStore();
  const { despesas, isLoading: loadingDespesas } = useDespesas(
    currentUser?.perfil === "funcionario" ? currentUser.id : undefined,
    currentUser?.perfil
  );
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  const { registros: apontamentosKm } = useControleKm();
  const perfil = currentUser?.perfil;

  const now = new Date();
  const { filtrosSalvos, carregado, salvar } = useFiltrosPersistidos<FiltrosDashboard>(currentUser?.id, "dashboard");
  const aplicado = useRef(false);

  const [modoFiltro, setModoFiltro] = useState<ModoFiltro>("mes");
  const [mesSelecionado, setMesSelecionado] = useState(now.getMonth());
  const [anoSelecionado, setAnoSelecionado] = useState(now.getFullYear());
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().slice(0, 10);
  });
  const [dataFinal, setDataFinal] = useState(() => now.toISOString().slice(0, 10));
  const [filtroTipo, setFiltroTipo] = useState<string | null>(null);
  const [filtroFuncionario, setFiltroFuncionario] = useState<string | null>(null);

  // Restaurar filtros salvos ao montar — roda uma única vez quando carregado=true
  useEffect(() => {
    if (!carregado || aplicado.current) return;
    aplicado.current = true;
    if (!filtrosSalvos) return; // sem preferências salvas: mantém padrões
    setModoFiltro(filtrosSalvos.modoFiltro);
    setMesSelecionado(filtrosSalvos.mesSelecionado);
    setAnoSelecionado(filtrosSalvos.anoSelecionado);
    setDataInicial(filtrosSalvos.dataInicial);
    setDataFinal(filtrosSalvos.dataFinal);
    setFiltroTipo(filtrosSalvos.filtroTipo);
    setFiltroFuncionario(filtrosSalvos.filtroFuncionario);
  }, [carregado, filtrosSalvos]);

  // Salvar ao alterar qualquer filtro
  useEffect(() => {
    if (!carregado || !aplicado.current) return;
    salvar({ modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroTipo, filtroFuncionario });
  }, [modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal, filtroTipo, filtroFuncionario]); // eslint-disable-line react-hooks/exhaustive-deps

  const anos = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];

  const myDespesas = useMemo(() => {
    let filtered = despesas;
    if (perfil === "funcionario") {
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

  // Despesas após filtros cruzados
  const despesasCruzadas = useMemo(() => {
    return myDespesas.filter((d) => {
      if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
      if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
      return true;
    });
  }, [myDespesas, filtroTipo, filtroFuncionario]);

  const labelPeriodo = modoFiltro === "mes"
    ? `${MESES[mesSelecionado]} ${anoSelecionado}`
    : dataInicial && dataFinal
    ? `${dataInicial.split("-").reverse().join("/")} até ${dataFinal.split("-").reverse().join("/")}`
    : "Período personalizado";

  const total       = despesasCruzadas.reduce((s, d) => s + Number(d.valor), 0);
  const naoEnviadas = despesasCruzadas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "nao_enviado").length;
  const enviadas    = despesasCruzadas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "enviado").length;
  const aguardando  = despesasCruzadas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "aguardando_aprovacao").length;
  const aprovadas   = despesasCruzadas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "aprovado").length;
  const reprovadas  = despesasCruzadas.filter((d) => getStatusGeral(d.status_erp ?? "", d.status_aprovacao) === "reprovado").length;

  const handleCardClick = (statusKey: string) => {
    if (statusKey === "aguardando_aprovacao" && (perfil === "administrador" || perfil === "gestor")) {
      onNavigate("aprovacao");
      return;
    }
    if (perfil === "funcionario") {
      onNavigate("minhas-despesas", statusKey);
    } else {
      onNavigate("todas-despesas", statusKey);
    }
  };

  // Por tipo — filtrado pelo funcionário ativo
  const byTipo = useMemo(() => {
    return tiposDespesa.map((t) => ({
      id: t.id,
      name: t.nome.split(" ")[0],
      fullName: t.nome,
      valor: myDespesas
        .filter((d) => {
          if (d.tipo_despesa_id !== t.id) return false;
          if (filtroFuncionario && d.tecnico_id !== filtroFuncionario) return false;
          return true;
        })
        .reduce((s, d) => s + Number(d.valor), 0),
    })).filter((x) => x.valor > 0).sort((a, b) => b.valor - a.valor);
  }, [tiposDespesa, myDespesas, filtroFuncionario]);

  // Por usuário — filtrado pelo tipo ativo
  const byUsuario = useMemo(() => {
    if (perfil !== "gestor" && perfil !== "administrador") return [];
    return profiles
      .map((u) => {
        const du = myDespesas.filter((d) => {
          if (d.tecnico_id !== u.id) return false;
          if (filtroTipo && d.tipo_despesa_id !== filtroTipo) return false;
          return true;
        });
        return {
          id: u.id,
          nome: u.nome,
          nomeAbrev: u.nome.split(" ").slice(0, 2).join(" "),
          iniciais: u.nome.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase(),
          total: du.reduce((s, d) => s + Number(d.valor), 0),
          qtd: du.length,
          aguardando: du.filter((d) => d.status_aprovacao === "AguardandoGestor").length,
          aprovadas: du.filter((d) => d.status_aprovacao === "AprovadoGestor").length,
        };
      })
      .filter((u) => u.qtd > 0)
      .sort((a, b) => b.total - a.total);
  }, [profiles, perfil, myDespesas, filtroTipo]);

  const totalGeral = byUsuario.reduce((s, u) => s + u.total, 0);
  const barColors = ["bg-accent", "bg-primary", "bg-success", "bg-warning", "bg-destructive"];

  const temFiltroAtivo = !!filtroTipo || !!filtroFuncionario;
  const filtroTipoNome = filtroTipo ? tiposDespesa.find((t) => t.id === filtroTipo)?.nome : null;
  const filtroFuncNome = filtroFuncionario ? profiles.find((p) => p.id === filtroFuncionario)?.nome : null;

  const recentDespesas = [...myDespesas]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  // Alertas de consumo de combustível (apenas gestor/administrador).
  // Usa a lista completa de despesas como base de comparação e filtra
  // os alertas cujo abastecimento está dentro do período selecionado.
  const alertasConsumo = useMemo(() => {
    if (perfil !== "gestor" && perfil !== "administrador") return [];
    return gerarAlertasConsumo(despesas, apontamentosKm).filter((a) => {
      const dataStr = (a.data || "").slice(0, 10);
      if (modoFiltro === "mes") {
        const dt = new Date(dataStr + "T00:00:00");
        return dt.getMonth() === mesSelecionado && dt.getFullYear() === anoSelecionado;
      }
      if (dataInicial && dataStr < dataInicial) return false;
      if (dataFinal && dataStr > dataFinal) return false;
      return true;
    });
  }, [despesas, perfil, modoFiltro, mesSelecionado, anoSelecionado, dataInicial, dataFinal]);

  if (loadingDespesas) {
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
          <h1 className="text-xl font-bold text-foreground">
            Olá, {currentUser?.nome.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Visão geral das despesas &mdash; <span className="text-accent font-medium">{labelPeriodo}</span>
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg self-start sm:self-end">
            <button onClick={() => setModoFiltro("mes")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${modoFiltro === "mes" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Por Mês
            </button>
            <button onClick={() => setModoFiltro("periodo")}
              className={`px-3 py-1 rounded-md text-xs font-medium transition ${modoFiltro === "periodo" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Período
            </button>
          </div>

          {modoFiltro === "mes" ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-lg text-xs text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />
              </div>
              <select value={mesSelecionado} onChange={(e) => setMesSelecionado(Number(e.target.value))}
                className="px-3 py-1.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-ring">
                {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
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

        {perfil === "funcionario" && (
          <button onClick={() => onNavigate("nova-despesa")}
            className="hidden lg:flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition">
            <PlusCircle className="w-4 h-4" />
            Nova Despesa
          </button>
        )}
      </div>

      {/* Banner filtros cruzados */}
      {temFiltroAtivo && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl text-sm flex-wrap">
          <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide mr-1">Filtrando por:</span>
          {filtroTipoNome && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-primary text-white rounded-full text-xs font-medium">
              {filtroTipoNome}
              <button onClick={() => setFiltroTipo(null)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
            </span>
          )}
          {filtroFuncNome && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 bg-accent text-white rounded-full text-xs font-medium">
              {filtroFuncNome}
              <button onClick={() => setFiltroFuncionario(null)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
            </span>
          )}
          <button onClick={() => { setFiltroTipo(null); setFiltroFuncionario(null); }}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">
            Limpar filtros
          </button>
        </div>
      )}

      {/* 6 cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total no período", value: formatCurrency(total), icon: <DollarSign className="w-5 h-5" />, iconBg: "bg-primary/10", iconColor: "text-primary", hint: "Ver todas", onClick: () => perfil === "funcionario" ? onNavigate("minhas-despesas") : onNavigate("todas-despesas") },
          { label: "Não enviadas", value: naoEnviadas, icon: <FileClock className="w-5 h-5" />, iconBg: "bg-slate-100", iconColor: "text-slate-500", hint: "Rascunhos", onClick: () => handleCardClick("nao_enviado") },
          { label: "Enviadas", value: enviadas, icon: <SendHorizonal className="w-5 h-5" />, iconBg: "bg-primary/10", iconColor: "text-primary", hint: "Enviadas", onClick: () => handleCardClick("enviado") },
          { label: "Aguardando aprovação", value: aguardando, icon: <Clock className="w-5 h-5" />, iconBg: "bg-warning/10", iconColor: "text-warning", hint: "Aguardando", onClick: () => handleCardClick("aguardando_aprovacao") },
          { label: "Aprovadas", value: aprovadas, icon: <CircleCheck className="w-5 h-5" />, iconBg: "bg-success/10", iconColor: "text-success", hint: "Aprovadas", onClick: () => handleCardClick("aprovado") },
          { label: "Reprovadas", value: reprovadas, icon: <CircleX className="w-5 h-5" />, iconBg: "bg-destructive/10", iconColor: "text-destructive", hint: "Reprovadas", onClick: () => handleCardClick("reprovado") },
        ].map(({ label, value, icon, iconBg, iconColor, hint, onClick }) => (
          <button key={label} onClick={onClick} title={hint}
            className="group bg-white rounded-xl border border-border shadow-sm p-4 flex flex-col text-left hover:shadow-md hover:border-primary/30 active:scale-[0.98] transition-all">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${iconBg} ${iconColor}`}>{icon}</div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
            <ArrowRight className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 mt-2 transition-opacity self-end" />
          </button>
        ))}
      </div>

      {/* Alertas de consumo de combustível */}
      {alertasConsumo.length > 0 && (
        <div className="bg-white rounded-xl border border-warning/30 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-warning/10 border-b border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <h2 className="text-sm font-semibold text-warning flex-1">
              Alertas de Consumo &mdash; Apontamentos Insuficientes
            </h2>
            <span className="text-xs font-semibold bg-warning/20 text-warning px-2 py-0.5 rounded-full">
              {alertasConsumo.length}
            </span>
          </div>
          <p className="px-5 pt-3 text-xs text-muted-foreground">
            Abastecimentos cujos apontamentos de KM ficaram abaixo de 80% da média esperada. Verifique os casos abaixo.
          </p>
          <div className="flex flex-col divide-y divide-border p-2">
            {alertasConsumo.map((a, i) => (
              <button
                key={`${a.frotaId}-${i}`}
                onClick={() => onNavigate("todas-despesas")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 transition text-left"
              >
                <div className="w-9 h-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center shrink-0">
                  <Fuel className="w-4 h-4" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium text-foreground truncate">
                    {a.placa}{a.modelo ? ` — ${a.modelo}` : ""}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {(a.data || "").slice(0, 10).split("-").reverse().join("/")} · {a.litros.toLocaleString("pt-BR")} L · apontado {a.kmApontado.toLocaleString("pt-BR")} km
                  </span>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-sm font-semibold text-warning">
                    {Math.round(a.percentual * 100)}%
                  </span>
                  <span className="text-xs text-muted-foreground">
                    esperado {Math.round(a.kmEsperado).toLocaleString("pt-BR")} km
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico de tipos */}
        {byTipo.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-border shadow-sm p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">Despesas por Tipo (R$)</h2>
              {filtroTipo && (
                <button onClick={() => setFiltroTipo(null)} className="text-xs text-accent hover:underline flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-3">Clique numa barra para filtrar</p>
            <ResponsiveContainer width="100%" height={Math.max(200, byTipo.length * 38)}>
              <BarChart data={byTipo} layout="vertical" barSize={20} margin={{ right: 90 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip
                  formatter={(v: number, _: any, { payload }: any) => [formatCurrency(v), payload?.fullName || "Total"]}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
                />
                <Bar dataKey="valor" radius={[0, 6, 6, 0]} cursor="pointer"
                  onClick={(data) => setFiltroTipo(filtroTipo === data.id ? null : data.id)}>
                  <LabelList dataKey="valor" content={<BarLabelRight />} />
                  {byTipo.map((entry, i) => (
                    <Cell key={entry.id}
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

        {/* Últimos lançamentos */}
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Últimos Lançamentos</h2>
            <button onClick={() => onNavigate(perfil === "gestor" ? "aprovacao" : "minhas-despesas")}
              className="text-xs text-accent flex items-center gap-1 hover:underline">
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

      {/* Despesas por Funcionário */}
      {(perfil === "gestor" || perfil === "administrador") && byUsuario.length > 0 && (
        <div className="bg-white rounded-xl border border-border shadow-sm p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-semibold text-foreground">
              Despesas por Funcionário
              <span className="ml-2 text-xs font-normal text-muted-foreground">— {labelPeriodo}</span>
            </h2>
            {filtroFuncionario && (
              <button onClick={() => setFiltroFuncionario(null)} className="text-xs text-accent hover:underline flex items-center gap-1">
                <X className="w-3 h-3" /> Limpar
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-4">Clique numa linha ou fatia para filtrar os demais gráficos</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Barras de progresso */}
            <div className="flex flex-col gap-3">
              {byUsuario.map((u, i) => {
                const pct = totalGeral > 0 ? (u.total / totalGeral) * 100 : 0;
                const isSelected = filtroFuncionario === u.id;
                return (
                  <button key={u.id} onClick={() => setFiltroFuncionario(isSelected ? null : u.id)}
                    className={`flex items-center gap-3 text-left rounded-lg p-2 -mx-2 transition ${isSelected ? "bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/40"} ${filtroFuncionario && !isSelected ? "opacity-40" : ""}`}>
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
                  </button>
                );
              })}
            </div>

            {/* Pizza com rótulos internos */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={byUsuario}
                    dataKey="total"
                    nameKey="nomeAbrev"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    labelLine={false}
                    label={<PieLabel />}
                    cursor="pointer"
                    onClick={(data) => setFiltroFuncionario(filtroFuncionario === data.id ? null : data.id)}
                  >
                    {byUsuario.map((entry, i) => (
                      <Cell
                        key={entry.id}
                        fill={FUNC_COLORS[i % FUNC_COLORS.length]}
                        opacity={filtroFuncionario && filtroFuncionario !== entry.id ? 0.3 : 1}
                        stroke={filtroFuncionario === entry.id ? "oklch(0.35 0.22 255)" : "transparent"}
                        strokeWidth={filtroFuncionario === entry.id ? 3 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => [formatCurrency(v), "Total"]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
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
