// Revisão do extrato (22/10/2026): setas de mês sempre visíveis; na busca (cliente mensal / pagando atrasado),
// o resultado começa em "Todos os meses" e as setas filtram mês a mês. ?mock, dados só em memória.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  BC_CONTAS.cS = { nome: 'Studio', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 0, dataSaldoInicial: '2026-01-01', ativa: true };
  ['SET/2026', 'SET/2026', 'OUT/2026'].forEach((mes, i) => R_todosOsDados.push({ id: 'rID' + i, cliente: 'IRMÃOS DIAS', valor: 1200, saldo: 1200, valorReserva: 0, mes, data: (mes === 'SET/2026' ? '23/09/2026' : '23/10/2026') }));
  await CX_abrir(); document.getElementById('cxConta').value = 'cS';
  OF_cfgCarregado = true; OF_cfg = { cartoes: {}, pessoais: {}, contas: { cS: 'acc' }, passagem: [] };
  OF_chamar = async () => ({ ok: true, conta: {}, pendentes: [], transacoes: [{ fitid: 'p1', data: '2026-10-22', valor: 1200, descricao: 'PIX IRMAOS DIAS' }] });
  document.getElementById('cxDe').value = '2026-10-22'; document.getElementById('cxAte').value = '2026-10-22';
  await OF_trazerExtrato();
  const txt = () => (document.getElementById('cxResultado') || {}).innerText || '';
  const conta = () => (txt().match(/IRMÃOS DIAS/g) || []).length;
  const out = { semBusca: /‹/.test(txt()) && /›/.test(txt()) };
  CX_setBusca('irmãos dias'); out.todos = conta(); out.rotTodos = /Todos os meses/.test(txt());
  CX_setMesConcil(-1); out.mes1 = conta(); out.rot1 = (txt().match(/(setembro|outubro) de 2026/) || [''])[0];
  CX_setMesConcil(-1); out.mes2 = conta(); out.rot2 = (txt().match(/(setembro|outubro|agosto) de 2026/) || [''])[0];
  CX_buscaTodosMeses(); out.volta = conta();
  return out;
});
await browser.close();
assert.deepEqual(erros, []);
assert.ok(r.semBusca, 'setas visíveis sem busca');
// o nome também aparece no lado do extrato (sugestão): conta pela diferença entre os filtros
const lado = r.todos - 3;
assert.ok(r.rotTodos, 'busca começa em "Todos os meses"');
assert.equal(r.rot1, 'outubro de 2026'); assert.equal(r.mes1 - lado, 1, 'outubro: 1 recebimento');
assert.equal(r.rot2, 'setembro de 2026'); assert.equal(r.mes2 - lado, 2, 'setembro: 2 recebimentos');
assert.equal(r.volta, r.todos, '"todos os meses" volta ao resultado completo');
console.log('✅ busca de cliente mensal/atrasado: todos os meses → setas filtram outubro (1) e setembro (2) → volta a todos');
