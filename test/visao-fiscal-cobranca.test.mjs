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
  demo:{cliente:'TIROLEZ',itens:[it('t1',-10)],vencimento:iso(40),exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],condicao:'avista',
        valor:1000,recebido:0,saldo:1000,cobrancaStatus:'pendente'},
  demo2:{cliente:'ATRASADO',itens:[it('x1',-8,{valor:3000,recebido:1000,saldo:2000})],vencimento:iso(-2),exigeNota:false,fiscalStatus:'nao_solicitada',notasEmitidas:[],condicao:'avista',
        valor:3000,recebido:1000,saldo:2000,cobrancaStatus:'enviada',enviadoEm:iso(-5)+'T15:00:00.000Z'},
  demo3:{cliente:'MENSAL LTDA',itens:[it('m1',-1)],vencimento:iso(-2),exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],condicao:'mensal',
        valor:1000,recebido:0,saldo:1000,cobrancaStatus:'pendente'},
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
assert.deepEqual(await nomes(),['ATRASADO','MENSAL LTDA','TIROLEZ'],'pelo vencimento (o mensal vale a partir do dia 1º)');
const txt=(await page.textContent('#lista')).replace(/\u00a0/g,' ');
assert(/📨 cobrada em \d\d\/\d\d/.test(txt),'cobrada e não paga: status no card, com a data');
assert(/em atraso há 2 dias/.test(txt),'e quantos dias de atraso');
assert(/a cobrar/.test(txt),'a outra está a cobrar');
assert(/falta cobrar\s*R\$\s*2\.000,00/.test(txt),'o número grande é o que falta cobrar');
// ficha "💳 Fechamento mensal": cobra a partir do dia 1º do mês seguinte, sem clicar em nada
const d1m=dia1Seguinte(-1);
const mensal=(await page.locator('#lista .nf-lin',{hasText:'MENSAL LTDA'}).textContent()).replace(/\s+/g,' ');
assert(new RegExp('📅 fechamento mensal · cobrar a partir de '+d1m.slice(8,10)+'/'+d1m.slice(5,7)).test(mensal),'mensal pela ficha: '+mensal);
assert(!/em atraso/.test(mensal),'vencimento antigo do mensal não vira atraso');
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

// ── diária paga sai da cobrança; o pago parcial fica junto da diária em aberto (24/11) ──
// ── e "se ainda não gravou não falta cobrar" ─────────────────────────────────
const d=(id,n,v,r)=>it(id,n,{horas:6,valor:v,recebido:r,saldo:v-r});
await page.evaluate(c=>{localStorage.setItem('wen_fiscal_visao','cobranca');localStorage.setItem('wen_fiscal_fechados','[]');localStorage.setItem('wen_mock_marcas',JSON.stringify(c));},{
  demo:{cliente:'DANNY',itens:[d('a',-12,3750,3750),d('b',-11,3750,3750),d('c',-1,3750,0)],valor:11250,recebido:7500,saldo:3750,vencimento:iso(3),cobrancaStatus:'pendente',condicao:'avista'},
  demo2:{cliente:'FUTURA',itens:[d('f1',-9,3750,3750),d('f2',3,3750,0)],valor:7500,recebido:3750,saldo:3750,vencimento:iso(-1),cobrancaStatus:'enviada',condicao:'avista',exigeNota:false},
  demo3:{cliente:'PARCIAL',itens:[d('x',-14,3500,3500),d('y',-4,3500,1750)],valor:7000,recebido:5250,saldo:1750,vencimento:iso(5),cobrancaStatus:'pendente',condicao:'avista'}});
await page.reload();await page.waitForSelector('#lista .nf-lin');
const card=n=>page.locator('#lista .nf-lin',{hasText:n}).textContent().then(t=>t.replace(/\s+/g,' ').replace(/ /g,' '));
const dn=await card('DANNY');
assert(/1 diária em aberto · 6h/.test(dn),'Danny: só a diária em aberto no card: '+dn);
assert(/✔️ 2 pagas · fora da cobrança/.test(dn)&&/falta cobrar ?R\$ 3\.750,00/.test(dn),'as pagas saem; falta cobrar 3.750: '+dn);
assert(!/11\.250/.test(dn),'o total de 11.250 não aparece no card da cobrança');
const pc=await card('PARCIAL');
assert(/falta cobrar ?R\$ 1\.750,00 ?R\$ 3\.500,00 · R\$ 1\.750,00 pago/.test(pc),'parcial: 3.500 · 1.750 pago: '+pc);
// a FUTURA só tem diária por gravar: não falta cobrar, não está atrasada, vai para o fim
assert(!(await nomes()).includes('FUTURA'),'quem só tem diária por gravar sai da lista de cobrar');
assert((await grupos()).some(g=>/Ainda vai gravar/.test(g)),'fica no grupo Ainda vai gravar (fechado)');
await page.locator('#lista .grupo-mes',{hasText:'Ainda vai gravar'}).click();
const fu=await card('FUTURA');
assert(/a gravar/.test(fu)&&/⏳ grava em \d\d\/\d\d/.test(fu),'mostra quando grava: '+fu);
assert(!/falta cobrar|em atraso|a cobrar/.test(fu),'e não diz que falta cobrar: '+fu);
assert(!/Em atraso ?1/.test((await page.textContent('#cards')).replace(/\s+/g,' ')),'não conta como atraso');
await page.locator('#lista .nf-lin',{hasText:'DANNY'}).locator('[data-abrir]').click();
await page.waitForSelector('#rFechDoc .fech-secao.aberto');
const doc=(await page.textContent('#rFechDoc')).replace(/\s+/g,' ').replace(/ /g,' ');
assert(/🔴 Em aberto — 1 diária · falta R\$ 3\.750,00/.test(doc),'no documento, o bloco em aberto vem primeiro');
assert(/✅ Já pagas — saíram da cobrança · 2 diárias/.test(doc),'e as pagas separadas embaixo');
assert(doc.indexOf('Em aberto')<doc.indexOf('Já pagas'),'nessa ordem');
await page.click('#fecharCobranca');
await page.locator('#lista .nf-lin',{hasText:'FUTURA'}).locator('[data-abrir]').click();
await page.waitForSelector('#rFechDoc .fech-secao.futuro');
const docF=(await page.textContent('#rFechDoc')).replace(/\s+/g,' ');
assert(/⏳ Ainda vai gravar — cobrar depois · 1 diária/.test(docF)&&/Nada a cobrar agora\. Próxima gravação em \d\d\/\d\d/.test(docF)&&!/Saldo em aberto/.test(docF),'documento da futura: '+docF.slice(0,900));
await page.click('#fecharCobranca');
await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ visao-fiscal-cobranca: duas abas — fiscal pela gravação (mensal no dia 1º), cobrança pelo vencimento com status no card');
}finally{await browser.close();}
