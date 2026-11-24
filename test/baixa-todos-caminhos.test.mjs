// 24/11: o Will deu baixa na Danny Ueda e na IA Onde Isso Vai Dar e o administrativo da
// Natália continuou "enviada", com o saldo cheio. Só o modal de recebimento parcial avisava o
// espelho; o botão ✅ (recebido inteiro) e a conciliação pelo extrato gravavam no Receber e
// paravam ali. Este teste prova:
//   1. o botão ✅ recebido atualiza o espelho e marca "pago";
//   2. ao abrir o financeiro, o espelho que ficou para trás é corrigido sozinho;
//   3. a conciliação (baixa e desfazer) chama o mesmo gancho.
//
// Rodar:  node test/baixa-todos-caminhos.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/baixa-todos-caminhos.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);

// Nuvem de mentira: nada sai da máquina. Guarda cada PATCH do administrativo.
await page.evaluate(async()=>{
  await MOD_umaVez('clientes-fiscais',CFI_carregar);
  window.__patches=[];window.__avisos=[];window.__receber=[];
  const real=window.fetch;
  window.fetch=async(url,opt)=>{
    const u=String(url);
    if(u.includes('/administrativo_avisos/')){if(opt?.method==='PATCH')window.__avisos.push(JSON.parse(opt.body));return new Response('{}',{status:200});}
    if(u.includes('/administrativo_fechamentos/')){
      if(opt?.method==='PATCH'){
        const campos=[...u.matchAll(/updateMask\.fieldPaths=([^&]+)/g)].map(m=>decodeURIComponent(m[1]));
        window.__patches.push({id:decodeURIComponent(u.split('/administrativo_fechamentos/')[1].split('?')[0]),campos,body:JSON.parse(opt.body)});}
      return new Response('{}',{status:200});}
    if(/firestore|googleapis/.test(u))return new Response('{}',{status:200});
    return real(url,opt);
  };
  window.R_fbSalvar=async r=>{window.__receber.push({...r});return r;};   // o Receber não é tocado
  FC_dados={};FC_ok=true;R_todosOsDados.length=0;
  CFI_FICHAS={ia:{id:'ia',nome:'IA Teste',nomes:['IA Teste'],exigeNota:false,cobrancaAdministrativo:true}};
  const d=(id,data,extra={})=>({id,cliente:'IA Teste',mes:'NOV/2026',data,horario:'-',horas:2,
    studio:'STUDIO A',valorTotal:1000,valorReserva:0,saldo:1000,desc:'Videocast',...extra});
  R_todosOsDados.push(d('A1','10/11/2026'),d('A2','12/11/2026'));
  await FC_espelhar(R_todosOsDados.slice(),'antes');
  // a Natália já tinha mandado a cobrança
  Object.values(FC_dados).forEach(f=>f.cobrancaStatus='enviada');
});
const espelho=()=>page.evaluate(()=>Object.values(FC_dados).map(f=>({recebido:f.recebido,saldo:f.saldo,cob:f.cobrancaStatus})));
assert.deepEqual(await espelho(),[{recebido:0,saldo:2000,cob:'enviada'}],'ponto de partida: nada recebido');

// ── 1. botão ✅ recebido (o caminho que estava sem gancho) ─────────────────────
await page.evaluate(()=>{
  const t=document.createElement('table');t.id='__t';
  t.innerHTML='<tr data-rid="A1"><td><button data-action="receber">✅</button></td></tr><tr data-rid="A2"><td><button data-action="receber">✅</button></td></tr>';
  document.body.appendChild(t);
});
await page.click('#__t tr[data-rid="A1"] button');
await page.waitForFunction(()=>Object.values(FC_dados)[0]?.recebido===1000,null,{timeout:8000});
assert.deepEqual(await espelho(),[{recebido:1000,saldo:1000,cob:'enviada'}],'pagou uma das duas: recebido sobe, cobrança dela continua');
await page.click('#__t tr[data-rid="A2"] button');
await page.waitForFunction(()=>Object.values(FC_dados)[0]?.saldo===0,null,{timeout:8000});
assert.deepEqual(await espelho(),[{recebido:2000,saldo:0,cob:'pago'}],'quitou tudo: vira "pago" para a Natália');
const ult=await page.evaluate(()=>window.__patches.at(-1));
assert(ult.campos.includes('cobrancaStatus')&&ult.campos.includes('saldo'),'PATCH com updateMask (não substitui o documento)');
assert(await page.evaluate(()=>window.__avisos.some(a=>/pagamento confirmado/.test(JSON.stringify(a)))),'ela recebe o aviso ✅ pagamento confirmado');

