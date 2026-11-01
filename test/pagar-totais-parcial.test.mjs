// Totais do A Pagar com pagamento PARCIAL (auditoria 01/11/2026) — roda 100% em ?mock=1.
//
// O bug: todo total do módulo Pagar calculava "pago" como
//     filter(status === 'PAGO').reduce(valor)
// ou seja, uma conta PARCIAL (R$ 600 com R$ 250 já pagos) entrava com ZERO em "Pago" e com
// o valor CHEIO em "A Pagar". O detalhe da tela já sabia a conta certa — `DP_pagarItens` usa
// `valor − valorPago`, e `simulacao.js` também ("parcial conta só o que falta"). Só os totais
// é que não sabiam, e o popup do card chegava a imprimir um pedido de desculpas no lugar.
//
// A promessa que este teste trava: Pago + A Pagar = Total, contando o que já entrou.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/pagar-totais-parcial.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3200);

const r = await page.evaluate(async () => {
  const out = {};
  const nb = [...document.querySelectorAll('.nav-main button')].find(b => /A Pagar/.test(b.textContent));
  showMain('pagar', nb);
  await new Promise(r => setTimeout(r, 1800));

  // dia fixo: o que se testa é a regra, não o calendário (ver painel-pagar-detalhe)
  window.getDia = () => 15;

  // 6.540 no total; 3.800 quitados; 250 + 400 entraram em contas que seguem abertas
  P_meses[P_mesAtual] = [
    { id: 'q1', nome: 'ALUGUEL',  valor: 3800, valorPago: 3800, dia: 5,  mes: P_mesAtual, categoria: 'aluguel',        status: 'PAGO' },
    { id: 'q2', nome: 'ENERGIA',  valor: 640,  valorPago: 0,    dia: 12, mes: P_mesAtual, categoria: 'consumo',        status: 'PENDENTE' },
    { id: 'q3', nome: 'CONTADOR', valor: 600,  valorPago: 250,  dia: 10, mes: P_mesAtual, categoria: 'contabilidade',  status: 'PARCIAL' },
    { id: 'q4', nome: 'FREELA',   valor: 1200, valorPago: 400,  dia: 20, mes: P_mesAtual, categoria: 'servicos',       status: 'PENDENTE' }, // parcial sem o rótulo
    { id: 'q5', nome: 'INTERNET', valor: 300,  valorPago: 0,    dia: 22, mes: P_mesAtual, categoria: 'servicos',       status: 'PENDENTE' },
  ];
  renderDashboardP();
  await new Promise(r => setTimeout(r, 500));

  const num = s => { const m = String(s||'').replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',','.');
                     const n = parseFloat(m); return isNaN(n) ? null : Math.round(n*100)/100; };
  const card = rot => { const c = [...document.querySelectorAll('#pCards .card-p')]
      .find(x => new RegExp(rot).test(x.querySelector('label').textContent));
    return c ? num(c.querySelector('.val').textContent) : null; };
  const reItem = rot => { const c = [...document.querySelectorAll('#pResumoExec .re-item')]
      .find(x => new RegExp(rot).test(x.querySelector('label').textContent));
    return c ? c.querySelector('.rev').textContent.trim() : null; };

  out.total  = card('Total');
  out.pago   = card('Pago');
  out.apagar = card('A Pagar');
  out.quitadoPct = reItem('% Quitado');

  // a janela que o card abre tem que fechar com o card
  DP_abrirPagar('p-apagar');
  await new Promise(r => setTimeout(r, 250));
  out.popupTotal = num((document.querySelector('#dpConteudo .dp-total b')||{}).textContent);
  out.popupPedeDesculpa = /card soma o valor cheio/i.test(document.getElementById('dpConteudo').innerHTML);
  DP_fechar ? DP_fechar() : document.getElementById('modalDetalhePainel').classList.remove('open');

  // exportação em Excel: os mesmos três números, na mesma conta
  out.excel = (() => {
    const data = P_meses[P_mesAtual];
    const t = data.reduce((a, x) => a + x.valor, 0);
    const p = (typeof P_somaPago === 'function') ? P_somaPago(data) : null;
    return { total: Math.round(t*100)/100, pago: p == null ? null : Math.round(p*100)/100 };
  })();

  // helpers existem e tratam o caso "PAGO sem valorPago" (dado legado) como quitado
  out.helpers = (typeof P_pagoDe === 'function' && typeof P_abertoDe === 'function');
  if (out.helpers) {
    out.legadoPagoSemValorPago = P_pagoDe({ valor: 900, valorPago: 0, status: 'PAGO' });
    out.naoPassaDoValor        = P_pagoDe({ valor: 500, valorPago: 900, status: 'PARCIAL' });
    out.negativoNaoVira        = P_abertoDe({ valor: 500, valorPago: 900, status: 'PARCIAL' });
  }
  return out;
});
await browser.close();

const falhas = [];
const eq = (o, e, q) => { if (o !== e) falhas.push(`${q}: esperado ${e}, veio ${o}`); };

eq(r.total,  6540, 'Total do mês');
eq(r.pago,   4450, 'Pago (3.800 quitados + 250 + 400 de parciais)');
eq(r.apagar, 2090, 'A Pagar (640 + 350 + 800 + 300)');
if (r.pago != null && r.apagar != null && r.total != null
    && Math.round((r.pago + r.apagar) * 100) / 100 !== r.total)
  falhas.push(`Pago + A Pagar (${r.pago + r.apagar}) != Total (${r.total})`);
eq(r.quitadoPct, '68%', '% Quitado (4.450/6.540)');
eq(r.popupTotal, 2090, 'total da janela do card A Pagar');
if (r.popupPedeDesculpa) falhas.push('a janela ainda imprime o aviso de que o card soma valor cheio');
if (!r.helpers) falhas.push('P_pagoDe / P_abertoDe não existem');
eq(r.excel && r.excel.pago, 4450, 'soma de pago usada na exportação');
eq(r.legadoPagoSemValorPago, 900, 'conta PAGO sem valorPago (dado legado) conta cheia');
eq(r.naoPassaDoValor, 500, 'valorPago maior que o valor não infla o "pago"');
eq(r.negativoNaoVira, 0, 'saldo em aberto nunca fica negativo');
if (erros.length) falhas.push('erros de página: ' + erros.join(' | '));

if (falhas.length) { console.error('❌ pagar-totais-parcial\n   - ' + falhas.join('\n   - ')); process.exit(1); }
console.log('✅ pagar-totais-parcial: Pago + A Pagar = Total, com parciais contadas');
