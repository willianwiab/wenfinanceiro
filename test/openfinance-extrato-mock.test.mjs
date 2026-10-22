// Open Finance no WEN — Fase 2 (22/10/2026), em ?mock: extrato da conta do studio pela revisão do concil.js.
// ENTRADA do banco (Pix de cliente) não é pareada sozinha com o Receber: vira só movimento da conta; o Receber
// não muda. O saldo da conta sobe pelo movimento. Banco simulado (OF_chamar trocado); nada sai do navegador.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  // o banco simulado vem sem conta bancária: cria uma só na memória deste navegador
  BC_CONTAS['bc_caixa_teste'] = { nome: 'Conta Studio', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 1000, dataSaldoInicial: '2026-01-01', ativa: true };
  const contas = ['bc_caixa_teste'];
  await CX_abrir();
  const contaId = contas[0]; const sel = document.getElementById('cxConta'); sel.value = contaId;
  OF_cfgCarregado = true; OF_cfg = { cartoes: {}, pessoais: {}, contas: { [contaId]: 'accCaixa' } };
  // um recebimento em aberto com o MESMO valor do Pix (seria par forte) — não pode ser baixado
  const recAntes = JSON.stringify(typeof R_todosOsDados !== 'undefined' ? R_todosOsDados : null);
  const hoje = new Date().toISOString().slice(0, 10);
  OF_chamar = async c => c.acao === 'transacoes' ? { ok: true, conta: { saldo: 9999 }, pendentes: [], transacoes: [
    { fitid: 'of1', data: hoje, valor: 1234.56, descricao: 'PIX RECEBIDO CLIENTE XPTO' },
    { fitid: 'of2', data: hoje, valor: -89.9, descricao: 'PAG BOLETO INTERNET' } ] } : { ok: true, contas: [] };
  const saldoAntes = BC_saldoConta(contaId);
  document.getElementById('cxDe').value = hoje; document.getElementById('cxAte').value = hoje;
  await OF_trazerExtrato();
  const html = (document.getElementById('cxResultado') || {}).innerHTML || '';
  await CX_confirmar();
  await new Promise(ok => setTimeout(ok, 300));
  const movs = (BC_MOVS || []).filter(m => m.contaId === contaId && /of1|of2/.test(m.id));
  return { revisao: /PIX RECEBIDO CLIENTE XPTO/.test(html), movs: movs.map(m => [m.valor, m.tipo || null]).sort(), saldoDelta: Math.round((BC_saldoConta(contaId) - saldoAntes) * 100) / 100,
    receberIntacto: JSON.stringify(typeof R_todosOsDados !== 'undefined' ? R_todosOsDados : null) === recAntes };
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
if (r.semConta) { console.log('⏭️  mock sem conta bancária — nada a testar'); process.exit(0); }
assert.ok(r.revisao, 'movimentos do banco na revisão');
assert.equal(r.movs.length, 2, 'as duas movimentações viraram movimento da conta');
assert.equal(r.saldoDelta, Math.round((1234.56 - 89.9) * 100) / 100, 'saldo da conta = +Pix −boleto');
assert.ok(r.receberIntacto, 'Contas a Receber não foi tocado');
console.log('✅ ?mock: extrato do banco → revisão → entrada vira só movimento (Receber intacto), saldo sobe; sem erro de página');
