import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PreferenciasRelatorio {
  modoFiltro: "mes" | "periodo";
  mesSelecionado: number;
  anoSelecionado: number;
  dataInicial: string;
  dataFinal: string;
  filtroFuncionario: string | null;
  filtroTipo: string | null;
}

const DEBOUNCE_MS = 1000;

export function usePreferenciasRelatorio(userId: string | undefined) {
  const [preferencias, setPreferencias] = useState<PreferenciasRelatorio | null>(null);
  const [carregado, setCarregado] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Carregar preferências salvas ao montar
  useEffect(() => {
    if (!userId) { setCarregado(true); return; }

    const supabase = createClient();
    supabase
      .from("profiles")
      .select("preferencias_relatorio")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data?.preferencias_relatorio) {
          setPreferencias(data.preferencias_relatorio as PreferenciasRelatorio);
        }
        setCarregado(true);
      })
      .catch(() => setCarregado(true));
  }, [userId]);

  // Salvar preferências com debounce
  const salvar = useCallback(
    (prefs: PreferenciasRelatorio) => {
      if (!userId) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const supabase = createClient();
        await supabase
          .from("profiles")
          .update({ preferencias_relatorio: prefs })
          .eq("id", userId);
      }, DEBOUNCE_MS);
    },
    [userId]
  );

  return { preferencias, carregado, salvar };
}
