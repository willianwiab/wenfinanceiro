// Conta fixa: 12 meses sem perguntar (05/11/2026) — roda 100% em ?mock=1.
//
// Pedido do Will: "Se eu selecionar conta fixa, ela só deixar de ser fixa quando eu desafixar.
// cadastre 12 meses. E não tem a necessidade de perguntar os meses que eu quero que lance."
// O que limitava: o seletor "Adicionar em quais meses?" só oferecia mês que JÁ EXISTIA no banco
// (`P_getMesesOrdenados` lê `Object.keys(P_meses)`), então de nov/26 em diante só havia 6.
//
// Junto vai o conserto de um bug achado no caminho: `P_getMesesFuturos`/`Passados` comparavam o
// NOME do mês como texto ("DEZ" < "NOV" no alfabeto) e devolviam os dois INVERTIDOS.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/conta-fixa-12-meses.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
page.on('dialog', d => d.accept());          // aceita o confirm do desafixar
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3200);

const r = await page.evaluate(async () => {
  const out = {};
  const nb = [...document.querySelectorAll('.nav-main button')].find(b => /A Pagar/.test(b.textContent));
  showMain('pagar', nb);
  await new Promise(r => setTimeout(r, 1500));

  // ── 1) a ordem de mês, que estava invertida ──
  P_mesAtual = 'NOV/2026';
  P_meses = { 'SET/2026': [], 'OUT/2026': [], 'NOV/2026': [], 'DEZ/2026': [], 'JAN/2027': [] };
  out.futuros  = P_getMesesFuturos();
  out.passados = P_getMesesPassados();

  // ── 2) gerar 12 meses virando o ano ──
  out.doze = P_mesesAFrente('NOV/2026', 12);

  // ── 3) criar conta FIXA: não pergunta mês, nasce em 12 ──
  P_meses = { 'NOV/2026': [] };
  P_editandoId = null; P_editandoMes = null;
  abrirModalP();
  document.getElementById('pFNome').value = 'LARISSA';
  document.getElementById('pFValor').value = '2500';
  document.getElementById('pFDia').value = '5';
  document.getElementById('pFStatus').value = 'PENDENTE';
  document.getElementById('pFFixa').checked = true;
  P_refletirFixa();
  out.seletorEscondido = document.getElementById('pMesesGrupo').style.display === 'none';
  out.avisoVisivel     = document.getElementById('pFixaAviso').style.display === 'block';
  out.avisoDizMes      = document.getElementById('pFixaMesIni').textContent;
  salvarContaP();
  await new Promise(r => setTimeout(r, 400));

  const temLarissa = m => (P_meses[m] || []).filter(x => x.nome === 'LARISSA').length;
  out.mesesComLarissa = Object.keys(P_meses).filter(m => temLarissa(m) > 0).length;
  out.criouMesNovo    = !!P_meses['OUT/2027'];          // 12º mês a partir de NOV/2026
  out.todasFixas      = Object.keys(P_meses).every(m => (P_meses[m]||[]).filter(x=>x.nome==='LARISSA').every(x => x.fixa === true));
  out.umaPorMes       = Object.keys(P_meses).every(m => temLarissa(m) <= 1);

  // ── 4) salvar de novo não duplica ──
  P_editandoId = null;
  abrirModalP();
  document.getElementById('pFNome').value = 'LARISSA';
  document.getElementById('pFValor').value = '2500';
  document.getElementById('pFFixa').checked = true;
  P_refletirFixa();
  salvarContaP();
  await new Promise(r => setTimeout(r, 400));
  out.depoisDeSalvarDeNovo = Object.keys(P_meses).reduce((a, m) => a + temLarissa(m), 0);

  // ── 5) desafixar remove só as futuras NÃO pagas ──
  // marca DEZ como paga e JAN como parcial: as duas têm que sobreviver
  const dez = P_meses['DEZ/2026'].find(x => x.nome === 'LARISSA'); dez.status = 'PAGO'; dez.valorPago = 2500;
  const jan = P_meses['JAN/2027'].find(x => x.nome === 'LARISSA'); jan.status = 'PARCIAL'; jan.valorPago = 500;
  const nov = P_meses['NOV/2026'].find(x => x.nome === 'LARISSA');
  const antes = Object.keys(P_meses).reduce((a, m) => a + temLarissa(m), 0);

  P_editandoId = nov.id; P_editandoMes = 'NOV/2026';
  abrirModalP(nov.id);
  document.getElementById('pFFixa').checked = false;     // DESAFIXA
  P_refletirFixa();
  salvarContaP();
  await new Promise(r => setTimeout(r, 500));

  out.desafixar = {
    antes,
    depois: Object.keys(P_meses).reduce((a, m) => a + temLarissa(m), 0),
    pagaSobreviveu:    temLarissa('DEZ/2026') === 1,
    parcialSobreviveu: temLarissa('JAN/2027') === 1,
    mesAtualSobreviveu: temLarissa('NOV/2026') === 1,
  };
  return out;
});
await browser.close();

const f = [];
const eq = (o, e, q) => { const a = JSON.stringify(o), b = JSON.stringify(e);
                          if (a !== b) f.push(`${q}: esperado ${b}, veio ${a}`); };

eq(r.futuros,  ['DEZ/2026', 'JAN/2027'], 'meses futuros (estavam invertidos)');
eq(r.passados, ['SET/2026', 'OUT/2026'], 'meses passados (estavam invertidos)');
eq(r.doze.length, 12, '12 meses gerados');
eq(r.doze[0],  'NOV/2026', 'primeiro mês gerado');
eq(r.doze[11], 'OUT/2027', 'último mês gerado (vira o ano)');
if (!r.seletorEscondido) f.push('com Fixa marcada o seletor de meses tem que sumir');
if (!r.avisoVisivel)     f.push('com Fixa marcada o aviso dos 12 meses tem que aparecer');
eq(r.avisoDizMes, 'NOV/2026', 'o aviso diz de que mês parte');
eq(r.mesesComLarissa, 12, 'a conta fixa nasce em 12 meses');
if (!r.criouMesNovo)  f.push('tem que CRIAR o mês que ainda não existia no banco (OUT/2027)');
if (!r.todasFixas)    f.push('todas as 12 ocorrências têm que nascer com fixa=true');
if (!r.umaPorMes)     f.push('não pode haver mais de uma ocorrência por mês');
eq(r.depoisDeSalvarDeNovo, 12, 'salvar a mesma conta fixa de novo NÃO duplica');
eq(r.desafixar.depois, 3, 'desafixar deixa só mês atual + paga + parcial');
if (!r.desafixar.pagaSobreviveu)     f.push('a ocorrência PAGA não pode ser removida');
if (!r.desafixar.parcialSobreviveu)  f.push('a ocorrência PARCIAL não pode ser removida');
if (!r.desafixar.mesAtualSobreviveu) f.push('o mês atual não pode ser removido');
if (erros.length) f.push('erros de página: ' + erros.join(' | '));

if (f.length) { console.error('❌ conta-fixa-12-meses\n   - ' + f.join('\n   - ')); process.exit(1); }
console.log('✅ conta-fixa-12-meses: fixa nasce em 12 meses sem perguntar; desafixar só tira as não pagas');
