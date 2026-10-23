// Cards do painel A Pagar abrem a janela de detalhe (23/10/2026) — roda 100% em ?mock=1.
// Regra de ouro: o total da janela TEM que ser o número do card. Se divergir, o link mente.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/painel-pagar-detalhe.test.mjs <url-com-?mock=1>'); process.exit(2); }
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

  // monta um mês com casos de propósito: paga, parcial, atrasada, vencendo, sem dia
  const hoje = getDia();
  P_meses[P_mesAtual] = [
    { id: 'a1', nome: 'ALUGUEL STUDIO A', valor: 3800, valorPago: 3800, dia: 5, mes: P_mesAtual, categoria: 'aluguel', status: 'PAGO' },
    { id: 'a2', nome: 'ENERGIA', valor: 640, valorPago: 0, dia: Math.max(1, hoje - 4), mes: P_mesAtual, categoria: 'consumo', status: 'PENDENTE' },
    { id: 'a3', nome: 'CONTADOR', valor: 600, valorPago: 250, dia: Math.max(1, hoje - 2), mes: P_mesAtual, categoria: 'contabilidade', status: 'PENDENTE' },
    { id: 'a4', nome: 'INTERNET', valor: 300, valorPago: 0, dia: Math.min(28, hoje + 2), mes: P_mesAtual, categoria: 'servicos', status: 'PENDENTE' },
    { id: 'a5', nome: 'FREELA EDICAO', valor: 1200, valorPago: 0, dia: Math.min(28, hoje + 6), mes: P_mesAtual, categoria: 'servicos', status: 'PENDENTE' },
  ];
  renderDashboardP();
  await new Promise(r => setTimeout(r, 400));

  const txt = id => (document.getElementById(id) || {}).textContent || '';
  const cardVal = rot => { const c = [...document.querySelectorAll('#pCards .card-p, #pCardsRow2 .card-p')]
      .find(x => new RegExp(rot).test(x.querySelector('label').textContent));
    return c ? c.querySelector('.val').textContent.trim() : null; };
  out.cards = { apagar: cardVal('A Pagar'), vencendo: cardVal('Vencendo'),
                atrasoMes: cardVal('Atrasadas —'), atrasoAno: cardVal('Atrasadas 20') };
  out.temLinks = document.querySelectorAll('#pCards .dp-link, #pCardsRow2 .dp-link, #pResumoExec .dp-link').length;

  const abrirELer = t => { DP_abrir(t); return {
      titulo: txt('dpTitulo'),
      total: (document.querySelector('#dpConteudo .dp-total b') || {}).textContent,
      qtd: document.querySelectorAll('#dpConteudo .dp-row').length,
      nomes: [...document.querySelectorAll('#dpConteudo .dp-nome')].map(x => x.textContent),
      notas: [...document.querySelectorAll('#dpConteudo .dp-row small')].map(x => x.textContent),
      aberto: document.getElementById('modalDetalhePainel').classList.contains('open'),
      avisoParcial: /pagamento parcial/.test(document.getElementById('dpConteudo').innerHTML),
    }; };

  out.apagar = abrirELer('p-apagar');       DP_fechar();
  out.vencendo = abrirELer('p-vencendo');   DP_fechar();
  out.atrasoMes = abrirELer('p-atraso-mes');DP_fechar();
  out.atrasoAno = abrirELer('p-atraso-ano');
  out.fechou = (DP_fechar(), !document.getElementById('modalDetalhePainel').classList.contains('open'));

  // o Receber continua funcionando (não quebrei o que já existia)
  const rb = [...document.querySelectorAll('.nav-main button')].find(b => /A Receber/.test(b.textContent));
  showMain('receber', rb); await new Promise(r => setTimeout(r, 1200));
  DP_abrir('areceber');
  out.receberIntacto = document.getElementById('modalDetalhePainel').classList.contains('open') && /receber/i.test(txt('dpTitulo'));
  DP_fechar();
  out.tipoInvalido = (DP_abrir('nao-existe'), !document.getElementById('modalDetalhePainel').classList.contains('open'));
  return out;
});
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── os quatro cards viraram link ──');
ok('5 links no painel (4 cards + resumo executivo)', r.temLinks === 5, r.temLinks);
ok('a janela abre em todos', r.apagar.aberto && r.vencendo.aberto && r.atrasoMes.aberto && r.atrasoAno.aberto);
ok('e fecha', r.fechou);

console.log('\n── o total da janela é o número do card ──');
ok('A Pagar: card = janela', r.cards.apagar === r.apagar.total, { card: r.cards.apagar, janela: r.apagar.total });
ok('Vencendo 3d: a contagem bate', r.cards.vencendo === r.vencendo.qtd + ' conta(s)', { card: r.cards.vencendo, linhas: r.vencendo.qtd });
ok('Atrasadas do mês: a contagem bate', r.cards.atrasoMes === String(r.atrasoMes.qtd), { card: r.cards.atrasoMes, linhas: r.atrasoMes.qtd });
ok('Atrasadas do ano: a contagem bate', r.cards.atrasoAno === String(r.atrasoAno.qtd), { card: r.cards.atrasoAno, linhas: r.atrasoAno.qtd });

console.log('\n── cada recorte traz o que promete ──');
ok('A Pagar: as 4 não pagas, sem a paga', r.apagar.qtd === 4 && !r.apagar.nomes.includes('ALUGUEL STUDIO A'), r.apagar.nomes);
ok('Vencendo: só a que vence em 3 dias', r.vencendo.nomes.join() === 'INTERNET', r.vencendo.nomes);
ok('Atrasadas do mês: só as vencidas', [...r.atrasoMes.nomes].sort().join() === 'CONTADOR,ENERGIA', r.atrasoMes.nomes);
ok('ordenadas da mais atrasada pra menos', r.atrasoMes.nomes[0] === 'ENERGIA', r.atrasoMes.nomes);
ok('a nota diz os dias de atraso', r.atrasoMes.notas.some(n => /dias? em atraso/.test(n)), r.atrasoMes.notas);
ok('a nota diz o pagamento parcial', r.apagar.notas.some(n => /já pago/.test(n)), r.apagar.notas);

console.log('\n── honestidade sobre o parcial ──');
ok('avisa que o card soma o valor cheio', r.apagar.avisoParcial);

console.log('\n── nada do que já existia quebrou ──');
ok('o Receber continua abrindo', r.receberIntacto);
ok('tipo inválido não abre nada', r.tipoInvalido);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
