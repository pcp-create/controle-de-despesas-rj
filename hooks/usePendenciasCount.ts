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
  todasDespesas: number;   // rascunhos (não enviadas + reprovadas) visíveis no menu Todas as Despesas
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

    // Financeiro/ERP: aprovadas ainda não lançadas, excluindo "Não enviado" (Rascunho), dinheiro,
    // faturado, boleto (estes dois últimos não passam por lançamento — aparecem na lista apenas
    // para conferência) e canceladas. E com Data de Vencimento dentro do mês atual (comparação
    // por string "YYYY-MM" para evitar que conversões de timezone excluam incorretamente o
    // 1º/último dia do mês).
    const mesAtualStr = (() => {
      const hoje = new Date();
      const mes = String(hoje.getMonth() + 1).padStart(2, "0");
      return `${hoje.getFullYear()}-${mes}`;
    })();
    const financeiro = isFinanceiroOuAdmin
      ? despesas.filter(
          (d) =>
            d.status_aprovacao === "AprovadoGestor" &&
            !d.lancado_sistema &&
            d.pagamento_tipo !== "dinheiro" &&
            d.pagamento_tipo !== "faturado" &&
            d.pagamento_tipo !== "boleto" &&
            d.status_erp !== "Rascunho" &&
            d.status_erp != null &&
            !d.lancamento_cancelado &&
            !!d.data_vencimento &&
            d.data_vencimento.slice(0, 7) === mesAtualStr
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

    // Predicado: despesa pendente de ação do colaborador
    // = Rascunho não enviado OU Reprovada aguardando correção
    const isPendente = (d: (typeof despesas)[0]) =>
      d.status_erp === "Rascunho" || d.status_aprovacao === "Reprovado";

    // Minhas Despesas: pendentes do usuário logado
    // A interface Despesa usa tecnico_id como chave do usuário criador
    const minhasDespesas = currentUser?.id
      ? despesas.filter((d) => d.tecnico_id === currentUser.id && isPendente(d)).length
      : 0;

    // Todas as Despesas: grupos únicos pendentes visíveis no menu "Todas as Despesas"
    // Usa a mesma chave de agrupamento de TodasDespesasPage: d.grupo_parcela_id ?? d.id
    // Isso garante que uma despesa parcelada em N parcelas conta como 1 alerta, não N.
    const despesasPendentesParaTodasDespesas = isGestorOuAdmin
      ? despesas.filter(isPendente)
      : despesas.filter(
          (d) => isPendente(d) && (currentUser?.id ? d.tecnico_id === currentUser.id : true),
        );
    const todasDespesas = new Set(
      despesasPendentesParaTodasDespesas.map((d) => d.grupo_parcela_id ?? d.id),
    ).size;

    return {
      aprovacao,
      financeiro,
      reembolso,
      consumo,
      minhasDespesas,
      todasDespesas,
      total: aprovacao + financeiro + reembolso + consumo + minhasDespesas,
    };
  }, [despesas, frotas, isGestorOuAdmin, isFinanceiroOuAdmin, currentUser?.id, perfil]);

  return counts;
}
