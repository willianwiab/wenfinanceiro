// Leitor do CSV "NFSe_E_*" exportado pelo portal da Prefeitura de SP (latin-1, separador ';').
// Função PURA: recebe texto, devolve notas no formato da aba NF_ SEM lancamentoIds
// (o vínculo com o Receber é feito na tela, com prévia). Não grava nada.
(function(root){
  function linhas(t){const out=[];let c=[],f='',q=false;
    for(let i=0;i<t.length;i++){const ch=t[i];
      if(q){ if(ch==='"'){ if(t[i+1]==='"'){f+='"';i++;} else q=false; } else f+=ch; }
      else if(ch==='"')q=true; else if(ch===';'){c.push(f);f='';}
      else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&t[i+1]==='\n')i++; c.push(f);f=''; if(c.some(x=>x!==''))out.push(c); c=[]; }
      else f+=ch; }
    if(f!==''||c.length){c.push(f);out.push(c);} return out; }
  const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ�]/g,'').toLowerCase().replace(/[^a-z0-9\/ -]/g,'');
  const dinheiro=s=>{const n=parseFloat(String(s||'').replace(/\./g,'').replace(',','.'));return isNaN(n)?0:n;};
  const soDig=s=>String(s||'').replace(/\D/g,'');
  function fmtCnpj(d){return d.length===14?d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'):d;}
  function lerCSV(texto){
    const L=linhas(texto); if(!L.length)return {notas:[],ignoradas:0};
    const h=L[0].map(norm); const col=(ini,nao)=>h.findIndex(x=>x.startsWith(ini)&&(!nao||!x.includes(nao)));
    const iTipo=0,iNum=col('n nfs-e','substituta'),iData=col('data hora nfe'),iSit=col('situacao da nota'),
      iCanc=col('data de cancelamento'),iVal=col('valor dos servicos'),
      iDoc=col('cpf/cnpj do tomador'),iNome=h.findIndex(x=>x.includes('razao social do tomador'));
    if([iNum,iData,iSit,iVal,iDoc,iNome].some(i=>i<0))throw Error('CSV da Prefeitura: cabeçalho não reconhecido');
    const notas=[];let ignoradas=0;
    for(const r of L.slice(1)){
      if(String(r[iTipo]).trim()!=='2'||!r[iNum]){ignoradas++;continue;}   // 6=cabeçalho, "Total", etc.
      const [d,m,a]=String(r[iData]).slice(0,10).split('/');
      notas.push({numero:String(r[iNum]).trim(),dataEmissao:`${d}/${m}/${a}`,dataISO:`${a}-${m}-${d}`,
        valor:dinheiro(r[iVal]),cliente:String(r[iNome]).trim(),cnpj:fmtCnpj(soDig(r[iDoc])),
        status:String(r[iSit]).trim().toUpperCase()==='C'?'cancelada':'emitida',
        canceladaEm:r[iCanc]||'',origem:'prefeitura-sp-csv'});
    }
    return {notas,ignoradas};
  }
  // Mesma nota se o número bate, ou (CNPJ + valor + data + mesma situação — 411 emitida e 412 cancelada são notas diferentes). Devolve {novas, repetidas}.
  function separar(importadas,existentes){
    const doc=n=>soDig(n.cnpj||''), ex=Object.values(existentes||{}).filter(Boolean);
    const novas=[],repetidas=[];
    for(const n of importadas){
      const dup=ex.find(e=>String(e.numero)===n.numero||(doc(e)&&doc(e)===doc(n)&&Math.abs((+e.valor||0)-n.valor)<0.005&&e.dataEmissao===n.dataEmissao&&(e.status==='cancelada')===(n.status==='cancelada')));
      (dup?repetidas:novas).push(dup?{...n,jaExiste:dup.id||dup.numero}:n);
    }
    return {novas,repetidas};
  }
  const API={lerCSV,separar}; if(typeof module!=='undefined')module.exports=API; else root.NFP=API;
})(typeof window!=='undefined'?window:globalThis);
