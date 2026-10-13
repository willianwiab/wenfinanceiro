// PDF protegido por senha (módulo PDF_). Duas camadas:
//   1. PURA, sempre: a detecção de /Encrypt e a base64, extraídas do app.html, contra PDFs
//      fabricados (sintéticos, sem dado real) com senha AES-128, RC4 e AES-256 e um aberto.
//   2. NAVEGADOR, quando há Playwright na máquina: o módulo PDF_ REAL + o modal REAL numa
//      página servida localmente, com o pdf.js vindo do cdnjs como em produção. Senha errada,
//      senha certa, cancelar, reaproveitar a senha da sessão, PDF aberto sem modal, imagem passa
//      direto. Nada toca o Firebase: a página de teste nem carrega o app.
//   node test/pdf-senha.test.mjs
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const SRC = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const FX = fileURLToPath(new URL('./_fixtures/pdf-senha/', import.meta.url));
let pass = 0, fail = 0;
const ok = (d, c, extra) => c ? pass++ : (fail++, console.log('FALHOU:', d, extra == null ? '' : '→ ' + extra));
function fn(n) {
  const m = new RegExp('^(?:async )?function ' + n + '\\s*\\(', 'm').exec(SRC);
  if (!m) throw new Error('não achei ' + n);
  let d = 0; for (let k = SRC.indexOf('{', m.index); k < SRC.length; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(m.index, k + 1); } }
}
const ler = n => fs.readFileSync(FX + n);

// ── 1. pura ─────────────────────────────────────────────────────────────────
const puro = new Function('btoa', fn('PDF_pareceProtegido') + fn('PDF_base64') + '; return { PDF_pareceProtegido, PDF_base64 };')(s => Buffer.from(s, 'binary').toString('base64'));
ok('PDF aberto não parece protegido', puro.PDF_pareceProtegido(ler('fatura-aberta.pdf')) === false);
for (const n of ['fatura-senha-1234.pdf', 'fatura-senha-rc4.pdf', 'fatura-senha-aes256.pdf']) ok(n + ' parece protegido', puro.PDF_pareceProtegido(ler(n)) === true);
ok('/Encrypt no meio de um stream não é confundido com o cabeçalho', puro.PDF_pareceProtegido(new TextEncoder().encode('%PDF-1.4 /Encryp /Enc')) === false);
ok('base64 bate com o Node', puro.PDF_base64(ler('fatura-aberta.pdf')) === ler('fatura-aberta.pdf').toString('base64'));
ok('o módulo vive no app com seu prefixo', /^const PDF_JS_URL = 'https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\//m.test(SRC) && /^async function PDF_preparar\(file\)/m.test(SRC));
ok('o ponto de entrada (IMP_gemini) passa pelo PDF_preparar', SRC.slice(SRC.indexOf('async function IMP_gemini'), SRC.indexOf('async function IMP_gemini') + 3000).includes('PDF_preparar('));
ok('cancelar a senha não vira mensagem de erro', (SRC.match(/PDF_cancelou\(e\)/g) || []).length >= 1);
ok('a senha não é gravada em lugar nenhum', !/localStorage[^\n]*PDF_senha|PDF_senha[^\n]*localStorage|sessionStorage[^\n]*PDF_senha/.test(SRC));
ok('o campo é de senha e sem autocompletar', /id="pdfSenhaInput" autocomplete="off"/.test(SRC) && /type="password" id="pdfSenhaInput"/.test(SRC));

// ── 2. navegador ────────────────────────────────────────────────────────────
let chromium = null; try { ({ chromium } = await import('playwright')); } catch (e) {}
if (!chromium) { console.log(`\n${pass} passaram, ${fail} falharam (parte do navegador pulada: sem Playwright nesta máquina)`); process.exit(fail ? 1 : 0); }

const modal = SRC.slice(SRC.indexOf('<!-- Modal: PDF protegido por senha'), SRC.indexOf('<div class="modal-bg" id="bcTransfBg">'));
const modulo = SRC.slice(SRC.indexOf('// ── PDF_: PDF protegido por senha'), SRC.indexOf('function IMP_fileB64(f){'));
const pagina = `<!doctype html><meta charset="utf-8"><style>.modal-bg{display:none}.modal-bg.open{display:block}</style>${modal}
<script>const toasts=[];function toast(m){toasts.push(String(m));}
${modulo}
window.__pedidos=0;const __orig=PDF_pedirSenha;PDF_pedirSenha=function(){window.__pedidos++;return __orig.apply(this,arguments);};
async function __file(n,mime,nome){const b=await (await fetch('/fx/'+n)).arrayBuffer();return new File([b],nome||n,{type:mime||'application/pdf'});}
window.__preparar=async function(n,mime,nome){try{const r=await PDF_preparar(await __file(n,mime,nome));return {ok:true,itens:r.map(m=>({mime:m.mime,nome:m.nome,tam:m.data.length,ini:m.data.slice(0,6)})),sessao:PDF_senhaSessao};}catch(e){return {ok:false,erro:String(e.message||e),sessao:PDF_senhaSessao};}};
window.__dim=async function(n){const r=await PDF_preparar(await __file(n));return Promise.all(r.map(m=>new Promise(res=>{const im=new Image();im.onload=()=>res([im.naturalWidth,im.naturalHeight]);im.src='data:'+m.mime+';base64,'+m.data;})));};
</script>`;
const srv = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('content-type', 'text/html; charset=utf-8'); return res.end(pagina); }
  const n = req.url.replace('/fx/', ''); if (req.url.startsWith('/fx/') && fs.existsSync(FX + n)) { res.setHeader('content-type', 'application/pdf'); return res.end(ler(n)); }
  res.statusCode = 404; res.end();
});
await new Promise(r => srv.listen(0, '127.0.0.1', r)); const porta = srv.address().port;
const browser = await chromium.launch(); const page = await browser.newPage(); const erros = []; page.on('pageerror', e => erros.push(String(e.message || e)));
await page.goto(`http://127.0.0.1:${porta}/`, { waitUntil: 'load' });
const aberto = s => page.evaluate(() => document.getElementById('modalPdfSenha').classList.contains('open'));

