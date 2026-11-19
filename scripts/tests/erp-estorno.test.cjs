const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsModule = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/erp-estorno.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsModule});
const {prepararEstornoERP} = exportsModule;
const source = fs.readFileSync('app/api/integrar-erp/route.ts','utf8');
const init = source.slice(source.indexOf('  let erpId ='), source.indexOf('\n  try {\n    // ETAPA 1'));
function start(despesa) {
 return vm.runInNewContext(ts.transpileModule(init+'\n({erpId,numeroDocumentoErp,etapaInicial,payloads,respostas})',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{despesa,paraNumero:v=>v==null?null:Number(v),M8_TENANT:'t',M8_USERNAME:'u',M8_DOMAIN:'d',empresaIdM8:1});
}
const original = {erp_id:'51965',numero_documento_erp:726,erp_status:'erro',erp_etapa_erro:6,lancado_erp:true,erp_payload:{etapa2:{documento:726}},erp_resposta:{etapa3:{sucesso:true},etapa6:{sucesso:false}}};
test('estorno archives old document, clears all active integration fields and starts a fresh NF',()=>{
 const fields=prepararEstornoERP(original,'user');
 assert.equal(fields.erp_id,null);assert.equal(fields.numero_documento_erp,null);assert.equal(fields.lancado_erp,false);
 const run=start({...original,...fields});
 assert.equal(run.etapaInicial,2);assert.equal(run.numeroDocumentoErp,null);
 assert.equal(run.respostas.etapa3,undefined);assert.equal(run.payloads.etapa2,undefined);
 assert.equal(run.respostas.historico_estornos[0].erp_id,'51965');
 assert.equal(run.respostas.historico_estornos[0].numero_documento_erp,726);
});
test('retry without estorno continues the same document at the failed step',()=>{
 const run=start(original);assert.equal(run.erpId,51965);assert.equal(run.numeroDocumentoErp,726);assert.equal(run.etapaInicial,6);assert.equal(run.respostas.etapa3.sucesso,true);
});
test('repeated estorno does not duplicate history; later documents append without nesting histories',()=>{
 const first=prepararEstornoERP(original,'u');
 const repeated=prepararEstornoERP(first,'u');assert.equal(repeated.erp_resposta.historico_estornos.length,1);
 const next=prepararEstornoERP({...first,erp_id:'60000',numero_documento_erp:800},'u');
 assert.equal(next.erp_resposta.historico_estornos.length,2);
 assert.equal(next.erp_resposta.historico_estornos[1].erp_resposta.historico_estornos,undefined);
});
test('cannot reverse an in-flight integration and never trusts old steps without an active ERP ID',()=>{
 assert.throws(()=>prepararEstornoERP({...original,erp_status:'processando'},'u'),/Aguarde/);
 const run=start({...original,erp_id:null});assert.equal(run.respostas.etapa3,undefined);
});
