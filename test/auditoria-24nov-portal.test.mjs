// Auditoria de 24/11 — tela da Natália. Cada bloco é um bug achado nos dados reais:
//  1. "Nota emitida" marcada no campo Situação fiscal não deixava rastro por diária e o card
//     continuava "emitir nota · gravou há N dias" (Vitrine Cast, Podcast Positivo, Biolab).
//  2. Número de nota digitado com status "pendente" era salvo calado (Leaders Brief).
//  3. "Enviada" escolhida no campo não gravava a data do envio (4 cobranças).
//  4. O campo Vencimento era editável, mas as regras recusam — o salvar inteiro falhava.
//  5. Condição com sinal (50%+50%): o sinal se cobra ANTES da gravação.
// Rodar:  node test/auditoria-24nov-portal.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/auditoria-24nov-portal.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const iso=n=>dia(n).toISOString().slice(0,10);
const it=(id,n,extra={})=>{const d=dia(n);return {id,data:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),
  mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),horario:'-',horas:4,studio:'STUDIO B',valor:3400,recebido:0,saldo:3400,...extra};};
const limpar=()=>page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
const cenario=async(c,visao)=>{await page.evaluate(([c,v])=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.setItem('wen_fiscal_visao',v);localStorage.setItem('wen_fiscal_fechados','["+cobranca:agravar","+fiscal:futuras"]');},[c,visao]);
  await page.reload();await page.waitForSelector('#lista');};
