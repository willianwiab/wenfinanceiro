// Recebido em PARTE (22/10/2026 — "Histórias de Orlando"), em ?mock: a coluna mostra a parte ABERTA e a parte JÁ
// RECEBIDA ainda não ligada; ligar o Pix à parte recebida tira só ela; a aberta continua; Receber intocado;
// e o que foi conciliado aparece no filtro "Conciliadas". Dados só em memória.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
page.on('dialog', d => d.accept());
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const H = new Date().toISOString().slice(0, 10), WK = C_ymToWen(H.slice(0, 7)), MNS = H.slice(0, 7);
  BC_CONTAS.cS = { nome: 'Studio', banco: 'Caixa', saldoConfigurado: true, saldoInicial: 0, dataSaldoInicial: '2026-01-01', ativa: true };
  R_todosOsDados.push({ id: 'rOrl', cliente: 'HISTÓRIAS DE ORLANDO', valor: 3000, valorReserva: 1000, saldo: 2000, mes: WK, data: H.split('-').reverse().join('/') });
  const recAntes = JSON.stringify(R_todosOsDados.find(x => x.id === 'rOrl'));
  await CX_abrir(); document.getElementById('cxConta').value = 'cS';
  OF_cfgCarregado = true; OF_cfg = { cartoes: {}, pessoais: {}, contas: { cS: 'acc' }, passagem: [], regrasCat: {} };
  OF_chamar = async () => ({ ok: true, conta: {}, pendentes: [], transacoes: [{ fitid: 'pix1', data: H, valor: 1000, descricao: 'PIX RECEBIDO ORLANDO' }] });
  document.getElementById('cxDe').value = H; document.getElementById('cxAte').value = H;
  await OF_trazerExtrato();
  const colD = () => { const g = document.querySelector('#cxResultado .cx-grid'); return g && g.children[1] ? g.children[1].innerText : ''; };
  const out = {};
  CX_setFiltroConcil('aconciliar'); out.antes = colD();
  CX_pickE('cx0'); CX_pickD('receber|rOrl|' + MNS + '|ja');   // liga à parte já recebida
  await CX_confirmar(); await new Promise(ok => setTimeout(ok, 300));
  // reabre a revisão para ver o estado depois de confirmar
  OF_chamar = async () => ({ ok: true, conta: {}, pendentes: [], transacoes: [{ fitid: 'pix2', data: H, valor: 500, descricao: 'PIX ORLANDO 2' }] });
  await CX_abrir(); document.getElementById('cxConta').value = 'cS'; document.getElementById('cxDe').value = H; document.getElementById('cxAte').value = H;
  await OF_trazerExtrato();
  CX_setFiltroConcil('aconciliar'); out.depoisAConciliar = colD();
  CX_setFiltroConcil('conciliada'); out.depoisConciliadas = colD();
  out.recIntacto = JSON.stringify(R_todosOsDados.find(x => x.id === 'rOrl')) === recAntes;
  out.link = Object.values(CONC_LINKS).filter(x => x.jaNoApp && x.id === 'rOrl').map(x => x.valorLigado);
  return out;
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.match(r.antes, /HISTÓRIAS DE ORLANDO[\s\S]*R\$\s*2\.000,00/, 'parte aberta (2.000) aparece');
assert.match(r.antes, /já recebido \(parte não ligada\)/, 'parte já recebida aparece'); assert.match(r.antes, /R\$\s*1\.000,00/);
assert.deepEqual(r.link, [1000], 'ligou 1.000 (só o Pix)');
assert.ok(!/já recebido/.test(r.depoisAConciliar), 'a parte recebida já ligada não aparece mais em "a conciliar"');
assert.match(r.depoisAConciliar, /R\$\s*2\.000,00/, 'a parte aberta continua para o próximo Pix');
assert.match(r.depoisConciliadas, /HISTÓRIAS DE ORLANDO[\s\S]*conciliada antes/, 'filtro "Conciliadas" mostra o que já foi conciliado');
assert.ok(r.recIntacto, 'Contas a Receber intocado');
console.log('✅ recebido em parte: aberta (2.000) + já recebida (1.000) → liga o Pix à recebida → aberta continua; "Conciliadas" mostra; Receber intacto');
