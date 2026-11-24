// 24/11 — Will: "coloque também esconder e expandir nessas separações".
// Rodar:  node test/grupos-recolher.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/grupos-recolher.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const it=(id,n)=>{const d=dia(n);return {id,data:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),
  mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),horario:'-',horas:2,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000};};
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForSelector('#lista .nf-lin');
await page.evaluate(()=>{localStorage.removeItem('wen_fiscal_fechados');localStorage.setItem('wen_fiscal_visao','fiscal');
});
await page.evaluate(c=>localStorage.setItem('wen_mock_marcas',JSON.stringify(c)),{
  demo:{cliente:'GRAVOU',itens:[it('g1',-10)],exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],notaQuando:'gravacao'},
  demo3:{cliente:'VAI GRAVAR',itens:[it('v1',5)],exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],notaQuando:'gravacao'}});
await page.reload();await page.waitForSelector('#lista .grupo-mes');
const visiveis=()=>page.$$eval('#lista .nf-lin',l=>l.filter(x=>x.offsetParent!==null).map(x=>x.querySelector('.nf-nome').textContent.trim()));
assert.deepEqual(await visiveis(),['GRAVOU','VAI GRAVAR'],'tudo aberto no começo');
assert.equal(await page.locator('.grupos-acoes').count(),1,'botões de expandir/esconder tudo');

// esconder um grupo
const cab=page.locator('#lista .grupo-mes',{hasText:'Ainda não é hora'});
assert.equal(await cab.getAttribute('aria-expanded'),'true');
await cab.click();
assert.deepEqual(await visiveis(),['GRAVOU'],'o grupo escondido some');
const cab2=page.locator('#lista .grupo-mes',{hasText:'Ainda não é hora'});
assert.equal(await cab2.getAttribute('aria-expanded'),'false');
assert(/1 cobrança · escondido/.test(await cab2.textContent()),'o cabeçalho continua dizendo quantas tem');

// fica guardado no aparelho
await page.reload();await page.waitForSelector('#lista .grupo-mes');
assert.deepEqual(await visiveis(),['GRAVOU'],'lembra o que foi escondido');

// e é por visão: na Cobrança nada está escondido
await page.click('.visoes [data-v="cobranca"]');
assert.equal((await visiveis()).length,2,'outra visão, outros grupos');
await page.click('.visoes [data-v="fiscal"]');

// esconder tudo / expandir tudo
await page.click('[data-todos="fechar"]');
assert.deepEqual(await visiveis(),[],'esconder tudo');
assert.equal(await page.locator('#lista .grupo-mes').count(),2,'os cabeçalhos ficam');
await page.click('[data-todos="abrir"]');
assert.deepEqual(await visiveis(),['GRAVOU','VAI GRAVAR'],'expandir tudo');

// teclado: o cabeçalho é botão
await page.focus('#lista .grupo-mes >> nth=0');await page.keyboard.press('Enter');
assert.deepEqual(await visiveis(),['VAI GRAVAR'],'Enter no cabeçalho esconde');

await page.evaluate(()=>{['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k));});
assert.deepEqual(erros,[]);
console.log('✅ grupos-recolher: esconder/expandir por grupo, tudo de uma vez, e lembra no aparelho');
}finally{await browser.close();}
