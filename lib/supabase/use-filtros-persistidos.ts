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

const DEBOUNCE_MS = 800;
const cache: Record<string, PreferenciasFiltros> = {};

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
  const [filtrosSalvos, setFiltrosSalvos] = useState<T | null>(null);
  const [carregado, setCarregado] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) { setCarregado(true); return; }

    // Usar cache de sessão para evitar fetch duplicado
    if (cache[userId]) {
      setFiltrosSalvos((cache[userId][aba] as T) ?? null);
      setCarregado(true);
      return;
    }

    const supabase = createClient();
    supabase
      .from("profiles")
      .select("preferencias_filtros")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        const prefs = (data?.preferencias_filtros ?? {}) as PreferenciasFiltros;
        cache[userId] = prefs;
        setFiltrosSalvos((prefs[aba] as T) ?? null);
        setCarregado(true);
      })
      .catch(() => setCarregado(true));
  }, [userId, aba]);

  const salvar = useCallback(
    (filtros: T) => {
      if (!userId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        // Atualizar cache local imediatamente
        if (!cache[userId]) cache[userId] = {};
        cache[userId] = { ...cache[userId], [aba]: filtros };

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
