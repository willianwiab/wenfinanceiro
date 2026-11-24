// 24/11 — Will: "coloque" (a mesma verificação de 30 s no financeiro). O que a Natália faz
// na tela dela aparece no WEN Financeiro sem recarregar a página.
// Rodar:  node test/ao-vivo-financeiro.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/ao-vivo-financeiro.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);
await page.evaluate(async()=>{
  await MOD_umaVez('clientes-fiscais',CFI_carregar);
  const it=id=>({id,mes:'NOV/2026',data:'10/11',horas:2,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000});
  const f=(id,cliente,extra={})=>({cliente,grupo:id,lancamentoIds:[id+'i'],itens:[it(id+'i')],valor:1000,recebido:0,saldo:1000,
    fiscalStatus:'pendente',cobrancaStatus:'pendente',exigeNota:true,nfNumero:'',notasEmitidas:[],promessaData:'',atualizadoEm:'2026-11-24T10:00:00.000Z',...extra});
  window.__nuvem={a:f('a','ALFA'),b:f('b','BETA'),c:f('c','GAMA'),d:f('d','DELTA')};
  window.__consultas=[];window.__leituras=0;window.__toasts=[];
  const real=window.fetch;
  window.fetch=async(url,opt)=>{
    const u=String(url);
    if(u.includes(':runQuery')){
      const q=JSON.parse(opt.body).structuredQuery;
      if(q.from[0].collectionId==='administrativo_fechamentos'){
        const desde=q.where.fieldFilter.value.stringValue;window.__consultas.push(desde);
        // devolve SÓ os documentos alterados depois da marca (é isso que o financeiro pede agora)
        const mud=Object.entries(window.__nuvem).filter(([,x])=>x.atualizadoEm>desde).slice(0,q.limit||999);
        window.__devolvidos=(window.__devolvidos||0)+mud.length;
        return new Response(JSON.stringify(mud.length?mud.map(([id,x])=>({document:{name:'projects/p/databases/(default)/documents/administrativo_fechamentos/'+id,
          fields:Object.fromEntries(Object.entries(x).map(([k,v])=>[k,toFV(v)])),updateTime:'t'}})):[{readTime:'t'}]),{status:200});
      }
    }
    if(/administrativo_(fechamentos|avisos|vinculos)/.test(u)&&opt&&opt.method&&opt.method!=='GET')return new Response('{}',{status:200});
    return real(url,opt);
  };
  const carregarReal=window.CC_fbCarregar;
  window.CC_fbCarregar=async col=>{if(col==='administrativo_fechamentos'){window.__leituras++;return JSON.parse(JSON.stringify(window.__nuvem));}return carregarReal(col);};
  window.toast=(m)=>window.__toasts.push(m);
  await FC_carregar();window.__leituras=0;
});
assert.equal(await page.evaluate(()=>FC_maisRecente),'2026-11-24T10:00:00.000Z','guarda a marca do mais recente');

// ── nada mudou: uma consulta, nenhuma releitura, nenhum aviso ──────────────
assert.deepEqual(await page.evaluate(()=>FC_conferirMudancas()),[]);
assert.deepEqual(await page.evaluate(()=>[window.__consultas.length,window.__leituras,window.__toasts.length]),[1,0,0],'nada mudou: só a consulta de 1 leitura');

// ── a Natália trabalha na tela dela ─────────────────────────────────────────
await page.evaluate(()=>{
  const n=window.__nuvem, t='2026-11-24T10:05:00.000Z';
  Object.assign(n.a,{notasEmitidas:[{numero:'11',ids:['ai'],valor:1000}],nfNumero:'11',fiscalStatus:'emitida',atualizadoEm:t});
  Object.assign(n.b,{cobrancaStatus:'enviada',enviadoEm:t,atualizadoEm:t});
  Object.assign(n.c,{cobrancaStatus:'informado',atualizadoEm:t});
  Object.assign(n.d,{promessaData:'2026-11-30',atualizadoEm:t});
});
const frases=await page.evaluate(()=>FC_conferirMudancas());
assert(frases.some(x=>/🧾 Nota 11 registrada — ALFA/.test(x)),'nota registrada: '+frases.join(' | '));
assert(frases.some(x=>/📨 Cobrança enviada — BETA/.test(x)),'cobrança enviada');
assert(frases.some(x=>/💬 GAMA disse que pagou — confira no banco e dê a baixa/.test(x)),'cliente disse que pagou');
assert(frases.some(x=>/🤝 DELTA prometeu pagar em 30\/11/.test(x)),'promessa');
assert.equal(await page.evaluate(()=>FC_dados.a.fiscalStatus),'emitida','os dados do financeiro foram atualizados sem recarregar');
assert.equal(await page.evaluate(()=>window.__leituras),0,'sem reler a coleção inteira: vieram só os 4 alterados');
assert.equal(await page.evaluate(()=>window.__devolvidos),4,'4 documentos trazidos');
assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('wen_fin_leituras_auto')).n),1+4,'o freio contou 1 (consulta vazia) + 4');
assert.equal(await page.evaluate(()=>window.__toasts.length),1,'um aviso só, resumindo');
assert(/\+2/.test(await page.evaluate(()=>window.__toasts[0])),'com o resto contado: '+await page.evaluate(()=>window.__toasts[0]));
assert.equal(await page.evaluate(()=>FC_maisRecente),'2026-11-24T10:05:00.000Z','a marca avança');
// de novo: nada novo, não relê nem avisa outra vez
await page.evaluate(()=>{window.__leituras=0;window.__toasts.length=0;});
assert.deepEqual(await page.evaluate(()=>FC_conferirMudancas()),[]);
assert.deepEqual(await page.evaluate(()=>[window.__leituras,window.__toasts.length]),[0,0],'não repete');

