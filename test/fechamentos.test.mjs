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
