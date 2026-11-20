// Liberação em lote: o Will marca na ficha quem o administrativo atende, e libera o
// mês inteiro de uma vez. Prova que o lote respeita a ficha, pula quem já tem
// fechamento, não libera duas vezes a mesma diária e carrega o modo 50/50.
//
// Rodar:  node test/liberacao-lote.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/liberacao-lote.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(BASE+'/?mock=1');await page.waitForTimeout(1500);

await page.evaluate(async()=>{
 await MOD_umaVez('notas-fiscais',NF_carregar);await MOD_umaVez('clientes-fiscais',CFI_carregar);
 const diaria=(id,cliente,extra={})=>({id,cliente,mes:'NOV/2026',data:'18/11/2026',horario:'10:00 AS 12:00',
   horas:2,studio:'STUDIO A',valorTotal:1000,valorReserva:0,saldo:1000,desc:'Produção audiovisual',...extra});
 R_todosOsDados.push(
   diaria('L1','Alfa'), diaria('L2','Alfa'),
   diaria('L3','Beta'),
   diaria('L4','Gama'),
   diaria('L5','Delta'),
   diaria('L6','Meio',{valorReserva:500,saldo:500}));   // 50% de sinal
 // Gama foi desmarcada nas DUAS coisas: o administrativo não atende.
 CFI_FICHAS.gama={id:'gama',nome:'Gama',exigeNota:false,cobrancaAdministrativo:false};
 // Delta não pede nota, mas quem cobra é a Natália: continua entrando.
 CFI_FICHAS.delta={id:'delta',nome:'Delta',exigeNota:false,cobrancaAdministrativo:true};
 // Meio pede a nota do sinal separada da do saldo.
 CFI_FICHAS.meio={id:'meio',nome:'Meio',exigeNota:true,notaSinal:'separado'};
 showMain('notas');NF_setAba('fechamentos');
 document.getElementById('nfFCliente').value='';
 document.getElementById('nfFMesIni').value='NOV/2026';document.getElementById('nfFMesFim').value='NOV/2026';
 NF_montar();
});

// 1) a ficha manda em quem aparece
const nomes=()=>page.$$eval('.fc-lote-cb',e=>e.map(x=>x.dataset.cli).sort());
assert.deepEqual(await nomes(),['Alfa','Beta','Delta','Meio'],'Gama (desmarcada nas duas) fica de fora; Delta e sem-ficha entram');

// 2) desmarcar um cliente tira ele da conta e da liberação
await page.uncheck('.fc-lote-cb[data-cli="Beta"]');
await page.waitForFunction(()=>document.querySelectorAll('.fc-lote-cb:checked').length===3);

// 3) libera o lote
await page.click('#fcLiberarLote');
await page.waitForFunction(()=>Object.keys(FC_dados).length===3,null,{timeout:15000});
const libs=await page.evaluate(()=>Object.values(FC_dados).map(f=>({
  cliente:f.cliente,itens:f.itens.length,valor:f.valor,notaModo:f.notaModo,exigeNota:f.exigeNota})));
const porNome=Object.fromEntries(libs.map(f=>[f.cliente,f]));
assert.deepEqual(Object.keys(porNome).sort(),['Alfa','Delta','Meio'],'liberou só os marcados');
assert.equal(porNome.Alfa.itens,2,'as duas diárias do Alfa viraram UM fechamento');
assert.equal(porNome.Alfa.valor,2000);
assert.equal(porNome.Delta.exigeNota,false,'Delta entra sem nota, só para cobrança');
assert.equal(porNome.Meio.notaModo,'separado','o modo 50/50 da ficha chegou no fechamento');
assert.equal(porNome.Alfa.notaModo,'junto');

// 4) quem já foi liberado some da lista; quem ficou de fora continua lá
await page.evaluate(()=>NF_montar());
assert.deepEqual(await nomes(),['Beta'],'só sobra quem não foi liberado');

// 5) e liberar de novo não duplica diária
await page.check('.fc-lote-cb[data-cli="Beta"]');
await page.click('#fcLiberarLote');
await page.waitForFunction(()=>Object.keys(FC_dados).length===4,null,{timeout:15000});
const ids=await page.evaluate(()=>Object.values(FC_dados).flatMap(f=>f.lancamentoIds));
assert.equal(new Set(ids).size,ids.length,'nenhuma diária saiu em dois fechamentos');
await page.evaluate(()=>NF_montar());
assert.equal(await page.locator('.fc-lote-cb').count(),0,'nada mais solto no recorte');
assert((await page.textContent('#nfConteudo')).includes('Nada solto'));

