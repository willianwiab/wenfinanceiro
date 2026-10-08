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

  // ── 6. filtro "📥 Vindas do extrato" em A Pagar → Contas ──
  const sel = document.getElementById('pOrigemFiltro');
  out.filtroOrigem = { opcoes: [...sel.options].map(o => o.value) };
  // cria uma conta a pagar A PARTIR de uma linha do extrato (débito/PIX que não existia no sistema)
  window.prompt = () => 'PIX avulso do extrato';
  const movLivre = { id: 'mov_ofx_bmock1_FITPIX', contaId: 'bmock1', tipo: 'saida', valor: 77.7,
                     data: '2026-08-20', descricao: '📥 PIX ENVIADO FULANO', categoria: null,
                     origemTipo: 'import', origemId: 'FITPIX', estornada: false };
  BC_MOVS.push(movLivre);
  await CONC_criarLanc('mov_ofx_bmock1_FITPIX', 'pagar');
  await new Promise(res => setTimeout(res, 600));
  const criada = (P_meses['AGO/2026'] || []).find(x => x.nome === 'PIX avulso do extrato');
  out.criada = {
    existe: !!criada,
    marcador: !!(criada && criada.origemExtrato),
    guardaOMov: criada && criada.origemMovId === 'mov_ofx_bmock1_FITPIX',
    jaNasceConciliada: !!(criada && criada.conciliadoMov),
    reconheceComoExtrato: P_veioDoExtrato(criada),
  };
  // retroativo: conta antiga, criada antes do marcador existir, só com o obs
  out.retroativo = {
    peloObs: P_veioDoExtrato({ obs: 'Criado do extrato' }) === true,
    naoPegaQualquerUma: P_veioDoExtrato({ obs: 'outra coisa' }) === false,
  };
  // o que foi digitado à mão NÃO pode cair em "vindas do extrato", nem o contrário
  const manual = (P_meses['AGO/2026'] || []).find(x => x.id === 'pmock_conc');
  out.separacao = {
    manualNaoEhExtrato: P_veioDoExtrato(manual) === false,
    // a conciliada à mão tem conciliadoMov mas NÃO é "vinda do extrato"
    conciliadaNaoViraExtrato: !!manual.conciliadoMov && P_veioDoExtrato(manual) === false,
  };
  // e os filtros da tela separam de verdade
  // abre de fato a sub-aba 📋 Contas (é lá que o select de mês é populado)
  const bContas = [...document.querySelectorAll('#subnav-pagar .nav-sub button')].find(b => /Contas/.test(b.textContent));
  showSubP('p-contas', bContas);
  await new Promise(res => setTimeout(res, 1500));
  // a tabela mostra o mês corrente do A Pagar; as contas do teste estão em AGO/2026
  out.mes = { antes: P_mesAtual };
  P_mesAtual = 'AGO/2026'; P_filtroAtual = 'TODOS';
  const contaCom = v => { sel.value = v; renderTabelaP(); return document.querySelectorAll('#pTabelaDiv tbody tr').length; };
  out.contagens = { todas: contaCom(''), extrato: contaCom('extrato'), manual: contaCom('manual') };
  const textoCom = v => { sel.value = v; renderTabelaP(); return document.getElementById('pTabelaDiv').textContent; };
  out.textos = { extrato: textoCom('extrato'), manual: textoCom('manual'), sistema: textoCom('sistema') };

  // ── 7. o padrão é "🏠 Do sistema" e ele esconde só o que veio do extrato ──
  const selLimpo = document.createElement('div');
  selLimpo.innerHTML = document.getElementById('pOrigemFiltro').outerHTML;
  out.padrao = {
    valorInicial: selLimpo.querySelector('option[selected]')?.value,
    primeiraOpcao: [...sel.options][0].value,
    escondeExtrato: !/PIX avulso do extrato/.test(out.textos.sistema),
    mantemManual: /Compra sem identificar/.test(out.textos.sistema),
  };

  // ── 8. com o chip em "Pendentes", pedir o extrato AINDA mostra (nasce PAGO) ──
  P_filtroAtual = 'PENDENTE';
  sel.value = 'extrato'; renderTabelaP();
  out.chipPendente = {
    aparece: /PIX avulso do extrato/.test(document.getElementById('pTabelaDiv').textContent),
    avisa: /filtro de status está desconsiderado/.test(document.getElementById('vencidoBanner-p').innerHTML),
  };
  // e com o chip em Pendentes + padrão do sistema, o status volta a valer
  sel.value = 'sistema'; renderTabelaP();
  out.chipVoltaAValer = { pagoSumiu: !/PIX avulso do extrato/.test(document.getElementById('pTabelaDiv').textContent) };
  P_filtroAtual = 'TODOS'; sel.value = 'sistema';
  sel.value = '';

  // ── 7. desfazer devolve tudo ──
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

console.log('\n── filtro 📥 Vindas do extrato (A Pagar → Contas) ──');
ok('a opção existe no select', r.filtroOrigem.opcoes.includes('extrato'), r.filtroOrigem.opcoes);
ok('criar do extrato gera a conta a pagar', r.criada.existe);
ok('carimba o marcador origemExtrato', r.criada.marcador);
ok('guarda de qual movimentação veio', r.criada.guardaOMov);
ok('já nasce conciliada com a movimentação', r.criada.jaNasceConciliada);
ok('é reconhecida como vinda do extrato', r.criada.reconheceComoExtrato);
ok('RETROATIVO: pega as antigas pelo obs', r.retroativo.peloObs && r.retroativo.naoPegaQualquerUma, r.retroativo);
ok('digitada à mão NÃO é "vinda do extrato"', r.separacao.manualNaoEhExtrato);
ok('conciliada à mão também não vira "do extrato"', r.separacao.conciliadaNaoViraExtrato);
ok('cada recorte é menor que o total', r.contagens.extrato < r.contagens.todas && r.contagens.manual < r.contagens.todas, r.contagens);
ok('"📥 Vindas do extrato" mostra SÓ a nascida do extrato',
   /PIX avulso do extrato/.test(r.textos.extrato) && !/Compra sem identificar/.test(r.textos.extrato));
ok('"✍️ Manuais" mostra SÓ a digitada à mão',
   /Compra sem identificar/.test(r.textos.manual) && !/PIX avulso do extrato/.test(r.textos.manual));

console.log('\n── padrão 🏠 Do sistema ──');
ok('"sistema" é a opção marcada por padrão', r.padrao.valorInicial === 'sistema' && r.padrao.primeiraOpcao === 'sistema', r.padrao);
ok('o padrão esconde o que veio do extrato', r.padrao.escondeExtrato);
ok('o padrão mantém as digitadas à mão', r.padrao.mantemManual);

console.log('\n── pago ou não pago, o extrato sempre aparece ──');
ok('chip em Pendentes NÃO esconde a vinda do extrato', r.chipPendente.aparece, r.chipPendente);
ok('a tela avisa que o status foi desconsiderado', r.chipPendente.avisa);
ok('fora desse recorte o chip volta a valer', r.chipVoltaAValer.pagoSumiu);

console.log('\n── desfazer volta tudo ──');
ok('conta volta a PENDENTE', r.desfeito.status === 'PENDENTE', r.desfeito);
ok('✅ apaga no extrato', r.desfeito.conciliadaNoExtrato === false);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
