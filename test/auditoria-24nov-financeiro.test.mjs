// Auditoria de 24/11 — lado do WEN Financeiro (o espelho). Bugs achados nos dados reais:
//  1. Renomear o cliente no Receber não chegava na cobrança ("PRÉ TIROLEZ" × "TIROLEZ").
//  2. O retrato da ficha (CNPJ, contato, "quem cobra") só era gravado na criação:
//     23 cobranças sem CNPJ e a Oswaldo Cruz presa em "não cobrar".
//  3. Excluir a única diária de uma cobrança antiga (sem "grupo") deixava um fantasma (SG TALK).
//  4. Vínculo órfão (38) travava para sempre a volta da diária para a tela dela.
//  5. A caixinha "🚫 Não é faturável" esticava e jogava o texto para fora da janela.
// Rodar:  node test/auditoria-24nov-financeiro.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/auditoria-24nov-financeiro.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);
await page.evaluate(async()=>{
  await MOD_umaVez('clientes-fiscais',CFI_carregar);
  window.__w=[];window.__vinc={};window.__lanc={};
  const real=window.fetch;
  window.fetch=async(url,opt)=>{
    const u=decodeURIComponent(String(url)),m=(opt&&opt.method)||'GET';
    if(u.includes('/administrativo_vinculos/')){
      const id=u.split('/administrativo_vinculos/')[1].split('?')[0];
      if(m==='DELETE'){delete window.__vinc[id];window.__w.push('DEL vinc '+id);return new Response('{}',{status:200});}
      if(m==='GET')return window.__vinc[id]?new Response(JSON.stringify({fields:{fechamentoId:{stringValue:window.__vinc[id]}}}),{status:200}):new Response('{}',{status:404});
    }
    if(u.includes(':commit')){
      const ws=JSON.parse(opt.body).writes;
      const preso=ws.some(w=>/administrativo_vinculos/.test(w.update.name)&&window.__vinc[w.update.name.split('/').pop()]);
      if(preso){window.__w.push('COMMIT recusado');return new Response('{}',{status:409});}
      ws.forEach(w=>{if(/administrativo_vinculos/.test(w.update.name))window.__vinc[w.update.name.split('/').pop()]=w.update.fields.fechamentoId.stringValue;});
      window.__w.push('COMMIT ok');return new Response('{}',{status:200});
    }
    if(u.includes('/administrativo_fechamentos/')){
      const id=u.split('/administrativo_fechamentos/')[1].split('?')[0];
      if(m==='PATCH'){const campos=[...u.matchAll(/updateMask\.fieldPaths=([^&]+)/g)].map(x=>x[1]);window.__w.push('PATCH '+id+' ['+campos.join(',')+']');return new Response('{}',{status:200});}
      if(m==='DELETE'){window.__w.push('DEL fech '+id);return new Response('{}',{status:200});}
    }
    if(u.includes('/administrativo_avisos/')){window.__w.push('AVISO '+u.split('/administrativo_avisos/')[1].split('?')[0]);return new Response('{}',{status:200});}
    if(u.includes('/lancamentos/')&&m==='GET'){const id=u.split('/lancamentos/')[1].split('?')[0];const l=window.__lanc[id];
      return l===undefined?new Response('{}',{status:404}):new Response(JSON.stringify({fields:{excluido:{booleanValue:!!l}}}),{status:200});}
    if(/firestore|googleapis/.test(u))return new Response('{}',{status:200});
    return real(url,opt);
  };
  FC_dados={};FC_ok=true;FC_idsBrutos=new Set();R_todosOsDados.length=0;
  CFI_FICHAS={tirolez:{id:'tirolez',nome:'TIROLEZ',nomes:['TIROLEZ','PRÉ TIROLEZ'],exigeNota:true,cobrancaAdministrativo:true,doc:''}};
});
const d=(id,cliente,extra={})=>({id,cliente,mes:'NOV/2026',data:'06/11/2026',horario:'-',horas:2,studio:'STUDIO A',valorTotal:1000,valorReserva:0,saldo:1000,desc:'x',...extra});

