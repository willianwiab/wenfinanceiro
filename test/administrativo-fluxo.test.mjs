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
 showMain('notas');NF_setAba('clientes');NF_montar();
});
// O fechamento nasce do ESPELHO, não mais de uma tela de liberação: a subaba
// "Fechamentos e cobranças" foi aposentada em 20/11.
assert.equal(await page.locator('#nfAbaFech').count(),0,'a tela de liberação manual não existe mais');
assert.equal(await page.locator('#nfFMesIni option[value="SET/2026"]').count(),0,'setembro fica fora do recorte');

await page.evaluate(async()=>{
 await FC_espelhar(R_todosOsDados.filter(r=>r.cliente==='Cliente Cobrança'),'teste');
});
await page.waitForFunction(()=>Object.keys(FC_dados).length===2,null,{timeout:15000});
const todos=await page.evaluate(()=>Object.values(FC_dados));
assert.equal(todos.length,2,'cliente mensal: um fechamento por mês (out e nov)');
assert(todos.every(x=>x.itens.length===1));
assert(!JSON.stringify(todos).includes('SIGILO'),'🔒 observação interna não vaza para o administrativo');
assert(todos.every(x=>x.exigeNota===false),'a ficha dizia que não emite nota');
assert(!JSON.stringify(todos).includes('SET/2026'),'setembro é anterior ao corte e fica fora');
const f=todos.find(x=>x.itens[0].mes==='NOV/2026');
assert(f&&f.id,'achei o fechamento de novembro');
assert(f.descricaoCobranca.includes('900,00'),'a cobrança traz o saldo da diária');
assert.equal(await page.evaluate(()=>NF_fila().some(g=>g.cliente==='Cliente Cobrança')),false,
 'e sai da fila de notas do Will');

// Real portal path with HTTP boundary mocked: only administrative collection requested.
const requests=[];let saved=null;const to=v=>v===null||v===undefined?{nullValue:null}:typeof v==='string'?{stringValue:v}:typeof v==='number'?{doubleValue:v}:typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(to)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,to(v)]))}};
const doc={name:'projects/wencontasapagar/databases/(default)/documents/administrativo_fechamentos/'+f.id,fields:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,to(v)])),updateTime:'2026-11-18T12:00:00.000000Z'};
await page.route('https://securetoken.googleapis.com/**',r=>r.fulfill({json:{id_token:'test-token',refresh_token:'test-refresh',expires_in:3600}}));
await page.route('https://identitytoolkit.googleapis.com/**',r=>r.fulfill({json:{users:[{email:'financeiro@wenprodutora.com.br',emailVerified:true}]}}));
await page.route('https://firestore.googleapis.com/**',r=>{requests.push(r.request().url());if(r.request().method()==='PATCH'){saved=JSON.parse(r.request().postData());return r.fulfill({json:{...doc,updateTime:'2026-11-18T13:00:00.000000Z'}});}return r.fulfill({json:{documents:[doc]}});});
await page.evaluate(()=>sessionStorage.setItem('wen_admin_rt','test-refresh'));
await page.goto(BASE+'/administrativo.html#'+f.id);await page.waitForSelector('.ed-aba');
// A ficha tem três abas (Fechamento | Nota fiscal | Cobrança): nasce no Fechamento.
assert.equal(await page.locator('.ed-aba').count(),3,'as três abas da ficha');
assert.equal(await page.locator('.ed-painel[data-painel="fechamento"]:visible').count(),1,'abre no Fechamento');
assert.equal(await page.locator('#descricaoCobranca:visible').count(),0,'a cobrança começa escondida');
await page.click('.ed-aba[data-aba="fiscal"]');
assert.equal(await page.locator('#descricaoFiscal:visible').count(),1,'a aba Nota fiscal mostra a descrição fiscal');
await page.click('.ed-aba[data-aba="cobranca"]');
await page.waitForSelector('#descricaoCobranca');
assert.equal(await page.locator('#promessaData:visible').count(),1,'a promessa de pagamento vive na aba Cobrança');
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
assert((await page.textContent('#editor')).includes('900,00'),'o documento mostra o saldo');await page.fill('#descricaoCobranca','Cobrança revisada para o cliente');await page.click('#enviada');await page.waitForFunction(()=>document.getElementById('toast').textContent==='Envio registrado.');
assert(await page.locator('#toast.show').count()===1,'a confirmação aparece como toast no rodapé');
assert.equal((await page.textContent('#aviso')).trim(),'','e a tarja não fica suja com mensagem de sucesso');assert(saved.fields.enviadoEm.stringValue);assert.equal(saved.fields.cobrancaStatus.stringValue,'enviada');// O portal dela toca SÓ nas duas coleções administrativas. Nenhum lançamento,
// banco, despesa ou folha — a invariante do portal restrito.
const PERMITIDAS=/\/(administrativo_fechamentos|administrativo_avisos|clientes_fiscais)(\?|\/|$)/;
const fora=requests.filter(u=>!PERMITIDAS.test(u));
assert.deepEqual(fora,[],'o portal pediu algo fora do administrativo');
assert(requests.some(u=>u.includes('/administrativo_avisos')),'os avisos são lidos');
assert(requests.some(u=>u.includes('/clientes_fiscais')),'a ficha do cliente é lida');
assert(!requests.some(u=>/\/(receber|lancamentos|contas|bancos|pagar|folha)/i.test(u)),
  '🔒 nada do financeiro da empresa');
assert(!await page.locator('body').evaluate(el=>el.textContent.includes('SIGILO FOLHA')));
await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
if(process.env.WEN_QA_DIR)await page.screenshot({path:process.env.WEN_QA_DIR+'/administrativo-mobile.png',fullPage:true});
await page.setViewportSize({width:1360,height:950});if(process.env.WEN_QA_DIR)await page.screenshot({path:process.env.WEN_QA_DIR+'/administrativo-desktop.png',fullPage:true});
assert.deepEqual(errors,[]);console.log('Fluxo OK: corte outubro/2026, cobrança sem NF, duas diárias, persistência, trava duplicidade, portal restrito, envio salvo, mobile e sem erros JS.');
}finally{await browser.close();}
