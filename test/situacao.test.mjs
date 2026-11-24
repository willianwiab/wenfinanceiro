// 📋 Situação — o resumo em português no topo da cobrança aberta (Will, 24/11):
// "cliente precisa emitir nota; vencimento tá dia tal; ele disse que vai pagar dia tal;
//  pagou 50% com a nota tal e falta pagar 50% da nota tal, da diária tal."
// Rodar:  node test/situacao.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/situacao.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const iso=n=>dia(n).toISOString().slice(0,10);
const br=n=>iso(n).split('-').reverse().join('/'), dm=n=>br(n).slice(0,5);
const d=(id,n,v,r)=>{const x=dia(n);return {id,data:dm(n),mes:x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0'),horario:'-',horas:6,studio:'STUDIO A',valor:v,recebido:r,saldo:v-r};};
const base={exigeNota:true,condicao:'avista',cobrancaStatus:'pendente',fiscalStatus:'pendente',notasEmitidas:[],descricaoFiscal:'x',descricaoCobranca:'y',promessaData:'',promessaObs:''};
const abrirCom=async(c,nome)=>{
  await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.setItem('wen_fiscal_visao','cobranca');localStorage.setItem('wen_fiscal_fechados','[]');},c);
  await page.reload();await page.waitForSelector('#lista .nf-lin');await page.click('[data-todos="abrir"]');
  await page.locator('#lista .nf-lin',{hasText:nome}).locator('[data-abrir]').click();
  await page.waitForSelector('#situacao');
  const t=(await page.innerText('#situacao')).replace(/\s+/g,' ').replace(/ /g,' ');
  await page.click('#fecharCobranca');return t;};
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForSelector('#lista');

// ── 1. o exemplo do Will: 50% pago com a nota tal, falta 50%, vencimento e promessa ──
let t=await abrirCom({demo:{...base,cliente:'EXEMPLO DO WILL',itens:[d('e1',-6,4000,2000)],valor:4000,recebido:2000,saldo:2000,
  vencimento:iso(2),promessaData:iso(4),promessaObs:'paga na sexta',cobrancaStatus:'enviada',enviadoEm:iso(-1)+'T12:00:00Z',
  notasEmitidas:[{numero:'15',data:iso(-5),ids:['e1'],valor:4000}],fiscalStatus:'emitida',nfNumero:'15'}},'EXEMPLO DO WILL');
