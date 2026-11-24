// 24/11 — pedido do Will para o card da Natália: 🔥 urgente, ⏰ lembrete, 💤 adiar e
// 📅 fechamento mensal (volta no dia 1º do mês seguinte), e a lista separada por mês.
// "Eu marco, ela vê": os botões só aparecem com o login do Will (?dono=1 no mock);
// com o login dela, só os selos.
// Rodar:  node test/marcas-card.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/marcas-card.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const somaDias=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10);};
try{
// ── com o login DELA: nada de botão, só os selos que o Will marcou ──────────
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForSelector('#lista .nf-lin');
const ids=await page.$$eval('#lista .nf-lin',l=>l.map(x=>x.dataset.id));
assert.equal(await page.locator('[data-urg],[data-lem],[data-adi],[data-mensal]').count(),0,'ela não vê os botões');
await page.evaluate(([a,b])=>localStorage.setItem('wen_mock_marcas',JSON.stringify({[a]:{urgente:true,lembreteData:'2000-01-01',lembreteObs:'ligar'},[b]:{adiadoAte:'2999-01-01'}})),ids);
await page.reload();await page.waitForSelector('#lista .nf-lin');
let ela=await page.$$eval('#lista .nf-lin',l=>l.map(x=>({id:x.dataset.id,urg:x.classList.contains('urg'),txt:x.textContent})));
assert(ela[0].id===ids[0]&&ela[0].urg&&/🔥 urgente/.test(ela[0].txt)&&/⏰ lembrete: ligar/.test(ela[0].txt),'ela vê o urgente no topo, com o lembrete');
assert(!ela.find(x=>x.id===ids[1]),'e não vê o que o Will adiou');
assert(/1 adiada/.test(await page.textContent('#cards')),'mas sabe que existe uma adiada');
await page.evaluate(()=>localStorage.removeItem('wen_mock_marcas'));

// ── com o login do WILL ───────────────────────────────────────────────────
await page.goto(BASE+'/administrativo.html?mock=1&dono=1');await page.waitForSelector('#lista .nf-lin');
const linhas=()=>page.$$eval('#lista .nf-lin',l=>l.map(x=>({id:x.dataset.id,urg:x.classList.contains('urg'),txt:x.textContent.replace(/\s+/g,' ')})));
const ini=await linhas();
const abertas=ini.filter(l=>/Urgente/.test(l.txt));
assert(abertas.length>=2,'cards em aberto têm os botões de marca: '+ini.map(l=>l.id).join(','));
assert(ini.some(l=>!/Urgente/.test(l.txt)),'card pago não tem botão de marca');

// ── separação por mês ─────────────────────────────────────────────────────
assert(await page.locator('#lista .grupo-mes').count()>=1,'a lista vem separada em blocos por mês');
const cab=await page.$$eval('#lista .grupo-mes b',b=>b.map(x=>x.textContent));
assert(cab.every(t=>/📅/.test(t)),'padrão: mês do vencimento — '+cab.join(' | '));
assert(!(await page.textContent('#lista')).match(/R\$ [\d.]+,\d\d (cobranças?|total)/),'cabeçalho só conta, não soma');
await page.selectOption('#agrupar','grav');
assert((await page.$$eval('#lista .grupo-mes b',b=>b.map(x=>x.textContent))).every(t=>/🎙️/.test(t)),'por mês da gravação');
await page.selectOption('#agrupar','nada');
assert.equal(await page.locator('#lista .grupo-mes').count(),0,'sem separação');
await page.selectOption('#agrupar','venc');

// ── 🔥 urgente ────────────────────────────────────────────────────────────
const [A,B]=abertas.map(l=>l.id);const C=B;
await page.click(`[data-urg="${A}"]`);
let l=await linhas();
assert.equal(l[0].id,A,'o urgente sobe para o topo');assert(l[0].urg,'com destaque vermelho');
assert(/🔥 urgente/.test(l[0].txt),'e o selo');
assert(/Urgentes e lembretes de hoje/.test(await page.textContent('#lista .grupo-mes')),'num bloco próprio');
await page.click(`[data-urg="${A}"]`);
assert(!(await linhas()).find(x=>x.id===A).urg,'desmarca');

// ── ⏰ lembrete (não esconde; avisa no dia) ─────────────────────────────────
const sinoAntes=Number((await page.textContent('#sino')).replace(/\D/g,'')||0);
await page.click(`[data-lem="${B}"]`);
await page.fill('#mkData',hoje);await page.fill('#mkObs','ligar para a Ana');
await page.click('#mkSalvar');
l=await linhas();
assert(l.find(x=>x.id===B),'lembrete não esconde o card');
assert(/⏰ lembrete: ligar para a Ana/.test(l.find(x=>x.id===B).txt),'selo com a anotação');
assert.equal(l[0].id,B,'lembrete do dia sobe para o topo');
assert.equal(Number((await page.textContent('#sino')).replace(/\D/g,'')||0),sinoAntes+1,'vira aviso no 🔔');
await page.click('#sino');
assert(/⏰ Lembrete — .*ligar para a Ana/.test(await page.textContent('#avisosCx')),'texto do aviso');
await page.click('#avisosFechar');
// lembrete futuro: selo com a data, sem aviso
await page.click(`[data-lem="${B}"]`);await page.fill('#mkData',somaDias(hoje,5));await page.click('#mkSalvar');
assert(/⏰ \d\d\/\d\d/.test((await linhas()).find(x=>x.id===B).txt),'lembrete futuro mostra a data');
assert.equal(Number((await page.textContent('#sino')).replace(/\D/g,'')||0),sinoAntes,'e não avisa antes da hora');

// ── 💤 adiar (esconde até a data) ──────────────────────────────────────────
await page.click(`[data-adi="${C}"]`);
await page.fill('#mkData',hoje);await page.click('#mkSalvar');
assert(await page.evaluate(()=>document.getElementById('marcaDialog').open),'não adia para hoje (a janela não fecha)');
await page.fill('#mkData',somaDias(hoje,3));await page.click('#mkSalvar');
assert(!(await linhas()).find(x=>x.id===C),'adiada some da lista');
assert(/1 adiada/.test(await page.textContent('#cards')),'o card do topo conta a adiada');
await page.click('#abaAdi');
l=await linhas();
assert.deepEqual(l.map(x=>x.id),[C],'o filtro 💤 Adiadas mostra só ela');
assert(/💤 adiada até/.test(l[0].txt),'com a data de volta');
// remover o adiamento traz de volta
await page.click(`[data-adi="${C}"]`);await page.click('#mkLimpar');
assert.equal((await linhas()).length,0,'saiu das adiadas');
await page.click('#abaTudo');
assert((await linhas()).find(x=>x.id===C),'e voltou para a lista');

// ── 📅 fechamento mensal: dia 1º do mês seguinte ───────────────────────────
const tituloMensal=await page.getAttribute(`[data-mensal="${A}"]`,'title');
const m=tituloMensal.match(/(\d\d)\/(\d\d)\/(\d{4})/);
assert(m&&m[1]==='01','volta no dia 1º: '+tituloMensal);
assert(`${m[3]}-${m[2]}-01`>hoje,'num mês que ainda não começou');
await page.click(`[data-mensal="${A}"]`);
assert(!(await linhas()).find(x=>x.id===A),'mensal tira o card da lista');
await page.click('#abaAdi');
assert(new RegExp(`💤 adiada até 01/${m[2]}`).test((await linhas()).find(x=>x.id===A).txt),'e ele espera em Adiadas até o dia 1º');

assert.deepEqual(erros,[]);
console.log('✅ marcas-card: urgente, lembrete, adiar, mensal e lista separada por mês');
}finally{await browser.close();}
