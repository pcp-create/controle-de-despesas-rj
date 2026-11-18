// Executar somente no servidor. Credenciais nunca fazem parte do relatório.
export const PERIOD = { start: '2026-11-01T03:00:00.000Z', end: '2026-12-01T03:00:00.000Z', expected: 144 };
export function dateOnly(value) {
  const day = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) !== day) throw new Error('Data inválida ou ausente');
  return day;
}
const cents = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : NaN;
const id = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const sameDocument = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

export function expenseReference(d) {
  const p = d.erp_payload?.etapa2;
  if (!d.lancado_erp || d.erp_status !== 'integrado' || d.lancamento_cancelado) throw new Error('Despesa não integrada ou cancelada');
  if (!(Date.parse(d.lancado_erp_em) >= Date.parse(PERIOD.start) && Date.parse(d.lancado_erp_em) < Date.parse(PERIOD.end))) throw new Error('Envio fora de novembro/2026');
  const ref = { expenseId: d.id, invoiceId: id(d.erp_id), company: id(p?.empresaId), person: id(p?.pessoaId), document: String(d.numero_documento_erp ?? ''), series: String(p?.serie ?? ''), value: Number(d.valor), due: dateOnly(d.data_vencimento), sentDue: dateOnly(d.erp_payload?.etapa4?.vencimento) };
  if (!ref.expenseId || !ref.invoiceId || !ref.company || !ref.person || !ref.document || !ref.series || cents(ref.value) <= 0 || !Number.isFinite(ref.value)) throw new Error('Referência da integração incompleta');
  if (!sameDocument(p?.documento, ref.document)) throw new Error('Número do documento divergente do histórico de envio');
  return ref;
}

export function matchFinancial(ref, invoices, titles, parcels) {
  const invoice = invoices.filter(i => id(i.id) === ref.invoiceId);
  if (invoice.length !== 1) throw new Error('Nota fiscal não encontrada de forma única');
  const nf = invoice[0];
  if (nf.estaExcluido || nf.status !== 'Processado' || id(nf.empresaId) !== ref.company || id(nf.pessoaId) !== ref.person || !sameDocument(nf.documento, ref.document) || cents(nf.totalGeral) !== cents(ref.value)) throw new Error('Dados/status da nota fiscal divergem da despesa');
  const matches = titles.filter(t => sameDocument(t.documento, ref.document) && id(t.empresaId) === ref.company && (t.serie == null || t.serie === '' || String(t.serie) === ref.series) && (id(t.fornecedorId) === ref.person || id(t.pessoaCompraId) === ref.person));
  if (matches.length !== 1) throw new Error(`Correspondência financeira ambígua ou ausente (${matches.length} títulos)`);
  const title = matches[0];
  if (!id(title.id) || !['Pendente', 'Processado', 'Aprovado', 0, 1, 3].includes(title.status) || title.renegociacaoId || cents(title.valor) !== cents(ref.value)) throw new Error('Título alterado, renegociado ou com status incompatível');
  // A integração gera uma NF com uma parcela para cada linha de despesa.
  if (!Array.isArray(parcels) || parcels.length !== 1) throw new Error('Título não possui exatamente uma parcela; exige revisão');
  const parcel = parcels[0];
  if (id(parcel.tituloId) !== id(title.id) || !id(parcel.id) || cents(parcel.valor) !== cents(ref.value)) throw new Error('Parcela financeira diverge da despesa');
  const currentDue = dateOnly(parcel.vencimento);
  if (currentDue !== ref.due && currentDue !== ref.sentDue) throw new Error("Vencimento financeiro alterado após o envio original; exige revisão");
  if (currentDue !== ref.due && (cents(parcel.saldo) !== cents(parcel.valor) || cents(title.saldo) !== cents(title.valor) || parcel.borderoId || parcel.contaBorderoId)) throw new Error('Parcela baixada parcialmente/totalmente ou vinculada a borderô; exige revisão');
  return { ...ref, titleId: id(title.id), parcelId: id(parcel.id), currentDue, status: currentDue === ref.due ? 'correto' : 'corrigir' };
}

