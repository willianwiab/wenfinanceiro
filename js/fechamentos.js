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
  // O vencimento NÃO é digitado de novo aqui: ele vem do lançamento do Receber, que é
  // onde o Will define a data. '-' e vazio contam como sem data.
  function vencIso(v){
    const t=String(v||'').trim();
    if(!t||t==='-')return '';
    if(/^\d{4}-\d{2}-\d{2}$/.test(t))return t;
    const m=t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m?m[3]+'-'+m[2]+'-'+m[1]:'';
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
        horario:String(r.horario||''),vencimento:vencIso(r.vencimento),edicoes:Math.max(0,parseInt(r.qtdEdicao,10)||0),studio:String(r.studio||''),descricao:String(r.desc||r.descricao||''),valor:total/100,recebido:recebido/100,saldo:(total-recebido)/100};
    });
    const valor=itens.reduce((s,r)=>s+cents(r.valor),0)/100;
    const recebido=itens.reduce((s,r)=>s+cents(r.recebido),0)/100;
    const saldo=(cents(valor)-cents(recebido))/100;
    const linhas=itens.map(r=>[campos.includes('data')?[r.data,r.mes].filter(Boolean).join(' / '):'',campos.includes('horas')?r.horas+'h':'',campos.includes('studio')?r.studio:'',campos.includes('descricao')?r.descricao:''].filter(Boolean).join(' · ')||'Serviço audiovisual');
    const descricaoFiscal='Prestação de serviços de produção audiovisual.\n'+textoResumo(itens)+'.\n'+linhas.join('\n');
    const descricaoCobranca=linhas.map((s,i)=>s+' — '+money(itens[i].valor)).join('\n')+'\n\nTotal: '+money(valor)+'\nRecebido: '+money(recebido)+'\nSaldo a pagar: '+money(saldo);
    // Não copiar a ficha ou lançamento inteiro: eles podem conter informação interna.
    const clienteFiscal={};
    for(const k of ['razaoSocial','doc','logradouro','numero','complemento','bairro','municipio','uf','cep','emailNota','contatoFinanceiro','emailFinanceiro','whatsappFinanceiro'])clienteFiscal[k]=String(ficha[k]||'');
    return {cliente:regs[0].cliente,clienteFiscal,itens,lancamentoIds:itens.map(r=>r.id),valor,recebido,saldo,
      exigeNota:ficha.exigeNota!==false,descricaoFiscal,descricaoCobranca,vencimento:itens.map(r=>r.vencimento).filter(Boolean).sort().at(-1)||'',
      fiscalStatus:ficha.exigeNota===false?'nao_solicitada':'pendente',cobrancaStatus:saldo===0?'pago':'pendente',
      nfNumero:'',nfData:'',enviadoEm:'',
      notaModo:(ficha.exigeNota!==false&&ficha.notaSinal==='separado'&&recebido>0&&saldo>0)?'separado':'junto',
      nfSinalNumero:'',nfSinalData:'',nfSinalStatus:'pendente',
      nfSaldoNumero:'',nfSaldoData:'',nfSaldoStatus:'pendente',criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};
  }
  function validarEdicao(f){
    if(!f.descricaoCobranca.trim())throw Error('Preencha a descrição da cobrança.');
    if(f.exigeNota&&!f.descricaoFiscal.trim())throw Error('Preencha a descrição fiscal.');
    if(f.notaModo==='separado'){
      for(const [rot,n,d,st] of [['do sinal','nfSinalNumero','nfSinalData','nfSinalStatus'],['do saldo','nfSaldoNumero','nfSaldoData','nfSaldoStatus']]){
        if(!['pendente','emitida'].includes(String(f[st]||'pendente')))throw Error('Situação inválida na nota '+rot+'.');
        if(f[st]==='emitida'&&(!String(f[n]||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(String(f[d]||''))))throw Error('Informe número e data da nota '+rot+'.');
      }
      if(f.fiscalStatus==='emitida'&&!(f.nfSinalStatus==='emitida'&&f.nfSaldoStatus==='emitida'))throw Error('No modo separado, as duas notas precisam estar emitidas.');
    }
    else if(f.fiscalStatus==='emitida'&&(!f.nfNumero.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(f.nfData)))throw Error('Informe número e data da nota emitida.');
    if(f.vencimento&&!/^\d{4}-\d{2}-\d{2}$/.test(f.vencimento))throw Error('Vencimento inválido.');
    if(!['pendente','enviada','informado','pago'].includes(f.cobrancaStatus))throw Error('Situação inválida.');
    if(!['pendente','emitida','nao_solicitada'].includes(f.fiscalStatus))throw Error('Situação fiscal inválida.');
    return f;
  }
  root.WENFechamentos={criar,validarEdicao,money,mesChave,noPeriodo,resumir,textoResumo};
  if(typeof module!=='undefined')module.exports=root.WENFechamentos;
})(globalThis);
