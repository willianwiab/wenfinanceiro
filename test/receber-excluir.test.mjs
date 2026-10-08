// Exclusão no Receber (08/10/2026) — roda 100% em ?mock=1.
// O lançamento que "não saía": PATCH sem updateMask substituía o documento, ele perdia o
// campo `id`, e o sync incremental não conseguia casar a exclusão com nada.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/receber-excluir.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
page.on('dialog', d => d.accept());
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const out = {};
  const doc = async id => {
    const res = await fetch(`${FS_URL}/lancamentos/${encodeURIComponent(id)}?key=${FB_API_KEY}`);
    return { status: res.status, json: await res.json().catch(() => ({})) };
  };

  // ── 1. o PATCH agora MESCLA: o documento não perde os campos ──
  const alvo = { id: 'rdel1', cliente: 'STAFF - ACADEMIA DE VENDAS', mes: 'OUT/2026', data: '06/10/2026',
                 studio: 'STUDIO A', horas: 4.5, valorTotal: 7200, valorReserva: 0, saldo: 7200, googleEventId: 'ev_x' };
  await R_fbSalvar(alvo); R_todosOsDados.push(alvo);
  const res1 = await R_fbExcluir('rdel1');
  const d1 = await doc('rdel1');
  // O mock mescla no PATCH tenha máscara ou não — então a garantia de MESCLA no Firestore
  // real depende de o updateMask estar na URL. Isso se prova no código, não no mock.
  out.mascara = {
    temUpdateMask: /updateMask\.fieldPaths=excluido/.test(R_fbExcluir.toString()),
    temPlanoB: /R_fbAcharDocId/.test(R_fbExcluir.toString()),
    temPlanoC: /method:'DELETE'/.test(R_fbExcluir.toString()),
  };
  out.mescla = {
    devolveOk: res1 && res1.ok === true, via: res1 && res1.via,
    marcouExcluido: d1.json.fields?.excluido?.booleanValue === true,
    manteveCliente: !!d1.json.fields?.cliente,
    manteveId: !!d1.json.fields?.id,
    campos: Object.keys(d1.json.fields || {}).length,
  };

  // ── 2. sai do Receber numa releitura completa ──
  await R_carregarTodos(true);
  out.saiNoFull = !R_todosOsDados.some(x => x.id === 'rdel1');

  // ── 3. RETROATIVO: documento já estragado (só `excluido`, sem `id`) também some ──
  // é o estado em que os registros antigos ficaram, e era o que fazia eles voltarem pra sempre
  await fetch(`${FS_URL}/lancamentos/rdel2?key=${FB_API_KEY}`, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { excluido: { booleanValue: true }, atualizadoEm: { stringValue: new Date().toISOString() } } }) });
  const d2 = await doc('rdel2');
  out.estragado = { semCampoId: !d2.json.fields?.id, campos: Object.keys(d2.json.fields || {}) };
  // o cache local ainda acha que existe — é a situação real do Will
  R_todosOsDados.push({ id: 'rdel2', cliente: 'FANTASMA', mes: 'OUT/2026', valorTotal: 1, valorReserva: 0, saldo: 1 });
  R_salvarCacheLocal();
  localStorage.setItem('wen_lancamentos_last_sync', new Date(Date.now() - 86400000).toISOString());
  localStorage.setItem('wen_lancamentos_last_full', new Date().toISOString());  // força o caminho INCREMENTAL
  await R_carregarTodos();
  out.retroativo = { sumiuNoIncremental: !R_todosOsDados.some(x => x.id === 'rdel2') };

  // ── 4. falha na nuvem: a linha VOLTA e o aviso é honesto ──
  const alvo3 = { id: 'rdel3', cliente: 'NAO DEVE SUMIR', mes: 'OUT/2026', valorTotal: 500, valorReserva: 0, saldo: 500 };
  await R_fbSalvar(alvo3); R_todosOsDados.push(alvo3);
  const fetchReal = window.fetch;
  window.fetch = (u, o) => (typeof u === 'string' && u.includes('lancamentos') && o && o.method && o.method !== 'GET')
    ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }) : fetchReal(u, o);
  const res3 = await R_fbExcluir('rdel3');
  R_ridParaExcluir = 'rdel3';
  await R_confirmarExcluir();
  window.fetch = fetchReal;
  out.falha = {
    devolveNaoOk: res3 && res3.ok === false,
    continuaNaLista: R_todosOsDados.some(x => x.id === 'rdel3'),
    naoMentiu: true,
  };
  return out;
});
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── o PATCH mescla em vez de substituir ──');
ok('a URL leva updateMask (é o que garante a mesclagem no Firestore real)', r.mascara.temUpdateMask);
ok('tem plano B: achar o documento real pelo campo id', r.mascara.temPlanoB);
ok('tem plano C: apagar o documento de vez', r.mascara.temPlanoC);
ok('a exclusão devolve ok', r.mescla.devolveOk, { via: r.mescla.via });
ok('marcou excluido:true', r.mescla.marcouExcluido);
ok('o documento MANTÉM cliente e id', r.mescla.manteveCliente && r.mescla.manteveId, r.mescla);
ok('não virou um toco de 2 campos', r.mescla.campos > 5, r.mescla.campos);
ok('some do Receber na releitura completa', r.saiNoFull);

console.log('\n── retroativo: documento já estragado ──');
ok('o estrago é reproduzível (doc sem campo id)', r.estragado.semCampoId, r.estragado.campos);
ok('mesmo assim a exclusão se aplica no sync incremental', r.retroativo.sumiuNoIncremental);

console.log('\n── quando a nuvem recusa ──');
ok('a exclusão devolve NÃO ok', r.falha.devolveNaoOk);
ok('o lançamento CONTINUA na lista (não mente mais)', r.falha.continuaNaLista);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
