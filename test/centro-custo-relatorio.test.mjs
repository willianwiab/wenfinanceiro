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
