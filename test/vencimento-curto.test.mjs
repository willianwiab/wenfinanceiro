// 24/11: vencimento gravado no Receber como "27/11" (sem ano) era ignorado pelo fechamento.
// A Danny Ueda ficou "em atraso" pelo vencimento de uma diária já paga, quando o que faltava
// era a gravação de 27/11. Rodar: node test/vencimento-curto.test.mjs
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const F=createRequire(import.meta.url)('../js/fechamentos.js');
const d=(id,data,venc,mes,extra={})=>({id,cliente:'Danny',data,mes,horario:'-',horas:6,studio:'STUDIO A',valorTotal:3750,valorReserva:0,vencimento:venc,...extra});
const venc=(...regs)=>F.criar(regs,{}).vencimento;

// o caso real
assert.equal(venc(d('a','13/11','24/11/2026','NOV/2026',{valorReserva:3750}),d('b','12/11','24/11/2026','NOV/2026',{valorReserva:3750}),d('c','27/11','27/11','NOV/2026')),
  '2026-11-27','o vencimento passa a ser o da diária que falta (27/11)');
assert.equal(venc(d('x','01/12','05/12','DEZ/2026')),'2026-12-05','DD/MM pega o ano do mês do lançamento');
assert.equal(venc(d('x','20/12','05/01','DEZ/2026')),'2027-01-05','lançamento de dezembro vencendo em janeiro = ano seguinte');
assert.equal(venc(d('x','10/11','30/10','NOV/2026')),'2026-10-30','vencimento um pouco antes do lançamento continua no mesmo ano');
assert.equal(venc(d('x','5/11','5/11','NOV/2026')),'2026-11-05','dia/mês com um dígito');
assert.equal(venc(d('x','10/11','-','NOV/2026')),'','"-" continua sem data');
assert.equal(venc(d('x','10/11','10/11/2026','NOV/2026')),'2026-11-10','formato completo inalterado');
assert.equal(venc(d('x','10/11','2026-11-12','NOV/2026')),'2026-11-12','ISO inalterado');
console.log('✅ vencimento-curto: "27/11" no Receber vira 27/11/2026 no fechamento');
