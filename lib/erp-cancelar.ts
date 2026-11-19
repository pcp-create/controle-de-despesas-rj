/** Operação exclusiva do servidor; consulta antes de cancelar para permitir retomada segura. */
export async function cancelarDocumentoM8(d: any, env: NodeJS.ProcessEnv, fetcher = fetch) {
  const id = Number(d.erp_id);
  const empresa = Number(d.erp_payload?.etapa2?.empresaId);
  const documento = Number(d.numero_documento_erp);
  if (![id, empresa, documento].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Referência do documento M8 incompleta; vínculo mantido.');
  const keys = ['M8_API_URL', 'M8_TENANT', 'M8_USERNAME', 'M8_PASSWORD', 'M8_DOMAIN'];
  if (keys.some(k => !env[k])) throw new Error('Credenciais M8 indisponíveis no servidor.');
  const base = env.M8_API_URL!.replace(/\/+$/, '');
  if (new URL(base).protocol !== 'https:') throw new Error('M8 exige HTTPS.');
  async function request(path: string, method: string, token?: string, body?: unknown) {
    const r = await fetcher(`${base}${path}`, { method, cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = await r.json();
    if (!r.ok || json.errors?.length || json.error) {
      const message = method === 'POST' && path === '/v1/auth/token' ? 'Falha na autenticação M8.' :
        String(json.errors?.[0]?.message || 'M8 recusou a operação.').split(/<br\s*\/?\s*>|\n\s*at /i)[0].replace(/<[^>]*>/g, '').slice(0, 500);
      throw new Error(message);
    }
    return json.data;
  }
  const auth = await request('/v1/auth/token', 'POST', undefined, { tenant: env.M8_TENANT, username: env.M8_USERNAME, password: env.M8_PASSWORD, company: empresa, domain: env.M8_DOMAIN });
  if (!auth?.token) throw new Error('M8 não retornou token.');
  async function consultar() {
    const rows = await request(`/v1/compras/notafiscal?Id=${id}`, 'GET', auth.token);
    if (!Array.isArray(rows) || rows.length !== 1 || Number(rows[0].id) !== id || Number(rows[0].empresaId) !== empresa || Number(rows[0].documento) !== documento) throw new Error('Não foi possível confirmar o documento no M8; vínculo mantido.');
    return rows[0];
  }
  const cancelado = (nf: any) => nf.status === 'Cancelado' || nf.status === 2;
  const atual = await consultar();
  let resposta;
  if (!cancelado(atual)) {
    resposta = await request(`/v1/compras/notafiscal/${id}/cancelar`, 'POST', auth.token);
    if (!cancelado(await consultar())) throw new Error('M8 ainda não confirmou o cancelamento. Tente novamente para conferir o resultado; vínculo mantido.');
  }
  return { confirmado_em: new Date().toISOString(), erp_id: String(id), empresa_id: empresa, resposta: resposta ?? { mensagem: 'Documento já cancelado no M8.' } };
}
