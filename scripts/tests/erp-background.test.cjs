const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const src=fs.readFileSync(require('node:path').resolve(__dirname,'../../components/financeiro/FinanceiroPageSupabase.tsx'),'utf8');
const logic=src.slice(src.indexOf('  const executarEnvioERP ='),src.indexOf('  const handleEstornarERP'));
function setup() {
 const pending={},calls=[],states={tarefas:{},enviando:{},lancando:{},erros:{},modal:'first'};
 const ctx={authUser:{id:'user'},currentUser:null,enviosEmAndamento:{current:new Set()},
 setConfirmLancar:v=>states.modal=v,
 setTarefasERP:fn=>states.tarefas=fn(states.tarefas),setEnviandoERP:fn=>states.enviando=fn(states.enviando),setLancando:fn=>states.lancando=fn(states.lancando),setErroERP:fn=>states.erros=fn(states.erros),
 tentarNovamenteERP:id=>{calls.push(id);return new Promise((resolve,reject)=>pending[id]={resolve,reject});},
 lancarSistema:async()=>({error:null})};
 const exports={};
 vm.runInNewContext(ts.transpileModule(`export function setup(ctx:any){const {${Object.keys(ctx).join(',')}}=ctx;${logic}return {handleLancarEnviarERP,handleEnviarERP};}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports});
 return {...exports.setup(ctx),states,pending,calls};
}
test('closes immediately, supports concurrent expenses and does not close a later modal',async()=>{
 const s=setup();const a=s.handleLancarEnviarERP('a');assert.equal(s.states.modal,null);
 s.states.modal='other';const b=s.handleEnviarERP('b');
 s.states.modal='third';assert.deepEqual(s.calls,['a','b']);
 await s.handleEnviarERP('a');assert.equal(s.calls.length,2);
 s.pending.a.resolve({error:null,erp_id:'123'});await a;
 assert.equal(s.states.modal,'third');assert.equal(s.states.tarefas.a.status,'sucesso');assert.equal(s.states.enviando.b,true);
 s.pending.b.resolve({error:'falha'});await b;
 assert.equal(s.states.tarefas.b.status,'erro');assert.equal(s.states.enviando.b,false);
});
test('network failure clears only that expense and allows a later retry',async()=>{
 const s=setup();const a=s.handleEnviarERP('a');s.pending.a.reject(new Error('offline'));await a;
 assert.equal(s.states.enviando.a,false);assert.equal(s.states.lancando.a,false);assert.equal(s.states.tarefas.a.status,'erro');
 const retry=s.handleEnviarERP('a');s.pending.a.resolve({error:null});await retry;assert.equal(s.calls.length,2);
});
