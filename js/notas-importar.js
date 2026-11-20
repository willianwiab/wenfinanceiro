// Importar notas da Prefeitura (CSV NFSe_E_*) para a aba Notas Fiscais — com PRÉVIA.
// Só LÊ o Receber. Escreve apenas documentos NOVOS em `notas_fiscais` (nunca PATCH em existente).
// Parser puro em js/notas-prefeitura.js (NFP).
(function(){
  let LINHAS=[];            // {n, combos:[{ids,rotulo}], sel, marcar, motivo, ja}
  const esc=t=>NF_esc(t);
  const MAXCAND=16;

  // Todas as combinações de diárias do cliente cuja soma = valor da nota (menor nº de diárias primeiro).
  function combos(cands,valor){
    const out=[], alvo=Math.round(valor*100), v=cands.map(r=>Math.round((Number(r.valorTotal)||0)*100));
    (function rec(i,soma,esc){ if(soma===alvo&&esc.length){out.push(esc.slice());return;}
      if(i>=cands.length||soma>alvo||out.length>=12)return;
      esc.push(i); rec(i+1,soma+v[i],esc); esc.pop(); rec(i+1,soma,esc); })(0,0,[]);
    return out.sort((a,b)=>a.length-b.length).map(ix=>ix.map(i=>cands[i]));
  }
  function candidatas(nota){
    const fichas=CFI_lista(), alvo=CFI_casar(nota.cliente,fichas);
    const ja=NF_idsFaturados(), oc=FC_ocupados();
    const mesNota=nota.dataISO.slice(0,7);
    return (R_todosOsDados||[]).filter(r=>WENFechamentos.noPeriodo(r)&&Number(r.valorTotal)>0
      &&!ja.has(String(r.id))&&!oc.has(String(r.id))
      &&((alvo&&CFI_casar(r.cliente,fichas)===alvo)||NF_nome(r.cliente)===NF_nome(nota.cliente)))
      // só diárias até o mês da emissão: nota não fatura gravação de mês futuro
      .filter(r=>WENFechamentos.mesChave(r.mes)<=mesNota)
      .sort((a,b)=>String(b.mes).localeCompare(String(a.mes))||String(b.data||'').localeCompare(String(a.data||'')))
      .slice(0,MAXCAND);
  }
  function NF_nome(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
  const rot=r=>(r.data||'-')+' '+r.mes+' · '+(r.horas||0)+'h · '+(r.studio||'')+' · '+fmt(Number(r.valorTotal)||0);

  function analisar(notas){
    const existentes={...NF_NOTAS}; FC_notas().forEach((n,i)=>{existentes['fc'+i]=n;});
    const {novas,repetidas}=NFP.separar(notas,existentes);
    const linhas=repetidas.map(n=>({n,ja:true,combos:[],sel:-1,marcar:false,motivo:'já registrada ('+n.jaExiste+')'}));
    const usados=new Set();   // diária só entra numa nota por importação
    novas.sort((a,b)=>a.dataISO.localeCompare(b.dataISO)||a.numero-b.numero).forEach(n=>{
      if(n.status==='cancelada'){linhas.push({n,combos:[],sel:-1,marcar:true,motivo:'cancelada — entra só como registro, sem diárias'});return;}
      if(n.dataISO.slice(0,7)<'2026-10'){linhas.push({n,combos:[],sel:-1,marcar:false,motivo:'antes de out/2026 (fora do período do módulo)'});return;}
      const cs=combos(candidatas(n).filter(r=>!usados.has(String(r.id))),n.valor);
      const L={n,combos:cs,sel:cs.length?0:-1,marcar:cs.length===1,
        motivo:cs.length===1?'vínculo único':cs.length>1?cs.length+' combinações — escolha':'sem diárias que somem '+fmt(n.valor)};
      if(cs.length===1)cs[0].forEach(r=>usados.add(String(r.id)));
      linhas.push(L);
    });
    return linhas.sort((a,b)=>a.n.dataISO.localeCompare(b.n.dataISO)||a.n.numero-b.n.numero);
  }

  function desenhar(){
    const box=document.getElementById('nfImpLista'); if(!box)return;
    const n=LINHAS.filter(l=>l.marcar).length;
    box.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:.8rem"><thead><tr style="text-align:left;color:#6b7280"><th></th><th>Nº</th><th>Emissão</th><th>Cliente</th><th style="text-align:right">Valor</th><th>Diárias vinculadas</th></tr></thead><tbody>'
      +LINHAS.map((l,i)=>{const x=l.n,cor=l.ja?'#9ca3af':x.status==='cancelada'?'#b91c1c':'#111827';
        const vinc=l.ja?'<i>'+esc(l.motivo)+'</i>'
          :l.combos.length?'<select onchange="NFIMP_sel('+i+',this.value)" style="max-width:340px">'+l.combos.map((c,j)=>'<option value="'+j+'"'+(j===l.sel?' selected':'')+'>'+esc(c.map(rot).join(' + '))+'</option>').join('')+'</select>'
          :'<i style="color:#6b7280">'+esc(l.motivo)+'</i>';
        return '<tr style="border-top:1px solid #e5e7eb;color:'+cor+'"><td><input type="checkbox" '+(l.marcar?'checked ':'')+(l.ja?'disabled ':'')+'onchange="NFIMP_marca('+i+',this.checked)"></td><td>'+esc(x.numero)+'</td><td>'+esc(x.dataEmissao)+'</td><td>'+esc(x.cliente)+(x.status==='cancelada'?' 🚫':'')+'</td><td style="text-align:right">'+fmt(x.valor)+'</td><td>'+vinc+'</td></tr>';}).join('')
      +'</tbody></table>';
    document.getElementById('nfImpResumo').textContent=n+' de '+LINHAS.length+' marcadas · '+LINHAS.filter(l=>l.ja).length+' já existiam · nada é gravado até você clicar em Importar.';
    document.getElementById('nfImpOk').disabled=!n;
  }
  window.NFIMP_marca=(i,v)=>{
    const l=LINHAS[i];
    if(v&&l.n.status!=='cancelada'){ // sem vínculo escolhido, só marca com certeza explícita
      if(l.sel<0&&!confirm('A nota '+l.n.numero+' ficará SEM diárias vinculadas — as diárias dela continuarão na fila "A faturar" e poderão ser faturadas de novo. Marcar mesmo assim?')){desenhar();return;}}
    l.marcar=v;desenhar();};
  window.NFIMP_sel=(i,j)=>{LINHAS[i].sel=Number(j);};
  window.NFIMP_fechar=()=>document.getElementById('nfImpBg')?.remove();

  window.NFIMP_abrir=function(){
    if(!NF_ok){toast('A leitura da nuvem falhou — recarregue antes de importar.','#ef4444');return;}
    NFIMP_fechar();
    const bg=document.createElement('div'); bg.className='modal-bg open'; bg.id='nfImpBg';
    bg.innerHTML='<div class="modal" style="max-width:980px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Importar notas da Prefeitura</h2><button class="btn" onclick="NFIMP_fechar()">✕</button></div>'
      +'<p class="nf-sub">Escolha os CSV <b>NFSe_E_*.csv</b> exportados do portal. Vamos mostrar o que entra, o que já existe e a quais diárias cada nota se liga. Só diárias cujo total <b>bate com o valor da nota</b> são sugeridas.</p>'
      +'<input type="file" id="nfImpArq" accept=".csv" multiple onchange="NFIMP_ler(this.files)">'
      +'<div id="nfImpResumo" class="nf-sub" style="margin:8px 0"></div><div id="nfImpLista" style="max-height:52vh;overflow:auto"></div>'
      +'<div class="modal-actions"><button class="btn" onclick="NFIMP_fechar()">Cancelar</button><button class="btn btn-green" id="nfImpOk" disabled onclick="NFIMP_gravar()">Importar marcadas</button></div></div>';
    document.body.appendChild(bg);
  };
  window.NFIMP_texto=function(textos){   // separado de NFIMP_ler para teste sem arquivo
    let notas=[]; textos.forEach(t=>{notas=notas.concat(NFP.lerCSV(t).notas);});
    const vistos=new Set(); notas=notas.filter(n=>!vistos.has(n.numero)&&vistos.add(n.numero));
    LINHAS=analisar(notas); desenhar(); return LINHAS;
  };
  window.NFIMP_ler=async function(files){
    try{ const t=[]; for(const f of files)t.push(new TextDecoder('windows-1252').decode(await f.arrayBuffer()));
      NFIMP_texto(t);}catch(e){toast('CSV inválido: '+e.message,'#ef4444');}
  };
  window.NFIMP_gravar=async function(){
    const ja=NF_idsFaturados(), oc=FC_ocupados(); let feitas=0; const pulou=[];
    for(const l of LINHAS.filter(l=>l.marcar&&!l.ja)){
      const n=l.n, regs=(l.n.status==='cancelada'||l.sel<0)?[]:l.combos[l.sel];
      if(regs.some(r=>ja.has(String(r.id))||oc.has(String(r.id)))){pulou.push(n.numero);continue;}  // reconfere antes de gravar
      const meses=[...new Set(regs.map(r=>r.mes))].sort((a,b)=>WENFechamentos.mesChave(a).localeCompare(WENFechamentos.mesChave(b)));
      const id='nf'+Date.now()+Math.floor(Math.random()*9999);
      const nota={id,numero:n.numero,dataEmissao:n.dataEmissao,valor:n.valor,cliente:regs[0]?.cliente||n.cliente,cnpj:n.cnpj,
        link:'',descricao:'',obs:'Importada do CSV da Prefeitura de SP',origem:n.origem,
        mesIni:meses[0]||'',mesFim:meses[meses.length-1]||'',lancamentoIds:regs.map(r=>String(r.id)),gravacoes:regs.length,
        horas:Math.round(regs.reduce((a,r)=>a+(Number(r.horas)||0),0)*100)/100,
        status:n.status,criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};
      NF_NOTAS[id]=nota; regs.forEach(r=>ja.add(String(r.id)));
      await CC_fbSalvar(NF_COL,id,nota); feitas++;
      if(typeof AUD_log==='function')AUD_log('criar','notas_fiscais',nota.cliente||'','Nota importada (Prefeitura) nº '+nota.numero,null,nota.valor);
    }
    NFIMP_fechar(); NF_montar();
    toast('✅ '+feitas+' nota(s) importada(s).'+(pulou.length?' ⚠️ Puladas (diária já faturada): '+pulou.join(', '):''),pulou.length?'#d97706':undefined,8000);
  };
})();
