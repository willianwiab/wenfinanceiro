import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const SRC = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
function ex(n){ let i=SRC.indexOf('function '+n+'('); const b=SRC.indexOf('{',i); let d=0,j=b; for(;j<SRC.length;j++){if(SRC[j]==='{')d++;else if(SRC[j]==='}'){d--;if(!d)break;}} return SRC.slice(i,j+1); }
const fnPlano=ex('C_planoExclusaoCartaoWen');
// C_ymFromWen do WEN
const fnYm=ex('C_ymFromWen'); const fnMA=ex('CC_mesAnoDaKey');
const MESES_ABREV=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MESES_IDX={}; MESES_ABREV.forEach((m,i)=>MESES_IDX[m]=i);
const C_faturas=[
  {id:'nu_2026-04',cartaoId:'nu',mesFatura:'2026-04'}, // passada
  {id:'nu_2026-07',cartaoId:'nu',mesFatura:'2026-07'}, // atual
  {id:'nu_2026-08',cartaoId:'nu',mesFatura:'2026-08'}, // futura
];
const C_parcelamentos=[{id:'p_nu_x_10',cartaoId:'nu'},{id:'p_outro',cartaoId:'outro'}];
const P_meses={
  'ABR/2026':[{id:'fat_nu_2026-04',faturaCartao:{cartaoId:'nu',mes:'ABR/2026'},valorPago:700}], // passado (preservar)
  'JUL/2026':[
    {id:'fat_nu_2026-07',faturaCartao:{cartaoId:'nu',mes:'JUL/2026'},valorPago:900,contaBancariaId:'b1'}, // pago -> estorno
    {id:'aluguel',nome:'Aluguel',valor:3800},  // conta normal
  ],
  'AGO/2026':[{id:'fat_nu_2026-08',faturaCartao:{cartaoId:'nu',mes:'AGO/2026'},valorPago:0,previa:true}],
};
const BC_MOVS=[{id:'mov_pagar_fat_nu_2026-07',origemTipo:'pagar',origemId:'fat_nu_2026-07'},{id:'mov_pagar_fat_nu_2026-04',origemTipo:'pagar',origemId:'fat_nu_2026-04'}];
const API=new Function('FX',`
  const MESES_ABREV=FX.MESES_ABREV, MESES_IDX=FX.MESES_IDX;
  let C_faturas=FX.C_faturas,C_parcelamentos=FX.C_parcelamentos,P_meses=FX.P_meses,BC_MOVS=FX.BC_MOVS;
  ${fnMA}
  ${fnYm}
  ${fnPlano}
  return {C_planoExclusaoCartaoWen};
`)({C_faturas,C_parcelamentos,P_meses,BC_MOVS,MESES_ABREV,MESES_IDX});
let pass=0,fail=0; const eq=(d,g,w)=>{JSON.stringify(g)===JSON.stringify(w)?pass++:(fail++,console.log('FALHOU',d,JSON.stringify(g)));}; const ok=(d,c)=>c?pass++:(fail++,console.log('FALHOU',d));
const p=API.C_planoExclusaoCartaoWen('nu','2026-07');
eq('faturas atual+futura', p.faturas.sort(), ['nu_2026-07','nu_2026-08']);
ok('preserva fatura passada 04', !p.faturas.includes('nu_2026-04'));
eq('parcelamentos do cartao', p.parcelamentos, ['p_nu_x_10']);
eq('contas geradas atual+futura', p.contas.map(c=>c.id).sort(), ['fat_nu_2026-07','fat_nu_2026-08']);
ok('preserva conta passada', !p.contas.some(c=>c.id==='fat_nu_2026-04'));
ok('nao toca conta normal', !p.contas.some(c=>c.id==='aluguel'));
eq('estorna so pagamento atual', p.movsReverter, ['mov_pagar_fat_nu_2026-07']);
console.log(`\n${pass} passaram, ${fail} falharam`); process.exit(fail?1:0);
