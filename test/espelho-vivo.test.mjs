// O fechamento é ESPELHO VIVO: nasce no lançamento (mesmo antes de gravar), acompanha a
// baixa de pagamento e gera aviso. O que a Natália escreveu NUNCA é sobrescrito.
//
// Rodar:  node test/espelho-vivo.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/espelho-vivo.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);

// Nuvem de mentira: guarda cada PATCH com a sua máscara, para conferir o updateMask.
await page.evaluate(async()=>{
  await MOD_umaVez('clientes-fiscais',CFI_carregar);
  window.__patches=[];window.__avisos=[];
  const real=window.fetch;
  window.fetch=async(url,opt)=>{
    const u=String(url);
    if(u.includes('/administrativo_avisos/')&&opt?.method==='PATCH'){
      window.__avisos.push(JSON.parse(opt.body));return new Response('{}',{status:200});}
    if(u.includes('/administrativo_fechamentos/')){
      if(opt?.method==='PATCH'){
        const campos=[...u.matchAll(/updateMask\.fieldPaths=([^&]+)/g)].map(m=>decodeURIComponent(m[1]));
        window.__patches.push({id:decodeURIComponent(u.split('/administrativo_fechamentos/')[1].split('?')[0]),
          campos,body:JSON.parse(opt.body)});
        return new Response('{}',{status:200});}
      if(opt?.method==='DELETE'){window.__patches.push({del:true,id:decodeURIComponent(u.split('/administrativo_fechamentos/')[1].split('?')[0])});
        return new Response('{}',{status:200});}
    }
    return real(url,opt);
  };
  FC_dados={};FC_ok=true;CFI_FICHAS={};R_todosOsDados.length=0;
});

const espelhar=(reg,motivo)=>page.evaluate(async([r,m])=>{
  const i=R_todosOsDados.findIndex(x=>String(x.id)===String(r.id));
  if(i>-1)R_todosOsDados[i]=r; else R_todosOsDados.push(r);
  await FC_aoSalvarLancamento(r,m||'lancamento');
  return Object.values(FC_dados).map(f=>({id:f.id,grupo:f.grupo,valor:f.valor,recebido:f.recebido,
    saldo:f.saldo,itens:f.itens.length,vencimento:f.vencimento,divergencia:f.divergencia,
    nfNumero:f.nfNumero,fiscalStatus:f.fiscalStatus,descricaoCobranca:f.descricaoCobranca}));
},[reg,motivo]);

const diaria=(id,extra={})=>({id,cliente:'CARTPANDA',mes:'DEZ/2026',data:'05/12',horario:'10:00 AS 12:00',
  horas:2,studio:'STUDIO A',valorTotal:2200,valorReserva:0,saldo:2200,vencimento:'15/12/2026',
  desc:'STUDIO A · 1 DIÁRIA DE 2 HORAS',obs:'ANOTAÇÃO INTERNA',...extra});

// ── 1) a diária FUTURA já aparece, no ato do lançamento ────────────────────
let f=await espelhar(diaria('L1'));
assert.equal(f.length,1,'uma diária lançada já cria o fechamento');
assert.equal(f[0].grupo,'m_cartpanda_2026-12','cliente mensal agrupa por cliente+mês');
assert.equal(f[0].valor,2200);assert.equal(f[0].saldo,2200);
assert.equal(f[0].vencimento,'2026-12-15','o vencimento veio do Receber');

// nada interno vazou
const corpo=await page.evaluate(()=>JSON.stringify(window.__patches));
assert(!corpo.includes('ANOTAÇÃO INTERNA'),'a observação interna não vai para o espelho');

// ── 2) a segunda diária do mês entra no MESMO fechamento ───────────────────
f=await espelhar(diaria('L2',{data:'12/12',valorTotal:3300,saldo:3300}));
assert.equal(f.length,1,'não criou um segundo fechamento');
assert.equal(f[0].itens,2);assert.equal(f[0].valor,5500);

