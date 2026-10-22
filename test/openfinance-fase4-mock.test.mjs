// Open Finance no WEN — Fase 4 (22/10/2026), em ?mock: cartão igual ao NS (compras em aberto → prévia só com
// rateio confirmado; cartão pessoal = "Reembolsar Will (prévia)" só do studio) e extrato que liga com o que JÁ
// está pago/recebido. Tudo em memória deste navegador; banco simulado.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const out = {};
  // ── cartão pessoal ──
  const cid = 'nuTeste'; CC_CARTOES[cid] = { nome: 'Nubank Will', diaVencimento: 28, status: 'ativo' };
  OF_cfgCarregado = true; OF_cfg = { cartoes: { [cid]: 'accNu' }, pessoais: { [cid]: true }, contas: {}, passagem: [] };
  C_faturas.push({ id: cid + '_2026-10', cartaoId: cid, mesFatura: '2026-10', totalItens: 500, fechada: true, itens: [{ fitid: 'PLGjaFat', dataCompra: '2026-09-25', descricao: 'JA NA FATURA', valor: 80, categoria: 'servicos' }] });
  OF_abertas[cid] = { mes: '2026-11', cats: { a: 'servicos', b: 'fora_pessoal', c: 'servicos', jaFat: 'servicos', bol: 'fora_pessoal', aj: 'impostos' }, compras: [
    { fitid: 'bol', data: '2026-10-15', descricao: 'PGTO.BOLETO REGISTRADO', valor: 10067.36 }, { fitid: 'aj', data: '2026-10-13', descricao: 'AJUSTE CRED PARC S/ JUROS', valor: 0.1 }, { fitid: 'bol2', data: '2026-10-16', descricao: 'PGTO BOLETO', valor: 50 },
    { fitid: 'a', data: '2026-10-20', descricao: 'ADOBE', valor: 200 }, { fitid: 'b', data: '2026-10-21', descricao: 'MERCADO', valor: 300 },
    { fitid: 'c', data: '2026-10-22', descricao: 'LOJA', valor: 100, parcela: { atual: 2, total: 3 } }, { fitid: 'd', data: '2026-10-23', descricao: 'SEM RATEIO', valor: 50 },
    { fitid: 'jaFat', data: '2026-09-25', descricao: 'JA NA FATURA', valor: 80 }, { fitid: 'pg', data: '2026-10-15', descricao: 'Pagamento recebido', valor: -500 } ] };
  C_sincronizarFaturasPrevias(cid);
  const prev = wk => (P_meses[wk] || []).filter(c => c.previa && c.faturaCartao && c.faturaCartao.cartaoId === cid).map(c => [c.nome, c.valor, !!c.reembolsoWill]);
  out.nov = prev('NOV/2026'); out.dez = prev('DEZ/2026');
  out.pend = OF_pendentesAberta(cid).map(c => c.fitid);
  out.rateioNov = C_itensCartaoMesWen('NOV/2026').filter(i => /ADOBE|MERCADO|LOJA|SEM RATEIO/.test(i.desc)).map(i => i.desc).sort();
  // ── extrato: já pago / já recebido ──
  BC_CONTAS.cS = { nome: 'Studio', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 1000, dataSaldoInicial: '2026-01-01', ativa: true };
  const H = new Date().toISOString().slice(0, 10), WK = C_ymToWen(H.slice(0, 7)); if (!P_meses[WK]) P_meses[WK] = [];
  P_meses[WK].push({ id: 'pSemConta', nome: 'Contador', valor: 250, valorPago: 250, status: 'PAGO', dataPagamento: H, categoria: 'contabilidade' });
  const pCom = { id: 'pComConta', nome: 'Aluguel', valor: 300, valorPago: 300, status: 'PAGO', dataPagamento: H, contaBancariaId: 'cS', categoria: 'aluguel' }; P_meses[WK].push(pCom); BC_syncMovPagar(pCom);
  if (typeof R_todosOsDados !== 'undefined') R_todosOsDados.push({ id: 'rJa', cliente: 'CLIENTE XPTO', valor: 1234.56, valorReserva: 1234.56, saldo: 0, mes: WK });
  const recAntes = JSON.stringify(R_todosOsDados.find(x => x.id === 'rJa'));
  const S = () => Math.round(BC_saldoConta('cS') * 100) / 100; out.s0 = S();
  await CX_abrir(); document.getElementById('cxConta').value = 'cS'; OF_cfg.contas.cS = 'accCaixa';
  OF_chamar = async c => c.acao === 'transacoes' ? { ok: true, conta: { saldo: null }, pendentes: [], transacoes: [
    { fitid: 'x1', data: H, valor: -250, descricao: 'PIX CONTADOR' }, { fitid: 'x2', data: H, valor: -300, descricao: 'ALUGUEL' }, { fitid: 'x3', data: H, valor: 1234.56, descricao: 'PIX RECEBIDO XPTO' } ] } : { ok: true };
  document.getElementById('cxDe').value = H; document.getElementById('cxAte').value = H;
  await OF_trazerExtrato();
  out.badges = ((document.getElementById('cxResultado') || {}).innerText.match(/já está no sistema/g) || []).length;
  await CX_confirmar(); await new Promise(ok => setTimeout(ok, 300));
  out.s1 = S();
  const mv = id => BC_MOVS.find(m => m.id === id);
  out.x1 = { existe: !!mv('mov_ofx_cS_x1'), estorn: !!(mv('mov_ofx_cS_x1') || {}).estornada, link: !!CONC_LINKS['conc_mov_ofx_cS_x1'] };
  out.x2 = { estorn: !!(mv('mov_ofx_cS_x2') || {}).estornada, link: !!CONC_LINKS['conc_mov_ofx_cS_x2'] };
  out.x3 = { estorn: !!(mv('mov_ofx_cS_x3') || {}).estornada, link: !!CONC_LINKS['conc_mov_ofx_cS_x3'] };
  out.recIntacto = JSON.stringify(R_todosOsDados.find(x => x.id === 'rJa')) === recAntes;
  out.contadorConc = (P_meses[WK].find(c => c.id === 'pSemConta') || {}).conciliadoMov;
  return out;
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.deepEqual(r.nov, [['🔁 Reembolsar Will · Nubank Will (prévia) · NOV/2026', 299.9, true]], 'NOV: Adobe 200 + Loja 2/3 100 − crédito 0,10 (sem Mercado pessoal, sem a não confirmada, sem a que já está na fatura, sem os boletos)');
assert.deepEqual(r.dez, [['🔁 Reembolsar Will · Nubank Will (prévia) · DEZ/2026', 100, true]], 'DEZ: Loja 3/3');
assert.deepEqual(r.pend, ['d'], 'só a sem rateio fica esperando confirmação');
assert.deepEqual(r.rateioNov, ['ADOBE', 'LOJA'], 'rateio do studio em NOV sem o pessoal');
assert.equal(r.badges, 3, 'os três aparecem como "já está no sistema"');
assert.equal(r.s1, Math.round((r.s0 - 250 + 1234.56) * 100) / 100, 'saldo: contador (pago sem banco) sai uma vez; aluguel não duplica; Pix do cliente entra');
assert.deepEqual(r.x1, { existe: true, estorn: false, link: true }, 'pago sem banco: o movimento do extrato fica e é ligado');
assert.deepEqual(r.x2, { estorn: true, link: true }, 'pago com banco: a linha do extrato é estornada (a baixa já debitou)');
assert.deepEqual(r.x3, { estorn: false, link: true }, 'recebido: movimento fica e é ligado');
assert.ok(r.recIntacto, 'Contas a Receber intocado'); assert.equal(r.contadorConc, 'mov_ofx_cS_x1');
console.log('✅ ?mock Fase 4: prévia do cartão igual ao NS (reembolso só do studio, parcela projetada, só confirmadas) + extrato liga com já pago/recebido sem duplicar');
