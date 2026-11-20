// Will (20/11): "quero a opção de selecionar quais quero fazer a mesma nota".
// Uma gravação nunca pode entrar em duas notas, e o que sobra fica para a próxima.
//
// Rodar:  node test/nota-por-selecao.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../js/fechamentos.js');

const fech = () => ({
  itens: [{id:'a', valor:3750, data:'13/11'}, {id:'b', valor:3750, data:'12/11'}, {id:'c', valor:3750, data:'27/11'}],
  notasEmitidas: []
});

// ── tudo livre no começo ───────────────────────────────────────────────────
let f = fech();
assert.deepEqual(F.diariasLivres(f).map(x=>x.id), ['a','b','c']);

// ── o caso do Danny Ueda: nota só das duas que já têm 50% pago ─────────────
const n1 = F.validarNota(f, {numero:'101', data:'2026-11-20', ids:['a','b']});
assert.equal(n1.valor, 7500, 'o valor é a soma das selecionadas');
assert.deepEqual(n1.ids, ['a','b']);
assert(n1.em, 'guarda quando foi registrada');
f.notasEmitidas.push(n1);

assert.deepEqual(F.diariasLivres(f).map(x=>x.id), ['c'], 'a terceira continua esperando');

// ── a mesma diária NÃO entra numa segunda nota ─────────────────────────────
assert.throws(()=>F.validarNota(f,{numero:'102',data:'2026-11-21',ids:['a']}), /já está em outra nota/);
assert.throws(()=>F.validarNota(f,{numero:'102',data:'2026-11-21',ids:['c','a']}), /já está em outra nota/,
  'nem misturada com uma livre');

// ── número repetido no mesmo fechamento é barrado ──────────────────────────
assert.throws(()=>F.validarNota(f,{numero:'101',data:'2026-11-21',ids:['c']}), /existe uma nota com este número/i);
assert.throws(()=>F.validarNota(f,{numero:' 101 ',data:'2026-11-21',ids:['c']}), /existe uma nota/i,
  'espaços não driblam a checagem');

// ── o resto exige número e data de verdade ─────────────────────────────────
assert.throws(()=>F.validarNota(f,{numero:'',data:'2026-11-21',ids:['c']}), /número da nota/);
assert.throws(()=>F.validarNota(f,{numero:'102',data:'',ids:['c']}), /data de emissão/);
assert.throws(()=>F.validarNota(f,{numero:'102',data:'21/11/2026',ids:['c']}), /data de emissão/,
  'data em formato brasileiro não passa — o campo é ISO');
assert.throws(()=>F.validarNota(f,{numero:'102',data:'2026-11-21',ids:[]}), /pelo menos uma diária/);
assert.throws(()=>F.validarNota(f,{numero:'102',data:'2026-11-21',ids:['zzz']}), /não pertence a este fechamento/);

// ── a última diária fecha o ciclo ──────────────────────────────────────────
const n2 = F.validarNota(f, {numero:'102', data:'2026-11-25', ids:['c']});
assert.equal(n2.valor, 3750);
f.notasEmitidas.push(n2);
assert.deepEqual(F.diariasLivres(f), [], 'acabou — nada mais a faturar');

// e aí a situação fiscal precisa acompanhar
const completo = {...f, descricaoCobranca:'x', descricaoFiscal:'y', exigeNota:true,
  cobrancaStatus:'pendente', fiscalStatus:'pendente', nfNumero:'101, 102', nfData:'2026-11-25',
  vencimento:'', promessaData:'', promessaObs:''};
assert.throws(()=>F.validarEdicao(completo), /marque a situação fiscal como emitida/,
  'todas as diárias faturadas e o status ainda "pendente" é incoerência, não detalhe');
assert.doesNotThrow(()=>F.validarEdicao({...completo, fiscalStatus:'emitida'}));

// ── ids repetidos na mesma seleção não contam duas vezes ───────────────────
const g = fech();
const n3 = F.validarNota(g, {numero:'200', data:'2026-11-20', ids:['a','a','b']});
assert.deepEqual(n3.ids, ['a','b'], 'duplicata na seleção é ignorada');
assert.equal(n3.valor, 7500, 'e o valor não dobra');

// ── fechamento sem notas: diariasLivres não quebra ─────────────────────────
assert.deepEqual(F.diariasLivres({}), []);
assert.deepEqual(F.diariasLivres(null), []);
assert.equal(F.diariasLivres({itens:[{id:'x',valor:1}]}).length, 1);

console.log('✅ nota-por-selecao: escolhe as diárias, soma certo, e nenhuma entra em duas notas');
