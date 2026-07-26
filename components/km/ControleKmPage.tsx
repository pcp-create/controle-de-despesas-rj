"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useControleKm, useFrotas, useProfiles, type ControleKm } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import {
  Car,
  Play,
  Square,
  Search,
  Filter,
  ChevronDown,
  Gauge,
  Clock,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Trash2,
  Route,
  CalendarDays,
  User,
  Download,
} from "lucide-react";

function formatDuracao(minutos: number | null): string {
  if (!minutos) return "—";
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

function formatKm(val: number | null | undefined): string {
  if (val == null) return "—";
  return val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + " km";
}

function ElapsedTimer({ start }: { start: string }) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const calc = () => {
      const diff = Math.floor((Date.now() - new Date(start).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(
        h > 0
          ? `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`
          : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      );
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [start]);

  return <span className="font-mono text-sm text-warning font-semibold">{elapsed}</span>;
}

type ModalType = "iniciar" | "finalizar" | "delete" | null;

const EMPTY_FORM = {
  frota_id: "",
  km_inicial: "",
  destino: "",
  motivo: "",
  observacao: "",
};

const EMPTY_FIN = {
  km_final: "",
  observacao: "",
};

export default function ControleKmPage() {
  const { registros, isLoading, iniciarKm, finalizarKm, deleteControleKm } = useControleKm();
  const { frotas } = useFrotas();
  const { profiles } = useProfiles();
  const { currentUser } = useAppStore();

  // Controle de perfil
  const isGestorOuAdmin = currentUser?.perfil === "administrador" || currentUser?.perfil === "gestor";

  // Filtros
  const [search, setSearch] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "aberto" | "finalizado">("todos");
  const [filtroFrota, setFiltroFrota] = useState("");
  const [filtroFuncionario, setFiltroFuncionario] = useState("");

  // Modal
  const [modal, setModal] = useState<ModalType>(null);
  const [targetRegistro, setTargetRegistro] = useState<ControleKm | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [fin, setFin] = useState({ ...EMPTY_FIN });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [mostrarListaVeiculos, setMostrarListaVeiculos] = useState(false);
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const [setupSql, setSetupSql] = useState<string | null>(null);

  // Verifica se a tabela controle_km existe no banco
  useEffect(() => {
    fetch("/api/setup-controle-km")
      .then((r) => r.json())
      .then((d) => { if (d.needsMigration) setSetupSql(d.sql); })
      .catch(() => {});
  }, []);

  // Registro aberto do usuário logado
  const registroAberto = useMemo(
    () => registros.find((r) => r.usuario_id === currentUser?.id && r.status === "aberto"),
    [registros, currentUser]
  );

  // Frotas ativas disponíveis (sem viagem aberta)
  const frotasComViagem = useMemo(
    () => new Set(registros.filter((r) => r.status === "aberto").map((r) => r.frota_id)),
    [registros]
  );

  const frotasDisponiveis = frotas.filter((f) => f.ativo && !frotasComViagem.has(f.id));

  // Lista filtrada — funcionario/financeiro só veem os próprios registros
  const registrosFiltrados = useMemo(() => {
    let list = [...registros];

    // Restrição por perfil
    if (!isGestorOuAdmin && currentUser?.id) {
      list = list.filter((r) => r.usuario_id === currentUser.id);
    }

    if (filtroStatus !== "todos") list = list.filter((r) => r.status === filtroStatus);
    if (filtroFrota) list = list.filter((r) => r.frota_id === filtroFrota);
    if (isGestorOuAdmin && filtroFuncionario) {
      list = list.filter((r) => r.usuario_id === filtroFuncionario);
    }
    if (search) {
      const t = search.toLowerCase();
      list = list.filter((r) => {
        const frota = frotas.find((f) => f.id === r.frota_id);
        const usuario = profiles.find((p) => p.id === r.usuario_id);
        return (
          frota?.placa.toLowerCase().includes(t) ||
          frota?.modelo.toLowerCase().includes(t) ||
          usuario?.nome.toLowerCase().includes(t) ||
          r.destino?.toLowerCase().includes(t) ||
          r.motivo?.toLowerCase().includes(t)
        );
      });
    }
    return list;
  }, [registros, filtroStatus, filtroFrota, filtroFuncionario, search, frotas, profiles, isGestorOuAdmin, currentUser]);

  // Stats — baseadas na lista já filtrada por perfil (funcionário vê só os próprios)
  const registrosVisiveis = useMemo(() => {
    if (!isGestorOuAdmin && currentUser?.id) {
      return registros.filter((r) => r.usuario_id === currentUser.id);
    }
    return registros;
  }, [registros, isGestorOuAdmin, currentUser]);

  const totalKm = useMemo(
    () =>
      registrosVisiveis
        .filter((r) => r.status === "finalizado")
        .reduce((s, r) => {
          // km_percorrido pode não existir na tabela — calcular na aplicação
          const percorrido =
            r.km_percorrido != null
              ? r.km_percorrido
              : r.km_final != null
              ? r.km_final - r.km_inicial
              : 0;
          return s + percorrido;
        }, 0),
    [registrosVisiveis]
  );
  const abertosCount = registrosVisiveis.filter((r) => r.status === "aberto").length;
  const finalizadosCount = registrosVisiveis.filter((r) => r.status === "finalizado").length;

  // ─── Handlers ───────────────────────────────────────────

  const openIniciar = () => {
    if (registroAberto) {
      setFeedback({ type: "error", msg: "Você já possui uma viagem em aberto. Finalize antes de iniciar uma nova." });
      setTimeout(() => setFeedback(null), 4000);
      return;
    }
    // Pré-selecionar veículo padrão do funcionário (se disponível e não estiver em uso)
    const veiculoPadrao = currentUser && "frota_padrao_id" in currentUser
      ? (currentUser as any).frota_padrao_id as string | null
      : null;
    const padraodDisponivel = veiculoPadrao && !frotasComViagem.has(veiculoPadrao);
    setForm({ ...EMPTY_FORM, frota_id: padraodDisponivel ? veiculoPadrao! : "" });
    setErrors({});
    setFeedback(null);
    // Se tem veículo padrão disponível, começa com lista fechada; senão, abre direto
    setMostrarListaVeiculos(!padraodDisponivel);
    setBuscaVeiculo("");
    setModal("iniciar");
  };

  const openFinalizar = (r: ControleKm) => {
    setTargetRegistro(r);
    setFin({ ...EMPTY_FIN });
    setErrors({});
    setFeedback(null);
    setModal("finalizar");
  };

  const openDelete = (r: ControleKm) => {
    setTargetRegistro(r);
    setModal("delete");
  };

  const closeModal = () => {
    setModal(null);
    setTargetRegistro(null);
    setFeedback(null);
    setErrors({});
  };

  const validateIniciar = () => {
    const e: Record<string, string> = {};
    if (!form.frota_id) e.frota_id = "Selecione o veículo";
    if (!form.km_inicial.trim() || isNaN(Number(form.km_inicial)) || Number(form.km_inicial) < 0)
      e.km_inicial = "Informe o KM inicial válido";
    return e;
  };

  const validateFinalizar = () => {
    const e: Record<string, string> = {};
    if (!fin.km_final.trim() || isNaN(Number(fin.km_final)) || Number(fin.km_final) < 0)
      e.km_final = "Informe o KM final válido";
    if (targetRegistro && Number(fin.km_final) < targetRegistro.km_inicial)
      e.km_final = `KM final deve ser maior que o inicial (${targetRegistro.km_inicial})`;
    return e;
  };

  const handleIniciar = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateIniciar();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (!currentUser?.id) return;

    setLoading(true);
    const frota = frotas.find((f) => f.id === form.frota_id);
    const kmInicialNum = Number(form.km_inicial);

    const result = await iniciarKm({
      frota_id: form.frota_id,
      usuario_id: currentUser.id,
      km_inicial: kmInicialNum,
      destino: form.destino.trim() || undefined,
      motivo: form.motivo.trim() || undefined,
      observacao: form.observacao.trim() || undefined,
    });

    setLoading(false);
    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: `Viagem iniciada! Veículo: ${frota?.placa}` });
      setTimeout(() => closeModal(), 1200);
    }
  };

  const handleFinalizar = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validateFinalizar();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    if (!targetRegistro) return;

    setLoading(true);
    const result = await finalizarKm(
      targetRegistro.id,
      Number(fin.km_final),
      fin.observacao.trim() || undefined,
      targetRegistro.frota_id
    );
    setLoading(false);

    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: "Viagem finalizada com sucesso!" });
      setTimeout(() => closeModal(), 1200);
    }
  };

  const handleDelete = async () => {
    if (!targetRegistro) return;
    setLoading(true);
    await deleteControleKm(targetRegistro.id);
    setLoading(false);
    closeModal();
  };

  // ─── Exportar CSV ───────────────────────────────────────
  const exportarCSV = () => {
    const rows = registrosFiltrados.map((r) => {
      const frota = frotas.find((f) => f.id === r.frota_id);
      const usuario = profiles.find((p) => p.id === r.usuario_id);
      return [
        new Date(r.data_inicio).toLocaleString("pt-BR"),
        r.data_fim ? new Date(r.data_fim).toLocaleString("pt-BR") : "",
        usuario?.nome ?? "",
        frota ? `${frota.placa} - ${frota.marca} ${frota.modelo}` : "",
        r.km_inicial,
        r.km_final ?? "",
        r.km_percorrido ?? (r.km_final != null ? r.km_final - r.km_inicial : "") ,
        r.duracao_minutos != null ? formatDuracao(r.duracao_minutos) : "",
        r.destino ?? "",
        r.motivo ?? "",
        r.observacao ?? "",
        r.status === "aberto" ? "Em Andamento" : "Finalizado",
      ];
    });

    const header = ["Início", "Fim", "Funcionário", "Veículo", "KM Inicial", "KM Final", "KM Percorrido", "Duração", "Destino", "Motivo", "Observação", "Status"];
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `controle-km-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <>
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Controle de KM</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isGestorOuAdmin
              ? "Acompanhe e gerencie o uso dos veículos da frota"
              : "Registre e acompanhe suas viagens"}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {isGestorOuAdmin && (
            <button
              onClick={exportarCSV}
              className="flex items-center gap-2 px-3 py-2 border border-input bg-background text-sm font-medium rounded-lg hover:bg-muted transition"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          )}
          <button
            onClick={openIniciar}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            <Play className="w-4 h-4" />
            Iniciar Viagem
          </button>
        </div>
      </div>

      {/* Banner de setup — tabela controle_km ainda não existe */}
      {setupSql && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <p className="text-sm font-medium text-foreground">Configuração necessária: tabela de Controle de KM</p>
          </div>
          <p className="text-xs text-muted-foreground">
            A tabela <code className="font-mono bg-muted px-1 rounded">controle_km</code> ainda não existe no banco.
            Execute o SQL abaixo no <strong>Supabase SQL Editor</strong> (Dashboard → SQL Editor) e recarregue a página.
          </p>
          <pre className="bg-muted text-foreground text-xs px-3 py-2 rounded-md overflow-x-auto font-mono whitespace-pre-wrap break-all">
            {setupSql}
          </pre>
        </div>
      )}

      {/* Feedback global */}
      {feedback && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
          feedback.type === "success"
            ? "bg-success/10 border-success/20 text-success"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}>
          {feedback.type === "success"
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {feedback.msg}
        </div>
      )}

      {/* Viagem aberta do usuário */}
      {registroAberto && (() => {
        const frota = frotas.find((f) => f.id === registroAberto.frota_id);
        return (
          <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center shrink-0">
                <Car className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Viagem em andamento</p>
                <p className="text-xs text-muted-foreground">
                  {frota?.placa} — {frota?.marca} {frota?.modelo}
                  {registroAberto.destino && ` · ${registroAberto.destino}`}
                </p>
                <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                  <Gauge className="w-3.5 h-3.5" />
                  KM inicial: <strong>{formatKm(registroAberto.km_inicial)}</strong>
                  <span className="mx-1">·</span>
                  <Clock className="w-3.5 h-3.5" />
                  <ElapsedTimer start={registroAberto.data_inicio} />
                </div>
              </div>
            </div>
            <button
              onClick={() => openFinalizar(registroAberto)}
              className="flex items-center gap-2 px-4 py-2 bg-warning text-white rounded-lg text-sm font-medium hover:bg-warning/90 transition shrink-0"
            >
              <Square className="w-4 h-4" />
              Finalizar
            </button>
          </div>
        );
      })()}

      {/* Cards de métricas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
            <Route className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{formatKm(totalKm)}</p>
          <p className="text-xs text-muted-foreground mt-1">Total percorrido</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-warning/10 text-warning flex items-center justify-center mb-3">
            <Play className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{abertosCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Em andamento</p>
        </div>
        <div className="bg-white rounded-xl border border-border shadow-sm p-4">
          <div className="w-9 h-9 rounded-lg bg-success/10 text-success flex items-center justify-center mb-3">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-foreground">{finalizadosCount}</p>
          <p className="text-xs text-muted-foreground mt-1">Finalizadas</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-border p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-44">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar placa, motorista, destino..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as typeof filtroStatus)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            <option value="todos">Todos</option>
            <option value="aberto">Em andamento</option>
            <option value="finalizado">Finalizadas</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        <div className="relative">
          <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <select
            value={filtroFrota}
            onChange={(e) => setFiltroFrota(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            <option value="">Todos os veículos</option>
            {frotas.filter((f) => f.ativo).map((f) => (
              <option key={f.id} value={f.id}>{f.placa} — {f.marca} {f.modelo}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
        {isGestorOuAdmin && (
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <select
              value={filtroFuncionario}
              onChange={(e) => setFiltroFuncionario(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            >
              <option value="">Todos os funcionários</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : registrosFiltrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 flex flex-col items-center gap-3 text-center">
          <Route className="w-12 h-12 text-muted-foreground/30" />
          <p className="font-medium text-foreground">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground">Inicie uma viagem clicando em &quot;Iniciar Viagem&quot;.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {registrosFiltrados.map((r) => {
            const frota = frotas.find((f) => f.id === r.frota_id);
            const usuario = profiles.find((p) => p.id === r.usuario_id);
            const isAberto = r.status === "aberto";
            const isOwner = r.usuario_id === currentUser?.id;

            return (
              <div
                key={r.id}
                className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-start gap-4 ${
                  isAberto ? "border-warning/40" : "border-border"
                }`}
              >
                {/* Ícone + status */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                    isAberto ? "bg-warning/15" : "bg-success/10"
                  }`}>
                    <Car className={`w-5 h-5 ${isAberto ? "text-warning" : "text-success"}`} />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    {/* Linha 1: placa + badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-foreground tracking-wider text-sm">
                        {frota?.placa ?? "—"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {frota?.marca} {frota?.modelo}
                      </span>
                      <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                        isAberto
                          ? "bg-warning/15 text-warning"
                          : "bg-success/10 text-success"
                      }`}>
                        {isAberto ? "Em andamento" : "Finalizada"}
                      </span>
                    </div>

                    {/* Linha 2: motorista + data */}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        {usuario?.nome ?? "—"}
                      </span>
                      <span className="flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {new Date(r.data_inicio).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    {/* Linha 3: destino / motivo */}
                    {(r.destino || r.motivo) && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">
                          {[r.destino, r.motivo].filter(Boolean).join(" · ")}
                        </span>
                      </div>
                    )}

                    {/* Linha 4: KMs + duração */}
                    <div className="flex items-center gap-4 text-xs flex-wrap mt-0.5">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">KM Inicial</span>
                        <span className="font-semibold text-foreground">{formatKm(r.km_inicial)}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">KM Final</span>
                        <span className="font-semibold text-foreground">
                          {r.km_final != null ? formatKm(r.km_final) : (
                            isAberto ? <ElapsedTimer start={r.data_inicio} /> : "—"
                          )}
                        </span>
                      </div>
                      {(r.km_percorrido != null || r.km_final != null) && (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">Percorrido</span>
                          <span className="font-semibold text-primary">{formatKm(r.km_percorrido ?? (r.km_final != null ? r.km_final - r.km_inicial : null))}</span>
                        </div>
                      )}
                      {isAberto ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">Tempo</span>
                          <ElapsedTimer start={r.data_inicio} />
                        </div>
                      ) : r.duracao_minutos != null ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-muted-foreground">Duração</span>
                          <span className="font-semibold text-foreground">{formatDuracao(r.duracao_minutos)}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 shrink-0">
                  {isAberto && isOwner && (
                    <button
                      onClick={() => openFinalizar(r)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning text-white hover:bg-warning/90 transition"
                    >
                      <Square className="w-3.5 h-3.5" />
                      Finalizar
                    </button>
                  )}
                  {(currentUser?.perfil === "administrador" || currentUser?.perfil === "gestor") && (
                    <button
                      onClick={() => openDelete(r)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                      title="Excluir registro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    {/* ── Modal Iniciar Viagem ── */}
    {modal === "iniciar" && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2.5">
              <Play className="w-5 h-5 text-accent" />
              <h2 className="font-bold text-foreground">Iniciar Viagem</h2>
            </div>
            <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition">
              <X className="w-5 h-5" />
            </button>
          </div>

          {feedback && (
            <div className={`mx-5 mt-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
              feedback.type === "success"
                ? "bg-success/10 border-success/20 text-success"
                : "bg-destructive/10 border-destructive/20 text-destructive"
            }`}>
              {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
              {feedback.msg}
            </div>
          )}

          <form onSubmit={handleIniciar} className="p-5 flex flex-col gap-4">
            {/* Veículo */}
            {(() => {
              const padrao = (currentUser as any)?.frota_padrao_id as string | null;
              const veiculoPadrao = padrao ? frotasDisponiveis.find((f) => f.id === padrao) : null;
              const veiculoSelecionado = form.frota_id ? frotasDisponiveis.find((f) => f.id === form.frota_id) : null;

              return (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Veículo *</label>

                  {frotasDisponiveis.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">Nenhum veículo disponível no momento.</p>
                  ) : !mostrarListaVeiculos ? (
                    /* ── Modo card: mostra o veículo padrão (ou selecionado) ── */
                    <div className="flex flex-col gap-2">
                      {veiculoSelecionado ? (
                        <div className="flex items-center justify-between px-4 py-3 rounded-lg border-2 border-primary bg-primary/5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                              <Car className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {veiculoSelecionado.placa}
                                {veiculoSelecionado.id === padrao && (
                                  <span className="ml-2 text-xs font-normal px-1.5 py-0.5 rounded-full bg-primary/15 text-primary">Padrão</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {veiculoSelecionado.marca} {veiculoSelecionado.modelo}
                                {veiculoSelecionado.ano ? ` · ${veiculoSelecionado.ano}` : ""}
                                {" · "}{veiculoSelecionado.quilometragem.toLocaleString("pt-BR")} km
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setMostrarListaVeiculos(true)}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0 ml-2"
                          >
                            Usar outro
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMostrarListaVeiculos(true)}
                          className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed border-input hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground hover:text-primary"
                        >
                          <Car className="w-4 h-4" />
                          Selecionar veículo
                        </button>
                      )}
                    </div>
                  ) : (
                    /* ── Modo combobox suspenso ── */
                    <div className="flex flex-col gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          autoFocus
                          value={buscaVeiculo}
                          onChange={(e) => setBuscaVeiculo(e.target.value)}
                          placeholder="Buscar por placa, marca ou modelo..."
                          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        {/* Dropdown suspenso */}
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border border-border bg-white shadow-lg overflow-hidden">
                          <div className="max-h-56 overflow-y-auto">
                            {(() => {
                              const q = buscaVeiculo.toLowerCase();
                              const filtrados = frotasDisponiveis.filter((f) =>
                                !q ||
                                f.placa.toLowerCase().includes(q) ||
                                f.marca.toLowerCase().includes(q) ||
                                f.modelo.toLowerCase().includes(q) ||
                                (f.tipo ?? "").toLowerCase().includes(q) ||
                                (f.cor ?? "").toLowerCase().includes(q) ||
                                String(f.ano ?? "").includes(q) ||
                                (f.observacao ?? "").toLowerCase().includes(q)
                              );
                              if (filtrados.length === 0) return (
                                <p className="px-4 py-5 text-sm text-muted-foreground text-center">
                                  Nenhum veículo encontrado.
                                </p>
                              );
                              return filtrados.map((f) => {
                                const isPadrao = f.id === padrao;
                                return (
                                  <button
                                    key={f.id}
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault(); // evita blur no input antes do click
                                      setForm({ ...form, frota_id: f.id });
                                      setMostrarListaVeiculos(false);
                                      setBuscaVeiculo("");
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0"
                                  >
                                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                                      <Car className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                        {f.placa}
                                        {isPadrao && (
                                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-normal">Padrão</span>
                                        )}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {f.marca} {f.modelo}{f.ano ? ` · ${f.ano}` : ""} · {f.quilometragem.toLocaleString("pt-BR")} km
                                      </p>
                                    </div>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      </div>

                      {veiculoPadrao && (
                        <button
                          type="button"
                          onClick={() => {
                            setForm({ ...form, frota_id: padrao! });
                            setMostrarListaVeiculos(false);
                            setBuscaVeiculo("");
                          }}
                          className="text-xs text-primary hover:underline self-start"
                        >
                          Voltar ao veículo padrão ({veiculoPadrao.placa})
                        </button>
                      )}
                    </div>
                  )}

                  {errors.frota_id && <span className="text-xs text-destructive">{errors.frota_id}</span>}
                </div>
              );
            })()}

            {/* KM Inicial */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">KM Inicial *</label>
              <input
                type="number"
                value={form.km_inicial}
                onChange={(e) => setForm({ ...form, km_inicial: e.target.value })}
                placeholder="Ex: 45230"
                min={0}
                step={0.1}
                className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.km_inicial && <span className="text-xs text-destructive">{errors.km_inicial}</span>}
            </div>

            {/* Destino */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Destino</label>
              <input
                type="text"
                value={form.destino}
                onChange={(e) => setForm({ ...form, destino: e.target.value })}
                placeholder="Ex: Cliente ABC – São Paulo"
                className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Motivo */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Motivo</label>
              <input
                type="text"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="Ex: Visita técnica, entrega, manutenção..."
                className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Observação */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Observação</label>
              <textarea
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                placeholder="Informações adicionais..."
                rows={2}
                className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted transition">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading || frotasDisponiveis.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {loading ? "Iniciando..." : "Iniciar Viagem"}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    {/* ── Modal Finalizar Viagem ── */}
    {modal === "finalizar" && targetRegistro && (() => {
      const frota = frotas.find((f) => f.id === targetRegistro.frota_id);
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Square className="w-5 h-5 text-warning" />
                <h2 className="font-bold text-foreground">Finalizar Viagem</h2>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumo da viagem */}
            <div className="mx-5 mt-4 p-3 rounded-lg bg-muted/50 border border-border text-xs flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Veículo</span>
                <span className="font-semibold">{frota?.placa} — {frota?.marca} {frota?.modelo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">KM Inicial</span>
                <span className="font-semibold">{formatKm(targetRegistro.km_inicial)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Início</span>
                <span className="font-semibold">{new Date(targetRegistro.data_inicio).toLocaleString("pt-BR")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tempo decorrido</span>
                <ElapsedTimer start={targetRegistro.data_inicio} />
              </div>
            </div>

            {feedback && (
              <div className={`mx-5 mt-3 flex items-center gap-2 px-4 py-3 rounded-lg text-sm border ${
                feedback.type === "success"
                  ? "bg-success/10 border-success/20 text-success"
                  : "bg-destructive/10 border-destructive/20 text-destructive"
              }`}>
                {feedback.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                {feedback.msg}
              </div>
            )}

            <form onSubmit={handleFinalizar} className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">KM Final *</label>
                <input
                  type="number"
                  value={fin.km_final}
                  onChange={(e) => setFin({ ...fin, km_final: e.target.value })}
                  placeholder="Ex: 45480"
                  min={targetRegistro.km_inicial}
                  step={0.1}
                  autoFocus
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {errors.km_final && <span className="text-xs text-destructive">{errors.km_final}</span>}
                {fin.km_final && !errors.km_final && Number(fin.km_final) > targetRegistro.km_inicial && (
                  <span className="text-xs text-success font-medium">
                    Percorrido: {formatKm(Number(fin.km_final) - targetRegistro.km_inicial)}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Observação final</label>
                <textarea
                  value={fin.observacao}
                  onChange={(e) => setFin({ ...fin, observacao: e.target.value })}
                  placeholder="Alguma ocorrência durante a viagem?"
                  rows={2}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted transition">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-warning text-white text-sm font-medium hover:bg-warning/90 transition disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                  {loading ? "Finalizando..." : "Finalizar Viagem"}
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    })()}

    {/* ── Modal Excluir ── */}
    {modal === "delete" && targetRegistro && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-background rounded-2xl border border-border shadow-xl w-full max-w-sm p-6 flex flex-col gap-4" onMouseDown={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Excluir registro?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Esta ação não pode ser desfeita. O registro de KM será removido permanentemente.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={closeModal} className="px-4 py-2 rounded-lg border border-input bg-background text-sm font-medium hover:bg-muted transition">
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Excluir
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
