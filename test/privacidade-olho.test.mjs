// 👁 Modo privado (12/11/2026) — roda 100% em ?mock=1.
// Pedido do Will: "esconda os valores com o olinho, para não ficar mostrando valores na tela".
//
// A promessa que importa: mascara a TELA e NUNCA o que SAI do sistema. O texto de fechamento
// que vai pro cliente, o Excel e o CSV têm que continuar com o número real — mandar "••••" pro
// cliente seria o oposto do que o recurso serve.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/privacidade-olho.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3200);

const r = await page.evaluate(async () => {
  const out = {};
  out.temBotao = !!document.getElementById('privBtn');
  out.comecaDesligado = PRIV_on === false;
  out.fmtNormal = fmt(2200);
  out.fmtRealExiste = typeof fmtReal === 'function';

  PRIV_alternar();                       // liga
  await new Promise(r => setTimeout(r, 600));
  out.ligado = {
    estado: PRIV_on,
    fmt: fmt(2200),
    fmtReal: fmtReal(2200),              // nunca mascara
    eixo: PRIV_eixo(12000),
    bodyTemClasse: document.body.classList.contains('privado'),
    botao: document.getElementById('privBtn').textContent.trim(),
    guardado: localStorage.getItem('wen_privacidade'),
  };

  // o texto que vai pro CLIENTE não pode mascarar
  R_todosOsDados.push({ id: 'pz1', cliente: 'CLIENTE PRIVACIDADE', mes: R_mesAtual, data: '05/11',
                        horas: 2, valorTotal: 3333, valorReserva: 0, saldo: 3333, studio: 'STUDIO A' });
  const f = document.getElementById('rFechCliente'); if (f) f.value = 'CLIENTE PRIVACIDADE';
  const i = document.getElementById('rFechMesIni'); if (i) i.value = R_mesAtual;
  const m = document.getElementById('rFechMesFim'); if (m) m.value = R_mesAtual;
  // o texto vai pra área de transferência — intercepta para ler
  let copiado = null;
  try {
    const falso = { writeText: t => { copiado = t; return Promise.resolve(); } };
    Object.defineProperty(navigator, 'clipboard', { value: falso, configurable: true });
    copiarWhatsAppR();
    await new Promise(r => setTimeout(r, 400));
  } catch (e) { copiado = 'ERRO: ' + e.message; }
  out.fechamento = { temMascara: /••/.test(String(copiado || '')), temValorReal: /3\.333,00/.test(String(copiado || '')), amostra: String(copiado || '').slice(0, 0) };

  // relatório: exportar no modo privado tem que ser barrado, não gerar arquivo com ••••
  out.rptBarrado = (() => {
    try {
      RPT_ultimo = { linhas: [['x', 'R$ ••••••']], colunas: ['a', 'b'], titulo: 't', periodo: 'p' };
      let baixou = false;
      const bk = window.BKP_baixar; window.BKP_baixar = () => { baixou = true; };
      RPT_exportarCSV();
      window.BKP_baixar = bk;
      return !baixou;
    } catch (e) { return 'ERRO: ' + e.message; }
  })();

  PRIV_alternar();                       // desliga
  await new Promise(r => setTimeout(r, 600));
  out.desligado = { estado: PRIV_on, fmt: fmt(2200), bodyTemClasse: document.body.classList.contains('privado'),
                    botao: document.getElementById('privBtn').textContent.trim(), guardado: localStorage.getItem('wen_privacidade') };
  return out;
});
await browser.close();

const f = [];
const eq = (o, e, q) => { if (String(o) !== String(e)) f.push(`${q}: esperado "${e}", veio "${o}"`); };

if (!r.temBotao)        f.push('o botão 👁 não está no cabeçalho');
if (!r.comecaDesligado) f.push('tem que começar desligado');
if (!r.fmtRealExiste)   f.push('fmtReal não existe');
eq(r.fmtNormal, 'R$ 2.200,00', 'fmt normal');
eq(r.ligado.estado, 'true', 'liga');
eq(r.ligado.fmt, 'R$ ••••••', 'fmt mascarado na tela');
eq(r.ligado.fmtReal, 'R$ 2.200,00', 'fmtReal NUNCA mascara');
eq(r.ligado.eixo, '•••', 'eixo do gráfico mascarado');
eq(r.ligado.bodyTemClasse, 'true', 'body.privado (borra os gráficos)');
eq(r.ligado.botao, '🙈', 'ícone do botão quando ligado');
eq(r.ligado.guardado, '1', 'guarda a escolha no aparelho');
if (r.fechamento.temMascara)    f.push('🔴 o texto de fechamento do CLIENTE saiu mascarado');
if (!r.fechamento.temValorReal) f.push('o texto de fechamento tem que trazer o valor real (3.333,00)');
if (r.rptBarrado !== true)      f.push('exportar o relatório no modo privado tem que ser barrado → ' + r.rptBarrado);
eq(r.desligado.estado, 'false', 'desliga');
eq(r.desligado.fmt, 'R$ 2.200,00', 'volta a mostrar');
eq(r.desligado.bodyTemClasse, 'false', 'tira a classe do body');
eq(r.desligado.botao, '👁️', 'ícone do botão quando desligado');
eq(r.desligado.guardado, '0', 'guarda o desligado também');
if (erros.length) f.push('erros de página: ' + erros.join(' | '));

if (f.length) { console.error('❌ privacidade-olho\n   - ' + f.join('\n   - ')); process.exit(1); }
console.log('✅ privacidade-olho: mascara a tela, nunca o que sai pro cliente ou pro arquivo');
