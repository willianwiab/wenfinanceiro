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
  demo:{cliente:'GRAVOU',itens:[it('g1',-10)],exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],condicao:'avista'},
  demo3:{cliente:'VAI GRAVAR',itens:[it('v1',5)],exigeNota:true,fiscalStatus:'pendente',notasEmitidas:[],condicao:'avista'}});
await page.reload();await page.waitForSelector('#lista .grupo-mes');
const visiveis=()=>page.$$eval('#lista .nf-lin',l=>l.filter(x=>x.offsetParent!==null).map(x=>x.querySelector('.nf-nome').textContent.trim()));
// desde 24/11 os meses seguintes ficam À VISTA (grupo por mês, aberto); o cliente sem nota
// também aparece, em "Sem nota fiscal — só acompanhar".
assert.deepEqual(await visiveis(),['GRAVOU','VAI GRAVAR','OUTRO CLIENTE DEMO'],'tudo aberto no começo');
assert.equal(await page.locator('.grupos-acoes').count(),1,'botões de expandir/esconder tudo');
const cab=()=>page.locator('#lista .grupo-mes',{hasText:'Vai gravar em'});
assert.equal(await cab().getAttribute('aria-expanded'),'true');
await cab().click();
assert.deepEqual(await visiveis(),['GRAVOU','OUTRO CLIENTE DEMO'],'clicou: esconde o grupo');
assert.equal(await cab().getAttribute('aria-expanded'),'false');
assert(/1 cobrança · escondido/.test(await cab().textContent()),'o cabeçalho continua dizendo quantas tem');
// fica guardado no aparelho
await page.reload();await page.waitForSelector('#lista .grupo-mes');
assert.deepEqual(await visiveis(),['GRAVOU','OUTRO CLIENTE DEMO'],'lembra o que foi escondido');
// e é por aba: na Cobrança os grupos são outros — e "✅ Pagas" nasce fechado
await page.click('.visoes [data-v="cobranca"]');
assert.deepEqual(await visiveis(),['GRAVOU','VAI GRAVAR'],'outra aba, outros grupos (a paga começa escondida)');
const pagas=()=>page.locator('#lista .grupo-mes',{hasText:'Pagas'});
assert.equal(await pagas().getAttribute('aria-expanded'),'false','Pagas nasce fechado');
await pagas().click();
assert((await visiveis()).includes('OUTRO CLIENTE DEMO'),'clicou: abre as pagas');
await page.reload();await page.waitForSelector('#lista .grupo-mes');
assert((await visiveis()).includes('OUTRO CLIENTE DEMO'),'e lembra que foi aberto');
await page.click('.visoes [data-v="fiscal"]');
// esconder tudo / expandir tudo
await page.click('[data-todos="fechar"]');
assert.deepEqual(await visiveis(),[],'esconder tudo');
assert.equal(await page.locator('#lista .grupo-mes').count(),3,'os cabeçalhos ficam');
await page.click('[data-todos="abrir"]');
assert.deepEqual(await visiveis(),['GRAVOU','VAI GRAVAR','OUTRO CLIENTE DEMO'],'expandir tudo');
// teclado: o cabeçalho é botão
await page.focus('#lista .grupo-mes >> nth=0');await page.keyboard.press('Enter');
assert.deepEqual(await visiveis(),['VAI GRAVAR','OUTRO CLIENTE DEMO'],'Enter no cabeçalho esconde');

await page.evaluate(()=>{['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k));});
assert.deepEqual(erros,[]);
console.log('✅ grupos-recolher: esconder/expandir por grupo, tudo de uma vez, e lembra no aparelho');
}finally{await browser.close();}
