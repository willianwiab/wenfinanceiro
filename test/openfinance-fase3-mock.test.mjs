// Open Finance no WEN — Fase 3 (22/10/2026), em ?mock: extrato com ligar completo, passagem e refazer ajuste.
// Tudo em memória deste navegador (conta de teste criada aqui); banco simulado; nada sai do navegador.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());   // as confirmações do app (ligar, refazer…) — o teste aceita
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const H = new Date().toISOString().slice(0, 10), MES = (typeof mesAtualReal === 'function' ? mesAtualReal() : null) || Object.keys(P_meses || {})[0];
  BC_CONTAS.cA = { nome: 'Studio', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 1000, dataSaldoInicial: '2026-01-01', ativa: true };
  BC_CONTAS.cB = { nome: 'Outra', banco: 'Inter', saldoConfigurado: true, saldoInicial: 1000, dataSaldoInicial: '2026-01-01', ativa: true };
  OF_cfgCarregado = true; OF_cfg = { cartoes: {}, pessoais: {}, contas: { cA: 'accCaixa' }, passagem: [] };
  if (!P_meses[MES]) P_meses[MES] = [];
  const conta = (id, nome, valor, contaId) => { const c = { id, nome, valor, valorPago: valor, status: 'PAGO', dataPagamento: H, contaBancariaId: contaId, categoria: 'servicos' }; P_meses[MES].push(c); BC_syncMovPagar(c); return c; };
  const ext = (fit, contaId, valor, desc) => { CX_criarMov(contaId, fit, '', valor, H, desc, ''); };
  conta('pLuz', 'Luz', 300, 'cA'); ext('f1', 'cA', -300, 'DEB LUZ');                 // duplicado exato
  conta('pNet', 'Internet', 100, 'cA'); ext('f2', 'cA', -110, 'PAG INTERNET');        // próximo (+10)
  conta('pEsc', 'Escola', 900, 'cB'); ext('f3', 'cA', -900, 'PIX ESCOLA');            // conta errada
  ext('f4', 'cA', 6100, 'Valor adicionado para PIX no Crédito'); ext('f5', 'cA', -1000, 'Aplicação RDB');
  BC_MOVS.push({ id: 'aj1', contaId: 'cA', tipo: 'ajuste', valor: -500, data: H, descricao: '⚖️ ajuste antigo', origemTipo: 'ajuste', estornada: false });
  const S = () => Math.round(BC_saldoConta('cA') * 100) / 100, SB = () => Math.round(BC_saldoConta('cB') * 100) / 100;
  const out = { s0: S(), sb0: SB() };
  const cix = () => BC_concilIndice();
  const mv = id => BC_MOVS.find(m => m.id === id);
  out.estLuz = OF_estado(mv('mov_pagar_pLuz'), cix()); out.passagem = [OF_mpDoMov(mv('mov_ofx_cA_f4')), OF_mpDoMov(mv('mov_ofx_cA_f5'))];
  const rs = OF_resumoMes(BC_movsDaConta('cA'), H.slice(0, 7)); out.studioSai = rs.sai; out.foraEnt = rs.foraEnt;
  out.sug = OF_paresSugeridos('cA', BC_MOVS, cix()).map(p => p.e.id);
  await OF_ligarSugeridos('cA'); out.s1 = S(); out.estLuz2 = OF_estado(mv('mov_pagar_pLuz'), cix());
  await OF_ligarMov('mov_pagar_pNet', 'mov_ofx_cA_f2'); out.s2 = S();
  await OF_moverELigar('mov_pagar_pEsc', 'mov_ofx_cA_f3'); out.s3 = S(); out.sb3 = SB(); out.escConta = P_meses[MES].find(c => c.id === 'pEsc').contaBancariaId;
  const chNet = Object.keys(CONC_LINKS).find(k => CONC_LINKS[k].ligadoExtrato && CONC_LINKS[k].id === 'pNet');
  await OF_desligar(chNet); out.s4 = S();
  // banco ao vivo: saldo diferente do sistema + ajuste antigo → refazer
  OF_extratoBanco.cA = { saldo: 123.45, novos: [], pendentes: 0 };
  out.banner = /ficou desatualizado/.test(OF_htmlRefazer('cA'));
  BC_abrirExtrato('cA'); await new Promise(ok => setTimeout(ok, 50));
  out.topo = (document.getElementById('bcExtratoOF') || {}).innerHTML || ''; out.lista = (document.getElementById('bcExtratoLista') || {}).innerHTML || '';
  await OF_refazerAjuste('cA'); out.ajEstornado = !!mv('aj1').estornada; out.confPreenchido = (document.getElementById('bcConfBanco') || {}).value;
  // 🔄 Sincronizar com o banco: abre, consulta o banco (simulado) e mostra o que é novo
  OF_chamar = async c => c.acao === 'transacoes' ? { ok: true, conta: { saldo: 777, itemId: 'itC' }, pendentes: [], transacoes: [{ fitid: 'novo1', data: H, valor: -45, descricao: 'PADARIA' }, { fitid: 'f1', data: H, valor: -300, descricao: 'DEB LUZ' }] }
    : c.acao === 'conexoes' ? { ok: true, conexoes: [{ itemId: 'itC', atualizadoEm: new Date(Date.now() - 2 * 3600e3).toISOString() }] } : { ok: true };
  await OF_abrirSync(); await new Promise(ok => setTimeout(ok, 50));
  out.sync = (document.getElementById('ofModal') || {}).innerText || '';
  out.novos = (OF_extratoBanco.cA.novos || []).map(t => t.fitid);
  return out;
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.equal(r.estLuz, 'sempar'); assert.deepEqual(r.passagem, ['credito', 'caixinha']);
assert.equal(r.studioSai, 1710, 'studio: saídas que não são passagem (antes de ligar, as duplicadas ainda contam)'); assert.equal(r.foraEnt, 6100, 'Pix no Crédito fora do studio');
assert.deepEqual(r.sug, ['mov_ofx_cA_f1'], 'sugerido só o par exato e único (Luz)');
assert.equal(r.s1, Math.round((r.s0 + 300) * 100) / 100, 'ligar a Luz tira a duplicidade (+300)'); assert.equal(r.estLuz2, 'conciliado');
assert.equal(r.s2, Math.round((r.s1 + 110 - 10) * 100) / 100, 'ligar com diferença: extrato sai, diferença de 10 entra — saldo = banco');
assert.equal(r.s3, r.s2, 'mover e ligar: na Caixa, o Pix do extrato vira a baixa da Escola (saldo igual)');
assert.equal(r.sb3, Math.round((r.sb0 + 900) * 100) / 100, '…e sai da Inter (estava lançada lá)'); assert.equal(r.escConta, 'cA');
assert.equal(r.s4, r.s1, 'desfazer a ligação da Internet volta exatamente ao que era');
assert.ok(r.banner, 'ajuste desatualizado avisado'); assert.match(r.topo, /No banco/); assert.match(r.lista, /pago no sistema, sem par no banco|crédito do cartão/);
assert.equal(r.ajEstornado, true); assert.equal(r.confPreenchido, '123.45', 'conferência abre com o saldo do banco');
assert.match(r.sync, /Sincronizar com o banco/); assert.match(r.sync, /1 novo\(s\) no banco/); assert.deepEqual(r.novos, ['novo1'], 'só o que ainda não está no sistema (o f1 já foi importado)');
console.log('✅ ?mock Fase 3: ligar exato/sugerido, próximo (diferença vira ajuste), mover e ligar, desfazer, passagem, refazer ajuste — saldos certos');
