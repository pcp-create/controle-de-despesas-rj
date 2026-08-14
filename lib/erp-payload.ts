// Helpers centralizados para extrair dados do campo JSON `erp_payload`
// (gravado em `despesas` no momento do envio ao ERP em app/api/integrar-erp/route.ts).
// Evita duplicar parsing do payload em múltiplos componentes.

/** Mapeamento do código numérico de empresa (erp_payload.etapa1.company) para o nome amigável. */
export const EMPRESAS_ERP: Record<number, string> = {
  1: "RJ Compressores",
  2: "Serrana Compressores",
  27404: "Criciúma Compressores",
};

type DespesaComErpPayload = {
  erp_payload?: Record<string, any> | null;
};

/** Lê o código numérico da empresa (etapa1.company) do erp_payload. Retorna null se ausente. */
export function extrairEmpresaErpId(despesa: DespesaComErpPayload): number | null {
  const company = despesa.erp_payload?.etapa1?.company;
  return typeof company === "number" ? company : company != null ? Number(company) : null;
}

/** Nome amigável da empresa a partir do erp_payload, com fallback para o código bruto. */
export function extrairEmpresaErpNome(despesa: DespesaComErpPayload): string {
  const id = extrairEmpresaErpId(despesa);
  if (id == null) return "—";
  return EMPRESAS_ERP[id] ?? `Empresa ${id}`;
}

/** Complemento/resumo textual da despesa gravado no erp_payload (idêntico entre etapas). */
export function extrairComplementoErp(despesa: DespesaComErpPayload): string {
  return (
    despesa.erp_payload?.etapa5?.complemento ??
    despesa.erp_payload?.etapa2?.complemento ??
    "—"
  );
}
