// 24/11 — Will: "⏳ Vai gravar em Novembro de 2026 tem que estar antes do 📅 Fechamento mensal".
// Ordem do calendário na aba Fiscal: o que grava ainda neste mês → fechamento mensal (nota no
// dia 1º do mês seguinte) → o que grava dos meses seguintes em diante.
// Rodar:  node test/ordem-grupos-fiscal.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/ordem-grupos-fiscal.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const [A,M,D]=hoje.split('-').map(Number);
const ultimo=new Date(A,M,0).getDate();
const prox=M===12?[A+1,1]:[A,M+1];
const item=(id,a,m,d)=>({id,data:String(d).padStart(2,'0')+'/'+String(m).padStart(2,'0'),mes:a+'-'+String(m).padStart(2,'0'),horario:'-',horas:4,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000});
const base={exigeNota:true,cobrancaStatus:'pendente',valor:1000,recebido:0,saldo:1000,vencimento:hoje,descricaoFiscal:'Serviço',descricaoCobranca:'Cobrança',fiscalStatus:'pendente',nfNumero:'',nfData:'',notasEmitidas:[]};
try{
await page.goto(BASE+'/administrativo.html?mock=1');
await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.setItem('wen_fiscal_visao','fiscal');localStorage.removeItem('wen_fiscal_fechados');},{
  demo:{...base,cliente:'MENSAL',condicao:'mensal',itens:[item('m1',A,M,D)]},                      // gravou hoje, nota no dia 1º
  demo2:{...base,cliente:'ESTE MES',condicao:'avista',itens:[item('e1',A,M,ultimo)]},              // grava no fim deste mês
  demo3:{...base,cliente:'MES QUE VEM',condicao:'avista',itens:[item('p1',prox[0],prox[1],15)]}});  // grava no mês seguinte
await page.reload();await page.waitForSelector('#lista [data-grupo]');
const ordem=await page.$$eval('#lista [data-grupo]',l=>l.map(x=>x.dataset.grupo));
const mesAtual='fiscal:fut:'+hoje.slice(0,7), mesProx='fiscal:fut:'+prox[0]+'-'+String(prox[1]).padStart(2,'0');
assert(ordem.includes('fiscal:mensal')&&ordem.includes(mesProx),'os grupos existem: '+ordem);
assert(ordem.indexOf('fiscal:mensal')<ordem.indexOf(mesProx),'fechamento mensal (dia 1º) vem antes do que grava no mês seguinte: '+ordem);
if(D<ultimo){
  assert(ordem.includes(mesAtual),'o que grava ainda neste mês tem grupo próprio: '+ordem);
  assert(ordem.indexOf(mesAtual)<ordem.indexOf('fiscal:mensal'),'"Vai gravar" deste mês vem ANTES do fechamento mensal: '+ordem);
}else console.log('   (hoje é o último dia do mês: não existe "grava ainda neste mês" para conferir)');
await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ ordem-grupos-fiscal: vai gravar neste mês → fechamento mensal → meses seguintes');
}finally{await browser.close();}
