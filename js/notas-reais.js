// Números REAIS das notas (Prefeitura 408–427 + Emissor Nacional 1–10) e CNPJ dos clientes → administrativo/fiscal.
// 20/11/2026. Dados lidos do portal do governo e cruzados com o Will (ver financeiro/backups/fiscal-20261120/).
// NADA grava sozinho: abre uma PRÉVIA, o Will marca e clica em Aplicar.
// Escreve só: administrativo_fechamentos (campos de nota, com updateMask) e clientes_fiscais (doc/razaoSocial vazios).
// Nunca toca em Receber.
(function(root){
  // número → {data da emissão ISO, valor}
  const NOTAS={
    '408':['2026-09-23',6400],'409':['2026-09-24',1200],'410':['2026-09-25',7200],'411':['2026-09-30',2950],'413':['2026-09-30',4800],'414':['2026-09-30',6400],
    '415':['2026-10-01',5600],'416':['2026-10-02',8800],'417':['2026-10-07',4000],'418':['2026-10-08',2592],'419':['2026-10-08',2650],'420':['2026-10-09',1800],
    '421':['2026-10-22',1200],'422':['2026-10-23',1800],'423':['2026-10-28',7400],'424':['2026-11-02',8800],'425':['2026-11-03',1800],'426':['2026-11-03',7400],'427':['2026-11-18',5600],
    '1':['2026-11-04',3750],'2':['2026-11-11',1600],'4':['2026-11-11',4320],'5':['2026-11-11',3213],'6':['2026-11-17',1200],'7':['2026-11-18',2400],'8':['2026-11-18',3750],'9':['2026-11-18',5600],'10':['2026-11-18',1900]
  };
  // fechamento → notas reais. `falso` = número aleatório que está lá hoje (só troca se for exatamente esse).
  const PLANO=[
    {fech:'m_cartpanda_2026-10',falso:'3232',notas:[{n:'424'}],marca:true},
    {fech:'m_iaondeissovaidar_2026-10',falso:'00000427',notas:[{n:'427'}],marca:true},
    {fech:'m_makeone_2026-11',falso:'23123',notas:[{n:'2'}],marca:true},
    {fech:'m_peopleresults_2026-11',falso:'32312321',notas:[{n:'7'}],marca:true},
    {fech:'m_quintessa_2026-10',falso:'423412',notas:[{n:'420'},{n:'425'},{n:'6'}],marca:true,obs:'3 notas na mesma diária (1.800 + 1.800 + 1.200 = 4.800)'},
    {fech:'m_vendendovalor_2026-11',falso:'2331',notas:[{n:'4'}],marca:true},
    {fech:'m_zest_2026-10',falso:'54545',notas:[{n:'423',dia:'27/10'},{n:'426',dia:'29/10'}],marca:true},
    {fech:'m_iaondeissovaidar_2026-11',falso:'887878787',notas:[{n:'9'}],marca:false,aviso:'diária lançada em 5.400 e a nota é de 5.600 — corrija o Receber antes'},
    {fech:'m_oswaldocruz_2026-11',falso:'312321',notas:[{n:'5'}],marca:false,aviso:'nota 3.213 × diária 3.600 (diferença de 387) — decida antes'},
    {fech:'m_leadersbrief_2026-11',falso:'7676767',notas:[{n:'10'}],marca:true,obs:'Leaders Brief = Getronics (confirmado pelo Will, 20/11)'},
    {fech:'m_leadersbrief_2026-10',falso:'323213',notas:[{n:'419'}],marca:false,aviso:'nota 2.650 × diária 3.000 (diferença de 350) — decida antes'}
  ];
  // número falso sem nota real no governo → voltar a "pendente"
  const LIMPAR=[
    {fech:'m_biolab_2026-10',falso:'2323232'},
    {fech:'m_nube_2026-11',falso:'2323'},{fech:'m_podcastpositivo_2026-10',falso:'2321312'}
  ];
  // nome no sistema → CNPJ e razão social do governo
  const FICHAS=[
    ['ZEST','26.480.370/0001-67','ZEST MARKETING DE CONTEUDO E CONSULTORIA LTDA'],
    ['TIROLEZ','55.885.321/0001-02','LATICINIOS TIROLEZ LTDA'],
    ['CARTPANDA','46.698.364/0001-98','CARTPANDA TECNOLOGIA DE SOFTWARE LTDA'],
    ['NEUROPOST','37.967.519/0001-53','NEUROPOST LTDA'],
    ['QUINTESSA','17.549.693/0001-79','QUINTESSA ACELERADORA DE NEGOCIOS DE IMPACTO LTDA.'],
    ['SELLERS CAST','39.726.958/0001-08','FLOW'],
    ['IA ONDE ISSO VAI DAR','07.336.918/0001-55','REMER VILLACA & NOGUEIRA ASSESSORIA E CONSULTORIA DE PROPRIEDADE INTELECTUAL S/S'],
    ['VENDENDO VALOR','42.877.547/0001-10','STRUNZ BD TRUSTED ADVISORS LTDA'],
    ['MAKE ONE','57.229.601/0001-98','TELESUL TELECOMUNICACOES LTDA'],
    ['PEOPLE & RESULTS','12.267.263/0001-40','PEOPLE & RESULTS CONSULTORIA E TREINAMENTO EMPRESARIAL LTDA'],
    ['OSWALDO CRUZ','14.439.556/0001-93','CESAR A. SPADELLA AUDIOVISUAL'],
    ['DANNY UEDA','31.955.304/0001-36','DANNYELLE THAYS MITIE UEDA'],
    ['BIOLAB','49.475.833/0003-60','BIOLAB SANUS FARMACEUTICA LTDA'],
    ['PROA','08.172.505/0001-45','ASSOCIACAO INSTITUTO PROA'],
    ['LEADERS BRIEF','10.714.349/0001-49','CONNECTIS TECNOLOGIA DA INFORMACAO E COMUNICACAO DO BRASIL LTDA']
  ];

  const dig=s=>String(s||'').replace(/\D/g,'');
  const esc=t=>String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  // ── REGRAS PURAS (testáveis sem tela) ─────────────────────────────────────────
  // Decide o que fazer com cada fechamento do plano, dado o estado atual de `dados` (id → doc).
  function analisarFechamentos(dados){
    const out=[];
    const idsDe=(f,dia)=>(f.itens||[]).filter(i=>!dia||i.data===dia).map(i=>String(i.id));
    for(const p of PLANO){
      const f=dados[p.fech]; const base={tipo:'trocar',fech:p.fech,marca:!!p.marca,aviso:p.aviso||'',obs:p.obs||''};
      if(!f){out.push({...base,marca:false,ok:false,motivo:'fechamento não existe'});continue;}
      const reais=p.notas.map(x=>x.n);
      const atual=String(f.nfNumero||'').trim();
      const jaReal=reais.every(n=>(f.notasEmitidas||[]).some(e=>String(e.numero)===n));
      if(jaReal){out.push({...base,cliente:f.cliente,atual,marca:false,ok:false,motivo:'já tem as notas reais'});continue;}
      if(atual!==p.falso){out.push({...base,cliente:f.cliente,atual,marca:false,ok:false,motivo:'número atual ('+(atual||'vazio')+') não é o falso esperado ('+p.falso+') — não mexo'});continue;}
      const notas=p.notas.map(x=>{const [data,valor]=NOTAS[x.n];const ids=idsDe(f,x.dia);return {numero:x.n,data,ids,valor};});
      if(notas.some(n=>!n.ids.length)){out.push({...base,cliente:f.cliente,atual,marca:false,ok:false,motivo:'diária da nota não encontrada no fechamento'});continue;}
      out.push({...base,cliente:f.cliente,atual,ok:true,notas,
        novo:notas.map(n=>n.numero).join(', '),soma:Math.round(notas.reduce((a,n)=>a+n.valor,0)*100)/100,valorFech:f.valor});
    }
    for(const l of LIMPAR){
      const f=dados[l.fech]; const base={tipo:'limpar',fech:l.fech,marca:false,aviso:'sem nota real no governo: volta para "pendente"'};
      if(!f){out.push({...base,ok:false,motivo:'fechamento não existe'});continue;}
      const atual=String(f.nfNumero||'').trim();
      if(atual!==l.falso){out.push({...base,cliente:f.cliente,atual,ok:false,motivo:atual?'número atual ('+atual+') não é o falso esperado':'já está sem número'});continue;}
      out.push({...base,cliente:f.cliente,atual,ok:true,novo:'(vazio)'});
    }
    return out;
  }
  // Campos que vão no PATCH (e só estes entram no updateMask).
  function camposDe(a,agora){
    if(a.tipo==='limpar')return {notasEmitidas:[],nfNumero:'',nfData:'',fiscalStatus:'pendente',atualizadoEm:agora};
    const ult=a.notas.map(n=>n.data).sort().at(-1);
    return {notasEmitidas:a.notas.map(n=>({numero:n.numero,data:n.data,ids:n.ids,valor:n.valor,em:agora})),
      nfNumero:a.novo,nfData:ult,fiscalStatus:'emitida',atualizadoEm:agora};
  }
  // Fichas: preenche só o que está vazio; divergência fica sinalizada e desmarcada.
  function analisarFichas(fichas){
    const lista=Object.values(fichas||{}).filter(Boolean);
    const achar=nome=>{const alvo=nome.toUpperCase();
      return lista.find(f=>String(f.nome||'').toUpperCase()===alvo||(f.nomes||[]).some(n=>String(n).toUpperCase()===alvo))||
        (typeof CFI_casar==='function'?CFI_casar(nome,lista):null);};
    return FICHAS.map(([nome,doc,razao])=>{
      const f=achar(nome);
      if(!f)return {nome,doc,razao,acao:'criar',marca:true};
      const dOk=!f.doc, rOk=!f.razaoSocial;
      const conflito=(!dOk&&dig(f.doc)!==dig(doc))||(!rOk&&String(f.razaoSocial).trim().toUpperCase()!==razao.toUpperCase());
      if(!dOk&&!rOk&&!conflito)return {nome,doc,razao,acao:'ok',id:f.id,marca:false};
      if(conflito)return {nome,doc,razao,acao:'conflito',id:f.id,marca:false,atualDoc:f.doc||'',atualRazao:f.razaoSocial||''};
      return {nome,doc,razao,acao:'preencher',id:f.id,marca:true,preencheDoc:dOk,preencheRazao:rOk};
    });
  }

  // ── TELA ─────────────────────────────────────────────────────────────────────
  let LF=[],LC=[];
  function desenhar(){
    const box=document.getElementById('nfrLista'); if(!box)return;
    const linhaF=(a,i)=>{
      const det=a.ok?(a.tipo==='limpar'?'<b>'+esc(a.atual)+'</b> → (vazio) · volta para pendente':'<b>'+esc(a.atual)+'</b> → <b>'+esc(a.novo)+'</b>'+(a.soma!==a.valorFech?' · notas '+a.soma.toLocaleString('pt-BR')+' × fechamento '+(a.valorFech||0).toLocaleString('pt-BR'):''))
        :'<i>'+esc(a.motivo)+'</i>';
      return '<tr style="border-top:1px solid #e5e7eb"><td><input type="checkbox" '+(a.marca?'checked ':'')+(a.ok?'':'disabled ')+'onchange="NFR_marcaF('+i+',this.checked)"></td><td>'+esc(a.cliente||a.fech)+'<div style="font-size:.72rem;color:#6b7280">'+esc(a.fech)+'</div></td><td>'+det+(a.obs?'<div style="font-size:.72rem;color:#6b7280">'+esc(a.obs)+'</div>':'')+(a.aviso?'<div style="font-size:.72rem;color:#b45309">⚠️ '+esc(a.aviso)+'</div>':'')+'</td></tr>';};
    const linhaC=(a,i)=>{
      const det=a.acao==='criar'?'criar ficha nova':a.acao==='ok'?'<i>já está certo</i>':a.acao==='conflito'?'<span style="color:#b91c1c">já tem '+esc(a.atualDoc||'—')+' / '+esc(a.atualRazao||'—')+' — não sobrescrevo</span>':'preencher '+[a.preencheDoc?'CNPJ':'',a.preencheRazao?'razão social':''].filter(Boolean).join(' e ');
      return '<tr style="border-top:1px solid #e5e7eb"><td><input type="checkbox" '+(a.marca?'checked ':'')+(a.acao==='ok'||a.acao==='conflito'?'disabled ':'')+'onchange="NFR_marcaC('+i+',this.checked)"></td><td>'+esc(a.nome)+'</td><td>'+esc(a.doc)+' · '+esc(a.razao)+'<div style="font-size:.72rem;color:#6b7280">'+det+'</div></td></tr>';};
    const nF=LF.filter(a=>a.marca).length,nC=LC.filter(a=>a.marca).length;
    box.innerHTML='<h3 style="margin:10px 0 4px">1) Números das notas nos fechamentos</h3><table style="width:100%;border-collapse:collapse;font-size:.8rem"><tbody>'+LF.map(linhaF).join('')+'</tbody></table>'
      +'<h3 style="margin:14px 0 4px">2) CNPJ e razão social nas fichas</h3><table style="width:100%;border-collapse:collapse;font-size:.8rem"><tbody>'+LC.map(linhaC).join('')+'</tbody></table>';
    document.getElementById('nfrResumo').textContent=nF+' fechamento(s) e '+nC+' ficha(s) marcados. Nada é gravado até você clicar em Aplicar.';
    document.getElementById('nfrOk').disabled=!(nF||nC);
  }
  root.NFR_marcaF=(i,v)=>{LF[i].marca=v;desenhar();};
  root.NFR_marcaC=(i,v)=>{LC[i].marca=v;desenhar();};
  root.NFR_fechar=()=>document.getElementById('nfrBg')?.remove();
  root.NFR_abrir=function(){
    NFR_fechar();
    LF=analisarFechamentos(typeof FC_dados!=='undefined'?FC_dados:{}); LC=analisarFichas(typeof CFI_FICHAS!=='undefined'?CFI_FICHAS:{});
    const bg=document.createElement('div'); bg.className='modal-bg open'; bg.id='nfrBg';
    bg.innerHTML='<div class="modal" style="max-width:980px"><div style="display:flex;justify-content:space-between;align-items:center"><h2 style="margin:0">Números reais das notas e CNPJ dos clientes</h2><button class="btn" onclick="NFR_fechar()">✕</button></div>'
      +'<p class="nf-sub">Substitui os números aleatórios pelos números reais do governo (Prefeitura 408–427 e Emissor Nacional 1–10) e preenche CNPJ e razão social. <b>Só troca número que for exatamente o falso esperado</b>; o que já tem dado não é sobrescrito. O Receber não é tocado.</p>'
      +'<div id="nfrResumo" class="nf-sub" style="margin:6px 0"></div><div id="nfrLista" style="max-height:56vh;overflow:auto"></div>'
      +'<div class="modal-actions"><button class="btn" onclick="NFR_fechar()">Cancelar</button><button class="btn btn-green" id="nfrOk" onclick="NFR_aplicar()">Aplicar marcados</button></div></div>';
    document.body.appendChild(bg); desenhar();
  };
  root.NFR_aplicar=async function(){
    const btn=document.getElementById('nfrOk'); if(btn)btn.disabled=true;
    const agora=new Date().toISOString(); let nf=0,nc=0; const erros=[];
    // reconfere o estado ANTES de gravar (outra aba pode ter mudado)
    const fresco=analisarFechamentos(FC_dados);
    for(const a of LF.filter(x=>x.marca&&x.ok)){
      const atual=fresco.find(x=>x.fech===a.fech&&x.tipo===a.tipo);
      if(!atual||!atual.ok){erros.push(a.fech+': mudou desde a prévia');continue;}
      try{
        const doc=FC_dados[a.fech]; const campos=camposDe(atual,agora); Object.assign(doc,campos);
        await FC_gravarCampos(a.fech,doc,Object.keys(campos)); nf++;
        if(typeof AUD_log==='function')try{AUD_log('editar','administrativo_fechamentos',doc.cliente||a.fech,(a.tipo==='limpar'?'Número falso removido':'Número real da nota: '+a.novo),null,null);}catch(e){}
      }catch(e){erros.push(a.fech+': '+e.message);}
    }
    for(const a of LC.filter(x=>x.marca&&(x.acao==='criar'||x.acao==='preencher'))){
      try{
        let f=a.id?Object.assign({},CFI_FICHAS[a.id]):CFI_adicionarApelido(CFI_novaFicha(a.nome),a.nome);
        if(!a.id)f.criadoEm=agora;
        if(!f.doc)f.doc=a.doc; if(!f.razaoSocial)f.razaoSocial=a.razao; f.atualizadoEm=agora;
        CFI_FICHAS[f.id]=f; CFI_salvarCache(); await BC_fbUpsert(CFI_COL,f.id,f); nc++;
        if(typeof AUD_log==='function')try{AUD_log(a.id?'editar':'criar','clientes_fiscais',f.nome,'CNPJ e razão social do governo',null,null);}catch(e){}
      }catch(e){erros.push(a.nome+': '+e.message);}
    }
    NFR_fechar(); try{NF_montar();}catch(e){}
    toast((erros.length?'⚠️ ':'✅ ')+nf+' fechamento(s) e '+nc+' ficha(s) atualizados.'+(erros.length?' Falhas: '+erros.join('; '):'')+(nc?' Use "Reaplicar as fichas em tudo" para o CNPJ chegar aos fechamentos.':''),erros.length?'#d97706':undefined,10000);
  };
  const API={NOTAS,PLANO,LIMPAR,FICHAS,analisarFechamentos,analisarFichas,camposDe};
  if(typeof module!=='undefined')module.exports=API; else root.NFR=API;
})(typeof window!=='undefined'?window:globalThis);
