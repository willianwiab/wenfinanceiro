// Regressões do cache/sync de Contas a Pagar.
// Usa o app real em servidor local e simula o Firestore pela rede do navegador.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RAIZ=fileURLToPath(new URL('..',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const rel=(new URL(req.url,'http://local')).pathname==='/'?'index.html':decodeURIComponent((new URL(req.url,'http://local')).pathname.slice(1));
  const arq=path.resolve(RAIZ,rel);
  if(!arq.startsWith(RAIZ)||!fs.existsSync(arq)||fs.statSync(arq).isDirectory()){res.writeHead(404);res.end('not found');return;}
  res.writeHead(200,{'content-type':mime[path.extname(arq)]||'application/octet-stream','cache-control':'no-store'});fs.createReadStream(arq).pipe(res);
});
await new Promise((ok,ko)=>{server.once('error',ko);server.listen(0,'127.0.0.1',ok);});
const base=`http://127.0.0.1:${server.address().port}/index.html`;

const fv=v=>{
  if(v===null||v===undefined)return{nullValue:null};
  if(typeof v==='boolean')return{booleanValue:v};
  if(typeof v==='number')return{doubleValue:v};
  if(typeof v==='string')return{stringValue:v};
  if(Array.isArray(v))return{arrayValue:{values:v.map(fv)}};
  const fields={};Object.entries(v).forEach(([k,x])=>fields[k]=fv(x));return{mapValue:{fields}};
};
const doc=(mes,contas,updateTime)=>({name:`projects/test/databases/(default)/documents/meses/${encodeURIComponent(mes)}`,fields:{mes:fv(mes),contas:fv(contas)},createTime:updateTime,updateTime});
const conta=(id,nome,valor=100)=>({id,nome,valor,valorPago:0,dia:10,status:'PENDENTE',fixa:false,categoria:''});
const jsonHeaders={'content-type':'application/json','access-control-allow-origin':'*','access-control-allow-headers':'content-type'};

let passou=0,falhou=0;
const ok=(nome,cond,det='')=>{if(cond){passou++;console.log('✅ '+nome);}else{falhou++;console.error('❌ '+nome+(det?' — '+det:''));}};
const browser=await chromium.launch();

