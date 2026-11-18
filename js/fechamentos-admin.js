/* Integração do proprietário. O portal recebe somente fechamentos liberados. */
let FC_dados={}, FC_ok=false, FC_selecionados=new Set(), FC_rascunho=null, FC_salvando=false;
async function FC_carregar(){
  try{const raw=await CC_fbCarregar('administrativo_fechamentos');FC_dados=Object.fromEntries(Object.entries(raw).filter(([,f])=>f.itens?.length&&f.itens.every(WENFechamentos.noPeriodo)).map(([id,f])=>[id,{...f,id}]));FC_ok=true;}
  catch(e){FC_ok=false;}return FC_ok;
}
function FC_notas(){return Object.values(FC_dados).filter(f=>f.fiscalStatus==='emitida'&&(f.fiscalIds||f.lancamentoIds).length).map(f=>({
  id:'fc:'+f.id,numero:f.nfNumero,dataEmissao:f.nfData,cliente:f.cliente,valor:f.fiscalValor??f.valor,
  lancamentoIds:f.fiscalIds||f.lancamentoIds,gravacoes:f.itens.length,horas:f.itens.reduce((s,i)=>s+i.horas,0),
  mesIni:f.itens.map(i=>i.mes).sort((a,b)=>WENFechamentos.mesChave(a).localeCompare(WENFechamentos.mesChave(b)))[0],mesFim:f.itens.map(i=>i.mes).sort((a,b)=>WENFechamentos.mesChave(a).localeCompare(WENFechamentos.mesChave(b))).at(-1),status:'emitida'}));}
