"use client";

import { useMemo } from "react";
import { useDespesas, useControleKm, useFrotas } from "@/lib/supabase/hooks";
import { useAppStore } from "@/lib/store";

export interface PendenciasCount {
  aprovacao: number;       // grupos aguardando aprovação do gestor
  financeiro: number;      // despesas aprovadas pendentes de lançamento ERP
  reembolso: number;       // despesas em dinheiro aguardando reembolso
  consumo: number;         // abastecimentos com apontamentos de KM insuficientes
  minhasDespesas: number;  // despesas do usuário logado não enviadas ou reprovadas
  total: number;
}

export function usePendenciasCount(): PendenciasCount {
  const { currentUser } = useAppStore();
  const perfil = currentUser?.perfil ?? "";
  const isGestorOuAdmin = perfil === "administrador" || perfil === "gestor";
  const isFinanceiroOuAdmin = perfil === "administrador" || perfil === "financeiro" || perfil === "gestor";

  const { despesas } = useDespesas(undefined, perfil);
  const { registros: apontamentosKm } = useControleKm();
  const { frotas } = useFrotas();

  const counts = useMemo(() => {
    // Aprovações: grupos únicos aguardando aprovação do gestor
    // Condição: status_aprovacao === "AguardandoGestor" E status_erp !== "Rascunho"
    const aprovacao = isGestorOuAdmin
      ? new Set(
          despesas
            .filter(
              (d) =>
                d.status_aprovacao === "AguardandoGestor" &&
                d.status_erp !== "Rascunho" &&
                d.status_erp != null,
            )
            .map((d) => d.grupo_parcela_id ?? d.id)
        ).size
      : 0;

    // Financeiro/ERP: aprovadas ainda não lançadas, excluindo "Não enviado" (Rascunho), dinheiro e canceladas
    const financeiro = isFinanceiroOuAdmin
      ? despesas.filter(
          (d) =>
            d.status_aprovacao === "AprovadoGestor" &&
            !d.lancado_sistema &&
            d.pagamento_tipo !== "dinheiro" &&
            d.status_erp !== "Rascunho" &&
            d.status_erp != null &&
            !d.lancamento_cancelado
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

    // Consumo: frotas com alerta_ativo === true persistido no banco (só gestor/admin)
    const consumo = isGestorOuAdmin
      ? frotas.filter((f) => f.alerta_ativo === true).length
      : 0;

    // Minhas Despesas: despesas do usuário logado com status "Não enviada" ou "Reprovada"
    // "Não enviada" → status_erp === "Rascunho" e sem justificativa_reprovacao
    // "Reprovada"   → status_erp === "Rascunho" e com justificativa_reprovacao preenchida
    // Ambos os casos: status_erp === "Rascunho" — contamos todos os rascunhos do usuário
    const minhasDespesas = currentUser?.id
      ? despesas.filter(
          (d) =>
            d.usuario_id === currentUser.id &&
            d.status_erp === "Rascunho",
        ).length
      : 0;

    return {
      aprovacao,
      financeiro,
      reembolso,
      consumo,
      minhasDespesas,
      total: aprovacao + financeiro + reembolso + consumo + minhasDespesas,
    };
  }, [despesas, frotas, isGestorOuAdmin, isFinanceiroOuAdmin]);

  return counts;
}
