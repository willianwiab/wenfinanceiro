// Janela de detalhes do Resumo Executivo do Receber (23/10/2026 — espelho do DP_ do NS), em ?mock.
// "✅ Recebido" e "🔴 A Receber" viram link; a janela lista os clientes (soma por cliente), o total bate com o
// número do card, e NADA no Receber é gravado ou alterado (Receber é só leitura). Dados só em memória.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const MES = 'DEZ/2031';   // mês só deste teste
  const lanc = (id, cliente, total, recebido) => ({ id, cliente, mes: MES, valorTotal: total, valorReserva: recebido, saldo: total - recebido, horas: 2, data: '10/12/2031' });
  R_todosOsDados.push(lanc('dpA1', 'CLIENTE ALFA', 1000, 1000), lanc('dpA2', 'CLIENTE ALFA', 500, 500),   // quitado (2 gravações)
    lanc('dpB1', 'CLIENTE BETA', 2000, 800),                                                                   // pago em parte, falta 1.200
    lanc('dpC1', 'CLIENTE GAMA', 700, 0));                                                                     // não pagou nada
  const antes = JSON.stringify(R_todosOsDados);
  R_mesAtual = MES; renderDashboardR();
  const card = lbl => { const it = [...document.querySelectorAll('#rResumoExec .re-item')].find(x => x.querySelector('label').textContent.includes(lbl)); return it ? it.querySelector('.rev') : null; };
  const out = {};
  out.cardRec = card('Recebido').innerText.trim(); out.linkRec = !!card('Recebido').querySelector('button.dp-link');
  out.cardAR = card('A Receber').innerText.trim(); out.linkAR = !!card('A Receber').querySelector('button.dp-link');
  out.cardsBaixo = ['recebido', 'aberto'].map(c => !!document.querySelector('.card-r.' + c + ' button.dp-link'));
  card('Recebido').querySelector('button').click();
  const m = document.getElementById('modalDetalhePainel');
  out.abriu = m.classList.contains('open'); out.tituloRec = document.getElementById('dpTitulo').textContent;
  out.totRec = m.querySelector('.dp-total b').innerText.trim(); out.rowsRec = [...m.querySelectorAll('.dp-row')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); out.fechouEsc = !m.classList.contains('open');
  card('A Receber').querySelector('button').click();
  out.tituloAR = document.getElementById('dpTitulo').textContent;
  out.totAR = m.querySelector('.dp-total b').innerText.trim(); out.rowsAR = [...m.querySelectorAll('.dp-row')].map(x => x.innerText.replace(/\s+/g, ' ').trim());
  DP_fechar();
  out.intacto = JSON.stringify(R_todosOsDados) === antes;
  return out;
});
await browser.close();
assert.deepEqual(erros, [], 'sem erro de página');
assert.ok(r.linkRec && r.linkAR, 'os dois valores viraram link');
assert.deepEqual(r.cardsBaixo, [true, true], 'os cards de baixo (Recebido / A Receber) também abrem a janela');
assert.ok(r.abriu, 'clicar abre a janela'); assert.match(r.tituloRec, /Recebido em DEZ\/2031/);
assert.equal(r.totRec, r.cardRec, 'total da janela = número do card (Recebido)');
assert.equal(r.rowsRec.length, 2, 'só quem pagou: ALFA e BETA');
assert.match(r.rowsRec[0], /CLIENTE ALFA.*2 gravações · quitado.*1\.500,00/, 'ALFA: soma das 2 gravações, quitado, maior primeiro');
assert.match(r.rowsRec[1], /CLIENTE BETA.*pago em parte · falta R\$\s*1\.200,00.*800,00/);
assert.ok(r.fechouEsc, 'Esc fecha');
assert.match(r.tituloAR, /A receber em DEZ\/2031/);
assert.equal(r.totAR, r.cardAR, 'total da janela = número do card (A Receber)');
assert.equal(r.rowsAR.length, 2, 'só quem deve: BETA e GAMA');
assert.match(r.rowsAR[0], /CLIENTE BETA.*1 lançamento em aberto · já pagou R\$\s*800,00.*1\.200,00/);
assert.match(r.rowsAR[1], /CLIENTE GAMA.*1 lançamento em aberto.*700,00/);
assert.ok(r.intacto, 'Receber intocado');
console.log('✅ painel do Receber: Recebido e A Receber abrem a lista por cliente, total = card, Esc fecha, Receber intacto');
