// 24/11 — economia de leituras na tela da Natália: a atualização automática traz SÓ o que
// mudou (antes relia ~100 documentos a cada mudança e a cada volta para a aba), cobrança
// apagada chega por sinal "removido", e um freio para a atualização automática se as
// leituras do dia passarem do teto.
// Rodar:  node test/ao-vivo-fiscal.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/ao-vivo-fiscal.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForSelector('#lista .nf-lin');
await page.evaluate(()=>{
  ['wen_fiscal_leituras_auto','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k));
  const it=id=>({id,mes:'2026-11',data:'10/11',horario:'-',horas:2,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000});
  const f=(id,cliente,t,extra={})=>({id,cliente,itens:[it(id+'i')],lancamentoIds:[id+'i'],valor:1000,recebido:0,saldo:1000,exigeNota:true,fiscalStatus:'pendente',
    cobrancaStatus:'pendente',vencimento:'2099-01-10',criadoEm:t,atualizadoEm:t,notasEmitidas:[],clienteFiscal:{},updateTime:'u',...extra});
  window.__f=f;
  const T='2026-11-24T10:00:00.000Z';
  window.__nuvemF={a:f('a','ALFA',T),b:f('b','BETA',T)};window.__nuvemA={};window.__consultas=[];
  const to=v=>typeof v==='string'?{stringValue:v}:typeof v==='number'?{doubleValue:v}:typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(to)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,to(x)]))}};
  window.fetch=async(url,opt)=>{
    const u=String(url);
    if(u.includes(':runQuery')){
      const q=JSON.parse(opt.body).structuredQuery, col=q.from[0].collectionId, campo=q.where.fieldFilter.field.fieldPath, desde=q.where.fieldFilter.value.stringValue;
      const base=col==='administrativo_fechamentos'?window.__nuvemF:window.__nuvemA;
      const mud=Object.entries(base).filter(([,x])=>String(x[campo]||'')>desde).slice(0,q.limit);
      window.__consultas.push(col.replace('administrativo_','')+':'+mud.length);
      return new Response(JSON.stringify(mud.length?mud.map(([id,x])=>({document:{name:'p/'+col+'/'+id,fields:Object.fromEntries(Object.entries(x).filter(([k])=>k!=='id'&&k!=='updateTime').map(([k,v])=>[k,to(v)])),updateTime:'u2'}})):[{readTime:'t'}]),{status:200});
    }
    return new Response('{}',{status:200});
  };
  __fiscalTeste.entrar();
  __fiscalTeste.semear(Object.values(window.__nuvemF).map(x=>({...x})),[]);
  localStorage.setItem('wen_fiscal_visao','cobranca');
});
const nomes=()=>page.$$eval('#lista .nf-lin',l=>l.filter(x=>x.offsetParent!==null).map(x=>x.querySelector('.nf-nome').textContent.trim()));   // só o que está à vista (Pagas nasce fechado)
const lidas=()=>page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('wen_fiscal_leituras_auto')).n;}catch(e){return 0;}});
assert.deepEqual((await nomes()).sort(),['ALFA','BETA'],'ponto de partida');

// ── nada mudou: 2 consultas vazias = 2 leituras, tela intacta ──
assert.equal(await page.evaluate(()=>__fiscalTeste.conferir()),0);
assert.deepEqual(await page.evaluate(()=>window.__consultas),['fechamentos:0','avisos:0']);
assert.equal(await lidas(),2,'parado custa 2 leituras por consulta');

// ── o Will mexe: muda uma cobrança, cria outra e chega um aviso ──
await page.evaluate(()=>{const T='2026-11-24T10:05:00.000Z';
  Object.assign(window.__nuvemF.a,{cobrancaStatus:'pago',saldo:0,recebido:1000,atualizadoEm:T});window.__nuvemF.a.itens[0].saldo=0;window.__nuvemF.a.itens[0].recebido=1000;
  window.__nuvemF.c=window.__f('c','GAMA',T);
  window.__nuvemA.av1={tipo:'pago',texto:'✅ ALFA — pagamento confirmado',fechamentoId:'a',criadoEm:T,lidoEm:''};window.__consultas.length=0;});
assert.equal(await page.evaluate(()=>__fiscalTeste.conferir()),3,'vieram 2 cobranças e 1 aviso');
assert.deepEqual((await nomes()).sort(),['BETA','GAMA'],'a paga sai da lista de cobrar, a nova entra — sem reler tudo');
assert.equal(await page.evaluate(()=>__fiscalTeste.estado().brutos),3);
assert.deepEqual(await page.evaluate(()=>__fiscalTeste.estado().avisos),['av1'],'o aviso entrou no 🔔');
assert.equal(await lidas(),2+3,'custou exatamente o que mudou (3), não a coleção inteira');
// de novo: não traz nada repetido
assert.equal(await page.evaluate(()=>__fiscalTeste.conferir()),0,'a marca avançou');

// ── o Will exclui uma diária: o financeiro apaga a cobrança e deixa o sinal "removido" ──
await page.evaluate(()=>{delete window.__nuvemF.b;
  window.__nuvemA.rm={tipo:'removido',fechamentoId:'b',cliente:'BETA',texto:'',criadoEm:'2026-11-24T10:10:00.000Z',lidoEm:'x'};});
await page.evaluate(()=>__fiscalTeste.conferir());
assert.deepEqual(await nomes(),['GAMA'],'o card apagado some sem releitura completa');
assert.deepEqual(await page.evaluate(()=>__fiscalTeste.estado().avisos),['av1'],'o sinal não vira aviso no 🔔');
// renasceu depois do sinal (mesmo id): volta
await page.evaluate(()=>{window.__nuvemF.b=window.__f('b','BETA','2026-11-24T10:20:00.000Z');});
await page.evaluate(()=>__fiscalTeste.conferir());
assert.deepEqual((await nomes()).sort(),['BETA','GAMA'],'cobrança recriada depois do sinal volta');

// ── freio: passou do teto do dia, a atualização automática para e aparece o aviso ──
assert.equal(await page.isVisible('#freioAviso'),false,'sem aviso em dia normal');
await page.evaluate(()=>{__fiscalTeste.freioSomar(__fiscalTeste.FREIO_TETO);__fiscalTeste.freioMostrar();});
assert.equal(await page.evaluate(()=>__fiscalTeste.freioAtivo()),true);
assert(/pausada por hoje/.test(await page.textContent('#freioAviso'))&&await page.isVisible('#freioAviso'),'aviso de pausa visível');
await page.evaluate(()=>localStorage.setItem('wen_fiscal_leituras_auto',JSON.stringify({dia:'2000-01-01',n:999999})));
assert.equal(await page.evaluate(()=>__fiscalTeste.freioAtivo()),false,'no dia seguinte zera');

await page.evaluate(()=>['wen_fiscal_leituras_auto','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ ao-vivo-fiscal: traz só o que mudou, sinal de removido, e freio de leituras');
}finally{await browser.close();}