// ── 1 e 2: nome e retrato da ficha acompanham ───────────────────────────────
await page.evaluate(async r=>{R_todosOsDados.push(r);await FC_espelhar([r],'antes');},d('T1','PRÉ TIROLEZ'));
let f=await page.evaluate(()=>Object.values(FC_dados)[0]);
assert.equal(f.cliente,'PRÉ TIROLEZ');assert.equal(f.clienteFiscal.doc,'');
await page.evaluate(()=>{R_todosOsDados[0].cliente='TIROLEZ';CFI_FICHAS.tirolez.doc='12.345.678/0001-90';CFI_FICHAS.tirolez.cobrancaAdministrativo=false;window.__w.length=0;});
assert.deepEqual(await page.evaluate(()=>FC_desatualizados().map(r=>r.id)),['T1'],'a autocorreção percebe nome e ficha diferentes');
await page.evaluate(()=>FC_espelhar(FC_desatualizados(),'automatico'));
f=await page.evaluate(()=>Object.values(FC_dados)[0]);
assert.equal(f.cliente,'TIROLEZ','o nome novo chega na cobrança');
assert.equal(f.clienteFiscal.doc,'12.345.678/0001-90','o CNPJ da ficha chega');
assert.equal(f.clienteFiscal.cobrancaAdministrativo,false,'"quem cobra" acompanha a ficha');
const w=await page.evaluate(()=>window.__w.join(' | '));
assert(/PATCH .*\[.*cliente.*clienteFiscal/.test(w),'gravado com máscara: '+w);
assert.equal(await page.evaluate(()=>Object.keys(FC_dados).length),1,'sem criar cobrança nova');
assert.deepEqual(await page.evaluate(()=>FC_desatualizados()),[],'e não fica regravando');

// ── 3: diária excluída de cobrança antiga (sem "grupo") não deixa fantasma ──
await page.evaluate(async r=>{
  FC_dados={'uuid-antigo':{id:'uuid-antigo',cliente:'SG TALK',lancamentoIds:['S1'],itens:[{id:'S1',mes:'NOV/2026',data:'25/11',horas:1,valor:500,recebido:0,saldo:500}],
    valor:500,recebido:0,saldo:500,fiscalStatus:'pendente',cobrancaStatus:'pendente'}};   // sem `grupo`
  FC_idsBrutos=new Set(['uuid-antigo']);window.__vinc={S1:'uuid-antigo'};window.__w.length=0;
  R_todosOsDados.length=0;
  await FC_aoSalvarLancamento({...r,excluido:true},'exclusao');
},d('S1','SG TALK',{valorTotal:500,saldo:500}));
assert.equal(await page.evaluate(()=>Object.keys(FC_dados).length),0,'a cobrança da diária excluída some');
const w3=await page.evaluate(()=>window.__w.join(' | '));
assert(/DEL fech uuid-antigo/.test(w3)&&/DEL vinc S1/.test(w3),'apaga a cobrança e o vínculo dela: '+w3);
assert(/AVISO removido-uuid-antigo-\d{4}-\d\d-\d\d/.test(w3),'e deixa o sinal "removido" para a tela dela tirar o card sem reler tudo: '+w3);

// 3b. e a faxina ao abrir só remove depois de CONFIRMAR no Firebase que a diária foi excluída
await page.evaluate(()=>{
  const fz=(id,lid)=>({id,cliente:'X '+id,grupo:id,lancamentoIds:[lid],itens:[{id:lid,mes:'NOV/2026',data:'10/11',horas:1,valor:100,recebido:0,saldo:100}],valor:100,recebido:0,saldo:100,fiscalStatus:'pendente'});
  FC_dados={g1:fz('g1','L-excluida'),g2:fz('g2','L-viva-fora-do-cache'),g3:fz('g3','L-sumiu')};FC_idsBrutos=new Set(['g1','g2','g3']);
  window.__lanc={'L-excluida':true,'L-viva-fora-do-cache':false};window.__w.length=0;R_todosOsDados.length=0;
});
assert.equal(await page.evaluate(()=>FC_fantasmas().length),3,'três candidatas (nenhuma diária na lista local)');
assert.equal(await page.evaluate(()=>FC_limparFantasmas()),2,'só saem as confirmadas');
assert.deepEqual(await page.evaluate(()=>Object.keys(FC_dados)),['g2'],'a que existe no Firebase (lista local incompleta) NÃO é apagada');

// ── 4: vínculo órfão não trava mais a criação ───────────────────────────────
await page.evaluate(async r=>{
  FC_dados={};FC_idsBrutos=new Set();window.__vinc={V1:'cobranca-que-nao-existe-mais'};window.__w.length=0;
  CFI_FICHAS.volta={id:'volta',nome:'Volta',nomes:['Volta'],exigeNota:true,cobrancaAdministrativo:true};
  R_todosOsDados.length=0;R_todosOsDados.push(r);
  await FC_espelhar([r],'lancamento');
},d('V1','Volta'));
const w4=await page.evaluate(()=>window.__w.join(' | '));
assert(/COMMIT recusado \| DEL vinc V1 \| COMMIT ok/.test(w4.replace(/AVISO [^|]+ \| /g,'')),'recusou, limpou o vínculo velho e criou: '+w4);
assert.equal(await page.evaluate(()=>Object.values(FC_dados).filter(f=>f.cliente==='Volta').length),1,'a diária voltou para a tela dela');
// vínculo de cobrança que EXISTE continua valendo (a trava não é afrouxada)
const preso=await page.evaluate(async r=>{
  FC_dados={};FC_idsBrutos=new Set(['outra-viva']);window.__vinc={V2:'outra-viva'};window.__w.length=0;
  R_todosOsDados.length=0;R_todosOsDados.push(r);
  try{await FC_espelhar([r],'lancamento');return 'criou';}catch(e){return e.message;}
},d('V2','Volta'));
assert(/reservar as diárias/.test(preso),'vínculo válido continua barrando: '+preso);

// ── divergência nota × diária olha o valor DAS NOTAS (Oswaldo Cruz: 3.600 → 3.213) ──
const dv=await page.evaluate(()=>{
  const antigo={fiscalStatus:'emitida',valor:3600,notasEmitidas:[{numero:'5',ids:['O1'],valor:3213}]};
  return {conserto:FC_divergenciaDe(antigo,3213,[{id:'O1',valor:3213}]),
          aindaErrado:FC_divergenciaDe(antigo,3600,[{id:'O1',valor:3600}]),
          parcial:FC_divergenciaDe({fiscalStatus:'pendente',valor:11250,notasEmitidas:[{numero:'1',ids:['a'],valor:3750}]},11250,[{id:'a',valor:3750},{id:'b',valor:3750},{id:'c',valor:3750}]),
          legado:FC_divergenciaDe({fiscalStatus:'emitida',valor:1000},1200,[{id:'x',valor:1200}])};
});
assert.equal(dv.conserto,null,'corrigir a diária para o valor da nota não é divergência');
assert(dv.aindaErrado&&dv.aindaErrado.valorNota===3213&&dv.aindaErrado.valorAtual===3600,'nota 3.213 × diária 3.600 é divergência');
assert.equal(dv.parcial,null,'nota de uma das três diárias não é divergência');
assert(dv.legado&&dv.legado.valorNota===1000,'sem registro por nota, vale a regra antiga');

// ── 5: a caixinha "Não é faturável" não estica ──────────────────────────────
await page.evaluate(()=>R_abrirModal());await page.waitForTimeout(300);
const cx=await page.locator('#rFNaoFaturavel').boundingBox();
assert(cx.width<=24,'caixinha com largura própria: '+cx.width);
const txt=await page.locator('#rFNaoFaturavel').locator('xpath=following-sibling::span').boundingBox();
const modal=await page.locator('#rModalBg .modal-r, #rModalBg > div').first().boundingBox();
assert(txt.x+txt.width<=modal.x+modal.width+1,'o texto cabe dentro da janela');

assert.deepEqual(erros,[]);
console.log('✅ auditoria-24nov-financeiro: nome e ficha acompanham, sem fantasma, vínculo órfão não trava, caixinha no lugar');
}finally{await browser.close();}
