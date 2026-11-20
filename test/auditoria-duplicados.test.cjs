const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const W=require('../js/fechamentos.js');
const src=fs.readFileSync(require.resolve('../js/fechamentos-admin.js'),'utf8');
const reg={id:'r1',cliente:'Cliente',mes:'2026-11',data:'17/11',horas:5,valorTotal:5400,valorReserva:0};
const antigo={...W.criar([reg],{}),id:'legado',nfNumero:'TESTE',fiscalStatus:'emitida',nfData:'2026-11-20',cobrancaStatus:'enviada'};
function ctx(dados={},regs=[reg]){
 const c=vm.createContext({WENFechamentos:W,console,R_todosOsDados:regs,CFI_slug:s=>s.toLowerCase(),CFI_liberavel:()=>true,CFI_lista:()=>[],CFI_casar:()=>null});
 vm.runInContext(src,c);
 c.seed=dados;vm.runInContext('FC_dados=seed;writes=[];FC_gravarCampos=async(id,doc,campos)=>writes.push({id,doc,campos});FC_criarEspelho=FC_gravarCampos;',c);
 return c;
}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('OK '+passed+' — '+name);}
(async()=>{
await test('mesmos IDs consolidam sem perder histórico',()=>{
 const d=W.consolidarFechamentos([antigo,{...antigo,id:'m_cliente_2026-11',grupo:'m_cliente_2026-11',nfNumero:'OUTRO'}]);
 assert.equal(d.length,1);assert.equal(d[0].historicoDuplicados[0].nfNumero,'TESTE');
});
await test('mesmo cliente/data/valor com IDs diferentes não é apagado',()=>{
 assert.equal(W.consolidarFechamentos([antigo,{...antigo,id:'outro',lancamentoIds:['r2']}]).length,2);
});
await test('ordem de IDs e ordem da leitura não alteram cobrança ativa',()=>{
 const a={...antigo,lancamentoIds:['r1','r2']},b={...a,id:'auto',grupo:'grupo',lancamentoIds:['r2','r1']};
 assert.equal(W.consolidarFechamentos([a,b])[0].id,W.consolidarFechamentos([b,a])[0].id);
});
await test('espelhamento reaproveita fechamento legado',async()=>{
 const c=ctx({legado:antigo});await vm.runInContext("FC_espelhar(R_todosOsDados,'teste')",c);
 assert.equal(c.writes[0].id,'legado');assert.equal(c.writes[0].doc.nfNumero,'TESTE');
 assert(!c.writes[0].campos.includes('nfNumero'));
});
await test('reaplicar duas vezes não cria outro fechamento',async()=>{
 const c=ctx({legado:antigo});await vm.runInContext("FC_espelhar(R_todosOsDados).then(()=>FC_espelhar(R_todosOsDados))",c);
 assert.equal(new Set(c.writes.map(w=>w.id)).size,1);
});
await test('troca de agrupamento mantém identidade pela diária',()=>{
 const c=ctx({legado:{...antigo,grupo:'d_cliente_r1'}});
 assert.equal(vm.runInContext("FC_porGrupo('m_cliente_2026-11',R_todosOsDados).id",c),'legado');
});
await test('sobreposição parcial bloqueia criação e não exclui documentos',async()=>{
 const c=ctx({legado:{...antigo,lancamentoIds:['r1','r2']}});
 await assert.rejects(vm.runInContext('FC_espelhar(R_todosOsDados)',c),/vinculadas/);assert.equal(c.writes.length,0);
});
await test('falha de gravação é reportada, não vira sucesso',async()=>{
 const c=ctx();vm.runInContext("FC_gravarCampos=FC_criarEspelho=async()=>{throw Error('falha simulada')}",c);
 await assert.rejects(vm.runInContext('FC_espelhar(R_todosOsDados)',c),/falha simulada/);
});
await test('baixa total do proprietário confirma pagamento',async()=>{
 const c=ctx({legado:{...antigo,cobrancaStatus:'informado'}},[{...reg,valorReserva:5400}]);
 await vm.runInContext('FC_espelhar(R_todosOsDados)',c);assert.equal(c.writes[0].doc.cobrancaStatus,'pago');
 assert(c.writes[0].campos.includes('cobrancaStatus'));
});
await test('recebimento parcial não confirma pagamento total',async()=>{
 const c=ctx({legado:{...antigo,cobrancaStatus:'informado'}},[{...reg,valorReserva:1000}]);
 await vm.runInContext('FC_espelhar(R_todosOsDados)',c);assert.equal(c.writes[0].doc.cobrancaStatus,'informado');assert.equal(c.writes[0].doc.saldo,4400);
});
await test('criação reserva todas as diárias com precondição atômica',async()=>{
 let request;
 const c=vm.createContext({WENFechamentos:W,console,FS_URL:'https://firestore.googleapis.com/v1/projects/test/databases/(default)/documents',FB_API_KEY:'test',toFV:v=>({stringValue:String(v)}),fetch:async(u,o)=>{request=JSON.parse(o.body);return {ok:true}}});
 vm.runInContext(src,c);await vm.runInContext("FC_criarEspelho('novo',{lancamentoIds:['r1','r2']},['lancamentoIds'])",c);
 assert.equal(request.writes.length,3);assert(request.writes.every(w=>w.currentDocument.exists===false));
});
console.log('RESULTADO: '+passed+'/11 testes aprovados.');
})().catch(e=>{console.error(e);process.exit(1)});
