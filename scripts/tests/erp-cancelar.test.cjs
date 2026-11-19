const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/erp-cancelar.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,AbortSignal,URL});
const env={M8_API_URL:'https://m8.example',M8_TENANT:'t',M8_USERNAME:'u',M8_PASSWORD:'p',M8_DOMAIN:'d'};
const d={erp_id:'12',numero_documento_erp:34,erp_payload:{etapa2:{empresaId:5}}};
const nf=status=>[{id:12,documento:34,empresaId:5,status}];
function fake(results){const calls=[];return {calls,fetch:async(url,opts)=>{calls.push({url,...opts});const next=results.shift();if(next instanceof Error)throw next;return {ok:!next.errors,json:async()=>next};}};}
test('cancels exact stored document with no body and verifies canceled status',async()=>{
 const f=fake([{data:{token:'token'}},{data:nf('Processado')},{data:{mensagem:'OK'}},{data:nf('Cancelado')}]);
 const r=await mod.exports.cancelarDocumentoM8(d,env,f.fetch);
 assert.equal(r.erp_id,'12');assert.equal(f.calls.length,4);
 assert.equal(JSON.parse(f.calls[0].body).company,5);
 assert.equal(f.calls[2].url,'https://m8.example/v1/compras/notafiscal/12/cancelar');assert.equal(f.calls[2].body,undefined);
});
test('retry after remote cancellation only queries and does not cancel again',async()=>{
 const f=fake([{data:{token:'t'}},{data:nf('Cancelado')}]);
 await mod.exports.cancelarDocumentoM8(d,env,f.fetch);assert.equal(f.calls.length,2);
});
test('rejects missing or wrong-company invoices without posting cancellation',async()=>{
 for(const rows of [[],[{...nf('Processado')[0],empresaId:99}]]){
 const f=fake([{data:{token:'t'}},{data:rows}]);
 await assert.rejects(mod.exports.cancelarDocumentoM8(d,env,f.fetch),/confirmar/);assert.equal(f.calls.length,2);
 }
});
test('ERP rejection, timeout and unconfirmed cancellation never return success',async()=>{
 for(const result of [{errors:[{message:'Título baixado<br>stack'}]},new Error('timeout'),{data:{mensagem:'OK'}}]){
 const f=fake([{data:{token:'t'}},{data:nf('Processado')},result,{data:nf('Processado')}]);
 await assert.rejects(mod.exports.cancelarDocumentoM8(d,env,f.fetch));
 }
});