// ── "Carregar tudo desde outubro/2026" ignora o recorte de meses ──────────
await page.evaluate(()=>{
  R_todosOsDados.push({id:'OUT1',cliente:'Zeta',mes:'OUT/2026',data:'20/10/2026',horario:'-',
    horas:2,studio:'STUDIO A',valorTotal:900,valorReserva:0,saldo:900,desc:'Antiga'});
  NF_montar();
});
assert.equal(await page.locator('.fc-lote-cb').count(),0,'fora do recorte NOV, a diária de OUT não aparece');
await page.check('#fcLoteTudo');
await page.waitForFunction(()=>document.querySelectorAll('.fc-lote-cb').length===1);
assert.deepEqual(await nomes(),['Zeta'],'com "tudo", a diária de outubro aparece');
await page.click('#fcLiberarLote');
await page.waitForFunction(()=>Object.values(FC_dados).some(f=>f.cliente==='Zeta'),null,{timeout:15000});

// rodar de novo não duplica — o espelho é idempotente
const antes=await page.evaluate(()=>Object.keys(FC_dados).length);
await page.evaluate(async()=>{await FC_espelhar(R_todosOsDados.filter(r=>r.cliente==='Zeta'),'carga');});
assert.equal(await page.evaluate(()=>Object.keys(FC_dados).length),antes,
  'espelhar a mesma diária de novo não cria outro fechamento');

// ── 🧹 limpar quem ficou para trás ────────────────────────────────────────
// A remoção automática só vale dali para a frente. Quem o Will desmarcou ANTES
// continuava na tela dela — foi o caso da Silvia Vinhas em 20/11.
await page.evaluate(()=>{
  // Alfa já está espelhado; agora o Will desmarca os dois chips dele
  CFI_FICHAS.alfa={id:'alfa',nome:'Alfa',exigeNota:false,cobrancaAdministrativo:false};
  NF_montar();
});
const naoAtend=await page.evaluate(()=>FC_naoAtendidos().map(g=>({c:g.cliente,q:g.qtd})));
assert.deepEqual(naoAtend,[{c:'Alfa',q:1}],'aponta quem está lá sem dever estar');
assert.equal(await page.locator('#fcLimpar').count(),1,'e oferece o botão de limpar');

const antesLimpar=await page.evaluate(()=>Object.keys(FC_dados).length);
await page.click('#fcLimpar');                       // o dialog é aceito pelo handler do teste
await page.waitForFunction(n=>Object.keys(FC_dados).length===n-1,antesLimpar,{timeout:15000});
assert.equal(await page.evaluate(()=>FC_naoAtendidos().length),0,'depois da limpeza, ninguém sobra');
await page.evaluate(()=>NF_montar());
assert.equal(await page.locator('#fcLimpar').count(),0,'e o aviso some');

// quem tem NOTA EMITIDA não é levado pela limpeza
await page.evaluate(async()=>{
  const regs=[{id:'NT1',cliente:'Omega',mes:'NOV/2026',data:'20/11/2026',horario:'-',horas:2,
    studio:'STUDIO A',valorTotal:500,valorReserva:0,saldo:500,desc:'x'}];
  R_todosOsDados.push(...regs);
  await FC_espelhar(regs,'teste');
  const f=Object.values(FC_dados).find(x=>x.cliente==='Omega');
  Object.assign(f,{fiscalStatus:'emitida',nfNumero:'999',nfData:'2026-11-20'});
  CFI_FICHAS.omega={id:'omega',nome:'Omega',exigeNota:false,cobrancaAdministrativo:false};
  NF_montar();
});
const comNota=await page.evaluate(()=>FC_naoAtendidos().map(g=>({c:g.cliente,q:g.qtd,n:g.comNota})));
assert.deepEqual(comNota,[{c:'Omega',q:1,n:1}],'aparece, mas marcado como "com nota"');
await page.click('#fcLimpar');
await page.waitForTimeout(1200);
assert.equal(await page.evaluate(()=>Object.values(FC_dados).filter(f=>f.cliente==='Omega').length),1,
  '🔒 fechamento com nota emitida sobrevive à limpeza');

assert.deepEqual(errors,[]);
console.log('✅ liberacao-lote: a ficha decide quem entra, um fechamento por cliente, sem diária em dobro, 50/50 preservado');
}finally{await browser.close();}
