import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz=fileURLToPath(new URL('..',import.meta.url));
const src=fs.readFileSync(raiz+'/index.html','utf8');
function extrair(nome){
  const inicio=src.indexOf('function '+nome+'(');
  if(inicio<0)throw new Error('função não encontrada: '+nome);
  const abre=src.indexOf('{',inicio);let nivel=0,fim=abre;
  for(;fim<src.length;fim++){if(src[fim]==='{')nivel++;else if(src[fim]==='}'){nivel--;if(!nivel)break;}}
  return src.slice(inicio,fim+1);
}

const codigo=['C_norm','C_descSemParc','C_gidSerieParcela','C_ymAdd','C_temFaturaReal','C_montarParcelamentos','C_parcelasDaPrevia'].map(extrair).join('\n');
const criarAPI=(faturas,parcelamentos=[])=>new Function('FX',`
  let C_faturas=FX.faturas,C_parcelamentos=FX.parcelamentos;
  ${codigo}
  return {C_temFaturaReal,C_montarParcelamentos,C_parcelasDaPrevia};
`)({faturas,parcelamentos});

const item=(descricao,valor,data,atual,total)=>({descricao,valor,dataCompra:data,fitid:descricao+'_'+atual,parcela:{atual,total},categoria:'teste'});
const julho={id:'inter_2026-07',cartaoId:'inter',mesFatura:'2026-07',itens:[
  item('PIX CRED PARCELADO - ISAAC',164.43,'2026-06-09',1,4),
  item('PIX CRED PARCELADO - LA MARTINS',58.39,'2026-06-24',1,2),
  item('PIX CRED PARCELADO - LA MARTINS',58.39,'2026-06-27',1,2),
  item('EBI ESCOLAS BILINGUES',102,'2026-01-02',7,10),
  item('JACILEIA MARIA NEVE',110,'2026-06-19',1,3),
]};
const agosto={id:'inter_2026-08',cartaoId:'inter',mesFatura:'2026-08',itens:[
  item('PIX CRED PARCELADO (Parcela 02 de 04)',164.43,'2026-06-09',2,4),
  item('PIX CRED PARCELADO (Parcela 02 de 02)',58.38,'2026-06-24',2,2),
  item('PIX CRED PARCELADO (Parcela 02 de 02)',58.38,'2026-06-27',2,2),
  item('EBIESCOLAS BILINGUES (Parcela 08 de 10)',102,'2026-01-02',8,10),
  item('JACILEIAMARIANEVE (Parcela 02 de 03)',110,'2026-06-19',2,3),
]};

test('fatura real sempre elimina a prévia do mesmo cartão e mês',()=>{
  const api=criarAPI([julho,agosto]);
  assert.equal(api.C_temFaturaReal('inter','2026-08'),true);
  assert.deepEqual(api.C_parcelasDaPrevia('inter','2026-08'),[]);
});

test('reconcilia descrição alterada sem duplicar a série',()=>{
  const api=criarAPI([julho,agosto]);
  const series=api.C_montarParcelamentos([julho,agosto]);
  assert.equal(series.length,5);
  const isaac=series.find(p=>p.dataCompraOrigem==='2026-06-09');
  assert.equal(isaac.parcelaAtual,2);
  assert.equal(isaac.totalParcelas,4);
  assert.match(isaac.descricao,/Parcela 02 de 04/);
});

test('duas compras iguais em datas diferentes permanecem separadas',()=>{
  const api=criarAPI([julho,agosto]);
  const series=api.C_montarParcelamentos([julho,agosto]);
  const la=series.filter(p=>['2026-06-24','2026-06-27'].includes(p.dataCompraOrigem));
  assert.equal(la.length,2);
  assert.equal(new Set(la.map(p=>p.id)).size,2);
  assert.ok(la.every(p=>p.parcelaAtual===2&&p.ativo===false));
});

test('só projeta meses posteriores à última fatura real',()=>{
  const base=criarAPI([julho,agosto]);
  const series=base.C_montarParcelamentos([julho,agosto]);
  const api=criarAPI([julho,agosto],series);
  assert.deepEqual(api.C_parcelasDaPrevia('inter','2026-08'),[]);
  const setembro=api.C_parcelasDaPrevia('inter','2026-09');
  assert.equal(setembro.length,3);
  assert.equal(Math.round(setembro.reduce((s,p)=>s+p.valor,0)*100)/100,376.43);
});

