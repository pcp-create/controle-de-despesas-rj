/** Arquiva o envio anterior e remove somente o vínculo ativo com o M8. */
export function prepararEstornoERP(despesa: any, usuarioId: string | null, agora = new Date().toISOString()) {
  if (despesa.erp_status === 'processando') throw new Error('Aguarde a integração terminar antes de estornar.');
  const { historico_estornos = [], ...respostas } = despesa.erp_resposta || {};
  const historico = Array.isArray(historico_estornos) ? [...historico_estornos] : [];
  if (despesa.erp_id || despesa.numero_documento_erp) {
    historico.push({
      estornado_em: agora, estornado_por: usuarioId,
      erp_id: despesa.erp_id ?? null,
      numero_documento_erp: despesa.numero_documento_erp ?? null,
      lancado_erp_em: despesa.lancado_erp_em ?? null,
      erp_status: despesa.erp_status, erp_etapa_erro: despesa.erp_etapa_erro ?? null,
      erp_erro: despesa.erp_erro ?? null,
      erp_payload: despesa.erp_payload ?? null, erp_resposta: respostas,
    });
  }
  return {
    lancado_erp: false, lancado_erp_em: null, lancado_erp_por: null,
    erp_id: null, numero_documento_erp: null,
    erp_status: 'pendente', erp_etapa_erro: null, erp_erro: null,
    erp_payload: null, erp_resposta: { historico_estornos: historico },
    updated_at: agora,
  };
}
