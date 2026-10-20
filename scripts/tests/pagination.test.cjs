const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../../lib/supabase/paginate.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsForTest });
const { readAllPages } = exportsForTest;
test('loads older installments beyond the first thousand expenses', async () => {
  const records = Array.from({ length: 1204 }, (_, id) => ({ id, parcelado: id >= 1200 }));
  const rows = await readAllPages(async (from, to) => ({ data: records.slice(from, to + 1), error: null }));
  assert.equal(rows.length, 1204);
  assert.equal(rows.filter(r => r.parcelado).length, 4);
  assert.equal(new Set(rows.map(r => r.id)).size, 1204);
});
test('handles a server limit below the requested page size', async () => {
  const rows = await readAllPages(async (from, to) => ({ data: Array.from({length: 600}, (_, i) => i).slice(from, Math.min(to + 1, from + 100)), error: null }));
  assert.equal(rows.length, 600);
});
test('does not return a partial list when a later page fails', async () => {
  await assert.rejects(readAllPages(async (from) => from ? {data: null, error: new Error('query failed')} : {data: [1], error: null}), /query failed/);
});
