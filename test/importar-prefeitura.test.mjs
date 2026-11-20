// Importação das notas da Prefeitura (CSV) — 100% em ?mock=1. Prova: prévia não grava; vínculo só quando a soma
// bate; ambíguo pede escolha; repetida é ignorada; diária vinculada sai da fila; ninguém vira nota duas vezes.
import { chromium } from 'playwright';
import fs from 'fs';
const [URL, DIR] = process.argv.slice(2);
if (!URL || !DIR) { console.error('uso: node test/importar-prefeitura.test.mjs <url-?mock=1> <pasta-dos-csv>'); process.exit(2); }
const textos = fs.readdirSync(DIR).filter(f => f.endsWith('.csv')).sort()
  .map(f => new TextDecoder('windows-1252').decode(fs.readFileSync(DIR + '/' + f)));
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e))); page.on('dialog', d => d.accept());
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(3200);
const r = await page.evaluate(async (textos) => {
  const out = {}; await NF_carregar();
  const mes = R_mesAtual, pp = textos.map(t => NFP.lerCSV(t).notas).flat();
  const n426 = pp.find(n => n.numero === '426'), n425 = pp.find(n => n.numero === '425'), n424 = pp.find(n => n.numero === '424');
  // 426 Zest 7400 → exatamente 1 diária. 425 Quintessa 1800 → 2 combinações (ambíguo). 424 Cartpanda: sem diária.
  R_todosOsDados.push(
    { id: 'z1', cliente: n426.cliente, mes, data: '03/11', horas: 4, valorTotal: 7400, saldo: 0, studio: 'STUDIO A' },
    { id: 'q1', cliente: n425.cliente, mes, data: '01/11', horas: 1, valorTotal: 1800, saldo: 0, studio: 'STUDIO A' },
    { id: 'q2', cliente: n425.cliente, mes, data: '02/11', horas: 1, valorTotal: 1800, saldo: 0, studio: 'STUDIO B' });
  const antes = Object.keys(NF_NOTAS).length, filaAntes = NF_ativas().length;
  NFIMP_abrir(); const L = NFIMP_texto(textos);
  out.total = L.length; out.previaNaoGrava = Object.keys(NF_NOTAS).length === antes;
  const lin = n => L.find(l => l.n.numero === n);
  out.z = { marcar: lin('426').marcar, ids: lin('426').combos[0]?.map(x => x.id) };
  out.q = { combos: lin('425').combos.length, marcar: lin('425').marcar };
  out.semDiaria = { combos: lin('424').combos.length, marcar: lin('424').marcar };
  out.setembroDesmarcado = L.filter(l => l.n.dataISO < '2026-10-01' && l.n.status !== 'cancelada').every(l => !l.marcar);
  out.canceladaMarcada = lin('412').marcar;
  // grava: marca 426 (único), escolhe q1 na 425 e marca, mais a cancelada
  lin('425').marcar = true; lin('425').sel = 0;
  const idQ = lin('425').combos[0].map(x => x.id);
  await NFIMP_gravar();
  out.gravadas = Object.values(NF_NOTAS).filter(n => n.origem === 'prefeitura-sp-csv').map(n => n.numero).sort();
  const ids = NF_idsFaturados(); out.z1Faturada = ids.has('z1'); out.escolhidaFaturada = idQ.every(i => ids.has(i));
  out.outraQ_naFila = NF_fila().some(g => g.ids.includes(idQ[0] === 'q1' ? 'q2' : 'q1'));
  // 2ª importação: tudo vira "já registrada"
  NFIMP_abrir(); const L2 = NFIMP_texto(textos);
  out.segundaRodada = { jaExiste: L2.filter(l => l.ja).length, novas: L2.filter(l => !l.ja && l.marcar).length };
  out.canceladaSemVinculo = (Object.values(NF_NOTAS).find(n => n.numero === '412')?.lancamentoIds || []).length === 0;
  return out;
}, textos);
console.log(JSON.stringify(r, null, 1)); await browser.close();
const falhas = [];
const ck = (c, m) => { if (!c) falhas.push(m); };
ck(r.total === 20, 'deveria listar 20'); ck(r.previaNaoGrava, 'prévia gravou');
ck(r.z.marcar && r.z.ids?.join() === 'z1', 'vínculo único da 426'); ck(r.q.combos === 2 && !r.q.marcar, '425 deveria ser ambígua e desmarcada');
ck(r.semDiaria.combos === 0 && !r.semDiaria.marcar, '424 sem diária desmarcada'); ck(r.setembroDesmarcado, 'setembro entrou');
ck(r.canceladaMarcada, '412 cancelada deveria vir marcada'); ck(r.gravadas.join() === '412,425,426', 'gravadas: ' + r.gravadas);
ck(r.z1Faturada && r.escolhidaFaturada, 'diárias deveriam sair da fila'); ck(r.outraQ_naFila, 'a outra diária da Quintessa deveria continuar na fila');
ck(r.segundaRodada.jaExiste === 3 && r.segundaRodada.novas === 0, 'segunda rodada duplicaria'); ck(r.canceladaSemVinculo, '412 com diárias');
ck(!erros.length, 'erros de página: ' + erros.join(' | '));
if (falhas.length) { console.error('FALHOU:\n- ' + falhas.join('\n- ')); process.exit(1); } console.log('✅ importar-prefeitura ok');