// a fila de emitir é o grupo "🧾 Emitir nota agora" (desde 24/11 a aba Fiscal mostra tudo, em grupos)
const nomes=()=>page.$$eval('[data-corpo="fiscal:prontas"] .nf-lin',l=>l.map(x=>x.querySelector('.nf-nome').textContent.trim()));
const card=n=>page.locator('#lista .nf-lin',{hasText:n}).textContent().then(t=>t.replace(/\s+/g,' ').replace(/ /g,' '));
const base={exigeNota:true,condicao:'avista',cobrancaStatus:'pendente',valor:3400,recebido:0,saldo:3400,vencimento:iso(5),descricaoFiscal:'Serviço',descricaoCobranca:'Cobrança'};
try{
await page.goto(BASE+'/administrativo.html?mock=1');await limpar();

// ── 1a. o que JÁ está assim no banco: emitida no campo, sem registro por diária ──
await cenario({
  demo:{...base,cliente:'VITRINE',itens:[it('v1',-27)],fiscalStatus:'emitida',nfNumero:'4343',nfData:hoje,notasEmitidas:[]},
  demo3:{...base,cliente:'SEM NOTA AINDA',itens:[it('s1',-10)],fiscalStatus:'pendente',nfNumero:'',nfData:'',notasEmitidas:[]}},'fiscal');
assert.deepEqual(await nomes(),['SEM NOTA AINDA'],'nota marcada como emitida sai da fila de emitir');
assert((await page.$$eval('[data-corpo="fiscal:emitidas"] .nf-lin .nf-nome',l=>l.map(x=>x.textContent.trim()))).includes('VITRINE'),'e vai para o grupo ✅ Nota emitida');
await page.click('.visoes [data-v="cobranca"]');
assert(/nota 4343/.test(await card('VITRINE')),'e na cobrança aparece "nota 4343"');

// ── 2. número digitado com status pendente não passa calado ────────────────
await page.locator('#lista .nf-lin',{hasText:'SEM NOTA AINDA'}).locator('[data-abrir]').click();
await page.waitForSelector('#editor .ed-aba');await page.click('.ed-aba[data-aba="fiscal"]');
await page.fill('#nfNumero','777');await page.fill('#nfData',hoje);
await page.click('#salvar');
assert(/marque "Nota emitida"/.test(await page.textContent('#avisoCobranca')),'número sem "emitida" é barrado com explicação');
// ── 1b. marcar "Nota emitida" no campo agora deixa o rastro por diária ─────
await page.selectOption('#fiscalStatus','emitida');
await page.click('#salvar');await page.waitForTimeout(400);
const reg=await page.evaluate(()=>JSON.parse(localStorage.getItem('wen_mock_marcas')));   // só para garantir que o mock não mudou
assert(reg.demo3,'cenário intacto');
await page.click('#fecharCobranca');
await page.click('.visoes [data-v="fiscal"]');
assert.deepEqual(await nomes(),[],'depois de salvar como emitida, some da fila fiscal');
await page.click('.visoes [data-v="cobranca"]');
assert(/nota 777/.test(await card('SEM NOTA AINDA')),'e o card mostra a nota 777');

// ── 3. "Enviada" pelo campo grava a data ───────────────────────────────────
await page.locator('#lista .nf-lin',{hasText:'SEM NOTA AINDA'}).locator('[data-abrir]').click();
await page.waitForSelector('#editor #cobrancaStatus');
// ── 4. vencimento não é editável aqui ──────────────────────────────────────
assert.equal(await page.getAttribute('#vencimento','readonly'),'','o vencimento vem do financeiro: só leitura');
await page.selectOption('#cobrancaStatus','enviada');
await page.click('#salvar');await page.waitForTimeout(400);
await page.click('#fecharCobranca');
const hojeBR=hoje.slice(8,10)+'/'+hoje.slice(5,7);
assert(new RegExp('📨 cobrada em '+hojeBR).test(await card('SEM NOTA AINDA')),'"Enviada" pelo campo registra a data: '+await card('SEM NOTA AINDA'));
assert(/aguardando pagamento/.test(await card('SEM NOTA AINDA')),'e o valor vira "aguardando pagamento"');

// ── 5. sinal 50%: cobra-se antes da gravação ───────────────────────────────
await cenario({
  demo:{...base,cliente:'COM SINAL',condicao:'sinal50',itens:[it('c1',9,{valor:8000,recebido:0,saldo:8000})],valor:8000,saldo:8000,fiscalStatus:'pendente',notasEmitidas:[]},
  demo3:{...base,cliente:'SINAL PAGO',condicao:'sinal50',itens:[it('p1',9,{valor:8000,recebido:4000,saldo:4000})],valor:8000,recebido:4000,saldo:4000,fiscalStatus:'pendente',notasEmitidas:[]}},'cobranca');
const cs=await card('COM SINAL');
assert(/falta cobrar o sinal ?R\$ 4\.000,00/.test(cs)&&/a cobrar/.test(cs),'sinal de 50% entra no falta cobrar mesmo sem gravar: '+cs);
const sp=await card('SINAL PAGO');
assert(/a gravar/.test(sp)&&!/falta cobrar/.test(sp),'sinal pago: espera a gravação: '+sp);

// ── modo "sinal e saldo em notas separadas": as duas emitidas = nada a emitir ──
await cenario({
  demo:{...base,cliente:'DUAS NOTAS',itens:[it('d1',-10)],notaModo:'separado',nfSinalStatus:'emitida',nfSaldoStatus:'emitida',fiscalStatus:'emitida',notasEmitidas:[]},
  demo3:{...base,cliente:'FALTA O SALDO',itens:[it('d2',-10)],notaModo:'separado',nfSinalStatus:'emitida',nfSaldoStatus:'pendente',fiscalStatus:'pendente',notasEmitidas:[]}},'fiscal');
assert.deepEqual(await nomes(),['FALTA O SALDO'],'separado: só sai da fila com as duas notas');

// ── "NF não solicitada pelo cliente" marcada na cobrança: não entra na fila de emitir ──
await cenario({
  demo:{...base,cliente:'SEM NF NESTA',itens:[it('n1',-10)],fiscalStatus:'nao_solicitada',nfNumero:'',notasEmitidas:[]},
  demo3:{...base,cliente:'COM NF',itens:[it('n2',-10)],fiscalStatus:'pendente',notasEmitidas:[]}},'fiscal');
assert.deepEqual(await nomes(),['COM NF'],'não solicitada fica fora da fila de emitir');
assert((await page.$$eval('[data-corpo="fiscal:semnota"] .nf-lin .nf-nome',l=>l.map(x=>x.textContent.trim()))).includes('SEM NF NESTA'),'e aparece em 🚫 Sem nota — só acompanhar');
await page.click('.visoes [data-v="cobranca"]');
assert(/NF não solicitada/.test(await card('SEM NF NESTA'))&&!/nota pendente/.test(await card('SEM NF NESTA')),'e o selo diz "NF não solicitada"');

await limpar();
assert.deepEqual(erros,[]);
console.log('✅ auditoria-24nov-portal: nota pelo campo, número sem status, data do envio, vencimento só leitura, sinal antes da gravação');
}finally{await browser.close();}
