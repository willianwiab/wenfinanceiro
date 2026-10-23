// Duplicidade no "Trazer extrato" (23/10/2026 — espelho do EX_montar do NS), em ?mock. O Will baixa o extrato 1x por
// semana e os períodos se sobrepõem: o que já foi tratado não pode entrar de novo.
//   1) linha JÁ CONCILIADA (mov gravada com sufixo da conta: mov_ofx_<conta>_<fitid>_<fixa>) → "já conciliada"
//   2) linha já importada (mesmo FITID) → "já importada"
//   3) já está na conta por OUTRO caminho (FITID diferente, mesma data+valor+descrição) → "já importada"
//   4) FITID do banco: duas compras iguais no mesmo dia são DUAS; só o FITID repetido no lote é duplicata
//   5) leitura por IA/PDF (sem FITID real): mesma data+valor+descrição no lote → "possível duplicidade"
// Confirmar lança SÓ as novas. Dados só em memória.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const H = new Date().toISOString().slice(0, 10);
  BC_CONTAS.cD = { nome: 'Studio Dup', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 0, dataSaldoInicial: '2026-01-01', ativa: true };
  const mv = (id, fitid, valor, desc) => ({ id, contaId: 'cD', tipo: valor < 0 ? 'saida' : 'entrada', valor: Math.abs(valor), data: H, descricao: desc, categoria: '', origemTipo: 'import', origemId: fitid, estornada: false });
  // estado depois do extrato da semana anterior
  BC_MOVS.push(mv('mov_ofx_cD_FIT1_fixaAluguel', 'FIT1', -6000, 'ALUGUEL STUDIO B'));   // conciliada com a conta do aluguel
  BC_MOVS.push(mv('mov_ofx_cD_FIT2', 'FIT2', -50, 'MERCADO DIA'));                        // importada como movimento
  BC_MOVS.push(mv('mov_ofx_cD_OUTRO77', 'OUTRO77', -12, 'PADARIA SAO JOSE'));             // veio por outro caminho
  const antes = BC_MOVS.filter(m => m.contaId === 'cD').length;
  await CX_abrir(); document.getElementById('cxConta').value = 'cD';
  // coluna do extrato (lado a lado) — com o filtro "Duplicidades" ela mostra só as repetidas
  const lista = () => { const g = document.querySelector('#cxResultado .cx-grid'); return g && g.children[0] ? g.children[0].innerText : ((document.getElementById('cxResultado') || {}).innerText || ''); };
  const confirmarTxt = () => ((document.getElementById('cxBtnConfirmar') || {}).innerText || '');
  const out = {};
  // extrato desta semana (repete dias da anterior)
  window.CX_montarDoBanco([
    { fitid: 'FIT1', data: H, valor: -6000, descricao: 'ALUGUEL STUDIO B' },
    { fitid: 'FIT2', data: H, valor: -50, descricao: 'MERCADO DIA' },
    { fitid: 'PLG_9', data: H, valor: -12, descricao: 'PADARIA SAO JOSE' },
    { fitid: 'FIT3', data: H, valor: -8, descricao: 'CAFE DA ESQUINA' },
    { fitid: 'FIT4', data: H, valor: -8, descricao: 'CAFE DA ESQUINA' },
    { fitid: 'FIT3', data: H, valor: -8, descricao: 'CAFE DA ESQUINA' },
    { fitid: 'FIT5', data: H, valor: -10, descricao: 'TARIFA PACOTE' }
  ], null);
  CX_setFiltro('duplicidades'); out.dups = lista();
  CX_setFiltro('todos'); out.todos = lista(); out.botao = confirmarTxt();
  await CX_confirmar(); await new Promise(ok => setTimeout(ok, 400));
  const novas = BC_MOVS.filter(m => m.contaId === 'cD').slice(antes);
  out.novas = novas.map(m => m.origemId + ':' + m.valor).sort();
  // leitura por IA/PDF: sem FITID real → a heurística data+valor+descrição pega a linha lida 2x
  await CX_abrir(); document.getElementById('cxConta').value = 'cD';
  window.CX_montarDoBanco([
    { fitid: 'ia_pdf_0_' + H + '_-3000', data: H, valor: -30, descricao: 'POSTO SHELL' },
    { fitid: 'ia_pdf_1_' + H + '_-3000', data: H, valor: -30, descricao: 'POSTO SHELL' }
  ], null);
  CX_setFiltro('duplicidades'); out.dupsIA = lista();
  return out;
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.match(r.dups, /ALUGUEL STUDIO B/, '1) a linha já conciliada vai para Duplicidades');
assert.match(r.dups, /MERCADO DIA/, '2) mesmo FITID → Duplicidades');
assert.match(r.dups, /PADARIA SAO JOSE/, '3) outro caminho (data+valor+descrição) → Duplicidades');
assert.equal((r.dups.match(/CAFE DA ESQUINA/g) || []).length, 1, '4) só o FIT3 repetido é duplicata; FIT4 (mesmo valor e dia) não');
assert.ok(!/TARIFA PACOTE/.test(r.dups), 'a linha nova não é duplicidade');
assert.ok(!/ALUGUEL STUDIO B|MERCADO DIA|PADARIA SAO JOSE/.test(r.todos), 'as repetidas não aparecem para conciliar/lançar');
assert.match(r.botao, /Confirmar 3 /, 'o botão confirma só 3');
assert.deepEqual(r.novas, ['FIT3:8', 'FIT4:8', 'FIT5:10'], 'confirmar lança só as novas (dois cafés + tarifa)');
assert.equal((r.dupsIA.match(/POSTO SHELL/g) || []).length, 1, '5) IA/PDF: a linha lida duas vezes vira 1 duplicidade');
console.log('✅ extrato semanal: já conciliada / já importada (FITID e outro caminho) ficam de fora; 2 cafés iguais = 2; IA lida 2x = 1 dup; só as novas lançadas');