// ── 3) o que ELA escreveu sobrevive à reescrita ────────────────────────────
await page.evaluate(()=>{const id=Object.keys(FC_dados)[0];
  Object.assign(FC_dados[id],{nfNumero:'1042',nfData:'2026-12-20',fiscalStatus:'emitida',
    fiscalValor:5500,cobrancaStatus:'enviada',descricaoCobranca:'TEXTO QUE A NATALIA ESCREVEU'});});
f=await espelhar(diaria('L3',{data:'19/12',valorTotal:1100,saldo:1100}));
assert.equal(f[0].nfNumero,'1042','o número da nota não foi tocado');
assert.equal(f[0].fiscalStatus,'emitida');
assert.equal(f[0].descricaoCobranca,'TEXTO QUE A NATALIA ESCREVEU','o texto dela foi preservado');

// e a máscara do PATCH nunca inclui os campos dela
const mascaras=await page.evaluate(()=>window.__patches.filter(p=>!p.del).map(p=>p.campos));
const proibidos=['nfNumero','nfData','fiscalStatus','enviadoEm'];
mascaras.slice(1).forEach((c,i)=>proibidos.forEach(k=>
  assert(!c.includes(k),'🔒 updateMask da atualização '+(i+2)+' não pode conter '+k)));
assert(mascaras.every(c=>c.length>0),'nenhum PATCH foi sem updateMask');
// e cobrancaStatus só entra na máscara quando o PAGAMENTO mudou de verdade
const patches=await page.evaluate(()=>window.__patches.filter(p=>!p.del));
patches.slice(1).forEach((p,i)=>{
  if(!p.campos.includes('cobrancaStatus'))return;
  assert(p.campos.includes('saldo')||p.campos.includes('recebido'),
    'atualização '+(i+2)+' mexeu na cobrança sem mexer no pagamento');});

// ── 4) nota emitida + valor mudou = divergência, não sobrescrita calada ────
assert(f[0].divergencia,'mudou o valor com nota emitida: marcou divergência');
assert.equal(f[0].divergencia.valorNota,5500);
assert.equal(f[0].divergencia.valorAtual,6600);
const avisoDiv=await page.evaluate(()=>window.__avisos.map(a=>a.fields.tipo.stringValue));
assert(avisoDiv.includes('divergencia'),'e gerou aviso de divergência');

// ── 5) baixa parcial: saldo acompanha na hora, só vira pago no zero ────────
await page.evaluate(()=>{const id=Object.keys(FC_dados)[0];delete FC_dados[id].divergencia;
  FC_dados[id].fiscalStatus='pendente';FC_dados[id].nfNumero='';FC_dados[id].fiscalValor=undefined;});
f=await espelhar(diaria('L1',{valorReserva:1100,saldo:1100}),'baixa');
assert.equal(f[0].recebido,1100,'a baixa parcial chegou no espelho');
assert.equal(f[0].saldo,5500);
let tipos=await page.evaluate(()=>window.__avisos.map(a=>a.fields.tipo.stringValue));
assert(tipos.includes('parcial'),'aviso de pagamento parcial');

// quitando tudo
for(const [id,v] of [['L1',2200],['L2',3300],['L3',1100]])
  f=await espelhar(diaria(id,{data:'05/12',valorTotal:v,valorReserva:v,saldo:0}),'baixa');
assert.equal(f[0].saldo,0);
tipos=await page.evaluate(()=>window.__avisos.map(a=>a.fields.tipo.stringValue));
assert(tipos.includes('pago'),'aviso de pagamento confirmado');

// ── 6) ⚠️ DIVERGÊNCIA ABERTA — a ficha não filtra mais quem entra ──────────
// Até 19/11 o cliente desmarcado nos DOIS chips (🧾 Nota e 💰 Cobrança) ficava de fora.
// Em 19/11 o Codex desligou essa checagem em FC_espelhar ("Todo cliente com diária entra
// automaticamente no administrativo"), e os chips deixaram de decidir quem é espelhado.
// Este teste registra o comportamento REAL de hoje. Quando o Will decidir, ou o filtro
// volta (e este bloco vira a asserção inversa) ou os chips mudam de significado.
await page.evaluate(()=>{CFI_FICHAS.outro={id:'outro',nome:'OUTRO',exigeNota:false,cobrancaAdministrativo:false};});
const antes=await page.evaluate(()=>Object.keys(FC_dados).length);
await espelhar({...diaria('X1'),cliente:'OUTRO'});
const depois=await page.evaluate(()=>Object.keys(FC_dados).length);
const filtra=await page.evaluate(()=>/if\(!CFI_liberavel\(ficha\)\)return;/.test(FC_espelhar.toString()));
if(filtra)assert.equal(depois,antes,'a ficha filtra: desmarcado nos dois não espelha');
else assert.equal(depois,antes+1,'⚠️ hoje a ficha NÃO filtra — todo cliente entra (mudança do Codex em 19/11)');

