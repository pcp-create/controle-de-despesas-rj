const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const source=ts.transpileModule(fs.readFileSync('app/api/erp/estornar/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
async function run({role='financeiro',fail=false,conflict=false}={}){
 const writes=[];let canceled=0;
 const d={id:'888f6280-b843-4446-ae6b-f1bdb1c80602',erp_id:'12',numero_documento_erp:34,erp_status:'integrado',updated_at:'before'};
 const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){let patch;return {
 select(){return this;},eq(){return this;},is(){return this;},
 update(p){patch=p;writes.push(p);return this;},insert(){return Promise.resolve({});},
 single:async()=>({data:table==='profiles'?{ativo:true,perfil:role}:d}),
 maybeSingle:async()=>({data:conflict?null:patch.erp_status==='processando'?{updated_at:'lock'}:{id:d.id}}),
 then(resolve){resolve({});}
 };}};
 const exports={};
 vm.runInNewContext(source,{exports,process:{env:{}},require(name){
 if(name==='next/server')return {NextResponse:{json:(body,options)=>({body,status:options?.status||200})}};
 if(name.includes('supabase/server'))return {createClient:async()=>db};
 if(name.includes('erp-cancelar'))return {cancelarDocumentoM8:async()=>{canceled++;if(fail)throw Error('Título baixado');return {confirmado_em:'now'};}};
 if(name.includes('erp-estorno'))return {prepararEstornoERP:()=>({erp_id:null,erp_resposta:{historico_estornos:[{}]}})};
 throw Error(name);
 }});
 const response=await exports.POST({json:async()=>({id:d.id})});
 return {response,writes,canceled};
}
test('only clears link after confirmed ERP cancellation and saves confirmation in history',async()=>{
 const r=await run();assert.equal(r.response.status,200);assert.equal(r.canceled,1);
 assert.equal(r.writes[0].erp_status,'processando');assert.equal(r.writes[1].erp_id,null);
 assert.equal(r.writes[1].erp_resposta.historico_estornos[0].cancelamento_m8.confirmado_em,'now');
});
test('ERP failure preserves IDs and restores status; unauthorized or conflicting requests never call ERP',async()=>{
 const r=await run({fail:true});assert.equal(r.response.status,502);assert.equal(r.writes.length,2);
 assert.equal(r.writes[1].erp_status,'integrado');assert.ok(r.writes.every(p=>!('erp_id' in p)));
 for(const opts of [{role:'tecnico'},{conflict:true}]){const x=await run(opts);assert.equal(x.canceled,0);assert.ok(x.response.status>=400);}
});
