// Curva de projeção: os DOIS lados (auditoria 01/11/2026) — roda 100% em ?mock=1.
//
// O bug: a curva completava, nos meses futuros, só a RECEITA que historicamente ainda entra
// (média dos 3 últimos meses fechados). O comentário do código justificava isso dizendo que
// "a despesa fixa daquele mês já está inteira no sistema" — e isso vale só para o PRÓXIMO
// mês: `FX_mesesAplicaveis` materializa conta fixa até mesAtual+1 e para. Do 2º mês futuro
// em diante a linha do saldo não desconta custo nenhum, então a curva somava receita sobre
// um futuro sem custo e escalava. Era o que se via no horizonte de 180 dias.
//
// A promessa que este teste trava: o que a curva ganha é (receita que falta − custo que
// falta), nunca só a receita.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/sim-projecao-simetrica.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3500);

const r = await page.evaluate(async () => {
  const out = {};
  const b = [...document.querySelectorAll('.nav-main button')].find(x => /Simula/.test(x.textContent));
  showMain('simulacao', b);
  await new Promise(r => setTimeout(r, 2000));

  // mês a N meses de distância, na chave que o sistema usa
  const mk = n => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n);
                    return MESES_ABREV[d.getMonth()] + '/' + d.getFullYear(); };

  // 3 meses FECHADOS: R$ 60.000 faturados e R$ 40.000 de custo em cada um.
  // Futuro: o mês +1 com as fixas já lançadas (é até onde o FX_ materializa) e, do +2 em
  // diante, nada — nem receita nem custo. É exatamente o cenário em que a curva mentia.
  R_todosOsDados.length = 0;
  P_meses = {};
  [-3, -2, -1].forEach((n, i) => {
    const m = mk(n);
    R_todosOsDados.push({ id: 'rf' + i, cliente: 'CLIENTE ' + i, mes: m, data: '10/' + (i + 1),
      horas: 8, valorTotal: 60000, valorReserva: 60000, saldo: 0, studio: 'STUDIO A' });
    P_meses[m] = [{ id: 'pf' + i, nome: 'CUSTOS ' + m, valor: 40000, valorPago: 40000,
      dia: 10, mes: m, categoria: 'outros', status: 'PAGO' }];
  });
  P_meses[mk(0)] = [{ id: 'p0', nome: 'CUSTOS MES CORRENTE', valor: 40000, valorPago: 0,
    dia: 28, mes: mk(0), categoria: 'outros', status: 'PENDENTE' }];
  P_meses[mk(1)] = [{ id: 'p1', nome: 'FIXAS DO MES QUE VEM', valor: 40000, valorPago: 0,
    dia: 10, mes: mk(1), categoria: 'outros', status: 'PENDENTE' }];

  SIM_cfg.saldoOverride = 200000;          // saldo de partida alto: a curva não encosta no zero
  SIM_cfg.horizonte = 180;                 // é no horizonte longo que o erro aparecia
  SIM_LINHAS.proj = true; SIM_LINHAS.fat = false; SIM_LINHAS.cus = false;
  SIM_montarNaAba();
  await new Promise(r => setTimeout(r, 900));

  const g = SIM_ultimoGrafico || {};
  const inc = g.incompletos || [], cus = g.custoFalta || [];
  out.temFuncao = typeof SIM_custoIncompleto === 'function';
  out.receitaIncompleta = inc.map(x => ({ mes: x.mes, falta: Math.round(x.falta) }));
  out.custoIncompleto  = cus.map(x => ({ mes: x.mes, falta: Math.round(x.falta) }));
  // o mês +1 tem as fixas lançadas → não entra na lista de custo incompleto
  out.mesQueVemForaDoCusto = !cus.some(x => x.mes === mk(1));
  out.mesMaisDistanteNoCusto = cus.some(x => x.mes === mk(3));

  // ── a curva desenhada ──
  const pj = SIM_chartLinha.data.datasets.find(x => /Projeção/.test(x.label));
  const sd = SIM_chartLinha.data.datasets.find(x => x.label === 'Saldo');
  out.rotulo = pj ? pj.label : null;
  out.existe = !!pj;
  if (pj && sd) {
    const fim = pj.data.length - 1;
    out.ganhoReal = Math.round(pj.data[fim] - sd.data[fim]);

    // meses de fato cobertos pela linha de dias
    const dias = {}; (g.linha || []).forEach(t => {
      const m = MESES_ABREV[t.dt.getMonth()] + '/' + t.dt.getFullYear(); dias[m] = (dias[m] || 0) + 1; });
    const fR = {}; inc.forEach(x => fR[x.mes] = x.falta);
    const fP = {}; cus.forEach(x => fP[x.mes] = x.falta);
    let somaR = 0, somaP = 0;
    Object.keys(dias).forEach(m => { somaR += (fR[m] || 0); somaP += (fP[m] || 0); });
    out.somaReceitaQueFalta = Math.round(somaR);
    out.somaCustoQueFalta   = Math.round(somaP);
    out.ganhoEsperado = Math.round(somaR - somaP);
    out.comecaColadaNoSaldo = Math.abs(pj.data[0] - sd.data[0]) < 1;
  }
  return out;
});
await browser.close();

const falhas = [];
const ok = (c, q, extra) => { if (!c) falhas.push(q + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); };

ok(r.temFuncao, 'SIM_custoIncompleto não existe');
ok(r.existe, 'a curva de projeção não entrou no gráfico');
ok(r.comecaColadaNoSaldo, 'a curva tem que começar no saldo de hoje');
ok(/custos/i.test(r.rotulo || ''), 'o rótulo precisa dizer que o custo também é completado', r.rotulo);
ok(r.custoIncompleto.length > 0, 'nenhum mês foi apontado com custo incompleto', r.custoIncompleto);
ok(r.mesQueVemForaDoCusto, 'o mês que vem tem as fixas lançadas e NÃO deveria entrar no custo que falta', r.custoIncompleto);
ok(r.mesMaisDistanteNoCusto, 'um mês distante (hoje+3) tinha que estar no custo que falta', r.custoIncompleto);
ok(r.somaCustoQueFalta > 0, 'o custo que falta somou zero — o lado novo não está sendo medido', r);
ok(r.ganhoReal === r.ganhoEsperado,
   'o ganho da curva tem que ser receita que falta − custo que falta', 
   { ganhoReal: r.ganhoReal, ganhoEsperado: r.ganhoEsperado, somaR: r.somaReceitaQueFalta, somaP: r.somaCustoQueFalta });
// o guarda contra a volta do bug: antes, o ganho era a receita INTEIRA
ok(r.ganhoReal < r.somaReceitaQueFalta,
   'o ganho ficou igual à receita que falta — o custo voltou a não ser descontado',
   { ganhoReal: r.ganhoReal, somaR: r.somaReceitaQueFalta });
if (erros.length) falhas.push('erros de página: ' + erros.join(' | '));

if (falhas.length) { console.error('❌ sim-projecao-simetrica\n   - ' + falhas.join('\n   - ')); process.exit(1); }
console.log('✅ sim-projecao-simetrica: a curva desconta o custo que ainda será lançado');
console.log(`   receita que falta ${r.somaReceitaQueFalta} − custo que falta ${r.somaCustoQueFalta} = ganho ${r.ganhoReal}`);
