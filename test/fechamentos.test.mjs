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
