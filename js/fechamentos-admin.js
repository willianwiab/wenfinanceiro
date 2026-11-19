/* Integração do proprietário. O portal recebe somente fechamentos liberados. */
let FC_dados={}, FC_ok=false, FC_selecionados=new Set(), FC_rascunho=null, FC_salvando=false;
async function FC_carregar(){
  try{const raw=await CC_fbCarregar('administrativo_fechamentos');FC_dados=Object.fromEntries(Object.entries(raw).filter(([,f])=>f.itens?.length&&f.itens.every(WENFechamentos.noPeriodo)).map(([id,f])=>[id,{...f,id}]));FC_ok=true;}
  catch(e){FC_ok=false;}return FC_ok;
}
function FC_notas(){return Object.values(FC_dados).filter(f=>f.fiscalStatus==='emitida'&&(f.fiscalIds||f.lancamentoIds||[]).length).map(f=>({
  id:'fc:'+f.id,numero:f.nfNumero,dataEmissao:f.nfData,cliente:f.cliente,valor:f.fiscalValor??f.valor,
  lancamentoIds:f.fiscalIds||f.lancamentoIds||[],gravacoes:f.itens.length,horas:f.itens.reduce((s,i)=>s+i.horas,0),
  mesIni:f.itens.map(i=>i.mes).sort((a,b)=>WENFechamentos.mesChave(a).localeCompare(WENFechamentos.mesChave(b)))[0],mesFim:f.itens.map(i=>i.mes).sort((a,b)=>WENFechamentos.mesChave(a).localeCompare(WENFechamentos.mesChave(b))).at(-1),status:'emitida'}));}
