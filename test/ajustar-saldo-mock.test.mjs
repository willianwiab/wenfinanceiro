// ⚖️ Ajustar saldo no WEN (22/10/2026), em ?mock: menu da conta tem a opção; abre a conferência com o saldo do banco
// (Open Finance) e o ajuste deixa o sistema igual ao banco; no fim da importação, o resumo oferece ajustar.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const H = new Date().toISOString().slice(0, 10);
  BC_CONTAS.cS = { nome: 'CAIXA WEN', banco: 'CAIXA', saldoConfigurado: true, saldoInicial: -38120.17, dataSaldoInicial: '2026-01-01', ativa: true };
  const out = { menu: /Ajustar saldo/.test(BC_cardHTML('cS')) };
  OF_cfgCarregado = true; OF_cfg = { cartoes: {}, pessoais: {}, contas: { cS: 'accCaixa' }, passagem: [], regrasCat: {} };
  OF_chamar = async c => c.acao === 'contas' ? { ok: true, contas: [{ id: 'accCaixa', tipo: 'BANK', saldo: 10452.5 }] }
    : { ok: true, conta: { saldo: 10452.5 }, pendentes: [], transacoes: [{ fitid: 'z1', data: H, valor: 100, descricao: 'PIX X' }] };
  await OF_ajustarSaldo('cS');
  out.preenchido = document.getElementById('bcConfBanco').value; out.linha = (document.getElementById('bcConfSub') || {}).innerText || '';
  await BC_criarAjuste();
  out.saldo = Math.round(BC_saldoConta('cS') * 100) / 100;
  // fim da importação: resumo oferece ajustar quando ainda não bate
  BC_CONTAS.cT = { nome: 'Outra', banco: 'X', saldoConfigurado: true, saldoInicial: 0, dataSaldoInicial: '2026-01-01', ativa: true };
  OF_cfg.contas.cT = 'accT';
  OF_chamar = async () => ({ ok: true, conta: { saldo: 999 }, pendentes: [], transacoes: [{ fitid: 'z2', data: H, valor: 100, descricao: 'PIX Y' }] });
  await CX_abrir(); document.getElementById('cxConta').value = 'cT'; document.getElementById('cxDe').value = H; document.getElementById('cxAte').value = H;
  await OF_trazerExtrato(); await CX_confirmar(); await new Promise(ok => setTimeout(ok, 200));
  out.resumo = (document.getElementById('cxResultado') || {}).innerText || '';
  return out;
});
await browser.close();
assert.deepEqual(erros, []);
assert.ok(r.menu, 'menu ⋯ da conta tem "⚖️ Ajustar saldo"');
assert.equal(r.preenchido, '10452.50', 'conferência abre com o saldo do banco'); assert.match(r.linha, /Saldo no banco agora/);
assert.equal(r.saldo, 10452.5, 'depois do ajuste, sistema = banco');
assert.match(r.resumo, /Ajustar saldo para o do banco/, 'fim da importação oferece ajustar'); assert.match(r.resumo, /diferença/);
console.log('✅ Ajustar saldo: no menu da conta, com o saldo do banco preenchido; ajuste iguala ao banco; resumo da importação oferece ajustar');
