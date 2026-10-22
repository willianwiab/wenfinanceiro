// Open Finance no WEN em ?mock (22/10/2026): carrega sem erro; "Trazer do banco" passa a fatura pelo leitor de OFX
// REAL do WEN e abre a revisão (IMP_previa), com o cartão pessoal avisando do reembolso. O banco é simulado.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const cid = 'cartao_teste_of';
  if (typeof CC_CARTOES !== 'undefined') CC_CARTOES[cid] = { nome: 'Nubank Will', final: '1234', diaVencimento: 28, status: 'ativo' };
  OF_cfg = { cartoes: { [cid]: 'accNu' }, pessoais: { [cid]: true } };
  OF_chamar = async (c) => c.acao === 'fatura' ? { ok: true, fatura: { vencimento: '2026-10-28', total: 1300 }, transacoes: [
    { fitid: 'a', data: '2026-10-02', descricao: 'ADOBE CREATIVE', valor: 300, tipo: 'DEBIT' },
    { fitid: 'b', data: '2026-10-05', descricao: 'MERCADO EXTRA', valor: 900, tipo: 'DEBIT' },
    { fitid: 'c', data: '2026-10-09', descricao: 'Pagamento recebido', valor: -500, pagamento: true },
    { fitid: 'd', data: '2026-10-10', descricao: 'UBER', valor: 100, tipo: 'DEBIT' } ] } : { ok: true, contas: [] };
  try { await C_ativar(); await OF_iniciar(); } catch (e) {}
  OF_cfg = { cartoes: { [cid]: 'accNu' }, pessoais: { [cid]: true } };   // depois do carregamento (que lê o banco simulado, vazio)
  if (typeof CC_CARTOES !== 'undefined') CC_CARTOES[cid] = { nome: 'Nubank Will', final: '1234', diaVencimento: 28, status: 'ativo' };   // idem
  const toasts = []; const _t = window.toast; window.toast = (m) => { toasts.push(String(m)); };
  const sel = document.getElementById('cImpCartao'); if (sel && ![...sel.options].some(o => o.value === cid)) { const o = document.createElement('option'); o.value = cid; o.textContent = 'Nubank Will'; sel.appendChild(o); }
  sel.value = cid; document.getElementById('cImpMes').value = '2026-10';
  await OF_trazerFatura();
  const compras0 = (IMP_previa || []).filter(m => !m.pagamento).map(m => [m.descricao, m.valor]);
  const aviso0 = (document.getElementById('cImpAviso2') || {}).innerText || '';
  // revisão: mercado é pessoal; o resto é do studio → confirmar
  (IMP_previa || []).forEach(m => { if (/MERCADO/.test(m.descricao)) m.categoria = 'fora_pessoal'; else if (!m.pagamento && !m.categoria) m.categoria = 'outros'; });
  const destinoAntes = IMP_destinoC;
  try { await C_importarDaPrevia(); } catch (e) { toasts.push('ERRO ' + e.message); }
  const out = (P_meses['OUT/2026'] || []).filter(c => c && c.faturaCartao && c.faturaCartao.cartaoId === cid);
  return { compras: compras0, destino: destinoAntes, contas: out.map(c => [c.nome, c.valor, !!c.reembolsoWill]),
    rateio: C_itensCartaoMesWen('OUT/2026').filter(i => /ADOBE|MERCADO|UBER/.test(i.desc)).map(i => i.desc).sort(),
    aviso: aviso0, faixa: typeof OF_htmlCartao === 'function' && OF_htmlCartao({ id: cid }).includes('pessoal → reembolso'), toasts };
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.equal(r.destino, true, 'confirmar vai para a fatura imutável');
assert.deepEqual(r.compras.map(c => c[0]).sort(), ['ADOBE CREATIVE', 'MERCADO EXTRA', 'UBER']);
assert.ok(r.compras.every(c => c[1] > 0), 'compras positivas (sinal normalizado pelo WEN)');
assert.match(r.aviso, /Cartão pessoal/); assert.ok(r.faixa, 'faixa "pessoal → reembolso" no cartão');
assert.deepEqual(r.contas, [['🔁 Reembolsar Will · Nubank Will · OUT/2026', 400, true]], 'só o reembolso (Adobe 300 + Uber 100), nenhuma conta de fatura');
assert.deepEqual(r.rateio, ['ADOBE CREATIVE', 'UBER'], 'rateio do studio sem o mercado pessoal');
console.log('✅ ?mock: fatura do banco → leitor OFX real do WEN → revisão; cartão pessoal avisa do reembolso; sem erro de página');
