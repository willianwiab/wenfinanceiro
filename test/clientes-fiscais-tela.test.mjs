// Aba 👥 Clientes do WEN Financeiro, depois que o CADASTRO saiu dela (20/11, pedido
// do Will: "pode desfazer o cadastro pelo sistema financeiro").
//
// O que SOBROU aqui: ver quem tem ficha, quem não tem, e decidir por cliente —
// 🧾 regra da nota, 💰 quem cobra, 💳 condição de pagamento.
// O que SAIU: o formulário. Quem preenche CNPJ/contato é a Natália, no administrativo
// (coberto por ficha-no-fiscal.test.mjs).
//
// Rodar:  node test/clientes-fiscais-tela.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/clientes-fiscais-tela.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);

const antesDoReceber=await page.evaluate(async()=>{
  await MOD_umaVez('notas-fiscais',NF_carregar);await MOD_umaVez('clientes-fiscais',CFI_carregar);
  window.__salvos=[];window.BC_fbUpsert=async(col,id,doc)=>{window.__salvos.push({col,id,doc});};
  CFI_FICHAS={};
  ['CLIENTE GRANDE','CLIENTE PEQUENO'].forEach((c,i)=>R_todosOsDados.push({id:'cf'+i,cliente:c,
    mes:'NOV/2026',data:'1'+i+'/11/2026',horas:2,studio:'STUDIO A',
    valorTotal:(i?1000:9000),valorReserva:0,saldo:(i?1000:9000),desc:'Videocast'}));
  showMain('notas');NF_setAba('clientes');
  await new Promise(r=>setTimeout(r,400));
  return JSON.stringify(R_todosOsDados.length);
});
assert(antesDoReceber);

// ── o formulário de cadastro NÃO existe mais aqui ──────────────────────────
assert.equal(await page.locator('#cfiModalBg').count(),0,'o modal de cadastro saiu');
for(const id of ['cfiF_doc','cfiF_razaoSocial','cfiF_contatoFinanceiro'])
  assert.equal(await page.locator('#'+id).count(),0,'o campo '+id+' saiu do financeiro');
assert.equal(await page.evaluate(()=>typeof window.CFI_abrir),'undefined','CFI_abrir não existe mais');
assert.equal(await page.evaluate(()=>typeof window.CFI_salvar),'undefined','CFI_salvar também não');

// ── mas a lista continua mostrando quem ainda não tem ficha ────────────────
const pend=()=>page.$$eval('#nfConteudo .cfi-lin.pend .cfi-nome',e=>e.map(x=>x.textContent));
assert.deepEqual(await pend(),['CLIENTE GRANDE','CLIENTE PEQUENO'],
  'quem faturou e não tem ficha aparece, do maior para o menor');

// e manda para onde o cadastro agora vive
const link=page.locator('#nfConteudo .cfi-lin.pend a').first();
assert.equal(await link.getAttribute('href'),'administrativo.html','o botão leva ao administrativo');
assert.equal(await link.getAttribute('target'),'_blank');

// ── as DECISÕES do Will continuam aqui, e funcionam ────────────────────────
const linha='#nfConteudo .cfi-lin:has(.cfi-nome:text-is("CLIENTE GRANDE"))';
assert.equal(await page.locator(linha+' .cfi-cond.nota').count(),1,'🧾 regra da nota');
assert.equal(await page.locator(linha+' .cfi-chip').count(),1,'💰 quem cobra');
assert.equal(await page.locator(linha+' .cfi-cond:not(.nota)').count(),1,'💳 condição');

await page.selectOption(linha+' .cfi-cond.nota','duas');
await page.waitForFunction(()=>window.__salvos.length===1);
let f=await page.evaluate(()=>window.__salvos.at(-1).doc);
assert.equal(f.notaRegra,'duas');
assert.equal(f.notaSinal,'separado','mantém o campo antigo coerente');
assert.equal(f.exigeNota,true);
assert.equal(f.nome,'CLIENTE GRANDE','a ficha nasce com o nome do Receber');

await page.selectOption(linha+' .cfi-cond:not(.nota)','mensal');
await page.waitForFunction(()=>window.__salvos.length===2);
assert.equal(await page.evaluate(()=>window.__salvos.at(-1).doc.condicaoPagamento),'mensal');

await page.click(linha+' .cfi-chip');
await page.waitForFunction(()=>window.__salvos.length===3);
assert.equal(await page.evaluate(()=>window.__salvos.at(-1).doc.cobrancaAdministrativo),false);

// ── nada disso tocou no Receber ────────────────────────────────────────────
assert(await page.evaluate(()=>window.__salvos.every(s=>s.col==='clientes_fiscais')),
  '🔒 só o cadastro fiscal foi gravado');
assert.equal(await page.evaluate(()=>R_todosOsDados.filter(r=>r.cliente==='CLIENTE GRANDE').length),1);

// ── as outras abas continuam de pé ─────────────────────────────────────────
for(const aba of ['fila','emitidas','fechamentos','avisos']){
  await page.evaluate(a=>NF_setAba(a),aba);await page.waitForTimeout(250);
  assert(await page.evaluate(()=>!!document.getElementById('nfConteudo').innerHTML),'aba '+aba+' monta');
}

assert.deepEqual(erros,[]);
console.log('✅ clientes-fiscais-tela: cadastro saiu do financeiro; lista e decisões do Will ficaram');
}finally{await browser.close();}
