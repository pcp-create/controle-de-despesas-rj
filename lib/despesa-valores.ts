/** Soma as parcelas em centavos para preservar o total original da despesa. */
export function totalDasParcelas(parcelas: ReadonlyArray<{ valor: number | string }>): number {
  return parcelas.reduce((total, parcela) => total + Math.round(Number(parcela.valor) * 100), 0) / 100;
}

export function valorParaLimite(total: number, calculaDiarias: boolean, diarias?: number | null): number {
  if (!Number.isFinite(total) || total <= 0) return Infinity;
  if (!calculaDiarias) return total;
  return diarias && Number.isFinite(diarias) && diarias > 0 ? total / diarias : Infinity;
}
