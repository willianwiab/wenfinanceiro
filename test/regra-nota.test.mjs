// Pagar e faturar são coisas diferentes. Will (20/11): "se eu selecionar 50%, ele
// divide em duas notas? posso também jogar 1 nota só para após a gravação?"
// Resposta: são controles separados. Este teste prova as quatro regras de nota e
// que fichas ANTIGAS (exigeNota + notaSinal) continuam valendo sem migração.
//
// Rodar:  node test/regra-nota.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const F = require('../js/fechamentos.js');

// o módulo de clientes é de navegador; carregamos a parte pura
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const src = fs.readFileSync(RAIZ + 'js/clientes-fiscais.js', 'utf8');
const ini = src.indexOf('const CFI_NOTA_REGRAS');
const fim = src.indexOf('function CFI_liberavel');
const { CFI_NOTA_REGRAS, CFI_notaRegra } =
  new Function(src.slice(ini, fim) + '\nreturn {CFI_NOTA_REGRAS, CFI_notaRegra};')();

const base = {id:'a', cliente:'X', mes:'NOV/2026', data:'18/11', horas:2,
  studio:'STUDIO A', valorTotal:10000, valorReserva:0};

// ── as cinco opções do seletor ─────────────────────────────────────────────
assert.deepEqual(Object.keys(CFI_NOTA_REGRAS),
  ['gravacao','pagamento','reserva','duas','nenhuma']);

// ── fichas ANTIGAS continuam valendo, sem migrar nada ──────────────────────
assert.equal(CFI_notaRegra(null), 'gravacao', 'sem ficha: 1 nota após a gravação');
assert.equal(CFI_notaRegra({}), 'gravacao');
assert.equal(CFI_notaRegra({exigeNota:false}), 'nenhuma', 'ficha velha que não pedia nota');
assert.equal(CFI_notaRegra({exigeNota:true, notaSinal:'separado'}), 'duas', 'ficha velha 50/50');
assert.equal(CFI_notaRegra({notaRegra:'reserva', exigeNota:false}), 'reserva',
  'o campo novo manda sobre o antigo');

// ── 50% de PAGAMENTO não divide a nota ─────────────────────────────────────
const meioSemDuas = F.criar([{...base, valorReserva:5000}], {condicaoPagamento:'sinal50'});
assert.equal(meioSemDuas.notaModo, 'junto',
  '🔑 pagar em duas NÃO vira faturar em duas — são controles separados');
assert.equal(meioSemDuas.condicao, 'sinal50', 'mas a condição de pagamento está lá');
assert.equal(meioSemDuas.notaRegra, 'gravacao');

// ── só quem escolhe "2 notas" é que fatura em duas ─────────────────────────
const duas = F.criar([{...base, valorReserva:5000}], {notaRegra:'duas'});
assert.equal(duas.notaModo, 'separado');
assert.equal(duas.notaQuando, 'parcela');

// ...e mesmo assim só quando há sinal E saldo de verdade
assert.equal(F.criar([base], {notaRegra:'duas'}).notaModo, 'junto', 'sem sinal não há 2 notas');
assert.equal(F.criar([{...base, valorReserva:10000}], {notaRegra:'duas'}).notaModo, 'junto',
  'já quitado não há 2 notas');

// ── 1 nota após a gravação (o padrão) e as outras ──────────────────────────
for (const [regra, quando, emite] of [
  ['gravacao','gravacao',true], ['pagamento','pagamento',true],
  ['reserva','reserva',true], ['nenhuma','',false]]) {
  const f = F.criar([base], {notaRegra: regra});
  assert.equal(f.notaQuando, quando, regra+' → quando');
  assert.equal(f.exigeNota, emite, regra+' → emite?');
  assert.equal(f.fiscalStatus, emite ? 'pendente' : 'nao_solicitada', regra+' → situação inicial');
  assert.equal(f.notaModo, 'junto', regra+' → uma nota só');
}

// ── pagar 50/50 E emitir uma nota só depois da gravação: o caso do Will ────
const caso = F.criar([{...base, valorReserva:5000}],
  {condicaoPagamento:'sinal50', notaRegra:'gravacao'});
assert.equal(caso.notaModo, 'junto', 'uma nota só');
assert.equal(caso.notaQuando, 'gravacao', 'emitida depois da gravação');
const cob = F.cobranca(caso, caso.condicao);
assert.equal(cob.parcelas[0].aberto, 0, 'o sinal já entrou');
assert.equal(cob.proxima, 'Saldo (50%)', 'a vez agora é do saldo');
assert.equal(cob.cobrarAgora, 5000, 'e o que se cobra é o saldo, não o total');

console.log('✅ regra-nota: pagar em duas ≠ faturar em duas; fichas antigas seguem valendo');
