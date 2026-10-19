// Curvas de faturamento e custo no gráfico de saldo (19/10/2026) — roda 100% em ?mock=1.
// Acumuladas, em eixo próprio à direita, ligáveis por botão e com a escolha lembrada.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/sim-curvas.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3500);

const abrir = async () => page.evaluate(async () => {
  const b = [...document.querySelectorAll('.nav-main button')].find(x => /Simula/.test(x.textContent));
  showMain('simulacao', b);
  await new Promise(r => setTimeout(r, 2500));
});
await abrir();

const r = await page.evaluate(async () => {
  const out = {};
  const ds = () => (SIM_chartLinha ? SIM_chartLinha.data.datasets.map(d => d.label) : null);
  const eixo = () => !!(SIM_chartLinha && SIM_chartLinha.options.scales.y2 && SIM_chartLinha.options.scales.y2.display);

  out.montou = !!SIM_chartLinha;
  out.botoes = [...document.querySelectorAll('.sim-linhas .sim-lin')].map(b => b.textContent.trim());
  out.desligadoPorPadrao = { linhas: ds(), eixoDireita: eixo() };

  // liga faturamento
  SIM_LINHAS.fat = false; SIM_LINHAS.cus = false;
  SIM_toggleLinha('fat');
  await new Promise(r => setTimeout(r, 400));
  out.comFat = { linhas: ds(), eixoDireita: eixo(),
    botaoAceso: document.querySelectorAll('.sim-linhas .sim-lin.on').length };

  // a curva tem que ser ACUMULADA (nunca decrescente) e no eixo da direita
  const d = SIM_chartLinha.data.datasets.find(x => /Faturamento/.test(x.label));
  out.curvaFat = { eixo: d.yAxisID, pontos: d.data.length,
    naoDecresce: d.data.every((v, i) => i === 0 || v >= d.data[i - 1]),
    comecaBaixo: d.data[0] <= d.data[d.data.length - 1],
    bateComALinha: Math.abs(d.data[d.data.length - 1] - SIM_ultimoGrafico.linha.reduce((a, t) => a + (Number(t.tR) || 0), 0)) < 0.01 };

  // liga custo também
  SIM_toggleLinha('cus');
  await new Promise(r => setTimeout(r, 400));
  const c = SIM_chartLinha.data.datasets.find(x => /Custo/.test(x.label));
  out.comCus = { linhas: ds(), acumulado: c.data.every((v, i) => i === 0 || v >= c.data[i - 1]),
    bateComALinha: Math.abs(c.data[c.data.length - 1] - SIM_ultimoGrafico.linha.reduce((a, t) => a + (Number(t.tP) || 0), 0)) < 0.01 };

  // o saldo continua no eixo da esquerda e intacto
  const saldo = SIM_chartLinha.data.datasets.find(x => x.label === 'Saldo');
  out.saldoIntacto = { semEixoProprio: !saldo.yAxisID, pontos: saldo.data.length };

  // desliga e some
  SIM_toggleLinha('fat'); SIM_toggleLinha('cus');
  await new Promise(r => setTimeout(r, 400));
  out.desligado = { linhas: ds(), eixoDireita: eixo() };

  // ── curva de projeção ──
  const inc = SIM_ultimoGrafico.incompletos || [];
  out.incompletos = inc.map(x => ({ mes: x.mes, falta: Math.round(x.falta) }));
  if (inc.length) {
    SIM_toggleLinha('proj');
    await new Promise(r => setTimeout(r, 400));
    const pj = SIM_chartLinha.data.datasets.find(x => /Projeção/.test(x.label));
    const sd = SIM_chartLinha.data.datasets.find(x => x.label === 'Saldo');
    out.proj = {
      existe: !!pj,
      eixoDaEsquerda: pj && !pj.yAxisID,          // é saldo, não acumulado
      nuncaAbaixoDoSaldo: pj && pj.data.every((v, i) => v >= sd.data[i] - 0.01),
      comecaIgual: pj && Math.abs(pj.data[0] - sd.data[0]) < 1,
      terminaAcima: pj && pj.data[pj.data.length - 1] > sd.data[sd.data.length - 1],
      ganhoNoFim: pj && Math.round(pj.data[pj.data.length - 1] - sd.data[sd.data.length - 1]),
      somaDoQueFalta: Math.round(inc.reduce((a, x) => a + x.falta, 0)),
      temBotao: [...document.querySelectorAll('.sim-linhas .sim-lin')].some(b => /Projeção/.test(b.textContent)),
    };
    SIM_toggleLinha('proj');
    await new Promise(r => setTimeout(r, 300));
    out.projDesligada = !SIM_chartLinha.data.datasets.some(x => /Projeção/.test(x.label));
  } else {
    out.proj = null;
    out.semBotaoQuandoAgendaCheia = ![...document.querySelectorAll('.sim-linhas .sim-lin')].some(b => /Projeção/.test(b.textContent));
  }

  // a escolha fica guardada
  SIM_toggleLinha('fat');
  out.lembrou = JSON.parse(localStorage.getItem('wen_sim_linhas') || '{}');
  return out;
});

