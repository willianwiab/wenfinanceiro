// FECHAMENTO da fatura (22/10/2026) com os dados reais da Caixa NOV26, em ?mock (só memória):
// a fatura fechada chega do banco com o rateio já feito (compras em aberto confirmadas + parcelas projetadas), vira a
// fatura imutável de R$ 5.182,46, a prévia de NOV some e as próximas (DEZ R$ 872,41, JAN R$ 24,25) continuam.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  if (!CATS_P.investimentos) CATS_P.investimentos = { label: 'Investimentos', icon: '📈', color: '#3b82f6', bg: '#dbeafe' };   // existe no WEN do Will
  const cid = 'caixa2785'; CC_CARTOES[cid] = { nome: 'Caixa econômica', diaVencimento: 10, status: 'ativo' };
  OF_cfgCarregado = true; OF_cfg = { cartoes: { [cid]: 'accCx' }, pessoais: {}, contas: {}, passagem: [], regrasCat: {} };
  const proj = [['MP MERCADOLIVRE (Parcela 01 de 03)', 631.33, 2, 3, 'investimentos'], ['FAM CENTRO U MENSALIDA (Parcela 02 de 03)', 615.12, 3, 3, 'pessoal'],
    ['MERCADOLIVRE MERCADOLI (Parcela 01 de 02)', 239.28, 2, 2, 'investimentos'], ['EC MERCADOLIVRE (Parcela 01 de 03)', 145.95, 2, 3, 'outros'],
    ['MERCADOLIVRE SERVISIGN (Parcela 02 de 03)', 109.99, 3, 3, 'servicos'], ['ASAAS IGREJA LUGAR (Parcela 01 de 02)', 101.06, 2, 2, 'retirada'],
    ['MP SERVISIGN (Parcela 02 de 03)', 86.06, 3, 3, 'investimentos'], ['ASAAS Igreja Alem d (Parcela 01 de 03)', 70.88, 2, 3, 'retirada'],
    ['MERCADOLIVRE ME (Parcela 01 de 02)', 67.00, 2, 2, 'servicos'], ['EBN CANVA (Parcela 06 de 12)', 24.25, 7, 12, 'servicos'], ['ANUIDADE (Parcela 11 de 12)', 12.50, 12, 12, 'cartoes']];
  C_parcelamentos.push(...proj.map(([d, v, n, t, c], i) => ({ id: 'px' + i, ativo: true, cartaoId: cid, mesInicio: OF_ymAdd('2026-11', -(n - 1)), parcelaAtual: n - 1, totalParcelas: t, valorParcela: v, descricao: d, categoria: c })));
  const L = [['2026-04-13', 'EBN CANVA04 07 12', 24.25], ['2026-08-18', 'FAM CENTRO U ME 03 03', 615.12], ['2026-08-24', 'MERCADOLIVRE SE 03 03', 109.99], ['2026-08-24', 'MP SERVISIGN 03 03', 86.06],
    ['2026-09-16', 'EC MERCADO 02 03', 145.95], ['2026-09-19', 'ASAAS IGREJA AL 02 03', 70.88], ['2026-09-19', 'MERCADOLIVRE ME 02 02', 67.00], ['2026-09-23', 'MP MERCADOLIVRE 02 03', 631.33],
    ['2026-09-24', 'MERCADOLIVRE ME 02 02', 239.28], ['2026-09-28', 'ASAAS IGREJA LU 02 02', 101.06], ['2026-09-29', 'UBER UBER TRIP HELP UBER', 86.96], ['2026-09-29', '99FOOD DEGUST PIZZAS', 66.14],
    ['2026-09-30', 'EC MELIMAIS', 9.90], ['2026-09-30', '99FOOD BURGER KING', 101.75], ['2026-09-30', 'IFD IFOOD', 12.90], ['2026-10-01', 'DL GOOGLE ADS688', 313.93], ['2026-10-01', 'DL GOOGLE WORKSPACEWE', 385.20],
    ['2026-10-01', '99FOOD BISTR FARIA L', 62.91], ['2026-10-01', 'MINIEXPRESS CONVENIENC', 39.45], ['2026-10-19', 'DL GOOGLE ADS688', 2000.00], ['2026-10-30', '12 PARCELA ANUIDADE', 12.50]];
  // compras em aberto já rateadas pelo Will (mesmos ids do banco)
  const compras = [...L.map(([d, desc, v], i) => ({ fitid: 'f' + i, data: d, descricao: desc, valor: v })), { fitid: 'aj', data: '2026-10-13', descricao: 'AJUSTE CRED PARC S JUROS', valor: 0.10 }];
  const cats = {}; compras.forEach(c => { if (!OF_parcelaDoTexto(c.descricao)) cats[c.fitid] = /GOOGLE/.test(c.descricao) ? 'marketing' : 'outros'; });
  OF_abertas[cid] = { mes: '2026-11', compras, cats };
  C_sincronizarFaturasPrevias(cid);
  C_renderFaturas(); const listaAntes = (document.getElementById('cFaturasLista') || {}).innerText || '';
  const prev = wk => (P_meses[wk] || []).filter(c => c.previa && c.faturaCartao && c.faturaCartao.cartaoId === cid).map(c => c.valor);
  const out = { prevAntes: prev('NOV/2026'), dezAntes: prev('DEZ/2026'), janAntes: prev('JAN/2027'), listaAntes };
  // o banco fecha a fatura: mesmas transações (ids iguais), com o crédito e o pagamento da fatura anterior
  OF_chamar = async c => c.acao === 'fatura' ? { ok: true, fatura: { vencimento: '2026-11-10', total: 5182.46 }, transacoes: [
    ...L.map(([d, desc, v], i) => ({ fitid: 'f' + i, data: d, descricao: desc, valor: v, tipo: 'DEBIT', parcela: OF_parcelaDoTexto(desc) && OF_parcelaDoTexto(desc).total ? OF_parcelaDoTexto(desc) : null })),
    { fitid: 'aj', data: '2026-10-13', descricao: 'AJUSTE CRED PARC S JUROS', valor: -0.10, tipo: 'CREDIT' },
    { fitid: 'pg', data: '2026-10-15', descricao: 'PGTO.BOLETO REGISTRADO', valor: -10067.36, tipo: 'CREDIT', pagamento: true } ] } : { ok: true };
  try { await C_ativar(); } catch (e) {}
  // o C_ativar reconstrói as parcelas a partir das faturas (no ?mock não há as antigas): repõe as projeções da Caixa
  C_parcelamentos.splice(0, C_parcelamentos.length, ...proj.map(([d, v, n, t, c], i) => ({ id: 'px' + i, ativo: true, cartaoId: cid, mesInicio: OF_ymAdd('2026-11', -(n - 1)), parcelaAtual: n - 1, totalParcelas: t, valorParcela: v, descricao: d, categoria: c })));
  OF_cfg = { cartoes: { [cid]: 'accCx' }, pessoais: {}, contas: {}, passagem: [], regrasCat: {} }; OF_abertas[cid] = { mes: '2026-11', compras, cats };
  CC_CARTOES[cid] = { nome: 'Caixa econômica', diaVencimento: 10, status: 'ativo' };
  const sel = document.getElementById('cImpCartao'); if (![...sel.options].some(o => o.value === cid)) { const o = document.createElement('option'); o.value = cid; sel.appendChild(o); }
  sel.value = cid; document.getElementById('cImpMes').value = '2026-11';
  await OF_trazerFatura();
  const itens = (IMP_previa || []).filter(m => !m.pagamento);
  out.semCat = itens.filter(m => !m.categoria).map(m => m.descricao);
  out.catFam = (itens.find(m => /FAM CENTRO/.test(m.descricao)) || {}).categoria;
  out.catGoogle = (itens.find(m => /GOOGLE ADS688/.test(m.descricao) && Math.abs(m.valor) === 2000) || {}).categoria;
  await C_importarDaPrevia(); await new Promise(ok => setTimeout(ok, 200));
  const f = C_faturas.find(x => x.id === cid + '_2026-11');
  out.fatura = f ? Math.round(f.totalItens * 100) / 100 : null;
  C_sincronizarFaturasPrevias(cid);
  out.prevDepois = prev('NOV/2026'); out.dezDepois = prev('DEZ/2026'); out.janDepois = prev('JAN/2027');
  out.contaFatura = ((P_meses['NOV/2026'] || []).find(c => c.faturaId === cid + '_2026-11' && !c.previa) || {}).valor;
  C_renderFaturas(); out.lista = (document.getElementById('cFaturasLista') || {}).innerText || '';
  return out;
});
await browser.close();
assert.deepEqual(erros, []);
assert.deepEqual(r.prevAntes, [5182.46], 'antes de fechar: prévia NOV = 5.182,46');
assert.match(r.listaAntes, /NOV26[\s\S]*11 parcela\(s\) \+ 10 compra\(s\) em aberto[\s\S]*5\.182,46/, 'lista "Próximas" mostra 5.182,46 (parcelas + compras)'); assert.deepEqual(r.dezAntes, [872.41]); assert.deepEqual(r.janAntes, [24.25]);
assert.deepEqual(r.semCat, [], 'fatura fechada chega toda categorizada (compras confirmadas + parcelas projetadas)');
assert.equal(r.catFam, 'pessoal', 'parcela herda a categoria da parcela projetada'); assert.equal(r.catGoogle, 'marketing', 'compra nova herda o rateio confirmado');
assert.equal(r.fatura, 5182.46, 'fatura imutável = R$ 5.182,46 (app da Caixa)'); assert.equal(r.contaFatura, 5182.46, 'conta no Pagar = 5.182,46');
assert.deepEqual(r.prevDepois, [], 'prévia de NOV some (fatura real substitui)');
assert.deepEqual(r.dezDepois, [872.41], 'DEZ continua R$ 872,41'); assert.match(r.lista, /NOV26[\s\S]*imutável[\s\S]*5\.182,46/, 'lista: NOV26 imutável 5.182,46'); assert.deepEqual(r.janDepois, [24.25], 'JAN continua R$ 24,25');
console.log('✅ FECHAMENTO Caixa NOV26: fatura chega categorizada → imutável R$ 5.182,46 → prévia NOV some; DEZ R$ 872,41 e JAN R$ 24,25 continuam');
