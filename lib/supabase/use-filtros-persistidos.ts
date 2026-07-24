import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Tipos de filtros por aba
export interface FiltrosPeriodo {
  modoFiltro: "mes" | "periodo";
  mesSelecionado: number;
  anoSelecionado: number;
  dataInicial: string;
  dataFinal: string;
}

export interface FiltrosDashboard extends FiltrosPeriodo {
  filtroTipo: string | null;
  filtroFuncionario: string | null;
}

export interface FiltrosRelatorio extends FiltrosPeriodo {
  filtroTipo: string | null;
  filtroFuncionario: string | null;
}

export interface FiltrosFinanceiro extends FiltrosPeriodo {
  filtroLancamento: "todos" | "lancado" | "pendente";
}

export interface FiltrosAprovacao {
  filterStatus: string;
  filterFuncionario: string;
}

export interface PreferenciasFiltros {
  dashboard?: FiltrosDashboard;
  relatorio?: FiltrosRelatorio;
  financeiro?: FiltrosFinanceiro;
  aprovacao?: FiltrosAprovacao;
}

const DEBOUNCE_MS = 600;

// Cache de módulo: sobrevive à troca de abas (remontagem de componentes)
// É populado na primeira requisição e atualizado a cada save.
const cache: Record<string, PreferenciasFiltros | null> = {};
// Indica se já disparamos o fetch para aquele userId (evita fetches duplicados)
const fetchPromise: Record<string, Promise<PreferenciasFiltros>> = {};

async function carregarPreferencias(userId: string): Promise<PreferenciasFiltros> {
  // Se já está em andamento, reutilizar a mesma promise
  if (userId in fetchPromise) return fetchPromise[userId];

  const supabase = createClient();
  const promise = supabase
    .from("profiles")
    .select("preferencias_filtros")
    .eq("id", userId)
    .single()
    .then(({ data }) => {
      const prefs = (data?.preferencias_filtros ?? {}) as PreferenciasFiltros;
      cache[userId] = prefs;
      return prefs;
    })
    .catch(() => {
      cache[userId] = {};
      return {} as PreferenciasFiltros;
    });

  fetchPromise[userId] = promise;
  return promise;
}

/**
 * Hook genérico para persistir filtros de qualquer aba no campo
 * `preferencias_filtros` (JSONB) da tabela `profiles`.
 *
 * @param userId  ID do usuário logado
 * @param aba     Chave da aba: "dashboard" | "relatorio" | "financeiro" | "aprovacao"
 */
export function useFiltrosPersistidos<T extends object>(
  userId: string | undefined,
  aba: keyof PreferenciasFiltros
) {
  // Inicializar de forma síncrona a partir do cache quando disponível
  const [filtrosSalvos, setFiltrosSalvos] = useState<T | null>(() => {
    if (!userId) return null;
    const cached = cache[userId];
    return cached ? (cached[aba] as T) ?? null : null;
  });
  const [carregado, setCarregado] = useState(() => {
    if (!userId) return true;
    return userId in cache; // já no cache = já carregado
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) { setCarregado(true); return; }
    // Se já está em cache (incluindo cache vazio {}), não busca de novo
    if (userId in cache) {
      setFiltrosSalvos((cache[userId]?.[aba] as T) ?? null);
      setCarregado(true);
      return;
    }
    // Buscar do banco (ou reaproveitar promise em andamento)
    carregarPreferencias(userId).then((prefs) => {
      setFiltrosSalvos((prefs[aba] as T) ?? null);
      setCarregado(true);
    });
  }, [userId, aba]);

  const salvar = useCallback(
    (filtros: T) => {
      if (!userId) return;
      // Atualizar cache imediatamente para que outras abas vejam na remontagem
      cache[userId] = { ...(cache[userId] ?? {}), [aba]: filtros };

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase
          .from("profiles")
          .update({ preferencias_filtros: cache[userId] })
          .eq("id", userId);
      }, DEBOUNCE_MS);
    },
    [userId, aba]
  );

  return { filtrosSalvos, carregado, salvar };
}
