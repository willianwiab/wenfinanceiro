// Ordem da lista do administrativo: vencimento, data da gravação, valor e cliente.
// A regra é pura — extraída do arquivo e exercitada sem navegador.
//
// Rodar:  node test/ordem-lista.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const src = fs.readFileSync(RAIZ + 'js/administrativo.js', 'utf8');
const ini = src.indexOf('const gravDe=');
const fim = src.indexOf('function lista(){', ini);
assert(ini > 0 && fim > ini, 'não achei o trecho da ordenação');
// mesChave vem do módulo compartilhado, como no navegador
const { mesChave } = await import('../js/fechamentos.js').then(m => m.default || m);
// vencEf (24/11): o adiamento do Will vale como vencimento — vem do mesmo arquivo
const hIni = src.indexOf('const adiada='), hFim = src.indexOf('\n', src.indexOf('const aVencer='));
assert(hIni > 0 && hFim > hIni, 'não achei vencEf');
const HOJE = '2026-11-24';
const { ordenador, gravDe } = new Function('WENFechamentos', 'today',
  src.slice(hIni, hFim) + '\n' + src.slice(ini, fim) + '\nreturn {ordenador, gravDe};')({ mesChave }, () => HOJE);

const f = (cliente, vencimento, saldo, diarias) =>
  ({ cliente, vencimento, saldo, itens: diarias.map(([data, mes]) => ({ data, mes })) });

const A = f('Alfa',  '2026-12-20', 1000, [['05/12', 'DEZ/2026']]);
const B = f('Beta',  '2026-11-25', 5000, [['20/11', 'NOV/2026'], ['28/11', 'NOV/2026']]);
const C = f('Cesar', '',           3000, [['10/12', 'DEZ/2026']]);
const D = f('Delta', '2026-12-05', 2000, [['01/11', 'NOV/2026']]);
const todos = () => [A, B, C, D].slice();
const ord = m => todos().sort(ordenador(m)).map(x => x.cliente);

// a data da gravação é a MAIS RECENTE do fechamento
assert.equal(gravDe(B), '2026-11-28', 'de várias diárias, vale a última');
assert.equal(gravDe(A), '2026-12-05');

assert.deepEqual(ord('venc'), ['Beta', 'Delta', 'Alfa', 'Cesar'],
  'urgente primeiro — e quem não tem data vai para o FIM, não para o começo');
assert.deepEqual(ord('venc-desc'), ['Alfa', 'Delta', 'Beta', 'Cesar'],
  'invertido, mas sem data continua no fim (string vazia ordena por último aqui)');
assert.deepEqual(ord('grav'), ['Cesar', 'Alfa', 'Beta', 'Delta'], 'gravação mais recente primeiro');
assert.deepEqual(ord('grav-asc'), ['Delta', 'Beta', 'Alfa', 'Cesar'], 'mais antiga primeiro');
assert.deepEqual(ord('valor'), ['Beta', 'Cesar', 'Delta', 'Alfa'], 'maior saldo primeiro');
assert.deepEqual(ord('cliente'), ['Alfa', 'Beta', 'Cesar', 'Delta'], 'A–Z');
assert.deepEqual(ord('inexistente'), ord('venc'), 'modo desconhecido cai no padrão');

// empate de vencimento desempata pelo cliente, para a ordem não dançar a cada render
const E1 = f('Zeta', '2026-11-25', 100, [['01/11', 'NOV/2026']]);
const E2 = f('Aqua', '2026-11-25', 900, [['01/11', 'NOV/2026']]);
assert.deepEqual([E1, E2].sort(ordenador('venc')).map(x => x.cliente), ['Aqua', 'Zeta'],
  'mesmo vencimento: ordem estável por cliente');

// fechamento sem diária não quebra
assert.equal(gravDe({ itens: [] }), '');
assert.doesNotThrow(() => [{ itens: [] }, A].sort(ordenador('grav')));

// adiada (24/11): ordena pela data do adiamento, não pelo vencimento antigo
const E = f('Eco', '2026-11-20', 1000, [['10/11', 'NOV/2026']]); E.adiadoAte = '2026-12-30'; E.cobrancaStatus = 'pendente';
assert.deepEqual([A, E, D].sort(ordenador('venc')).map(x => x.cliente), ['Delta', 'Alfa', 'Eco'], 'adiada vai para a data nova');

console.log('✅ ordem-lista: vencimento, gravação, valor e cliente — sem data vai para o fim');
