'use strict';
(()=>{
// A nova aba herda a sessão; desliga o vínculo assim que inicia.
if(window.opener)window.opener=null;
const KEY='AIzaSyC7hYN3__Q_4MNAu6VCTXbTdvVSW37IneI', BASE='https://firestore.googleapis.com/v1/projects/wencontasapagar/databases/(default)/documents';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=WENFechamentos.money, mock=new URLSearchParams(location.search).get('mock')==='1';
let token='',refresh='',expires=0,docs=[],selecionado='',busy=false,dirty=false;
let _toastT;
function toast(msg,cor='#16a34a',ms=3000){
  const t=$('toast'); if(!t)return;
  t.textContent=msg;t.style.background=cor;t.classList.add('show');
  clearTimeout(_toastT);_toastT=setTimeout(()=>t.classList.remove('show'),ms);
}
const avisar=(s,error=false)=>{
  if(!error){toast(s);$('aviso').textContent='';$('aviso').className='';
    if($('cobrancaDialog').open){$('avisoCobranca').textContent='';$('avisoCobranca').className='';}
    return;}
  $('aviso').textContent=s;$('aviso').className='status error';
  if($('cobrancaDialog').open){$('avisoCobranca').textContent=s;$('avisoCobranca').className='status error';}
  toast(s,'#dc2626',6000);
};
const from=v=>v.stringValue??(v.doubleValue!==undefined?Number(v.doubleValue):v.integerValue!==undefined?Number(v.integerValue):v.booleanValue!==undefined?v.booleanValue:v.arrayValue?(v.arrayValue.values||[]).map(from):v.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,v])=>[k,from(v)])):null);
const to=v=>typeof v==='string'?{stringValue:v}:typeof v==='number'?{doubleValue:v}:typeof v==='boolean'?{booleanValue:v}:Array.isArray(v)?{arrayValue:{values:v.map(to)}}:{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,v])=>[k,to(v)]))}};
function sessao(j){token=j.idToken||j.id_token;refresh=j.refreshToken||j.refresh_token;expires=Date.now()+(Number(j.expiresIn||j.expires_in)-60)*1000;sessionStorage.setItem('wen_admin_rt',refresh);}
async function auth(endpoint,body){const r=await fetch('https://'+endpoint+'?key='+KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error('Não foi possível autenticar. Confira e-mail e senha ou recupere seu acesso.');return j;}
async function req(path,options={}){
 if(Date.now()>expires){sessao(await auth('securetoken.googleapis.com/v1/token',{grant_type:'refresh_token',refresh_token:refresh}));}
 const r=await fetch(BASE+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});
 if(!r.ok)throw Error(r.status===403?'Este usuário não possui acesso administrativo liberado.':r.status===409||r.status===412?'Este fechamento mudou em outra sessão. Atualize antes de salvar.':'Falha de comunicação ('+r.status+'). Tente novamente.');
 return r.json();
}
// Ficha cadastral do cliente: CNPJ, razão social, contato, e-mail, WhatsApp.
// Quem preenche é o administrativo — é ela quem fala com o financeiro do cliente.
// As DECISÕES (exige nota, quem cobra, condição de pagamento) continuam do Will,
// nos chips do card da diária: esses campos não entram no updateMask daqui.
const FICHA_DELA=['razaoSocial','doc','contatoFinanceiro','emailFinanceiro','whatsappFinanceiro','emailNota','telefone','responsavel'];
let fichas={};
function slugCliente(n){
 return String(n||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'').slice(0,80);
}
function fichaDe(cliente){
 const id=slugCliente(cliente);
 if(fichas[id])return fichas[id];
 return Object.values(fichas).find(f=>(f.nomes||[]).some(n=>slugCliente(n)===id))||null;
}
async function fichasCarregar(){
 if(mock){fichas={clientedemonstracao:{id:'clientedemonstracao',nome:'Cliente demonstração',
   razaoSocial:'',doc:'',contatoFinanceiro:'',emailFinanceiro:'',whatsappFinanceiro:''}};return;}
 try{
  const j=await req('/clientes_fiscais?pageSize=300');
  fichas=Object.fromEntries((j.documents||[]).map(d=>{
    const o=Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,from(v)]));
    o.id=d.name.split('/').at(-1);return [o.id,o];}));
 }catch(e){fichas={};}
}
const soNum=v=>String(v||'').replace(/\D/g,'');
function docValido(v){
 const d=soNum(v);
 if(d.length===11){ // CPF
   if(/^(\d)+$/.test(d))return false;
   const dv=n=>{let s=0;for(let i=0;i<n;i++)s+=+d[i]*(n+1-i);const r=(s*10)%11;return r===10?0:r;};
   return dv(9)===+d[9]&&dv(10)===+d[10];
 }
 if(d.length===14){ // CNPJ
   if(/^(\d)+$/.test(d))return false;
   const calc=n=>{const p=n===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];
     let s=0;for(let i=0;i<n;i++)s+=+d[i]*p[i];const r=s%11;return r<2?0:11-r;};
   return calc(12)===+d[12]&&calc(13)===+d[13];
 }
 return false;
}
function docFmt(v){
 const d=soNum(v);
 if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
 if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
 return String(v||'');
}
function fichaHTML(f){
 const d=fichaDe(f.cliente)||{}, c=f.clienteFiscal||{};
 const v=k=>esc(d[k]||c[k]||'');
 const falta=[];
 if(!(d.doc||c.doc))falta.push('CPF/CNPJ');
 if(!(d.contatoFinanceiro||c.contatoFinanceiro))falta.push('contato');
 if(!(d.whatsappFinanceiro||c.whatsappFinanceiro))falta.push('WhatsApp');
 return `<div class="ficha-bloco">
  <div class="ficha-top"><b>📇 Ficha do cliente</b>
    ${falta.length?`<span class="nf-pill pend">falta ${esc(falta.join(', '))}</span>`:'<span class="nf-pill ok">completa</span>'}</div>
  <p class="nf-sub" style="margin:2px 0 12px">Dados para emitir a nota e cobrar. Valem para <b>todas</b> as gravações de ${esc(f.cliente)}.</p>
  <div class="row"><label>Nome na nota (razão social)<input id="fiRazao" maxlength="150" value="${v('razaoSocial')}" placeholder="${esc(f.cliente)}"></label>
  <label>CPF / CNPJ<input id="fiDoc" maxlength="20" value="${esc(docFmt(d.doc||c.doc))}" placeholder="00.000.000/0000-00"></label></div>
  <div class="row"><label>Pessoa do financeiro<input id="fiContato" maxlength="120" value="${v('contatoFinanceiro')}" placeholder="Com quem falar"></label>
  <label>WhatsApp<input id="fiZap" maxlength="30" value="${v('whatsappFinanceiro')}" placeholder="(11) 99999-9999"></label></div>
  <div class="row"><label>E-mail do financeiro<input id="fiMail" type="email" maxlength="150" value="${v('emailFinanceiro')}"></label>
  <label>E-mail para a nota<input id="fiMailNota" type="email" maxlength="150" value="${v('emailNota')}" placeholder="se for outro"></label></div>
  <div class="actions"><button type="button" id="fiSalvar">💾 Salvar ficha do cliente</button><span id="fiAviso" class="muted"></span></div>
 </div>`;
}
async function fichaSalvar(cliente){
 $('fiAviso').textContent='';
 const doc=$('fiDoc').value.trim();
 if(doc&&!docValido(doc)){$('fiAviso').textContent='CPF/CNPJ inválido — confira o número.';$('fiDoc').focus();return;}
 const id=(fichaDe(cliente)||{}).id||slugCliente(cliente);
 if(!id){avisar('Cliente sem nome — não dá para montar a ficha.',true);return;}
 const dados={razaoSocial:$('fiRazao').value.trim(),doc:soNum(doc),
   contatoFinanceiro:$('fiContato').value.trim(),whatsappFinanceiro:$('fiZap').value.trim(),
   emailFinanceiro:$('fiMail').value.trim(),emailNota:$('fiMailNota').value.trim(),
   atualizadoEm:new Date().toISOString()};
 const antiga=fichas[id];
 if(!antiga){dados.nome=cliente;dados.nomes=[cliente];dados.criadoEm=dados.atualizadoEm;}
 fichas[id]={...(antiga||{}),...dados,id};
 if(mock){avisar('Ficha salva (demonstração).');$('fiDoc').value=docFmt(dados.doc);return;}
 try{
  const campos=Object.keys(dados).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
  await req('/clientes_fiscais/'+encodeURIComponent(id)+'?'+campos,
    {method:'PATCH',body:JSON.stringify({fields:Object.fromEntries(Object.entries(dados).map(([k,x])=>[k,to(x)]))})});
  $('fiDoc').value=docFmt(dados.doc);
  avisar('Ficha de '+cliente+' salva.');
 }catch(e){fichas[id]=antiga;avisar(e.message,true);}
}
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function atrasada(f){return f.cobrancaStatus!=='pago'&&f.vencimento&&f.vencimento<today();}
async function carregar(){
 if(busy)return;
 try{
  if(!mock){if(Date.now()>expires)sessao(await auth('securetoken.googleapis.com/v1/token',{grant_type:'refresh_token',refresh_token:refresh}));const user=await auth('identitytoolkit.googleapis.com/v1/accounts:lookup',{idToken:token});const u=user.users?.[0];if(u?.email==='financeiro@wenprodutora.com.br'&&!u.emailVerified){$('verificar').hidden=false;throw Error('Verifique seu e-mail antes de acessar. Use o botão abaixo; depois de verificar, entre novamente.');}}
  let novos=[];
  if(mock){novos=docs.length?docs:[
   {...WENFechamentos.criar([
     {id:'d1',cliente:'Cliente demonstração',data:'05/11',mes:'2026-11',horario:'13:00 AS 15:00',horas:2,studio:'STUDIO A',valorTotal:2200,valorReserva:0},
     {id:'d2',cliente:'Cliente demonstração',data:'12/11',mes:'2026-11',horario:'10:00 AS 13:00',horas:3,studio:'STUDIO B',valorTotal:2200,valorReserva:400},
     {id:'d3',cliente:'Cliente demonstração',data:'19/11',mes:'2026-11',horario:'14:00 AS 16:00',horas:2,studio:'STUDIO A',valorTotal:2200,valorReserva:0}],{condicaoPagamento:'sinal50'}),id:'demo',updateTime:'mock'},
   {...WENFechamentos.criar([
     {id:'d4',cliente:'Outro cliente demo',data:'28/10',mes:'2026-10',horario:'09:00 AS 13:00',horas:4,studio:'STUDIO B',valorTotal:3400,valorReserva:3400}],{exigeNota:false}),id:'demo2',cobrancaStatus:'pago',updateTime:'mock'}];}
  else{let pt='';do{const j=await req('/administrativo_fechamentos?pageSize=200'+(pt?'&pageToken='+encodeURIComponent(pt):''));novos.push(...(j.documents||[]).map(d=>({...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,from(v)])),id:d.name.split('/').at(-1),updateTime:d.updateTime})));pt=j.nextPageToken||'';}while(pt);}
  docs=novos.filter(f=>f.itens?.length&&f.itens.every(WENFechamentos.noPeriodo)).sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));$('login').hidden=true;$('app').hidden=false;$('sair').hidden=false;$('sino').hidden=false;
  await avisosCarregar();await fichasCarregar();
 avisar(mock?'Demonstração — dados fictícios.':'Fechamentos atualizados.');combo();lista();sino();
  if(selecionado&&docs.some(f=>f.id===selecionado))abrir(selecionado);else if(location.hash&&docs.some(f=>f.id===decodeURIComponent(location.hash.slice(1))))abrir(decodeURIComponent(location.hash.slice(1)));
 }catch(e){avisar(e.message,true);}
}
// Cards do topo, no mesmo formato da aba Notas Fiscais. Conta o que ESTÁ na lista — nada
// de total da empresa: só o que foi liberado para o administrativo.
// ── 🔔 Avisos ───────────────────────────────────────────────────────────────
// Ela não escreve aviso: recebe, abre e marca como lido. Igual ao "Li e estou ciente"
// da Central de Produção. Os avisos nascem no WEN Financeiro, quando o Will mexe.
let avisos=[], avisosAbertos=false, apenasNaoLidos=true;
async function avisosCarregar(){
 if(mock){avisos=[
   {id:'a1',tipo:'novo',texto:'🧾 Cliente demonstração — 3 diárias · R$ 6.600,00. Pronto para nota e cobrança.',fechamentoId:'demo',criadoEm:new Date().toISOString(),lidoEm:''},
   {id:'a2',tipo:'parcial',texto:'💰 Cliente demonstração — entrou um pagamento. Falta R$ 6.200,00.',fechamentoId:'demo',criadoEm:new Date().toISOString(),lidoEm:''}];
  return;}
 try{
  const j=await req('/administrativo_avisos?pageSize=200');
  avisos=(j.documents||[]).map(d=>({...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,from(v)])),id:d.name.split('/').at(-1)}))
    .sort((a,b)=>String(b.criadoEm||'').localeCompare(String(a.criadoEm||'')));
 }catch(e){avisos=[];}
}
const naoLidos=()=>avisos.filter(a=>!a.lidoEm);
function sino(){
 const el=$('sino'); if(!el)return;
 const n=naoLidos().length;
 el.innerHTML='🔔'+(n?'<span class="sino-n">'+n+'</span>':'');
 el.title=n?n+' aviso(s) não lido(s)':'Nenhum aviso novo';
 el.classList.toggle('tem',!!n);
 const cx=$('avisosCx'); if(!cx)return;
 cx.hidden=!avisosAbertos;el.setAttribute('aria-expanded',String(avisosAbertos));
 if(!avisosAbertos)return;
 const vis=apenasNaoLidos?naoLidos():avisos;
 cx.innerHTML='<div class="avisos-topo"><strong>Avisos · '+n+' não lidos</strong><button type="button" id="avisosFechar" aria-label="Fechar avisos">✕</button></div>'
 +'<div class="avisos-filtro"><button type="button" id="avisosFiltro">'+(apenasNaoLidos?'Mostrar todos':'Mostrar só não lidos')+'</button></div><div class="avisos-lista">'
 +(vis.length?vis.map(a=>{
   const quando=a.criadoEm?new Date(a.criadoEm).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
   return `<button type="button" class="aviso${a.lidoEm?'':' novo'} t-${esc(a.tipo||'')}" data-av="${esc(a.id)}" data-f="${esc(a.fechamentoId||'')}">
     <span class="aviso-txt">${esc(a.texto||'')}</span>${(()=>{const f=docs.find(f=>f.id===a.fechamentoId);return f?'<span class="aviso-periodo">'+esc(fechPeriodo(f))+'</span>':'';})()}<span class="aviso-dt">${esc(quando)}${a.lidoEm?'':' · novo'}</span></button>`;}).join('')
  :'<p class="muted" style="padding:14px">Nenhum aviso pendente neste filtro.</p>')+'</div>';
 $('avisosFechar').onclick=()=>{avisosAbertos=false;sino();el.focus();};
 $('avisosFiltro').onclick=()=>{apenasNaoLidos=!apenasNaoLidos;sino();$('avisosFiltro').focus();};
 cx.querySelectorAll('[data-av]').forEach(b=>b.onclick=()=>abrirAviso(b.dataset.av,b.dataset.f));
}
async function abrirAviso(id,fechamentoId){
 const a=avisos.find(x=>x.id===id);
 if(a&&!a.lidoEm){
  a.lidoEm=new Date().toISOString();
  if(!mock){try{await req('/administrativo_avisos/'+encodeURIComponent(id)+'?updateMask.fieldPaths=lidoEm',
    {method:'PATCH',body:JSON.stringify({fields:{lidoEm:to(a.lidoEm)}})});}catch(e){a.lidoEm='';avisar(e.message,true);}}
 }
 if(fechamentoId&&docs.some(f=>f.id===fechamentoId)){avisosAbertos=false;abrir(fechamentoId);}
 sino();
}
function cards(vis){
 const el=document.getElementById('cards'); if(!el)return; const base=vis||docs;
 const n=s=>base.filter(f=>f.cobrancaStatus===s).length, atr=base.filter(atrasada).length;
 const nf=base.filter(f=>f.exigeNota&&f.fiscalStatus==='pendente').length;
 const plural=(q,a,b)=>q===1?a:b;
 el.innerHTML=
   '<div class="card-p pendente"><label>A cobrar</label><div class="val">'+n('pendente')+'</div>'
  +'<div class="val-sub">'+n('enviada')+' já '+plural(n('enviada'),'enviada','enviadas')+' · '+n('pago')+' '+plural(n('pago'),'pago','pagos')+'</div></div>'
  +'<div class="card-p atrasado"><label>Em atraso</label><div class="val">'+atr+'</div>'
  +'<div class="val-sub">'+(atr?'passou do vencimento':'nada vencido')+'</div></div>'
  +'<div class="card-p alerta"><label>Nota pendente</label><div class="val">'+nf+'</div>'
  +'<div class="val-sub">aguardando emissão</div></div>';
}
// ── Filtros no formato da aba Fiscal e Cobranças ────────────────────────────
// Cliente e meses saem dos próprios fechamentos liberados: ela escolhe, não digita.
let filtro='', abertos=new Set();
const MESES=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const mesChave=m=>WENFechamentos.mesChave(m);
const mesRotulo=c=>c?MESES[Number(c.slice(5,7))-1]+'/'+c.slice(0,4):'';
const mesesDe=f=>(f.itens||[]).map(i=>mesChave(i.mes)).filter(Boolean);
function combo(){
 const cli=$('busca'), atual=cli.value;
 const nomes=[...new Set(docs.map(f=>f.cliente).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 cli.innerHTML='<option value="">— Todos —</option>'+nomes.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
 cli.value=nomes.includes(atual)?atual:'';
 const meses=[...new Set(docs.flatMap(mesesDe))].sort();
 for(const [id,padrao] of [['mesIni',meses[0]],['mesFim',meses.at(-1)]]){
   const el=$(id), tinha=el.value;
   el.innerHTML=meses.map(m=>`<option value="${m}">${mesRotulo(m)}</option>`).join('');
   el.value=meses.includes(tinha)?tinha:(padrao||'');
 }
}
function noRecorte(f){
 const ini=$('mesIni').value, fim=$('mesFim').value, ms=mesesDe(f);
 if(!ini&&!fim)return true;
 return ms.some(m=>(!ini||m>=ini)&&(!fim||m<=fim));
}
// ── A linha é a .nf-lin da fila de notas: ▸ para abrir as diárias, nome, selos,
//    valor e a ação. As diárias aparecem só para conferência — a composição é do dono.
function diarias(f){
 return '<div class="nf-itens">'+f.itens.map(i=>
   `<div class="nf-item"><span>✅</span><span>${esc(i.data)} · ${i.horas}h · ${esc((i.studio||'').toUpperCase())} · ${cash(i.valor)} · ${i.saldo>0?'⏳ não pago':'✔️ pago'}</span></div>`).join('')
  +'<div class="nf-itens-rod">Conferência apenas. A composição do fechamento é definida no <b>WEN Financeiro</b> — aqui ela não muda.</div></div>';
}
function linha(f){
 const atraso=atrasada(f), aberto=abertos.has(f.id);
 const cor=atraso?'div':f.cobrancaStatus==='pago'?'emit':f.cobrancaStatus==='enviada'?'env':'fila';
 const selo=f.cobrancaStatus==='informado'?'<span class="nf-pill pend">pagamento comunicado · aguardando Will</span>':atraso?'<span class="nf-pill erro">em atraso</span>'
   :f.cobrancaStatus==='pago'?'<span class="nf-pill ok">pago</span>'
   :f.cobrancaStatus==='enviada'?'<span class="nf-pill env">cobrança enviada</span>'
   :'<span class="nf-pill pend">a cobrar</span>';
 const semCobranca=(f.clienteFiscal||{}).cobrancaAdministrativo===false;
 const selocob=semCobranca?'<span class="nf-pill erro">não cobrar — é o Will quem cobra</span>':'';
 const selonf=!f.exigeNota?'<span class="nf-pill">NF não solicitada</span>'
   :f.fiscalStatus==='emitida'?`<span class="nf-pill ok">nota ${esc(f.nfNumero||'emitida')}</span>`
   :'<span class="nf-pill pend">nota pendente</span>';
 const ms=[...new Set(mesesDe(f))].sort(), per=ms.length?mesRotulo(ms[0])+(ms.length>1?' a '+mesRotulo(ms.at(-1)):''):'';
 const horas=f.itens.reduce((t,i)=>t+(Number(i.horas)||0),0);
 const dias=[...new Set((f.itens||[]).map(i=>String(i.data||'').slice(0,5)).filter(Boolean))].sort((a,b)=>{
   const [da,ma]=a.split('/'),[db,mb]=b.split('/');return (ma+da).localeCompare(mb+db);});
 const faixa=dias.length?(dias.length===1?dias[0]:dias[0]+' a '+dias.at(-1)):'';
 const venc=f.vencimento?'<b>vence '+esc(f.vencimento.split('-').reverse().join('/'))+'</b>':'<span class="muted">sem vencimento</span>';
 return `<div class="nf-lin ${cor}${selecionado===f.id?' ativo':''}" data-id="${esc(f.id)}"><div style="width:100%">`
  +'<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
  +`<button type="button" class="nf-exp" data-exp="${esc(f.id)}" aria-expanded="${aberto}">${aberto?'▾':'▸'}</button>`
  +`<div class="nf-info"><div class="nf-nome">${esc((f.cliente||'').toUpperCase())}</div>`
  +`<div class="nf-meta"><span>${esc(per)}${faixa?' · '+esc(faixa):''} · ${f.itens.length} ${f.itens.length===1?'diária':'diárias'} · ${horas}h · ${venc}</span>${semCobranca?'':selo}${selocob}${selonf}</div></div>`
  +`<div class="nf-val">${cash(f.valor)}${Number(f.saldo)>0&&Number(f.saldo)!==Number(f.valor)
      ?`<div class="nf-de">saldo ${cash(f.saldo)}</div>`:''}</div>`
  +`<div class="nf-acao"><button type="button" class="abrir" data-abrir="${esc(f.id)}" aria-haspopup="dialog">📄 Abrir cobrança</button></div>`
  +'</div>'+(aberto?diarias(f):'')+'</div></div>';
}
// Ordem da lista. Sem data de vencimento vai para o fim em "o mais urgente primeiro" —
// o que não tem prazo não pode encabeçar a fila de quem está vencendo.
const gravDe=f=>(f.itens||[]).map(i=>{
  const d=String(i.data||'').split('/');
  const m=WENFechamentos.mesChave(i.mes)||'';
  return d.length>=2?m.slice(0,4)+'-'+d[1].padStart(2,'0')+'-'+d[0].padStart(2,'0'):m+'-00';
}).sort().at(-1)||'';
function ordenador(modo){
 const venc=f=>f.vencimento||'';
 const txt=(a,b)=>String(a||'').localeCompare(String(b||''),'pt-BR');
 switch(modo){
  case 'venc-desc': return (a,b)=>txt(venc(b),venc(a));
  case 'grav':      return (a,b)=>txt(gravDe(b),gravDe(a))||txt(a.cliente,b.cliente);
  case 'grav-asc':  return (a,b)=>txt(gravDe(a),gravDe(b))||txt(a.cliente,b.cliente);
  case 'valor':     return (a,b)=>(Number(b.saldo)||0)-(Number(a.saldo)||0);
  case 'cliente':   return (a,b)=>txt(a.cliente,b.cliente);
  default:          return (a,b)=>txt(venc(a)||'9999-99-99',venc(b)||'9999-99-99')||txt(a.cliente,b.cliente);
 }
}
function lista(){
 const cli=$('busca').value;
 const vis=docs.filter(f=>(!cli||f.cliente===cli)&&noRecorte(f)
   &&(!filtro||(filtro==='atrasada'?atrasada(f):f.cobrancaStatus===filtro)))
   .sort(ordenador($('ordem')?$('ordem').value:'venc'));
 cards(vis);
 $('lista').innerHTML=vis.length?vis.map(linha).join('')
  :'<div class="nf-vazio">Nenhum fechamento neste recorte. As diárias salvas no WEN Financeiro aparecem automaticamente aqui.</div>';
 $('lista').querySelectorAll('[data-exp]').forEach(b=>b.onclick=e=>{
   e.stopPropagation();const id=b.dataset.exp;abertos.has(id)?abertos.delete(id):abertos.add(id);lista();});

 $('lista').querySelectorAll('[data-abrir]').forEach(b=>b.onclick=()=>abrir(b.dataset.abrir));
}
// ── O fechamento aberto é o MESMO documento do Relatórios → Fechamento do WEN
//    Financeiro: faixa verde, cartões de resumo, tabela por mês, barra de total e
//    as quatro ações (PDF, WhatsApp, Excel, Texto NF). Abaixo dele vem o que só o
//    administrativo faz: vencimento, descrições, nota e situação da cobrança.
const MESES_NOMES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const mesExtenso=c=>c?MESES_NOMES[Number(c.slice(5,7))-1]+' de '+c.slice(0,4):'—';
const soma=(l,k)=>Math.round(l.reduce((a,r)=>a+(Number(r[k])||0),0)*100)/100;
function fechPeriodo(f){
 const ms=[...new Set(mesesDe(f))].sort();
 return ms.length?(ms.length===1?mesRotulo(ms[0]):mesRotulo(ms[0])+' até '+mesRotulo(ms.at(-1))):'—';
}
// Como cobrar este cliente. Existe porque sem isto, com nada pago ainda, a tela
// mostrava só "saldo = total" e não dava para saber que o combinado era metade agora.
// ── Contato financeiro do cliente, junto das ações de envio ────────────────
const soDigitos=v=>String(v||'').replace(/\D/g,'');
function zapLink(num,texto){
 const d=soDigitos(num); if(d.length<10)return '';
 const full=d.length<=11?'55'+d:d;
 return 'https://wa.me/'+full+(texto?'?text='+encodeURIComponent(texto):'');
}
function contatoHTML(f){
 const c=f.clienteFiscal||{};
 const linhas=[];
 if(c.contatoFinanceiro)linhas.push('👤 '+esc(c.contatoFinanceiro));
 if(c.whatsappFinanceiro)linhas.push('📱 '+esc(c.whatsappFinanceiro));
 const mail=c.emailFinanceiro||c.emailNota;
 if(mail)linhas.push('✉️ '+esc(mail));
 const pref={whatsapp:'WhatsApp',email:'e-mail',ambos:'WhatsApp e e-mail'}[c.envioPreferido]||'';
 if(!linhas.length)return '<div class="status">Sem contato financeiro cadastrado. Peça ao Will para preencher na ficha do cliente (🧾 Fiscal e Cobranças → 👥 Clientes).</div>';
 return `<div class="contato-bloco"><b>📇 Contato financeiro</b>
   <div class="contato-linhas">${linhas.join('<span class="sep">·</span>')}</div>
   ${pref?`<div class="contato-pref">Prefere receber por <b>${esc(pref)}</b></div>`:''}</div>`;
}
function acoesEnvio(f){
 const c=f.clienteFiscal||{}, mail=c.emailFinanceiro||c.emailNota;
 let h='';
 if(soDigitos(c.whatsappFinanceiro).length>=10)h+='<button type="button" id="enviarZap">📱 Abrir WhatsApp</button>';
 if(mail)h+='<button type="button" id="enviarMail">✉️ Abrir e-mail</button>';
 return h;
}
function blocoCobranca(f){
 const c=WENFechamentos.cobranca(f,f.condicao);
 if(c.condicao==='avista'&&!f.condicaoTexto)return '';
 const linhas=c.parcelas.map(p=>`<div class="cob-p${p.aberto>0?'':' ok'}">
   <span class="cob-nome">${esc(p.nome)}</span>
   <span class="cob-val">${cash(p.valor)}</span>
   <span class="cob-st">${p.aberto>0?(p.pago>0?'falta '+cash(p.aberto):'em aberto'):'✔️ pago'}</span></div>`).join('');
 return `<div class="cob-bloco">
   <div class="cob-top"><b>💳 Como cobrar</b><span class="nf-pill pend">${esc(c.rotulo)}</span></div>
   ${linhas}
   <div class="cob-agora">${c.quitado?'✅ Nada a cobrar — tudo pago.'
     :`Cobrar agora: <b>${cash(c.cobrarAgora)}</b> <span class="muted">(${esc(c.proxima)})</span>`}</div>
   ${f.condicaoTexto?`<div class="cob-obs">${esc(f.condicaoTexto)}</div>`:''}
 </div>`;
}
function docFechamento(f){
 const it=f.itens||[], tT=soma(it,'valor'), tR=soma(it,'recebido'), tS=soma(it,'saldo');
 const tH=soma(it,'horas'), tk=tH>0?tT/tH:0;
 const porMes={};it.forEach(r=>{const c=mesChave(r.mes)||'—';(porMes[c]=porMes[c]||[]).push(r);});
 let corpo='';
 Object.entries(porMes).sort(([a],[b])=>a.localeCompare(b)).forEach(([mes,regs])=>{
  const mT=soma(regs,'valor'), mR=soma(regs,'recebido'), mS=soma(regs,'saldo'), mH=soma(regs,'horas');
  corpo+=`<div class="fech-mes-bloco-r">
    <div class="fech-mes-titulo-r"><span class="mn">📅 ${esc(mesExtenso(mes))}</span><span class="mt">${regs.length} grav. · ${mH}h · ${cash(mT)}</span><span class="ms ${mS>0?'pend':'quitado'}">${mS>0?'🔴 '+cash(mS):'✅'}</span></div>
    <div class="fech-tbl-wrap"><table class="fech-tbl-r"><thead><tr><th>Data</th><th>Horário</th><th>Studio</th><th class="r">Horas</th><th class="r">Total</th><th class="r">Recebido</th><th class="r">Saldo</th><th>Status</th></tr></thead><tbody>`;
  regs.forEach(r=>{
   const st=(r.studio||'').toUpperCase(), sa=st.includes('A');
   corpo+=`<tr><td>${esc(r.data||'-')}</td><td style="font-size:.8rem;color:#64748b">${esc(r.horario||'—')}</td>`
    +`<td><span class="studio-badge-r ${sa?'sa-r':'sb-r'}">${esc(st||'—')}</span></td>`
    +`<td class="r">${r.horas}h</td><td class="r">${cash(r.valor)}</td>`
    +`<td class="r" style="color:#16a34a">${cash(r.recebido)}</td>`
    +`<td class="r" style="color:${r.saldo>0?'#b91c1c':'#16a34a'};font-weight:800">${cash(r.saldo)}</td>`
    +`<td><span class="fech-badge-r ${r.saldo>0?'pend':'ok'}">${r.saldo>0?'PENDENTE':'PAGO'}</span></td></tr>`;
   if(r.descricao)corpo+=`<tr><td colspan="8" style="font-size:.78rem;color:#6b7280;padding:4px 11px">📝 ${esc(r.descricao)}</td></tr>`;
  });
  corpo+=`</tbody><tfoot><tr><td colspan="3">SUBTOTAL</td><td class="r">${mH}h</td><td class="r">${cash(mT)}</td><td class="r">${cash(mR)}</td><td class="r">${cash(mS)}</td><td></td></tr></tfoot></table></div></div>`;
 });
 return `<div class="fech-acoes-r no-print">
   <button type="button" class="btn btn-green" id="fPdf">🖨 PDF / Imprimir</button>
   <button type="button" class="btn btn-blue" id="fZap">📱 WhatsApp</button>
   <button type="button" class="btn btn-outline" id="fXls">⬇ Excel</button>
   <button type="button" class="btn btn-roxo" id="fNF">📋 Texto NF</button>
  </div>
  <div class="fech-doc-r" id="rFechDoc">
   <div class="fech-doc-header-r">
     <div class="empresa">WEN Produtora</div>
     <h2>📄 Fechamento — ${esc(f.cliente)}</h2>
     <div class="sub">${esc(fechPeriodo(f))} · ${new Date().toLocaleDateString('pt-BR')}</div>
   </div>
   <div class="fech-doc-body-r">
    <div class="fech-resumo-cards-r">
      <div class="frc-r azul"><label>🎙️ Gravações</label><div class="v">${it.length}</div></div>
      <div class="frc-r azul"><label>⏱ Horas</label><div class="v">${tH}h</div></div>
      ${WENFechamentos.resumir(it).edicoes?`<div class="frc-r laranja"><label>✂️ Edições</label><div class="v">${WENFechamentos.resumir(it).edicoes}</div></div>`:''}
      <div class="frc-r"><label>💰 Faturado</label><div class="v">${cash(tT)}</div></div>
      <div class="frc-r verde"><label>✅ Recebido</label><div class="v">${cash(tR)}</div></div>
      <div class="frc-r ${tS>0?'vermelho':'verde'}"><label>${tS>0?'🔴 Saldo':'✅ Saldo'}</label><div class="v">${cash(tS)}</div></div>
      <div class="frc-r laranja"><label>🎯 Ticket/h</label><div class="v">${tH>0?cash(tk):'—'}</div></div>
    </div>
    ${blocoCobranca(f)}
    ${corpo||'<div class="nf-vazio">Nenhuma diária neste fechamento.</div>'}
    <div class="fech-total-bar-r">
      <div class="tb-item-r"><span class="tb-label-r">Total</span><span class="tb-val-r">${cash(tT)}</span></div>
      <div class="tb-item-r"><span class="tb-label-r">Recebido</span><span class="tb-val-r green">${cash(tR)}</span></div>
      <div class="tb-item-r"><span class="tb-label-r">Saldo</span><span class="tb-val-r ${tS>0?'red':'green'}">${cash(tS)}</span></div>
      <div class="tb-item-r"><span class="tb-label-r">Horas</span><span class="tb-val-r">${tH}h</span></div>
      <div class="tb-item-r"><span class="tb-label-r">Ticket/h</span><span class="tb-val-r">${tH>0?cash(tk):'—'}</span></div>
    </div>
    <div class="fech-nota-r ${tS>0?'pend':'ok'}">${tS>0?`⚠️ <b>Saldo em aberto: ${cash(tS)}</b><br>Por favor, entre em contato. — WEN Produtora`:'✅ <b>Tudo quitado!</b> Obrigado. — WEN Produtora'}</div>
   </div>
  </div>`;
}
// Texto do WhatsApp — mesmo formato do fechamento do WEN Financeiro.
function textoWhats(f){
 const it=f.itens||[], tT=soma(it,'valor'), tS=soma(it,'saldo'), tH=soma(it,'horas');
 let txt=`🎙️ *WEN PRODUTORA — FECHAMENTO*\n━━━━━━━━━━━━━━━━━━━━━━\n👤 *${f.cliente}* · 📅 *${fechPeriodo(f)}*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`;
 const porMes={};it.forEach(r=>{const c=mesChave(r.mes)||'—';(porMes[c]=porMes[c]||[]).push(r);});
 Object.entries(porMes).sort(([a],[b])=>a.localeCompare(b)).forEach(([mes,regs])=>{
  const mT=soma(regs,'valor'), mS=soma(regs,'saldo');
  txt+=`📅 *${mesRotulo(mes)}*\n`;
  regs.forEach(r=>{txt+=`  • ${r.data||'-'} | ${r.horas}h | ${cash(r.valor)}`+(r.saldo>0?` | 🔴 *${cash(r.saldo)}*`:' | ✅')+'\n';});
  txt+=`  _Subtotal: ${cash(mT)}${mS>0?' | 🔴 '+cash(mS):' | ✅'}_\n\n`;
 });
 const cb=WENFechamentos.cobranca(f,f.condicao);
 txt+=`━━━━━━━━━━━━━━━━━━━━━━\n💰 *${cash(tT)}* · ⏱ ${tH}h\n${cb.condicao!=='avista'?`📋 ${cb.rotulo}\n${cb.quitado?'':`➡️ *Agora: ${cash(cb.cobrarAgora)}* (${cb.proxima})`}\n`:''}${tS>0?`🔴 *PENDENTE: ${cash(tS)}*\n⚠️ Por favor efetue o pagamento.`:'✅ *Tudo quitado!*'}\n\n_WEN Produtora · ${new Date().toLocaleDateString('pt-BR')}_`;
 return txt;
}
function textoNF(f,parte){
 const it=f.itens||[], tH=soma(it,'horas');
 const tT=parte==='sinal'?f.recebido:parte==='saldo'?f.saldo:soma(it,'valor');
 const sufixo=parte==='sinal'?'\nReferente ao sinal (parcela de entrada).':parte==='saldo'?'\nReferente ao saldo final.':'';
 const desc=`Prestação de serviços de produção audiovisual — Gravação de ${it.length} episódio${it.length>1?'s':''} de videocast.\n${WENFechamentos.textoResumo(it)}.\nPeríodo: ${fechPeriodo(f)}.${sufixo}`;
 return `───────────────────────────\n📄 DESCRIÇÃO PARA NOTA FISCAL\n───────────────────────────\n${desc}\n\nValor total: ${cash(tT)}\n───────────────────────────\n🏦 DADOS BANCÁRIOS — WEN PRODUTORA\n───────────────────────────\nRazão Social: WEN PRODUTORA LTDA\nCNPJ: 21.577.617/0001-44\n\nPIX: wenprodutora@gmail.com\n\nBanco: Caixa Econômica Federal\nAgência: 1601\nConta Corrente: 1292 000577674871-9\n───────────────────────────`;
}
function excelFechamento(f){
 if(typeof XLSX==='undefined'){avisar('A planilha ainda está carregando. Tente de novo em instantes.',true);return;}
 const it=f.itens||[];
 const linhas=[[`FECHAMENTO WEN — ${(f.cliente||'').toUpperCase()} — ${fechPeriodo(f)}`],[],
  ['Mês','Data','Horário','Studio','Horas','Total','Recebido','Saldo','Status'],
  ...it.map(r=>[mesRotulo(mesChave(r.mes)),r.data,r.horario||'',r.studio,r.horas,r.valor,r.recebido,r.saldo,r.saldo>0?'PENDENTE':'PAGO']),
  [],['TOTAL','','','',soma(it,'horas'),soma(it,'valor'),soma(it,'recebido'),soma(it,'saldo'),'']];
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(linhas),'Fechamento');
 XLSX.writeFile(wb,`Fechamento_${(f.cliente||'cliente').replace(/\s+/g,'_')}.xlsx`);
}
async function copiarTexto(txt,msg){
 try{await navigator.clipboard.writeText(txt);avisar(msg);}
 catch(e){const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();avisar(msg);}
}
// Sinal e saldo: o cliente pode querer UMA nota pelo total ou DUAS, uma de cada parte.
// Quem decide é o Will, na ficha do cliente — aqui só se registra o que foi emitido.
// Quando emitir. Resolve a pergunta do Will: "posso jogar 1 nota só para após a
// gravação?" — sim, e a tela avisa se ainda não chegou a hora, em vez de deixar
// ela emitir cedo e depois ter que cancelar.
function quandoEmitir(f){
 const hoje=today();
 const ultima=(f.itens||[]).map(i=>{
   const d=String(i.data||'').split('/'), m=WENFechamentos.mesChave(i.mes)||'';
   return d.length>=2?m.slice(0,4)+'-'+d[1].padStart(2,'0')+'-'+d[0].padStart(2,'0'):'';
 }).filter(Boolean).sort().at(-1)||'';
 switch(f.notaQuando){
  case 'gravacao':
    return ultima&&ultima>hoje
      ? {ok:false,txt:'Emitir <b>depois da gravação</b> — a última é '+esc(ultima.split('-').reverse().join('/'))+'.'}
      : {ok:true,txt:'Emitir <b>depois da gravação</b> — já pode.'};
  case 'pagamento':
    return Number(f.saldo)>0
      ? {ok:false,txt:'Emitir <b>quando o cliente pagar</b> — ainda falta '+cash(f.saldo)+'.'}
      : {ok:true,txt:'Emitir <b>no pagamento</b> — já foi pago, pode emitir.'};
  case 'reserva': return {ok:true,txt:'Emitir <b>já na reserva</b> — não precisa esperar a gravação.'};
  case 'parcela': return {ok:true,txt:'<b>Duas notas</b>: uma do sinal e uma do saldo.'};
  default: return null;
 }
}
function blocoFiscal(f){
 const q=quandoEmitir(f);
 const aviso=q?`<div class="emitir ${q.ok?'ok':'espera'}">${q.ok?'✅':'⏳'} ${q.txt}</div>`:'';
 return aviso+blocoNotas(f)+blocoFiscalCampos(f);
}
// Seleção das diárias que entram NESTA nota. Pedido do Will (20/11): "quero a opção
// de selecionar as quais quero fazer a mesma nota". O que sobra fica para a próxima.
let notaSel=new Set();
// A descrição fiscal acompanha a seleção: se a nota é de uma diária só, o texto da
// nota não pode listar as três. Só reescreve enquanto ela não tiver editado à mão.
let descAuto='';
function descricaoDasSelecionadas(f){
 const itens=(f.itens||[]).filter(r=>notaSel.has(String(r.id)));
 if(!itens.length)return '';
 const linhas=itens.map(r=>{
   const p=[];
   if(r.data)p.push(r.data);
   if(r.horas)p.push(r.horas+'h');
   if(r.studio)p.push(String(r.studio).toUpperCase());
   if(r.edicoes)p.push(r.edicoes+(r.edicoes===1?' edição':' edições'));
   if(r.descricao)p.push(r.descricao);
   return p.join(' · ');
 });
 return descricaoFiscalComBanco(
   'Prestação de serviços de produção audiovisual.\n'
   +WENFechamentos.textoResumo(itens)+'.\n'+linhas.join('\n'));
}
function sincronizarDescricao(f){
 const el=$('descricaoFiscal'); if(!el)return;
 const atual=el.value.trim();
 if(atual&&descAuto&&atual!==descAuto.trim())return;   // editada à mão: não encosta
 if(atual&&!descAuto)return;                           // veio do banco e ninguém gerou ainda
 const novo=descricaoDasSelecionadas(f);
 if(!novo)return;
 el.value=novo; descAuto=novo;
}
function blocoNotas(f){
 const livres=WENFechamentos.diariasLivres(f);
 const jaFeitas=(f.notasEmitidas||[]);
 const linha=r=>{
  const marcada=notaSel.has(String(r.id));
  return `<label class="nf-item${marcada?'':' off'}"><input type="checkbox" data-nota="${esc(r.id)}" ${marcada?'checked':''}>
    <span>${esc(r.data||'')} · ${r.horas}h · ${esc((r.studio||'').toUpperCase())} — ${cash(r.valor)}</span></label>`;
 };
 const total=livres.filter(r=>notaSel.has(String(r.id))).reduce((a,r)=>a+Math.round((Number(r.valor)||0)*100),0)/100;
 return `<div class="notas-bloco">
  ${jaFeitas.length?`<div class="notas-feitas"><b>Notas já emitidas</b>${jaFeitas.map(n=>
    `<div class="nota-feita"><span>nº ${esc(n.numero)} · ${esc(String(n.data||'').split('-').reverse().join('/'))}</span>
     <span class="muted">${(n.ids||[]).length} diária(s)</span><b>${cash(n.valor)}</b></div>`).join('')}</div>`:''}
  ${livres.length?`
   <div class="notas-top"><b>🧾 Diárias desta nota</b>
     <button type="button" id="notaTodas" class="mini">${livres.every(r=>notaSel.has(String(r.id)))?'Desmarcar todas':'Marcar todas'}</button></div>
   <div class="notas-itens">${livres.map(linha).join('')}</div>
   <div class="notas-rod">Valor desta nota: <b>${cash(total)}</b>
     <span class="muted">· o que ficar desmarcado fica para a próxima</span></div>
   <div class="row"><label>Número da nota<input id="notaNumero" maxlength="40" placeholder="Ex: 1042"></label>
   <label>Data de emissão<input id="notaData" type="date" value="${esc(today())}"></label></div>
   <div class="actions"><button type="button" id="notaRegistrar" class="primary"${total>0?'':' disabled'}>🧾 Registrar nota de ${cash(total)}</button></div>`
  :'<div class="emitir ok">✅ Todas as diárias deste fechamento já têm nota.</div>'}
 </div>`;
}
function blocoFiscalCampos(f){
 const campoUm=`<div class="row"><label>Situação fiscal<select id="fiscalStatus"><option value="pendente">Nota pendente</option><option value="emitida">Nota emitida</option><option value="nao_solicitada">NF não solicitada pelo cliente</option></select></label><label>Número da nota<input id="nfNumero" value="${esc(f.nfNumero)}"></label><label>Emissão<input id="nfData" type="date" value="${esc(f.nfData)}"></label></div>`;
 if(f.notaModo!=='separado')return campoUm;
 const parte=(rot,pre,val)=>`<div class="nf-parte"><div class="nf-parte-top"><b>${rot}</b><span class="nf-val">${cash(val)}</span></div>
   <div class="row"><label>Situação<select id="${pre}Status"><option value="pendente">Pendente</option><option value="emitida">Emitida</option></select></label>`
   +`<label>Número<input id="${pre}Numero" value="${esc(f[pre+'Numero']||'')}"></label>`
   +`<label>Emissão<input id="${pre}Data" type="date" value="${esc(f[pre+'Data']||'')}"></label></div>`
   +`<button type="button" class="btn-parte" data-nf="${pre}">📋 Texto NF — ${rot.toLowerCase()}</button></div>`;
 return `<div class="status">Este cliente pede a nota <b>separada</b>: uma do sinal e outra do saldo. O valor de cada uma já vem calculado.</div>`
  +parte('Nota do sinal','nfSinal',f.recebido)
  +parte('Nota do saldo','nfSaldo',f.saldo)
  +campoUm.replace('<div class="row">','<div class="row" style="margin-top:12px">')
     .replace('Situação fiscal','Situação geral (as duas)')
     .replace('Número da nota','Números (as duas)');
}
const DADOS_BANCARIOS='DADOS BANCÁRIOS — WEN PRODUTORA\nRazão Social: WEN PRODUTORA LTDA\nCNPJ: 21.577.617/0001-44\nPIX: wenprodutora@gmail.com\nBanco: Caixa Econômica Federal\nAgência: 1601\nConta Corrente: 1292 000577674871-9';
function descricaoFiscalComBanco(texto){
 const t=String(texto||'').trim();
 return /1601/.test(t)&&/577674871/.test(t)?t:t+'\n\n'+DADOS_BANCARIOS;
}
function cobrancaSemSaudacao(texto,cliente){
 const t=String(texto||''),inicio='Olá! Segue o fechamento de '+cliente+'.';
 return t.startsWith(inicio)?t.slice(inicio.length).trimStart():t;
}
function abrir(id){
 const f=docs.find(x=>x.id===id);if(!f)return;selecionado=id;dirty=false;lista();location.hash=id;
 const nf=(f.notasExistentes||[]).map(n=>n.numero).join(', ');
 $('editor').innerHTML=docFechamento(f)
 +`<section class="cartao-edicao">
 <div class="ed-abas" role="tablist">
   <button type="button" class="ed-aba on" data-aba="fechamento" role="tab">📄 Fechamento</button>
   <button type="button" class="ed-aba" data-aba="fiscal" role="tab">🧾 Nota fiscal</button>
   <button type="button" class="ed-aba" data-aba="cobranca" role="tab">💰 Cobrança</button>
 </div>
 <form id="formFechamento">

  <div class="ed-painel" data-painel="fechamento">
   ${contatoHTML(f)}
   <div class="row"><label>Vencimento<input id="vencimento" type="date" value="${esc(f.vencimento)}"></label>
   <label>Situação da cobrança<select id="cobrancaStatus"><option value="pendente">Pendente</option><option value="enviada">Enviada</option><option value="informado">Pagamento comunicado — aguardando Will</option>${f.cobrancaStatus==='pago'?'<option value="pago">Pagamento confirmado por Will</option>':''}</select></label></div>
   <p class="muted">${f.enviadoEm?'Último envio registrado: '+esc(new Date(f.enviadoEm).toLocaleString('pt-BR')):'Nenhum envio registrado ainda.'}</p>
  </div>

  <div class="ed-painel" data-painel="fiscal" hidden>
   ${fichaHTML(f)}
   ${nf?`<div class="status">Notas já registradas no financeiro: ${esc(nf)}. Confira estas referências antes de registrar outra nota.</div>`:''}
   ${blocoFiscal(f)}
   <label>Descrição fiscal<textarea id="descricaoFiscal" rows="7">${esc(descricaoFiscalComBanco(f.descricaoFiscal))}</textarea></label>
   <div class="actions"><button type="button" id="copiarFiscal">Copiar descrição fiscal</button></div>
   <p class="muted">O registro da nota serve para controle; a emissão acontece no portal fiscal.</p>
  </div>

  <div class="ed-painel" data-painel="cobranca" hidden>
   ${(f.clienteFiscal||{}).cobrancaAdministrativo===false?'<div class="emitir espera">🚫 <b>Este cliente não é cobrado pelo administrativo.</b> Quem cobra é o Will — esta aba é só para consulta.</div>':''}
   <label>Mensagem de cobrança<textarea id="descricaoCobranca" rows="9">${esc(cobrancaSemSaudacao(f.descricaoCobranca,f.cliente))}</textarea></label>
   <div class="actions">${acoesEnvio(f)}<button type="button" id="copiarCobranca">📋 Copiar</button><button type="button" id="pdf">🖨 PDF</button></div>
   <hr>
   <div class="promessa">
     <b>📅 Promessa de pagamento</b>
     <p class="nf-sub" style="margin:4px 0 10px">O que o cliente disse. <b>Não muda o vencimento nem confirma recebimento</b> — só faz esta cobrança voltar para você na data.</p>
     <div class="row"><label>O cliente prometeu pagar em<input id="promessaData" type="date" value="${esc(f.promessaData||'')}"></label>
     <label>Anotação<input id="promessaObs" maxlength="300" placeholder="Ex: falei com a Ana, vai pagar junto com a nota" value="${esc(f.promessaObs||'')}"></label></div>
   </div>
  </div>

  <div class="actions ed-rodape"><button class="primary" id="salvar">Salvar alterações</button><button type="button" id="enviada">Registrar cobrança enviada</button></div>
  <p id="resultado" role="status"></p>
 </form></section>`;
 $('editor').querySelectorAll('.ed-aba').forEach(b=>b.onclick=()=>{
   $('editor').querySelectorAll('.ed-aba').forEach(x=>x.classList.toggle('on',x===b));
   $('editor').querySelectorAll('.ed-painel').forEach(p=>p.hidden=p.dataset.painel!==b.dataset.aba);});
 $('cobrancaStatus').value=f.cobrancaStatus;$('cobrancaStatus').disabled=f.cobrancaStatus==='pago';$('fiscalStatus').value=f.fiscalStatus;
 if((f.notasEmitidas||[]).length){
   ['nfNumero','nfData'].forEach(id=>{const el=$(id);if(el){el.readOnly=true;el.title='Vem das notas registradas acima.';}});
 }
 if(f.notaModo==='separado'){
  $('nfSinalStatus').value=f.nfSinalStatus||'pendente';$('nfSaldoStatus').value=f.nfSaldoStatus||'pendente';
  $('editor').querySelectorAll('[data-nf]').forEach(b=>b.onclick=()=>{
    const sinal=b.dataset.nf==='nfSinal';
    $('nfTextoArea').value=textoNF(f,sinal?'sinal':'saldo');$('modalNFBg').classList.add('open');});
 }if(f.fiscalIds?.length===0){for(const id of ['fiscalStatus','nfNumero','nfData'])$(id).disabled=true;}
 $('cobrancaTitulo').textContent='Cobrança — '+f.cliente;
 $('avisoCobranca').textContent='';
 if(!$('cobrancaDialog').open){$('cobrancaDialog').showModal();document.body.classList.add('cobranca-aberta');}
 $('cobrancaDialog').scrollTop=0;
 $('formFechamento').oninput=()=>dirty=true;
 $('formFechamento').onsubmit=e=>{e.preventDefault();salvar(false);};$('enviada').onclick=()=>salvar(true);
 const cFis=f.clienteFiscal||{};
 const zap=$('enviarZap');
 if(zap)zap.onclick=()=>{const u=zapLink(cFis.whatsappFinanceiro,$('descricaoCobranca').value);
   if(u){window.open(u,'_blank','noopener');avisar('WhatsApp aberto com a mensagem. Confira antes de enviar.');}};
 const mail=$('enviarMail');
 if(mail)mail.onclick=()=>{const dest=cFis.emailFinanceiro||cFis.emailNota;
   window.open('mailto:'+encodeURIComponent(dest)+'?subject='+encodeURIComponent('Cobrança — WEN Produtora ('+f.cliente+')')+'&body='+encodeURIComponent($('descricaoCobranca').value),'_blank','noopener');
   avisar('E-mail aberto no seu programa de e-mail. Confira antes de enviar.');};
 $('copiarCobranca').onclick=()=>copiar('descricaoCobranca');$('copiarFiscal').onclick=()=>copiar('descricaoFiscal');
 if($('fiSalvar'))$('fiSalvar').onclick=()=>fichaSalvar(f.cliente);
 const redesenhaNotas=()=>{const alvo=$('editor').querySelector('.notas-bloco');
   if(alvo){const num=$('notaNumero')?$('notaNumero').value:'',dt=$('notaData')?$('notaData').value:'';
     alvo.outerHTML=blocoNotas(f);ligaNotas(f);
     if($('notaNumero'))$('notaNumero').value=num;if($('notaData')&&dt)$('notaData').value=dt;}};
 function ligaNotas(g){
   $('editor').querySelectorAll('[data-nota]').forEach(c=>c.onchange=()=>{
     c.checked?notaSel.add(c.dataset.nota):notaSel.delete(c.dataset.nota);
     redesenhaNotas();sincronizarDescricao(g);});
   const todas=$('notaTodas');
   if(todas)todas.onclick=()=>{
     const livres=WENFechamentos.diariasLivres(g).map(r=>String(r.id));
     const todasMarcadas=livres.every(i=>notaSel.has(i));
     livres.forEach(i=>todasMarcadas?notaSel.delete(i):notaSel.add(i));
     redesenhaNotas();sincronizarDescricao(g);};
   const reg=$('notaRegistrar');
   if(reg)reg.onclick=()=>registrarNota(g);
 }
 notaSel=new Set(WENFechamentos.diariasLivres(f).map(r=>String(r.id)));
 descAuto='';
 redesenhaNotas();
 // o texto do banco vira a referência: a partir daqui, mexer na seleção reescreve
 descAuto=$('descricaoFiscal')?$('descricaoFiscal').value:'';
 $('fZap').onclick=()=>copiarTexto(textoWhats(f),'📱 Texto do WhatsApp copiado. Revise o destinatário antes de enviar.');
 $('fXls').onclick=()=>excelFechamento(f);
 $('fNF').onclick=()=>{$('nfTextoArea').value=textoNF(f);$('modalNFBg').classList.add('open');};
 const imprimir=()=>{document.body.classList.add('imprimindo');window.print();setTimeout(()=>document.body.classList.remove('imprimindo'),400);};
 $('fPdf').onclick=imprimir;$('pdf').onclick=imprimir;
}
async function copiar(id){try{await navigator.clipboard.writeText($(id).value);$('resultado').textContent='Texto copiado. Revise o destinatário antes de enviar.';}catch(e){$(id).focus();$(id).select();$('resultado').textContent='Selecione e copie o texto com Ctrl/Cmd+C.';}}
// Registra uma nota cobrindo as diárias marcadas. A lista inteira vai no updateMask,
// então duas abas abertas não se sobrescrevem sem perceber: o servidor rejeita a
// segunda se a primeira já mudou o documento.
async function registrarNota(f){
 if(busy)return;
 try{
  const nota=WENFechamentos.validarNota(f,{numero:($('notaNumero')||{}).value,
    data:($('notaData')||{}).value,ids:[...notaSel]});
  const lista=[...(f.notasEmitidas||[]),nota];
  const livresDepois=WENFechamentos.diariasLivres({...f,notasEmitidas:lista});
  const update={notasEmitidas:lista,atualizadoEm:new Date().toISOString(),
    nfNumero:lista.map(n=>n.numero).join(', '),nfData:nota.data,
    fiscalStatus:livresDepois.length?'pendente':'emitida'};
  busy=true;$('notaRegistrar').disabled=true;
  let time=f.updateTime;
  if(!mock){
    const masks=Object.keys(update).map(k=>'updateMask.fieldPaths='+k).join('&');
    const j=await req('/administrativo_fechamentos/'+encodeURIComponent(f.id)+'?'+masks+'&currentDocument.updateTime='+encodeURIComponent(f.updateTime),
      {method:'PATCH',body:JSON.stringify({fields:Object.fromEntries(Object.entries(update).map(([k,v])=>[k,to(v)]))})});
    time=j.updateTime;
  }
  Object.assign(f,update,{updateTime:time});
  avisar('Nota '+nota.numero+' registrada — '+cash(nota.valor)+'.');
  abrir(f.id);
 }catch(e){avisar(e.message,true);if($('notaRegistrar'))$('notaRegistrar').disabled=false;}
 finally{busy=false;}
}
async function salvar(enviar){
 if(busy)return;
 const f=docs.find(f=>f.id===selecionado), update={};
 const campos=['vencimento','cobrancaStatus','fiscalStatus','nfNumero','nfData','descricaoFiscal','descricaoCobranca'];
 campos.push('promessaData','promessaObs');
 if(f.notaModo==='separado')campos.push('nfSinalStatus','nfSinalNumero','nfSinalData','nfSaldoStatus','nfSaldoNumero','nfSaldoData');
 for(const k of campos){const el=$(k);if(el)update[k]=el.value;}
 if(update.cobrancaStatus==='pago'&&f.cobrancaStatus!=='pago'){avisar('Só Will pode confirmar o pagamento no financeiro.',true);return;}
 if(f.cobrancaStatus==='pago')update.cobrancaStatus='pago';
 if(enviar){if(update.cobrancaStatus==='pago'){avisar('Este fechamento já está pago.',true);return;}update.cobrancaStatus='enviada';update.enviadoEm=new Date().toISOString();}
 update.atualizadoEm=new Date().toISOString();
 try{
  WENFechamentos.validarEdicao({...f,...update});busy=true;$('salvar').disabled=true;$('enviada').disabled=true;
  let time=f.updateTime;
  if(!mock){const masks=Object.keys(update).map(k=>'updateMask.fieldPaths='+k).join('&');const j=await req('/administrativo_fechamentos/'+encodeURIComponent(f.id)+'?'+masks+'&currentDocument.updateTime='+encodeURIComponent(f.updateTime),{method:'PATCH',body:JSON.stringify({fields:Object.fromEntries(Object.entries(update).map(([k,v])=>[k,to(v)]))})});time=j.updateTime;}
  Object.assign(f,update,{updateTime:time});dirty=false;abrir(f.id);avisar(enviar?'Envio registrado.':'Alterações salvas na nuvem.');
 }catch(e){avisar(e.message,true);}finally{busy=false;if($('salvar'))$('salvar').disabled=false;if($('enviada'))$('enviada').disabled=false;}
}
// Mantém o texto fiscal acessível dentro da camada modal.
$('cobrancaDialog').appendChild($('modalNFBg'));
function fecharCobranca(){
 if(busy)return;
 if(dirty&&!confirm('Descartar as alterações não salvas?'))return;
 const id=selecionado;dirty=false;selecionado='';
 $('modalNFBg').classList.remove('open');
 $('cobrancaDialog').close();document.body.classList.remove('cobranca-aberta');
 history.replaceState(null,'',location.pathname+location.search);lista();
 [...$('lista').querySelectorAll('[data-abrir]')].find(b=>b.dataset.abrir===id)?.focus();
}
$('fecharCobranca').onclick=fecharCobranca;
$('cobrancaDialog').addEventListener('cancel',e=>{e.preventDefault();if($('modalNFBg').classList.contains('open'))$('modalNFBg').classList.remove('open');else fecharCobranca();});
$('loginForm').onsubmit=async e=>{e.preventDefault();$('entrar').disabled=true;try{sessao(await auth('identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',{email:$('email').value.trim(),password:$('senha').value,returnSecureToken:true}));$('senha').value='';await carregar();}catch(e){avisar(e.message,true);}finally{$('entrar').disabled=false;}};
$('verificar').onclick=async()=>{try{await auth('identitytoolkit.googleapis.com/v1/accounts:sendOobCode',{requestType:'VERIFY_EMAIL',idToken:token});avisar('Link de verificação solicitado. Abra seu e-mail e depois entre novamente.');}catch(e){avisar(e.message,true);}};
$('redefinir').onclick=async()=>{if(!$('email').checkValidity()||!$('email').value){avisar('Informe seu e-mail.',true);return;}try{await auth('identitytoolkit.googleapis.com/v1/accounts:sendOobCode',{requestType:'PASSWORD_RESET',email:$('email').value.trim()});avisar('Se houver uma conta para este e-mail, as instruções de senha chegarão na caixa de entrada.');}catch(e){avisar(e.message,true);}};
$('sino').onclick=()=>{avisosAbertos=!avisosAbertos;sino();if(avisosAbertos)$('avisosFechar').focus();};
document.addEventListener('click',e=>{if(avisosAbertos&&!$('avisosCx').contains(e.target)&&!$('sino').contains(e.target)){avisosAbertos=false;sino();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&avisosAbertos){avisosAbertos=false;sino();$('sino').focus();}});
$('nfFechar').onclick=()=>$('modalNFBg').classList.remove('open');
$('nfCopiar').onclick=()=>copiarTexto($('nfTextoArea').value,'📋 Texto da nota copiado.');
$('modalNFBg').onclick=e=>{if(e.target===$('modalNFBg'))$('modalNFBg').classList.remove('open');};
$('sair').onclick=()=>{sessionStorage.removeItem('wen_admin_rt');localStorage.removeItem('wen_auth_rt');location.replace('administrativo.html');};
$('busca').onchange=lista;$('mesIni').onchange=lista;$('mesFim').onchange=lista;$('ordem').onchange=lista;
document.querySelectorAll('.nf-abas [data-f]').forEach(b=>b.onclick=()=>{filtro=b.dataset.f;document.querySelectorAll('.nf-abas [data-f]').forEach(x=>x.classList.toggle('on',x===b));lista();});
$('atualizar').onclick=()=>{if(!dirty||confirm('Descartar alterações e atualizar?'))carregar();};
window.addEventListener('focus',()=>{if(!dirty&&!busy&&!$('app').hidden)carregar();});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{if(mock){await carregar();return;}refresh=sessionStorage.getItem('wen_admin_rt')||localStorage.getItem('wen_auth_rt');if(refresh)await carregar();})();
})();
