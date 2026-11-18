'use strict';
(()=>{
const KEY='AIzaSyC7hYN3__Q_4MNAu6VCTXbTdvVSW37IneI', BASE='https://firestore.googleapis.com/v1/projects/wencontasapagar/databases/(default)/documents';
const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cash=WENFechamentos.money, mock=new URLSearchParams(location.search).get('mock')==='1';
let token='',refresh='',expires=0,docs=[],selecionado='',busy=false,dirty=false;
const avisar=(s,error=false)=>{$('aviso').textContent=s;$('aviso').className='status'+(error?' error':'');};
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
function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function atrasada(f){return f.cobrancaStatus!=='pago'&&f.vencimento&&f.vencimento<today();}
async function carregar(){
 if(busy)return;
 try{
  if(!mock){if(Date.now()>expires)sessao(await auth('securetoken.googleapis.com/v1/token',{grant_type:'refresh_token',refresh_token:refresh}));const user=await auth('identitytoolkit.googleapis.com/v1/accounts:lookup',{idToken:token});const u=user.users?.[0];if(u?.email==='financeiro@wenprodutora.com.br'&&!u.emailVerified){$('verificar').hidden=false;throw Error('Verifique seu e-mail antes de acessar. Use o botão abaixo; depois de verificar, entre novamente.');}}
  let novos=[];
  if(mock){novos=docs.length?docs:[{...WENFechamentos.criar([{id:'demo1',cliente:'Cliente demonstração',data:'18/11',mes:'2026-11',horas:3,studio:'Estúdio A',valorTotal:2400,valorReserva:400}],{exigeNota:false}),id:'demo',updateTime:'mock'}];}
  else{let pt='';do{const j=await req('/administrativo_fechamentos?pageSize=200'+(pt?'&pageToken='+encodeURIComponent(pt):''));novos.push(...(j.documents||[]).map(d=>({...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,from(v)])),id:d.name.split('/').at(-1),updateTime:d.updateTime})));pt=j.nextPageToken||'';}while(pt);}
  docs=novos.filter(f=>f.itens?.length&&f.itens.every(WENFechamentos.noPeriodo)).sort((a,b)=>b.criadoEm.localeCompare(a.criadoEm));$('login').hidden=true;$('app').hidden=false;$('sair').hidden=false;
  avisar(mock?'Demonstração — dados fictícios.':'Fechamentos atualizados.');lista();
  if(selecionado&&docs.some(f=>f.id===selecionado))abrir(selecionado);else if(location.hash&&docs.some(f=>f.id===decodeURIComponent(location.hash.slice(1))))abrir(decodeURIComponent(location.hash.slice(1)));
 }catch(e){avisar(e.message,true);}
}
function lista(){
 const termo=$('busca').value.toLocaleLowerCase('pt-BR'), filtro=$('filtro').value;
 const vis=docs.filter(f=>(f.cliente+' '+f.id).toLocaleLowerCase('pt-BR').includes(termo)&&(!filtro||(filtro==='atrasada'?atrasada(f):f.cobrancaStatus===filtro)));
 $('lista').innerHTML=vis.length?vis.map(f=>`<button data-id="${esc(f.id)}" class="${selecionado===f.id?'active':''}"><b>${esc(f.cliente)}</b><br><span class="muted">${f.itens.length} diária(s) · ${esc(f.cobrancaStatus)}${atrasada(f)?' · Em atraso':''}<br>${esc(f.exigeNota?'NF: '+f.fiscalStatus:'NF não solicitada')}</span></button>`).join(''):'<p class="muted">Nenhum fechamento neste filtro. O proprietário libera as diárias pelo financeiro.</p>';
 $('lista').querySelectorAll('button').forEach(b=>b.onclick=()=>{if(!dirty||confirm('Descartar as alterações não salvas?'))abrir(b.dataset.id);});
}
function abrir(id){
 const f=docs.find(x=>x.id===id);if(!f)return;selecionado=id;dirty=false;lista();location.hash=id;
 const nf=(f.notasExistentes||[]).map(n=>n.numero).join(', ');
 $('editor').innerHTML=`<h2>${esc(f.cliente)}</h2><p class="muted">Fechamento ${esc(f.id.slice(0,8))} · ${f.itens.length} diária(s)</p>
 <div class="status"><b>Valores na liberação</b><br>Total ${cash(f.valor)} · Recebido ${cash(f.recebido)} · Saldo ${cash(f.saldo)}<br><span class="muted">Valores conferidos no momento da liberação. Pagamentos posteriores devem ser confirmados pelo proprietário.</span></div>
 <details><summary>Diárias e dados do cliente</summary><table><thead><tr><th>Diária</th><th>Serviço</th><th>Valor</th></tr></thead><tbody>${f.itens.map(i=>`<tr><td>${esc(i.data)} / ${esc(i.mes)}</td><td>${esc(i.studio)} · ${i.horas}h</td><td>${cash(i.valor)}</td></tr>`).join('')}</tbody></table><p>${Object.entries(f.clienteFiscal||{}).filter(([,v])=>v).map(([k,v])=>esc(k)+': '+esc(v)).join('<br>')}</p></details>
 ${nf?`<div class="status">Notas já registradas no financeiro: ${esc(nf)}. Confira estas referências antes de registrar outra nota.</div>`:''}
 <form id="formFechamento"><div class="row"><label>Vencimento<input id="vencimento" type="date" value="${esc(f.vencimento)}"></label><label>Cobrança<select id="cobrancaStatus"><option value="pendente">Pendente</option><option value="enviada">Enviada</option><option value="pago">Pagamento confirmado</option></select></label></div>
 <label>Descrição para cobrança<textarea id="descricaoCobranca" rows="8">${esc(f.descricaoCobranca)}</textarea></label><div class="actions"><button type="button" id="copiarCobranca">Copiar cobrança</button><button type="button" id="pdf">PDF / imprimir fechamento</button></div><hr>
 <div class="row"><label>Situação fiscal<select id="fiscalStatus"><option value="pendente">Nota pendente</option><option value="emitida">Nota emitida</option><option value="nao_solicitada">NF não solicitada pelo cliente</option></select></label><label>Número da nota<input id="nfNumero" value="${esc(f.nfNumero)}"></label><label>Emissão<input id="nfData" type="date" value="${esc(f.nfData)}"></label></div>
 <label>Descrição fiscal<textarea id="descricaoFiscal" rows="6">${esc(f.descricaoFiscal)}</textarea></label><button type="button" id="copiarFiscal">Copiar descrição fiscal</button><p class="muted">O registro da nota serve para controle; a emissão acontece no portal fiscal.</p>
 <div class="actions"><button class="primary" id="salvar">Salvar alterações</button><button type="button" id="enviada">Registrar cobrança enviada</button></div><p id="resultado" role="status"></p><p class="muted">${f.enviadoEm?'Último envio registrado: '+esc(new Date(f.enviadoEm).toLocaleString('pt-BR')):''}</p></form>`;
 $('cobrancaStatus').value=f.cobrancaStatus;$('fiscalStatus').value=f.fiscalStatus;if(f.fiscalIds?.length===0){for(const id of ['fiscalStatus','nfNumero','nfData'])$(id).disabled=true;}
 $('formFechamento').oninput=()=>dirty=true;
 $('formFechamento').onsubmit=e=>{e.preventDefault();salvar(false);};$('enviada').onclick=()=>salvar(true);
 $('copiarCobranca').onclick=()=>copiar('descricaoCobranca');$('copiarFiscal').onclick=()=>copiar('descricaoFiscal');
 $('pdf').onclick=()=>{$('printArea').innerHTML=`<h1>WEN PRODUTORA</h1><h2>Fechamento · ${esc(f.cliente)}</h2><p>Referência ${esc(f.id.slice(0,8))}</p><pre>${esc($('descricaoCobranca').value)}</pre><p>${$('vencimento').value?'Vencimento: '+esc($('vencimento').value):''}</p>`;window.print();};
}
async function copiar(id){try{await navigator.clipboard.writeText($(id).value);$('resultado').textContent='Texto copiado. Revise o destinatário antes de enviar.';}catch(e){$(id).focus();$(id).select();$('resultado').textContent='Selecione e copie o texto com Ctrl/Cmd+C.';}}
async function salvar(enviar){
 if(busy)return;
 const f=docs.find(f=>f.id===selecionado), update={};
 for(const k of ['vencimento','cobrancaStatus','fiscalStatus','nfNumero','nfData','descricaoFiscal','descricaoCobranca'])update[k]=$(k).value;
 if(enviar){if(update.cobrancaStatus==='pago'){avisar('Este fechamento já está pago.',true);return;}update.cobrancaStatus='enviada';update.enviadoEm=new Date().toISOString();}
 update.atualizadoEm=new Date().toISOString();
 try{
  WENFechamentos.validarEdicao({...f,...update});busy=true;$('salvar').disabled=true;$('enviada').disabled=true;
  let time=f.updateTime;
  if(!mock){const masks=Object.keys(update).map(k=>'updateMask.fieldPaths='+k).join('&');const j=await req('/administrativo_fechamentos/'+encodeURIComponent(f.id)+'?'+masks+'&currentDocument.updateTime='+encodeURIComponent(f.updateTime),{method:'PATCH',body:JSON.stringify({fields:Object.fromEntries(Object.entries(update).map(([k,v])=>[k,to(v)]))})});time=j.updateTime;}
  Object.assign(f,update,{updateTime:time});dirty=false;abrir(f.id);avisar(enviar?'Envio registrado.':'Alterações salvas na nuvem.');
 }catch(e){avisar(e.message,true);}finally{busy=false;if($('salvar'))$('salvar').disabled=false;if($('enviada'))$('enviada').disabled=false;}
}
$('loginForm').onsubmit=async e=>{e.preventDefault();$('entrar').disabled=true;try{sessao(await auth('identitytoolkit.googleapis.com/v1/accounts:signInWithPassword',{email:$('email').value.trim(),password:$('senha').value,returnSecureToken:true}));$('senha').value='';await carregar();}catch(e){avisar(e.message,true);}finally{$('entrar').disabled=false;}};
$('verificar').onclick=async()=>{try{await auth('identitytoolkit.googleapis.com/v1/accounts:sendOobCode',{requestType:'VERIFY_EMAIL',idToken:token});avisar('Link de verificação solicitado. Abra seu e-mail e depois entre novamente.');}catch(e){avisar(e.message,true);}};
$('redefinir').onclick=async()=>{if(!$('email').checkValidity()||!$('email').value){avisar('Informe seu e-mail.',true);return;}try{await auth('identitytoolkit.googleapis.com/v1/accounts:sendOobCode',{requestType:'PASSWORD_RESET',email:$('email').value.trim()});avisar('Se houver uma conta para este e-mail, as instruções de senha chegarão na caixa de entrada.');}catch(e){avisar(e.message,true);}};
$('sair').onclick=()=>{sessionStorage.removeItem('wen_admin_rt');localStorage.removeItem('wen_auth_rt');location.replace('administrativo.html');};
$('busca').oninput=lista;$('filtro').onchange=lista;$('atualizar').onclick=()=>{if(!dirty||confirm('Descartar alterações e atualizar?'))carregar();};
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
(async()=>{if(mock){await carregar();return;}refresh=sessionStorage.getItem('wen_admin_rt')||localStorage.getItem('wen_auth_rt');if(refresh)await carregar();})();
})();
