// Selo 🔗 de Receber/Pagar (CONC_seloConciliado) — roda 100% em ?mock=1.
//
// Nasceu da aposentadoria do js/banco.js em 08/10/2026. O selo era a única coisa viva
// daquele módulo: lia um objeto espelho (BK_conciliados) preenchido UMA vez, no boot da
// conciliação, e nunca mais. Resultado: conciliar ou desfazer não mexia no selo até
// recarregar a página. Agora a função mora no index.html e lê CONC_LINKS direto.
//
// O que este teste trava:
//   1. o selo acende para os vínculos que vieram do banco (pagar E receber);
//   2. não acende para quem não tem vínculo, nem para status != 'match';
//   3. o ramo legado grupo/ids (uma transação quitando N diárias) continua reconhecido;
//   4. ⭐ acende logo depois de CONC_conciliar e apaga no desfazer — SEM reload;
//   5. as tabelas de Receber/Pagar realmente imprimem o selo no HTML.
//
// Rodar:  python3 -m http.server 8877
//         node test/selo-conciliado.test.mjs "http://localhost:8877/index.html?mock=1"
import { chromium } from 'playwright';

const URL = process.argv[2];
if (!URL) { console.error('uso: node test/selo-conciliado.test.mjs <url-com-?mock=1>'); process.exit(2); }

const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + ((e && e.message) || e)));
page.on('console', m => { if (m.type() === 'error') erros.push('console.error: ' + m.text()); });

await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const out = {};
  const espera = ms => new Promise(res => setTimeout(res, ms));
  out.funcaoExiste = typeof CONC_seloConciliado === 'function';
  out.semEspelhoBK = typeof window.BK_conciliados === 'undefined' && typeof window.BK_statusConciliacao === 'undefined';

  // antes de hidratar não há links lidos — o selo tem que dizer "não", nunca estourar
  out.antesDeHidratar = CONC_seloConciliado('receber', 'mock1', 'JUL/2026');

  // Abre A Pagar → 🔗 Conciliação pelo caminho do usuário: é isso que hidrata BC_MOVS
  // (MOD_contasCompleto) e os vínculos (MOD_conciliacao). Chamar MOD_conciliacao na mão
  // leria os links mas deixaria o extrato vazio, e o teste do "ao vivo" não teria movimentação.
  const nb = [...document.querySelectorAll('.nav-main button')].find(b => /A Pagar/.test(b.textContent));
  showMain('pagar', nb);
  await espera(1200);
  const sb = [...document.querySelectorAll('#subnav-pagar .nav-sub button')].find(b => /Concilia/.test(b.textContent));
  out.subAbaExiste = !!sb;
  if (sb) { showSubP('p-conciliacao', sb); await espera(2500); }
  out.linksLidos = Object.keys(CONC_LINKS).length;

  // 1) vínculos semeados no mock
  out.receberMock1 = CONC_seloConciliado('receber', 'mock1', 'JUL/2026');
  out.pagarAluguel = CONC_seloConciliado('pagar', 'pmock_aluguel', 'AGO/2026');
  // 2) não acende à toa
  out.idInexistente = CONC_seloConciliado('pagar', 'nao_existe_nenhum', 'AGO/2026');
  out.mesErrado     = CONC_seloConciliado('pagar', 'pmock_aluguel', 'JUL/2026');
  out.tipoCruzado   = CONC_seloConciliado('receber', 'pmock_aluguel', 'AGO/2026');

  // status != 'match' (um "ignorado") não é conciliação
  CONC_LINKS['__t_ignorado'] = { chave:'__t_ignorado', status:'ignorado', tipo:'pagar', id:'p_ign', mes:'AGO/2026' };
  out.ignoradoNaoAcende = CONC_seloConciliado('pagar', 'p_ign', 'AGO/2026');
  delete CONC_LINKS['__t_ignorado'];

  // 3) ramo legado grupo/ids — documento no formato do módulo antigo, que ainda vive na coleção
  CONC_LINKS['__t_grupo'] = { chave:'__t_grupo', status:'match', tipo:'receber', grupo:true, id:null,
    ids:[{id:'g1',mes:'SET/2026'},{id:'g2',mes:'SET/2026'}] };
  out.grupoPrimeiro = CONC_seloConciliado('receber', 'g1', 'SET/2026');
  out.grupoSegundo  = CONC_seloConciliado('receber', 'g2', 'SET/2026');
  out.grupoMesErrado = CONC_seloConciliado('receber', 'g1', 'OUT/2026');
  delete CONC_LINKS['__t_grupo'];

  // 4) ⭐ ao vivo, no caminho completo: concilia → o selo acende E a tabela de A Pagar passa a
  //    imprimir 🔗; desfaz → o selo apaga E o 🔗 sai da tabela. Tudo sem recarregar a página,
  //    que é exatamente o que o espelho congelado do módulo antigo não fazia.
  //    'pmock_conc' é a única conta de AGO/2026 no mock, e casa com a movimentação FIT888.
  const tabelaP = () => (document.getElementById('pTabelaDiv') || {}).innerHTML || '';
  const mov = CONC_movs().find(m => m.id === 'mov_ofx_bmock1_FIT888');
  out.movDeTesteExiste = !!mov;
  if (mov) {
    const sbC = [...document.querySelectorAll('#subnav-pagar .nav-sub button')].find(b => /Contas/.test(b.textContent));
    if (sbC) { showSubP('p-contas', sbC); await espera(900); }
    // o app abre no mês corrente; o mock semeia em AGO/2026, senão a tabela vem vazia
    P_trocarMes('AGO/2026');
    await espera(600);
    out.pagarTemLinhas = /Compra sem identificar/i.test(tabelaP());
    out.pagarTemNaoConciliado = /Não conciliado/.test(tabelaP());

    out.antesDeConciliar = CONC_seloConciliado('pagar', 'pmock_conc', 'AGO/2026');
    out.pagarSeloAntes = /🔗 Conciliado/.test(tabelaP());

    await CONC_conciliar('mov_ofx_bmock1_FIT888', 'pagar|pmock_conc|AGO/2026');
    await espera(600);
    out.depoisDeConciliar = CONC_seloConciliado('pagar', 'pmock_conc', 'AGO/2026');
    renderTabelaP();
    out.pagarSeloDepois = /🔗 Conciliado/.test(tabelaP());

    const chave = Object.keys(CONC_LINKS).find(k => CONC_LINKS[k] && CONC_LINKS[k].id === 'pmock_conc');
    out.achouChaveDoVinculo = !!chave;
    if (chave) {
      await CONC_desfazer(chave);
      await espera(600);
      out.depoisDeDesfazer = CONC_seloConciliado('pagar', 'pmock_conc', 'AGO/2026');
      renderTabelaP();
      out.pagarSeloAposDesfazer = /🔗 Conciliado/.test(tabelaP());
    }
  }

  // 5) do lado de Receber o vínculo já vem semeado no mock (mock_chave_1 → mock1/JUL/2026)
  const nbR = [...document.querySelectorAll('.nav-main button')].find(b => /Receber/.test(b.textContent));
  showMain('receber', nbR);
  await espera(1200);
  const sbR = [...document.querySelectorAll('#subnav-receber .nav-sub button')].find(b => /Lan.amento/.test(b.textContent));
  if (sbR) { showSubR('r-lancamentos', sbR); await espera(900); }
  R_trocarMes('JUL/2026');
  await espera(600);
  const htmlR = (document.getElementById('rTabelaDiv') || {}).innerHTML || '';
  out.receberTemLinhas = /CLIENTE TESTE/i.test(htmlR);
  out.receberTemSelo = /🔗 Conciliado/.test(htmlR);
  out.receberTemNaoConciliado = /Não conciliado/.test(htmlR);

  return out;
});

