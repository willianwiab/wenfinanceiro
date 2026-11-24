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
// "se a cobrança foi enviada, não falta cobrar — falta o cliente pagar" (Will, 24/11)
assert(/aguardando pagamento\s*R\$\s*2\.000,00/.test(txt),'cobrada: o valor é "aguardando pagamento"');
assert(/falta cobrar\s*R\$\s*1\.000,00/.test(txt),'a cobrar: o valor é "falta cobrar"');
// ficha "💳 Fechamento mensal": cobra a partir do dia 1º do mês seguinte, sem clicar em nada
const d1m=dia1Seguinte(-1);
const mensal=(await page.locator('#lista .nf-lin',{hasText:'MENSAL LTDA'}).textContent()).replace(/\s+/g,' ');
assert(new RegExp('📅 fechamento mensal · cobrar a partir de '+d1m.slice(8,10)+'/'+d1m.slice(5,7)).test(mensal),'mensal pela ficha: '+mensal);
assert(!/em atraso/.test(mensal),'vencimento antigo do mensal não vira atraso');
const cards=(await page.textContent('#cards')).replace(/\s+/g,' ');
assert(/Em atraso ?1/.test(cards)&&/Aguardando pagamento ?1/.test(cards)&&/Falta cobrar ?2/.test(cards),'cards da cobrança: '+cards);

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
const emGrupo=pre=>page.$$eval('[data-corpo^="'+pre+'"] .nf-lin .nf-nome',l=>l.filter(x=>x.offsetParent!==null).map(x=>x.textContent.trim()));
assert.deepEqual(await emGrupo('cobranca:agravar:'),['FUTURA'],'quem só tem diária por gravar fica à vista, no grupo do mês em que grava');
assert((await grupos()).some(g=>/⏳ Vai gravar em .* de \d{4} — cobrar depois da gravação/.test(g)),'com o mês no título: '+(await grupos()).join(' | '));
const fu=await card('FUTURA');
assert(/a gravar/.test(fu)&&/⏳ grava em \d\d\/\d\d/.test(fu),'mostra quando grava: '+fu);
assert(!/falta cobrar|em atraso|a cobrar/.test(fu),'e não diz que falta cobrar: '+fu);
assert(!/Em atraso ?1/.test((await page.textContent('#cards')).replace(/\s+/g,' ')),'não conta como atraso');
await page.locator('#lista .nf-lin',{hasText:'DANNY'}).locator('[data-abrir]').click();
await page.waitForSelector('#rFechDoc .fech-secao.aberto');
const edt=await page.textContent('#editor');
assert(/Preencha na aba\s*🧾 Nota fiscal/.test(edt)&&!/Peça ao Will/.test(edt),'sem contato: manda preencher na ficha da própria tela');
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
// ── 24/11: meses seguintes à vista; quem o Will cobra NÃO aparece na Cobrança e quem não tem
// nota NÃO aparece no Fiscal ("somente se tem nota e cobrança, somente nota ou somente cobrança") ──
await page.evaluate(c=>{localStorage.setItem('wen_fiscal_visao','cobranca');localStorage.setItem('wen_fiscal_fechados','[]');localStorage.setItem('wen_mock_marcas',JSON.stringify(c));},{
  demo:{cliente:'IRMAOS (Will cobra)',itens:[d('w1',-20,1200,0)],valor:1200,recebido:0,saldo:1200,vencimento:iso(-10),cobrancaStatus:'pendente',condicao:'avista',
        exigeNota:false,fiscalStatus:'nao_solicitada',clienteFiscal:{cobrancaAdministrativo:false}},
  demo2:{cliente:'MES QUE VEM',itens:[d('m1',35,2000,0)],valor:2000,recebido:0,saldo:2000,vencimento:iso(40),cobrancaStatus:'pendente',condicao:'avista',exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[]},
  demo3:{cliente:'NORMAL',itens:[d('n1',-5,1000,0)],valor:1000,recebido:0,saldo:1000,vencimento:iso(2),cobrancaStatus:'pendente',condicao:'avista',exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[]}});
