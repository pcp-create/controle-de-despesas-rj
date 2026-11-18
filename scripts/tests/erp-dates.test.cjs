const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync('app/api/integrar-erp/route.ts', 'utf8');
const helpers = source.slice(source.indexOf('function calcularDataEntrada'), source.indexOf('function valorTexto'));
const dueExpression = source.match(/vencimento: (.+),/)[1];
const entryExpression = source.match(/lancamento: (.+),/)[1];
function dates(due, today) {
  const code = `${helpers}\nJSON.stringify({ vencimento: ${dueExpression}, entrada: ${entryExpression} });`;
  return JSON.parse(vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    despesa: { data_vencimento: due }, getLocalDateString: () => today,
  }));
}
test('ERP preserves past, current and future installment due dates independently of entry', () => {
  for (const due of ['2026-10-19', '2026-11-18', '2026-11-19', '2026-12-19', '2027-01-19']) {
    const result = dates(due, '2026-11-18');
    assert.equal(result.vencimento, `${due}T15:00:00.000Z`);
    assert.equal(result.entrada.slice(0, 10), due < '2026-11-18' ? due : '2026-11-18');
  }
});
test('sending on a different day does not move the card due date', () => {
  for (const today of ['2026-11-01', '2026-11-18', '2026-11-20']) {
    assert.equal(dates('2026-11-19', today).vencimento, '2026-11-19T15:00:00.000Z');
  }
});
test('missing due date is rejected rather than replaced with today', () => {
  assert.throws(() => dates(null, '2026-11-18'), /Data de vencimento não informado/);
});