await browser.close();

let pass = 0, fail = 0;
const ok = (d, c) => c ? pass++ : (fail++, console.log('FALHOU: ' + d));

ok('CONC_seloConciliado existe no index.html', r.funcaoExiste);
ok('o módulo BK_ não deixou global nenhum no navegador', r.semEspelhoBK);
ok('sem links lidos o selo diz "não" em vez de estourar', r.antesDeHidratar === false);
ok('MOD_conciliacao leu os vínculos do mock (' + r.linksLidos + ')', r.linksLidos >= 2);
ok('receber mock1/JUL/2026 → 🔗 conciliado', r.receberMock1 === true);
ok('pagar pmock_aluguel/AGO/2026 → 🔗 conciliado', r.pagarAluguel === true);
ok('id sem vínculo não acende', r.idInexistente === false);
ok('mês diferente não acende (pagar casa por id+mês)', r.mesErrado === false);
ok('tipo cruzado não acende', r.tipoCruzado === false);
ok('vínculo "ignorado" não vira conciliação', r.ignoradoNaoAcende === false);
ok('doc legado grupo/ids acende para a 1ª diária', r.grupoPrimeiro === true);
ok('doc legado grupo/ids acende para a 2ª diária', r.grupoSegundo === true);
ok('doc legado grupo/ids respeita o mês', r.grupoMesErrado === false);
ok('a sub-aba 🔗 Conciliação abriu', r.subAbaExiste === true);
ok('a movimentação de teste do mock existe', r.movDeTesteExiste === true);
ok('o vínculo recém-criado tem chave em CONC_LINKS', r.achouChaveDoVinculo === true);
ok('pmock_conc começa sem selo', r.antesDeConciliar === false);
ok('⭐ o selo acende logo depois de conciliar, sem reload', r.depoisDeConciliar === true);
ok('⭐ o selo apaga logo depois de desfazer, sem reload', r.depoisDeDesfazer === false);
ok('a tabela de A Pagar carregou as linhas de AGO/2026', r.pagarTemLinhas === true);
ok('a tabela de A Pagar imprime "Não conciliado" em quem não tem vínculo', r.pagarTemNaoConciliado === true);
ok('a tabela de A Pagar não mostra 🔗 antes de conciliar', r.pagarSeloAntes === false);
ok('⭐ a tabela de A Pagar passa a imprimir 🔗 sem reload', r.pagarSeloDepois === true);
ok('⭐ o 🔗 sai da tabela de A Pagar ao desfazer, sem reload', r.pagarSeloAposDesfazer === false);
ok('a tabela de Receber carregou as linhas de JUL/2026', r.receberTemLinhas === true);
ok('a tabela de Receber imprime 🔗 Conciliado no vínculo', r.receberTemSelo === true);
ok('a tabela de Receber imprime "Não conciliado" no resto', r.receberTemNaoConciliado === true);
ok('nenhum erro de página/console' + (erros.length ? ':\n  - ' + erros.join('\n  - ') : ''), erros.length === 0);

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
