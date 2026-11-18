const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('components/aprovacao/AprovacaoPageSupabase.tsx', 'utf8');
const logic = source.slice(source.indexOf('  const handleAprovar ='), source.indexOf('  // Reprova todas as parcelas'));
function setup() {
  const states = { pending: new Set(), expanded: 'a', feedback: null, rows: [{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }] };
  const requests = [];
  let audits = 0;
  const setter = key => value => { states[key] = typeof value === 'function' ? value(states[key]) : value; };
  const ctx = {
    currentUser: { id: 'gestor' }, aprovacoesEmAndamento: { current: new Set() },
    setAprovando: setter('pending'), setExpandedId: setter('expanded'), setFeedback: setter('feedback'),
    createClient: () => ({ from: () => ({ update: fields => ({ in: (_, ids) => ({ select: () => new Promise((resolve, reject) => requests.push({ fields, ids, resolve, reject })) }) }) }) }),
    mutate: async fn => { if (fn) states.rows = fn(states.rows); },
    registrarAuditoria: () => { audits++; return new Promise(() => {}); }, console,
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(`export function setup(ctx:any) { const {${Object.keys(ctx).join(',')}} = ctx; ${logic} return handleAprovar; }`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports });
  return { states, requests, approve: exports.setup(ctx), audits: () => audits };
}
const group = (key, ids) => ({ chave: key, parcelas: ids.map(id => ({ id })), despesaPrincipal: { cliente: key }, parcelado: ids.length > 1, numeroParcelas: ids.length });
test('immediate feedback, one batch per group, duplicate guard and concurrent completion', async () => {
  const s = setup();
  const a = s.approve(group('a', ['a1', 'a2']));
  assert.equal(s.states.expanded, null);
  assert.equal(s.states.pending.has('a'), true);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].ids.join(','), 'a1,a2');
  await s.approve(group('a', ['a1', 'a2']));
  assert.equal(s.requests.length, 1);
  s.states.expanded = 'b';
  const b = s.approve(group('b', ['b1']));
  s.states.expanded = 'c';
  s.requests[1].resolve({ data: [{ id: 'b1' }], error: null });
  await b;
  assert.equal(s.states.pending.has('a'), true);
  assert.equal(s.states.pending.has('b'), false);
  s.requests[0].resolve({ data: [{ id: 'a1' }, { id: 'a2' }], error: null });
  await a;
  assert.equal(s.states.rows.every(d => d.status_aprovacao === 'AprovadoGestor'), true);
  assert.equal(s.states.expanded, 'c');
  assert.equal(s.states.pending.size, 0);
  assert.equal(s.audits(), 2); // audit still unresolved: does not block UI
});
test('network failure restores only the failed group and permits retry', async () => {
  const s = setup();
  const a = s.approve(group('a', ['a1', 'a2']));
  const b = s.approve(group('b', ['b1']));
  s.requests[0].reject(new Error('offline'));
  await a;
  assert.equal(s.states.pending.has('a'), false);
  assert.equal(s.states.pending.has('b'), true);
  assert.equal(s.states.rows[0].status_aprovacao, undefined);
  s.requests[1].resolve({ data: [{ id: 'b1' }], error: null });
  await b;
  assert.equal(s.states.feedback.type, 'error');
  const retry = s.approve(group('a', ['a1', 'a2']));
  s.requests[2].resolve({ data: [{ id: 'a1' }, { id: 'a2' }], error: null });
  await retry;
  assert.equal(s.states.rows.every(d => d.status_aprovacao === 'AprovadoGestor'), true);
});
test('zero updated rows is not reported as approval success', async () => {
  const s = setup();
  const a = s.approve(group('a', ['a1', 'a2']));
  s.requests[0].resolve({ data: [], error: null });
  await a;
  assert.equal(s.states.feedback.type, 'error');
  assert.equal(s.states.pending.size, 0);
  assert.equal(s.audits(), 0);
});
