import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{criar,validarEdicao}=require('../js/fechamentos.js');
const base={id:'a',cliente:'Cliente',valorTotal:100.10,valorReserva:20.05,mes:'2026-11',data:'18/11',horas:2,studio:'A',salario:999,despesa:888,observacoes:'interno'};
const f=criar([base,{...base,id:'b',valorTotal:200.20,valorReserva:50.05}],{exigeNota:false,doc:'123',segredo:'privado'},['data']);
assert.equal(f.valor,300.3);assert.equal(f.recebido,70.1);assert.equal(f.saldo,230.2);
assert.equal(f.fiscalStatus,'nao_solicitada');assert.equal(f.cobrancaStatus,'pendente');
assert(!f.descricaoFiscal.includes('2h'));assert(f.descricaoCobranca.includes('230,20'));
assert(!JSON.stringify(f).includes('interno'));assert(!JSON.stringify(f).includes('privado'));assert(!('salario' in f.itens[0]));
assert.throws(()=>criar([]));assert.throws(()=>criar([base,base]));assert.throws(()=>criar([base,{...base,id:'c',cliente:'Outro'}]));
assert.throws(()=>criar([{...base,valorReserva:101}]));assert.throws(()=>criar([{...base,valorTotal:'inválido'}]));
assert.equal(criar([{...base,valorReserva:100.1}]).cobrancaStatus,'pago');
assert.throws(()=>validarEdicao({...f,fiscalStatus:'emitida'}));
assert.equal(validarEdicao({...f,fiscalStatus:'emitida',nfNumero:'123',nfData:'2026-11-18'}).nfNumero,'123');
console.log('Fechamentos: seleção, centavos, privacidade, sem NF e validação OK');

assert.throws(()=>criar([{...base,mes:'SET/2026'}]));
assert.equal(criar([{...base,mes:'OUT/2026'}]).itens.length,1);
assert.equal(criar([{...base,mes:'JAN/2027'}]).itens.length,1);

// ── 50/50: nota do sinal e nota do saldo ────────────────────────────────────
// Quem decide é a ficha do cliente (Will, no WEN Financeiro). O administrativo só
// registra o que foi emitido em cada parte — nunca troca o modo.
{
  const meio={...base,valorTotal:2000,valorReserva:1000};           // 50% de sinal
  assert.equal(criar([meio],{}).notaModo,'junto','sem pedido na ficha, nota é uma só');
  assert.equal(criar([meio],{notaSinal:'junto'}).notaModo,'junto');

  const sep=criar([meio],{notaSinal:'separado'});
  assert.equal(sep.notaModo,'separado','ficha pedindo separado manda no fechamento');
  assert.equal(sep.recebido,1000,'o sinal é o valor da nota do sinal');
  assert.equal(sep.saldo,1000,'o saldo é o valor da nota do saldo');
  assert.equal(sep.nfSinalStatus,'pendente');assert.equal(sep.nfSaldoStatus,'pendente');

  // sem sinal, ou já quitado, não existe o que separar
  assert.equal(criar([{...meio,valorReserva:0}],{notaSinal:'separado'}).notaModo,'junto','sem sinal não há o que separar');
  assert.equal(criar([{...meio,valorReserva:2000}],{notaSinal:'separado'}).notaModo,'junto','já pago não há saldo a separar');
  assert.equal(criar([meio],{exigeNota:false,notaSinal:'separado'}).notaModo,'junto','quem não pede nota não separa nota');

  // cada parte exige número e data quando marcada como emitida
  assert.throws(()=>validarEdicao({...sep,nfSinalStatus:'emitida'}),/nota do sinal/);
  assert.throws(()=>validarEdicao({...sep,nfSaldoStatus:'emitida',nfSaldoNumero:'9'}),/nota do saldo/);
  const umaSo={...sep,nfSinalStatus:'emitida',nfSinalNumero:'101',nfSinalData:'2026-11-05'};
  assert.equal(validarEdicao(umaSo).nfSinalNumero,'101','uma parte emitida já vale');
  assert.throws(()=>validarEdicao({...umaSo,fiscalStatus:'emitida'}),/as duas notas/,
    'geral só fica emitida quando as duas saíram');
  const duas={...umaSo,fiscalStatus:'emitida',nfSaldoStatus:'emitida',nfSaldoNumero:'102',nfSaldoData:'2026-12-05'};
  assert.equal(validarEdicao(duas).nfSaldoNumero,'102','com as duas emitidas, o geral fecha');
  assert.throws(()=>validarEdicao({...sep,nfSinalStatus:'cancelada'}),/Situação inválida na nota/);
}
console.log('50/50: sinal e saldo separados, cada nota com seu valor e sua validação OK');

