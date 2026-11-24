// 24/11 — Will: "a parte fiscal precisa ser feita após a gravação e a cobrança pelo
// vencimento; o filtro precisa ser separado por cobrança ou fiscal. Ex.: a Tirolez ainda
// não teve nota emitida, mas o vencimento é dezembro."
// Rodar:  node test/visao-fiscal-cobranca.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/visao-fiscal-cobranca.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const it=(id,n,extra={})=>{const d=dia(n);return {id,data:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),
  mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),horario:'-',horas:2,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000,...extra};};
const venc=n=>dia(n).toISOString().slice(0,10);
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForSelector('#lista .nf-lin');
const ids=await page.$$eval('#lista .nf-lin',l=>l.map(x=>x.dataset.id));   // demo, demo3 (abertos) e demo2 (pago, sem NF)
// cenário: "TIROLEZ" gravou há 10 dias e vence daqui a 20; "FUTURO" ainda vai gravar; "PAGAMENTO" só tem nota depois de pagar
const cen={
  demo:{cliente:'TIROLEZ',itens:[it('t1',-10)],vencimento:venc(20),exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],notaQuando:'gravacao'},
  demo3:{cliente:'FUTURO',itens:[it('f1',5)],vencimento:venc(1),exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],notaQuando:'gravacao'},
};
await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.removeItem('wen_fiscal_visao');},cen);
await page.reload();await page.waitForSelector('#lista .nf-lin');
const nomes=()=>page.$$eval('#lista .nf-lin .nf-nome',l=>l.map(x=>x.textContent.trim()));
const grupos=()=>page.$$eval('#lista .grupo-mes b',l=>l.map(x=>x.textContent.trim()));

// ── 💰 Cobrança: pelo vencimento — o FUTURO (vence amanhã) vem antes da TIROLEZ ──
await page.click('.visoes [data-v="cobranca"]');
let n=await nomes();
assert.deepEqual(n,['FUTURO','TIROLEZ'],'cobrança: ordem do vencimento, sem o pago: '+n.join(','));
assert(await page.isVisible('#chipsCob'),'os atalhos de cobrança aparecem');

// ── 🧾 Fiscal: a TIROLEZ é prioridade (já gravou), o FUTURO espera ──────────
await page.click('.visoes [data-v="fiscal"]');
n=await nomes();
assert.deepEqual(n,['TIROLEZ','FUTURO'],'fiscal: quem já gravou vem primeiro: '+n.join(','));
assert.deepEqual(await grupos(),['🧾 Já gravou — emitir a nota','⏳ Ainda não é hora da nota']);
const txt=await page.textContent('#lista');
assert(/🧾 emitir nota · 1 diária · gravou há 10 dias/.test(txt),'diz há quanto tempo gravou');
assert(/⏳ nota depois da gravação · \d\d\/\d\d/.test(txt),'e quando o outro vai gravar');
assert(!(await page.isVisible('#chipsCob')),'os atalhos de cobrança somem na visão fiscal');
assert(!(await page.isVisible('#ordem'))&&!(await page.isVisible('#agrupar')),'ordenar/separar somem: no fiscal a ordem é a da gravação');
const cards=await page.textContent('#cards');
assert(/Nota para emitir\s*1/.test(cards)&&/Há mais de 7 dias\s*1/.test(cards)&&/Ainda não é hora\s*1/.test(cards),'cards da visão fiscal: '+cards.replace(/\s+/g,' '));
assert(!/a cobrar|cobrança enviada/.test(txt),'na visão fiscal não se mistura situação de cobrança');

// a visão fica guardada no aparelho
await page.reload();await page.waitForSelector('#lista .nf-lin');
assert.equal(await page.getAttribute('.visoes [data-v="fiscal"]','aria-selected'),'true','lembra a visão escolhida');

// nota emitida para a diária: sai da fila fiscal (mas continua na cobrança)
cen.demo.notasEmitidas=[{numero:'500',data:hoje,ids:['t1'],valor:1000}];cen.demo.fiscalStatus='emitida';
// regra "depois do pagamento": sem pagamento, ainda não é hora
cen.demo3={...cen.demo3,itens:[it('f1',-3)],notaQuando:'pagamento'};
await page.evaluate(c=>localStorage.setItem('wen_mock_marcas',JSON.stringify(c)),cen);
await page.reload();await page.waitForSelector('#lista .nf-lin');
assert.deepEqual(await nomes(),['FUTURO'],'a TIROLEZ com nota sai da fila fiscal');
assert(/⏳ nota depois do pagamento/.test(await page.textContent('#lista')),'regra da ficha: nota só depois de pagar');
await page.click('.visoes [data-v="cobranca"]');
assert((await nomes()).includes('TIROLEZ'),'mas segue na cobrança');
await page.click('.visoes [data-v="tudo"]');
assert.equal((await nomes()).length,3,'Tudo mostra os três, como antes');

// adiar é sobre cobrar: na visão fiscal a adiada continua pedindo a nota
cen.demo3={...cen.demo3,notaQuando:'gravacao',adiadoAte:venc(10)};
await page.evaluate(c=>localStorage.setItem('wen_mock_marcas',JSON.stringify(c)),cen);
await page.reload();await page.waitForSelector('#lista .nf-lin');
await page.click('.visoes [data-v="fiscal"]');
assert((await nomes()).includes('FUTURO'),'adiada para cobrar, mas a nota continua na fila fiscal');
await page.click('.visoes [data-v="cobranca"]');
assert(/💤 Adiadas — voltam/.test(await page.textContent('#lista')),'e na cobrança aparece em Adiadas');
await page.evaluate(()=>{localStorage.removeItem('wen_mock_marcas');localStorage.removeItem('wen_fiscal_visao');});
assert.deepEqual(erros,[]);
console.log('✅ visao-fiscal-cobranca: cobrança pelo vencimento, fiscal pela gravação');
}finally{await browser.close();}