await page.reload();await page.waitForSelector('#lista .nf-lin');
assert(!(await page.textContent('#lista')).includes('IRMAOS'),'quem o Will cobra não aparece na aba Cobrança');
assert(!/O Will cobra — só acompanhar/.test(await page.textContent('#lista')),'e o grupo "só acompanhar" não existe');
const cds=(await page.textContent('#cards')).replace(/\s+/g,' ');
assert(/Em atraso ?0/.test(cds)&&/Falta cobrar ?1/.test(cds),'e não entra nos números dela: '+cds);
assert.deepEqual(await emGrupo('cobranca:agravar:'),['MES QUE VEM'],'mês seguinte à vista, sem precisar abrir nada');
await page.click('.visoes [data-v="fiscal"]');
assert(!(await page.textContent('#lista')).includes('IRMAOS'),'quem não tem nota não aparece na aba Fiscal');
assert.deepEqual(await emGrupo('fiscal:fut:'),['MES QUE VEM'],'gravação do mês seguinte aparece, no mês dela');
assert.deepEqual(await emGrupo('fiscal:prontas'),['NORMAL'],'e a fila de emitir continua só com o que já gravou');
const fc=(await page.textContent('#cards')).replace(/\s+/g,' ');
assert(/Emitir nota agora ?1/.test(fc),'contador da fila de emitir não inclui os de acompanhar: '+fc);

// ── Fiscal: "sempre o total da nota que precisa emitir, nunca o valor total" (Danny Ueda) ──
await page.evaluate(c=>{localStorage.setItem('wen_fiscal_visao','fiscal');localStorage.setItem('wen_fiscal_fechados','[]');localStorage.setItem('wen_mock_marcas',JSON.stringify(c));},{
  demo:{cliente:'DANNY',itens:[d('a',-12,3750,3750),d('b',-11,3750,3750),d('c',3,3750,0)],valor:11250,recebido:7500,saldo:3750,vencimento:iso(3),cobrancaStatus:'pendente',condicao:'avista',
        exigeNota:true,fiscalStatus:'pendente',nfNumero:'1, 8',notasEmitidas:[{numero:'1',ids:['a'],valor:3750},{numero:'8',ids:['b'],valor:3750}]},
  demo2:{cliente:'DUAS FALTAM',itens:[d('e',-9,2000,0),d('g',-8,1500,0),d('h',6,1000,0)],valor:4500,recebido:0,saldo:4500,vencimento:iso(9),cobrancaStatus:'pendente',condicao:'avista',
        exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[]},
  demo3:{cliente:'TUDO COM NOTA',itens:[d('k',-20,1800,0)],valor:1800,recebido:0,saldo:1800,vencimento:iso(1),cobrancaStatus:'pendente',condicao:'avista',
        exigeNota:true,fiscalStatus:'emitida',nfNumero:'7',notasEmitidas:[{numero:'7',ids:['k'],valor:1800}]}});
await page.reload();await page.waitForSelector('#lista .nf-lin');
await page.click('[data-todos="abrir"]');
const fd=await card('DANNY');
assert(/1 diária sem nota · 6h/.test(fd),'Danny no fiscal: só a diária sem nota: '+fd);
assert(/✔️ 2 com nota/.test(fd)&&/nota depois ?R\$ 3\.750,00/.test(fd),'valor = só a nota que falta (3.750)');
assert(!/11\.250/.test(fd),'nunca o total de 11.250');
const ff=await card('DUAS FALTAM');
assert(/2 diárias sem nota/.test(ff)&&/nota a emitir ?R\$ 3\.500,00/.test(ff)&&/\+ R\$ 1\.000,00 depois/.test(ff),'as duas já gravadas agora; a futura fica "depois": '+ff);
assert(!/4\.500/.test(ff),'sem o total');
assert(/nota emitida ?R\$ 1\.800,00/.test(await card('TUDO COM NOTA')),'já emitida mostra o valor da nota');

await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ visao-fiscal-cobranca: duas abas — fiscal pela gravação (mensal no dia 1º), cobrança pelo vencimento com status no card');
}finally{await browser.close();}
