// Will (20/11): "avisar quando a soma das notas do mês não bate com o faturado —
// pega nota esquecida e nota em dobro". Regra pura, sem navegador.
//
// Rodar:  node test/conferencia-nota-faturado.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const W = require('../js/fechamentos.js');
const C = require('../js/clientes-fiscais.js');

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const src = fs.readFileSync(RAIZ + 'js/fechamentos-admin.js', 'utf8');
const ini = src.indexOf('function FC_conferencia(');
const fim = src.indexOf('function FC_blocoConferencia(');
assert(ini > 0 && fim > ini, 'não achei FC_conferencia');
const { FC_conferencia } = new Function('WENFechamentos', 'CFI_notaRegra', 'CFI_casar',
  src.slice(ini, fim) + '\nreturn {FC_conferencia};')(W, C.CFI_notaRegra, C.CFI_casar);

const l = (cliente, valor, extra = {}) =>
  ({ id: cliente + valor, cliente, mes: 'NOV/2026', valorTotal: valor, ...extra });
const n = (cliente, valor, numero, extra = {}) =>
  ({ cliente, valor, numero, mesIni: 'NOV/2026', status: 'emitida', ...extra });

// ── o caso bom: não aparece ───────────────────────────────────────────────
assert.deepEqual(FC_conferencia([l('A', 1000)], [n('A', 1000, '1')], []), [],
  'faturado igual a emitido não vira achado');

// ── nota esquecida ────────────────────────────────────────────────────────
let r = FC_conferencia([l('A', 1000), l('A', 500)], [], []);
assert.equal(r.length, 1);
assert.equal(r[0].tipo, 'sem_nota');
assert.equal(r[0].faturado, 1500);
assert.equal(r[0].emitido, 0);
assert.equal(r[0].diferenca, -1500);
assert.equal(r[0].diarias, 2);

// ── nota parcial: falta emitir o resto ────────────────────────────────────
r = FC_conferencia([l('A', 1000), l('A', 500)], [n('A', 1000, '1')], []);
assert.equal(r[0].tipo, 'falta');
assert.equal(r[0].diferenca, -500);
assert.deepEqual(r[0].notas, ['1']);

// ── nota em DOBRO: o achado mais caro ─────────────────────────────────────
r = FC_conferencia([l('A', 1000)], [n('A', 1000, '1'), n('A', 1000, '2')], []);
assert.equal(r[0].tipo, 'sobra');
assert.equal(r[0].diferenca, 1000);
assert.deepEqual(r[0].notas, ['1', '2']);

// ── nota cancelada não conta ──────────────────────────────────────────────
r = FC_conferencia([l('A', 1000)], [n('A', 1000, '1'), n('A', 1000, '2', { status: 'cancelada' })], []);
assert.deepEqual(r, [], 'cancelada sai da conta e o resto bate');

// ── quem não emite nota fica fora da conferência ──────────────────────────
const fichas = [{ id: 'semnota', nome: 'SEM NOTA', nomes: ['SEM NOTA'], notaRegra: 'nenhuma' }];
assert.deepEqual(FC_conferencia([l('SEM NOTA', 9999)], [], fichas), [],
  'cliente sem nota não é cobrado por nota faltando');
assert.equal(FC_conferencia([l('SEM NOTA', 9999), l('A', 100)], [], fichas).length, 1,
  'mas os outros continuam valendo');

// ── o que não deve entrar na conta ────────────────────────────────────────
assert.deepEqual(FC_conferencia([l('A', 1000, { naoFaturavel: true })], [], []), [],
  'pré-reserva não entra');
assert.deepEqual(FC_conferencia([l('A', 1000, { excluido: true })], [], []), [],
  'lançamento excluído não entra');
assert.deepEqual(FC_conferencia([l('A', 0)], [], []), [], 'valor zero não entra');
assert.deepEqual(FC_conferencia([l('A', 1000, { mes: 'SET/2026' })], [], []), [],
  'antes do corte de outubro não entra');

// ── recorte de meses ──────────────────────────────────────────────────────
const dois = [l('A', 1000), l('A', 700, { mes: 'DEZ/2026' })];
assert.equal(FC_conferencia(dois, [], [], 'NOV/2026', 'NOV/2026')[0].faturado, 1000,
  'só novembro');
assert.equal(FC_conferencia(dois, [], [], 'NOV/2026', 'DEZ/2026')[0].faturado, 1700,
  'os dois meses');

// ── ordem: nota em dobro primeiro, depois a maior diferença ───────────────
r = FC_conferencia(
  [l('PEQUENO', 100), l('GRANDE', 9000), l('DOBRO', 500)],
  [n('DOBRO', 1000, '9')], []);
assert.equal(r[0].cliente, 'DOBRO', 'emitido a mais encabeça — é o erro mais caro');
assert.equal(r[1].cliente, 'GRANDE', 'depois a maior diferença');

// ── centavos ──────────────────────────────────────────────────────────────
assert.deepEqual(FC_conferencia([l('A', 333.33), l('A', 333.33), l('A', 333.34)],
  [n('A', 1000, '1')], []), [], 'três de 333,33+ somam 1000 exato e batem');
assert.equal(FC_conferencia([l('A', 1000)], [n('A', 999.99, '1')], [])[0].diferenca, -0.01,
  'um centavo de diferença é achado, não arredondado');

// ── nada quebra com entrada vazia ─────────────────────────────────────────
assert.deepEqual(FC_conferencia([], [], []), []);
assert.deepEqual(FC_conferencia(null, null, null), []);

console.log('✅ conferencia-nota-faturado: pega nota esquecida, parcial e em dobro — e ignora quem não emite');