// Monta o fechamento de um cliente — mesma regra para a tela de um cliente e para o lote.
// Notas já emitidas são preservadas como referência, sem registrar emissão nova.
function FC_montar(cliente,selecionados,campos){
  const f=WENFechamentos.criar(selecionados,CFI_casar(cliente,CFI_lista())||{},campos);
  const notas=NF_ativas().filter(n=>(n.lancamentoIds||[]).some(id=>f.lancamentoIds.includes(String(id))));
  if(notas.length)f.notasExistentes=notas.map(n=>({numero:n.numero,lancamentoIds:n.lancamentoIds}));
  const cobertos=new Set(notas.flatMap(n=>n.lancamentoIds||[]).map(String));
  f.fiscalIds=f.lancamentoIds.filter(id=>!cobertos.has(id));
  f.fiscalValor=selecionados.filter(r=>f.fiscalIds.includes(String(r.id))).reduce((v,r)=>v+Math.round(Number(r.valorTotal)*100),0)/100;
  if(f.fiscalIds.length)f.descricaoFiscal=WENFechamentos.criar(selecionados.filter(r=>f.fiscalIds.includes(String(r.id))),{},campos).descricaoFiscal;
  else{f.descricaoFiscal='Serviços já cobertos pelas notas: '+notas.map(n=>n.numero).join(', ');f.fiscalStatus='emitida';f.nfNumero=notas.map(n=>n.numero).join(', ');const d=String(notas[0].dataEmissao||'');f.nfData=/^\d{2}\/\d{2}\/\d{4}$/.test(d)?d.split('/').reverse().join('-'):d;}
  return f;
}
// Clientes com diárias ainda não liberadas no recorte, já sem quem a ficha tirou do caminho.
function FC_lote(){
  const ocupados=FC_ocupados(), fichas=(typeof CFI_lista==='function'?CFI_lista():[]), grupos={};
  (NF_lancamentosDoPeriodo()||[]).forEach(r=>{
    if(ocupados.has(String(r.id)))return;
    const c=r.cliente||'';if(!c)return;
    (grupos[c]=grupos[c]||[]).push(r);
  });
  return Object.entries(grupos).map(([cliente,regs])=>({
    cliente, regs, ficha:CFI_casar(cliente,fichas),
    horas:regs.reduce((a,r)=>a+(Number(r.horas)||0),0),
    valor:regs.reduce((a,r)=>a+Math.round(Number(r.valorTotal)*100),0)/100
  })).filter(g=>CFI_liberavel(g.ficha)).sort((a,b)=>b.valor-a.valor);
}
let FC_loteFora=new Set();   // clientes que o Will desmarcou nesta tela
function FC_loteHTML(){
  const grupos=FC_lote();
  if(!grupos.length)return '<p class="nf-vazio">✅ Nada solto neste recorte — toda diária dos clientes atendidos pelo administrativo já tem fechamento.</p>';
  const marcados=grupos.filter(g=>!FC_loteFora.has(g.cliente));
  const total=marcados.reduce((a,g)=>a+g.valor,0), diarias=marcados.reduce((a,g)=>a+g.regs.length,0);
  return `<div class="nf-resumo"><b>Liberar o mês de uma vez</b><br>
    Estes clientes têm diárias ainda não liberadas no recorte. Desmarque quem não entra —
    quem a ficha tirou do caminho (não exige nota <b>e</b> não é cobrado pelo administrativo) já não aparece aqui.</div>
   <div id="fcLoteLista">${grupos.map(g=>{
     const fora=FC_loteFora.has(g.cliente), fi=g.ficha||{};
     const selos=(fi.exigeNota===false?'<span class="nf-pill">sem NF</span>':'<span class="nf-pill pend">exige NF</span>')
       +(fi.cobrancaAdministrativo===false?' <span class="nf-pill">cobrança com o Will</span>':'')
       +(g.ficha?'':' <span class="nf-pill">sem ficha</span>');
     return `<div class="nf-lin${fora?'':' fila'}" style="${fora?'opacity:.5':''}">
       <input type="checkbox" class="fc-lote-cb" data-cli="${NF_esc(g.cliente)}" ${fora?'':'checked'} style="width:18px;height:18px;flex-shrink:0">
       <div class="nf-info"><div class="nf-nome">${NF_esc(g.cliente)}</div>
       <div class="nf-meta">${g.regs.length} ${g.regs.length===1?'diária':'diárias'} · ${g.horas}h ${selos}</div></div>
       <div class="nf-val">${fmt(g.valor)}</div></div>`;}).join('')}</div>
   <div class="nf-resumo"><b>${marcados.length} cliente(s) · ${diarias} diária(s) · ${fmt(total)}</b><br>
     Cada cliente vira um fechamento. O vencimento e as descrições ficam para o administrativo ajustar.</div>
   <button class="btn btn-green" id="fcLiberarLote" ${FC_ok&&marcados.length?'':'disabled'}>🚀 Liberar os marcados</button>
   <p id="fcLoteResultado" role="status"></p>`;
}
function FC_ocupados(){return new Set(Object.values(FC_dados).flatMap(f=>f.lancamentoIds||[]).map(String));}
function FC_render(){
  const root=document.getElementById('nfConteudo'), esc=NF_esc, ocupados=FC_ocupados();
  document.getElementById('nfCards').innerHTML='';
  const regs=NF_lancamentosDoPeriodo(), cliente=NF_filtro().cliente;
  const historico=Object.values(FC_dados).filter(f=>!cliente||f.cliente===cliente);
  root.innerHTML=`<div class="nf-resumo"><b>Fechamento por diária ou por período</b><br>Selecione um cliente no filtro, marque as diárias e revise as descrições antes de liberar para o administrativo. Valores recebidos refletem o momento do fechamento.<br><a href="administrativo.html" target="_blank" rel="noopener">Abrir área administrativa</a></div>
    ${!FC_ok?'<div class="nf-alerta erro">Não foi possível ler os fechamentos. Recarregue antes de continuar.</div>':''}
    ${!cliente?FC_loteHTML():`<label class="nf-item"><input type="checkbox" id="fcTodas"> Selecionar todas as diárias disponíveis do filtro</label><div id="fcDiarias">${regs.map(r=>`<label class="nf-item"><input type="checkbox" data-id="${esc(r.id)}" ${ocupados.has(String(r.id))?'disabled':FC_selecionados.has(String(r.id))?'checked':''}><span>${esc(NF_rotuloLanc(r))}${ocupados.has(String(r.id))?' · Já possui fechamento':''}</span></label>`).join('')}</div>
    <p>Incluir nas descrições:</p><div id="fcCampos" style="display:flex;gap:16px;flex-wrap:wrap">${[['data','Data'],['horas','Horas'],['studio','Estúdio'],['descricao','Descrição do serviço']].map(([k,v])=>`<label><input type="checkbox" value="${k}" checked> ${v}</label>`).join('')}</div><button class="btn btn-green" id="fcPreparar" ${FC_ok?'':'disabled'}>Preparar fechamento</button>`}
    <div id="fcEditor"></div><h3>Fechamentos liberados</h3>${historico.length?historico.map(f=>`<div class="nf-lin"><div class="nf-info"><b>${esc(f.cliente)}</b><div>${f.itens.length} diária(s) · ${esc(f.cobrancaStatus)} · ${f.exigeNota?'NF: '+esc(f.fiscalStatus):'NF não solicitada'}</div></div><a href="administrativo.html#${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Abrir fechamento</a></div>`).join(''):'<p>Nenhum fechamento liberado para este cliente.</p>'}`;
  root.querySelectorAll('.fc-lote-cb').forEach(el=>el.onchange=()=>{
    el.checked?FC_loteFora.delete(el.dataset.cli):FC_loteFora.add(el.dataset.cli);FC_render();});
  const bl=document.getElementById('fcLiberarLote');if(bl)bl.onclick=FC_liberarLote;
  root.querySelectorAll('#fcDiarias input').forEach(el=>el.onchange=()=>el.checked?FC_selecionados.add(el.dataset.id):FC_selecionados.delete(el.dataset.id));
  const all=document.getElementById('fcTodas');if(all)all.onchange=()=>root.querySelectorAll('#fcDiarias input:not(:disabled)').forEach(el=>{el.checked=all.checked;el.onchange();});
  const btn=document.getElementById('fcPreparar');if(btn)btn.onclick=()=>{
    try{
      const selecionados=regs.filter(r=>FC_selecionados.has(String(r.id))&&!ocupados.has(String(r.id)));
      FC_rascunho=FC_montar(cliente,selecionados,[...root.querySelectorAll('#fcCampos input:checked')].map(el=>el.value));
      const f=FC_rascunho, notas=f.notasExistentes||[];

      document.getElementById('fcEditor').innerHTML=`<div class="nf-resumo"><h3>Revisar e liberar</h3><p>Total ${fmt(f.valor)} · Recebido ${fmt(f.recebido)} · Saldo ${fmt(f.saldo)}</p><p>${f.exigeNota?'Cliente solicita NF':'Cliente não solicita NF — cobrança permanece disponível'}${notas.length?' · Há nota(s) registrada(s): '+notas.map(n=>esc(n.numero)).join(', '):''}</p><label>Vencimento <input type="date" id="fcVenc" value="${esc(f.vencimento||'')}"></label> <span class="nf-meta">vem da data do Receber</span><p><label>Descrição fiscal<textarea id="fcFiscal" rows="6" style="width:100%">${esc(f.descricaoFiscal)}</textarea></label></p><p><label>Descrição da cobrança<textarea id="fcCobranca" rows="8" style="width:100%">${esc(f.descricaoCobranca)}</textarea></label></p><button class="btn btn-green" id="fcLiberar">Liberar para o administrativo</button><p id="fcResultado" role="status"></p></div>`;
      document.getElementById('fcLiberar').onclick=FC_liberar;
    }catch(e){toast(e.message,'#ef4444');}
  };
}
// Um commit por fechamento: o documento e os vínculos das suas diárias entram juntos ou
// não entram. Assim uma falha no meio de um lote não deixa fechamento sem trava de diária.
// `criar` já limita a 200 diárias, então são no máximo 201 escritas — longe do teto de 500.
async function FC_gravar(f){
  const id=crypto.randomUUID(), path=FS_URL.replace('https://firestore.googleapis.com/v1/','');
  const fields={};Object.entries(f).forEach(([k,v])=>fields[k]=toFV(v));
  const writes=[{update:{name:path+'/administrativo_fechamentos/'+id,fields},currentDocument:{exists:false}},
    ...f.lancamentoIds.map(lid=>({update:{name:path+'/administrativo_vinculos/'+encodeURIComponent(lid),fields:{fechamentoId:toFV(id)}},currentDocument:{exists:false}}))];
  if(SIMULACAO_LOCAL){
    for(const w of writes){const r=await fetch('https://firestore.googleapis.com/v1/'+w.update.name+'?key='+FB_API_KEY,{method:'PATCH',body:JSON.stringify({fields:w.update.fields})});if(!r.ok)throw Error('Falha no mock');}
  }else{
    const res=await fetch(FS_URL+':commit?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes})});
    if(!res.ok)throw Error(res.status===409?'Uma diária já possui fechamento. Recarregue.':'Não foi possível salvar na nuvem ('+res.status+').');
  }
  return id;
}
// Libera todos os clientes marcados, um por um. Relê os ocupados antes para não correr
// atrás de diária que já saiu em outro fechamento enquanto a tela estava aberta.
async function FC_liberarLote(){
  if(FC_salvando)return;FC_salvando=true;
  const btn=document.getElementById('fcLiberarLote'), aviso=document.getElementById('fcLoteResultado');
  if(btn)btn.disabled=true;
  try{
    if(!await FC_carregar())throw Error('Não foi possível verificar os fechamentos existentes. Nada foi liberado.');
    const ocupados=FC_ocupados();
    const grupos=FC_lote().filter(g=>!FC_loteFora.has(g.cliente));
    if(!grupos.length)throw Error('Nenhum cliente marcado.');
    let feitos=0; const falhas=[];
    for(const g of grupos){
      try{
        const regs=g.regs.filter(r=>!ocupados.has(String(r.id)));
        if(!regs.length){falhas.push(g.cliente+': já liberado');continue;}
        const f=FC_montar(g.cliente,regs,['data','horas','studio','descricao']);
        const id=await FC_gravar(f);
        FC_dados[id]={...f,id};f.lancamentoIds.forEach(x=>ocupados.add(String(x)));feitos++;
        if(aviso)aviso.textContent=`Liberando… ${feitos}/${grupos.length}`;
      }catch(e){falhas.push(g.cliente+': '+e.message);}
    }
    FC_render();
    const res=document.getElementById('fcLoteResultado');
    const msg=`${feitos} fechamento(s) liberado(s).`+(falhas.length?' Não deu para '+falhas.length+': '+falhas.join(' · '):'');
    if(res)res.textContent=msg;
    toast(falhas.length?msg:'🚀 '+msg,falhas.length?'#f59e0b':undefined);
  }catch(e){if(aviso)aviso.textContent=e.message;if(btn)btn.disabled=false;toast(e.message,'#ef4444');}
  finally{FC_salvando=false;}
}
async function FC_liberar(){
  if(FC_salvando||!FC_rascunho)return;FC_salvando=true;
  const btn=document.getElementById('fcLiberar'), aviso=document.getElementById('fcResultado');btn.disabled=true;
  try{
    const f={...FC_rascunho,descricaoFiscal:document.getElementById('fcFiscal').value,descricaoCobranca:document.getElementById('fcCobranca').value,vencimento:document.getElementById('fcVenc').value};
    WENFechamentos.validarEdicao(f);
    if(!await FC_carregar())throw Error('Não foi possível verificar fechamentos existentes.');
    if(f.lancamentoIds.some(id=>FC_ocupados().has(id)))throw Error('Uma diária já foi liberada em outro fechamento. Recarregue a lista.');
    const id=await FC_gravar(f);
    FC_dados[id]={...f,id};FC_selecionados.clear();FC_rascunho=null;FC_render();toast('Fechamento liberado para o administrativo.');
  }catch(e){aviso.textContent=e.message;btn.disabled=false;}finally{FC_salvando=false;}
}

// ══════════════════════════════════════════════════════════════════════════════
// FC_avisos — o painel de vencimentos da aba 🧾 Fiscal e Cobranças.
// Lê os fechamentos JÁ LIBERADOS (os que a Natália vê) e separa em grupos pela
// data de vencimento, que vem do Receber. Não escreve nada: é um raio-X.
// ══════════════════════════════════════════════════════════════════════════════
const FC_DIA=86400000;
function FC_hojeIso(d){const x=d||new Date();return new Date(x.getTime()-x.getTimezoneOffset()*60000).toISOString().slice(0,10);}
function FC_diasAte(iso,hoje){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return null;
  return Math.round((Date.parse(iso+'T00:00:00')-Date.parse((hoje||FC_hojeIso())+'T00:00:00'))/FC_DIA);
}
// Separa os fechamentos nos grupos do painel. Função pura: recebe a lista e o dia,
// devolve os grupos — é o que o teste exercita, sem navegador.
function FC_avisos(lista,hoje,janela){
  const dia=hoje||FC_hojeIso(), prazo=janela==null?7:janela;
  const g={vencidos:[],vencendo:[],aVencer:[],semData:[],notaPendente:[],pagos:[]};
  (lista||[]).forEach(f=>{
    const nf=f.exigeNota&&f.fiscalStatus==='pendente';
    if(nf)g.notaPendente.push(f);
    if(f.cobrancaStatus==='pago'){g.pagos.push(f);return;}
    const d=FC_diasAte(f.vencimento,dia);
    if(d===null)g.semData.push(f);
    else if(d<0)g.vencidos.push(f);
    else if(d<=prazo)g.vencendo.push(f);
    else g.aVencer.push(f);
  });
  const ordem=(a,b)=>String(a.vencimento||'9999').localeCompare(String(b.vencimento||'9999'));
  ['vencidos','vencendo','aVencer','semData','notaPendente'].forEach(k=>g[k].sort(ordem));
  g.emAberto=g.vencidos.concat(g.vencendo,g.aVencer,g.semData);
  g.totalVencido=g.vencidos.reduce((a,f)=>a+Math.round((Number(f.saldo)||0)*100),0)/100;
  g.totalAberto=g.emAberto.reduce((a,f)=>a+Math.round((Number(f.saldo)||0)*100),0)/100;
  return g;
}
function FC_renderAvisos(){
  const root=document.getElementById('nfConteudo'), esc=NF_esc;
  const cliente=NF_filtro().cliente;
  const g=FC_avisos(Object.values(FC_dados).filter(f=>!cliente||f.cliente===cliente));
  document.getElementById('nfCards').innerHTML=
     `<div class="card-p" style="border-left:4px solid #dc2626"><label>🔴 Vencidos</label><div class="val">${fmt(g.totalVencido)}</div><div class="val-sub">${g.vencidos.length} cobrança(s)</div></div>`
    +`<div class="card-p" style="border-left:4px solid #f59e0b"><label>⏰ Vencem em 7 dias</label><div class="val">${g.vencendo.length}</div><div class="val-sub">${g.aVencer.length} mais adiante</div></div>`
    +`<div class="card-p" style="border-left:4px solid #7c3aed"><label>🧾 Nota pendente</label><div class="val">${g.notaPendente.length}</div><div class="val-sub">${g.semData.length} sem vencimento</div></div>`;
  const linha=f=>{
    const d=FC_diasAte(f.vencimento), venc=f.vencimento?f.vencimento.split('-').reverse().join('/'):'sem data';
    const quando=d===null?'':d<0?` · <b style="color:#b91c1c">${-d} dia(s) em atraso</b>`:d===0?' · <b style="color:#b45309">vence hoje</b>':` · em ${d} dia(s)`;
    const selonf=!f.exigeNota?'<span class="nf-pill">sem NF</span>'
      :f.fiscalStatus==='emitida'?`<span class="nf-pill ok">nota ${esc(f.nfNumero||'emitida')}</span>`
      :'<span class="nf-pill pend">nota pendente</span>';
    const cob=f.cobrancaStatus==='enviada'?'<span class="nf-pill">cobrança enviada</span>':'<span class="nf-pill pend">a cobrar</span>';
    return `<div class="nf-lin ${d!==null&&d<0?'div':'fila'}"><div class="nf-info">
      <div class="nf-nome">${esc(f.cliente)}</div>
      <div class="nf-meta">${f.itens.length} diária(s) · vence ${esc(venc)}${quando} ${cob} ${selonf}</div></div>
      <div class="nf-val">${fmt(f.saldo)}</div>
      <div class="nf-acao"><a class="btn" style="width:auto;padding:7px 13px;font-size:.8rem;text-decoration:none" href="administrativo.html#${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Abrir</a></div></div>`;
  };
  const bloco=(titulo,lista,vazio)=>`<h3 style="margin:18px 0 8px">${titulo} ${lista.length?'('+lista.length+')':''}</h3>`
    +(lista.length?lista.map(linha).join(''):`<div class="nf-vazio">${vazio}</div>`);
  root.innerHTML=`<div class="nf-resumo"><b>Vencimentos e pendências</b><br>
     Só o que já foi liberado para o administrativo. A data vem do vencimento do Receber —
     mudou lá, muda aqui no próximo fechamento.</div>`
   +bloco('🔴 Vencidos',g.vencidos,'Nenhuma cobrança vencida. 🎉')
   +bloco('⏰ Vencem nos próximos 7 dias',g.vencendo,'Nada vencendo esta semana.')
   +bloco('📅 A vencer',g.aVencer,'Nada mais agendado.')
   +bloco('❔ Sem data de vencimento',g.semData,'Todos com data definida.')
   +bloco('🧾 Esperando nota fiscal',g.notaPendente,'Nenhuma nota pendente.');
}
