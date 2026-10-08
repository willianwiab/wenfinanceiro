// A sub-aba 🔗 Conciliação voltou ao menu de A Pagar (08/10/2026) e o circuito fecha:
// conciliar ali marca a conta como paga, VINCULA a conta bancária (o que esvazia o card
// "pagamentos sem conta") e acende o ✅ no extrato da conta. Roda 100% em ?mock=1.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/conciliacao-circuito.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const out = {};
  const nb = [...document.querySelectorAll('.nav-main button')].find(b => /A Pagar/.test(b.textContent));
  showMain('pagar', nb);
  await new Promise(res => setTimeout(res, 1200));

  // ── 1. o botão existe de novo ──
  const sb = [...document.querySelectorAll('#subnav-pagar .nav-sub button')].find(b => /Concilia/.test(b.textContent));
  out.menu = { existe: !!sb, rotulo: sb && sb.textContent.trim() };
  if (!sb) return out;

  // ── 2. a tela abre e renderiza ──
  showSubP('p-conciliacao', sb);
  await new Promise(res => setTimeout(res, 2500));
  const pg = document.getElementById('page-p-conciliacao');
  out.tela = { visivel: pg && pg.classList.contains('active'), temConteudo: pg && pg.innerHTML.length > 500 };

  // ── 3. a tela SUGERE o par certo sozinha ──
  const mov = CONC_movs().find(m => m.id === 'mov_ofx_bmock1_FIT888');
  const cands = CONC_candidatosDe(mov);
  out.sugestao = { achouMov: !!mov, candidatos: cands.length, par: cands[0] && (cands[0].tipo + '|' + cands[0].id + '|' + cands[0].mes) };

  // estado ANTES
  const rp = () => (P_meses['AGO/2026'] || []).find(x => x.id === 'pmock_conc');
  out.antes = {
    status: rp().status, valorPago: rp().valorPago, contaBancariaId: rp().contaBancariaId || null,
    semConta: BC_naoConciliado(),
    conciliadaNoExtrato: BC_movConciliado(mov, BC_concilIndice()),
  };

  // ── 4. concilia ──
  await CONC_conciliar('mov_ofx_bmock1_FIT888', 'pagar|pmock_conc|AGO/2026');
  await new Promise(res => setTimeout(res, 600));
  out.depois = {
    status: rp().status, valorPago: rp().valorPago, contaBancariaId: rp().contaBancariaId || null,
    semConta: BC_naoConciliado(),
    linkTemMovId: !!(CONC_LINKS['conc_mov_ofx_bmock1_FIT888'] || {}).movId,
    conciliadaNoExtrato: BC_movConciliado(mov, BC_concilIndice()),
  };

  // ── 5. o extrato da conta já mostra ──
  BC_abrirExtrato('bmock1');
  const conta = f => { BC_extratoFil(f); return document.querySelectorAll('#bcExtratoLista .bc-mov').length; };
  out.extrato = { conciliadas: conta('conciliadas'), aConciliar: conta('naoconciliadas'), extrato: conta('extrato') };
  document.getElementById('bcExtratoBg').classList.remove('open');

  // ── 6. desfazer devolve tudo ──
  window.confirm = () => true;
  await CONC_desfazer('conc_mov_ofx_bmock1_FIT888');
  await new Promise(res => setTimeout(res, 600));
  out.desfeito = { status: rp().status, valorPago: rp().valorPago, conciliadaNoExtrato: BC_movConciliado(mov, BC_concilIndice()) };
  return out;
});
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── a porta voltou ──');
ok('botão 🔗 Conciliação no menu de A Pagar', r.menu.existe, r.menu);
ok('a tela abre e renderiza', r.tela && r.tela.visivel && r.tela.temConteudo, r.tela);

console.log('\n── a tela sugere sozinha ──');
ok('achou o par certo pela movimentação', r.sugestao.candidatos === 1, r.sugestao);

console.log('\n── conciliar fecha o circuito ──');
ok('antes: conta PENDENTE e sem banco', r.antes.status === 'PENDENTE' && r.antes.contaBancariaId === null, r.antes);
ok('depois: conta marcada PAGO', r.depois.status === 'PAGO', r.depois.status);
ok('depois: valor pago preenchido', r.depois.valorPago === 99.9, r.depois.valorPago);
ok('depois: CONTA BANCÁRIA vinculada', r.depois.contaBancariaId === 'bmock1', r.depois.contaBancariaId);
ok('"pagamentos sem conta" NÃO aumentou', r.depois.semConta <= r.antes.semConta, { antes: r.antes.semConta, depois: r.depois.semConta });
ok('o link guarda o movId', r.depois.linkTemMovId);
ok('✅ acende no extrato da conta', r.antes.conciliadaNoExtrato === false && r.depois.conciliadaNoExtrato === true, { antes: r.antes.conciliadaNoExtrato, depois: r.depois.conciliadaNoExtrato });

console.log('\n── os filtros refletem na hora ──');
ok('Conciliadas = 2', r.extrato.conciliadas === 2, r.extrato);
ok('A conciliar = 0', r.extrato.aConciliar === 0, r.extrato.aConciliar);

console.log('\n── desfazer volta tudo ──');
ok('conta volta a PENDENTE', r.desfeito.status === 'PENDENTE', r.desfeito);
ok('✅ apaga no extrato', r.desfeito.conciliadaNoExtrato === false);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
