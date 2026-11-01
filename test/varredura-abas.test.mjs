// Varredura de abas (auditoria 01/11/2026) — roda 100% em ?mock=1.
// Abre TODA aba principal e toda subaba visível e falha se qualquer uma soltar erro de JS.
// O smoke prova que os módulos carregaram; este prova que eles RENDERIZAM — é a rede que pega
// o erro de render que teste de unidade não vê (tipo variável usada antes de existir).
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/varredura-abas.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const achados = [];
page.on('pageerror', e => achados.push({ onde: '(pageerror)', msg: String(e?.message || e) }));
page.on('console', m => { if (m.type() === 'error') achados.push({ onde: '(console)', msg: m.text().slice(0, 200) }); });
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3500);

const mains = await page.evaluate(() =>
  [...document.querySelectorAll('.nav-main button')].map((b, i) => ({ i, txt: b.textContent.trim() })));
console.log('abas principais:', mains.map(m => m.txt).join(' | '));

for (const m of mains) {
  const antes = achados.length;
  await page.evaluate(i => {
    const b = document.querySelectorAll('.nav-main button')[i];
    const on = (b.getAttribute('onclick') || '').match(/showMain\('([^']+)'/);
    if (on) showMain(on[1], b); else b.click();
  }, m.i);
  await page.waitForTimeout(1400);
  const subs = await page.evaluate(() => [...document.querySelectorAll('.nav-sub button, .cc-subtab')]
    .filter(b => b.offsetParent !== null).length);
  for (let k = 0; k < subs; k++) {
    try {
      await page.evaluate(k => { const bs = [...document.querySelectorAll('.nav-sub button, .cc-subtab')]
        .filter(b => b.offsetParent !== null); if (bs[k]) bs[k].click(); }, k);
      await page.waitForTimeout(700);
    } catch (e) { achados.push({ onde: m.txt + ' sub#' + k, msg: 'clique falhou: ' + e.message }); }
  }
  const novos = achados.slice(antes);
  console.log(`  ${novos.length ? '❌' : '✅'} ${m.txt}  (${subs} subaba(s))${novos.length ? ' → ' + novos.length + ' erro(s)' : ''}`);
  novos.forEach(a => console.log(`       ${a.onde} ${a.msg}`));
}
await browser.close();
console.log(achados.length ? `\n❌ ${achados.length} erro(s) no total` : '\n✅ nenhum erro de JS em nenhuma aba');
if (achados.length) process.exit(1);
