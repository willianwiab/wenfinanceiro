/* Integração do proprietário. O portal recebe somente fechamentos liberados. */
let FC_idsBrutos=new Set();
let FC_maisRecente='', FC_emEspelho=0, FC_conferindo=false;
function FC_marcarRecente(iso){if(iso&&String(iso)>FC_maisRecente)FC_maisRecente=String(iso);}
let FC_dados={}, FC_ok=false, FC_selecionados=new Set(), FC_rascunho=null, FC_salvando=false;
async function FC_carregar(){
  try{const raw=await CC_fbCarregar('administrativo_fechamentos');FC_idsBrutos=new Set(Object.keys(raw));FC_maisRecente=Object.values(raw).map(f=>String(f.atualizadoEm||'')).sort().at(-1)||'';FC_dados=Object.fromEntries(WENFechamentos.consolidarFechamentos(Object.entries(raw).filter(([,f])=>f.itens?.length&&f.itens.every(WENFechamentos.noPeriodo)).map(([id,f])=>({...f,id}))).map(f=>[f.id,f]));FC_ok=true;}
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
let FC_loteTudo=false;
function FC_lote(){
  const ocupados=FC_ocupados(), fichas=(typeof CFI_lista==='function'?CFI_lista():[]), grupos={};
  // "tudo" = todo lançamento desde out/2026, independente do recorte de meses da tela.
  const base=FC_loteTudo
    ? (R_todosOsDados||[]).filter(r=>Number(r.valorTotal)>0&&!r.naoFaturavel&&WENFechamentos.noPeriodo(r))
    : (NF_lancamentosDoPeriodo()||[]);
  base.forEach(r=>{
    if(ocupados.has(String(r.id))||r.naoFaturavel)return;
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
  // Aviso de quem está na tela dela sem dever estar. Vem ANTES do atalho de "nada
  // solto": é justamente quando não há nada a espelhar que a limpeza costuma faltar.
  const na=FC_naoAtendidos();
  const avisoLimpar=na.length
    ? `<div style="background:#fff7ed;border:1px solid #fed7aa;color:#92400e;border-radius:9px;padding:11px 14px;margin:10px 0">
        ⚠️ <b>${na.reduce((a,g)=>a+g.qtd,0)} fechamento(s)</b> de ${na.length} cliente(s) estão na tela do administrativo mas foram desmarcados em nota <b>e</b> cobrança.
        <button type="button" class="btn" id="fcLimpar" style="width:auto;padding:6px 13px;font-size:.8rem;margin-left:8px">🧹 Tirar de lá</button></div>`
    : '';
  const btnReaplicar='<button type="button" class="btn" id="fcReaplicar" style="width:auto;padding:7px 14px;font-size:.8rem;background:#1e40af;color:#fff;border:none;margin:4px 0 10px">🔄 Reaplicar as fichas em tudo</button>'
    +'<div style="font-size:.76rem;color:#94a3b8;margin:-6px 0 10px">Use depois de marcar 🧾 e 💰 de vários clientes: atualiza os fechamentos que já estavam na tela dela.</div>';
  const chaveTudo=`<label class="nf-item" style="margin:10px 0"><input type="checkbox" id="fcLoteTudo" ${FC_loteTudo?'checked':''}>
     <span><b>Carregar tudo desde outubro/2026</b> — ignora o recorte de meses acima. Use uma vez, para trazer o que já existia.</span></label>`;
  if(!grupos.length)return avisoLimpar+btnReaplicar+chaveTudo+'<p class="nf-vazio">✅ Nada solto'+(FC_loteTudo?'':' neste recorte')+' — toda diária dos clientes atendidos pelo administrativo já está espelhada.</p>';
  const marcados=grupos.filter(g=>!FC_loteFora.has(g.cliente));
  const total=marcados.reduce((a,g)=>a+g.valor,0), diarias=marcados.reduce((a,g)=>a+g.regs.length,0);
  return avisoLimpar+btnReaplicar+`<div class="nf-resumo"><b>Diárias que ainda não chegaram no administrativo</b><br>
    Daqui para a frente isso acontece sozinho, no momento do lançamento. Esta lista é para o que já existia antes. Desmarque quem não entra —
    quem a ficha tirou do caminho (não exige nota <b>e</b> não é cobrado pelo administrativo) já não aparece aqui.</div>
   <div id="fcLoteLista">${grupos.map(g=>{
     const fora=FC_loteFora.has(g.cliente);
     return `<div class="nf-lin${fora?'':' fila'}" style="${fora?'opacity:.5':''}">
       <input type="checkbox" class="fc-lote-cb" data-cli="${NF_esc(g.cliente)}" ${fora?'':'checked'} style="width:18px;height:18px;flex-shrink:0">
       <div class="nf-info"><div class="nf-nome">${NF_esc(g.cliente)}</div>
       <div class="nf-meta">${g.regs.length} ${g.regs.length===1?'diária':'diárias'} · ${g.horas}h${g.ficha?'':' <span class="nf-pill">sem ficha</span>'}</div></div>
       ${CFI_chipsDe(g.cliente)}
       <div class="nf-val">${fmt(g.valor)}</div></div>`;}).join('')}</div>
   <div class="nf-resumo"><b>${marcados.length} cliente(s) · ${diarias} diária(s) · ${fmt(total)}</b><br>
     Cada cliente vira um fechamento (mensal ou por diária, conforme a ficha). O vencimento vem do Receber.</div>
   ${chaveTudo}
   <button class="btn btn-green" id="fcLiberarLote" ${FC_ok&&marcados.length?'':'disabled'}>🚀 Espelhar os marcados</button>
   <p id="fcLoteResultado" role="status"></p>`;
}
function FC_ocupados(){return new Set(Object.values(FC_dados).flatMap(f=>f.lancamentoIds||[]).map(String));}
function FC_render(){
  const root=document.getElementById('nfConteudo'), esc=NF_esc, ocupados=FC_ocupados();
  document.getElementById('nfCards').innerHTML='';
  const regs=NF_lancamentosDoPeriodo(), cliente=NF_filtro().cliente;
  const historico=Object.values(FC_dados).filter(f=>!cliente||f.cliente===cliente);
  root.innerHTML=`<div class="nf-resumo"><b>Fechamento por diária ou por período</b><br>As diárias aparecem automaticamente no administrativo após serem salvas no Receber. Selecione um cliente para consultar os fechamentos.<br><a href="${FISCAL_URL}" target="_blank" rel="noopener">Abrir área administrativa</a></div>
    ${!FC_ok?'<div class="nf-alerta erro">Não foi possível ler os fechamentos. Recarregue antes de continuar.</div>':''}
    ${!cliente?FC_loteHTML():`<label class="nf-item"><input type="checkbox" id="fcTodas"> Selecionar todas as diárias disponíveis do filtro</label><div id="fcDiarias">${regs.map(r=>`<label class="nf-item"><input type="checkbox" data-id="${esc(r.id)}" ${ocupados.has(String(r.id))?'disabled':FC_selecionados.has(String(r.id))?'checked':''}><span>${esc(NF_rotuloLanc(r))}${ocupados.has(String(r.id))?' · Já possui fechamento':''}</span></label>`).join('')}</div>
    <p>Incluir nas descrições:</p><div id="fcCampos" style="display:flex;gap:16px;flex-wrap:wrap">${[['data','Data'],['horas','Horas'],['studio','Estúdio'],['descricao','Descrição do serviço']].map(([k,v])=>`<label><input type="checkbox" value="${k}" checked> ${v}</label>`).join('')}</div><button class="btn btn-green" id="fcPreparar" ${FC_ok?'':'disabled'}>Preparar fechamento</button>`}
    <div id="fcEditor"></div><h3>Fechamentos liberados</h3>${historico.length?historico.map(f=>`<div class="nf-lin"><div class="nf-info"><b>${esc(f.cliente)}</b><div>${f.itens.length} diária(s) · ${esc(f.cobrancaStatus)} · ${f.exigeNota?'NF: '+esc(f.fiscalStatus):'NF não solicitada'}</div></div><a href="${FISCAL_URL}#${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Abrir fechamento</a></div>`).join(''):'<p>Nenhum fechamento liberado para este cliente.</p>'}`;
  root.querySelectorAll('.fc-lote-cb').forEach(el=>el.onchange=()=>{
    el.checked?FC_loteFora.delete(el.dataset.cli):FC_loteFora.add(el.dataset.cli);FC_render();});
  const bl=document.getElementById('fcLiberarLote');if(bl)bl.onclick=FC_liberarLote;
  const bt=document.getElementById('fcLoteTudo');if(bt)bt.onchange=()=>{FC_loteTudo=bt.checked;FC_render();};
  const bLimpa=document.getElementById('fcLimpar');if(bLimpa)bLimpa.onclick=FC_limparNaoAtendidos;
  const bRe=document.getElementById('fcReaplicar');if(bRe)bRe.onclick=FC_reaplicarFichas;
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
// O lote deixou de ser "liberar no fim do mês" e virou a CARGA do espelho: espelha o
// que ainda não chegou no administrativo. É idempotente — rodar duas vezes não duplica.
async function FC_liberarLote(){
  if(FC_salvando)return;FC_salvando=true;
  const btn=document.getElementById('fcLiberarLote'), aviso=document.getElementById('fcLoteResultado');
  if(btn)btn.disabled=true;
  try{
    if(!await FC_carregar())throw Error('Não foi possível verificar os fechamentos existentes. Nada foi espelhado.');
    const grupos=FC_lote().filter(g=>!FC_loteFora.has(g.cliente));
    if(!grupos.length)throw Error('Nenhum cliente marcado.');
    let feitos=[];
    for(const g of grupos){
      if(aviso)aviso.textContent='Espelhando… '+g.cliente;
      feitos=feitos.concat(await FC_espelhar(g.regs,'carga'));
    }
    if(feitos.length)await AV_criar(feitos);
    FC_render();
    const res=document.getElementById('fcLoteResultado');
    const msg=feitos.length+' fechamento(s) no administrativo.';
    if(res)res.textContent=msg;
    toast('🚀 '+msg);
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
  const g={vencidos:[],vencendo:[],aVencer:[],semData:[],notaPendente:[],pagos:[],urgentes:[],adiadas:[]};
  (lista||[]).forEach(f=>{
    const nf=f.exigeNota&&f.fiscalStatus==='pendente';
    if(nf)g.notaPendente.push(f);
    if(f.cobrancaStatus==='pago'){g.pagos.push(f);return;}
    // Marcas do Will (24/11): adiada sai da conta até a data; urgente e lembrete do dia
    // vão para o topo. Não entram nos outros grupos para não aparecer duas vezes.
    if(f.adiadoAte&&f.adiadoAte>dia){g.adiadas.push(f);return;}
    if(f.urgente||(f.lembreteData&&f.lembreteData<=dia)){g.urgentes.push(f);return;}
    const d=FC_diasAte(f.vencimento,dia);
    if(d===null)g.semData.push(f);
    else if(d<0)g.vencidos.push(f);
    else if(d<=prazo)g.vencendo.push(f);
    else g.aVencer.push(f);
  });
  const ordem=(a,b)=>String(a.vencimento||'9999').localeCompare(String(b.vencimento||'9999'));
  ['vencidos','vencendo','aVencer','semData','notaPendente','urgentes'].forEach(k=>g[k].sort(ordem));
  g.adiadas.sort((a,b)=>String(a.adiadoAte).localeCompare(String(b.adiadoAte)));
  g.emAberto=g.urgentes.concat(g.vencidos,g.vencendo,g.aVencer,g.semData);
  g.totalVencido=g.vencidos.concat(g.urgentes.filter(f=>FC_diasAte(f.vencimento,dia)<0)).reduce((a,f)=>a+Math.round((Number(f.saldo)||0)*100),0)/100;
  g.totalAberto=g.emAberto.reduce((a,f)=>a+Math.round((Number(f.saldo)||0)*100),0)/100;
  return g;
}
// ── Conferência: o que foi faturado bate com o que foi emitido? ───────────
// Will (20/11): "avisar quando a soma das notas do mês não bate com o faturado —
// pega nota esquecida e nota em dobro". Função pura, para ter teste sem navegador.
function FC_conferencia(lancamentos,notas,fichas,mesIni,mesFim){
  const dentro=m=>{const c=WENFechamentos.mesChave(m);
    return c&&(!mesIni||c>=WENFechamentos.mesChave(mesIni))&&(!mesFim||c<=WENFechamentos.mesChave(mesFim));};
  const porCliente={};
  (lancamentos||[]).forEach(r=>{
    if(!r||r.excluido||r.naoFaturavel||!(Number(r.valorTotal)>0))return;
    if(!WENFechamentos.noPeriodo(r)||!dentro(r.mes))return;
    // só quem precisa de nota entra na conferência
    const regra=(typeof CFI_notaRegra==='function')?CFI_notaRegra(CFI_casar(r.cliente,fichas||[])):'gravacao';
    if(regra==='nenhuma')return;
    const g=porCliente[r.cliente]=porCliente[r.cliente]||{cliente:r.cliente,faturado:0,emitido:0,diarias:0,notas:[]};
    g.faturado+=Math.round(Number(r.valorTotal)*100); g.diarias++;
  });
  (notas||[]).forEach(n=>{
    if(!n||n.status==='cancelada')return;
    if(!dentro(n.mesIni||n.dataEmissao))return;
    const g=porCliente[n.cliente]; if(!g)return;
    g.emitido+=Math.round((Number(n.valor)||0)*100);
    g.notas.push(n.numero||'(sem número)');
  });
  const achados=[];
  Object.values(porCliente).forEach(g=>{
    const dif=g.emitido-g.faturado;
    if(Math.abs(dif)<1)return;                       // bate (tolerância de 1 centavo)
    achados.push({cliente:g.cliente,faturado:g.faturado/100,emitido:g.emitido/100,
      diferenca:dif/100,notas:g.notas,diarias:g.diarias,
      tipo:g.emitido===0?'sem_nota':dif<0?'falta':'sobra'});
  });
  const ordem={sobra:0,falta:1,sem_nota:2};
  return achados.sort((a,b)=>ordem[a.tipo]-ordem[b.tipo]||Math.abs(b.diferenca)-Math.abs(a.diferenca));
}

function FC_blocoConferencia(){
  let achados=[];
  try{
    const f=NF_filtro();
    achados=FC_conferencia(R_todosOsDados,NF_ativas(),
      (typeof CFI_lista==='function'?CFI_lista():[]),f.ini,f.fim);
  }catch(e){return '';}
  const rot={sobra:'<span class="nf-pill erro">emitido a MAIS</span>',
    falta:'<span class="nf-pill pend">falta emitir</span>',
    sem_nota:'<span class="nf-pill pend">nenhuma nota</span>'};
  return '<h3 style="margin:18px 0 8px">⚖️ Nota × faturado '+(achados.length?'('+achados.length+')':'')+'</h3>'
    +'<p class="nf-meta" style="margin:-4px 0 10px">Compara o que foi gravado com o que foi emitido, cliente a cliente, no recorte escolhido. Quem não emite nota fica de fora.</p>'
    +(achados.length?achados.map(a=>
      '<div class="nf-lin '+(a.tipo==='sobra'?'div':'fila')+'"><div class="nf-info">'
      +'<div class="nf-nome">'+NF_esc(a.cliente)+'</div>'
      +'<div class="nf-meta">'+a.diarias+' diária(s) · faturado '+fmt(a.faturado)
      +' · emitido '+fmt(a.emitido)+(a.notas.length?' (nota '+NF_esc(a.notas.join(', '))+')':'')
      +' '+rot[a.tipo]+'</div></div>'
      +'<div class="nf-val" style="color:'+(a.tipo==='sobra'?'#b91c1c':'#b45309')+'">'
      +(a.diferenca>0?'+':'')+fmt(a.diferenca)+'</div></div>').join('')
      :'<div class="nf-vazio">✅ Tudo que foi gravado tem nota no valor certo.</div>');
}
// ── Marcas do Will no card da cobrança (24/11): "eu marco, ela vê". Os botões ficam
// na tela DELA (wen-fiscal), visíveis só quando o Will entra lá com o login dele; aqui
// no financeiro ele só vê os selos e o bloco das adiadas.
const FC_ddmm=iso=>String(iso||'').split('-').reverse().join('/').slice(0,5);
function FC_selosMarcas(f){
  const hoje=FC_hojeIso(), esc=NF_esc;let h='';
  if(f.urgente)h+='<span class="nf-pill erro">🔥 urgente</span>';
  if(f.adiadoAte&&f.adiadoAte>hoje)h+=`<span class="nf-pill" style="background:#ede9fe;color:#5b21b6">💤 volta ${esc(FC_ddmm(f.adiadoAte))}</span>`;
  if(f.lembreteData)h+=f.lembreteData<=hoje
    ?`<span class="nf-pill erro">⏰ lembrete${f.lembreteObs?': '+esc(String(f.lembreteObs).slice(0,40)):''}</span>`
    :`<span class="nf-pill" title="${esc(f.lembreteObs||'')}">⏰ ${esc(FC_ddmm(f.lembreteData))}</span>`;
  return h;
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
    const cob=f.cobrancaStatus==='informado'?'<span class="nf-pill pend">pagamento comunicado · conferir no Receber</span>':f.cobrancaStatus==='enviada'?'<span class="nf-pill">cobrança enviada</span>':'<span class="nf-pill pend">a cobrar</span>';
    return `<div class="nf-lin ${d!==null&&d<0?'div':'fila'}${f.urgente?' fc-urg':''}"><div class="nf-info">
      <div class="nf-nome">${esc(f.cliente)}</div>
      <div class="nf-meta">${f.itens.length} diária(s) · vence ${esc(venc)}${quando} ${FC_selosMarcas(f)} ${cob} ${selonf}</div></div>
      <div class="nf-val">${fmt(f.saldo)}</div>
      <div class="nf-acao"><a class="btn" style="width:auto;padding:7px 13px;font-size:.8rem;text-decoration:none" href="${FISCAL_URL}#${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Abrir</a></div></div>`;
  };
  const bloco=(titulo,lista,vazio)=>`<h3 style="margin:18px 0 8px">${titulo} ${lista.length?'('+lista.length+')':''}</h3>`
    +(lista.length?lista.map(linha).join(''):`<div class="nf-vazio">${vazio}</div>`);
  root.innerHTML=`<div class="nf-resumo"><b>Vencimentos e pendências</b><br>
     Só o que já foi liberado para o administrativo. A data vem do vencimento do Receber —
     mudou lá, muda aqui no próximo fechamento.</div>`
   +(g.urgentes.length?bloco('🔥 Urgentes e lembretes de hoje',g.urgentes,''):'')
   +bloco('🔴 Vencidos',g.vencidos,'Nenhuma cobrança vencida. 🎉')
   +bloco('⏰ Vencem nos próximos 7 dias',g.vencendo,'Nada vencendo esta semana.')
   +bloco('📅 A vencer',g.aVencer,'Nada mais agendado.')
   +bloco('❔ Sem data de vencimento',g.semData,'Todos com data definida.')
   +bloco('🧾 Esperando nota fiscal',g.notaPendente,'Nenhuma nota pendente.')
   +(g.adiadas.length?bloco('💤 Adiadas — vencem na data nova (a Natália vê em 📆 A vencer)',g.adiadas,''):'')
   +FC_blocoConferencia();
}

// ══════════════════════════════════════════════════════════════════════════════
// FC_espelhar — o fechamento deixa de ser fotografia e vira ESPELHO VIVO.
//
// Will (19/11): "não quero liberar em lote, deixa liberado até antes mesmo de gravar —
// às vezes o cliente paga 50% e já precisa aparecer para ela as informações."
//
// Toda vez que um lançamento do Receber é salvo, ele é espelhado para o administrativo
// (se a ficha do cliente disser que ela atende). Mexeu no lançamento, mexeu no espelho.
//
// ⚠️ A GRAVAÇÃO VAI COM updateMask. PATCH sem máscara SUBSTITUI o documento inteiro —
// foi assim que o Receber perdeu lançamento em julho. Os campos dela (número da nota,
// datas, situação da cobrança) NUNCA entram na máscara.
// ══════════════════════════════════════════════════════════════════════════════
const FC_CAMPOS_DADOS=['itens','lancamentoIds','valor','recebido','saldo','vencimento',
  'notaModo','exigeNota','atualizadoEm','divergencia','descricaoFiscal','descricaoCobranca',
  // 24/11: a condição de pagamento da ficha (à vista, 50+50, mensal) também acompanha —
  // antes só entrava na criação, e mudar a ficha não chegava na tela dela.
  'condicao','condicaoTexto',
  // Auditoria 24/11: o nome do cliente e o retrato da ficha (CNPJ, contato, "quem cobra")
  // só eram gravados na criação. Renomear no Receber ("PRÉ TIROLEZ" → "TIROLEZ") ou
  // religar a cobrança na ficha (Oswaldo Cruz) nunca chegava na tela dela.
  'cliente','clienteFiscal'];
const FC_CAMPOS_DELA=['nfNumero','nfData','fiscalStatus','cobrancaStatus','enviadoEm','promessaData','promessaObs',
  'nfSinalNumero','nfSinalData','nfSinalStatus','nfSaldoNumero','nfSaldoData','nfSaldoStatus',
  'urgente','adiadoAte','lembreteData','lembreteObs','mensal'];   // marcas dela no card (24/11)

// A chave do agrupamento sai da ficha: mensal junta o mês do cliente, "diaria" é uma por uma.
function FC_chaveGrupo(cliente,reg,ficha){
  const base=CFI_slug(cliente||'');
  return (ficha&&ficha.fechamentoPadrao==='diaria')
    ? 'd_'+base+'_'+String(reg.id)
    : 'm_'+base+'_'+WENFechamentos.mesChave(reg.mes);
}
// Achou um fechamento com esta chave? (grupo é guardado no próprio documento)
function FC_porGrupo(chave,regs=[]){
 const todos=Object.values(FC_dados),key=WENFechamentos.chaveDiarias({lancamentoIds:regs.map(r=>r.id)});
 const porIds=regs.length?todos.find(f=>WENFechamentos.chaveDiarias(f)===key):null;
 const porGrupo=todos.find(f=>f.grupo===chave);
 const candidato=porIds||porGrupo||null;
 const ids=new Set(regs.map(r=>String(r.id)));
 if(todos.some(f=>f!==candidato&&(f.lancamentoIds||[]).some(id=>ids.has(String(id)))))
   throw Error('Diárias já vinculadas a outro fechamento. Revise a composição antes de reagrupar.');
 return candidato;
}

// A descrição só é regerada enquanto ela não tiver mexido: guardamos o texto que o
// sistema gerou da última vez (descricaoAuto) e comparamos.
function FC_preservarTexto(antigo,novo){
  const dela=k=>antigo&&String(antigo[k]||'').trim()&&String(antigo[k]).trim()!==String((antigo.descricaoAuto||{})[k]||'').trim();
  return {
    descricaoFiscal: dela('descricaoFiscal')?antigo.descricaoFiscal:novo.descricaoFiscal,
    descricaoCobranca: dela('descricaoCobranca')?antigo.descricaoCobranca:novo.descricaoCobranca,
    descricaoAuto:{descricaoFiscal:novo.descricaoFiscal,descricaoCobranca:novo.descricaoCobranca}
  };
}
// Nota emitida e o valor mudou: NÃO sobrescreve calado — marca e avisa.
function FC_divergenciaDe(antigo,valorNovo,itensNovos){
  // 24/11 (Oswaldo Cruz): quando há registro por nota, compara o VALOR DAS NOTAS com as
  // diárias que elas cobrem — não o total antigo da cobrança. Corrigir o Receber para o
  // valor da nota (3.600 → 3.213) é o conserto, não uma divergência.
  const notas=(antigo&&antigo.notasEmitidas)||[];
  if(notas.length&&Array.isArray(itensNovos)){
    const c=v=>Math.round((Number(v)||0)*100);
    const cobertas=new Set(notas.flatMap(n=>n.ids||[]).map(String));
    const vNotas=notas.reduce((t,n)=>t+c(n.valor),0), vDiarias=itensNovos.filter(i=>cobertas.has(String(i.id))).reduce((t,i)=>t+c(i.valor),0);
    return vNotas===vDiarias?null:{valorNota:vNotas/100,valorAtual:vDiarias/100,em:new Date().toISOString()};
  }
  const emitiu=antigo&&(antigo.fiscalStatus==='emitida'||antigo.nfSinalStatus==='emitida'||antigo.nfSaldoStatus==='emitida');
  if(!emitiu)return null;
  const valorNota=Number(antigo.fiscalValor??antigo.valor)||0;
  if(Math.round(valorNota*100)===Math.round(valorNovo*100))return null;
  return {valorNota,valorAtual:valorNovo,em:new Date().toISOString()};
}

// Grava SÓ os campos informados. É aqui que mora a disciplina do updateMask.
async function FC_gravarCampos(id,doc,campos){
  const fields={};
  campos.forEach(k=>{if(doc[k]!==undefined)fields[k]=toFV(doc[k]);});
  const mask=Object.keys(fields).map(k=>'updateMask.fieldPaths='+encodeURIComponent(k)).join('&');
  if(!mask)return;
  const url=`${FS_URL}/administrativo_fechamentos/${encodeURIComponent(id)}?${mask}&key=${FB_API_KEY}`;
  const res=await fetch(url,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
  if(!res.ok)throw Error('Espelho recusado ('+res.status+')');
  FC_marcarRecente(doc.atualizadoEm);   // o que EU gravei não conta como "mudou lá fora"
}

// Criação e reserva das diárias na mesma operação: duas abas não criam cobranças concorrentes.
async function FC_criarEspelho(id,doc,campos){
 const fields={};campos.forEach(k=>{if(doc[k]!==undefined)fields[k]=toFV(doc[k]);});
 const base=FS_URL.replace('https://firestore.googleapis.com/v1/','');
 const writes=[{update:{name:base+'/administrativo_fechamentos/'+id,fields},currentDocument:{exists:false}},
 ...doc.lancamentoIds.map(lid=>({update:{name:base+'/administrativo_vinculos/'+encodeURIComponent(lid),fields:{fechamentoId:toFV(id)}},currentDocument:{exists:false}}))];
 const tentar=()=>fetch(FS_URL+':commit?key='+FB_API_KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({writes})});
 let res=await tentar();
 if(!res.ok){
  // Pode ser vínculo velho de uma cobrança que não existe mais: confere um a um e tenta de novo.
  let limpou=0;
  for(const lid of doc.lancamentoIds){
   try{
    const v=await fetch(`${FS_URL}/administrativo_vinculos/${encodeURIComponent(lid)}?key=${FB_API_KEY}`);
    if(!v.ok)continue;
    const alvo=((await v.json()).fields||{}).fechamentoId?.stringValue||'';
    if(alvo&&!FC_idsBrutos.has(alvo)){await fetch(`${FS_URL}/administrativo_vinculos/${encodeURIComponent(lid)}?key=${FB_API_KEY}`,{method:'DELETE'});limpou++;}
   }catch(e){}
  }
  if(limpou)res=await tentar();
 }
 if(!res.ok)throw Error('Não foi possível reservar as diárias. Recarregue o financeiro antes de tentar novamente ('+res.status+').');
 FC_idsBrutos.add(id);FC_marcarRecente(doc.atualizadoEm);
}
// As diárias que compõem um grupo, lidas do Receber AGORA (o espelho é sempre do estado atual).
function FC_regsDoGrupo(chave,cliente,ficha){
  const todas=(R_todosOsDados||[]).filter(r=>!r.excluido&&r.cliente===cliente&&Number(r.valorTotal)>0&&!r.naoFaturavel&&WENFechamentos.noPeriodo(r));
  return todas.filter(r=>FC_chaveGrupo(cliente,r,ficha)===chave);
}

// ── O ESPELHO ────────────────────────────────────────────────────────────────
// Recebe os lançamentos que mudaram e refaz o(s) grupo(s) deles. Devolve o que fez,
// para os avisos. Nunca escreve no Receber.
async function FC_espelhar(regs,motivo){
  FC_emEspelho++;
  try{return await FC_espelharInterno(regs,motivo);}finally{FC_emEspelho--;}
}
async function FC_espelharInterno(regs,motivo){
  if(!Array.isArray(regs))regs=[regs];
  const fichas=(typeof CFI_lista==='function'?CFI_lista():[]);
  const grupos=new Map();
  regs.forEach(r=>{
    if(!r||!r.cliente||!(Number(r.valorTotal)>0)||!WENFechamentos.noPeriodo(r))return;
    if(r.naoFaturavel)return;   // pré-reserva, bloqueio de agenda, teste interno
    const ficha=CFI_casar(r.cliente,fichas);
    // Quem está desmarcado em nota E em cobrança NÃO entra na tela dela (decisão do Will de
    // 20/11, reafirmada em 24/11 depois de ver o contrário no ar: "somente se tem nota e
    // cobrança, somente nota ou somente cobrança — como decidido anteriormente").
    if(!CFI_liberavel(ficha))return;
    const chave=FC_chaveGrupo(r.cliente,r,ficha);
    if(!grupos.has(chave))grupos.set(chave,{cliente:r.cliente,ficha});
  });
  const feitos=[],erros=[];
  for(const [chave,{cliente,ficha}] of grupos){
    try{
      const doGrupo=FC_regsDoGrupo(chave,cliente,ficha);
      const antigo=FC_porGrupo(chave,doGrupo);
      const id=antigo?antigo.id:chave;
      if(!doGrupo.length){
        // Auditoria 24/11 (SG TALK): cobrança antiga não tem "grupo" e não era achada quando
        // a única diária dela era excluída — ficava de fantasma na tela. Procura pelas diárias.
        const idsFora=new Set(regs.filter(r=>r&&r.cliente===cliente&&(r.excluido||r.naoFaturavel)).map(r=>String(r.id)));
        const alvo=antigo||Object.values(FC_dados).find(f=>(f.lancamentoIds||[]).length&&(f.lancamentoIds||[]).every(i=>idsFora.has(String(i))));
        await FC_removerGrupo(chave,alvo);continue;}
      const novo=WENFechamentos.criar(doGrupo,ficha||{});
      const textos=FC_preservarTexto(antigo,novo);
      const div=FC_divergenciaDe(antigo,novo.valor,novo.itens);
      const doc={...(antigo||{}),...novo,...textos,grupo:chave,id,
        atualizadoEm:new Date().toISOString(),divergencia:div||null};
      if(antigo)FC_CAMPOS_DELA.forEach(k=>{if(antigo[k]!==undefined)doc[k]=antigo[k];});
      else{doc.criadoEm=doc.atualizadoEm;}
      // Só a baixa do proprietário no Receber confirma ou reabre o pagamento.
      const mudouPagamento=antigo&&(Number(antigo.saldo)!==Number(doc.saldo)||Number(antigo.recebido)!==Number(doc.recebido)||Number(antigo.valor)!==Number(doc.valor));
      // 24/11 (Will, Danny Ueda): "está cobrança enviada mas não cobramos, está em aberto".
      // Entrou pagamento ou diária nova e ainda falta: a cobrança anterior foi respondida,
      // o que falta volta para "a cobrar". Quitou: pago.
      if(mudouPagamento)doc.cobrancaStatus=doc.saldo===0?'pago':'pendente';
      await (antigo?FC_gravarCampos:FC_criarEspelho)(id,doc,antigo?FC_CAMPOS_DADOS.concat('grupo','descricaoAuto',...(mudouPagamento?['cobrancaStatus']:[]))
        :FC_CAMPOS_DADOS.concat(FC_CAMPOS_DELA,'grupo','descricaoAuto','criadoEm','fiscalIds','fiscalValor'));
      FC_dados[id]=doc;
      await FC_limparOrfaos(id,doc.lancamentoIds||[]);
      feitos.push({id,cliente,novo:!antigo,valor:doc.valor,recebido:doc.recebido,saldo:doc.saldo,
        divergencia:div,diarias:doc.itens.length,motivo:motivo||'lancamento',
        pagouAgora:!!(antigo&&antigo.saldo>0&&doc.saldo===0),
        parcial:!!(antigo&&doc.recebido>antigo.recebido&&doc.saldo>0)});
    }catch(e){console.warn('FC_espelhar',chave,e.message);erros.push(cliente+': '+e.message);}
  }
  // Um grupo com problema não impede os outros de serem atualizados (24/11: um erro
  // num cliente travava a autocorreção de todos, em silêncio).
  if(erros.length){const e=Error(erros.join(' · '));e.feitos=feitos;throw e;}
  return feitos;
}

// ── Sincronizar o administrativo: UMA ação, três trabalhos ─────────────────
// O Will decide tudo na aba 👥 Clientes. Daqui para a frente o espelho é
// automático; este botão existe para alcançar o que ficou para trás.
function FC_diagnostico(){
  const fichas=(typeof CFI_lista==='function'?CFI_lista():[]);
  const ocupados=FC_ocupados();
  const faltam={}, sobram={}, comNota=[];
  (R_todosOsDados||[]).forEach(r=>{
    if(!r.cliente||!(Number(r.valorTotal)>0)||r.naoFaturavel||!WENFechamentos.noPeriodo(r))return;
    if(ocupados.has(String(r.id)))return;
    if(!CFI_liberavel(CFI_casar(r.cliente,fichas)))return;
    faltam[r.cliente]=(faltam[r.cliente]||0)+1;
  });
  Object.values(FC_dados).forEach(f=>{
    if(!f||!f.cliente)return;
    if(CFI_liberavel(CFI_casar(f.cliente,fichas)))return;
    const emitiu=f.fiscalStatus==='emitida'||f.nfSinalStatus==='emitida'||f.nfSaldoStatus==='emitida';
    if(emitiu){comNota.push(f.cliente);return;}
    sobram[f.cliente]=(sobram[f.cliente]||0)+1;
  });
  return {
    faltam:Object.entries(faltam).map(([c,q])=>({cliente:c,qtd:q})).sort((a,b)=>b.qtd-a.qtd),
    sobram:Object.entries(sobram).map(([c,q])=>({cliente:c,qtd:q})).sort((a,b)=>b.qtd-a.qtd),
    comNota:[...new Set(comNota)],
    total:Object.keys(FC_dados).length
  };
}
async function FC_sincronizar(){
  if(FC_salvando)return;FC_salvando=true;
  const btn=document.getElementById('cfiSync'); if(btn){btn.disabled=true;btn.textContent='Sincronizando…';}
  try{
    if(!await CFI_carregar())throw Error('Não consegui ler o cadastro de clientes.');
    if(!await FC_carregar())throw Error('Não consegui ler os fechamentos.');
    const d=FC_diagnostico();
    const nFaltam=d.faltam.reduce((a,g)=>a+g.qtd,0), nSobram=d.sobram.reduce((a,g)=>a+g.qtd,0);
    const partes=[];
    if(nFaltam)partes.push('• ENTRAM: '+nFaltam+' diária(s) de '+d.faltam.length+' cliente(s)\n  '
      +d.faltam.slice(0,6).map(g=>g.cliente).join(', ')+(d.faltam.length>6?'…':''));
    if(nSobram)partes.push('• SAEM: '+nSobram+' fechamento(s) de '+d.sobram.length+' cliente(s)\n  '
      +d.sobram.slice(0,6).map(g=>g.cliente).join(', ')+(d.sobram.length>6?'…':''));
    if(d.comNota.length)partes.push('• FICAM (têm nota emitida): '+d.comNota.join(', '));
    partes.push('• Os demais são atualizados com a ficha de agora.');
    if(!confirm('Sincronizar o administrativo com as fichas:\n\n'+partes.join('\n\n')+'\n\nConfirma?')){return;}

    let entraram=0, saíram=0, atualizados=0;
    // 1) o que falta entrar
    for(const g of d.faltam){
      const regs=(R_todosOsDados||[]).filter(r=>r.cliente===g.cliente&&Number(r.valorTotal)>0
        &&!r.naoFaturavel&&WENFechamentos.noPeriodo(r));
      if(regs.length){const f=await FC_espelhar(regs,'sincronizar');entraram+=f.length;await AV_criar(f);}
    }
    // 2) o que precisa sair, e 3) o resto atualiza
    for(const c of [...new Set(Object.values(FC_dados).map(f=>f&&f.cliente).filter(Boolean))]){
      if(!CFI_liberavel(CFI_casar(c,CFI_lista()))){const r=await FC_removerCliente(c);saíram+=r.removidos;continue;}
      const regs=(R_todosOsDados||[]).filter(r=>r.cliente===c&&Number(r.valorTotal)>0
        &&!r.naoFaturavel&&WENFechamentos.noPeriodo(r));
      if(regs.length){await FC_espelhar(regs,'sincronizar');atualizados++;}
    }
    if(typeof CFI_render==='function')CFI_render();
    toast('🔄 '+atualizados+' cliente(s) atualizados'+(entraram?' · '+entraram+' entraram':'')
      +(saíram?' · '+saíram+' saíram':'')+'.',undefined,6000);
  }catch(e){toast(e.message,'#ef4444');}
  finally{FC_salvando=false;const b=document.getElementById('cfiSync');
    if(b){b.disabled=false;b.textContent='🔄 Sincronizar o administrativo';}}
}

// Reaplica as fichas em TODOS os fechamentos de uma vez.
// Existe porque a ficha só era reaplicada no instante do clique no chip: quem foi
// marcado antes, ou numa aba que já estava aberta, ficava com o valor velho —
// "nota pendente" num cliente que o Will já tinha desmarcado.
async function FC_reaplicarFichas(){
  if(FC_salvando)return;FC_salvando=true;
  const btn=document.getElementById('fcReaplicar'); if(btn)btn.disabled=true;
  try{
    if(!await CFI_carregar())throw Error('Não consegui ler o cadastro de clientes.');
    if(!await FC_carregar())throw Error('Não consegui ler os fechamentos.');
    const clientes=[...new Set(Object.values(FC_dados).map(f=>f&&f.cliente).filter(Boolean))];
    let tocados=0, saíram=0, comNota=0;
    for(const c of clientes){
      const ficha=CFI_casar(c,CFI_lista());
      if(!CFI_liberavel(ficha)){
        const r=await FC_removerCliente(c);saíram+=r.removidos;comNota+=r.mantidos.length;continue;
      }
      const regs=(R_todosOsDados||[]).filter(r=>r.cliente===c&&Number(r.valorTotal)>0
        &&!r.naoFaturavel&&WENFechamentos.noPeriodo(r));
      if(regs.length){await FC_espelhar(regs,'reaplicar');tocados++;}
    }
    FC_render();
    toast('🔄 '+tocados+' cliente(s) atualizados'+(saíram?' · '+saíram+' fechamento(s) saíram':'')
      +(comNota?' · '+comNota+' ficaram por ter nota emitida':'')+'.');
  }catch(e){toast(e.message,'#ef4444');}
  finally{FC_salvando=false;const b=document.getElementById('fcReaplicar');if(b)b.disabled=false;}
}

// Quem está na tela dela hoje e NÃO deveria estar: desmarcados nos dois chips.
// A remoção automática só vale dali para a frente; isto limpa o que ficou para trás.
function FC_naoAtendidos(){
  const fichas=(typeof CFI_lista==='function'?CFI_lista():[]), por={};
  Object.values(FC_dados).forEach(f=>{
    if(!f||!f.cliente)return;
    if(CFI_liberavel(CFI_casar(f.cliente,fichas)))return;
    const emitiu=f.fiscalStatus==='emitida'||f.nfSinalStatus==='emitida'||f.nfSaldoStatus==='emitida';
    const g=por[f.cliente]=por[f.cliente]||{cliente:f.cliente,qtd:0,valor:0,comNota:0};
    g.qtd++; g.valor+=Number(f.valor)||0; if(emitiu)g.comNota++;
  });
  return Object.values(por).sort((a,b)=>b.valor-a.valor);
}
async function FC_limparNaoAtendidos(){
  const lista=FC_naoAtendidos();
  if(!lista.length){toast('Nada a limpar — todo mundo na tela dela está marcado.');return;}
  const total=lista.reduce((a,g)=>a+g.qtd,0), comNota=lista.reduce((a,g)=>a+g.comNota,0);
  const texto='Tirar da tela do administrativo:\n\n'
    +lista.map(g=>'• '+g.cliente+' — '+g.qtd+' fechamento(s) · '+fmt(g.valor)+(g.comNota?' ('+g.comNota+' com nota emitida, FICA)':'')).join('\n')
    +'\n\n'+(total-comNota)+' de '+total+' serão apagados.'+(comNota?' Os com nota emitida permanecem.':'')+'\n\nConfirma?';
  if(!confirm(texto))return;
  let n=0;
  for(const g of lista){const r=await FC_removerCliente(g.cliente);n+=r.removidos;}
  FC_render();
  toast('🧹 '+n+' fechamento(s) saíram do administrativo.');
}

// O Will desmarcou nota E cobrança de um cliente: tira o que já estava na tela dela.
// Fechamento COM NOTA EMITIDA nao e apagado - fica, como no caso do orfao: sumir
// calado com algo que ja virou nota fiscal seria pior que o problema.
async function FC_removerCliente(nome){
  if(!nome)return {removidos:0,mantidos:[]};
  const alvo=CFI_slug(nome);
  const meus=Object.values(FC_dados).filter(f=>f&&CFI_slug(f.cliente||'')===alvo);
  let removidos=0; const mantidos=[];
  for(const f of meus){
    const emitiu=f.fiscalStatus==='emitida'||f.nfSinalStatus==='emitida'||f.nfSaldoStatus==='emitida';
    if(emitiu){mantidos.push(f.cliente);continue;}
    try{
      const res=await fetch(FS_URL+'/administrativo_fechamentos/'+encodeURIComponent(f.id)+'?key='+FB_API_KEY,{method:'DELETE'});
      if(res.ok||res.status===404){delete FC_dados[f.id];removidos++;}
    }catch(e){console.warn('FC_removerCliente',f.id,e.message);}
  }
  return {removidos,mantidos};
}

// Chamado quando a ficha muda: tira da tela dela se deixou de ser atendido, e
// traz de volta se voltou a ser.
async function FC_aoMudarFicha(nome){
  try{
    if(typeof CFI_lista!=='function'||!nome)return;
    if(!FC_ok&&!await FC_carregar())return;
    const ficha=CFI_casar(nome,CFI_lista());
    if(!CFI_liberavel(ficha)){
      const r=await FC_removerCliente(nome);
      if(r.removidos)toast('🚫 '+nome+' saiu do administrativo ('+r.removidos+' fechamento(s)).');
      if(r.mantidos.length)toast('⚠️ '+nome+' tem nota emitida — esse fechamento ficou na tela dela.','#f59e0b',7000);
      return;
    }
    const regs=(R_todosOsDados||[]).filter(r=>r.cliente===nome&&Number(r.valorTotal)>0&&!r.naoFaturavel&&WENFechamentos.noPeriodo(r));
    if(regs.length){const feitos=await FC_espelhar(regs,'ficha');if(feitos.length)await AV_criar(feitos);}
  }catch(e){console.warn('FC_aoMudarFicha',e.message);}
}

// Uma diária só pode viver em UM fechamento. Se ela aparece em outro — porque o cliente
// foi renomeado, o agrupamento da ficha mudou de mensal para diária, ou a diária trocou de
// mês — aquele outro é refeito sem ela, e some se ficar vazio.
async function FC_limparOrfaos(idAtual,ids){
  if(!ids.length)return;
  const meus=new Set(ids.map(String));
  for(const outro of Object.values(FC_dados)){
    if(!outro||outro.id===idAtual)continue;
    const restantes=(outro.lancamentoIds||[]).filter(x=>!meus.has(String(x)));
    if(restantes.length===(outro.lancamentoIds||[]).length)continue;   // não tinha nada meu
    try{
      if(!restantes.length){await FC_removerGrupo(outro.grupo,outro);continue;}
      const regs=(R_todosOsDados||[]).filter(r=>restantes.includes(String(r.id)));
      if(!regs.length){await FC_removerGrupo(outro.grupo,outro);continue;}
      const ficha=CFI_casar(outro.cliente,(typeof CFI_lista==='function'?CFI_lista():[]));
      const novo=WENFechamentos.criar(regs,ficha||{});
      const doc={...outro,...novo,id:outro.id,grupo:outro.grupo,atualizadoEm:new Date().toISOString()};
      FC_CAMPOS_DELA.forEach(k=>{if(outro[k]!==undefined)doc[k]=outro[k];});
      await FC_gravarCampos(outro.id,doc,FC_CAMPOS_DADOS);
      FC_dados[outro.id]=doc;
    }catch(e){console.warn('FC_limparOrfaos',outro.id,e.message);}
  }
}

// Grupo ficou sem diária: some, a menos que já tenha nota — aí fica com a divergência.
async function FC_removerGrupo(chave,antigo){
  if(!antigo)return;
  const emitiu=antigo.fiscalStatus==='emitida'||antigo.nfSinalStatus==='emitida'||antigo.nfSaldoStatus==='emitida';
  if(emitiu){
    const doc={...antigo,divergencia:{valorNota:Number(antigo.fiscalValor??antigo.valor)||0,valorAtual:0,em:new Date().toISOString()},atualizadoEm:new Date().toISOString()};
    await FC_gravarCampos(antigo.id,doc,['divergencia','atualizadoEm']);
    FC_dados[antigo.id]=doc;return;
  }
  const res=await fetch(`${FS_URL}/administrativo_fechamentos/${encodeURIComponent(antigo.id)}?key=${FB_API_KEY}`,{method:'DELETE'});
  if(res.ok||res.status===404){
    delete FC_dados[antigo.id];FC_idsBrutos.delete(antigo.id);
    // Sinal para a tela dela tirar o card sem reler tudo (ela só busca o que mudou).
    try{const em=new Date().toISOString(), sinal={tipo:'removido',fechamentoId:antigo.id,cliente:antigo.cliente||'',texto:'',criadoEm:em,lidoEm:em};
      const fields={};Object.entries(sinal).forEach(([k,v])=>fields[k]=toFV(v));
      await fetch(`${FS_URL}/${AV_COL}/${encodeURIComponent('removido-'+antigo.id+'-'+em.slice(0,10))}?key=${FB_API_KEY}`,
        {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});}catch(e){}
    // Auditoria 24/11: o vínculo da diária ficava para trás (38 órfãos) e impedia a diária de
    // voltar a ter cobrança — a criação exige que o vínculo não exista.
    const ocupados=FC_ocupados();
    for(const lid of antigo.lancamentoIds||[])if(!ocupados.has(String(lid)))
      try{await fetch(`${FS_URL}/administrativo_vinculos/${encodeURIComponent(lid)}?key=${FB_API_KEY}`,{method:'DELETE'});}catch(e){}
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AV_ — avisos para o administrativo, no espírito da Central WEN de Produção:
// ela não escreve, só recebe, abre e marca como lido.
// ══════════════════════════════════════════════════════════════════════════════
const AV_COL='administrativo_avisos';
function AV_texto(f){
  const v=x=>WENFechamentos.money(Number(x)||0);
  if(f.divergencia)return {tipo:'divergencia',
    texto:'⚠️ '+f.cliente+' — a nota saiu por '+v(f.divergencia.valorNota)+' e a diária agora está '+v(f.divergencia.valorAtual)+'. Não emita outra sem falar com o Will.'};
  if(f.pagouAgora)return {tipo:'pago',texto:'✅ '+f.cliente+' — pagamento confirmado, '+v(f.valor)+'. Nada mais a cobrar.'};
  if(f.parcial)return {tipo:'parcial',texto:'💰 '+f.cliente+' — entrou um pagamento. Falta '+v(f.saldo)+'.'};
  if(f.novo)return {tipo:'novo',texto:'🧾 '+f.cliente+' — '+f.diarias+(f.diarias===1?' diária':' diárias')+' · '+v(f.valor)+'. Pronto para nota e cobrança.'};
  return {tipo:'mudou',texto:'✏️ '+f.cliente+' — o fechamento mudou: '+f.diarias+(f.diarias===1?' diária':' diárias')+' · '+v(f.valor)+'.'};
}
// Um aviso por fechamento por dia e por tipo: id fixo evita encher a tela dela de
// repetido quando o Will mexe no mesmo lançamento cinco vezes seguidas.
async function AV_criar(feitos){
  const dia=new Date().toISOString().slice(0,10);
  for(const f of feitos){
    try{
      const {tipo,texto}=AV_texto(f);
      if(tipo==='mudou'&&!f.divergencia)continue;        // mexida sem consequência não vira aviso
      const id=tipo+'-'+f.id+'-'+dia;
      const doc={tipo,texto,fechamentoId:f.id,cliente:f.cliente,valor:f.valor,saldo:f.saldo,
        criadoEm:new Date().toISOString(),lidoEm:''};
      const fields={};Object.entries(doc).forEach(([k,v])=>fields[k]=toFV(v));
      await fetch(`${FS_URL}/${AV_COL}/${encodeURIComponent(id)}?key=${FB_API_KEY}`,
        {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields})});
    }catch(e){console.warn('AV_criar',e.message);}
  }
}

// O gancho único que o Receber chama: espelha e avisa. Falha aqui NUNCA derruba o
// salvamento do lançamento — o Receber é a verdade, o espelho é consequência.
async function FC_aoSalvarLancamento(reg,motivo){
  try{
    if(typeof CFI_lista!=='function'||!reg)return;
    if(!CFI_ok&&!await CFI_carregar())throw Error('Cadastro de clientes indisponível');
    if(!FC_ok&&!await FC_carregar())throw Error('Fechamentos indisponíveis');
    const feitos=await FC_espelhar(reg,motivo);
    if(feitos.length)await AV_criar(feitos);
    if(feitos.some(f=>f.divergencia))toast('⚠️ Nota já emitida com outro valor — confira os Avisos.','#f59e0b');
  }catch(e){console.warn('FC_aoSalvarLancamento',e.message);toast('Diária salva, mas o administrativo não foi atualizado. Recarregue o financeiro para tentar novamente.','#ef4444',8000);}
}

// ══════════════════════════════════════════════════════════════════════════════
// AO VIVO NO FINANCEIRO (24/11, Will: "coloque") — o que a Natália faz na tela dela
// (registrar nota, marcar cobrada, "cliente disse que pagou", promessa) aparece aqui sem
// recarregar. A cada 30 s, com a aba visível, UMA consulta com limit 1 pergunta se alguma
// cobrança mudou depois da mais recente que este financeiro conhece (o que ele mesmo grava
// já entra nessa marca). Mudou: relê as cobranças, avisa o que ela fez e redesenha a aba.
// ══════════════════════════════════════════════════════════════════════════════
// Freio de segurança: leituras que o financeiro faz SOZINHO no dia (só as do "ao vivo").
// Passou do teto, a conferência automática para até amanhã e avisa uma vez.
const FC_FREIO_TETO=12000, FC_FREIO_KEY='wen_fin_leituras_auto';
function FC_freioLer(){try{const o=JSON.parse(localStorage.getItem(FC_FREIO_KEY)||'{}');return o.dia===FC_hojeIso()?(Number(o.n)||0):0;}catch(e){return 0;}}
function FC_freioSomar(n){try{localStorage.setItem(FC_FREIO_KEY,JSON.stringify({dia:FC_hojeIso(),n:FC_freioLer()+(Number(n)||0)}));}catch(e){}}
function FC_freioAtivo(){return FC_freioLer()>=FC_FREIO_TETO;}
const FC_LIMITE_MUDADOS=60;
// Traz SÓ as cobranças alteradas depois da mais recente que este financeiro conhece
// (antes: perguntava "mudou?" e relia as ~40). Parado, custa 1 leitura.
async function FC_buscarMudados(){
  const body={structuredQuery:{from:[{collectionId:'administrativo_fechamentos'}],
    where:{fieldFilter:{field:{fieldPath:'atualizadoEm'},op:'GREATER_THAN',value:{stringValue:FC_maisRecente}}},limit:FC_LIMITE_MUDADOS}};
  const res=await fetch(`${FS_URL}:runQuery?key=${FB_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!res.ok)return [];
  const j=await res.json();
  const ds=(Array.isArray(j)?j:[]).filter(x=>x&&x.document).map(x=>{
    const o={};Object.entries(x.document.fields||{}).forEach(([k,v])=>o[k]=fromFV(v));
    o.id=String(x.document.name).split('/').pop();return o;});
  FC_freioSomar(Math.max(1,ds.length));
  return ds;
}
// Encaixa as alteradas no que já está em memória. Devolve o antes/depois das que mudaram.
function FC_mesclar(ds){
  const antes={},depois={};
  for(const d of ds){
    FC_idsBrutos.add(d.id);FC_marcarRecente(d.atualizadoEm);
    if(!(d.itens&&d.itens.length&&d.itens.every(WENFechamentos.noPeriodo)))continue;
    const atual=FC_dados[d.id];
    if(atual){antes[d.id]=atual;FC_dados[d.id]={...d,historicoDuplicados:atual.historicoDuplicados||[]};depois[d.id]=FC_dados[d.id];continue;}
    // desconhecida aqui: só entra se não for a duplicada escondida de uma que já está
    const chave=WENFechamentos.chaveDiarias(d);
    if(Object.values(FC_dados).some(f=>WENFechamentos.chaveDiarias(f)===chave))continue;
    FC_dados[d.id]={...d,historicoDuplicados:[]};
  }
  return {antes,depois};
}
// O que mudou nos campos DELA entre duas leituras. Função pura.
function FC_oQueElaFez(antes,depois){
  const frases=[];
  for(const f of Object.values(depois||{})){
    const a=(antes||{})[f.id];if(!a)continue;
    const nA=(a.notasEmitidas||[]).length, nD=(f.notasEmitidas||[]).length;
    if(nD>nA)frases.push('🧾 Nota '+(f.notasEmitidas[nD-1].numero||'')+' registrada — '+f.cliente);
    else if(a.fiscalStatus!=='emitida'&&f.fiscalStatus==='emitida')frases.push('🧾 Nota '+(f.nfNumero||'')+' registrada — '+f.cliente);
    if(a.cobrancaStatus!==f.cobrancaStatus){
      if(f.cobrancaStatus==='enviada')frases.push('📨 Cobrança enviada — '+f.cliente);
      else if(f.cobrancaStatus==='informado')frases.push('💬 '+f.cliente+' disse que pagou — confira no banco e dê a baixa');
    }
    if(f.promessaData&&f.promessaData!==(a.promessaData||''))frases.push('🤝 '+f.cliente+' prometeu pagar em '+String(f.promessaData).split('-').reverse().slice(0,2).join('/'));
  }
  return frases;
}
let FC_freioAvisou=false;
async function FC_conferirMudancas(){
  if(!FC_ok||FC_salvando||FC_emEspelho||FC_conferindo)return [];
  if(FC_freioAtivo()){
    if(!FC_freioAvisou){FC_freioAvisou=true;toast('⏸ Atualização automática do fiscal pausada por hoje (limite de segurança de leituras). Recarregue a página para ver o que a Natália fez.','#b45309',9000);}
    return [];
  }
  FC_conferindo=true;
  try{
    const ds=await FC_buscarMudados();
    if(!ds.length)return [];
    if(FC_emEspelho)return [];                       // começou um espelho enquanto perguntava: fica para a próxima
    let frases;
    if(ds.length>=FC_LIMITE_MUDADOS){                // mudou coisa demais: relê tudo de uma vez
      const antes=FC_dados;if(!await FC_carregar())return [];
      FC_freioSomar(FC_idsBrutos.size);frases=FC_oQueElaFez(antes,FC_dados);
    }else{const m=FC_mesclar(ds);frases=FC_oQueElaFez(m.antes,m.depois);}
    if(frases.length)toast(frases.slice(0,2).join(' · ')+(frases.length>2?' · +'+(frases.length-2):''),'#1e3a8a',9000);
    // redesenha a aba de notas se ela estiver aberta — menos se o Will estiver digitando nela
    try{
      const pg=document.getElementById('page-notas'), el=document.activeElement;
      const digitando=el&&pg&&pg.contains(el)&&/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
      if(pg&&pg.classList.contains('active')&&!digitando&&!document.querySelector('dialog[open]')&&typeof NF_montar==='function')NF_montar();
    }catch(e){}
    return frases;
  }catch(e){console.warn('FC_conferirMudancas',e.message);return [];}
  finally{FC_conferindo=false;}
}
if(typeof setInterval!=='undefined'&&typeof document!=='undefined'&&(typeof SIMULACAO_LOCAL==='undefined'||!SIMULACAO_LOCAL))
  setInterval(()=>{if(document.visibilityState==='visible')FC_conferirMudancas();},30000);

// Compara objetos sem depender da ordem das chaves (o Firestore não preserva a ordem).
function FC_canon(o){return JSON.stringify(Object.keys(o||{}).sort().map(k=>[k,o[k]==null?'':o[k]]));}
// Cobranças cujas diárias não existem mais no Receber. Só CANDIDATAS: a lista local pode
// estar incompleta, então cada uma é confirmada no Firebase antes de qualquer remoção.
function FC_fantasmas(){
  const vivos=new Set((R_todosOsDados||[]).filter(r=>!r.excluido).map(r=>String(r.id)));
  return Object.values(FC_dados).filter(f=>(f.lancamentoIds||[]).length&&!(f.lancamentoIds||[]).some(i=>vivos.has(String(i))));
}
async function FC_limparFantasmas(){
  let n=0;
  for(const f of FC_fantasmas()){
    try{
      let todasFora=true;
      for(const lid of f.lancamentoIds){
        const r=await fetch(`${FS_URL}/lancamentos/${encodeURIComponent(lid)}?key=${FB_API_KEY}`);
        if(r.status===404)continue;
        if(!r.ok){todasFora=false;break;}
        const campos=(await r.json()).fields||{};
        if(!(campos.excluido&&campos.excluido.booleanValue===true)){todasFora=false;break;}
      }
      if(todasFora){await FC_removerGrupo(f.grupo,f);n++;}
    }catch(e){console.warn('FC_limparFantasmas',f.id,e.message);}
  }
  return n;
}
// Vínculo (trava de duplicidade) que aponta para cobrança que não existe mais.
async function FC_limparVinculosOrfaos(){
  let n=0;
  try{
    const vinc=await CC_fbCarregar('administrativo_vinculos');
    for(const [lid,v] of Object.entries(vinc)){
      if(v&&v.fechamentoId&&FC_idsBrutos.has(v.fechamentoId))continue;
      const r=await fetch(`${FS_URL}/administrativo_vinculos/${encodeURIComponent(lid)}?key=${FB_API_KEY}`,{method:'DELETE'});
      if(r.ok)n++;
    }
  }catch(e){console.warn('FC_limparVinculosOrfaos',e.message);}
  return n;
}
function FC_desatualizados(){
  const porId=new Map((R_todosOsDados||[]).map(r=>[String(r.id),r]));
  const c=v=>Math.round((Number(v)||0)*100);
  const fora=[];
  for(const f of Object.values(FC_dados)){
    const regs=(f.lancamentoIds||[]).map(id=>porId.get(String(id))).filter(r=>r&&!r.excluido);
    if(!regs.length)continue;
    const rec=regs.reduce((s,r)=>s+c(r.valorReserva),0), tot=regs.reduce((s,r)=>s+c(r.valorTotal),0);
    // 24/11: além do pagamento, valor e vencimento — a edição no Receber ia para a diária
    // errada e o vencimento novo (Vendendo Valor, 24/11) nunca chegava.
    let venc=f.vencimento||'', cond=f.condicao||'avista', nome=f.cliente, retrato=FC_canon(f.clienteFiscal);
    try{const n=WENFechamentos.criar(regs,CFI_casar(regs[0].cliente,(typeof CFI_lista==='function'?CFI_lista():[]))||{});
      venc=n.vencimento||'';cond=n.condicao||'avista';nome=n.cliente;retrato=FC_canon(n.clienteFiscal);}catch(e){}
    if(rec!==c(f.recebido)||tot-rec!==c(f.saldo)||tot!==c(f.valor)||venc!==(f.vencimento||'')||cond!==(f.condicao||'avista')
       ||nome!==f.cliente||retrato!==FC_canon(f.clienteFiscal))fora.push(...regs);
  }
  return fora;
}
async function FC_sincronizarPendentes(){
  if(!await CFI_carregar()||!await FC_carregar())return;
  const ocupados=FC_ocupados();
  const pendentes=(R_todosOsDados||[]).filter(r=>!r.excluido&&r.cliente&&Number(r.valorTotal)>0&&WENFechamentos.noPeriodo(r)&&!ocupados.has(String(r.id)));
  // Autocorreção (24/11): a baixa feita por um caminho que não avisava o administrativo
  // (botão ✅ recebido, conciliação pelo extrato) deixava o espelho com o pagamento velho.
  // Ao abrir o financeiro, todo fechamento cujo recebido/saldo diverge do Receber é refeito.
  FC_desatualizados().forEach(r=>{if(!pendentes.includes(r))pendentes.push(r);});
  console.info('Administrativo: '+pendentes.length+' diária(s) a espelhar ao abrir');
  // Faxina (auditoria 24/11): cobrança de diária excluída e vínculo órfão. Não derruba o resto.
  try{const nf=await FC_limparFantasmas();if(nf)toast('🧹 '+nf+' cobrança(s) de diária excluída saíram do administrativo.');}catch(e){}
  try{await FC_limparVinculosOrfaos();}catch(e){}
  // Quem não tem nota NEM cobrança não fica na tela dela (24/11). Cobrança com nota emitida
  // permanece — sumir calado com algo que virou nota fiscal seria pior.
  try{let n=0;for(const g of FC_naoAtendidos()){const r=await FC_removerCliente(g.cliente);n+=r.removidos;}
    if(n)toast('🧹 '+n+' cobrança(s) de cliente sem nota e sem cobrança saíram do administrativo.');}catch(e){}
  if(!pendentes.length)return;
  let feitos=[],erro=null;
  try{feitos=await FC_espelhar(pendentes,'automatico');}catch(e){erro=e;feitos=e.feitos||[];}
  if(feitos.length){await AV_criar(feitos);toast('🔄 Administrativo atualizado: '+feitos.length+' cobrança(s).');}
  if(erro)throw erro;
}
