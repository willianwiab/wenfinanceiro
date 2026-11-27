import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// Fase 1 do centro de custo: relatório "Resultado por estúdio" — função pura, só leitura.
const raiz=fileURLToPath(new URL('..',import.meta.url));
const src=fs.readFileSync(raiz+'/index.html','utf8');
function extrair(nome){
  const inicio=src.indexOf('function '+nome+'(');
  if(inicio<0)throw new Error('função não encontrada: '+nome);
  const abre=src.indexOf('{',inicio);let nivel=0,fim=abre;
  for(;fim<src.length;fim++){if(src[fim]==='{')nivel++;else if(src[fim]==='}'){nivel--;if(!nivel)break;}}
  return src.slice(inicio,fim+1);
}
const calc=(P,R,cartao=[])=>new Function('P_meses','R_todosOsDados','C_itensCartaoMesWen',`
  let RPT_CEN={base:'periodo',pctA:73,sem:'aparte'};${extrair('RPT_calcCentros')}
  return {RPT_calcCentros,cfg:RPT_CEN};`)(P,R,()=>cartao);
const P={'NOV/2026':[
  {id:'1',valor:1000,centroCusto:'studio_a'},{id:'2',valor:500,centroCusto:'studio_b'},
  {id:'3',valor:600,centroCusto:'rateio_receita'},{id:'4',valor:200,centroCusto:'fora'},
  {id:'5',valor:50},{id:'6',valor:9999,faturaCartao:true,centroCusto:'rateio_receita'}]};
const R=[{mes:'NOV/2026',studio:'STUDIO A',valorTotal:3000},{mes:'NOV/2026',studio:'STUDIO B',valorTotal:1000},{mes:'OUT/2026',studio:'STUDIO A',valorTotal:777}];

test('rateio pela receita do período; fatura de cartão não entra; soma confere',()=>{
  const {RPT_calcCentros,cfg}=calc(P,R,[{valor:100}]);
  const c=RPT_calcCentros(['NOV/2026'],cfg);
  assert.equal(c.shareA,0.75);
  assert.equal(c.A.rateio,450);assert.equal(c.B.rateio,150);
  assert.equal(c.A.resultado,3000-1000-450);assert.equal(c.B.resultado,1000-500-150);
  assert.equal(c.d.sem,50);assert.equal(c.d.cartao,100);assert.equal(c.d.fora,200);
  assert.equal(c.despTotal,1000+500+600+200+50+100);
  assert.ok(c.confere);
});
test('% fixo e ratear sem centro/cartão',()=>{
  const {RPT_calcCentros}=calc(P,R,[{valor:100}]);
  const c=RPT_calcCentros(['NOV/2026'],{base:'fixo',pctA:60,sem:'ratear'});
  assert.equal(c.pool,600+50+100);assert.equal(c.A.rateio,750*0.6);assert.ok(c.confere);
  assert.equal(c.naoAloc,200); // só o pessoal fica de fora
});
test('não grava nada: a função não toca em P_meses',()=>{
  const antes=JSON.stringify(P);const {RPT_calcCentros,cfg}=calc(P,R);RPT_calcCentros(['NOV/2026'],cfg);
  assert.equal(JSON.stringify(P),antes);
});

// ── Fase 2: herança do centro de custo no Pagar ──
const cen=(P)=>new Function('P_meses',`
  const P_getMesesOrdenados=()=>Object.keys(P_meses).sort();
  ${['CEN_label','CEN_norm','CEN_mapaPorNome','CEN_sugerir','CEN_aplicar','CEN_herdarSemCentro'].map(extrair).join('\n')}
  const CEN_OPCOES=[['studio_a','Studio A']];
  return {CEN_sugerir,CEN_aplicar,CEN_herdarSemCentro};`)(P);
test('Fase 2: conta nova herda o centro da última de mesmo nome (case/espaço ignorados)',()=>{
  const P={'2026-10':[{id:'a',nome:'ENEL STUDIO A',centroCusto:'studio_a'}],'2026-11':[{id:'b',nome:'enel  studio a',centroCusto:'studio_b'}]};
  const {CEN_sugerir,CEN_aplicar}=cen(P);
  assert.equal(CEN_sugerir('Enel Studio A'),'studio_b'); // a mais recente vence
  assert.equal(CEN_aplicar({nome:'ENEL STUDIO A'}).centroCusto,'studio_b');
  assert.equal(CEN_aplicar({nome:'ENEL STUDIO A',centroCusto:'fora'}).centroCusto,'fora'); // escolha explícita não muda
  assert.equal(CEN_aplicar({nome:'CONTA NOVA'}).centroCusto,undefined);
});
test('Fase 2: fatura de cartão não herda nem serve de modelo; hook preenche só quem está sem centro',()=>{
  const P={'2026-11':[{id:'a',nome:'RAUL',centroCusto:'rateio_receita'},{id:'f',nome:'RAUL',faturaCartao:true},{id:'n',nome:'RAUL'},{id:'x',nome:'OUTRO'}]};
  const {CEN_herdarSemCentro}=cen(P);
  assert.equal(CEN_herdarSemCentro(),1);
  assert.equal(P['2026-11'][1].centroCusto,undefined);
  assert.equal(P['2026-11'][2].centroCusto,'rateio_receita');
  assert.equal(P['2026-11'][3].centroCusto,undefined);
});
