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
        horario:String(r.horario||''),studio:String(r.studio||''),descricao:String(r.desc||r.descricao||''),valor:total/100,recebido:recebido/100,saldo:(total-recebido)/100};
    });
    const valor=itens.reduce((s,r)=>s+cents(r.valor),0)/100;
    const recebido=itens.reduce((s,r)=>s+cents(r.recebido),0)/100;
    const saldo=(cents(valor)-cents(recebido))/100;
    const linhas=itens.map(r=>[campos.includes('data')?[r.data,r.mes].filter(Boolean).join(' / '):'',campos.includes('horas')?r.horas+'h':'',campos.includes('studio')?r.studio:'',campos.includes('descricao')?r.descricao:''].filter(Boolean).join(' · ')||'Serviço audiovisual');
    const descricaoFiscal='Prestação de serviços de produção audiovisual.\n'+linhas.join('\n');
    const descricaoCobranca='Olá! Segue o fechamento de '+regs[0].cliente+'.\n\n'+linhas.map((s,i)=>s+' — '+money(itens[i].valor)).join('\n')+'\n\nTotal: '+money(valor)+'\nRecebido: '+money(recebido)+'\nSaldo a pagar: '+money(saldo);
    // Não copiar a ficha ou lançamento inteiro: eles podem conter informação interna.
    const clienteFiscal={};
    for(const k of ['razaoSocial','doc','logradouro','numero','complemento','bairro','municipio','uf','cep','emailNota','contatoFinanceiro','emailFinanceiro','whatsappFinanceiro'])clienteFiscal[k]=String(ficha[k]||'');
    return {cliente:regs[0].cliente,clienteFiscal,itens,lancamentoIds:itens.map(r=>r.id),valor,recebido,saldo,
      exigeNota:ficha.exigeNota!==false,descricaoFiscal,descricaoCobranca,vencimento:'',
      fiscalStatus:ficha.exigeNota===false?'nao_solicitada':'pendente',cobrancaStatus:saldo===0?'pago':'pendente',
      nfNumero:'',nfData:'',enviadoEm:'',criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()};
  }
  function validarEdicao(f){
    if(!f.descricaoCobranca.trim())throw Error('Preencha a descrição da cobrança.');
    if(f.exigeNota&&!f.descricaoFiscal.trim())throw Error('Preencha a descrição fiscal.');
    if(f.fiscalStatus==='emitida'&&(!f.nfNumero.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(f.nfData)))throw Error('Informe número e data da nota emitida.');
    if(f.vencimento&&!/^\d{4}-\d{2}-\d{2}$/.test(f.vencimento))throw Error('Vencimento inválido.');
    if(!['pendente','enviada','pago'].includes(f.cobrancaStatus))throw Error('Situação inválida.');
    if(!['pendente','emitida','nao_solicitada'].includes(f.fiscalStatus))throw Error('Situação fiscal inválida.');
    return f;
  }
  root.WENFechamentos={criar,validarEdicao,money,mesChave,noPeriodo};
  if(typeof module!=='undefined')module.exports=root.WENFechamentos;
})(globalThis);
