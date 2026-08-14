"use client";

import { useState, useEffect, useMemo } from "react";
import { mutate as swrMutate } from "swr";
import { useFrotas, useDespesas, useControleKm, useProfiles, type Frota, type ControleKm, type Despesa } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { calcularEstimativaVeiculo, persistirAlertasConsumo, isAbastecimento, type EstimativaVeiculoResult } from "@/lib/consumo-frota";
import { formatCurrency } from "@/lib/helpers";
import {
  Car,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ToggleLeft,
  ToggleRight,
  Clock,
  ShieldCheck,
  Gauge,
  CalendarDays,
  RefreshCw,
  Route,
  Fuel,
} from "lucide-react";

const TIPOS_VEICULO = ["Carro", "Moto", "Caminhão", "Van", "Pickup", "Utilitário", "Outro"];

const EMPTY_FORM = {
  placa: "",
  modelo: "",
  marca: "",
  ano: new Date().getFullYear().toString(),
  cor: "",
  tipo: "Carro",
  quilometragem: "0",
  km_media_litro: "",
  observacao: "",
  ativo: true,
};

export default function FrotasPageSupabase() {
  const { frotas, isLoading, addFrota, updateFrota, deleteFrota, mutate: mutateFrotas } = useFrotas();
  const currentUser = useAppStore((s) => s.currentUser);
  const { despesas } = useDespesas();
  const { registros: apontamentosKm } = useControleKm();
  const { profiles } = useProfiles();

  // Filtro de período — inativo por padrão (todo o histórico)
  const [filtroPeriodoAtivo, setFiltroPeriodoAtivo] = useState(false);
  const [periodoFrotaIni, setPeriodoFrotaIni] = useState("");
  const [periodoFrotaFim, setPeriodoFrotaFim] = useState("");
  // Valores de draft (editados pelo usuário antes de clicar em Aplicar)
  const [draftIni, setDraftIni] = useState("");
  const [draftFim, setDraftFim] = useState("");

  const ativarFiltroPeriodo = () => {
    setFiltroPeriodoAtivo(true);
  };

  const aplicarPeriodo = () => {
    setPeriodoFrotaIni(draftIni);
    setPeriodoFrotaFim(draftFim);
  };

  const limparPeriodo = () => {
    setFiltroPeriodoAtivo(false);
    setDraftIni("");
    setDraftFim("");
    setPeriodoFrotaIni("");
    setPeriodoFrotaFim("");
  };

  // Período efetivo: null quando filtro inativo ou datas incompletas
  const periodoEfetivo = filtroPeriodoAtivo && periodoFrotaIni && periodoFrotaFim
    ? { ini: periodoFrotaIni, fim: periodoFrotaFim }
    : null;

  // Estimativa KM vs Apontado por frota — usa a mesma fonte única do Relatório
  // Quando periodoEfetivo for null, periodoIni/periodoFim são strings vazias e
  // calcularEstimativaVeiculo considera todo o histórico (filtro de data retorna true para "")
  const estimativaPorFrota = useMemo(() => {
    const mapa = new Map<string, EstimativaVeiculoResult>();
    for (const frota of frotas) {
      const est = calcularEstimativaVeiculo({
        frotaId: frota.id,
        periodoIni: periodoEfetivo?.ini ?? "",
        periodoFim: periodoEfetivo?.fim ?? "",
        frotaKmMedia: (frota as any).km_media_litro ?? null,
        todasDespesas: despesas,
        todosRegistrosKm: apontamentosKm,
      });
      mapa.set(frota.id, est);
    }
    return mapa;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frotas, despesas, apontamentosKm, periodoEfetivo?.ini, periodoEfetivo?.fim]);

  const [search, setSearch] = useState("");
  const [showAtivos, setShowAtivos] = useState(true);
  const [modal, setModal] = useState<"add" | "edit" | null>(null);
  const [editing, setEditing] = useState<Frota | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [migrationSqlKm, setMigrationSqlKm] = useState<string | null>(null);

  // Modal de tratamento de alerta de consumo
  const [modalTratarFrota, setModalTratarFrota] = useState<Frota | null>(null);
  const [justificativaAlerta, setJustificativaAlerta] = useState("");
  const [tratandoAlerta, setTratandoAlerta] = useState(false);

  // Modais de histórico (somente leitura) — reaproveitam despesas/apontamentosKm
  // já carregados nesta página para os cálculos de estimativa/alerta.
  const [modalApontamentosFrota, setModalApontamentosFrota] = useState<Frota | null>(null);
  const [modalAbastecimentosFrota, setModalAbastecimentosFrota] = useState<Frota | null>(null);

  const apontamentosDaFrota = useMemo(() => {
    if (!modalApontamentosFrota) return [];
    return apontamentosKm
      .filter((a: ControleKm) => a.frota_id === modalApontamentosFrota.id)
      .sort((a, b) => new Date(b.data_inicio).getTime() - new Date(a.data_inicio).getTime());
  }, [apontamentosKm, modalApontamentosFrota]);

  const abastecimentosDaFrota = useMemo(() => {
    if (!modalAbastecimentosFrota) return [];
    return despesas
      .filter((d: Despesa) => d.frota_id === modalAbastecimentosFrota.id && isAbastecimento(d))
      .sort((a, b) => new Date(b.data_despesa).getTime() - new Date(a.data_despesa).getTime());
  }, [despesas, modalAbastecimentosFrota]);

  async function handleTratarAlerta() {
    if (!modalTratarFrota || !justificativaAlerta.trim()) return;
    setTratandoAlerta(true);
    try {
      // Busca o alerta ativo mais recente desta frota
      const res = await fetch(`/api/alertas-consumo?frota_id=${modalTratarFrota.id}&apenas_ativos=true`);
      const dados = await res.json();
      const alertas: { id: string }[] = dados?.data ?? [];

      if (alertas.length === 0) {
        setModalTratarFrota(null);
        setJustificativaAlerta("");
        return;
      }

      // Trata todos os alertas ativos desta frota
      await Promise.all(
        alertas.map((a) =>
          fetch("/api/alertas-consumo", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: a.id,
              resolvido_por: currentUser?.id ?? null,
              justificativa: justificativaAlerta.trim(),
            }),
          }),
        ),
      );

      await swrMutate("frotas");
      setModalTratarFrota(null);
      setJustificativaAlerta("");
      setFeedback({ type: "success", msg: "Alerta tratado com sucesso." });
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: "error", msg: "Erro ao tratar alerta. Tente novamente." });
    } finally {
      setTratandoAlerta(false);
    }
  }

  // Recálculo em massa do "Último cálculo" de todos os veículos.
  // Reutiliza EXATAMENTE a mesma função/regra chamada ao registrar um novo abastecimento
  // (persistirAlertasConsumo → gerarAlertasConsumo → calcularJanelaKmFrota) — nenhuma
  // fórmula nova é criada aqui. Sem frotaId, ela processa todos os veículos que possuem
  // abastecimento: recalcula e persiste ultimo_calculo_* + alerta_ativo para os que têm
  // faixa de KM válida, e limpa o alerta dos que não têm (< 2 abastecimentos com km_atual).
  const [recalculando, setRecalculando] = useState(false);

  async function handleRecalcularTudo() {
    setRecalculando(true);
    setFeedback(null);
    try {
      await persistirAlertasConsumo(despesas, apontamentosKm);
      await mutateFrotas();
      await swrMutate("controle_km");
      setFeedback({ type: "success", msg: "Recálculo concluído para todos os veículos." });
      setTimeout(() => setFeedback(null), 3000);
    } catch {
      setFeedback({ type: "error", msg: "Erro ao recalcular. Tente novamente." });
    } finally {
      setRecalculando(false);
    }
  }

  // Verifica se as colunas de métricas KM existem no banco
  useEffect(() => {
    fetch("/api/setup-km-metricas")
      .then((r) => r.json())
      .then((d) => { if (d.needsMigration) setMigrationSqlKm(d.sql); })
      .catch(() => {});
  }, []);

  const frostasFiltradas = frotas.filter((f) => {
    const matchAtivo = showAtivos ? f.ativo : !f.ativo;
    const term = search.toLowerCase();
    const matchSearch =
      !term ||
      f.placa.toLowerCase().includes(term) ||
      f.modelo.toLowerCase().includes(term) ||
      f.marca.toLowerCase().includes(term) ||
      (f.tipo?.toLowerCase().includes(term) ?? false) ||
      (f.cor?.toLowerCase().includes(term) ?? false) ||
      (f.ano?.toString().includes(term) ?? false) ||
      (f.quilometragem?.toString().includes(term) ?? false) ||
      (f.km_media_litro?.toString().includes(term) ?? false) ||
      (f.observacao?.toLowerCase().includes(term) ?? false);
    return matchAtivo && matchSearch;
  });

  const openAdd = () => {
    setForm({ ...EMPTY_FORM });
    setErrors({});
    setFeedback(null);
    setEditing(null);
    setModal("add");
  };

  const openEdit = (frota: Frota) => {
    setForm({
      placa: frota.placa,
      modelo: frota.modelo,
      marca: frota.marca,
      ano: frota.ano?.toString() || "",
      cor: frota.cor || "",
      tipo: frota.tipo || "Carro",
      quilometragem: frota.quilometragem.toString(),
      km_media_litro: frota.km_media_litro?.toString() || "",
      observacao: frota.observacao || "",
      ativo: frota.ativo,
    });
    setErrors({});
    setFeedback(null);
    setEditing(frota);
    setModal("edit");
  };

  const closeModal = () => {
    setModal(null);
    setEditing(null);
    setFeedback(null);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.placa.trim()) errs.placa = "Informe a placa";
    else if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/i.test(form.placa.replace(/[-\s]/g, "")))
      errs.placa = "Placa inválida (ex: ABC1234 ou ABC1D23)";
    if (!form.modelo.trim()) errs.modelo = "Informe o modelo";
    if (!form.marca.trim()) errs.marca = "Informe a marca";
    if (form.ano && (isNaN(Number(form.ano)) || Number(form.ano) < 1900 || Number(form.ano) > new Date().getFullYear() + 1))
      errs.ano = "Ano inválido";
    if (form.quilometragem && (isNaN(Number(form.quilometragem)) || Number(form.quilometragem) < 0))
      errs.quilometragem = "KM inválido";
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setLoading(true);
    setErrors({});

    const payload = {
      placa: form.placa.toUpperCase().replace(/[-\s]/g, ""),
      modelo: form.modelo.trim(),
      marca: form.marca.trim(),
      ano: form.ano ? Number(form.ano) : null,
      cor: form.cor.trim() || null,
      tipo: form.tipo || null,
      quilometragem: Number(form.quilometragem) || 0,
      km_media_litro: form.km_media_litro ? Number(form.km_media_litro) : null,
      observacao: form.observacao.trim() || null,
      ativo: form.ativo,
    };

    let result;
    if (modal === "edit" && editing) {
      result = await updateFrota(editing.id, payload);
    } else {
      result = await addFrota(payload);
    }

    if (result.error) {
      setFeedback({ type: "error", msg: result.error });
    } else {
      setFeedback({ type: "success", msg: modal === "edit" ? "Veículo atualizado!" : "Veículo cadastrado!" });
      setTimeout(() => closeModal(), 1200);
    }
    setLoading(false);
  };

  const handleToggleAtivo = async (frota: Frota) => {
    await updateFrota(frota.id, { ativo: !frota.ativo });
  };

  const handleDelete = async (id: string) => {
    await deleteFrota(id);
    setDeleteConfirm(null);
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Banner: migration pendente para métricas KM */}
      {migrationSqlKm && (
        <div className="flex flex-col gap-2 p-4 rounded-xl border border-warning/40 bg-warning/5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-warning">Atualização de banco necessária</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Execute o SQL abaixo no <strong>Supabase SQL Editor</strong> (Dashboard → SQL Editor) para habilitar as métricas de KM/L.
                Após executar, recarregue a página.
              </p>
            </div>
            <button onClick={() => setMigrationSqlKm(null)} className="text-muted-foreground hover:text-foreground transition shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono bg-muted px-3 py-2 rounded-lg text-foreground break-all select-all">
              {migrationSqlKm}
            </code>
            <button
              onClick={() => {
                try {
                  const el = document.createElement("textarea");
                  el.value = migrationSqlKm;
                  el.style.position = "fixed";
                  el.style.opacity = "0";
                  document.body.appendChild(el);
                  el.select();
                  document.execCommand("copy");
                  document.body.removeChild(el);
                } catch {}
              }}
              className="shrink-0 text-xs px-3 py-2 rounded-lg border border-input bg-background hover:bg-muted transition font-medium"
            >
              Copiar SQL
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Frotas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Gerencie os veículos da empresa</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {currentUser?.perfil === "administrador" && (
            <button
              onClick={handleRecalcularTudo}
              disabled={recalculando}
              title="Recalcula o último cálculo de consumo de todos os veículos usando a regra atual (faixa de KM entre os dois últimos abastecimentos)"
              className="flex items-center gap-2 px-4 py-2 bg-background border border-input text-foreground rounded-lg text-sm font-medium hover:bg-muted transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${recalculando ? "animate-spin" : ""}`} />
              {recalculando ? "Recalculando..." : "Recalcular Tudo"}
            </button>
          )}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 transition"
          >
            <Plus className="w-4 h-4" />
            Novo Veículo
          </button>
        </div>
      </div>

      {/* Barra de busca + período + toggle */}
      <div className="bg-white rounded-xl border border-border p-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por placa, modelo, marca..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Filtro de período — recolhido por padrão */}
        {!filtroPeriodoAtivo ? (
          /* Estado inativo: indicação + botão para ativar */
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>Período: <span className="font-medium text-foreground">Todo o histórico</span></span>
            </span>
            <button
              onClick={ativarFiltroPeriodo}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-input bg-background text-foreground hover:bg-muted transition"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Filtrar por período
            </button>
          </div>
        ) : (
          /* Estado ativo: campos de data + botões */
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
              Período:
            </span>
            <input
              type="date"
              value={draftIni}
              onChange={(e) => setDraftIni(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-xs text-muted-foreground">—</span>
            <input
              type="date"
              value={draftFim}
              onChange={(e) => setDraftFim(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={aplicarPeriodo}
              disabled={!draftIni || !draftFim}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              Aplicar período
            </button>
            <button
              onClick={limparPeriodo}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition"
            >
              Usar todo o histórico
            </button>
          </div>
        )}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <button
            onClick={() => setShowAtivos(true)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${showAtivos ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Ativos
          </button>
          <button
            onClick={() => setShowAtivos(false)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition ${!showAtivos ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Inativos
          </button>
        </div>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </div>
      ) : frostasFiltradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-border p-12 flex flex-col items-center gap-3 text-center">
          <Car className="w-12 h-12 text-muted-foreground/30" />
          <p className="font-medium text-foreground">Nenhum veículo encontrado</p>
          <p className="text-sm text-muted-foreground">
            {search ? "Tente outros termos de busca." : "Cadastre o primeiro veículo clicando em \"Novo Veículo\"."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
          {frostasFiltradas.map((frota) => {
            const est = estimativaPorFrota.get(frota.id);
            const hasActivity = est && (est.kmEstimado > 0 || est.kmApontado > 0 || est.litrosPeriodo > 0);
            const pct = est?.percentual ?? null;

            // Cor do bloco de estimativa
            const estBorderColor = !hasActivity || !est?.dadosSuficientes
              ? "border-border bg-muted/20"
              : pct === null ? "border-border bg-muted/20"
              : pct >= 80 && pct <= 115 ? "border-success/20 bg-success/5"
              : pct > 115 ? "border-warning/20 bg-warning/5"
              : "border-destructive/20 bg-destructive/5";

            const pctColor = pct === null ? "text-muted-foreground"
              : pct >= 80 && pct <= 115 ? "text-success"
              : pct > 115 ? "text-warning"
              : "text-destructive";

            // km/L real apontado = kmApontado / litrosPeriodo — mesma fórmula do relatório
            const kmLRealApontado = est && est.litrosPeriodo > 0 && est.kmApontado > 0
              ? Math.round((est.kmApontado / est.litrosPeriodo) * 100) / 100
              : null;

            const consumoMedioLabel = est && est.mediaUsada > 0
              ? `${est.mediaUsada.toFixed(1).replace(".", ",")} km/L`
              : "Não calculado";

            return (
              <div key={frota.id} className="bg-white rounded-xl border border-border p-4 flex flex-col gap-3 h-full">

                {/* 1. Cabeçalho */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                      <Car className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground tracking-wider text-sm">{frota.placa}</p>
                      <p className="text-xs text-muted-foreground">{frota.marca} {frota.modelo}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {frota.alerta_ativo && (
                      <span
                        className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-warning/10 text-warning"
                        title={frota.ultimo_calculo_percentual != null
                          ? `KM apontado: ${Math.round((frota.ultimo_calculo_percentual ?? 0) * 100)}% do esperado`
                          : "Apontamentos de KM insuficientes"}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Alerta
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${frota.ativo ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {frota.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>

                {/* 2. Informações principais — grade fixa 2×2, sempre presente */}
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Tipo</span>
                    <span className="font-medium text-foreground">{frota.tipo || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Ano</span>
                    <span className="font-medium text-foreground">{frota.ano || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">Cor</span>
                    <span className="font-medium text-foreground">{frota.cor || "—"}</span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">KM atual</span>
                    <span className="font-medium text-foreground">{frota.quilometragem.toLocaleString("pt-BR")} km</span>
                  </div>
                </div>

                {/* 3. Última atualização de KM — sempre presente (placeholder quando vazio) */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5 min-h-[30px]">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  {frota.km_atualizado_em ? (
                    <span>
                      KM atualizado em{" "}
                      <span className="font-medium text-foreground">
                        {new Date(frota.km_atualizado_em).toLocaleString("pt-BR", {
                          day: "2-digit", month: "2-digit", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </span>
                  ) : (
                    <span>KM ainda não atualizado via controle</span>
                  )}
                </div>

                {/* 4. Último cálculo de consumo — sempre presente (placeholder quando vazio) */}
                <div className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 min-h-[30px] ${
                  frota.ultimo_calculo_em
                    ? frota.alerta_ativo
                      ? "bg-warning/5 border border-warning/20 text-warning"
                      : "bg-success/5 border border-success/20 text-success"
                    : "bg-muted/40 border border-border text-muted-foreground"
                }`}>
                  <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${
                    frota.ultimo_calculo_em
                      ? frota.alerta_ativo ? "text-warning" : "text-success"
                      : "text-muted-foreground"
                  }`} />
                  {frota.ultimo_calculo_em ? (
                    <span>
                      Último cálculo:{" "}
                      <span className="font-medium">
                        {Math.round((frota.ultimo_calculo_percentual ?? 0) * 100)}% apontado
                      </span>
                      {" "}({(frota.ultimo_calculo_km_apontado ?? 0).toLocaleString("pt-BR")} / {(frota.ultimo_calculo_km_esperado ?? 0).toLocaleString("pt-BR")} km) em{" "}
                      <span className="font-medium">
                        {new Date(frota.ultimo_calculo_em).toLocaleDateString("pt-BR")}
                      </span>
                    </span>
                  ) : (
                    <span>Nenhum cálculo registrado</span>
                  )}
                </div>

                {/* 5. Bloco KM estimado vs apontado — sempre presente, mesma altura mínima */}
                <div className={`flex flex-col gap-2 rounded-lg px-3 py-2.5 text-xs border ${estBorderColor}`}>
                  {/* Título + percentual */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Gauge className="w-3.5 h-3.5 shrink-0" />
                      KM estimado vs apontado
                    </span>
                    {pct !== null ? (
                      <span className={`font-bold text-sm ${pctColor}`}>{pct}%</span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Barra — preservada mesmo sem dados */}
                  <div className="relative h-3 rounded overflow-hidden bg-muted/40">
                    {hasActivity && est && est.kmEstimado > 0 && (
                      <div
                        className={`absolute inset-y-0 left-0 rounded transition-all ${
                          pct !== null && pct < 80 ? "bg-destructive/70"
                          : pct !== null && pct > 115 ? "bg-warning/70"
                          : "bg-success/70"
                        }`}
                        style={{ width: `${Math.min(100, Math.round((est.kmApontado / est.kmEstimado) * 100))}%` }}
                      />
                    )}
                  </div>

                  {/* Grade fixa 2×4 — sempre os mesmos campos nas mesmas posições */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                    {/* Col 1 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Saldo inicial estimado</span>
                      <span className="font-medium text-foreground">
                        {hasActivity && est ? `${est.saldoInicial.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L` : "—"}
                      </span>
                    </div>
                    {/* Col 2 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Litros abastecidos</span>
                      <span className="font-medium text-foreground">
                        {hasActivity && est ? `${est.litrosPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L` : "—"}
                      </span>
                    </div>
                    {/* Col 1 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">KM estimado</span>
                      <span className="font-medium text-foreground">
                        {hasActivity && est ? `${est.kmEstimado.toLocaleString("pt-BR")} km` : "—"}
                      </span>
                    </div>
                    {/* Col 2 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">KM apontado</span>
                      <span className="font-medium text-foreground">
                        {hasActivity && est ? `${est.kmApontado.toLocaleString("pt-BR")} km` : "—"}
                      </span>
                    </div>
                    {/* Col 1 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Diferença</span>
                      <span className={`font-medium ${
                        !hasActivity || !est ? "text-foreground"
                        : est.diferenca >= 0 ? "text-success" : "text-destructive"
                      }`}>
                        {hasActivity && est
                          ? `${est.diferenca >= 0 ? "+" : ""}${est.diferenca.toLocaleString("pt-BR")} km`
                          : "—"}
                      </span>
                    </div>
                    {/* Col 2 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Saldo final estimado</span>
                      <span className="font-medium text-foreground">
                        {hasActivity && est ? `${est.saldoFinal.toLocaleString("pt-BR", { minimumFractionDigits: 1 })} L` : "—"}
                      </span>
                    </div>
                    {/* Col 1 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Consumo médio estimado</span>
                      <span className="font-medium text-foreground">{consumoMedioLabel}</span>
                    </div>
                    {/* Col 2 */}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground">Estimado km/L (Real apontado)</span>
                      <span className={`font-medium ${kmLRealApontado === null ? "text-muted-foreground italic" : "text-foreground"}`}>
                        {kmLRealApontado !== null
                          ? `${kmLRealApontado.toFixed(1).replace(".", ",")} km/L`
                          : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Mensagem de estado quando sem movimentação */}
                  {!hasActivity && (
                    <p className="text-[10px] text-muted-foreground italic">
                      {est?.dadosSuficientes === false
                        ? "Sem média de consumo disponível para calcular a estimativa."
                        : "Sem movimentação no período selecionado."}
                    </p>
                  )}
                </div>

                {/* 6. Nome / observação do veículo — sempre ocupa espaço (flex-1 empurra actions para baixo) */}
                <div className="flex-1 min-h-[1.5rem]">
                  {frota.observacao && (
                    <p className="text-xs text-muted-foreground">{frota.observacao}</p>
                  )}
                </div>

                {/* 7. Botões de ação — sempre no rodapé */}
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2 mt-auto">
                  {frota.alerta_ativo && (
                    <button
                      onClick={() => { setModalTratarFrota(frota); setJustificativaAlerta(""); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning/10 border border-warning/30 text-warning hover:bg-warning/20 transition"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Tratar Alerta
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(frota)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Editar
                  </button>
                  <button
                    onClick={() => setModalApontamentosFrota(frota)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                  >
                    <Route className="w-3.5 h-3.5" />
                    Apontamentos
                  </button>
                  <button
                    onClick={() => setModalAbastecimentosFrota(frota)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                  >
                    <Fuel className="w-3.5 h-3.5" />
                    Abastecimentos
                  </button>
                  <button
                    onClick={() => handleToggleAtivo(frota)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                  >
                    {frota.ativo
                      ? <ToggleRight className="w-3.5 h-3.5 text-success" />
                      : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground" />
                    }
                    {frota.ativo ? "Desativar" : "Ativar"}
                  </button>
                  {deleteConfirm === frota.id ? (
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        onClick={() => handleDelete(frota.id)}
                        className="px-2 py-1.5 rounded-lg text-xs font-medium bg-destructive text-white hover:bg-destructive/90 transition"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="px-2 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(frota.id)}
                      className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
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

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2.5">
                <Car className="w-5 h-5 text-accent" />
                <h2 className="font-bold text-foreground">
                  {modal === "edit" ? "Editar Veículo" : "Novo Veículo"}
                </h2>
              </div>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Feedback */}
            {feedback && (
              <div className={`mx-5 mt-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
                feedback.type === "success"
                  ? "bg-success/10 border border-success/20 text-success"
                  : "bg-destructive/10 border border-destructive/20 text-destructive"
              }`}>
                {feedback.type === "success"
                  ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                  : <AlertTriangle className="w-4 h-4 shrink-0" />
                }
                {feedback.msg}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Placa */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Placa *</label>
                  <input
                    type="text"
                    value={form.placa}
                    onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
                    placeholder="ABC1234"
                    maxLength={7}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring uppercase"
                  />
                  {errors.placa && <span className="text-xs text-destructive">{errors.placa}</span>}
                </div>

                {/* Tipo */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {TIPOS_VEICULO.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                {/* Marca */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Marca *</label>
                  <input
                    type="text"
                    value={form.marca}
                    onChange={(e) => setForm({ ...form, marca: e.target.value })}
                    placeholder="Ex: Volkswagen"
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.marca && <span className="text-xs text-destructive">{errors.marca}</span>}
                </div>

                {/* Modelo */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Modelo *</label>
                  <input
                    type="text"
                    value={form.modelo}
                    onChange={(e) => setForm({ ...form, modelo: e.target.value })}
                    placeholder="Ex: Gol"
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.modelo && <span className="text-xs text-destructive">{errors.modelo}</span>}
                </div>

                {/* Ano */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Ano</label>
                  <input
                    type="number"
                    value={form.ano}
                    onChange={(e) => setForm({ ...form, ano: e.target.value })}
                    placeholder="2024"
                    min={1900}
                    max={new Date().getFullYear() + 1}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.ano && <span className="text-xs text-destructive">{errors.ano}</span>}
                </div>

                {/* Cor */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Cor</label>
                  <input
                    type="text"
                    value={form.cor}
                    onChange={(e) => setForm({ ...form, cor: e.target.value })}
                    placeholder="Ex: Branco"
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* KM */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Quilometragem atual</label>
                  <input
                    type="number"
                    value={form.quilometragem}
                    onChange={(e) => setForm({ ...form, quilometragem: e.target.value })}
                    placeholder="0"
                    min={0}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  {errors.quilometragem && <span className="text-xs text-destructive">{errors.quilometragem}</span>}
                </div>

                {/* Média KM/L */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-foreground">Média KM/L</label>
                  <input
                    type="number"
                    value={form.km_media_litro}
                    onChange={(e) => setForm({ ...form, km_media_litro: e.target.value })}
                    placeholder="Ex: 12.5"
                    min={0}
                    step={0.1}
                    className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <span className="text-xs text-muted-foreground">Usado para calcular estimativa de KM a partir do combustível abastecido.</span>
                </div>
              </div>

              {/* Observação */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-foreground">Observação</label>
                <textarea
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                  placeholder="Informações adicionais sobre o veículo..."
                  rows={2}
                  className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              {/* Ativo */}
              {modal === "edit" && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                  <span className="text-sm font-medium text-foreground">Veículo ativo</span>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, ativo: !form.ativo })}
                    className={`w-11 h-6 rounded-full transition-colors relative ${form.ativo ? "bg-success" : "bg-muted-foreground/30"}`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${form.ativo ? "left-5" : "left-0.5"}`} />
                  </button>
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent/90 transition disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {modal === "edit" ? "Salvar alterações" : "Cadastrar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Tratar Alerta de Consumo */}
      {modalTratarFrota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background rounded-2xl shadow-xl border border-border w-full max-w-md flex flex-col gap-5 p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-warning" />
                  Tratar Alerta de Consumo
                </h2>
                <p className="text-sm text-muted-foreground">
                  {modalTratarFrota.placa} — {modalTratarFrota.modelo}
                </p>
              </div>
              <button
                onClick={() => { setModalTratarFrota(null); setJustificativaAlerta(""); }}
                className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Resumo do último cálculo */}
            {modalTratarFrota.ultimo_calculo_em && (
              <div className="bg-warning/5 border border-warning/20 rounded-lg px-4 py-3 flex flex-col gap-1 text-sm">
                <span className="font-medium text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Apontamentos insuficientes
                </span>
                <span className="text-muted-foreground">
                  {Math.round((modalTratarFrota.ultimo_calculo_percentual ?? 0) * 100)}% apontado —{" "}
                  {(modalTratarFrota.ultimo_calculo_km_apontado ?? 0).toLocaleString("pt-BR")} de{" "}
                  {(modalTratarFrota.ultimo_calculo_km_esperado ?? 0).toLocaleString("pt-BR")} km esperados
                </span>
                <span className="text-xs text-muted-foreground/70">
                  Calculado em {new Date(modalTratarFrota.ultimo_calculo_em).toLocaleDateString("pt-BR")}
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">
                Justificativa <span className="text-destructive">*</span>
              </label>
              <textarea
                value={justificativaAlerta}
                onChange={(e) => setJustificativaAlerta(e.target.value)}
                placeholder="Descreva o motivo do tratamento deste alerta..."
                rows={3}
                className="px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                autoFocus
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setModalTratarFrota(null); setJustificativaAlerta(""); }}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-input hover:bg-muted transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleTratarAlerta}
                disabled={!justificativaAlerta.trim() || tratandoAlerta}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-warning text-white hover:bg-warning/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tratandoAlerta
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <ShieldCheck className="w-4 h-4" />
                }
                Confirmar Tratamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Histórico de Apontamentos (somente leitura) ── */}
      {modalApontamentosFrota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background rounded-2xl shadow-xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Route className="w-4 h-4 text-primary" />
                  Histórico de Apontamentos
                </h2>
                <p className="text-sm text-muted-foreground">
                  {modalApontamentosFrota.placa} — {modalApontamentosFrota.modelo}
                </p>
              </div>
              <button
                onClick={() => setModalApontamentosFrota(null)}
                className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4 flex flex-col gap-3">
              {apontamentosDaFrota.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Nenhum apontamento registrado para este veículo.
                </p>
              ) : (
                apontamentosDaFrota.map((a: ControleKm) => {
                  const usuario = profiles.find((p) => p.id === a.usuario_id);
                  const percorrido = a.km_percorrido ?? (a.km_final != null ? a.km_final - a.km_inicial : null);
                  return (
                    <div key={a.id} className="border border-border rounded-lg p-3 flex flex-col gap-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{usuario?.nome ?? "—"}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          a.status === "finalizado"
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}>
                          {a.status === "finalizado" ? "Finalizado" : "Em andamento"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(a.data_inicio).toLocaleString("pt-BR")}
                        {a.data_fim && <> → {new Date(a.data_fim).toLocaleString("pt-BR")}</>}
                      </div>
                      <div className="text-xs text-foreground">
                        KM {a.km_inicial.toLocaleString("pt-BR")}
                        {a.km_final != null && <> → {a.km_final.toLocaleString("pt-BR")}</>}
                        {percorrido != null && (
                          <span className="text-muted-foreground"> ({percorrido.toLocaleString("pt-BR")} km percorridos)</span>
                        )}
                      </div>
                      {(a.destino || a.motivo) && (
                        <div className="text-xs text-muted-foreground">
                          {a.destino && <>Destino: {a.destino}</>}
                          {a.destino && a.motivo && " · "}
                          {a.motivo && <>Motivo: {a.motivo}</>}
                        </div>
                      )}
                      {a.observacao && (
                        <p className="text-xs text-muted-foreground italic">Obs: {a.observacao}</p>
                      )}
                      {a.ocorrencia && (
                        <p className="text-xs text-destructive italic">Ocorrência: {a.ocorrencia}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end p-6 pt-4 border-t border-border">
              <button
                onClick={() => setModalApontamentosFrota(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-input hover:bg-muted transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Histórico de Abastecimentos (somente leitura) ── */}
      {modalAbastecimentosFrota && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-background rounded-2xl shadow-xl border border-border w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b border-border">
              <div className="flex flex-col gap-1">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Fuel className="w-4 h-4 text-primary" />
                  Histórico de Abastecimentos
                </h2>
                <p className="text-sm text-muted-foreground">
                  {modalAbastecimentosFrota.placa} — {modalAbastecimentosFrota.modelo}
                </p>
              </div>
              <button
                onClick={() => setModalAbastecimentosFrota(null)}
                className="p-1.5 rounded-lg hover:bg-muted transition text-muted-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4 flex flex-col gap-3">
              {abastecimentosDaFrota.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-8">
                  Nenhum abastecimento registrado para este veículo.
                </p>
              ) : (
                abastecimentosDaFrota.map((d: Despesa) => {
                  const usuario = d.tecnico ?? profiles.find((p) => p.id === d.tecnico_id);
                  const statusLabel =
                    d.status_aprovacao === "AprovadoGestor" ? "Aprovado"
                    : d.status_aprovacao === "Reprovado" ? "Reprovado"
                    : "Aguardando";
                  const statusClass =
                    d.status_aprovacao === "AprovadoGestor" ? "bg-success/10 text-success"
                    : d.status_aprovacao === "Reprovado" ? "bg-destructive/10 text-destructive"
                    : "bg-warning/10 text-warning";
                  return (
                    <div key={d.id} className="border border-border rounded-lg p-3 flex flex-col gap-1.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{usuario?.nome ?? "—"}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(d.data_despesa).toLocaleDateString("pt-BR")}
                        {d.hora_despesa && <> às {d.hora_despesa.slice(0, 5)}</>}
                      </div>
                      <div className="text-xs text-foreground">
                        {d.litros_abastecidos?.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L
                        {d.valor_litro != null && <> · {formatCurrency(d.valor_litro)}/L</>}
                        {" · "}{formatCurrency(d.valor)}
                      </div>
                      {d.km_atual != null && (
                        <div className="text-xs text-muted-foreground">
                          KM apontado: {d.km_atual.toLocaleString("pt-BR")}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end p-6 pt-4 border-t border-border">
              <button
                onClick={() => setModalAbastecimentosFrota(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-input hover:bg-muted transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
