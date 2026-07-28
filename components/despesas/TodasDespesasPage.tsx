"use client";

import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { useDespesas, useTiposDespesa, useProfiles, type Despesa } from "@/lib/supabase/hooks";
import { formatCurrency, formatDate, getStatusGeral, statusGeralConfig, pagamentoTipoConfig } from "@/lib/helpers";
import DespesaExpandida from "./DespesaExpandida";
import {
  Search,
  Filter,
  ChevronDown,
  Users,
  Layers,
} from "lucide-react";

interface Props {
  initialStatus?: string;
}

interface GrupoDespesa {
  chave: string;
  despesaPrincipal: Despesa;
  parcelas: Despesa[];
  valorTotal: number;
  parcelado: boolean;
  numeroParcelas: number;
}

export default function TodasDespesasPage({ initialStatus }: Props) {
  const { currentUser } = useAppStore();
  const { despesas, isLoading } = useDespesas(undefined, currentUser?.perfil);
  const { tiposDespesa } = useTiposDespesa();
  const { profiles } = useProfiles();

  const [search, setSearch]               = useState("");
  const [filterStatus, setFilterStatus]   = useState<string>(initialStatus ?? "todos");
  const [filterTecnico, setFilterTecnico] = useState<string>("todos");
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  const tecnicos = useMemo(() => profiles, [profiles]);

  const grupos = useMemo<GrupoDespesa[]>(() => {
    const mapa = new Map<string, Despesa[]>();
    for (const d of despesas) {
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
        if (filterStatus !== "todos") {
          const sg = getStatusGeral(d.status_erp, d.status_aprovacao);
          if (sg !== filterStatus) return false;
        }
        if (filterTecnico !== "todos" && d.tecnico_id !== filterTecnico) return false;
        if (search) {
          const term = search.toLowerCase();
          const tipo    = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
          const tecnico = profiles.find((p) => p.id === d.tecnico_id);
          return (
            d.cliente.toLowerCase().includes(term) ||
            d.numero_os.toLowerCase().includes(term) ||
            (tipo?.nome    || "").toLowerCase().includes(term) ||
            (tecnico?.nome || "").toLowerCase().includes(term)
          );
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.despesaPrincipal.created_at).getTime() -
          new Date(a.despesaPrincipal.created_at).getTime()
      );
  }, [despesas, search, filterStatus, filterTecnico, tiposDespesa, profiles]);

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-foreground">Todas as Despesas</h1>
          <p className="text-sm text-muted-foreground">{grupos.length} lançamento(s)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente, OS, tipo ou técnico..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            <option value="todos">Todos os status</option>
            <option value="nao_enviado">Não enviado</option>
            <option value="enviado">Enviado</option>
            <option value="aguardando_aprovacao">Aguardando Aprovação</option>
            <option value="aprovado">Aprovado</option>
            <option value="reprovado">Reprovado</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>

        <div className="relative">
          <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <select
            value={filterTecnico}
            onChange={(e) => setFilterTecnico(e.target.value)}
            className="pl-9 pr-8 py-2 rounded-lg border border-input bg-white text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            <option value="todos">Todos os funcionários</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Lista */}
      {grupos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Nenhuma despesa encontrada</h3>
          <p className="text-sm text-muted-foreground mt-1">Tente ajustar os filtros de busca</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grupos.map((grupo) => {
            const d          = grupo.despesaPrincipal;
            const tipo       = tiposDespesa.find((t) => t.id === d.tipo_despesa_id);
            const tecnico    = profiles.find((p) => p.id === d.tecnico_id);
            const sg         = getStatusGeral(d.status_erp, d.status_aprovacao);
            const status     = statusGeralConfig[sg];
            const isExpanded = expandedId === grupo.chave;

            return (
              <div key={grupo.chave} className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : grupo.chave)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  {/* Avatar técnico */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 uppercase">
                    {tecnico?.nome?.[0] ?? "?"}
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

                    {/* Linha 2: técnico • cliente • OS • data */}
                    <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground flex-wrap">
                      <span className="font-medium text-foreground/70">{tecnico?.nome ?? "-"}</span>
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

                {isExpanded && (
                  <DespesaExpandida
                    d={d}
                    parcelas={grupo.parcelas}
                    parcelado={grupo.parcelado}
                    numeroParcelas={grupo.numeroParcelas}
                    profiles={profiles}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
