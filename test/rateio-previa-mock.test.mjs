// Rateio direto no detalhe da PRÉVIA (22/10/2026, espelho do C_mudarCatPrevia do NS), em ?mock (só memória):
// compra em aberto → OF_abertas.cats; parcela projetada → o parcelamento. Sem "parc null/null" na compra avulsa.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2];
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const cid = 'cx1'; CC_CARTOES[cid] = { nome: 'Caixa', diaVencimento: 10, status: 'ativo' };
  OF_cfgCarregado = true; OF_cfg = { cartoes: { [cid]: 'acc' }, pessoais: {}, contas: {}, passagem: [], regrasCat: {} };
  C_parcelamentos.push({ id: 'pz', ativo: true, cartaoId: cid, mesInicio: '2026-10', parcelaAtual: 1, totalParcelas: 3, valorParcela: 145.95, descricao: 'EC MERCADOLIVRE (Parcela 01 de 03)', categoria: '' });
  OF_abertas[cid] = { mes: '2026-11', compras: [{ fitid: 'g1', data: '2026-10-01', descricao: 'DL GOOGLE ADS688', valor: 313.93 }], cats: { g1: 'outros' } };
  C_sincronizarFaturasPrevias(cid); C_faturaAberta = null; C_previaAberta = cid + '|2026-11'; C_renderDetalhe();
  const box = document.getElementById('cFatDetalhe');
  const out = { selects: box.querySelectorAll('select.pi-cat-sel').length, texto: box.innerText };
  await C_mudarCatPrevia('a:g1', 'marketing'); await C_mudarCatPrevia('p:pz', 'servicos');
  out.catAberta = OF_abertas[cid].cats.g1; out.catParc = C_parcelamentos.find(p => p.id === 'pz').categoria;
  C_previaAberta = cid + '|2026-11'; C_faturaAberta = null; C_renderDetalhe();
  out.cats = C_parcelasDaPrevia(cid, '2026-11').map(i => i.categoria).sort();
  return out;
});
await browser.close();
assert.deepEqual(erros, []);
assert.equal(r.selects, 2, 'parcela e compra em aberto com seletor de categoria');
assert.doesNotMatch(r.texto, /null/, 'sem "parc null/null"');
assert.equal(r.catAberta, 'marketing'); assert.equal(r.catParc, 'servicos');
assert.deepEqual(r.cats, ['marketing', 'servicos'], 'prévia reflete o rateio novo');
console.log('✅ Rateio na prévia: compra em aberto e parcela projetada editáveis no detalhe; sem "parc null/null"');
