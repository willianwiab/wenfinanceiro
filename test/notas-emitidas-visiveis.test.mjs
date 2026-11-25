// 24/11 — Vendendo Valor: o Will registrou a nota da diária de R$ 2.400 e a de R$ 5.400
// "sumiu" da fila de emitir: o registro cobriu as DUAS diárias (R$ 7.800) sem ele perceber.
// "Preciso visualizar também as notas emitidas."
//   1. "Nota emitida" pelo campo, com mais de uma diária sem nota, não cobre tudo calado;
//   2. nota que cobre várias diárias pede confirmação com a lista;
//   3. a diária com nota sai do card de emitir e aparece em "✅ Notas emitidas" (uma linha por nota);
//   4. o card diz qual nota já saiu; aberto, cada diária diz se tem nota;
//   5. o dono desfaz um registro errado; ela não tem esse botão.
// Rodar:  node test/notas-emitidas-visiveis.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/notas-emitidas-visiveis.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const dialogos=[];let aceitar=true;page.on('dialog',d=>{dialogos.push(d.message());aceitar?d.accept():d.dismiss();});
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const iso=n=>dia(n).toISOString().slice(0,10);
const it=(id,n,extra={})=>{const d=dia(n);return {id,data:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),
  mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),horario:'-',horas:4,studio:'STUDIO A',valor:3400,recebido:0,saldo:3400,...extra};};
const base={exigeNota:true,condicao:'avista',cobrancaStatus:'enviada',vencimento:iso(5),descricaoFiscal:'Serviço',descricaoCobranca:'Cobrança',
  cliente:'VENDENDO VALOR',valor:7800,recebido:5100,saldo:2700,fiscalStatus:'pendente',nfNumero:'',nfData:'',notasEmitidas:[]};
const A=it('dA',-33,{valor:5400,recebido:2700,saldo:2700}), B=it('dB',-40,{valor:2400,recebido:2400,saldo:0});
const cenario=async(c,q='')=>{await page.goto(BASE+'/administrativo.html?mock=1'+q);
  await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.setItem('wen_fiscal_visao','fiscal');localStorage.removeItem('wen_fiscal_fechados');},c);
  await page.reload();await page.waitForSelector('#lista');};
const limpo=t=>t.replace(/\s+/g,' ').replace(/ /g,' ');
const card=()=>page.locator('[data-corpo="fiscal:prontas"] .nf-lin',{hasText:'VENDENDO VALOR'}).textContent().then(limpo);
const emitidas=()=>page.$$eval('[data-corpo="fiscal:emitidas"] .nota-lin',l=>l.map(x=>x.textContent.replace(/\s+/g,' ')));
const abrirFiscal=async()=>{await page.locator('[data-corpo="fiscal:prontas"] .nf-lin',{hasText:'VENDENDO VALOR'}).locator('[data-abrir]').click();
  await page.waitForSelector('#editor .ed-aba');await page.click('.ed-aba[data-aba="fiscal"]');};
