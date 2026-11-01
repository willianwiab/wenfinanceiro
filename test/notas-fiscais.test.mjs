// Aba Notas Fiscais — Fase 1, controle sem emissão (01/11/2026). Roda 100% em ?mock=1.
// A promessa central: um lançamento faturado NÃO volta para a fila. É isso que o sistema
// não sabia fazer e é o que impede faturar o mesmo episódio duas vezes.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/notas-fiscais.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
page.on('dialog', d => d.accept());
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3200);

const r = await page.evaluate(async () => {
  const out = {};
  const $ = id => document.getElementById(id);
  const ir = async () => { const b = [...document.querySelectorAll('.nav-main button')].find(x => /Notas Fiscais/.test(x.textContent));
    showMain('notas', b); await new Promise(r => setTimeout(r, 900)); };

  out.temBotaoNoMenu = [...document.querySelectorAll('.nav-main button')].some(b => /Notas Fiscais/.test(b.textContent));
  await NF_carregar();
  await ir();

  // dados: dois clientes no mês corrente
  const mes = R_mesAtual;
  R_todosOsDados.push(
    { id: 'nf-l1', cliente: 'CLIENTE ALFA', mes, data: '05/11', horas: 3, valorTotal: 2400, valorReserva: 2400, saldo: 0, studio: 'STUDIO A' },
    { id: 'nf-l2', cliente: 'CLIENTE ALFA', mes, data: '12/11', horas: 3, valorTotal: 2400, valorReserva: 0, saldo: 2400, studio: 'STUDIO A' },
    { id: 'nf-l3', cliente: 'CLIENTE BETA', mes, data: '08/11', horas: 2, valorTotal: 1600, valorReserva: 1600, saldo: 0, studio: 'STUDIO B' });
  $('nfFMesIni').value = mes; $('nfFMesFim').value = mes; $('nfFCliente').value = '';
  NF_montar();

  const fila = () => NF_fila().map(g => ({ cliente: g.cliente, grav: g.grav, valor: g.valor, ids: g.ids.length }));
  out.filaInicial = fila();
  out.naoPagoAparece = NF_fila().some(g => g.cliente === 'CLIENTE ALFA' && g.aberto === 1);
  out.linhasNaTela = document.querySelectorAll('#nfConteudo .nf-lin.fila').length;

  // registra a nota do ALFA
  const iAlfa = NF_fila().findIndex(g => g.cliente === 'CLIENTE ALFA');
  NF_abrirNova(iAlfa);
  out.modal = { abriu: $('nfModalBg').classList.contains('open'),
                valorPreenchido: $('nfFValor').value, temDescricao: /produção audiovisual/.test($('nfFDesc').value) };
  $('nfFNumero').value = '00012345';
  await NF_salvar();
  await new Promise(r => setTimeout(r, 400));

  out.depois = { fila: fila(), fechouModal: !$('nfModalBg').classList.contains('open') };
  // ── A PROMESSA: o faturado não volta ──
  out.alfaSaiuDaFila = !NF_fila().some(g => g.cliente === 'CLIENTE ALFA');
  out.betaFicou = NF_fila().some(g => g.cliente === 'CLIENTE BETA');

  const nota = Object.values(NF_NOTAS).find(n => n.numero === '00012345');
  out.notaGravada = { existe: !!nota, vinculou: nota && nota.lancamentoIds.length === 2,
                      valor: nota && nota.valor, status: nota && nota.status,
                      guardaCliente: nota && nota.cliente === 'CLIENTE ALFA' };

  // foi para a NUVEM, não só pra memória
  const naNuvem = await fetch(`${FS_URL}/notas_fiscais?key=${FB_API_KEY}`).then(r => r.json());
  out.naNuvem = (naNuvem.documents || []).some(d => d.fields?.numero?.stringValue === '00012345');

  // Receber INTOCÁVEL: nenhum campo novo no lançamento
  const l1 = R_todosOsDados.find(x => x.id === 'nf-l1');
  out.receberIntacto = !('notaFiscal' in l1) && !('numeroNF' in l1) && !('nfId' in l1);

  // aba Emitidas
  NF_setAba('emitidas');
  out.emitidas = { linhas: document.querySelectorAll('#nfConteudo .nf-lin.emit').length,
                   mostraNumero: /00012345/.test($('nfConteudo').textContent) };

  // divergência: editar o lançamento DEPOIS de faturar
  R_todosOsDados.find(x => x.id === 'nf-l1').valorTotal = 3000;
  NF_setAba('diverg');
  out.diverg = { achou: NF_divergencias().length >= 1,
                 explica: /lançamentos somam/.test($('nfConteudo').textContent) };
  R_todosOsDados.find(x => x.id === 'nf-l1').valorTotal = 2400;

  // cancelar devolve para a fila; reativar tira de novo
  await NF_cancelar(nota.id); await new Promise(r => setTimeout(r, 300));
  out.cancelou = { voltouParaFila: NF_fila().some(g => g.cliente === 'CLIENTE ALFA'), status: NF_NOTAS[nota.id].status };
  await NF_cancelar(nota.id); await new Promise(r => setTimeout(r, 300));
  out.reativou = { saiuDeNovo: !NF_fila().some(g => g.cliente === 'CLIENTE ALFA'), status: NF_NOTAS[nota.id].status };

  // GUARDA: leitura da nuvem falhou → a tela avisa em vez de dizer "tudo a faturar"
  const fetchReal = window.fetch;
  window.fetch = (u, o) => (typeof u === 'string' && u.includes('notas_fiscais') && (!o || !o.method || o.method === 'GET'))
    ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }) : fetchReal(u, o);
  await NF_carregar(); NF_montar();
  window.fetch = fetchReal;
  out.guarda = { okFalso: NF_ok === false, avisouNaTela: /não sei o que já foi faturado/.test($('nfAviso').textContent) };
  await NF_carregar(); NF_montar();

  // excluir de vez
  await NF_excluir(nota.id); await new Promise(r => setTimeout(r, 300));
  out.excluiu = { sumiu: !NF_NOTAS[nota.id], voltouParaFila: NF_fila().some(g => g.cliente === 'CLIENTE ALFA') };
  return out;
});
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── a aba existe e a fila sai do fechamento ──');
ok('botão no menu principal', r.temBotaoNoMenu);
ok('a fila agrupa por cliente', r.filaInicial.length === 2, r.filaInicial);
ok('junta as 2 gravações do mesmo cliente', r.filaInicial.some(g => g.cliente === 'CLIENTE ALFA' && g.grav === 2 && g.valor === 4800), r.filaInicial);
ok('gravação NÃO paga aparece na fila (segue o fechamento)', r.naoPagoAparece);
ok('a tela desenha as linhas', r.linhasNaTela === 2, r.linhasNaTela);

