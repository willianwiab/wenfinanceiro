// Auditoria do sistema fiscal: invariantes que precisam valer sempre.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const F = require('../js/fechamentos.js');
const C = require('../js/clientes-fiscais.js');
const ok = [], falhou = [];
const t = (nome, fn) => { try { fn(); ok.push(nome); } catch (e) { falhou.push(nome + ' → ' + e.message); } };

const base = {id:'a',cliente:'X',mes:'NOV/2026',data:'18/11',horario:'10:00 AS 12:00',
  horas:2,studio:'STUDIO A',valorTotal:1000,valorReserva:0,vencimento:'30/11/2026',desc:'d'};

t('centavos: 3 diárias de 333,33 somam exato', () => {
  const f = F.criar([1,2,3].map(i=>({...base,id:'x'+i,valorTotal:333.33})));
  assert.equal(f.valor, 999.99);
});
t('centavos: 50/50 de valor ímpar fecha com o total', () => {
  for (const v of [999.99, 0.01, 1234.57, 3750.01]) {
    const c = F.cobranca({valor:v, recebido:0}, 'sinal50');
    assert.equal(Math.round(c.parcelas.reduce((s,p)=>s+p.valor,0)*100)/100, v, 'total '+v);
  }
});
t('privacidade: obs/salário/despesa nunca entram no fechamento', () => {
  const f = F.criar([{...base, obs:'SIGILO', salario:9999, despesa:777, custo:1}]);
  const j = JSON.stringify(f);
  for (const p of ['SIGILO','9999','777']) assert(!j.includes(p), 'vazou '+p);
});
t('privacidade: ficha só exporta campos da lista explícita', () => {
  const f = F.criar([base], {segredo:'NAO_PODE', margem:0.9, doc:'123'});
  assert(!JSON.stringify(f).includes('NAO_PODE'));
  assert.equal(f.clienteFiscal.doc, '123');
});
t('corte: setembro/2026 é recusado, outubro passa', () => {
  assert.throws(()=>F.criar([{...base, mes:'SET/2026'}]));
  assert.equal(F.criar([{...base, mes:'OUT/2026'}]).itens.length, 1);
});
t('valor inválido é recusado', () => {
  assert.throws(()=>F.criar([{...base, valorTotal:0}]));
  assert.throws(()=>F.criar([{...base, valorTotal:-5}]));
  assert.throws(()=>F.criar([{...base, valorReserva:5000}]), /recebido/);
});
t('dois clientes no mesmo fechamento é recusado', () => {
  assert.throws(()=>F.criar([base, {...base, id:'b', cliente:'Outro'}]));
});
t('diária repetida é recusada', () => assert.throws(()=>F.criar([base, base])));
t('nota: uma diária nunca entra em duas notas', () => {
  const f = {itens:[{id:'a',valor:100},{id:'b',valor:200}], notasEmitidas:[]};
  f.notasEmitidas.push(F.validarNota(f,{numero:'1',data:'2026-11-20',ids:['a']}));
  assert.throws(()=>F.validarNota(f,{numero:'2',data:'2026-11-20',ids:['a']}), /outra nota/);
  assert.deepEqual(F.diariasLivres(f).map(x=>x.id), ['b']);
});
t('nota: número repetido no mesmo fechamento é recusado', () => {
  const f = {itens:[{id:'a',valor:100},{id:'b',valor:200}], notasEmitidas:[{numero:'1',ids:['a']}]};
  assert.throws(()=>F.validarNota(f,{numero:'1',data:'2026-11-20',ids:['b']}), /este número/i);
});
t('50% de pagamento NÃO divide a nota', () => {
  assert.equal(F.criar([{...base, valorReserva:500}], {condicaoPagamento:'sinal50'}).notaModo, 'junto');
  assert.equal(F.criar([{...base, valorReserva:500}], {notaRegra:'duas'}).notaModo, 'separado');
});
t('ficha antiga (exigeNota/notaSinal) continua valendo', () => {
  assert.equal(C.CFI_notaRegra({exigeNota:false}), 'nenhuma');
  assert.equal(C.CFI_notaRegra({exigeNota:true, notaSinal:'separado'}), 'duas');
  assert.equal(C.CFI_notaRegra(null), 'gravacao');
});
t('só quem é desmarcado nos DOIS fica de fora', () => {
  assert.equal(C.CFI_liberavel(null), true);
  assert.equal(C.CFI_liberavel({exigeNota:false}), true);
  assert.equal(C.CFI_liberavel({cobrancaAdministrativo:false}), true);
  assert.equal(C.CFI_liberavel({exigeNota:false, cobrancaAdministrativo:false}), false);
});
t('nome: pré-reserva é reconhecida como o mesmo cliente', () => {
  assert.deepEqual(C.CFI_parecidos('PRÉ RESERVA WEN PRODUTORA ESTUDIO B - DANNY UEDA', ['DANNY UEDA']), ['DANNY UEDA']);
  assert.deepEqual(C.CFI_parecidos('OUTRA COISA', ['DANNY UEDA']), []);
});
t('vencimento vem do Receber, não é inventado', () => {
  assert.equal(F.criar([base]).vencimento, '2026-11-30');
  assert.equal(F.criar([{...base, vencimento:'-'}]).vencimento, '');
});
t('quem cobra viaja para a tela dela', () => {
  assert.equal(F.criar([base], {cobrancaAdministrativo:false}).clienteFiscal.cobrancaAdministrativo, false);
  assert.equal(F.criar([base], {}).clienteFiscal.cobrancaAdministrativo, true);
});
t('consolidação: fechamentos com as mesmas diárias viram um', () => {
  const r = F.consolidarFechamentos([
    {id:'velho', lancamentoIds:['a','b'], criadoEm:'2026-11-01'},
    {id:'novo', grupo:'m_x_2026-11', lancamentoIds:['a','b'], criadoEm:'2026-11-20'}]);
  assert.equal(r.length, 1, 'duplicado consolidado');
  assert.equal(r[0].id, 'novo', 'fica o que tem grupo');
  assert.equal(r[0].historicoDuplicados.length, 1, 'e o outro vira histórico, não some');
});
t('mensagem de cobrança não vaza dado interno', () => {
  const f = F.criar([{...base, obs:'INTERNO', valorReserva:300}]);
  assert(!f.descricaoCobranca.includes('INTERNO'));
  assert(f.descricaoCobranca.includes('PIX'), 'mas diz como pagar');
});
t('quitado não pede dinheiro nem manda PIX', () => {
  const f = F.criar([{...base, valorReserva:1000}]);
  assert(f.descricaoCobranca.includes('quitado'));
  assert(!f.descricaoCobranca.includes('PIX'));
});

