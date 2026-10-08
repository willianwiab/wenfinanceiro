// Filtros de extrato no painel de Contas (08/10/2026) — roda 100% em ?mock=1.
//  A) marca ✅/⏳ DERIVADA de CONC_LINKS pelo movId (exata, retroativa, nada gravado)
//  B) filtros 📥 Extrato / ✅ Conciliadas / ⏳ A conciliar + selos na linha
//  C) sem os links lidos, a tela NÃO inventa "não conciliada"
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/extrato-conciliacao.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const out = {};
  await BC_inicializar();

  // ── C. ANTES de ler os links: nada de ⏳ inventado ──
  BC_abrirExtrato('bmock1');
  const rotSem = [...document.querySelectorAll('#bcExtratoFiltros .bc-fil')].map(b => b.textContent.trim());
  out.semLinks = {
    indiceNaoOk: BC_concilIndice().ok === false,
    semRelogio: !document.getElementById('bcExtratoLista').innerHTML.includes('⏳'),
    semFiltroPendente: !rotSem.some(t => t.startsWith('⏳')),
    dizCarregando: rotSem.some(t => t.includes('carregando')),
    extratoJaFiltra: (BC_extratoFil('extrato'), document.querySelectorAll('#bcExtratoLista .bc-mov').length),
  };
  document.getElementById('bcExtratoBg').classList.remove('open');

  // ── A. agora com os links ──
  await MOD_conciliacao();
  const ix = BC_concilIndice();
  out.indice = {
    ok: ix.ok,
    match: [...ix.match],
    decidido: [...ix.decidido],
    naoGravaNada: !JSON.stringify(BC_MOVS).includes('conciliacaoId'),
    mesmaTarefaDaConciliacao: typeof MOD_conciliacao === 'function',
  };
  const mOk = BC_MOVS.find(m => m.id === 'mov_ofx_bmock1_FIT777');
  const mPend = BC_MOVS.find(m => m.id === 'mov_ofx_bmock1_FIT888');
  out.marcas = {
    achou: !!mOk && !!mPend,
    conciliadaOk: BC_movConciliado(mOk, ix) === true,
    pendenteNaoConciliada: BC_movConciliado(mPend, ix) === false,
    pendenteApareceComoPendente: BC_movConciliavel(mPend) && !BC_movDecidida(mPend, ix),
    // o que NÃO vem do banco não é conciliável (a Conciliação só olha origemTipo 'import')
    pagarNaoEhConciliavel: BC_movConciliavel({ id: 'x', origemTipo: 'pagar' }) === false,
    transfNaoEhConciliavel: BC_movConciliavel({ id: 'y', origemTipo: 'transferencia' }) === false,
    estornadaNaoEhConciliavel: BC_movConciliavel({ id: 'z', origemTipo: 'import', estornada: true }) === false,
    // mesma definição que a tela de Conciliação usa
    bateComConcMovs: CONC_movs().length === BC_MOVS.filter(BC_movDoExtrato).length,
  };
  // ignorada na Conciliação sai dos pendentes mas não vira ✅
  CONC_LINKS['ign_mov_ofx_bmock1_FIT888'] = { chave: 'ign_mov_ofx_bmock1_FIT888', status: 'ignorado', movId: 'mov_ofx_bmock1_FIT888' };
  const ix2 = BC_concilIndice();
  out.ignorada = { naoVira: BC_movConciliado(mPend, ix2) === false, saiDosPendentes: BC_movDecidida(mPend, ix2) === true };
  delete CONC_LINKS['ign_mov_ofx_bmock1_FIT888'];

  // ── B. a tela ──
  BC_abrirExtrato('bmock1');
  const rotulos = [...document.querySelectorAll('#bcExtratoFiltros .bc-fil')].map(b => b.textContent.trim());
  const conta = f => { BC_extratoFil(f); return document.querySelectorAll('#bcExtratoLista .bc-mov').length; };
  out.tela = {
    rotulos,
    temOsTres: ['📥 Extrato', '✅ Conciliadas', '⏳ A conciliar'].every(t => rotulos.some(x => x.startsWith(t))),
    todas: conta('todas'), extrato: conta('extrato'),
    conciliadas: conta('conciliadas'), aConciliar: conta('naoconciliadas'),
    entradas: conta('entradas'), saidas: conta('saidas'),
    transferencia: conta('transferencia'), ajuste: conta('ajuste'),
  };
  BC_extratoFil('todas');
  const html = document.getElementById('bcExtratoLista').innerHTML;
  out.selos = { check: html.includes('✅'), relogio: html.includes('⏳'), origem: html.includes('>extrato<') };
  // o selo não pode morar dentro do texto que trunca no celular
  out.truncagem = { seloForaDoTextoTruncado: !/text-overflow:ellipsis">[^<]*<span title="conciliada/.test(html) };
  out.resumo = document.getElementById('bcExtratoResumo').textContent;
  document.getElementById('bcExtratoBg').classList.remove('open');
  return out;
});
await browser.close();

