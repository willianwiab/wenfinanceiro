// Dispensar notificações do sininho (08/10/2026) — roda 100% em ?mock=1.
// A dispensa vai pra NUVEM (coleção agenda_notif_dispensadas), não pro localStorage,
// e NÃO toca no lançamento: some o aviso, o dado continua lá.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/notif-dispensar.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
page.on('dialog', d => d.accept());
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const out = {};
  // dois lançamentos presos a eventos de agenda que não vêm mais nos "confirmados" = cancelados
  R_todosOsDados.push(
    { id: 'rnot1', cliente: 'STAFF - ACADEMIA DE VENDAS', mes: 'OUT/2026', data: '06/10/2026', valorTotal: 7200, valorReserva: 0, saldo: 7200, googleEventId: 'evt_sumido_1' },
    { id: 'rnot2', cliente: 'HOLD VENDENDO VALOR', mes: 'OUT/2026', data: '07/10/2026', valorTotal: 3000, valorReserva: 0, saldo: 3000, googleEventId: 'evt_sumido_2' });
  const pintar = () => atualizarNotificacoes([], []);
  pintar();
  const txt = () => document.getElementById('notifConteudo').textContent;
  const badge = () => document.getElementById('notifBadge').textContent;
  out.inicial = { badge: badge(), temOsDois: /ACADEMIA DE VENDAS/.test(txt()) && /HOLD VENDENDO VALOR/.test(txt()),
                  temX: document.querySelectorAll('.notif-x').length, temLimparTodas: /limpar todas/.test(txt()) };

  // ── dispensar uma ──
  await R_dispensarNotif('rnot1', 'cancelado', 'STAFF');
  out.depoisDeUma = {
    sumiuDaLista: !/ACADEMIA DE VENDAS/.test(txt()),
    aOutraFicou: /HOLD VENDENDO VALOR/.test(txt()),
    badge: badge(),
    lancamentoIntacto: !!R_todosOsDados.find(x => x.id === 'rnot1'),   // NÃO apaga o dado
    temRodapeRestaurar: /Restaurar/.test(txt()),
  };

  // ── foi pra nuvem, não pro localStorage ──
  const naNuvem = await fetch(`${FS_URL}/agenda_notif_dispensadas?key=${FB_API_KEY}`).then(r => r.json());
  out.nuvem = {
    gravou: (naNuvem.documents || []).some(d => (d.fields?.chave?.stringValue) === 'rnot1'),
    naoUsaLocalStorage: !Object.keys(localStorage).some(k => /notif.*disp|disp.*notif/i.test(k)),
  };
  // e sobrevive a uma releitura da nuvem
  R_notifDispensadas = {};
  await R_carregarNotifDispensadas();
  pintar();
  out.sobrevive = { aindaDispensada: !/ACADEMIA DE VENDAS/.test(txt()), carregou: !!R_notifDispensadas['rnot1'] };

  // ── guarda: se a LEITURA falhar, não perde as dispensas ──
  const fetchReal = window.fetch;
  window.fetch = (u, o) => (typeof u === 'string' && u.includes('agenda_notif_dispensadas') && (!o || !o.method || o.method === 'GET'))
    ? Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) }) : fetchReal(u, o);
  await R_carregarNotifDispensadas();
  window.fetch = fetchReal;
  out.guarda = { manteve: !!R_notifDispensadas['rnot1'] };

  // ── limpar todas ──
  window.confirm = () => true;
  await R_dispensarVarias('rnot2', 'cancelado');
  pintar();
  out.limparTodas = { listaVazia: /Sem notificações/.test(txt()), badge: badge() };

  // ── restaurar ──
  await R_restaurarNotifs();
  pintar();
  out.restaurar = { voltaramOsDois: /ACADEMIA DE VENDAS/.test(txt()) && /HOLD VENDENDO VALOR/.test(txt()), badge: badge() };
  return out;
});
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── o painel ──');
ok('lista os cancelados com badge', r.inicial.badge === '2' && r.inicial.temOsDois, r.inicial);
ok('cada item tem o ✕', r.inicial.temX === 2, r.inicial.temX);
ok('a seção tem "limpar todas"', r.inicial.temLimparTodas);

console.log('\n── dispensar uma ──');
ok('some do painel', r.depoisDeUma.sumiuDaLista);
ok('a outra continua', r.depoisDeUma.aOutraFicou);
ok('o badge cai pra 1', r.depoisDeUma.badge === '1', r.depoisDeUma.badge);
ok('NÃO apaga o lançamento', r.depoisDeUma.lancamentoIntacto);
ok('aparece o rodapé de restaurar', r.depoisDeUma.temRodapeRestaurar);

console.log('\n── vai pra nuvem, não pro navegador ──');
ok('gravou na coleção agenda_notif_dispensadas', r.nuvem.gravou);
ok('não usa localStorage', r.nuvem.naoUsaLocalStorage);
ok('sobrevive à releitura da nuvem', r.sobrevive.aindaDispensada && r.sobrevive.carregou, r.sobrevive);
ok('GUARDA: leitura falhou → não perde as dispensas', r.guarda.manteve);

console.log('\n── limpar todas e restaurar ──');
ok('limpar todas esvazia o painel', r.limparTodas.listaVazia, r.limparTodas);
ok('restaurar traz as duas de volta', r.restaurar.voltaramOsDois && r.restaurar.badge === '2', r.restaurar);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