export function createM8Client(env, fetcher = fetch) {
  const keys = ['M8_API_URL', 'M8_TENANT', 'M8_USERNAME', 'M8_PASSWORD', 'M8_DOMAIN'];
  const missing = keys.filter(k => !env[k]);
  if (missing.length) throw new Error(`Credenciais indisponíveis: ${missing.join(', ')}`);
  const base = env.M8_API_URL.replace(/\/+$/, '');
  if (new URL(base).protocol !== 'https:') throw new Error('M8 exige conexão HTTPS');
  const tokens = new Map();
  async function request(path, token, method = 'GET', body) {
    const response = await fetcher(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: AbortSignal.timeout(25000),
    });
    const result = await response.json();
    if (!response.ok || result.errors?.length || result.error) throw new Error(`M8 recusou ${method} ${path.split('?')[0]} (HTTP ${response.status})`);
    return result.data;
  }
  async function token(company) {
    if (!tokens.has(company)) {
      tokens.set(company, request('/v1/auth/token', null, 'POST', { tenant: env.M8_TENANT, username: env.M8_USERNAME, password: env.M8_PASSWORD, company, domain: env.M8_DOMAIN }).then(auth => {
        if (!auth?.token) throw new Error('M8 não retornou token');
        return auth.token;
      }).catch(error => { tokens.delete(company); throw error; }));
    }
    return tokens.get(company);
  }
  async function list(company, path, query = {}) {
    const all = [];
    for (let page = 1; page <= 100; page++) {
      const params = new URLSearchParams({ ...query, Page: String(page), PageSize: '100' });
      const rows = await request(`${path}?${params}`, await token(company));
      if (!Array.isArray(rows)) throw new Error('Resposta de consulta M8 inválida');
      if (!rows.length) return all;
      all.push(...rows);
      if (rows.length < 100) return all;
    }
    throw new Error('Paginação M8 excedeu o limite; consulta incompleta');
  }
  return {
    async inspect(d) {
      const ref = expenseReference(d);
      const invoices = await list(ref.company, '/v1/compras/notafiscal', { Id: String(ref.invoiceId) });
      const titles = await list(ref.company, '/v1/financeiro/contapagar', { Documento: ref.document, Kind: 'Equals' });
      const matches = titles.filter(t => sameDocument(t.documento, ref.document) && id(t.empresaId) === ref.company && (t.serie == null || t.serie === '' || String(t.serie) === ref.series) && (id(t.fornecedorId) === ref.person || id(t.pessoaCompraId) === ref.person));
      if (matches.length !== 1) throw new Error(`Correspondência financeira ambígua ou ausente (${matches.length} títulos)`);
      const parcels = await list(ref.company, `/v1/financeiro/contapagar/${matches[0].id}/parcela`);
      return matchFinancial(ref, invoices, titles, parcels);
    },
    async correct(d, expected, log) {
      const current = await this.inspect(d);
      if (current.status === 'correto') return current;
      for (const field of ['expenseId', 'invoiceId', 'company', 'titleId', 'parcelId', 'currentDue', 'due', 'document', 'value']) {
        if (current[field] !== expected[field]) throw new Error(`Dados alterados desde a conferência (${field}); execute nova conferência`);
      }
      await log({ action: 'tentativa', ...current });
      await request(`/v1/financeiro/contapagar/${current.titleId}/parcela/${current.parcelId}`, await token(current.company), 'PATCH', { vencimento: `${current.due}T15:00:00.000Z` });
      const checked = await this.inspect(d);
      if (checked.currentDue !== current.due) throw new Error('M8 não confirmou o vencimento após a atualização');
      await log({ action: 'confirmado', ...checked, previousDue: current.currentDue });
      return { ...checked, status: 'corrigido', previousDue: current.currentDue };
    },
  };
}

export async function novemberExpenses(supabase) {
  const rows = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await supabase.from('despesas').select('id,erp_id,numero_documento_erp,erp_payload,valor,data_vencimento,lancado_erp,lancado_erp_em,erp_status,lancamento_cancelado')
      .eq('lancado_erp', true).eq('erp_status', 'integrado').gte('lancado_erp_em', PERIOD.start).lt('lancado_erp_em', PERIOD.end).order('id').range(from, from + 99);
    if (error) throw new Error('Não foi possível consultar as despesas integradas');
    if (!data?.length) break;
    rows.push(...data);
  }
  if (rows.length !== PERIOD.expected) throw new Error(`Encontrados ${rows.length} documentos enviados em novembro/2026; eram esperados 144. Nenhuma alteração executada. Confira o período/seleção.`);
  const keys = rows.map(d => `${d.erp_payload?.etapa2?.empresaId}:${d.erp_id}`);
  if (new Set(keys).size !== rows.length) throw new Error('Há notas fiscais duplicadas na seleção; exige revisão');
  const documents = rows.map(d => `${d.erp_payload?.etapa2?.empresaId}:${d.numero_documento_erp}`);
  if (new Set(documents).size !== rows.length) throw new Error('Há números de documento duplicados na seleção; exige revisão');
  return rows;
}