async function paginaComFirestore({documentos=[],atrasoMeses=0,falhaMeses=0,cache=null,onPatchMes=null}){
  const context=await browser.newContext();
  if(cache)await context.addInitScript(d=>localStorage.setItem('wen_meses6',JSON.stringify(d)),cache);
  const page=await context.newPage();const erros=[],patches=[];
  page.on('pageerror',e=>erros.push(e.message));
  await page.route('**/xlsx.full.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:'window.XLSX={utils:{},writeFile:function(){}};'}));
  await page.route('**/chart.umd.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:'window.Chart=function(){this.destroy=function(){}};'}));
  await page.route('**/firebase-app-compat.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:'window.firebase={apps:[],initializeApp:function(){this.apps.push({})}};'}));
  await page.route('https://firestore.googleapis.com/**',async route=>{
    const req=route.request(),url=req.url(),method=req.method();
    if(method==='OPTIONS'){await route.fulfill({status:204,headers:jsonHeaders,body:''});return;}
    const listaMeses=method==='GET'&&/\/documents\/meses\?/.test(url);
    if(listaMeses){
      if(atrasoMeses)await new Promise(r=>setTimeout(r,atrasoMeses));
      if(falhaMeses){await route.fulfill({status:falhaMeses,headers:jsonHeaders,body:JSON.stringify({error:{code:falhaMeses}})});return;}
      await route.fulfill({status:200,headers:jsonHeaders,body:JSON.stringify({documents:documentos})});return;
    }
    if(method==='PATCH'&&/\/documents\/meses\//.test(url)){
      patches.push(url);const resposta=onPatchMes?await onPatchMes({url,req,numero:patches.length}):{status:200,updateTime:'2026-08-11T13:00:00.000000Z'};
      await route.fulfill({status:resposta.status,headers:jsonHeaders,body:JSON.stringify(resposta.status===200?{updateTime:resposta.updateTime,fields:{}}:{error:{code:resposta.status}})});return;
    }
    if(method==='POST'&&url.includes(':runQuery')){await route.fulfill({status:200,headers:jsonHeaders,body:'[]'});return;}
    await route.fulfill({status:200,headers:jsonHeaders,body:method==='GET'?'{"documents":[]}':'{}'});
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  return{context,page,erros,patches};
}

try{
  // 1) Nuvem lenta: a versão antiga criava AGO vazio e fazia PATCH após 1,5 s.
  const lento=await paginaComFirestore({documentos:[doc('JUL/2026',[conta('jul1','Conta julho')],'2026-07-31T12:00:00.000000Z')],atrasoMeses:2300});
  await lento.page.waitForTimeout(1700);
  ok('nuvem lenta não dispara PATCH antes da hidratação',lento.patches.length===0,'patches='+lento.patches.length);
  await lento.page.waitForTimeout(1200);
  const estadoLento=await lento.page.evaluate(()=>({hidratado:eval('P_hidratado'),jul:eval("P_meses['JUL/2026'].length"),temAgo:Object.prototype.hasOwnProperty.call(eval('P_meses'),'AGO/2026')}));
  ok('dados remotos entram depois da espera',estadoLento.hidratado&&estadoLento.jul===1,JSON.stringify(estadoLento));
  ok('mês atual vazio não é criado nem persistido automaticamente',!estadoLento.temAgo&&lento.patches.length===0,JSON.stringify({estadoLento,patches:lento.patches}));
  ok('cenário lento sem erro de página',lento.erros.length===0,lento.erros.join(' | '));
  await lento.context.close();

  // 2) Leitura falha: cache é exibido, mas nunca enviado como fallback.
  const cache={'JUL/2026':[conta('local1','Somente local')]};
  const offline=await paginaComFirestore({falhaMeses:500,cache});
  await offline.page.waitForTimeout(2200);
  const estadoOffline=await offline.page.evaluate(()=>({hidratado:eval('P_hidratado'),confiavel:eval('P_nuvemConfiavel'),jul:eval("P_meses['JUL/2026'].length"),status:document.getElementById('syncBar').textContent}));
  ok('erro de leitura mantém cache local',!estadoOffline.hidratado&&!estadoOffline.confiavel&&estadoOffline.jul===1,JSON.stringify(estadoOffline));
  ok('erro de leitura nunca faz upload do cache',offline.patches.length===0,'patches='+offline.patches.length);
  ok('interface informa uso do cache local',/cache local|nada foi enviado/i.test(estadoOffline.status),estadoOffline.status);
  await offline.context.close();

  // 3) Só o mês alterado é gravado; em seguida um 412 preserva a cópia local.
  let responderConflito=false;
  const seletivo=await paginaComFirestore({documentos:[
    doc('JUL/2026',[conta('jul1','Julho')],'2026-07-31T12:00:00.000000Z'),
    doc('AGO/2026',[conta('ago1','Agosto')],'2026-08-11T12:00:00.000000Z')
  ],onPatchMes:()=>responderConflito?{status:412}:{status:200,updateTime:'2026-08-11T13:00:00.000000Z'}});
  await seletivo.page.waitForTimeout(900);
  await seletivo.page.evaluate(()=>{eval("P_meses['AGO/2026'].push({id:'ago2',nome:'Nova agosto',valor:250,valorPago:0,dia:12,status:'PENDENTE',fixa:false,categoria:''})");eval('P_salvarStorage()');});
  await seletivo.page.waitForTimeout(1900);
  ok('alterar agosto grava somente agosto',seletivo.patches.length===1&&decodeURIComponent(seletivo.patches[0]).includes('/meses/AGO/2026'),'patches='+seletivo.patches.join(','));
  let sync1=await seletivo.page.evaluate(()=>({dirty:[...eval('P_dirtyMeses')],conflitos:[...eval('P_conflitos')]}));
  ok('sucesso limpa a pendência local',sync1.dirty.length===0&&sync1.conflitos.length===0,JSON.stringify(sync1));

  responderConflito=true;
  await seletivo.page.evaluate(()=>{eval("P_meses['AGO/2026'].push({id:'ago3',nome:'Conflito preservado',valor:300,valorPago:0,dia:13,status:'PENDENTE',fixa:false,categoria:''})");eval('P_salvarStorage()');});
  await seletivo.page.waitForTimeout(1900);
  const estadoConflito=await seletivo.page.evaluate(()=>({qtd:eval("P_meses['AGO/2026'].length"),dirty:[...eval('P_dirtyMeses')],conflitos:[...eval('P_conflitos')],status:document.getElementById('syncBar').textContent,cache:JSON.parse(localStorage.getItem('wen_meses6'))['AGO/2026'].length}));
  ok('precondição 412 vira conflito explícito',estadoConflito.conflitos.includes('AGO/2026')&&/conflito/i.test(estadoConflito.status),JSON.stringify(estadoConflito));
  ok('conflito preserva dado em memória e no cache',estadoConflito.qtd===3&&estadoConflito.cache===3&&estadoConflito.dirty.includes('AGO/2026'),JSON.stringify(estadoConflito));
  await seletivo.page.reload({waitUntil:'domcontentloaded'});await seletivo.page.waitForTimeout(1100);
  const aposReload=await seletivo.page.evaluate(()=>({qtd:eval("P_meses['AGO/2026'].length"),conflitos:[...eval('P_conflitos')]}));
  ok('conflito continua preservado depois de recarregar',aposReload.qtd===3&&aposReload.conflitos.includes('AGO/2026'),JSON.stringify(aposReload));
  ok('cenário seletivo sem erro de página',seletivo.erros.length===0,seletivo.erros.join(' | '));
  await seletivo.context.close();
}finally{
  await browser.close();await new Promise(r=>server.close(r));
}

console.log(`\n${passou} passaram, ${falhou} falharam`);
process.exit(falhou?1:0);