// regras do Firestore: o que ela NÃO pode escrever
const regras = fs.readFileSync(new URL('../firestore.rules', import.meta.url),'utf8');
t('regras: ela não escreve itens, valor, saldo nem cliente', () => {
  for (const campo of ['itens','valor','recebido','saldo','vencimento','cliente'])
    assert(regras.includes("'"+campo+"'"), 'campo '+campo+' precisa estar na lista de bloqueio');
  assert(regras.includes('hasAny'), 'a negativa explícita precisa existir');
});
t('regras: decisões do Will fora do alcance dela', () => {
  const upd = regras.slice(regras.indexOf('match /clientes_fiscais'), regras.indexOf('match /administrativo_avisos'));
  for (const campo of ['exigeNota','cobrancaAdministrativo','condicaoPagamento','notaRegra'])
    assert(!upd.includes("'"+campo+"'"), campo+' não pode estar nos campos que ela edita');
});
t('regras: notasEmitidas nunca encolhe', () => assert(regras.includes('>=') && regras.includes('notasEmitidas')));
t('regras: e-mail verificado é exigido', () => assert(regras.includes('email_verified')));

console.log('\n✅ ' + ok.length + ' invariantes conferidas');
ok.forEach(n => console.log('   ✓ ' + n));
if (falhou.length) { console.log('\n❌ ' + falhou.length + ' FALHARAM'); falhou.forEach(n => console.log('   ✗ ' + n)); process.exit(1); }