let falhas = 0;
const ok = (nome, cond, det) => { console.log((cond ? '✅' : '❌') + ' ' + nome + (det !== undefined ? ' → ' + JSON.stringify(det) : '')); if (!cond) falhas++; };

console.log('\n── C. honestidade antes dos links chegarem ──');
ok('índice se declara não-confiável', r.semLinks.indiceNaoOk);
ok('não pinta ⏳ na linha', r.semLinks.semRelogio);
ok('esconde o filtro "A conciliar"', r.semLinks.semFiltroPendente);
ok('avisa "carregando…"', r.semLinks.dizCarregando);
ok('📥 Extrato já funciona sem os links', r.semLinks.extratoJaFiltra === 2, r.semLinks.extratoJaFiltra);

console.log('\n── A. marca derivada do CONC_LINKS (movId) ──');
ok('links lidos pela MESMA tarefa da Conciliação', r.indice.ok && r.indice.mesmaTarefaDaConciliacao);
ok('indexou o movId conciliado', r.indice.match.includes('mov_ofx_bmock1_FIT777'), r.indice.match);
ok('NÃO grava nada na movimentação (é derivado)', r.indice.naoGravaNada);
ok('achou as duas movimentações do extrato', r.marcas.achou);
ok('a casada aparece como ✅', r.marcas.conciliadaOk);
ok('a outra NÃO aparece como ✅', r.marcas.pendenteNaoConciliada);
ok('a outra aparece como pendente', r.marcas.pendenteApareceComoPendente);
ok('pagamento/transferência não são conciliáveis', r.marcas.pagarNaoEhConciliavel && r.marcas.transfNaoEhConciliavel, r.marcas);
ok('estornada não é conciliável', r.marcas.estornadaNaoEhConciliavel);
ok('mesma definição de CONC_movs()', r.marcas.bateComConcMovs);
ok('ignorada sai dos pendentes sem virar ✅', r.ignorada.naoVira && r.ignorada.saiDosPendentes, r.ignorada);

console.log('\n── B. filtros e selos na tela ──');
ok('os 3 filtros novos existem', r.tela.temOsTres, r.tela.rotulos);
ok('📥 Extrato = 2', r.tela.extrato === 2, r.tela.extrato);
ok('✅ Conciliadas = 1', r.tela.conciliadas === 1, r.tela.conciliadas);
ok('⏳ A conciliar = 1', r.tela.aConciliar === 1, r.tela.aConciliar);
ok('conciliadas + a conciliar = extrato', r.tela.conciliadas + r.tela.aConciliar === r.tela.extrato, r.tela);
ok('filtros antigos seguem de pé', r.tela.entradas + r.tela.saidas > 0, { e: r.tela.entradas, s: r.tela.saidas, t: r.tela.transferencia, a: r.tela.ajuste });
ok('selos ✅ ⏳ e "extrato" na linha', r.selos.check && r.selos.relogio && r.selos.origem, r.selos);
ok('selo fora do texto que trunca no celular', r.truncagem.seloForaDoTextoTruncado);
ok('resumo mostra o pendente', /a conciliar/.test(r.resumo), r.resumo);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
