const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').resolve(__dirname, '../../lib/despesa-valores.ts'), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported});
const {totalDasParcelas,valorParaLimite} = exported;
test('1235 reais in six installments and five nights costs 247 per night', () => {
 const parcelas = [205.83,205.83,205.83,205.83,205.83,205.85].map(valor=>({valor}));
 const total = totalDasParcelas(parcelas);
 assert.equal(total,1235);
 assert.equal(valorParaLimite(total,true,5),247);
 assert.equal(valorParaLimite(total,true,5)<=200,false);
});
test('daily rate is independent of the number of installments', () => {
 assert.equal(valorParaLimite(totalDasParcelas([{valor:617.5},{valor:617.5}]),true,5),247);
 assert.equal(valorParaLimite(1235,true,5),247);
});
test('non-hotel limits also consider the full expense', () => {
 assert.equal(valorParaLimite(1235,false,null),1235);
});
test('missing nights and invalid totals cannot qualify for automatic approval', () => {
 for(const days of [null,0,-1]) assert.equal(valorParaLimite(1235,true,days),Infinity);
 assert.equal(valorParaLimite(NaN,true,5),Infinity);
});

test('sending installments above the nightly limit requests manager approval for the whole group', async () => {
 const source = fs.readFileSync(require('node:path').resolve(__dirname, '../../lib/supabase/hooks.ts'), 'utf8');
 const start = source.indexOf('  const enviarDespesa = async');
 const end = source.indexOf('  const aprovarDespesa = async', start);
 const moduleSource = `export function setup(getSupabase: any, mutate: any, readAllPages: any, totalDasParcelas: any, valorParaLimite: any) { ${source.slice(start,end)} return enviarDespesa; }`;
 const moduleExports = {};
 vm.runInNewContext(ts.transpileModule(moduleSource, {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022}}).outputText, {exports:moduleExports});
 const writes = [];
 const supabase = {from() { return {
  select() { return {eq() { return {
   single: async () => ({data: {valor:205.83, numero_diarias:5, numero_parcelas:6, grupo_parcela_id:'group', tipo_despesa:{calcula_diarias:true,limite_maximo:200}}, error:null}),
  }; }}; },
  update(data) { writes.push(data); return {eq: async (key,value) => {assert.equal(key,'grupo_parcela_id');assert.equal(value,'group');return {error:null};}}; },
 }; }};
 const send = moduleExports.setup(()=>supabase,()=>{},async()=>[205.83,205.83,205.83,205.83,205.83,205.85].map(valor=>({valor})),totalDasParcelas,valorParaLimite);
 const result = await send('expense');
 assert.equal(result.ok,true);
 assert.equal(writes[0].status_aprovacao,'AguardandoGestor');
 assert.equal(writes[0].status_erp,'EnviadoAguardandoGestor');
});
