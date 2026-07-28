"use client";

import { useMemo } from "react";
import { useDespesas } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";

export interface PendenciasCount {
  aprovacao: number;   // grupos aguardando aprovação do gestor
  financeiro: number;  // despesas aprovadas pendentes de lançamento ERP
  reembolso: number;   // despesas em dinheiro aguardando reembolso
  total: number;
}

export function usePendenciasCount(): PendenciasCount {
  const { currentUser } = useAppStore();
  const perfil = currentUser?.perfil ?? "";
  const isGestorOuAdmin = perfil === "administrador" || perfil === "gestor";
  const isFinanceiroOuAdmin = perfil === "administrador" || perfil === "financeiro" || perfil === "gestor";

  const { despesas } = useDespesas(undefined, perfil);

  const counts = useMemo(() => {
    // Aprovações: grupos únicos de funcionário aguardando aprovação
    const aprovacao = isGestorOuAdmin
      ? new Set(
          despesas
            .filter((d) => d.status_erp && d.status_erp !== "Rascunho" && d.status_aprovacao === "AguardandoGestor")
            .map((d) => d.tecnico_id)
        ).size
      : 0;

    // Financeiro/ERP: aprovadas ainda não lançadas
    const financeiro = isFinanceiroOuAdmin
      ? despesas.filter(
          (d) => d.status_aprovacao === "AprovadoGestor" && !d.lancado_sistema
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

    return { aprovacao, financeiro, reembolso, total: aprovacao + financeiro + reembolso };
  }, [despesas, isGestorOuAdmin, isFinanceiroOuAdmin]);

  return counts;
}