// ── 2. autocorreção ao abrir: espelho ficou para trás de uma baixa antiga ──────
await page.evaluate(()=>{
  // como estava em produção: Receber quitado, espelho ainda com saldo cheio e "enviada"
  const f=Object.values(FC_dados)[0];f.recebido=0;f.saldo=2000;f.cobrancaStatus='enviada';
  window.__patches.length=0;
  window.CFI_carregar=async()=>{CFI_ok=true;return true;};window.FC_carregar=async()=>{FC_ok=true;return true;};
});
assert.equal(await page.evaluate(()=>FC_desatualizados().length),2,'detecta as duas diárias do fechamento defasado');
await page.evaluate(()=>FC_sincronizarPendentes());
assert.deepEqual(await espelho(),[{recebido:2000,saldo:0,cob:'pago'}],'ao abrir o financeiro, o espelho se corrige sozinho');
// rodar de novo não grava nada (não gasta cota à toa)
await page.evaluate(()=>{window.__patches.length=0;});
await page.evaluate(()=>FC_sincronizarPendentes());
assert.equal(await page.evaluate(()=>window.__patches.length),0,'espelho em dia: nenhuma escrita');

// ── 2b. um cliente com problema não trava os outros ────────────────────────────
const r2b=await page.evaluate(async()=>{
  CFI_FICHAS.ruim={id:'ruim',nome:'Ruim',nomes:['Ruim'],exigeNota:false,cobrancaAdministrativo:true};
  R_todosOsDados.push({id:'B1',cliente:'Ruim',mes:'NOV/2026',data:'11/11/2026',horario:'-',horas:2,studio:'STUDIO A',valorTotal:500,valorReserva:0,saldo:500,desc:'x'});
  await FC_espelhar([R_todosOsDados.find(r=>r.id==='B1')],'antes');
  const ia=Object.values(FC_dados).find(f=>f.cliente==='IA Teste');ia.recebido=0;ia.saldo=2000;ia.cobrancaStatus='enviada';
  const ruim=Object.values(FC_dados).find(f=>f.cliente==='Ruim');ruim.recebido=999;   // defasado também
  const orig=window.FC_gravarCampos;
  window.FC_gravarCampos=async(id,doc,c)=>{if(id===ruim.id)throw Error('recusado (teste)');return orig(id,doc,c);};
  const toasts=[];const t=window.toast;window.toast=m=>toasts.push(m);
  let erro=null;try{await FC_sincronizarPendentes();}catch(e){erro=e.message;}
  window.FC_gravarCampos=orig;window.toast=t;
  return {erro,toasts,ia:Object.values(FC_dados).find(f=>f.cliente==='IA Teste').cobrancaStatus};
});
assert.equal(r2b.ia,'pago','o IA foi corrigido mesmo com o outro cliente falhando');
assert(/Ruim: recusado/.test(r2b.erro||''),'o erro do outro cliente aparece com o nome dele: '+r2b.erro);
assert(r2b.toasts.some(m=>/Administrativo atualizado: 1/.test(m)),'e o Will vê quantas atualizou: '+r2b.toasts.join(' | '));

// ── 3. conciliação pelo extrato: baixa e desfazer chamam o gancho ──────────────
const src=fs.readFileSync(new globalThis.URL('../index.html',import.meta.url),'utf8');
const conc=src.slice(src.indexOf('async function CONC_conciliar('),src.indexOf('async function CONC_conciliarTodas('));
assert(/R_fbSalvar\(r\);\s*\n\s*if\(typeof FC_aoSalvarLancamento==='function'\)FC_aoSalvarLancamento\(r,'baixa'\)/.test(conc),'conciliar (recebido) avisa o administrativo');
const desf=src.slice(src.indexOf('async function CONC_desfazer('));
assert(/FC_aoSalvarLancamento\(r,'estorno'\)/.test(desf.slice(0,1500)),'desfazer a conciliação também');

assert.deepEqual(erros,[]);
console.log('✅ baixa-todos-caminhos: botão ✅, conciliação e autocorreção chegam no administrativo');
}finally{await browser.close();}