console.log('\n── registrar a nota ──');
ok('o modal abre já preenchido', r.modal.abriu && r.modal.valorPreenchido === '4800.00' && r.modal.temDescricao, r.modal);
ok('salva e fecha', r.depois.fechouModal);
ok('a nota guarda o vínculo com os 2 lançamentos', r.notaGravada.vinculou, r.notaGravada);
ok('vai para a NUVEM, não só pra memória', r.naNuvem);

console.log('\n── a promessa: faturado não volta ──');
ok('ALFA sai da fila', r.alfaSaiuDaFila);
ok('BETA continua na fila', r.betaFicou);
ok('Receber INTOCÁVEL — nenhum campo novo no lançamento', r.receberIntacto);

console.log('\n── emitidas e divergências ──');
ok('a nota aparece em Emitidas com o número', r.emitidas.linhas === 1 && r.emitidas.mostraNumero, r.emitidas);
ok('editar o lançamento depois de faturar vira divergência', r.diverg.achou && r.diverg.explica, r.diverg);

console.log('\n── cancelar, reativar, excluir ──');
ok('cancelar devolve para a fila', r.cancelou.voltouParaFila && r.cancelou.status === 'cancelada', r.cancelou);
ok('reativar tira da fila de novo', r.reativou.saiuDeNovo && r.reativou.status === 'emitida', r.reativou);
ok('excluir devolve para a fila', r.excluiu.sumiu && r.excluiu.voltouParaFila, r.excluiu);

console.log('\n── a guarda que importa ──');
ok('leitura falhou → avisa em vez de dizer "tudo a faturar"', r.guarda.okFalso && r.guarda.avisouNaTela, r.guarda);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
