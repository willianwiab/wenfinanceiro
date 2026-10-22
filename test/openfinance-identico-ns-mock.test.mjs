// WEN igual ao NS (22/10/2026), em ?mock:
//  EXTRATO — coluna "Contas do mês" mostra abertas + já pagas/recebidas não conciliadas; com movimento selecionado,
//            negativo → só Contas a Pagar, positivo → só Contas a Receber; par com conta já paga só LIGA.
//  CARTÃO  — painel "fatura se montando" (total, aguardando rateio, SophIA completa, NOVO, sugestão aprendida).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const out = {}, H = new Date().toISOString().slice(0, 10), WK = C_ymToWen(H.slice(0, 7));
  BC_CONTAS.cS = { nome: 'Studio', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 0, dataSaldoInicial: '2026-01-01', ativa: true };
  if (!P_meses[WK]) P_meses[WK] = [];
  P_meses[WK].push({ id: 'pAberta', nome: 'ZZ LUZ ABERTA', valor: 300, valorPago: 0, status: 'PENDENTE', dia: 10, categoria: 'consumo' });
  P_meses[WK].push({ id: 'pPaga', nome: 'ZZ CONTADOR PAGO', valor: 250, valorPago: 250, status: 'PAGO', dataPagamento: H, categoria: 'contabilidade' });
  R_todosOsDados.push({ id: 'rRec', cliente: 'ZZ CLIENTE RECEBIDO', valor: 999, valorReserva: 999, saldo: 0, mes: WK });
  R_todosOsDados.push({ id: 'rAb', cliente: 'ZZ CLIENTE ABERTO', valor: 500, valorReserva: 0, saldo: 500, mes: WK, data: H.split('-').reverse().join('/') });
  const recAntes = JSON.stringify(R_todosOsDados.filter(x => /^r(Rec|Ab)$/.test(x.id)));
  await CX_abrir(); document.getElementById('cxConta').value = 'cS';
  OF_cfgCarregado = true; OF_cfg = { cartoes: {}, pessoais: {}, contas: { cS: 'acc' }, passagem: [], regrasCat: {} };
  OF_chamar = async () => ({ ok: true, conta: {}, pendentes: [], transacoes: [{ fitid: 'e1', data: H, valor: -77.7, descricao: 'ALGO SEM PAR' }, { fitid: 'e2', data: H, valor: 12.3, descricao: 'ENTRADA SEM PAR' }] });
  document.getElementById('cxDe').value = H; document.getElementById('cxAte').value = H;
  await OF_trazerExtrato();
  const txt = () => (document.getElementById('cxResultado') || {}).innerText || '';
  const colD = () => { const g = document.querySelector('#cxResultado .cx-grid'); return g && g.children[1] ? g.children[1].innerText : ''; };   // só a coluna "Contas do mês" (o rodapé de pendentes também lista nomes)
  out.semSel = ['ZZ LUZ ABERTA', 'ZZ CONTADOR PAGO', 'ZZ CLIENTE RECEBIDO', 'ZZ CLIENTE ABERTO'].map(n => colD().includes(n));
  out.jaPagaRot = /já paga/.test(colD()) && /já recebido/.test(colD());
  CX_pickE('cx0');   // saída (−77,70)
  out.selNeg = ['ZZ LUZ ABERTA', 'ZZ CONTADOR PAGO', 'ZZ CLIENTE RECEBIDO', 'ZZ CLIENTE ABERTO'].map(n => colD().includes(n));
  // pareia a saída com a conta JÁ PAGA (contador): só liga
  CX_pickD('pagar|pPaga|' + H.slice(0, 7) + '|ja');
  CX_pickE('cx1');   // entrada (+12,30)
  out.selPos = ['ZZ LUZ ABERTA', 'ZZ CONTADOR PAGO', 'ZZ CLIENTE RECEBIDO', 'ZZ CLIENTE ABERTO'].map(n => colD().includes(n));
  CX_pickD('receber|rRec|' + H.slice(0, 7) + '|ja');
  await CX_confirmar(); await new Promise(ok => setTimeout(ok, 300));
  const pp = P_meses[WK].find(c => c.id === 'pPaga');
  out.contadorLig = !!pp.conciliadoMov && pp.valorPago === 250 && pp.status === 'PAGO';
  out.recIntacto = JSON.stringify(R_todosOsDados.filter(x => /^r(Rec|Ab)$/.test(x.id))) === recAntes;
  out.linksJa = Object.values(CONC_LINKS).filter(x => x.jaNoApp && (x.id === 'pPaga' || x.id === 'rRec')).length;
  // ── cartão: painel do NS ──
  const cid = 'cxCard'; CC_CARTOES[cid] = { nome: 'Caixa econômica', diaVencimento: 10, status: 'ativo' };
  OF_cfg.cartoes[cid] = 'accCard'; OF_cfg.regrasCat = { [OF_chaveDesc('DL GOOGLE ADS688')]: 'marketing' };
  OF_abertas[cid] = { mes: '2026-11', cats: {}, vistos: ['velho'], compras: [
    { fitid: 'velho', data: '2026-10-01', descricao: 'DL GOOGLE ADS123', valor: 313.93 }, { fitid: 'n1', data: '2026-10-02', descricao: 'Uber UBER TRIP HELP UBER', valor: 86.96 },
    { fitid: 'tot', data: '2026-09-30', descricao: 'TOTAL DA FATURA ANTERIOR', valor: 10250.6 } ] };
  OF_modal('<div id="ofCorpo"></div>', 760); OF_renderAberta(cid);
  const t2 = (document.getElementById('ofModal') || {}).innerText || '';
  out.card = { titulo: /Fatura de NOV26 até agora/.test(t2), total: /Total a sincronizar/.test(t2), sophia: /SophIA completa/.test(t2), novo: (t2.match(/NOVO/g) || []).length,
    semTotalAnterior: !/TOTAL DA FATURA ANTERIOR/.test(t2), sugerido: (document.querySelector('#ofModal select[data-of-fit="velho"]') || {}).value };
  await OF_confirmarAberta(cid);
  out.card.cats = OF_abertas[cid].cats; out.card.aprendeu = OF_cfg.regrasCat[OF_chaveDesc('DL GOOGLE ADS123')];
  return out;
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.deepEqual(r.semSel, [true, true, true, true], 'sem seleção: abertas + já pagas/recebidas aparecem');
assert.ok(r.jaPagaRot, '"já paga"/"já recebido" identificados');
assert.deepEqual(r.selNeg, [true, true, false, false], 'saída selecionada: só Contas a Pagar');
assert.deepEqual(r.selPos, [false, false, true, true], 'entrada selecionada: só Contas a Receber');
assert.ok(r.contadorLig, 'conta já paga: ligada sem baixar de novo'); assert.equal(r.linksJa, 2, 'contador e cliente recebido ligados');
assert.ok(r.recIntacto, 'Contas a Receber intocado');
assert.ok(r.card.titulo && r.card.total && r.card.sophia, 'painel do cartão no padrão do NS');
assert.equal(r.card.novo, 1, 'NOVO só na compra que ainda não foi vista'); assert.ok(r.card.semTotalAnterior, '"TOTAL DA FATURA ANTERIOR" fora');
assert.equal(r.card.sugerido, 'marketing', 'categoria aprendida já vem sugerida');
assert.deepEqual(r.card.cats, { velho: 'marketing' }, 'só a com categoria entra na previsão'); assert.equal(r.card.aprendeu, 'marketing');
console.log('✅ ?mock igual ao NS: coluna com abertas + já pagas/recebidas, filtro por sinal, ligar sem baixar de novo; painel do cartão (total, SophIA, NOVO, sugestão aprendida, sem "total da fatura anterior")');
