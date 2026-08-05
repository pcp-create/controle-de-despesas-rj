"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useFiltrosPersistidos } from "@/lib/supabase/use-filtros-persistidos";
import type { FiltrosAprovacao } from "@/lib/supabase/use-filtros-persistidos";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles, type Despesa } from "@/lib/supabase/hooks";
import { registrarAuditoria } from "@/lib/supabase/audit";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, getStatusGeral, statusGeralConfig, pagamentoTipoConfig } from "@/lib/helpers";
import {
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Eye,
  ChevronDown,
  MessageSquare,
  Layers,
  CreditCard,
  Undo2,
} from "lucide-react";

const statusAprovacaoConfig = {
  AguardandoGestor: { label: "Aguardando Aprovação", color: "bg-warning/10 text-warning" },
  AprovadoGestor:   { label: "Aprovado",             color: "bg-success/10 text-success" },
  Reprovado:        { label: "Reprovado",             color: "bg-destructive/10 text-destructive" },
};

// ─── Tipo de agrupamento ──────────────────────────────────────────────────────
interface GrupoDespesa {
  chave: string;
  despesaPrincipal: Despesa;
  parcelas: Despesa[];
  valorTotal: number;
  parcelado: boolean;
  numeroParcelas: number;
}

export default function AprovacaoPageSupabase() {
  const { currentUser, loadSupabaseData } = useAppStore();
  const { despesas, isLoading, mutate } = useDespesas(undefined, currentUser?.perfil);
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();
  
  const { filtrosSalvos: filtrosApr, carregado: carregadoApr, salvar: salvarApr } = useFiltrosPersistidos<FiltrosAprovacao>(currentUser?.id, "aprovacao");
  const aplicadoApr = useRef(false);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("AguardandoGestor");
  const [filterFuncionario, setFilterFuncionario] = useState<string>("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Restaurar filtros salvos ao montar
  // Restaurar filtros salvos ao montar — roda uma única vez quando carregado=true
  useEffect(() => {
    if (!carregadoApr || aplicadoApr.current) return;
    aplicadoApr.current = true;
    if (!filtrosApr) return;
    setFilterStatus(filtrosApr.filterStatus);
    setFilterFuncionario(filtrosApr.filterFuncionario);
  }, [carregadoApr, filtrosApr]);

  // Salvar ao alterar filtros
  useEffect(() => {
    if (!carregadoApr || !aplicadoApr.current) return;
    salvarApr({ filterStatus, filterFuncionario });
  }, [filterStatus, filterFuncionario]); // eslint-disable-line react-hooks/exhaustive-deps
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [reprovandoChave, setReprovandoChave] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState("");
  const [revogandoChave, setRevogandoChave] = useState<string | null>(null);

  // ─── Agrupa despesas parceladas pelo grupo_parcela_id ────────────────────────
  const grupos = useMemo<GrupoDespesa[]>(() => {
    if (!currentUser) return [];

    const visiveis = despesas.filter((d) => {
      if (!d.status_erp || d.status_erp === "Rascunho") return false;
      // Gestor, administrador e financeiro visualizam todas as despesas enviadas
      if (
        currentUser.perfil === "administrador" ||
        currentUser.perfil === "gestor" ||
        currentUser.perfil === "financeiro"
      ) return true;
      // Funcionário vê apenas as próprias
      return d.tecnico_id === currentUser.id;
    });

    const mapa = new Map<string, Despesa[]>();
    for (const d of visiveis) {
      const chave = d.grupo_parcela_id ?? d.id;
      const lista = mapa.get(chave) ?? [];
      lista.push(d);
      mapa.set(chave, lista);
    }

    const resultado: GrupoDespesa[] = [];
    for (const [chave, lista] of mapa.entries()) {
      const ordenadas = lista.sort((a, b) => a.parcela_atual - b.parcela_atual);
      const principal = ordenadas[0];
      const valorTotal = ordenadas.reduce((acc, p) => acc + Number(p.valor), 0);
      const parcelado = principal.parcelado === true && lista.length > 1;

      resultado.push({
        chave,
        despesaPrincipal: principal,
        parcelas: ordenadas,
        valorTotal,
        parcelado,
        numeroParcelas: parcelado ? lista.length : 1,
      });
    }

    return resultado
      .filter((g) => {
        const d = g.despesaPrincipal;
        if (filterStatus !== "todos" && d.status_aprovacao !== filterStatus) return false;
        if (filterFuncionario !== "todos" && d.tecnico_id !== filterFuncionario) return false;
        if (search) {
          const term = search.toLowerCase();
          const tipo = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
          const tecnico = profiles.find((p) => p.id === d.tecnico_id);
          return (
            d.cliente.toLowerCase().includes(term) ||
            d.numero_os.toLowerCase().includes(term) ||
            (tipo?.nome || "").toLowerCase().includes(term) ||
            (tecnico?.nome || "").toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort((a, b) =>
        new Date(b.despesaPrincipal.created_at).getTime() -
        new Date(a.despesaPrincipal.created_at).getTime()
      );
  }, [despesas, currentUser, profiles, search, filterStatus, filterFuncionario, tiposDespesa]);

  // Funcionários que têm despesas visíveis (para o select de filtro)
  const isGestorOuAdmin = currentUser?.perfil === "gestor" || currentUser?.perfil === "administrador" || currentUser?.perfil === "financeiro";
  const funcionariosComDespesas = useMemo(() => {
    if (!isGestorOuAdmin) return [];
    const ids = new Set(despesas.filter((d) => d.status_erp && d.status_erp !== "Rascunho").map((d) => d.tecnico_id));
    return profiles.filter((p) => ids.has(p.id)).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [despesas, profiles, isGestorOuAdmin]);

  const pendentes = grupos.filter((g) => g.despesaPrincipal.status_aprovacao === "AguardandoGestor").length;

  // Aprova todas as parcelas do grupo
  const handleAprovar = async (grupo: GrupoDespesa) => {
    const supabase = createClient();
    if (!supabase) { setFeedback({ type: "error", msg: "Supabase não disponível" }); return; }

    for (const parcela of grupo.parcelas) {
      const { error } = await supabase
        .from("despesas")
        .update({
          status_aprovacao: "AprovadoGestor",
          status_erp: "AprovadoGestorERPAtualizado",
          gestor_aprovador_id: currentUser?.id,
          data_aprovacao: new Date().toISOString(),
        })
        .eq("id", parcela.id);

      if (error) { setFeedback({ type: "error", msg: error.message }); return; }
    }

    await registrarAuditoria({
      acao: "APPROVE",
      entidade: "despesa",
      entidadeId: grupo.chave,
      usuarioId: currentUser?.id || "sistema",
      detalhes: grupo.parcelado
        ? `Grupo de ${grupo.numeroParcelas} parcelas aprovado pelo gestor`
        : "Despesa aprovada pelo gestor",
    });

    const msg = grupo.parcelado ? `${grupo.numeroParcelas} parcelas aprovadas!` : "Despesa aprovada!";
    setFeedback({ type: "success", msg });
    await mutate();
    setTimeout(() => setFeedback(null), 3000);
  };

  // Reprova todas as parcelas do grupo
  const handleReprovar = async (grupo: GrupoDespesa) => {
    if (!justificativa.trim()) {
      setFeedback({ type: "error", msg: "Informe a justificativa da reprovação" });
      return;
    }

    const supabase = createClient();
    if (!supabase) { setFeedback({ type: "error", msg: "Supabase não disponível" }); return; }

    for (const parcela of grupo.parcelas) {
      const { error } = await supabase
        .from("despesas")
        .update({
          // Retorna ao criador para correção mantendo status "Reprovado" visível
          status_aprovacao: "Reprovado",
          status_erp: "Rascunho",
          gestor_aprovador_id: currentUser?.id ?? null,
          data_aprovacao: new Date().toISOString(),
          justificativa_reprovacao: justificativa,
        })
        .eq("id", parcela.id);

      if (error) { setFeedback({ type: "error", msg: error.message }); return; }
    }

    await registrarAuditoria({
      acao: "REJECT",
      entidade: "despesa",
      entidadeId: grupo.chave,
      usuarioId: currentUser?.id || "sistema",
      detalhes: grupo.parcelado
        ? `Grupo de ${grupo.numeroParcelas} parcelas reprovado e retornado ao criador: ${justificativa}`
        : `Despesa reprovada e retornada ao criador: ${justificativa}`,
    });

    const msg = grupo.parcelado
      ? `${grupo.numeroParcelas} parcelas reprovadas e retornadas ao solicitante`
      : "Despesa reprovada e retornada ao solicitante";
    setFeedback({ type: "success", msg });
    setReprovandoChave(null);
    setJustificativa("");
    await mutate();
    setTimeout(() => setFeedback(null), 3000);
  };

  // Revoga a despesa de volta ao criador para edição
  const handleRevogar = async (grupo: GrupoDespesa) => {
    const supabase = createClient();
    if (!supabase) { setFeedback({ type: "error", msg: "Supabase não disponível" }); return; }

    for (const parcela of grupo.parcelas) {
      const { error } = await supabase
        .from("despesas")
        .update({
          status_aprovacao: "AguardandoGestor",
          status_erp: "Rascunho",
          gestor_aprovador_id: null,
          data_aprovacao: null,
          justificativa_reprovacao: null,
        })
        .eq("id", parcela.id);

      if (error) { setFeedback({ type: "error", msg: error.message }); return; }
    }

    await registrarAuditoria({
      acao: "REVOKE",
      entidade: "despesa",
      entidadeId: grupo.chave,
      usuarioId: currentUser?.id || "sistema",
      detalhes: grupo.parcelado
        ? `Grupo de ${grupo.numeroParcelas} parcelas revogado ao criador`
        : "Despesa revogada ao criador para edição",
    });

    setRevogandoChave(null);
    const msg = grupo.parcelado ? `${grupo.numeroParcelas} parcelas revogadas ao criador` : "Despesa revogada ao criador";
    setFeedback({ type: "success", msg });
    await mutate();
    setTimeout(() => setFeedback(null), 3000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Aprovação de Despesas</h1>
          <p className="text-sm text-muted-foreground">
            {pendentes} despesa(s) aguardando aprovação
          </p>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`rounded-lg px-4 py-3 text-sm ${
          feedback.type === "success"
            ? "bg-success/10 border border-success/20 text-success"
            : "bg-destructive/10 border border-destructive/20 text-destructive"
        }`}>
          {feedback.msg}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por funcionário, cliente, OS..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Filtro por funcionário — visível apenas para gestor/admin */}
        {isGestorOuAdmin && funcionariosComDespesas.length > 0 && (
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={filterFuncionario}
              onChange={(e) => setFilterFuncionario(e.target.value)}
              className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none min-w-[180px]"
            >
              <option value="todos">Todos os Funcionários</option>
              {funcionariosComDespesas.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        )}

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            <option value="todos">Todos os Status</option>
            <option value="AguardandoGestor">Aguardando Aprovação</option>
            <option value="AprovadoGestor">Aprovados</option>
            <option value="Reprovado">Reprovados</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      {grupos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma despesa para aprovar</h3>
          <p className="text-sm text-muted-foreground mt-1">As despesas pendentes aparecerão aqui</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((grupo) => {
            const d = grupo.despesaPrincipal;
            const tipo        = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
            const funcionario = profiles.find((p) => p.id === d.tecnico_id);
            const gestor      = profiles.find((p) => p.id === d.gestor_aprovador_id);
            const sg          = getStatusGeral(d.status_erp, d.status_aprovacao);
            const status      = statusGeralConfig[sg];
            const isExpanded  = expandedId === grupo.chave;
            const isReprovando = reprovandoChave === grupo.chave;

            return (
              <div key={grupo.chave} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                {/* Cabeçalho do card */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : grupo.chave)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  {/* Avatar técnico */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                    {funcionario?.nome?.[0] ?? "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Linha 1: tipo + badge parcelas + valor total */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-foreground truncate">{tipo?.nome || "Despesa"}</span>
                        {grupo.parcelado && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary shrink-0">
                            <Layers className="w-3 h-3" />
                            {grupo.numeroParcelas}x
                          </span>
                        )}
                      </div>
                      <span className="text-base font-bold text-foreground shrink-0">
                        {formatCurrency(grupo.valorTotal)}
                      </span>
                    </div>
                    {/* Linha 2: técnico • cliente • OS • data • valor/parcela */}
                    <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground/70">{funcionario?.nome ?? "-"}</span>
                      {d.cliente && <><span>•</span><span>{d.cliente}</span></>}
                      {d.numero_os && <><span>•</span><span>{d.numero_os}</span></>}
                      <span>•</span>
                      <span>{formatDate(d.data_despesa)}</span>
                      {grupo.parcelado && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-medium">
                            {formatCurrency(grupo.valorTotal / grupo.numeroParcelas)}/parcela
                          </span>
                        </>
                      )}
                    </div>
                    {/* Linha 3: status + forma de pagamento */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${status.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                        {status.label}
                      </span>
                      {(() => {
                        const pc = pagamentoTipoConfig[d.pagamento_tipo ?? "cartao"];
                        return pc ? (
                          <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full ${pc.color}`}>
                            {pc.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
                </button>

                {/* Detalhes expandidos */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-border pt-4 space-y-4">

                    {/* Parcelas detalhadas */}
                    {grupo.parcelado && (
                      <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                          <CreditCard className="w-3.5 h-3.5" />
                          Parcelas
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {grupo.parcelas.map((p) => (
                            <div key={p.id} className="flex flex-col gap-0.5 p-2.5 rounded-lg bg-muted/40 border border-border text-xs">
                              <span className="text-muted-foreground font-medium">
                                {p.parcela_atual}/{grupo.numeroParcelas}
                              </span>
                              <span className="font-semibold text-foreground">{formatCurrency(Number(p.valor))}</span>
                              {p.data_vencimento && (
                                <span className="text-primary">
                                  Vence: {new Date(p.data_vencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Grid de informações */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Criado em</p>
                        <p className="text-foreground">{new Date(d.created_at).toLocaleString("pt-BR")}</p>
                      </div>
                      {d.data_envio && (
                        <div>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Enviado em</p>
                          <p className="text-foreground">{new Date(d.data_envio).toLocaleString("pt-BR")}</p>
                        </div>
                      )}
                      {d.data_checkin && d.data_checkout && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Check-in</p>
                            <p className="text-foreground">{formatDate(d.data_checkin ?? "")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Check-out</p>
                            <p className="text-foreground">{formatDate(d.data_checkout ?? "")}</p>
                          </div>
                          {d.numero_diarias && (
                            <div className="col-span-2 flex items-center justify-between p-2.5 rounded-lg bg-primary/5 border border-primary/15 text-sm">
                              <span className="text-muted-foreground"><strong className="text-foreground">{d.numero_diarias}</strong> diária{d.numero_diarias > 1 ? "s" : ""}</span>
                              <span className="text-muted-foreground"><strong className="text-foreground">{formatCurrency(Number(d.valor) / d.numero_diarias)}</strong> / diária</span>
                            </div>
                          )}
                        </>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Documento</p>
                        <p className="text-foreground">{d.documento || "-"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Comprovante</p>
                        <p className="text-foreground">{d.comprovante_nome || "Não anexado"}</p>
                      </div>
                      {d.status_aprovacao === "AprovadoGestor" && d.data_aprovacao && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Aprovado em</p>
                            <p className="text-success font-medium">{new Date(d.data_aprovacao).toLocaleString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Aprovado por</p>
                            <p className="text-success font-medium">
                              {d.gestor_aprovador_id ? (gestor?.nome ?? d.gestor_aprovador_id) : "Aprovação automática"}
                            </p>
                          </div>
                        </>
                      )}
                      {d.status_aprovacao === "Reprovado" && d.data_aprovacao && (
                        <>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reprovado em</p>
                            <p className="text-destructive font-medium">{new Date(d.data_aprovacao).toLocaleString("pt-BR")}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Reprovado por</p>
                            <p className="text-destructive font-medium">{gestor?.nome ?? d.gestor_aprovador_id ?? "-"}</p>
                          </div>
                        </>
                      )}
                      {d.observacao && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5">Observação</p>
                          <p className="text-foreground">{d.observacao}</p>
                        </div>
                      )}
                    </div>

                    {/* Motivo reprovação */}
                    {d.status_aprovacao === "Reprovado" && d.justificativa_reprovacao && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                        <p className="font-semibold mb-0.5">Motivo da reprovação</p>
                        <p>{d.justificativa_reprovacao}</p>
                      </div>
                    )}

                    {/* Formulário de reprovação */}
                    {isReprovando && (
                      <div className="p-3 rounded-lg bg-destructive/5 border border-destructive/20 space-y-2">
                        <label className="text-sm font-medium text-foreground flex items-center gap-2">
                          <MessageSquare className="w-4 h-4" />
                          Justificativa da Reprovação
                          {grupo.parcelado && (
                            <span className="text-xs font-normal text-muted-foreground ml-1">
                              (será aplicada às {grupo.numeroParcelas} parcelas)
                            </span>
                          )}
                        </label>
                        <textarea
                          value={justificativa}
                          onChange={(e) => setJustificativa(e.target.value)}
                          placeholder="Informe o motivo da reprovação..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setReprovandoChave(null); setJustificativa(""); }}
                            className="flex-1 py-2 rounded-lg border border-input text-sm hover:bg-muted transition"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => handleReprovar(grupo)}
                            className="flex-1 py-2 rounded-lg bg-destructive text-white text-sm hover:bg-destructive/90 transition font-medium"
                          >
                            Confirmar Reprovação
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Ações */}
                    <div className="flex flex-wrap gap-2">
                      {d.comprovante_url && (
                        <button
                          onClick={() => window.open(d.comprovante_url!, "_blank")}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-input text-sm hover:bg-muted transition"
                        >
                          <Eye className="w-4 h-4" />
                          Ver Comprovante
                        </button>
                      )}
                      {d.status_aprovacao === "AguardandoGestor" && !isReprovando && (
                        <>
                          <button
                            onClick={() => setReprovandoChave(grupo.chave)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition"
                          >
                            <XCircle className="w-4 h-4" />
                            {grupo.parcelado ? `Reprovar ${grupo.numeroParcelas} Parcelas` : "Reprovar"}
                          </button>
                          <button
                            onClick={() => handleAprovar(grupo)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success text-white text-sm hover:bg-success/90 transition font-medium"
                          >
                            <CheckCircle className="w-4 h-4" />
                            {grupo.parcelado ? `Aprovar ${grupo.numeroParcelas} Parcelas` : "Aprovar"}
                          </button>
                        </>
                      )}
                      {/* Revogar — disponível para gestor/admin em qualquer status exceto Rascunho */}
                      {isGestorOuAdmin && (d.status_aprovacao === "AguardandoGestor" || d.status_aprovacao === "AprovadoGestor" || d.status_aprovacao === "Reprovado") && !isReprovando && (
                        revogandoChave === grupo.chave ? (
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/10 border border-warning/30 text-sm">
                            <span className="text-warning font-medium">Confirmar revogação?</span>
                            <button
                              onClick={() => handleRevogar(grupo)}
                              className="px-2 py-0.5 rounded bg-warning text-white text-xs font-medium hover:opacity-90 transition"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setRevogandoChave(null)}
                              className="px-2 py-0.5 rounded border border-input text-xs text-muted-foreground hover:bg-muted transition"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRevogandoChave(grupo.chave)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-warning/30 text-warning text-sm hover:bg-warning/10 transition"
                          >
                            <Undo2 className="w-4 h-4" />
                            {grupo.parcelado ? `Revogar ${grupo.numeroParcelas} Parcelas` : "Revogar ao Criador"}
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