// e sobrevive a um reload
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await abrir();
const r2 = await page.evaluate(() => ({
  fatLigado: SIM_LINHAS.fat,
  temNoGrafico: SIM_chartLinha ? SIM_chartLinha.data.datasets.some(d => /Faturamento/.test(d.label)) : null,
  botaoAceso: document.querySelectorAll('.sim-linhas .sim-lin.on').length,
}));
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── os botões ──');
ok('o gráfico de saldo montou', r.montou);
ok('botões de faturamento e custo, nessa ordem', /Faturamento/.test(r.botoes[0]) && /Custo/.test(r.botoes[1]), r.botoes);
ok('nascem desligados — nada muda sem pedir', !r.desligadoPorPadrao.linhas.some(l => /Faturamento|Custo/.test(l)) && !r.desligadoPorPadrao.eixoDireita, r.desligadoPorPadrao);

console.log('\n── ligando ──');
ok('faturamento entra no gráfico', r.comFat.linhas.some(l => /Faturamento/.test(l)), r.comFat.linhas);
ok('o eixo da direita aparece junto', r.comFat.eixoDireita);
ok('o botão acende', r.comFat.botaoAceso === 1, r.comFat.botaoAceso);
ok('a curva vive no eixo da direita', r.curvaFat.eixo === 'y2', r.curvaFat.eixo);
ok('é ACUMULADA (nunca desce)', r.curvaFat.naoDecresce);
ok('o acumulado bate com a projeção dia a dia', r.curvaFat.bateComALinha, r.curvaFat);
ok('custo também entra e acumula', r.comCus.linhas.some(l => /Custo/.test(l)) && r.comCus.acumulado, r.comCus.linhas);
ok('o acumulado do custo bate com a projeção', r.comCus.bateComALinha);
ok('o saldo continua no eixo da esquerda', r.saldoIntacto.semEixoProprio, r.saldoIntacto);

console.log('\n── curva de projeção ──');
if (r.proj) {
  ok('o botão existe quando há mês com agenda incompleta', r.proj.temBotao, r.incompletos);
  ok('a curva entra no gráfico', r.proj.existe);
  ok('fica no eixo da ESQUERDA (é saldo, não acumulado)', r.proj.eixoDaEsquerda);
  ok('começa colada no saldo de hoje', r.proj.comecaIgual);
  ok('nunca fica abaixo do saldo cru', r.proj.nuncaAbaixoDoSaldo);
  ok('termina acima — é o que ainda vai entrar', r.proj.terminaAcima, { ganho: r.proj.ganhoNoFim, falta: r.proj.somaDoQueFalta });
  ok('desligar tira a curva', r.projDesligada);
} else {
  ok('agenda cheia no horizonte → o botão nem aparece', r.semBotaoQuandoAgendaCheia);
}

console.log('\n── desligando e lembrando ──');
ok('desligar tira as curvas e o eixo', !r.desligado.linhas.some(l => /Faturamento|Custo/.test(l)) && !r.desligado.eixoDireita, r.desligado);
ok('a escolha é gravada', r.lembrou.fat === true, r.lembrou);
ok('e sobrevive ao reload', r2.fatLigado === true && r2.temNoGrafico === true && r2.botaoAceso === 1, r2);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