function FC_ocupados(){return new Set(Object.values(FC_dados).flatMap(f=>f.lancamentoIds||[]).map(String));}
function FC_render(){
  const root=document.getElementById('nfConteudo'), esc=NF_esc, ocupados=FC_ocupados();
  document.getElementById('nfCards').innerHTML='';
  const regs=NF_lancamentosDoPeriodo(), cliente=NF_filtro().cliente;
  const historico=Object.values(FC_dados).filter(f=>!cliente||f.cliente===cliente);
  root.innerHTML=`<div class="nf-resumo"><b>Fechamento por diária ou por período</b><br>Selecione um cliente no filtro, marque as diárias e revise as descrições antes de liberar para o administrativo. Valores recebidos refletem o momento do fechamento.<br><a href="administrativo.html" target="_blank" rel="noopener">Abrir área administrativa</a></div>
    ${!FC_ok?'<div class="nf-alerta erro">Não foi possível ler os fechamentos. Recarregue antes de continuar.</div>':''}
    ${!cliente?'<p class="nf-vazio">Escolha um cliente para preparar seu fechamento.</p>':`<label class="nf-item"><input type="checkbox" id="fcTodas"> Selecionar todas as diárias disponíveis do filtro</label><div id="fcDiarias">${regs.map(r=>`<label class="nf-item"><input type="checkbox" data-id="${esc(r.id)}" ${ocupados.has(String(r.id))?'disabled':FC_selecionados.has(String(r.id))?'checked':''}><span>${esc(NF_rotuloLanc(r))}${ocupados.has(String(r.id))?' · Já possui fechamento':''}</span></label>`).join('')}</div>
    <p>Incluir nas descrições:</p><div id="fcCampos" style="display:flex;gap:16px;flex-wrap:wrap">${[['data','Data'],['horas','Horas'],['studio','Estúdio'],['descricao','Descrição do serviço']].map(([k,v])=>`<label><input type="checkbox" value="${k}" checked> ${v}</label>`).join('')}</div><button class="btn btn-green" id="fcPreparar" ${FC_ok?'':'disabled'}>Preparar fechamento</button>`}
    <div id="fcEditor"></div><h3>Fechamentos liberados</h3>${historico.length?historico.map(f=>`<div class="nf-lin"><div class="nf-info"><b>${esc(f.cliente)}</b><div>${f.itens.length} diária(s) · ${esc(f.cobrancaStatus)} · ${f.exigeNota?'NF: '+esc(f.fiscalStatus):'NF não solicitada'}</div></div><a href="administrativo.html#${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Abrir fechamento</a></div>`).join(''):'<p>Nenhum fechamento liberado para este cliente.</p>'}`;
  root.querySelectorAll('#fcDiarias input').forEach(el=>el.onchange=()=>el.checked?FC_selecionados.add(el.dataset.id):FC_selecionados.delete(el.dataset.id));
  const all=document.getElementById('fcTodas');if(all)all.onchange=()=>root.querySelectorAll('#fcDiarias input:not(:disabled)').forEach(el=>{el.checked=all.checked;el.onchange();});
  const btn=document.getElementById('fcPreparar');if(btn)btn.onclick=()=>{
    try{
      const selecionados=regs.filter(r=>FC_selecionados.has(String(r.id))&&!ocupados.has(String(r.id)));
      FC_rascunho=WENFechamentos.criar(selecionados,CFI_casar(cliente,CFI_lista())||{},[...root.querySelectorAll('#fcCampos input:checked')].map(el=>el.value));
      const f=FC_rascunho;
      // Notas existentes são preservadas como referência, sem registrar emissão nova.
      const notas=NF_ativas().filter(n=>(n.lancamentoIds||[]).some(id=>f.lancamentoIds.includes(String(id))));
      if(notas.length){f.notasExistentes=notas.map(n=>({numero:n.numero,lancamentoIds:n.lancamentoIds}));}
      const cobertos=new Set(notas.flatMap(n=>n.lancamentoIds||[]).map(String));
      f.fiscalIds=f.lancamentoIds.filter(id=>!cobertos.has(id));
      f.fiscalValor=selecionados.filter(r=>f.fiscalIds.includes(String(r.id))).reduce((v,r)=>v+Math.round(Number(r.valorTotal)*100),0)/100;
      if(f.fiscalIds.length)f.descricaoFiscal=WENFechamentos.criar(selecionados.filter(r=>f.fiscalIds.includes(String(r.id))),{},[...root.querySelectorAll('#fcCampos input:checked')].map(el=>el.value)).descricaoFiscal;
      else{f.descricaoFiscal='Serviços já cobertos pelas notas: '+notas.map(n=>n.numero).join(', ');f.fiscalStatus='emitida';f.nfNumero=notas.map(n=>n.numero).join(', ');const d=String(notas[0].dataEmissao||'');f.nfData=/^\d{2}\/\d{2}\/\d{4}$/.test(d)?d.split('/').reverse().join('-'):d;}

      document.getElementById('fcEditor').innerHTML=`<div class="nf-resumo"><h3>Revisar e liberar</h3><p>Total ${fmt(f.valor)} · Recebido ${fmt(f.recebido)} · Saldo ${fmt(f.saldo)}</p><p>${f.exigeNota?'Cliente solicita NF':'Cliente não solicita NF — cobrança permanece disponível'}${notas.length?' · Há nota(s) registrada(s): '+notas.map(n=>esc(n.numero)).join(', '):''}</p><label>Vencimento <input type="date" id="fcVenc"></label><p><label>Descrição fiscal<textarea id="fcFiscal" rows="6" style="width:100%">${esc(f.descricaoFiscal)}</textarea></label></p><p><label>Descrição da cobrança<textarea id="fcCobranca" rows="8" style="width:100%">${esc(f.descricaoCobranca)}</textarea></label></p><button class="btn btn-green" id="fcLiberar">Liberar para o administrativo</button><p id="fcResultado" role="status"></p></div>`;
      document.getElementById('fcLiberar').onclick=FC_liberar;
    }catch(e){toast(e.message,'#ef4444');}
  };
}
async function FC_liberar(){
  if(FC_salvando||!FC_rascunho)return;FC_salvando=true;
  const btn=document.getElementById('fcLiberar'), aviso=document.getElementById('fcResultado');btn.disabled=true;
  try{
    const f={...FC_rascunho,descricaoFiscal:document.getElementById('fcFiscal').value,descricaoCobranca:document.getElementById('fcCobranca').value,vencimento:document.getElementById('fcVenc').value};
    WENFechamentos.validarEdicao(f);
    if(!await FC_carregar())throw Error('Não foi possível verificar fechamentos existentes.');
    if(f.lancamentoIds.some(id=>FC_ocupados().has(id)))throw Error('Uma diária já foi liberada em outro fechamento. Recarregue a lista.');
    const id=crypto.randomUUID(), path=FS_URL.replace('https://firestore.googleapis.com/v1/','');
    const fields={};Object.entries(f).forEach(([k,v])=>fields[k]=toFV(v));
    const writes=[{update:{name:path+'/administrativo_fechamentos/'+id,fields},currentDocument:{exists:false}},...f.lancamentoIds.map(lid=>({update:{name:path+'/administrativo_vinculos/'+encodeURIComponent(lid),fields:{fechamentoId:toFV(id)}},currentDocument:{exists:false}}))];
    if(SIMULACAO_LOCAL){
      for(const w of writes){const r=await fetch('https://firestore.googleapis.com/v1/'+w.update.name+'?key='+FB_API_KEY,{method:'PATCH',body:JSON.stringify({fields:w.update.fields})});if(!r.ok)throw Error('Falha no mock');}
    }else{
      const res=await fetch(FS_URL+':commit?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes})});
      if(!res.ok)throw Error(res.status===409?'Uma diária já possui fechamento. Recarregue.':'Não foi possível salvar na nuvem ('+res.status+'). Nada foi liberado.');
    }
    FC_dados[id]={...f,id};FC_selecionados.clear();FC_rascunho=null;FC_render();toast('Fechamento liberado para o administrativo.');
  }catch(e){aviso.textContent=e.message;btn.disabled=false;}finally{FC_salvando=false;}
}
