// Painel 🔔 Avisos da aba Fiscal e Cobranças: vencidos, vencendo, a vencer, sem data
// e esperando nota. A regra é pura — roda sem navegador, com o "hoje" fixado.
//
// Rodar:  node test/avisos-vencimento.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const src = fs.readFileSync(RAIZ + 'js/fechamentos-admin.js', 'utf8');
// o arquivo é de navegador; isolamos só o trecho puro do painel
const ini = src.indexOf('const FC_DIA=');
const fim = src.indexOf('function FC_renderAvisos()');
assert(ini > 0 && fim > ini, 'não achei o trecho puro de FC_avisos');
const { FC_avisos, FC_diasAte } = new Function(src.slice(ini, fim) +
  '\nreturn {FC_avisos, FC_diasAte};')();

const HOJE = '2026-11-19';
const f = (id, v, extra = {}) => ({ id, cliente: id, vencimento: v, saldo: 1000, itens: [{}],
  cobrancaStatus: 'pendente', exigeNota: true, fiscalStatus: 'pendente', ...extra });

assert.equal(FC_diasAte('2026-11-19', HOJE), 0, 'hoje = 0 dias');
assert.equal(FC_diasAte('2026-11-20', HOJE), 1);
assert.equal(FC_diasAte('2026-11-18', HOJE), -1);
assert.equal(FC_diasAte('', HOJE), null, 'sem data não vira zero');
assert.equal(FC_diasAte('-', HOJE), null, 'o traço do Receber não vira data');

const g = FC_avisos([
  f('atrasado', '2026-11-10'),
  f('hoje', '2026-11-19'),
  f('semana', '2026-11-24'),
  f('longe', '2026-12-30'),
  f('semdata', ''),
  f('pago', '2026-11-01', { cobrancaStatus: 'pago' }),
  f('semnota', '2026-11-25', { exigeNota: false }),
  f('comnota', '2026-11-26', { fiscalStatus: 'emitida' }),
], HOJE);

assert.deepEqual(g.vencidos.map(x => x.id), ['atrasado']);
// 26/11 é exatamente o 7º dia: entra na janela.
assert.deepEqual(g.vencendo.map(x => x.id), ['hoje', 'semana', 'semnota', 'comnota'], 'vence hoje conta como vencendo, não como vencido; o 7º dia ainda é "vencendo"');
assert.deepEqual(g.aVencer.map(x => x.id), ['longe']);
assert.deepEqual(g.semData.map(x => x.id), ['semdata']);
assert.deepEqual(g.pagos.map(x => x.id), ['pago'], 'pago sai da fila de cobrança');
assert(!g.emAberto.some(x => x.id === 'pago'), 'e não entra em nenhum grupo em aberto');

// nota pendente é um recorte à parte: inclui quem ainda nem venceu, exclui quem já emitiu
assert.deepEqual(g.notaPendente.map(x => x.id).sort(),
  ['atrasado', 'hoje', 'longe', 'pago', 'semana', 'semdata'].sort(),
  'pago com nota pendente continua aparecendo — a nota ainda precisa sair');
assert(!g.notaPendente.some(x => x.id === 'semnota'), 'quem não pede nota fica fora');
assert(!g.notaPendente.some(x => x.id === 'comnota'), 'quem já emitiu também');

// totais somam saldo, e só do que está em aberto
assert.equal(g.totalVencido, 1000);
assert.equal(g.totalAberto, 7000, 'os 7 em aberto × 1000 — o pago não entra');

// a janela de "vencendo" é ajustável
assert.equal(FC_avisos([f('a', '2026-11-28')], HOJE, 7).aVencer.length, 1);
assert.equal(FC_avisos([f('a', '2026-11-28')], HOJE, 30).vencendo.length, 1);

// lista vazia não quebra
const z = FC_avisos([], HOJE);
assert.equal(z.emAberto.length, 0);assert.equal(z.totalAberto, 0);

// marcas do Will (24/11): adiada sai da conta; urgente e lembrete do dia vão para o topo, sem duplicar
const m = FC_avisos([
  f('adiada', '2026-11-10', { adiadoAte: '2026-12-01' }),
  f('adiadaVencida', '2026-11-10', { adiadoAte: '2026-11-19' }),   // a data chegou: volta
  f('urgente', '2026-11-25', { urgente: true }),
  f('lembrete', '2026-11-30', { lembreteData: '2026-11-19' }),
  f('lembreteFuturo', '2026-11-30', { lembreteData: '2026-11-28' }),
], HOJE);
assert.deepEqual(m.adiadas.map(x => x.id), ['adiada'], 'adiada até 01/12 fica só no bloco dela');
assert(m.vencidos.some(x => x.id === 'adiadaVencida'), 'chegou a data: volta como vencida');
assert.deepEqual(m.urgentes.map(x => x.id).sort(), ['lembrete', 'urgente'], 'urgente e lembrete do dia no topo');
assert(!m.vencendo.some(x => x.id === 'urgente') && !m.aVencer.some(x => x.id === 'lembrete'), 'sem aparecer duas vezes');
assert(m.aVencer.some(x => x.id === 'lembreteFuturo'), 'lembrete futuro segue no lugar normal');
assert.equal(m.totalVencido, 1000, 'a adiada não soma no vencido');

console.log('✅ avisos-vencimento: vencidos, vencendo, a vencer, sem data e nota pendente separados certo');