assert(/Nota fiscal Precisa de nota fiscal\. Já emitida: nota nº 15 \(R\$ 4\.000,00/.test(t),'nota: '+t);
assert(new RegExp('Vencimento Vence em '+br(2)+' — daqui a 2 dias').test(t),'vencimento');
assert(new RegExp('Combinado O cliente disse que paga em '+br(4)+' — “paga na sexta”').test(t),'o que ele disse');
assert(new RegExp('Já pagou R\\$ 2\\.000,00 \\(50%\\) — diária de '+dm(-6)+' \\(R\\$ 2\\.000,00 de R\\$ 4\\.000,00\\), com a nota nº 15').test(t),'pagou 50% com a nota tal: '+t);
assert(new RegExp('Falta pagar R\\$ 2\\.000,00 \\(50%\\) — diária de '+dm(-6)+': R\\$ 2\\.000,00 \\(de R\\$ 4\\.000,00\\) — nota nº 15').test(t),'falta 50% da nota tal, da diária tal');
assert(new RegExp('O que fazer agora ?Aguardar até '+br(4)+', a data que o cliente prometeu\\. Se não pagar, cobrar R\\$ 2\\.000,00').test(t),'o que fazer: '+t);

// ── 2. Danny Ueda: duas pagas com nota, uma ainda vai gravar — a frase que o Will aprovou ──
t=await abrirCom({demo:{...base,cliente:'DANNY',itens:[d('a',-12,3750,3750),d('b',-11,3750,3750),d('c',3,3750,0)],valor:11250,recebido:7500,saldo:3750,vencimento:iso(3),
  notasEmitidas:[{numero:'1',data:iso(-20),ids:['a'],valor:3750},{numero:'8',data:iso(-6),ids:['b'],valor:3750}],nfNumero:'1, 8'}},'DANNY');
assert(/Já emitidas: nota nº 1 \(R\$ 3\.750,00, \d\d\/\d\d\) e nota nº 8/.test(t),'notas emitidas: '+t);
assert(new RegExp('A nota da diária de '+dm(3)+' \\(R\\$ 3\\.750,00\\) só depois da gravação').test(t),'nota que falta');
assert(new RegExp('Já pagou R\\$ 7\\.500,00 \\(67%\\) — diárias de '+dm(-12)+' e '+dm(-11)+', com as notas nº 1 e 8').test(t),'pagas com as notas');
assert(new RegExp('Falta pagar R\\$ 3\\.750,00 \\(33%\\) — diária de '+dm(3)+': R\\$ 3\\.750,00 — ainda sem nota — ainda vai gravar').test(t),'falta: '+t);
assert(new RegExp('O que fazer agora ?Nada agora\\. Depois de '+dm(3)+', emitir a nota e cobrar R\\$ 3\\.750,00\\.').test(t),'a frase aprovada: '+t);

// ── 3. gravou e está sem nota e sem cobrança: duas tarefas, numeradas ──
t=await abrirCom({demo:{...base,cliente:'FAZER TUDO',itens:[d('f',-9,2000,0)],valor:2000,recebido:0,saldo:2000,vencimento:iso(-2)}},'FAZER TUDO');
assert(new RegExp('Falta emitir R\\$ 2\\.000,00 — a diária de '+dm(-9)+', que já foi gravada').test(t),'falta emitir');
assert(/Vence em .* — em atraso há 2 dias/.test(t)&&/Ainda não entrou nenhum pagamento/.test(t)&&/Ainda não foi cobrado/.test(t),'atraso, nada pago, não cobrado: '+t);
assert(/O que fazer agora ?Emitir a nota de R\$ 2\.000,00 .*Cobrar R\$ 2\.000,00 — já venceu/.test(t),'duas tarefas: '+t);
assert.equal(await page.evaluate(()=>0),0);

// ── 4. tudo pago e com nota ──
t=await abrirCom({demo:{...base,cliente:'TUDO CERTO',itens:[d('k',-20,1800,1800)],valor:1800,recebido:1800,saldo:0,cobrancaStatus:'pago',vencimento:iso(-10),
  notasEmitidas:[{numero:'7',data:iso(-19),ids:['k'],valor:1800}],fiscalStatus:'emitida',nfNumero:'7'}},'TUDO CERTO');
assert(/Todas as gravações já têm nota/.test(t)&&/Já pagou R\$ 1\.800,00 \(100%\)/.test(t)&&/Falta pagar Nada — está tudo pago/.test(t),'tudo certo: '+t);
assert(/O que fazer agora ?Nada\. Está tudo em dia/.test(t)&&!/Vencimento/.test(t),'nada a fazer, sem linha de vencimento');

// ── 5. cliente só de NOTA (quem cobra é o Will): ela vê pelo Fiscal e só cuida da nota ──
await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.setItem('wen_fiscal_visao','fiscal');localStorage.setItem('wen_fiscal_fechados','[]');},
  {demo:{...base,cliente:'SO NOTA',itens:[d('w',-9,1200,0)],valor:1200,recebido:0,saldo:1200,vencimento:iso(-3),clienteFiscal:{cobrancaAdministrativo:false}}});
await page.reload();await page.waitForSelector('#lista .nf-lin');
await page.locator('#lista .nf-lin',{hasText:'SO NOTA'}).locator('[data-abrir]').click();await page.waitForSelector('#situacao');
t=(await page.innerText('#situacao')).replace(/\s+/g,' ').replace(/\u00a0/g,' ');await page.click('#fecharCobranca');
assert(/Falta emitir R\$ 1\.200,00/.test(t)&&/Quem cobra este cliente é o Will — você só acompanha/.test(t),'só nota: '+t);
assert(/O que fazer agora ?Emitir a nota de R\$ 1\.200,00/.test(t)&&!/Cobrar R\$/.test(t)&&!/em atraso/.test(t),'a tarefa dela é só a nota: '+t);

// o texto que vem do cliente não vira HTML
t=await abrirCom({demo:{...base,cliente:'ESCAPE',itens:[d('z',-9,100,0)],valor:100,recebido:0,saldo:100,vencimento:iso(5),promessaData:iso(1),promessaObs:'<img src=x onerror=window.__xss=1>'}},'ESCAPE');
assert.equal(await page.evaluate(()=>window.__xss),undefined,'anotação é tratada como texto');

await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ situacao: nota, vencimento, combinado, já pagou, falta pagar e o que fazer — nos cinco casos');
}finally{await browser.close();}
