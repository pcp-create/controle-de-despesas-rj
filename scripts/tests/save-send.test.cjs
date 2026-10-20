const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(require('node:path').resolve(__dirname, '../../components/despesas/NovaDespesaPageSupabase.tsx'), 'utf8');
const logic = source.slice(source.indexOf('  async function enviarRegistroSalvo'), source.indexOf('  const handleFileChange'));
function setup({edit=false, parcels=false, sendError=false, insertError=false}={}) {
 const calls=[],feedback=[];
 const module = {};
 const ctx={
 form:{valor:'1235',tipoDespesaId:'hotel',cliente:'Teste',numeroOS:'1',dataDespesa:'2026-10-20'},
 editDespesa:edit?{id:'existing'}:null, onSalvarInterno:undefined, pagamentoTipo:'cartao', calculaDiarias:false, numeroDiarias:null, isCombustivel:false, comprovante:null,
 parcelado:parcels,qtdParcelas:parcels?3:1,valorParcela:1235/3, currentUser:{id:'owner'},loading:false,envioPendenteId:null,
 validate:()=>({}), setErrors:()=>{}, setLoading:()=>{}, setFeedback:x=>feedback.push(x), setEnvioPendenteId:()=>{}, limparRascunhoDespesa:()=>{}, onBack:()=>calls.push('back'), calcularVencimento:()=> '2026-11-19',
 addDespesa:async()=>{calls.push('save');return insertError?{error:'failed'}:{data:{id:'created'}};},
 salvarEdicaoComParcelas:async()=>{calls.push('edit');return {error:null};},
 enviarParaAprovacao:async id=>{calls.push('send:'+id);return {ok:!sendError,msg:sendError?'failed':'enviado'};},
 };
 const code=`export function setup(ctx:any) { const {${Object.keys(ctx).join(',')}}=ctx; ${logic} return {handleSubmit,enviarRegistroSalvo}; }`;
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module,crypto:{randomUUID:()=> 'group'},setTimeout:fn=>fn()});
 return {...module.setup(ctx),calls,feedback};
}
const event = send=>({preventDefault(){},nativeEvent:{submitter:{dataset:{action:send?'salvar-enviar':''}}}});
test('save and send invokes approval after creating a simple expense',async()=>{
 const s=setup();await s.handleSubmit(event(true));assert.deepEqual(s.calls,['save','send:created','back']);
});
test('installments are all saved before sending the group once',async()=>{
 const s=setup({parcels:true});await s.handleSubmit(event(true));assert.deepEqual(s.calls,['save','save','save','send:created','back']);
});
test('editing then sending uses the existing record',async()=>{
 const s=setup({edit:true});await s.handleSubmit(event(true));assert.deepEqual(s.calls,['edit','send:existing','back']);
});
test('save only never submits for approval',async()=>{
 const s=setup();await s.handleSubmit(event(false));assert.deepEqual(s.calls,['save','back']);
});
test('failed save does not send, and failed send retries without inserting again',async()=>{
 const broken=setup({insertError:true});await broken.handleSubmit(event(true));assert.deepEqual(broken.calls,['save']);
 const retry=setup({sendError:true});await retry.handleSubmit(event(true));await retry.enviarRegistroSalvo('created');assert.deepEqual(retry.calls,['save','send:created','send:created']);assert.equal(retry.feedback.at(-1).type,'error');
});