// ── o que o PRÓPRIO financeiro grava não dispara releitura ──────────────────
await page.evaluate(async()=>{
  window.__leituras=0;
  const doc={...FC_dados.b,atualizadoEm:'2026-11-24T10:09:00.000Z'};
  await FC_gravarCampos('b',doc,['atualizadoEm']);window.__nuvem.b.atualizadoEm=doc.atualizadoEm;
});
assert.deepEqual(await page.evaluate(()=>FC_conferirMudancas()),[]);
assert.equal(await page.evaluate(()=>window.__leituras),0,'escrita própria já entra na marca: nada a reler');

// ── não recarrega no meio de um espelho em andamento ────────────────────────
await page.evaluate(()=>{window.__nuvem.a.atualizadoEm='2026-11-24T10:20:00.000Z';window.__consultas.length=0;FC_emEspelho=1;});
assert.deepEqual(await page.evaluate(()=>FC_conferirMudancas()),[]);
assert.equal(await page.evaluate(()=>window.__consultas.length),0,'espera o espelho terminar');
await page.evaluate(()=>{FC_emEspelho=0;});
await page.evaluate(()=>FC_conferirMudancas());
assert.equal(await page.evaluate(()=>FC_maisRecente),'2026-11-24T10:20:00.000Z','e pega na próxima');

// ── cobrança que este financeiro não conhecia entra; duplicada escondida não ──
await page.evaluate(()=>{
  const it=id=>({id,mes:'NOV/2026',data:'10/11',horas:2,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000});
  window.__nuvem.nova={cliente:'NOVA',grupo:'nova',lancamentoIds:['novai'],itens:[it('novai')],valor:1000,recebido:0,saldo:1000,fiscalStatus:'pendente',cobrancaStatus:'pendente',atualizadoEm:'2026-11-24T10:30:00.000Z'};
  window.__nuvem.dup={cliente:'ALFA',lancamentoIds:['ai'],itens:[it('ai')],valor:1000,recebido:0,saldo:1000,fiscalStatus:'pendente',cobrancaStatus:'pendente',atualizadoEm:'2026-11-24T10:31:00.000Z'};
});
await page.evaluate(()=>FC_conferirMudancas());
assert(await page.evaluate(()=>!!FC_dados.nova),'cobrança nova entra');
assert(await page.evaluate(()=>!FC_dados.dup),'duplicada da mesma diária continua escondida');

// ── freio: passou do teto, para de consultar e avisa uma vez ──
await page.evaluate(()=>{localStorage.setItem('wen_fin_leituras_auto',JSON.stringify({dia:FC_hojeIso(),n:FC_FREIO_TETO}));window.__consultas.length=0;window.__toasts.length=0;
  window.__nuvem.a.atualizadoEm='2026-11-24T11:00:00.000Z';});
await page.evaluate(()=>FC_conferirMudancas());await page.evaluate(()=>FC_conferirMudancas());
assert.equal(await page.evaluate(()=>window.__consultas.length),0,'com o freio ativo não consulta');
assert.equal(await page.evaluate(()=>window.__toasts.filter(t=>/pausada/.test(t)).length),1,'avisa uma vez só');
await page.evaluate(()=>{localStorage.setItem('wen_fin_leituras_auto',JSON.stringify({dia:'2000-01-01',n:999999}));});
assert.equal(await page.evaluate(()=>FC_freioAtivo()),false,'no dia seguinte a conta zera');

// função pura: cobrança nova (sem "antes") não vira aviso; pagamento confirmado pelo Will também não
assert.deepEqual(await page.evaluate(()=>FC_oQueElaFez({},{z:{id:'z',cliente:'Z',cobrancaStatus:'enviada'}})),[]);
assert.deepEqual(await page.evaluate(()=>FC_oQueElaFez({z:{id:'z',cliente:'Z',cobrancaStatus:'enviada'}},{z:{id:'z',cliente:'Z',cobrancaStatus:'pago'}})),[]);

assert.deepEqual(erros,[]);
console.log('✅ ao-vivo-financeiro: o que ela faz chega sem recarregar, com aviso; sem mudança custa 1 leitura; escrita própria não relê');
}finally{await browser.close();}
