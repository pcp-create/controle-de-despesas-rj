import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseReference, matchFinancial, createM8Client, novemberExpenses } from '../../lib/erp-due-repair.mjs';
const expense = () => ({ id: 'expense', erp_id: 20, numero_documento_erp: 40, valor: 123.45, data_vencimento: '2026-12-19', lancado_erp: true, erp_status: 'integrado', lancado_erp_em: '2026-11-18T15:00:00Z', erp_payload: { etapa2: { empresaId: 1, pessoaId: 3, documento: 40, serie: '99' }, etapa4: { vencimento: '2026-11-18T15:00:00Z' } } });
const invoice = () => ({ id: 20, empresaId: 1, pessoaId: 3, documento: 40, totalGeral: 123.45, status: 'Processado' });
const title = () => ({ id: 50, empresaId: 1, fornecedorId: 3, documento: '40', serie: '99', valor: 123.45, saldo: 123.45, status: 'Processado' });
const parcel = () => ({ id: 60, tituloId: 50, valor: 123.45, saldo: 123.45, vencimento: '2026-11-18T15:00:00Z' });
const match = (i = [invoice()], t = [title()], p = [parcel()]) => matchFinancial(expenseReference(expense()), i, t, p);
test('matches exact company, invoice, document, person and value; uses stored installment date', () => {
  assert.equal(match().due, '2026-12-19');
  assert.equal(match().status, 'corrigir');
  assert.equal(match(undefined, undefined, [{ ...parcel(), vencimento: '2026-12-19', saldo: 0 }]).status, 'correto');
});
test('refuses ambiguous, wrong-company, paid, split and manually edited financial records', () => {
  assert.throws(() => match(undefined, [title(), title()]), /ambígua/);
  assert.throws(() => match([{ ...invoice(), empresaId: 2 }]), /divergem/);
  assert.throws(() => match(undefined, [{ ...title(), fornecedorId: 4 }]), /ausente/);
  assert.throws(() => match(undefined, undefined, [{ ...parcel(), saldo: 1 }]), /baixada/);
  assert.throws(() => match(undefined, undefined, [{ ...parcel(), borderoId: 7 }]), /borderô/);
  assert.throws(() => match(undefined, undefined, [parcel(), parcel()]), /exatamente uma/);
  assert.throws(() => match(undefined, undefined, [{ ...parcel(), vencimento: '2026-11-20' }]), /alterado após/);
});
test('scope rejects other months and canceled entries', () => {
  assert.throws(() => expenseReference({ ...expense(), lancado_erp_em: '2026-10-31T15:00:00Z' }), /fora de novembro/);
  assert.throws(() => expenseReference({ ...expense(), lancamento_cancelado: true }), /cancelada/);
});
function fakeM8() {
  const patches = [], audit = [];
  let due = parcel().vencimento;
  const client = createM8Client({ M8_API_URL: 'https://m8.test', M8_TENANT: 'tenant', M8_USERNAME: 'user', M8_PASSWORD: 'secret', M8_DOMAIN: 'domain' }, async (url, options) => {
    const u = new URL(url);
    if (u.pathname === '/v1/auth/token') return Response.json({ data: { token: 'secret' } });
    if (options.method === 'PATCH') { patches.push(JSON.parse(options.body)); due = patches.at(-1).vencimento; return Response.json({ data: {} }); }
    if (u.searchParams.get('Page') === '2') return Response.json({ data: [] });
    if (u.pathname === '/v1/compras/notafiscal') return Response.json({ data: [invoice()] });
    if (u.pathname === '/v1/financeiro/contapagar') return Response.json({ data: [title()] });
    return Response.json({ data: [{ ...parcel(), vencimento: due }] });
  });
  return { client, patches, audit, log: async row => audit.push(row) };
}
test('patch changes only due date, verifies result, logs and is idempotent', async () => {
  const s = fakeM8();
  const plan = await s.client.inspect(expense());
  const result = await s.client.correct(expense(), plan, s.log);
  assert.equal(result.status, 'corrigido');
  assert.deepEqual(s.patches, [{ vencimento: '2026-12-19T15:00:00.000Z' }]);
  assert.deepEqual(s.audit.map(a => a.action), ['tentativa', 'confirmado']);
  await s.client.correct(expense(), plan, s.log);
  assert.equal(s.patches.length, 1);
});
test('changed desired date and unavailable audit prevent writes', async () => {
  const s = fakeM8();
  const plan = await s.client.inspect(expense());
  await assert.rejects(s.client.correct({ ...expense(), data_vencimento: '2027-01-19' }, plan, s.log), /alterados desde/);
  await assert.rejects(s.client.correct(expense(), plan, async () => { throw new Error('audit unavailable'); }), /audit unavailable/);
  assert.equal(s.patches.length, 0);
});
test('count mismatch stops the entire selection before M8 calls', async () => {
  const query = { select() { return this; }, eq() { return this; }, gte() { return this; }, lt() { return this; }, order() { return this; }, async range() { return { data: [], error: null }; } };
  await assert.rejects(novemberExpenses({ from: () => query }), /Encontrados 0 documentos/);
});
