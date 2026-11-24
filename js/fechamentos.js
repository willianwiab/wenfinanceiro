/* Regras compartilhadas: valores em centavos, dados administrativos por lista explícita. */
(function(root){
  const cents=v=>Math.round((Number(v)||0)*100);
  const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v);
  function mesChave(m){
    const v=String(m||'').toUpperCase();if(/^\d{4}-\d{2}$/.test(v))return v;
    const a=v.split('/'),i=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'].indexOf(a[0]);
    return i>=0&&/^\d{4}$/.test(a[1])?a[1]+'-'+String(i+1).padStart(2,'0'):'';
  }
  const noPeriodo=r=>mesChave(r.mes)>='2026-10';
  const MESES_EXT=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const mesExtenso=c=>/^\d{4}-\d{2}$/.test(String(c||''))?MESES_EXT[Number(c.slice(5,7))-1]+' de '+c.slice(0,4):'';
  const dataCurta=v=>String(v||'').slice(0,5);
  const dataBR=iso=>/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))?iso.split('-').reverse().join('/'):'';
  // O vencimento NÃO é digitado de novo aqui: ele vem do lançamento do Receber, que é
  // onde o Will define a data. '-' e vazio contam como sem data.
  function vencIso(v,mes){
    const t=String(v||'').trim();
    if(!t||t==='-')return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;
    const m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if(m)return m[3]+'-'+m[2]+'-'+m[1];
    // 24/11: o Receber grava muito vencimento só como "27/11". Era ignorado, e o
    // fechamento ficava com o vencimento de outra diária (Danny Ueda "em atraso" por
    // uma gravação que nem tinha acontecido). O ano vem do mês do lançamento; mês do
    // vencimento muito antes do lançamento = ano seguinte (lançamento DEZ, vence 05/01).
    const c=t.match(/^(\d{1,2})\/(\d{1,2})$/), ref=mesChave(mes);
    if(!c||!ref)return '';
    const dd=c[1].padStart(2,'0'), mm=c[2].padStart(2,'0');
    let ano=Number(ref.slice(0,4));if(Number(mm)<Number(ref.slice(5,7))-6)ano++;
    return ano+'-'+mm+'-'+dd;
  }
  // O que o emissor da nota quer ver somado: quantas diárias, quantas horas,
  // quantas edições. Função própria para o teste e para as telas usarem o MESMO número.
  function resumir(itens){
    const l=itens||[];
    return {
      diarias:l.length,
      horas:Math.round(l.reduce((a,r)=>a+(Number(r.horas)||0),0)*100)/100,
      edicoes:l.reduce((a,r)=>a+(Math.max(0,parseInt(r.edicoes,10)||0)),0),
      valor:l.reduce((a,r)=>a+cents(r.valor),0)/100
    };
  }
  function textoResumo(itens){
    const r=resumir(itens), p=[];
    p.push(r.diarias+(r.diarias===1?' diária':' diárias'));
    if(r.horas)p.push((Number.isInteger(r.horas)?r.horas:r.horas.toFixed(1).replace('.',','))+'h de estúdio');
    if(r.edicoes)p.push(r.edicoes+(r.edicoes===1?' edição':' edições'));
    return p.join(' · ');
  }
  // ── Condição de pagamento ───────────────────────────────────────────────
  // O problema que isto resolve: se o cliente ainda NÃO pagou nada, o administrativo
  // via "saldo = total" e não tinha como saber que o combinado era metade agora e
  // metade depois. A condição é do CLIENTE e viaja junto, independente do que entrou.
  const CONDICOES = {
    avista:    {rotulo:'À vista', parcelas:[['Pagamento', 1]]},
    sinal50:   {rotulo:'50% de sinal + 50%', parcelas:[['Sinal (50%)', .5], ['Saldo (50%)', .5]]},
    sinal30:   {rotulo:'30% de sinal + 70%', parcelas:[['Sinal (30%)', .3], ['Saldo (70%)', .7]]},
    mensal:    {rotulo:'Fechamento mensal', parcelas:[['Fechamento do mês', 1]]}
  };
  // Devolve o que cobrar AGORA e o que fica para depois, já descontando o que entrou.
  // Em centavos o tempo todo: meio de R$ 3.750,01 não pode virar dízima.
  function cobranca(f, condicao){
    const c = CONDICOES[condicao] || CONDICOES.avista;
    const total = cents(f && f.valor), pago = cents(f && f.recebido);
    let restante = pago, acumulado = 0;
    const parcelas = c.parcelas.map(([nome, fracao], i, todas) => {
      // a última leva a sobra do arredondamento, para a soma fechar com o total
      const bruto = (i === todas.length - 1) ? total - acumulado : Math.round(total * fracao);
      acumulado += bruto;
      const quitado = Math.min(restante, bruto); restante -= quitado;
      return {nome, valor: bruto/100, pago: quitado/100, aberto: (bruto - quitado)/100};
    });
    const aberta = parcelas.find(p => p.aberto > 0) || null;
    return {condicao: CONDICOES[condicao] ? condicao : 'avista', rotulo: c.rotulo, parcelas,
      cobrarAgora: aberta ? aberta.aberto : 0, proxima: aberta ? aberta.nome : '',
      quitado: parcelas.every(p => p.aberto === 0)};
  }
  function criar(regs, ficha={}, campos=['data','horas','studio','descricao']){
    if(!regs.length)throw Error('Selecione pelo menos uma diária.');
    if(regs.some(r=>!noPeriodo(r)))throw Error('O administrativo começa em outubro de 2026.');
    if(regs.length>200)throw Error('Selecione até 200 diárias por fechamento.');
    if(new Set(regs.map(r=>r.cliente)).size!==1)throw Error('Selecione diárias de um único cliente.');
    if(new Set(regs.map(r=>String(r.id))).size!==regs.length)throw Error('Diária duplicada.');
    const itens=regs.map(r=>{
      if(!r.id||!Number.isFinite(Number(r.valorTotal))||Number(r.valorTotal)<=0)throw Error('Diária com valor inválido.');
      const total=cents(r.valorTotal), recebido=cents(r.valorReserva);
      if(recebido<0||recebido>total)throw Error('Revise o valor recebido da diária '+r.id+'.');
      return {id:String(r.id),data:String(r.data||''),mes:String(r.mes||''),horas:Number(r.horas)||0,
        horario:String(r.horario||''),vencimento:vencIso(r.vencimento,r.mes),edicoes:Math.max(0,parseInt(r.qtdEdicao,10)||0),studio:String(r.studio||''),descricao:String(r.desc||r.descricao||''),valor:total/100,recebido:recebido/100,saldo:(total-recebido)/100};
    });
    // Regra da nota: o que, quantas e quando. Fichas antigas caem no equivalente.
    const REGRAS={gravacao:{emite:true,separa:false,quando:'gravacao'},
      pagamento:{emite:true,separa:false,quando:'pagamento'},
      reserva:{emite:true,separa:false,quando:'reserva'},
      duas:{emite:true,separa:true,quando:'parcela'},
      nenhuma:{emite:false,separa:false,quando:''}};
    const chaveRegra=REGRAS[ficha.notaRegra]?ficha.notaRegra
      :ficha.exigeNota===false?'nenhuma':ficha.notaSinal==='separado'?'duas':'gravacao';
    const regraNota=REGRAS[chaveRegra];
    const valor=itens.reduce((s,r)=>s+cents(r.valor),0)/100;
    const recebido=itens.reduce((s,r)=>s+cents(r.recebido),0)/100;
    const saldo=(cents(valor)-cents(recebido))/100;
    const linhas=itens.map(r=>[campos.includes('data')?[r.data,r.mes].filter(Boolean).join(' / '):'',campos.includes('horas')?r.horas+'h':'',campos.includes('studio')?r.studio:'',campos.includes('descricao')?r.descricao:''].filter(Boolean).join(' · ')||'Serviço audiovisual');
    const descricaoFiscal='Prestação de serviços de produção audiovisual.\n'+textoResumo(itens)+'.\n'+linhas.join('\n');
    const grupos={};
    itens.forEach((r,i)=>{const c=mesChave(r.mes)||'';(grupos[c]=grupos[c]||[]).push({r,i});});
    const corpo=Object.keys(grupos).sort().map(c=>{
      const linha=grupos[c].map(({r})=>{
        const p=[];
        if(campos.includes('data')&&dataCurta(r.data))p.push(dataCurta(r.data));
        if(campos.includes('horas')&&r.horas)p.push(r.horas+'h');
        if(campos.includes('studio')&&r.studio)p.push(r.studio);
        if(r.edicoes)p.push(r.edicoes+(r.edicoes===1?' edição':' edições'));
        return '  🎬 '+(p.join(' · ')||'Serviço audiovisual')+' — '+money(r.valor);
      }).join('\n');
      const sub=grupos[c].reduce((a,{r})=>a+cents(r.valor),0)/100;
      const titulo=mesExtenso(c);
      return (titulo?'📅 *'+titulo+'*\n':'')+linha
        +(grupos[c].length>1?'\n  _Subtotal: '+money(sub)+'_':'');
    }).join('\n\n');

    const venc=itens.map(r=>r.vencimento).filter(Boolean).sort().at(-1)||'';
    const quitado=saldo<=0;
    const descricaoCobranca=
      'Olá! Segue o fechamento das gravações.\n\n'+corpo+
      '\n\n━━━━━━━━━━━━━━━━━━\n'+
      '💰 Total: *'+money(valor)+'*\n'+
      (recebido>0?'✅ Já recebido: '+money(recebido)+'\n':'')+
      (quitado?'✅ *Tudo quitado — obrigado!*':'🔴 Saldo a pagar: *'+money(saldo)+'*')+
      (venc&&!quitado?'\n📆 Vencimento: *'+dataBR(venc)+'*':'')+
      (()=>{ if(quitado)return '';
        const cond=CONDICOES[ficha.condicaoPagamento]?ficha.condicaoPagamento:'avista';
        if(cond==='avista')return '';
        const c=cobranca({valor,recebido},cond);
        return '\n\n💳 '+c.rotulo+'\n➡️ *Agora: '+money(c.cobrarAgora)+'* ('+c.proxima+')';
      })()+
      (quitado?'':'\n\n🏦 *PIX:* wenprodutora@gmail.com\n_WEN Produtora Ltda · CNPJ 21.577.617/0001-44_');
    // Não copiar a ficha ou lançamento inteiro: eles podem conter informação interna.
    const clienteFiscal={};
    for(const k of ['razaoSocial','doc','logradouro','numero','complemento','bairro','municipio','uf','cep','emailNota','contatoFinanceiro','emailFinanceiro','whatsappFinanceiro','envioPreferido'])clienteFiscal[k]=String(ficha[k]||'');
    clienteFiscal.cobrancaAdministrativo=ficha.cobrancaAdministrativo!==false;
    return {cliente:regs[0].cliente,clienteFiscal,itens,lancamentoIds:itens.map(r=>r.id),valor,recebido,saldo,
      exigeNota:regraNota.emite,notaRegra:chaveRegra,notaQuando:regraNota.quando,descricaoFiscal,descricaoCobranca,vencimento:itens.map(r=>r.vencimento).filter(Boolean).sort().at(-1)||'',
      fiscalStatus:regraNota.emite?'pendente':'nao_solicitada',cobrancaStatus:saldo===0?'pago':'pendente',
      nfNumero:'',nfData:'',enviadoEm:'',promessaData:'',promessaObs:'',notasEmitidas:[],
      notaModo:(regraNota.separa&&recebido>0&&saldo>0)?'separado':'junto',
      condicao:CONDICOES[ficha.condicaoPagamento]?ficha.condicaoPagamento:'avista',
      condicaoTexto:String(ficha.condicaoTexto||''),
      nfSinalNumero:'',nfSinalData:'',nfSinalStatus:'pendente',
      nfSaldoNumero:'',nfSaldoData:'',nfSaldoStatus:'pendente',criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};
  }
  // Quais diárias ainda não foram cobertas por nenhuma nota.
  function diariasLivres(f){
    const usadas=new Set();
    (f&&f.notasEmitidas||[]).forEach(n=>(n.ids||[]).forEach(i=>usadas.add(String(i))));
    return (f&&f.itens||[]).filter(r=>!usadas.has(String(r.id)));
  }
  // Valida uma nota nova antes de registrar: precisa de número, data e pelo menos uma
  // diária ainda livre. Diária já coberta é recusada — é assim que não sai nota em dobro.
  function validarNota(f,nota){
    const num=String(nota&&nota.numero||'').trim();
    if(!num)throw Error('Informe o número da nota.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(nota&&nota.data||'')))throw Error('Informe a data de emissão.');
    const ids=[...new Set((nota&&nota.ids||[]).map(String))];
    if(!ids.length)throw Error('Selecione pelo menos uma diária para esta nota.');
    const doFechamento=new Set((f.itens||[]).map(r=>String(r.id)));
    if(ids.some(i=>!doFechamento.has(i)))throw Error('Diária que não pertence a este fechamento.');
    const livres=new Set(diariasLivres(f).map(r=>String(r.id)));
    const repetida=ids.find(i=>!livres.has(i));
    if(repetida)throw Error('Uma das diárias já está em outra nota. Atualize a tela.');
    if((f.notasEmitidas||[]).some(n=>String(n.numero||'').trim()===num))
      throw Error('Já existe uma nota com este número neste fechamento.');
    const valor=(f.itens||[]).filter(r=>ids.includes(String(r.id)))
      .reduce((a,r)=>a+cents(r.valor),0)/100;
    return {numero:num,data:nota.data,ids,valor,em:new Date().toISOString()};
  }
  function validarEdicao(f){
    if(!f.descricaoCobranca.trim())throw Error('Preencha a descrição da cobrança.');
    if(f.exigeNota&&!f.descricaoFiscal.trim())throw Error('Preencha a descrição fiscal.');
    const emitidas=(f.notasEmitidas||[]).length;
    if(emitidas&&diariasLivres(f).length===0&&f.fiscalStatus!=='emitida')
      throw Error('Todas as diárias já têm nota: marque a situação fiscal como emitida.');
    if(f.notaModo==='separado'){
      for(const [rot,n,d,st] of [['do sinal','nfSinalNumero','nfSinalData','nfSinalStatus'],['do saldo','nfSaldoNumero','nfSaldoData','nfSaldoStatus']]){
        if(!['pendente','emitida'].includes(String(f[st]||'pendente')))throw Error('Situação inválida na nota '+rot+'.');
        if(f[st]==='emitida'&&(!String(f[n]||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(String(f[d]||''))))throw Error('Informe número e data da nota '+rot+'.');
      }
      if(f.fiscalStatus==='emitida'&&!(f.nfSinalStatus==='emitida'&&f.nfSaldoStatus==='emitida'))throw Error('No modo separado, as duas notas precisam estar emitidas.');
    }
    else if(f.fiscalStatus==='emitida'&&(!f.nfNumero.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(f.nfData)))throw Error('Informe número e data da nota emitida.');
    if(f.vencimento&&!/^\d{4}-\d{2}-\d{2}$/.test(f.vencimento))throw Error('Vencimento inválido.');
    // A promessa é um COMPROMISSO DO CLIENTE registrado pelo administrativo: não muda o
    // vencimento e não confirma recebimento. Só serve para a cobrança voltar na data.
    if(f.promessaData&&!/^\d{4}-\d{2}-\d{2}$/.test(f.promessaData))throw Error('Data da promessa inválida.');
    if(String(f.promessaObs||'').length>300)throw Error('Anotação da promessa muito longa.');
    if(!['pendente','enviada','informado','pago'].includes(f.cobrancaStatus))throw Error('Situação inválida.');
    if(!['pendente','emitida','nao_solicitada'].includes(f.fiscalStatus))throw Error('Situação fiscal inválida.');
    return f;
  }
  // Identidade da cobrança: conjunto exato de IDs, nunca nome/data/valor.
  function chaveDiarias(f){
    const ids=[...new Set((f.lancamentoIds||[]).map(String))].sort();
    return ids.length?JSON.stringify(ids):'sem-id:'+f.id;
  }
  function consolidarFechamentos(lista){
    const grupos=new Map();
    for(const f of lista){const k=chaveDiarias(f);if(!grupos.has(k))grupos.set(k,[]);grupos.get(k).push(f);}
    return [...grupos.values()].map(grupo=>{
      grupo.sort((a,b)=>Number(!!b.grupo)-Number(!!a.grupo)||String(b.criadoEm||'').localeCompare(String(a.criadoEm||''))||String(a.id).localeCompare(String(b.id)));
      const [ativo,...anteriores]=grupo;
      return {...ativo,historicoDuplicados:anteriores};
    });
  }
  root.WENFechamentos={chaveDiarias,consolidarFechamentos,criar,validarEdicao,money,mesChave,noPeriodo,resumir,textoResumo,cobranca,CONDICOES,diariasLivres,validarNota};
  if(typeof module!=='undefined')module.exports=root.WENFechamentos;
})(globalThis);