// a) PDF aberto passa direto, sem modal, sem carregar pdf.js
let r = await page.evaluate(() => window.__preparar('fatura-aberta.pdf'));
ok('PDF aberto: 1 item application/pdf, sem modal', r.ok && r.itens.length === 1 && r.itens[0].mime === 'application/pdf' && r.itens[0].ini === 'JVBERi', JSON.stringify(r));
ok('…e o pdf.js nem foi carregado', await page.evaluate(() => !window.pdfjsLib));
ok('…e ninguém pediu senha', await page.evaluate(() => window.__pedidos) === 0);

// b) AES-128: senha errada → aviso; senha certa → 2 páginas em JPEG
let pend = page.evaluate(() => window.__preparar('fatura-senha-1234.pdf'));
await page.waitForSelector('#modalPdfSenha.open', { timeout: 20000 });
ok('PDF com senha abre o modal', await aberto());
ok('sem erro antes de digitar', await page.evaluate(() => document.getElementById('pdfSenhaErro').style.display) === 'none');
await page.fill('#pdfSenhaInput', '0000'); await page.click('text=Destrancar');
await page.waitForFunction(() => document.getElementById('pdfSenhaErro').style.display === 'block', null, { timeout: 20000 });
ok('senha errada: modal continua, com aviso', await aberto() && await page.evaluate(() => document.getElementById('pdfSenhaInput').value) === '');
await page.fill('#pdfSenhaInput', '1234'); await page.press('#pdfSenhaInput', 'Enter');
r = await pend;
ok('AES-128 com 1234: 2 páginas em JPEG', r.ok && r.itens.length === 2 && r.itens.every(i => i.mime === 'image/jpeg' && i.ini === '/9j/4A' && i.tam > 8000), JSON.stringify(r));
ok('o modal fechou e a senha ficou na sessão', !(await aberto()) && r.sessao === '1234');
const dims = await page.evaluate(() => window.__dim('fatura-senha-1234.pdf'));
ok('páginas renderizadas em ~1400px de largura (legível para a IA)', dims.length === 2 && dims.every(([w, h]) => w >= 1390 && w <= 1410 && h > w), JSON.stringify(dims));
ok('…e a mesma senha não foi pedida de novo', await page.evaluate(() => window.__pedidos) === 2);

// c) RC4 com outra senha: a da sessão falha em silêncio (sem "incorreta"), pede a nova
pend = page.evaluate(() => window.__preparar('fatura-senha-rc4.pdf'));
await page.waitForSelector('#modalPdfSenha.open', { timeout: 20000 });
ok('senha da sessão errada para outro arquivo: pede sem acusar erro', await page.evaluate(() => document.getElementById('pdfSenhaErro').style.display) === 'none');
await page.fill('#pdfSenhaInput', '4321'); await page.click('text=Destrancar'); r = await pend;
ok('RC4-128 com 4321: 2 páginas', r.ok && r.itens.length === 2 && r.sessao === '4321', JSON.stringify(r));

// d) cancelar
pend = page.evaluate(() => window.__preparar('fatura-senha-aes256.pdf'));
await page.waitForSelector('#modalPdfSenha.open', { timeout: 20000 });
await page.click('text=Cancelar'); r = await pend;
ok('cancelar rejeita com "cancelado" e fecha o modal', !r.ok && r.erro === 'cancelado' && !(await aberto()), JSON.stringify(r));

// e) AES-256
pend = page.evaluate(() => window.__preparar('fatura-senha-aes256.pdf'));
await page.waitForSelector('#modalPdfSenha.open', { timeout: 20000 });
await page.fill('#pdfSenhaInput', '1234'); await page.click('text=Destrancar'); r = await pend;
ok('AES-256 com 1234: 2 páginas', r.ok && r.itens.length === 2, JSON.stringify(r));

// f) imagem passa direto
// nome e tipo de imagem: o app decide por tipo/extensão, não pelo conteúdo — passa como veio
r = await page.evaluate(() => window.__preparar('fatura-aberta.pdf', 'image/png', 'foto.png').then(x => x).catch(e => ({ ok: false, erro: String(e) })));
ok('arquivo que não é PDF passa como veio', r.ok && r.itens.length === 1 && r.itens[0].mime === 'image/png' && r.itens[0].nome === 'foto.png', JSON.stringify(r));
ok('…e um .pdf renomeado com tipo de imagem ainda é tratado como PDF (extensão vale)', await page.evaluate(() => window.__preparar('fatura-aberta.pdf', 'image/png').then(x => x.itens[0].mime)) === 'application/pdf');
ok('nenhum erro de página no navegador', erros.length === 0, erros.join(' | '));
await browser.close(); srv.close();
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
