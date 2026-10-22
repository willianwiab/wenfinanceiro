// AUDITORIA — fatura NOV26 do cartão Caixa (22/10/2026) com os DADOS REAIS do app da Caixa, em ?mock (só memória).
// App da Caixa: parcelas antigas R$ 2.090,92 + anuidade 12,50 + compras novas 3.079,14 (com o Google de R$ 2.000 de 19/10)
// − crédito 0,10 = R$ 5.182,46.
// O banco escreve a parcela no fim do texto ("03 03"); o WEN tem essas parcelas projetadas pelas faturas anteriores.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const cid = 'caixa2785'; CC_CARTOES[cid] = { nome: 'Caixa econômica', diaVencimento: 10, status: 'ativo' };
  OF_cfgCarregado = true; OF_cfg = { cartoes: { [cid]: 'accCx' }, pessoais: {}, contas: {}, passagem: [], regrasCat: {} };
  // parcelas projetadas pelo WEN (as 11 da prévia NOV26 = R$ 2.103,42)
  const proj = [['MP MERCADOLIVRE (Parcela 01 de 03) I Cartao 2785', 631.33, 2, 3, 'investimentos'], ['FAM CENTRO U MENSALIDA (Parcela 02 de 03) I Cartao 2785', 615.12, 3, 3, 'pessoal'],
    ['MERCADOLIVRE MERCADOLI (Parcela 01 de 02) I Cartao 2785', 239.28, 2, 2, 'investimentos'], ['EC MERCADOLIVRE (Parcela 01 de 03) I Cartao 2785', 145.95, 2, 3, ''],
    ['MERCADOLIVRE SERVISIGN (Parcela 02 de 03) I Cartao 2785', 109.99, 3, 3, 'servicos'], ['ASAAS IGREJA LUGAR (Parcela 01 de 02) I Cartao 2785', 101.06, 2, 2, 'retirada'],
    ['MP SERVISIGN (Parcela 02 de 03) I Cartao 2785', 86.06, 3, 3, 'investimentos'], ['ASAAS Igreja Alem d (Parcela 01 de 03) I Cartao 2785', 70.88, 2, 3, 'retirada'],
    ['MERCADOLIVRE ME (Parcela 01 de 02)', 67.00, 2, 2, 'servicos'], ['EBN CANVA (Parcela 06 de 12)', 24.25, 7, 12, 'servicos'], ['ANUIDADE (Parcela 11 de 12)', 12.50, 12, 12, 'cartoes']];
  C_parcelamentos.push(...proj.map(([d, v, n, t, c], i) => ({ id: 'px' + i, ativo: true, cartaoId: cid, mesInicio: OF_ymAdd('2026-11', -(n - 1)), parcelaAtual: n - 1, totalParcelas: t, valorParcela: v, descricao: d, categoria: c })));
  const somaPrev = () => Math.round(OF_itensPrevistos(cid).filter(it => it.mes === '2026-11').reduce((a, it) => a + it.valor, 0) * 100) / 100;
  // o que o banco devolve (app da Caixa, colado pelo Will) + o pagamento da fatura anterior que veio junto
  const L = [['2026-04-13', 'EBN CANVA04 07 12', 24.25], ['2026-08-18', 'FAM CENTRO U ME 03 03', 615.12], ['2026-08-24', 'MERCADOLIVRE SE 03 03', 109.99], ['2026-08-24', 'MP SERVISIGN 03 03', 86.06],
    ['2026-09-16', 'EC MERCADO 02 03', 145.95], ['2026-09-19', 'ASAAS IGREJA AL 02 03', 70.88], ['2026-09-19', 'MERCADOLIVRE ME 02 02', 67.00], ['2026-09-23', 'MP MERCADOLIVRE 02 03', 631.33],
    ['2026-09-24', 'MERCADOLIVRE ME 02 02', 239.28], ['2026-09-28', 'ASAAS IGREJA LU 02 02', 101.06], ['2026-09-29', 'UBER UBER TRIP HELP UBER', 86.96], ['2026-09-29', '99FOOD DEGUST PIZZAS', 66.14],
    ['2026-09-30', 'EC MELIMAIS', 9.90], ['2026-09-30', '99FOOD BURGER KING', 101.75], ['2026-09-30', 'IFD IFOOD', 12.90], ['2026-10-01', 'DL GOOGLE ADS688', 313.93], ['2026-10-01', 'DL GOOGLE WORKSPACEWE', 385.20],
    ['2026-10-01', '99FOOD BISTR FARIA L', 62.91], ['2026-10-01', 'MINIEXPRESS CONVENIENC', 39.45], ['2026-10-19', 'DL GOOGLE ADS688', 2000.00], ['2026-10-13', 'AJUSTE CRED PARC S JUROS', 0.10], ['2026-10-30', '12 PARCELA ANUIDADE', 12.50],
    ['2026-10-15', 'PGTO.BOLETO REGISTRADO', 10067.36]];
  const compras = L.map(([d, desc, v], i) => ({ fitid: 'f' + i, data: d, descricao: desc, valor: v }));
  const out = {};
  // CENÁRIO A — antes do rateio
  OF_abertas[cid] = { mes: '2026-11', compras, cats: {} };
  const kA = OF_classificarAberta(cid);
  out.A = { casadas: kA.casadas.size, pend: kA.pendentes.length, pendSoma: Math.round(kA.pendentes.reduce((a, c) => a + c.valor, 0) * 100) / 100, prev: somaPrev(), ign: kA.ignoradas.map(c => c.descricao) };
  // CENÁRIO B — como o Will fez: rateou TUDO o que apareceu (inclusive as parcelas antigas, o boleto e o ajuste)
  const cats = {}; compras.forEach(c => { cats[c.fitid] = /PGTO/.test(c.descricao) ? 'fora_pessoal' : /AJUSTE/.test(c.descricao) ? 'impostos' : 'servicos'; });
  OF_abertas[cid] = { mes: '2026-11', compras, cats };
  out.B = { prev: somaPrev(), pend: OF_pendentesAberta(cid).length };
  // CENÁRIO C — Pluggy manda o metadado da parcela (outro banco): mesmo resultado
  OF_abertas[cid] = { mes: '2026-11', compras: compras.map(c => { const p = OF_parcelaDoTexto(c.descricao); return p && p.total ? { ...c, descricao: c.descricao.replace(/\s\d{2}\s\d{2}$/, ''), parcela: p } : c; }), cats };
  out.C = { prev: somaPrev() };
  // CENÁRIO D — painel do cartão: total e aviso das parcelas já previstas
  OF_abertas[cid] = { mes: '2026-11', compras, cats: {} };
  OF_modal('<div id="ofCorpo"></div>', 760); OF_renderAberta(cid);
  out.D = (document.getElementById('ofModal') || {}).innerText || '';
  // CENÁRIO E — prévia no Pagar (C_sincronizarFaturasPrevias) com tudo rateado
  OF_abertas[cid] = { mes: '2026-11', compras, cats };
  C_sincronizarFaturasPrevias(cid);
  out.E = (P_meses['NOV/2026'] || []).filter(c => c.previa && c.faturaCartao && c.faturaCartao.cartaoId === cid).map(c => c.valor);
  return out;
});
await browser.close();
assert.deepEqual(erros, []);
// A: 11 linhas do banco são parcelas já projetadas; 9 compras novas esperam rateio; boleto fora
assert.equal(r.A.casadas, 11, 'as 10 parcelas "NN NN" + a anuidade casam com a projeção');
assert.equal(r.A.pend, 10); assert.equal(r.A.pendSoma, 3079.14, 'compras novas = R$ 3.079,14 (com o Google de R$ 2.000)');
assert.equal(r.A.prev, 2103.32, 'antes do rateio: parcelas 2.103,42 − crédito 0,10'); assert.deepEqual(r.A.ign, ['PGTO.BOLETO REGISTRADO']);
// B: com tudo rateado (como o Will fez), a prévia é EXATAMENTE a fatura do app da Caixa — sem contar parcela duas vezes
assert.equal(r.B.prev, 5182.46, 'prévia NOV26 = R$ 5.182,46 (app da Caixa)'); assert.equal(r.B.pend, 0);
assert.equal(r.C.prev, 5182.46, 'com metadado da parcela, o mesmo total');
assert.match(r.D, /Fatura de NOV26 até agora: R\$\s*5\.182,46/, 'painel: total = app da Caixa'); assert.match(r.D, /11 parcela\(s\) do banco já estavam na previsão/);
assert.deepEqual(r.E, [5182.46], 'conta prévia no Pagar = R$ 5.182,46');
console.log('✅ AUDITORIA Caixa NOV26 (dados reais): 11 parcelas casadas, 10 compras novas (3.079,14), boleto fora, crédito −0,10 → prévia R$ 5.182,46 = app da Caixa');
