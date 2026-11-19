import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2]||'http://127.0.0.1:8765';
const browser=await chromium.launch(),page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(BASE+'/?mock=1');await page.waitForTimeout(1500);
await page.evaluate(async()=>{
 await MOD_umaVez('notas-fiscais',NF_carregar);await MOD_umaVez('clientes-fiscais',CFI_carregar);
 R_todosOsDados.push(...[
 {id:'fc-old',mes:'SET/2026',data:'10/09/2026'},
 {id:'fc-a',mes:'OUT/2026',data:'10/10/2026'},
 {id:'fc-b',mes:'NOV/2026',data:'18/11/2026'}].map(r=>({...r,cliente:'Cliente Cobrança',horas:2,studio:'Estúdio A',valorTotal:1000,valorReserva:100,saldo:900,desc:'Produção audiovisual',obs:'SIGILO FOLHA'})));
 CFI_FICHAS.teste={id:'teste',nome:'Cliente Cobrança',exigeNota:false,emailFinanceiro:'cliente@example.com'};
 showMain('notas');NF_setAba('fechamentos');document.getElementById('nfFCliente').value='Cliente Cobrança';document.getElementById('nfFMesIni').value='OUT/2026';document.getElementById('nfFMesFim').value='NOV/2026';NF_montar();
});
assert.equal(await page.locator('#fcDiarias input').count(),2);assert.equal(await page.locator('#nfFMesIni option[value="SET/2026"]').count(),0);
assert.equal(await page.evaluate(()=>NF_fila().some(g=>g.cliente==='Cliente Cobrança')),false);
await page.check('#fcTodas');await page.click('#fcPreparar');assert((await page.inputValue('#fcCobranca')).includes('1.800,00'));await page.fill('#fcVenc','2026-11-30');await page.click('#fcLiberar');await page.waitForFunction(()=>Object.keys(FC_dados).length===1);
const f=await page.evaluate(async()=>{await FC_carregar();return Object.values(FC_dados)[0]});
assert(f.id);assert.equal(f.itens.length,2);assert(!JSON.stringify(f).includes('SIGILO'));assert.equal(await page.locator('#fcDiarias input:disabled').count(),2);
// Real portal path with HTTP boundary mocked: only administrative collection requested.
const requests=[];let saved=null;const to=v=>typeof v==='string'?{stringValue:v}:typeof v==='number'?{doubleValue:v}:typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(to)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,to(v)]))}};
const doc={name:'projects/wencontasapagar/databases/(default)/documents/administrativo_fechamentos/'+f.id,fields:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,to(v)])),updateTime:'2026-11-18T12:00:00.000000Z'};
await page.route('https://securetoken.googleapis.com/**',r=>r.fulfill({json:{id_token:'test-token',refresh_token:'test-refresh',expires_in:3600}}));
await page.route('https://identitytoolkit.googleapis.com/**',r=>r.fulfill({json:{users:[{email:'financeiro@wenprodutora.com.br',emailVerified:true}]}}));
await page.route('https://firestore.googleapis.com/**',r=>{requests.push(r.request().url());if(r.request().method()==='PATCH'){saved=JSON.parse(r.request().postData());return r.fulfill({json:{...doc,updateTime:'2026-11-18T13:00:00.000000Z'}});}return r.fulfill({json:{documents:[doc]}});});
await page.evaluate(()=>sessionStorage.setItem('wen_admin_rt','test-refresh'));
await page.goto(BASE+'/administrativo.html#'+f.id);await page.waitForSelector('#descricaoCobranca');
// Topo no formato da aba Notas Fiscais: 3 cartões de CONTAGEM. Nenhum valor somado da
// empresa pode aparecer fora do fechamento aberto — o administrativo vê o unitário, não o total.
assert.equal(await page.locator('#cards .card-p').count(),3);
assert(!(await page.textContent('#cards')).includes('R$'));
assert((await page.textContent('#cards')).includes('A cobrar'));
// O fechamento aberto é o documento do Relatórios → Fechamento: faixa, 6 cartões,
// tabela por mês com Horário/Studio/Status, barra de total e as 4 ações.
assert.equal(await page.locator('#rFechDoc .frc-r').count(),6);
assert.equal(await page.locator('#rFechDoc .fech-total-bar-r').count(),1);
for(const id of ['fPdf','fZap','fXls','fNF'])assert.equal(await page.locator('#'+id).count(),1,'falta a ação '+id);
const cab=await page.locator('#rFechDoc thead').first().textContent();
for(const c of ['Data','Horário','Studio','Horas','Total','Recebido','Saldo','Status'])assert(cab.includes(c),'falta a coluna '+c);
await page.click('#fNF');await page.waitForSelector('#modalNFBg.open');
assert((await page.inputValue('#nfTextoArea')).includes('21.577.617/0001-44'));
await page.click('#nfFechar');
assert((await page.textContent('#editor')).includes('1.800,00'));await page.fill('#descricaoCobranca','Cobrança revisada para o cliente');await page.click('#enviada');await page.waitForFunction(()=>document.getElementById('aviso').textContent==='Envio registrado.');assert(saved.fields.enviadoEm.stringValue);assert.equal(saved.fields.cobrancaStatus.stringValue,'enviada');assert(requests.every(u=>u.includes('/administrativo_fechamentos')));
assert(!await page.locator('body').evaluate(el=>el.textContent.includes('SIGILO FOLHA')));
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
if(process.env.WEN_QA_DIR)await page.screenshot({path:process.env.WEN_QA_DIR+'/administrativo-mobile.png',fullPage:true});
await page.setViewportSize({width:1360,height:950});if(process.env.WEN_QA_DIR)await page.screenshot({path:process.env.WEN_QA_DIR+'/administrativo-desktop.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('Fluxo OK: corte outubro/2026, cobrança sem NF, duas diárias, persistência, trava duplicidade, portal restrito, envio salvo, mobile e sem erros JS.');
}finally{await browser.close();}