// ── 7) cliente "por diária" ganha um fechamento por gravação ───────────────
await page.evaluate(()=>{CFI_FICHAS.avulso={id:'avulso',nome:'AVULSO',exigeNota:true,fechamentoPadrao:'diaria'};});
await espelhar({...diaria('A1'),cliente:'AVULSO'});
const g=await espelhar({...diaria('A2',{data:'06/12'}),cliente:'AVULSO'});
const avulsos=g.filter(x=>String(x.grupo).startsWith('d_avulso'));
assert.equal(avulsos.length,2,'ficha "por diária" separa uma por gravação');

// ── 8) renomear o cliente não deixa fechamento órfão ───────────────────────
// Bug real encontrado em 20/11: a diária de 12/11 do Danny Ueda aparecia em DOIS
// fechamentos — "PRÉ RESERVA ... DANNY UEDA" (nome antigo) e "DANNY UEDA" — uma como
// paga e outra não. A chave do grupo mudava e o fechamento velho nunca era revisitado.
await page.evaluate(()=>{FC_dados={};R_todosOsDados.length=0;CFI_FICHAS={};});
await espelhar({...diaria('R1'),cliente:'PRÉ RESERVA WEN PRODUTORA - FULANO'});
let st=await page.evaluate(()=>Object.values(FC_dados).map(f=>({c:f.cliente,ids:f.lancamentoIds})));
assert.equal(st.length,1,'nasceu com o nome errado');

// o Will corrige o nome no Receber e salva
await espelhar({...diaria('R1'),cliente:'FULANO'});
const depoisRename=await page.evaluate(()=>Object.values(FC_dados).map(f=>({c:f.cliente,ids:f.lancamentoIds})));
assert.equal(depoisRename.length,1,'sobra UM fechamento, não dois');
assert.equal(depoisRename[0].c,'FULANO','e é o do nome corrigido');
st=await page.evaluate(()=>Object.values(FC_dados).flatMap(f=>f.lancamentoIds));
assert.deepEqual(st,['R1'],'a diária vive em um fechamento só');

// e o fechamento órfão foi apagado de verdade, não só da memória
const apagou=await page.evaluate(()=>window.__patches.filter(p=>p.del).length>0);
assert(apagou,'o fechamento do nome antigo foi apagado na nuvem');

// ── 9) órfão COM nota emitida não é apagado: fica marcado ──────────────────
await page.evaluate(()=>{FC_dados={};R_todosOsDados.length=0;});
await espelhar({...diaria('R2'),cliente:'COM NOTA LTDA'});
await page.evaluate(()=>{const id=Object.keys(FC_dados)[0];
  Object.assign(FC_dados[id],{fiscalStatus:'emitida',nfNumero:'777',nfData:'2026-12-01',fiscalValor:2200});});
await espelhar({...diaria('R2'),cliente:'COM NOTA LTDA RENOMEADA'});
const comNota=await page.evaluate(()=>Object.values(FC_dados).map(f=>({c:f.cliente,nf:f.nfNumero,div:!!f.divergencia})));
assert.equal(comNota.length,2,'o que tem nota emitida NÃO some');
assert(comNota.some(f=>f.nf==='777'&&f.div),'ele fica marcado com divergência, para o Will resolver');

assert.deepEqual(erros,[]);
console.log('✅ espelho-vivo: nasce no lançamento, acompanha a baixa, avisa — e o que é dela sobrevive');
}finally{await browser.close();}
