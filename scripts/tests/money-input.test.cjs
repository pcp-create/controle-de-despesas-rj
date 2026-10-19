const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '../../lib/money-input.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsForTest });
const { formatMoneyInput, parseMoneyDigits } = exportsForTest;

test('formats stored values without changing their magnitude', () => {
  assert.equal(formatMoneyInput(40), '40,00');
  assert.equal(formatMoneyInput('12.34'), '12,34');
  assert.equal(formatMoneyInput(''), '0,00');
});
test('typing digits fills cents automatically', () => {
  let value = '';
  for (const digit of '1234') value = parseMoneyDigits(formatMoneyInput(value) + digit);
  assert.equal(value, '12.34');
  assert.equal(formatMoneyInput(value), '12,34');
});
test('accepts pasted Brazilian amounts and clearing the field', () => {
  assert.equal(parseMoneyDigits('R$ 1.234,56'), '1234.56');
  assert.equal(parseMoneyDigits(''), '0.00');
  assert.equal(parseMoneyDigits('0,0'), '0.00');
});
