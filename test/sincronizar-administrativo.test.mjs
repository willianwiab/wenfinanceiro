// Substitui liberacao-lote.test.mjs: a subaba "Fechamentos e cobranças" foi aposentada
// em 20/11 ("essa aba não tem mais necessidade... eu só decido pela aba clientes").
// As diárias chegam sozinhas; o botão 🔄 Sincronizar alcança o que ficou para trás.
//
// Rodar:  node test/sincronizar-administrativo.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/sincronizar-administrativo.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(BASE+'/?mock=1');await page.waitForTimeout(1800);

await page.evaluate(async()=>{
  await MOD_umaVez('notas-fiscais',NF_carregar);await MOD_umaVez('clientes-fiscais',CFI_carregar);
  FC_dados={};FC_ok=true;R_todosOsDados.length=0;CFI_FICHAS={};
  const d=(id,cliente,extra={})=>({id,cliente,mes:'NOV/2026',data:'10/11/2026',horario:'-',horas:2,
    studio:'STUDIO A',valorTotal:1000,valorReserva:0,saldo:1000,desc:'Videocast',...extra});
  R_todosOsDados.push(d('E1','Entra'), d('E2','Entra'), d('S1','Sai'), d('N1','NaoFaturavel',{naoFaturavel:true}));
  // "Sai" já está espelhado de antes
  await FC_espelhar([R_todosOsDados.find(r=>r.id==='S1')],'antes');
  // e só AGORA o Will desmarca os dois chips dele
  CFI_FICHAS.sai={id:'sai',nome:'Sai',nomes:['Sai'],exigeNota:false,cobrancaAdministrativo:false};
  window.CFI_carregar=async()=>{CFI_ok=true;return true;};
  showMain('notas');NF_setAba('clientes');
  await new Promise(r=>setTimeout(r,400));
});

// ── a subaba antiga não existe mais ───────────────────────────────────────
assert.equal(await page.locator('#nfAbaFech').count(),0,'a subaba "Fechamentos e cobranças" saiu');
const abas=await page.$$eval('.nf-abas button',e=>e.map(b=>b.textContent.trim()));
assert(!abas.some(t=>/fechamentos/i.test(t)),'e não sobrou nenhum botão dela: '+abas.join(' | '));

// quem tinha a aba salva no estado não fica numa tela em branco
await page.evaluate(()=>NF_setAba('fechamentos'));
await page.waitForTimeout(300);
assert.equal(await page.locator('#cfiSync').count(),1,'cai na aba Clientes, que tem o botão');

// ── o diagnóstico vê os três casos ────────────────────────────────────────
const d=await page.evaluate(()=>FC_diagnostico());
assert.deepEqual(d.faltam,[{cliente:'Entra',qtd:2}],'as duas diárias do Entra ainda não chegaram');
assert.deepEqual(d.sobram,[],'24/11: ninguém "sobra" mais — desmarcado nos dois continua na tela dela');
assert(!JSON.stringify(d).includes('NaoFaturavel'),'🚫 não faturável nem é considerado');

// ── sincronizar resolve os três de uma vez ────────────────────────────────
await page.click('#cfiSync');
await page.waitForFunction(()=>Object.values(FC_dados).some(f=>f.cliente==='Entra'),null,{timeout:20000});
const final=await page.evaluate(()=>Object.values(FC_dados).map(f=>({c:f.cliente,n:f.itens.length})));
assert.deepEqual(final.sort((a,b)=>a.c.localeCompare(b.c)),[{c:'Entra',n:2},{c:'Sai',n:1}],'o Entra entrou com as duas diárias; o desmarcado continua lá');
assert.deepEqual(await page.evaluate(()=>FC_diagnostico().faltam),[],'nada mais faltando');
assert.deepEqual(await page.evaluate(()=>FC_diagnostico().sobram),[],'nada mais sobrando');

// rodar de novo não duplica
await page.click('#cfiSync');
await page.waitForTimeout(2000);
const ids=await page.evaluate(()=>Object.values(FC_dados).flatMap(f=>f.lancamentoIds));
assert.equal(new Set(ids).size,ids.length,'é idempotente: nenhuma diária em dois fechamentos');

// ── quem não emite nota para de ser cobrado por CPF/CNPJ ──────────────────
await page.evaluate(()=>{
  R_todosOsDados.push({id:'SN1',cliente:'Sem Nota Ltda',mes:'NOV/2026',data:'12/11/2026',horario:'-',
    horas:2,studio:'STUDIO A',valorTotal:500,valorReserva:0,saldo:500,desc:'x'});
  CFI_FICHAS.semnotaltda={id:'semnotaltda',nome:'Sem Nota Ltda',nomes:['Sem Nota Ltda'],
    notaRegra:'nenhuma',exigeNota:false,cobrancaAdministrativo:true,
    contatoFinanceiro:'Ana',whatsappFinanceiro:'11999999999'};
  CFI_render();
});
const selo=await page.textContent('#nfConteudo .cfi-lin:has(.cfi-nome:text-is("Sem Nota Ltda"))');
assert(!/falta.*CNPJ/i.test(selo),'quem não emite nota não precisa de CNPJ: '+selo.replace(/\s+/g,' '));

assert.deepEqual(erros,[]);
console.log('✅ sincronizar-administrativo: a subaba saiu, o botão da aba Clientes faz o trabalho');
}finally{await browser.close();}