try{
// só a Vendendo Valor tem nota em jogo (as outras do mock ficam sem nota fiscal)
const outras={demo3:{exigeNota:false},demo2:{exigeNota:false}};
await cenario({demo:{...base,itens:[A,B]},...outras},'&dono=1');
assert(/nota a emitir ?R\$ 7\.800,00/.test(await card()),'ponto de partida: as duas diárias sem nota — '+await card());
assert.equal(await page.textContent('#verEmitidas .val'),'0','nenhuma nota emitida ainda');

// ── 1. "Nota emitida" pelo campo não cobre as duas caladas ─────────────────
await abrirFiscal();
await page.selectOption('#fiscalStatus','emitida');await page.fill('#nfNumero','23232');await page.fill('#nfData',hoje);
await page.click('#salvar');
const av=await page.textContent('#avisoCobranca');
assert(/tem 2 diárias sem nota/.test(av)&&/Registrar nota/.test(av),'barra e explica: '+av);
await page.selectOption('#fiscalStatus','pendente');await page.fill('#nfNumero','');

// ── 2. nota com as duas marcadas pede confirmação; cancelar não registra ───
aceitar=false;
await page.fill('#notaNumero','23232');
await page.click('#notaRegistrar');
assert(/vai cobrir 2 diárias/.test(dialogos.at(-1)||'')&&/7\.800,00/.test(dialogos.at(-1)),'confirmação mostra o total e a lista: '+dialogos.at(-1));
assert(await page.locator('#notaRegistrar').count(),'cancelou: continua sem registrar');
aceitar=true;

// ── 3. só a de R$ 2.400: a de R$ 5.400 continua na fila de emitir ───────────
const antes=dialogos.length;
await page.uncheck('[data-nota="dA"]');
await page.fill('#notaNumero','23232');
await page.click('#notaRegistrar');await page.waitForTimeout(300);
assert.equal(dialogos.length,antes,'uma diária só: registra direto, sem pergunta');
assert(/nº 23232/.test(await page.textContent('.notas-feitas')),'aparece em "Notas já emitidas" dentro da cobrança');
await page.click('#fecharCobranca');
const c=await card();
assert(/nota a emitir ?R\$ 5\.400,00/.test(c),'a de R$ 5.400 continua para emitir: '+c);
assert(/✔️ 1 com nota · nº 23232/.test(c),'e o card diz qual nota já saiu: '+c);

// ── 4. "✅ Notas emitidas": uma linha por nota, visível pelo cartão do topo ─
assert.equal(await page.textContent('#verEmitidas .val'),'1','o cartão do topo conta a nota');
assert(await page.locator('[data-corpo="fiscal:emitidas"]').isHidden(),'o grupo nasce recolhido');
await page.click('#verEmitidas');
assert(await page.locator('[data-corpo="fiscal:emitidas"]').isVisible(),'clicar no cartão abre o grupo');
const em=await emitidas();
assert.equal(em.length,1);
assert(/VENDENDO VALOR/.test(em[0])&&/nota nº 23232/.test(em[0])&&/R\$ 2\.400,00/.test(limpo(em[0])),'nota, cliente e valor da NOTA: '+em[0]);
assert(/ainda falta nota de 1 diária/.test(em[0]),'e avisa que a cobrança ainda tem diária sem nota');
assert(/1 nota/.test(await page.textContent('[data-grupo="fiscal:emitidas"] .qtd')),'o cabeçalho conta notas');
// aberto, cada diária diz se tem nota
await page.locator('[data-corpo="fiscal:prontas"] .nf-lin',{hasText:'VENDENDO VALOR'}).locator('[data-exp]').click();
const det=limpo(await page.locator('[data-corpo="fiscal:prontas"] .nf-itens').textContent());
assert(/R\$ 2\.400,00 · nota nº 23232/.test(det)&&/R\$ 5\.400,00 · sem nota/.test(det),'diária por diária: '+det);

// ── 5. o dono desfaz o registro errado ─────────────────────────────────────
await abrirFiscal();
await page.click('[data-desfazer-nota="23232"]');await page.waitForTimeout(300);
assert(/Desfazer o registro da nota 23232/.test(dialogos.at(-1)),'pergunta antes');
assert.equal(await page.locator('.notas-feitas').count(),0,'saiu das notas emitidas');
assert.equal(await page.inputValue('#fiscalStatus'),'pendente');
await page.click('#fecharCobranca');
assert(/nota a emitir ?R\$ 7\.800,00/.test(await card()),'as duas voltam para a fila: '+await card());
assert.equal(await page.textContent('#verEmitidas .val'),'0');

// ── 5b. ela vê a nota, mas não tem o botão de desfazer ─────────────────────
await cenario({demo:{...base,itens:[A,B],nfNumero:'23232',nfData:hoje,notasEmitidas:[{numero:'23232',data:hoje,ids:['dB'],valor:2400,em:hoje}]},...outras});
await abrirFiscal();
assert(/nº 23232/.test(await page.textContent('.notas-feitas')),'ela vê a nota registrada');
assert.equal(await page.locator('[data-desfazer-nota]').count(),0,'sem botão de desfazer para ela');
await page.click('#fecharCobranca');

// ── 6. nota marcada só no campo (registro antigo) também entra na lista ────
await cenario({demo:{...base,itens:[A,B],fiscalStatus:'emitida',nfNumero:'4343',nfData:hoje,notasEmitidas:[]},...outras});
const ant=await emitidas();
assert(ant.length===1&&/nota nº 4343/.test(ant[0])&&/R\$ 7\.800,00/.test(limpo(ant[0])),'registro antigo: cobre a cobrança inteira — '+ant);

await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ notas-emitidas-visiveis: lista de notas emitidas, trava de várias diárias e desfazer do dono');
}finally{await browser.close();}
