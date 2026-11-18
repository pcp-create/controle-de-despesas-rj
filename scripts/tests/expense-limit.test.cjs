const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const store = fs.readFileSync('lib/store.ts', 'utf8');
const admin = fs.readFileSync('components/admin/TiposDespesaPageSupabase.tsx', 'utf8');
const expense = fs.readFileSync('components/despesas/NovaDespesaPageSupabase.tsx', 'utf8');
function expression(source, field, context) {
  const value = source.match(new RegExp(`${field}: ([^\\n]+),`))[1];
  return vm.runInNewContext(value, context);
}
function status(limit, value, days) {
  const start = expense.indexOf('  const statusLimite = useMemo(() => {');
  const end = expense.indexOf('  // ─── Cálculo de parcelas', start);
  return vm.runInNewContext(expense.slice(start, end) + '\nstatusLimite', {
    useMemo: fn => fn(), tipoSelecionado: { limite_maximo: limit },
    calculaDiarias: !!days, valorPorDiaria: days ? value / days : null,
    form: { valor: String(value) },
  });
}
test('blank limit survives load, edit and save without becoming zero', () => {
  const limiteMaximo = expression(store, 'limiteMaximo', { tipo: { limite_maximo: null } });
  const editing = admin.slice(admin.indexOf('limite_maximo: tipo.limiteMaximo'));
  const field = expression(editing, 'limite_maximo', { tipo: { limiteMaximo } });
  assert.equal(field, '');
  const save = admin.slice(admin.indexOf('limite_maximo: form.limite_maximo'));
  const stored = expression(save, 'limite_maximo', { form: { limite_maximo: field } });
  assert.equal(stored, null);
  assert.equal(status(stored, 1235), null);
  assert.equal(status(stored, 1235, 5), null);
});
test('explicit zero and positive limits retain justification rules', () => {
  assert.equal(expression(store, 'limiteMaximo', { tipo: { limite_maximo: 0 } }), 0);
  assert.equal(status(0, 50), 'excede');
  assert.equal(status(200, 201), 'excede');
  assert.equal(status(200, 200), 'ok');
  assert.equal(status(200, 1235, 5), 'excede');
  assert.equal(status(247, 1235, 5), 'ok');
});