// ── vencimento: vem do Receber, não é digitado de novo ──────────────────────
{
  const comVenc=v=>({...base,vencimento:v});
  assert.equal(criar([comVenc('30/11/2026')]).vencimento,'2026-11-30','data do Receber vira o vencimento');
  assert.equal(criar([comVenc('-')]).vencimento,'','sem data no Receber, fechamento sem vencimento');
  assert.equal(criar([base]).vencimento,'','lançamento sem o campo também');
  assert.equal(criar([{...comVenc('05/12/2026'),id:'x'},{...comVenc('30/11/2026'),id:'y'}]).vencimento,
    '2026-12-05','com datas diferentes, vale a mais distante');
  assert.equal(criar([comVenc('2026-11-30')]).vencimento,'2026-11-30','data já em ISO passa direto');
  assert.equal(criar([comVenc('30/11/2026')]).itens[0].vencimento,'2026-11-30','cada diária guarda a sua');
}
console.log('Vencimento herdado do Receber OK');

// ── somar diárias, horas e edições para a nota ──────────────────────────────
// É o número que o emissor copia. Uma função só, usada pelo fechamento e pelas telas.
{
  const { resumir, textoResumo } = require('../js/fechamentos.js');
  const d=(horas,edicoes,valor)=>({horas,edicoes,valor});
  assert.deepEqual(resumir([d(2,1,2200),d(3,2,3300)]),{diarias:2,horas:5,edicoes:3,valor:5500});
  assert.deepEqual(resumir([]),{diarias:0,horas:0,edicoes:0,valor:0});
  assert.equal(resumir([d(2,undefined,100)]).edicoes,0,'diária antiga, sem o campo, conta zero');
  assert.equal(resumir([d(2,'3',100)]).edicoes,3,'texto do formulário vira número');
  assert.equal(resumir([d(2,-5,100)]).edicoes,0,'negativo não desconta');
  assert.equal(resumir([d(1.5,0,100),d(2.5,0,100)]).horas,4,'meia hora soma certo');

  assert.equal(textoResumo([d(2,1,100)]),'1 diária · 2h de estúdio · 1 edição');
  assert.equal(textoResumo([d(2,2,100),d(3,0,100)]),'2 diárias · 5h de estúdio · 2 edições');
  assert.equal(textoResumo([d(2,0,100)]),'1 diária · 2h de estúdio','sem edição não inventa a palavra');
  assert.equal(textoResumo([d(2.5,0,100)]),'1 diária · 2,5h de estúdio','meia hora com vírgula');

  // a quantidade viaja do lançamento para a diária e aparece na descrição fiscal
  const f=criar([{...base,qtdEdicao:2,valorTotal:2200,valorReserva:0}]);
  assert.equal(f.itens[0].edicoes,2,'qtdEdicao do Receber vira edicoes na diária');
  assert(f.descricaoFiscal.includes('2 edições'),'a descrição fiscal já vem somada');
  assert(f.descricaoFiscal.includes('1 diária'));
  assert.equal(criar([base]).itens[0].edicoes,0,'lançamento sem o campo não quebra');
}
console.log('Resumo para a nota (diárias, horas, edições) OK');
