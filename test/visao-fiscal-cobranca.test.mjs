// 24/11 — Will: "Fiscal: gravou faz nota, a não ser fechamento mensal. Cobrança: por data
// de vencimento, podemos adiar. Se cobramos e não pagou fica com status e não numa aba."
// Rodar:  node test/visao-fiscal-cobranca.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/visao-fiscal-cobranca.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const iso=n=>dia(n).toISOString().slice(0,10);
const it=(id,n,extra={})=>{const d=dia(n);return {id,data:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),
  mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),horario:'-',horas:2,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000,...extra};};
const dia1Seguinte=n=>{const d=dia(n);let a=d.getFullYear(),m=d.getMonth()+2;if(m>12){m=1;a++;}return a+'-'+String(m).padStart(2,'0')+'-01';};
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForSelector('#lista .nf-lin');
// 3 mocks: demo, demo2 (pago, sem NF), demo3
const cen={
  demo:{cliente:'TIROLEZ',itens:[it('t1',-10)],vencimento:iso(20),exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],condicao:'avista',
        valor:1000,recebido:0,saldo:1000,cobrancaStatus:'pendente'},
  demo3:{cliente:'MENSAL LTDA',itens:[it('m1',-1)],vencimento:iso(-2),exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],condicao:'mensal',
        valor:3000,recebido:1000,saldo:2000,cobrancaStatus:'enviada',enviadoEm:iso(-5)+'T15:00:00.000Z'},
};
await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));['wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k));},cen);
await page.reload();await page.waitForSelector('#lista');
const nomes=()=>page.$$eval('#lista .nf-lin',l=>l.filter(x=>x.offsetParent!==null).map(x=>x.querySelector('.nf-nome').textContent.trim()));
const grupos=()=>page.$$eval('#lista .grupo-mes b',l=>l.map(x=>x.textContent.trim()));

// ── só duas abas, sem filtros de status ────────────────────────────────────
assert.deepEqual(await page.$$eval('.visoes [data-v]',b=>b.map(x=>x.dataset.v)),['fiscal','cobranca'],'só Fiscal e Cobrança');
for(const id of ['#abaTudo','#abaPend','#abaVencer','#abaEnv','#abaAtr','#ordem','#agrupar','#mesIni'])
  assert.equal(await page.locator(id).count(),0,'saiu: '+id);
assert.equal(await page.getAttribute('.visoes [data-v="cobranca"]','aria-selected'),'true','abre em Cobrança');

// ── 💰 Cobrança: uma lista pelo vencimento; status no card ─────────────────
assert.deepEqual(await nomes(),['MENSAL LTDA','TIROLEZ'],'pelo vencimento; a paga não aparece aberta');
const txt=await page.textContent('#lista');
assert(/📨 cobrada em \d\d\/\d\d/.test(txt),'cobrada e não paga: status no card, com a data');
assert(/em atraso há 2 dias/.test(txt),'e quantos dias de atraso');
assert(/a cobrar/.test(txt),'a outra está a cobrar');
assert(/falta cobrar\s*R\$\s*2\.000,00/.test(txt.replace(/ /g,' ')),'o número grande é o que falta cobrar');
assert((await grupos()).includes('✅ Pagas'),'pagas ficam num grupo no fim');
assert.equal(await page.locator('[data-corpo="cobranca:pagas"]').isVisible(),false,'fechado por padrão');
const cards=(await page.textContent('#cards')).replace(/\s+/g,' ');
assert(/Em atraso ?1/.test(cards)&&/Já cobradas ?1/.test(cards),'cards da cobrança: '+cards);

// ── 🧾 Fiscal: gravou → nota; mensal → a partir do dia 1º do mês seguinte ──
await page.click('.visoes [data-v="fiscal"]');
assert.deepEqual(await nomes().then(n=>n.slice(0,2)),['TIROLEZ','MENSAL LTDA'],'emitir agora antes do mensal');
const g=await grupos();
assert(g[0]==='🧾 Emitir nota agora'&&g.some(x=>/Fechamento mensal/.test(x)),'grupos: '+g.join(' | '));
const ftxt=await page.textContent('#lista');
assert(/🧾 emitir nota · 1 diária · gravou há 10 dias/.test(ftxt),'gravou há 10 dias');
const d1=dia1Seguinte(-1);
assert(new RegExp('📅 fechamento mensal · nota a partir de '+d1.slice(8,10)+'/'+d1.slice(5,7)).test(ftxt),'mensal: nota no dia 1º do mês seguinte');
assert(!/a cobrar|cobrada em/.test(ftxt),'sem status de cobrança no fiscal');

// lembra a aba
await page.reload();await page.waitForSelector('#lista .nf-lin');
assert.equal(await page.getAttribute('.visoes [data-v="fiscal"]','aria-selected'),'true','lembra a aba');

await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ visao-fiscal-cobranca: duas abas — fiscal pela gravação (mensal no dia 1º), cobrança pelo vencimento com status no card');
}finally{await browser.close();}
