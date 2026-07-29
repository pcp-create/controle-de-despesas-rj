"use client";

import { useMemo } from "react";
import { useDespesas, useControleKm } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";
import { gerarAlertasConsumo } from "@/lib/consumo-frota";

export interface PendenciasCount {
  aprovacao: number;   // grupos aguardando aprovação do gestor
  financeiro: number;  // despesas aprovadas pendentes de lançamento ERP
  reembolso: number;   // despesas em dinheiro aguardando reembolso
  consumo: number;     // abastecimentos com apontamentos de KM insuficientes
  total: number;
}

export function usePendenciasCount(): PendenciasCount {
  const { currentUser } = useAppStore();
  const perfil = currentUser?.perfil ?? "";
  const isGestorOuAdmin = perfil === "administrador" || perfil === "gestor";
  const isFinanceiroOuAdmin = perfil === "administrador" || perfil === "financeiro" || perfil === "gestor";

  const { despesas } = useDespesas(undefined, perfil);
  const { registros: apontamentosKm } = useControleKm();

  const counts = useMemo(() => {
    // Aprovações: grupos únicos de funcionário aguardando aprovação
    const aprovacao = isGestorOuAdmin
      ? new Set(
          despesas
            .filter((d) => d.status_erp && d.status_erp !== "Rascunho" && d.status_aprovacao === "AguardandoGestor")
            .map((d) => d.tecnico_id)
        ).size
      : 0;

    // Financeiro/ERP: aprovadas ainda não lançadas (exclui dinheiro — esses vão para Reembolso)
    const financeiro = isFinanceiroOuAdmin
      ? despesas.filter(
          (d) =>
            d.status_aprovacao === "AprovadoGestor" &&
            !d.lancado_sistema &&
            d.pagamento_tipo !== "dinheiro"
        ).length
      : 0;

    // Reembolso: dinheiro aprovado não processado
    const reembolso = isFinanceiroOuAdmin
      ? despesas.filter(
          (d) =>
            d.pagamento_tipo === "dinheiro" &&
            d.status_aprovacao === "AprovadoGestor" &&
            !d.reembolso_processado
        ).length
      : 0;

    // Consumo: abastecimentos com apontamentos de KM insuficientes (só gestor/admin)
    // Exclui alertas já tratados (salvos em localStorage pelo Dashboard)
    let consumo = 0;
    if (isGestorOuAdmin) {
      let tratados: Record<string, string> = {};
      try {
        const raw = localStorage.getItem(`alertas_consumo_tratados_${currentUser?.id ?? ""}`);
        tratados = JSON.parse(raw ?? "{}");
      } catch { /* ignore */ }
      consumo = gerarAlertasConsumo(despesas, apontamentosKm).filter((a) => !tratados[a.id]).length;
    }

    return { aprovacao, financeiro, reembolso, consumo, total: aprovacao + financeiro + reembolso + consumo };
  }, [despesas, apontamentosKm, isGestorOuAdmin, isFinanceiroOuAdmin, currentUser?.id]);

  return counts;
}
