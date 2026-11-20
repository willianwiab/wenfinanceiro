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
let FC_loteTudo=false;
function FC_lote(){
  const ocupados=FC_ocupados(), fichas=(typeof CFI_lista==='function'?CFI_lista():[]), grupos={};
  // "tudo" = todo lançamento desde out/2026, independente do recorte de meses da tela.
  const base=FC_loteTudo
    ? (R_todosOsDados||[]).filter(r=>Number(r.valorTotal)>0&&WENFechamentos.noPeriodo(r))
    : (NF_lancamentosDoPeriodo()||[]);
  base.forEach(r=>{
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
  const chaveTudo=`<label class="nf-item" style="margin:10px 0"><input type="checkbox" id="fcLoteTudo" ${FC_loteTudo?'checked':''}>
     <span><b>Carregar tudo desde outubro/2026</b> — ignora o recorte de meses acima. Use uma vez, para trazer o que já existia.</span></label>`;
  if(!grupos.length)return chaveTudo+'<p class="nf-vazio">✅ Nada solto'+(FC_loteTudo?'':' neste recorte')+' — toda diária dos clientes atendidos pelo administrativo já está espelhada.</p>';
  const marcados=grupos.filter(g=>!FC_loteFora.has(g.cliente));
  const total=marcados.reduce((a,g)=>a+g.valor,0), diarias=marcados.reduce((a,g)=>a+g.regs.length,0);
  return `<div class="nf-resumo"><b>Diárias que ainda não chegaram no administrativo</b><br>
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
  root.innerHTML=`<div class="nf-resumo"><b>Fechamento por diária ou por período</b><br>As diárias aparecem automaticamente no administrativo após serem salvas no Receber. Selecione um cliente para consultar os fechamentos.<br><a href="administrativo.html" target="_blank" rel="noopener">Abrir área administrativa</a></div>
    ${!FC_ok?'<div class="nf-alerta erro">Não foi possível ler os fechamentos. Recarregue antes de continuar.</div>':''}
    ${!cliente?FC_loteHTML():`<label class="nf-item"><input type="checkbox" id="fcTodas"> Selecionar todas as diárias disponíveis do filtro</label><div id="fcDiarias">${regs.map(r=>`<label class="nf-item"><input type="checkbox" data-id="${esc(r.id)}" ${ocupados.has(String(r.id))?'disabled':FC_selecionados.has(String(r.id))?'checked':''}><span>${esc(NF_rotuloLanc(r))}${ocupados.has(String(r.id))?' · Já possui fechamento':''}</span></label>`).join('')}</div>
    <p>Incluir nas descrições:</p><div id="fcCampos" style="display:flex;gap:16px;flex-wrap:wrap">${[['data','Data'],['horas','Horas'],['studio','Estúdio'],['descricao','Descrição do serviço']].map(([k,v])=>`<label><input type="checkbox" value="${k}" checked> ${v}</label>`).join('')}</div><button class="btn btn-green" id="fcPreparar" ${FC_ok?'':'disabled'}>Preparar fechamento</button>`}
    <div id="fcEditor"></div><h3>Fechamentos liberados</h3>${historico.length?historico.map(f=>`<div class="nf-lin"><div class="nf-info"><b>${esc(f.cliente)}</b><div>${f.itens.length} diária(s) · ${esc(f.cobrancaStatus)} · ${f.exigeNota?'NF: '+esc(f.fiscalStatus):'NF não solicitada'}</div></div><a href="administrativo.html#${encodeURIComponent(f.id)}" target="_blank" rel="noopener">Abrir fechamento</a></div>`).join(''):'<p>Nenhum fechamento liberado para este cliente.</p>'}`;
  root.querySelectorAll('.fc-lote-cb').forEach(el=>el.onchange=()=>{
    el.checked?FC_loteFora.delete(el.dataset.cli):FC_loteFora.add(el.dataset.cli);FC_render();});
  const bl=document.getElementById('fcLiberarLote');if(bl)bl.onclick=FC_liberarLote;
  const bt=document.getElementById('fcLoteTudo');if(bt)bt.onchange=()=>{FC_loteTudo=bt.checked;FC_render();};
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
    const cob=f.cobrancaStatus==='informado'?'<span class="nf-pill pend">pagamento comunicado · conferir no Receber</span>':f.cobrancaStatus==='enviada'?'<span class="nf-pill">cobrança enviada</span>':'<span class="nf-pill pend">a cobrar</span>';
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
  'notaModo','exigeNota','atualizadoEm','divergencia','descricaoFiscal','descricaoCobranca'];
const FC_CAMPOS_DELA=['nfNumero','nfData','fiscalStatus','cobrancaStatus','enviadoEm','promessaData','promessaObs',
  'nfSinalNumero','nfSinalData','nfSinalStatus','nfSaldoNumero','nfSaldoData','nfSaldoStatus'];

// A chave do agrupamento sai da ficha: mensal junta o mês do cliente, "diaria" é uma por uma.
function FC_chaveGrupo(cliente,reg,ficha){
  const base=CFI_slug(cliente||'');
  return (ficha&&ficha.fechamentoPadrao==='diaria')
    ? 'd_'+base+'_'+String(reg.id)
    : 'm_'+base+'_'+WENFechamentos.mesChave(reg.mes);
}
// Achou um fechamento com esta chave? (grupo é guardado no próprio documento)
function FC_porGrupo(chave){return Object.values(FC_dados).find(f=>f.grupo===chave)||null;}

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
function FC_divergenciaDe(antigo,valorNovo){
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
}

// As diárias que compõem um grupo, lidas do Receber AGORA (o espelho é sempre do estado atual).
function FC_regsDoGrupo(chave,cliente,ficha){
  const todas=(R_todosOsDados||[]).filter(r=>r.cliente===cliente&&Number(r.valorTotal)>0&&WENFechamentos.noPeriodo(r));
  return todas.filter(r=>FC_chaveGrupo(cliente,r,ficha)===chave);
}

// ── O ESPELHO ────────────────────────────────────────────────────────────────
// Recebe os lançamentos que mudaram e refaz o(s) grupo(s) deles. Devolve o que fez,
// para os avisos. Nunca escreve no Receber.
async function FC_espelhar(regs,motivo){
  if(!Array.isArray(regs))regs=[regs];
  const fichas=(typeof CFI_lista==='function'?CFI_lista():[]);
  const grupos=new Map();
  regs.forEach(r=>{
    if(!r||!r.cliente||!(Number(r.valorTotal)>0)||!WENFechamentos.noPeriodo(r))return;
    const ficha=CFI_casar(r.cliente,fichas);
    // Todo cliente com diária entra automaticamente no administrativo.
    //                 // a ficha diz que ela não atende
    const chave=FC_chaveGrupo(r.cliente,r,ficha);
    if(!grupos.has(chave))grupos.set(chave,{cliente:r.cliente,ficha});
  });
  const feitos=[];
  for(const [chave,{cliente,ficha}] of grupos){
    try{
      const doGrupo=FC_regsDoGrupo(chave,cliente,ficha);
      const antigo=FC_porGrupo(chave);
      const id=antigo?antigo.id:chave;
      if(!doGrupo.length){await FC_removerGrupo(chave,antigo);continue;}
      const novo=WENFechamentos.criar(doGrupo,ficha||{});
      const textos=FC_preservarTexto(antigo,novo);
      const div=FC_divergenciaDe(antigo,novo.valor);
      const doc={...(antigo||{}),...novo,...textos,grupo:chave,id,
        atualizadoEm:new Date().toISOString(),divergencia:div||null};
      if(antigo)FC_CAMPOS_DELA.forEach(k=>{if(antigo[k]!==undefined)doc[k]=antigo[k];});
      else{doc.criadoEm=doc.atualizadoEm;}
      // Só a baixa do proprietário no Receber confirma ou reabre o pagamento.
      const mudouPagamento=antigo&&(Number(antigo.saldo)!==Number(doc.saldo)||Number(antigo.recebido)!==Number(doc.recebido));
      if(mudouPagamento)doc.cobrancaStatus=doc.saldo===0?'pago':antigo.cobrancaStatus==='pago'?'pendente':antigo.cobrancaStatus;
      await FC_gravarCampos(id,doc,antigo?FC_CAMPOS_DADOS.concat('grupo','descricaoAuto',...(mudouPagamento?['cobrancaStatus']:[]))
        :FC_CAMPOS_DADOS.concat(FC_CAMPOS_DELA,'grupo','descricaoAuto','criadoEm','cliente','clienteFiscal','fiscalIds','fiscalValor'));
      FC_dados[id]=doc;
      await FC_limparOrfaos(id,doc.lancamentoIds||[]);
      feitos.push({id,cliente,novo:!antigo,valor:doc.valor,recebido:doc.recebido,saldo:doc.saldo,
        divergencia:div,diarias:doc.itens.length,motivo:motivo||'lancamento',
        pagouAgora:!!(antigo&&antigo.saldo>0&&doc.saldo===0),
        parcial:!!(antigo&&doc.recebido>antigo.recebido&&doc.saldo>0)});
    }catch(e){console.warn('FC_espelhar',chave,e.message);}
  }
  return feitos;
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
  if(res.ok||res.status===404)delete FC_dados[antigo.id];
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

async function FC_sincronizarPendentes(){
  if(!await CFI_carregar()||!await FC_carregar())return;
  const ocupados=FC_ocupados();
  const pendentes=(R_todosOsDados||[]).filter(r=>!r.excluido&&r.cliente&&Number(r.valorTotal)>0&&WENFechamentos.noPeriodo(r)&&!ocupados.has(String(r.id)));
  if(pendentes.length){const feitos=await FC_espelhar(pendentes,'automatico');await AV_criar(feitos);}
}
