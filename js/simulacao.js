// ═══════════════════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO DE CAIXA (SIM_) — a projeção que antes vivia no app avulso (simulacao-wen),
// agora embutida. Diferenças conscientes em relação ao avulso:
//
//   · NÃO busca nada no Firebase. Lê R_todosOsDados e P_meses, que o init() já carregou.
//     Isso apaga do módulo o login próprio, o fetch paginado e o interceptor de token.
//   · O saldo inicial vem das CONTAS BANCÁRIAS (BC_saldoConta), o mesmo número do card
//     "Saldo atual" do Fluxo de Caixa — não é mais digitado à mão. Dá para sobrescrever.
//   · Ajustes de data e notas vão para o Firestore (coleção `simulacao`, doc único), com
//     localStorage como espelho. No avulso viviam só no navegador.
//   · A chave do ajuste é `id::mês`, não `id`. Conta fixa é clonada de mês em mês
//     REAPROVEITANDO o mesmo id — com a chave antiga, adiar o MICHAEL de julho movia
//     também o de agosto, setembro e janeiro, e as ocorrências empilhavam no mesmo dia.
//   · Conta parcialmente paga entra pelo saldo (valor − valorPago), como o resto do
//     sistema faz. O avulso somava o valor cheio.
//   · Horizonte de 60/90/180 dias + aviso de AGENDA INCOMPLETA: nos meses à frente a
//     receita ainda está entrando enquanto a despesa fixa já está toda lançada, então
//     o segundo mês da projeção sempre parece um abismo. O aviso mede e diz isso.
//
// Nada aqui escreve em `lancamentos` nem em `meses`. O módulo é somente leitura sobre os
// dados do sistema; a única escrita é o próprio doc de configuração da simulação.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// Ponte de escopo: let/const de outro <script> não vão pro window, mas scripts clássicos
// compartilham o escopo léxico global — daqui enxergamos os globais do WEN.
function __SIMW(){ return {
  R:  (typeof R_todosOsDados!=='undefined'&&R_todosOsDados)||[],
  P:  (typeof P_meses!=='undefined'&&P_meses)||{},
  BC: (typeof BC_CONTAS!=='undefined'&&BC_CONTAS)||{},
}; }

const SIM_COL='simulacao', SIM_DOC='config';
const SIM_LS='wen_sim_cfg';
const SIM_HORIZONTES=[60,90,180];
let SIM_cfg={ajustes:{},notas:{},saldoOverride:null,metaMinima:0,catsCortadas:[],horizonte:60};
let SIM_chartLinha=null, SIM_chartBarras=null;
let SIM_ajusteAtual=null;
let SIM_contasProntas=false;   // vira true quando MOD_contasCompleto resolve (ou pelo prazo de segurança)
let SIM_gravaTimer=null;       // debounce: mexer em 5 coisas seguidas = 1 gravação, não 5

// ─────────────────────────────────────────────────────────────── configuração (Firestore)
async function SIM_carregarCfg(){
  try{ const c=JSON.parse(localStorage.getItem(SIM_LS)||'{}'); SIM_aplicarCfg(c); }catch(e){}
  let remotoOk=true;
  try{
    const res=await fetch(`${FS_URL}/${SIM_COL}/${SIM_DOC}?key=${FB_API_KEY}`);
    if(res.status===404){ remotoOk=true; }                      // ainda não existe: normal na 1ª vez
    else if(!res.ok) throw new Error(res.status===429?'nuvem sem cota (429)':'recusado ('+res.status+')');
    else{
      const j=await res.json();
      if(j&&j.fields){
        SIM_aplicarCfg({
          ajustes:       fromFV(j.fields.ajustes)||{},
          notas:         fromFV(j.fields.notas)||{},
          saldoOverride: fromFV(j.fields.saldoOverride),
          metaMinima:    fromFV(j.fields.metaMinima)||0,
          catsCortadas:  fromFV(j.fields.catsCortadas)||[],
          horizonte:     fromFV(j.fields.horizonte)||60,
        });
      }
    }
  }catch(e){ remotoOk=false; console.warn('Simulação (config):',e.message); }
  return remotoOk;
}
function SIM_aplicarCfg(c){
  if(!c||typeof c!=='object')return;
  if(c.ajustes&&typeof c.ajustes==='object')SIM_cfg.ajustes=c.ajustes;
  if(c.notas&&typeof c.notas==='object')SIM_cfg.notas=c.notas;
  if(c.saldoOverride!==undefined)SIM_cfg.saldoOverride=(c.saldoOverride===null?null:Number(c.saldoOverride));
  if(c.metaMinima!==undefined)SIM_cfg.metaMinima=Number(c.metaMinima)||0;
  if(Array.isArray(c.catsCortadas))SIM_cfg.catsCortadas=c.catsCortadas;
  if(SIM_HORIZONTES.indexOf(Number(c.horizonte))>=0)SIM_cfg.horizonte=Number(c.horizonte);
}
// Espelha no localStorage na hora (instantâneo, sobrevive a refresh) e agenda a nuvem.
// Sem o debounce, arrastar o horizonte e cortar 3 categorias viravam 4 PATCH seguidos —
// e cota estourada de Firestore já derrubou sistema nesta casa antes.
function SIM_persistir(){
  try{ localStorage.setItem(SIM_LS,JSON.stringify(SIM_cfg)); }catch(e){}
  if(SIM_gravaTimer)clearTimeout(SIM_gravaTimer);
  SIM_gravaTimer=setTimeout(()=>{SIM_gravaTimer=null;SIM_persistirJa();},1500);
}
async function SIM_persistirJa(){
  if(SIM_gravaTimer){clearTimeout(SIM_gravaTimer);SIM_gravaTimer=null;}
  try{
    await FB_gravar(`${FS_URL}/${SIM_COL}/${SIM_DOC}?key=${FB_API_KEY}`,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({fields:{
        ajustes:toFV(SIM_cfg.ajustes), notas:toFV(SIM_cfg.notas),
        saldoOverride:toFV(SIM_cfg.saldoOverride), metaMinima:toFV(SIM_cfg.metaMinima),
        catsCortadas:toFV(SIM_cfg.catsCortadas), horizonte:toFV(SIM_cfg.horizonte),
      }})
    },'Ajuste da simulação');
  }catch(e){}
}

// Chamado pelo MOD_hidratarMain quando as contas bancárias terminam de carregar. Antes disso
// o saldo sairia R$ 0,00 e a projeção inteira mentiria — então a aba mostra um esqueleto.
function SIM_marcarContasProntas(){
  if(SIM_contasProntas)return;
  SIM_contasProntas=true;
  if(typeof mainAtivo!=='undefined'&&mainAtivo==='simulacao')SIM_montarNaAba();
}

// ─────────────────────────────────────────────────────────────── helpers
function SIM_hoje(){ const d=new Date(); d.setHours(0,0,0,0); return d; }
function SIM_iso(d){ const z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
function SIM_deIso(s){ const p=String(s).split('-'); const d=new Date(+p[0],+p[1]-1,+p[2]); d.setHours(0,0,0,0); return d; }
function SIM_dia(d){ return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}); }
function SIM_diaSem(d){ return d.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'}); }
function SIM_esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function SIM_jsA(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
function SIM_catInfo(slug){ const c=(typeof CATS_P!=='undefined'&&CATS_P[slug])||null; return {label:c?c.label:(slug||'Outros'),icon:c&&c.icon?c.icon:'📦',color:c&&c.color?c.color:'#6b7280'}; }
function SIM_chave(id,mes){ return String(id||'')+'::'+String(mes||''); }

// Data de um recebível: vencimento se houver; senão o dia da reserva dentro do mês de competência.
function SIM_dataReceber(r){
  const bruto=(r.vencimento&&r.vencimento!=='-')?r.vencimento:r.data;
  if(!bruto||bruto==='-')return null;
  const p=String(bruto).split('/');
  if(p.length===3&&p[2].length===4){ const d=new Date(+p[2],+p[1]-1,+p[0]); d.setHours(0,0,0,0); return isNaN(d)?null:d; }
  if(p.length>=1&&p[0]){
    const mp=String(r.mes||'').split('/');
    const mi=MESES_IDX[mp[0]]; const ano=parseInt(mp[1],10);
    if(mi===undefined||!ano)return null;
    const d=new Date(ano,mi,Math.min(parseInt(p[0],10)||1,28)); d.setHours(0,0,0,0);
    return isNaN(d)?null:d;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────── saldo de partida
function SIM_contasComSaldo(){
  try{ return BC_contasAtivas().filter(id=>__SIMW().BC[id]&&__SIMW().BC[id].saldoConfigurado); }catch(e){ return []; }
}
function SIM_saldoBanco(){
  return SIM_contasComSaldo().reduce((a,id)=>a+(BC_saldoConta(id)||0),0);
}
function SIM_saldoPartida(){
  return (SIM_cfg.saldoOverride===null||SIM_cfg.saldoOverride===undefined)?SIM_saldoBanco():Number(SIM_cfg.saldoOverride)||0;
}

// ─────────────────────────────────────────────────────────────── montagem dos lançamentos
function SIM_coletar(){
  const W=__SIMW(), hoje=SIM_hoje(), aj=SIM_cfg.ajustes;
  function comAjuste(chave,dtOriginal){
    if(chave&&aj[chave]){ const d=SIM_deIso(aj[chave]); if(!isNaN(d))return{dt:d,ajustado:true}; }
    return {dt:dtOriginal,ajustado:false};
  }
  const recFut=[],recAtras=[],pagFut=[],pagAtras=[];

  (W.R||[]).forEach(r=>{
    const saldo=Number(r.saldo)||0; if(saldo<=0)return;
    const dtOrig=SIM_dataReceber(r); if(!dtOrig)return;
    const chave=SIM_chave(r.id,r.mes);
    const {dt,ajustado}=comAjuste(chave,dtOrig);
    const item={tipo:'rec',chave,dt,valor:saldo,label:r.cliente||'(sem cliente)',mes:r.mes,
                atrasado:dtOrig<hoje,ajustado};
    (dt<hoje?recAtras:recFut).push(item);
  });

  Object.keys(W.P||{}).forEach(mes=>{
    const mp=mes.split('/'); const mi=MESES_IDX[mp[0]]; const ano=parseInt(mp[1],10);
    if(mi===undefined||!ano)return;
    (W.P[mes]||[]).forEach(c=>{
      if(String(c.status).toUpperCase()==='PAGO'||!c.dia)return;
      const aberto=(Number(c.valor)||0)-(Number(c.valorPago)||0);   // parcial conta só o que falta
      if(aberto<=0)return;
      const dtOrig=new Date(ano,mi,Math.min(Number(c.dia)||1,28)); dtOrig.setHours(0,0,0,0);
      const chave=SIM_chave(c.id,mes);
      const {dt,ajustado}=comAjuste(chave,dtOrig);
      const item={tipo:'pag',chave,dt,valor:aberto,label:c.nome||'(sem nome)',mes,
                  categoria:c.categoria||'outros',atrasado:dtOrig<hoje,ajustado};
      (dt<hoje?pagAtras:pagFut).push(item);
    });
  });

  [recFut,recAtras,pagFut,pagAtras].forEach(a=>a.sort((x,y)=>x.dt-y.dt));
  return {recFut,recAtras,pagFut,pagAtras};
}

// ─────────────────────────────────────────────────────────────── agenda incompleta
// Compara a receita JÁ LANÇADA de cada mês futuro dentro do horizonte com a média faturada
// dos 3 últimos meses fechados. É o que explica o "abismo" do 2º mês: a despesa fixa daquele
// mês já está inteira no sistema, a receita ainda não.
function SIM_agendaIncompleta(limite){
  const W=__SIMW(), hoje=SIM_hoje(), mesAtual=mesAtualReal();
  const porMes={};
  (W.R||[]).forEach(r=>{ const v=Number(r.valorTotal)||0; if(v>0)porMes[r.mes]=(porMes[r.mes]||0)+v; });
  const ord=Object.keys(porMes).sort((a,b)=>{const[ma,ya]=a.split('/'),[mb,yb]=b.split('/');
    if(ya!==yb)return parseInt(ya)-parseInt(yb); return (MESES_IDX[ma]??0)-(MESES_IDX[mb]??0);});
  const ordem=m=>{const q=m.split('/'); return (parseInt(q[1],10)||0)*12+(MESES_IDX[q[0]]??0);};
  const oAtual=ordem(mesAtual);
  const fechados=ord.filter(m=>ordem(m)<oAtual).slice(-3);   // 3 últimos FECHADOS, o corrente fora
  if(!fechados.length)return [];
  const media=fechados.reduce((a,m)=>a+porMes[m],0)/fechados.length;
  if(media<=0)return [];

  // meses futuros tocados pelo horizonte (o corrente fica de fora: já está carregado)
  const alvos=[]; const d=new Date(hoje);
  while(d<=limite){
    const m=MESES_ABREV[d.getMonth()]+'/'+d.getFullYear();
    if(m!==mesAtual&&alvos.indexOf(m)<0)alvos.push(m);
    d.setMonth(d.getMonth()+1,1);
  }
  return alvos.map(m=>{
    const lancado=porMes[m]||0;
    return {mes:m,lancado,media,pct:Math.round(lancado/media*100),falta:Math.max(0,media-lancado)};
  }).filter(x=>x.pct<85);
}

// ─────────────────────────────────────────────────────────────── render
function SIM_montarNaAba(){
  const raiz=document.getElementById('simConteudo'); if(!raiz)return;
  const temOverride=(SIM_cfg.saldoOverride!==null&&SIM_cfg.saldoOverride!==undefined);
  if(!SIM_contasProntas&&!temOverride){
    raiz.innerHTML=`<div class="sim-esqueleto">
      <div class="sim-esq-bar" style="width:38%"></div>
      <div class="sim-esq-bar" style="width:62%"></div>
      <div class="sim-esq-bar" style="width:48%"></div>
      <div class="sim-esq-txt">Lendo o saldo das contas bancárias para partir do número certo…</div>
    </div>`;
    setTimeout(SIM_marcarContasProntas,8000);   // prazo de segurança: nunca fica preso no esqueleto
    return;
  }
  const hoje=SIM_hoje(), DIAS=SIM_cfg.horizonte;
  const limite=new Date(hoje); limite.setDate(hoje.getDate()+DIAS-1);
  const saldoIni=SIM_saldoPartida(), meta=SIM_cfg.metaMinima;
  const {recFut,recAtras,pagFut,pagAtras}=SIM_coletar();

  // corte de categoria (só afeta a projeção; nada é apagado)
  const cortadas=SIM_cfg.catsCortadas||[];
  const catTotais={};
  pagFut.forEach(p=>{ if(p.dt>limite)return; const k=p.categoria||'outros'; catTotais[k]=(catTotais[k]||0)+p.valor; });
  const pagProj=pagFut.filter(p=>cortadas.indexOf(p.categoria||'outros')<0);
  const economia=cortadas.reduce((a,c)=>a+(catTotais[c]||0),0);

  // linha do tempo
  const porDiaR={},porDiaP={};
  recFut.forEach(r=>{ const k=SIM_iso(r.dt); (porDiaR[k]=porDiaR[k]||[]).push(r); });
  pagProj.forEach(p=>{ const k=SIM_iso(p.dt); (porDiaP[k]=porDiaP[k]||[]).push(p); });
  let saldo=saldoIni; const linha=[];
  for(let i=0;i<DIAS;i++){
    const d=new Date(hoje); d.setDate(hoje.getDate()+i); const k=SIM_iso(d);
    const rD=porDiaR[k]||[], pD=porDiaP[k]||[];
    const tR=rD.reduce((a,x)=>a+x.valor,0), tP=pD.reduce((a,x)=>a+x.valor,0);
    saldo+=tR-tP;
    linha.push({dt:d,saldo,rD,pD,tR,tP,mov:rD.length+pD.length});
  }
  const ponto=n=>linha[Math.min(n,linha.length)-1]?linha[Math.min(n,linha.length)-1].saldo:saldoIni;
  const s7=ponto(7),s15=ponto(15),s30=ponto(30),sFim=linha.length?linha[linha.length-1].saldo:saldoIni;
  const critico=linha.find(t=>t.saldo<0);
  const criticoMeta=meta>0?linha.find(t=>t.saldo<meta):null;

  // fôlego: anda até 365 dias somando tudo que entra e sai
  let sr=saldoIni, folego=0;
  for(let i=0;i<365;i++){
    const d=new Date(hoje); d.setDate(hoje.getDate()+i); const k=SIM_iso(d);
    sr+=(porDiaR[k]||[]).reduce((a,x)=>a+x.valor,0);
    sr-=(porDiaP[k]||[]).reduce((a,x)=>a+x.valor,0);
    if(sr>=0)folego++; else break;
  }
  const folegoCor=folego>=DIAS?'#16a34a':folego>=Math.round(DIAS/2)?'#f97316':'#dc2626';
  const folegoAte=new Date(hoje); folegoAte.setDate(hoje.getDate()+folego);

  const totRecFut=recFut.reduce((a,r)=>a+r.valor,0), totPagProj=pagProj.reduce((a,p)=>a+p.valor,0);
  const totRecAtras=recAtras.reduce((a,r)=>a+r.valor,0), totPagAtras=pagAtras.reduce((a,p)=>a+p.valor,0);

  // blocos semanais para o gráfico de barras (sempre ~8 barras, largura conforme o horizonte)
  const nBlocos=8, tamBloco=Math.ceil(DIAS/nBlocos), blocos=[];
  for(let b=0;b<nBlocos;b++){
    const fatia=linha.slice(b*tamBloco,(b+1)*tamBloco); if(!fatia.length)continue;
    blocos.push({ini:fatia[0].dt,fim:fatia[fatia.length-1].dt,
      entradas:fatia.reduce((a,t)=>a+t.tR,0), saidas:fatia.reduce((a,t)=>a+t.tP,0),
      saldoFim:fatia[fatia.length-1].saldo});
  }
  const temMov=blocos.some(b=>b.entradas>0||b.saidas>0);
  const pior=temMov?blocos.reduce((m,b)=>b.saldoFim<m.saldoFim?b:m,blocos[0])
                   :{saldoFim:saldoIni,ini:hoje,fim:hoje,entradas:0,saidas:0,vazio:true};

  // quantos ajustes estão REALMENTE em jogo (a chave pode ter sobrado de um lançamento já quitado)
  const todosItens=recFut.concat(recAtras,pagFut,pagAtras);
  const nAjust=todosItens.filter(x=>x.ajustado).length;
  const nNotas=todosItens.filter(x=>SIM_cfg.notas[x.chave]).length;

  const incompletos=SIM_agendaIncompleta(limite);
  const contas=SIM_contasComSaldo();
  const usandoOverride=(SIM_cfg.saldoOverride!==null&&SIM_cfg.saldoOverride!==undefined);

  let h='';

  // ── barra de horizonte
  h+=`<div class="sim-topo">
    <div class="cc-subtabs" style="margin-bottom:0">
      ${SIM_HORIZONTES.map(d=>`<button class="cc-subtab${d===DIAS?' active':''}" onclick="SIM_setHorizonte(${d})">${d} dias</button>`).join('')}
    </div>
    <div style="font-size:.78rem;color:#6b7280">projeção de <b>${SIM_dia(hoje)}</b> a <b>${SIM_dia(limite)}</b></div>
  </div>`;

  // ── cenário ativo: sem isto dá para esquecer 6 datas simuladas e achar que é a projeção crua
  if(nAjust||cortadas.length){
    const partes=[];
    if(nAjust)partes.push(`<b>${nAjust}</b> data(s) simulada(s)`);
    if(cortadas.length)partes.push(`<b>${cortadas.length}</b> categoria(s) cortada(s)`);
    if(nNotas)partes.push(`${nNotas} nota(s)`);
    h+=`<div class="sim-cenario">
      <span class="sim-cenario-ic">🔮</span>
      <div class="sim-cenario-txt"><b>Você está vendo um cenário</b>, não a projeção crua — ${partes.join(' · ')}.</div>
      <button class="sim-cenario-btn" onclick="SIM_limparCenario()">Voltar ao real</button>
    </div>`;
  }

  // ── cartões de saldo
  h+=`<div class="sim-cards">
    <div class="sim-card sim-card-banco">
      <div class="sim-lbl">🏦 Saldo de partida</div>
      <div class="sim-val">${fmt(saldoIni)}</div>
      <div class="sim-sub">${usandoOverride
        ? 'valor que você fixou · real em conta: '+fmt(SIM_saldoBanco())
        : (contas.length?contas.length+' conta(s) bancária(s) · igual ao Fluxo de Caixa':'nenhuma conta com saldo configurado')}</div>
      <div class="sim-btns">
        <button class="sim-btn" onclick="SIM_editarSaldo()">✏️ ${usandoOverride?'Alterar':'Fixar outro valor'}</button>
        ${usandoOverride?`<button class="sim-btn" onclick="SIM_usarSaldoReal()">↩️ Usar o real</button>`:''}
        <button class="sim-btn" onclick="SIM_editarMeta()">🎯 Meta mínima${meta>0?' · '+fmt(meta):''}</button>
      </div>
    </div>
    <div class="sim-card sim-card-fim">
      <div class="sim-lbl">💰 Como o período fecha</div>
      <div class="sim-val">${fmt(sFim)}</div>
      <div class="sim-sub">saldo projetado em ${DIAS} dias</div>
      <div class="sim-chips">
        <div class="sim-chip"><div class="v" style="color:#86efac">${fmt(totRecFut)}</div><div class="l">📥 a receber</div></div>
        <div class="sim-chip"><div class="v" style="color:#fca5a5">${fmt(totPagProj)}</div><div class="l">📤 a pagar</div></div>
        <div class="sim-chip"><div class="v" style="color:${folegoCor}">${folego>=365?'365+':folego}d</div><div class="l">🛫 fôlego</div></div>
      </div>
    </div>
  </div>`;

  // ── aviso de agenda incompleta (o ponto cego do app avulso)
  if(incompletos.length){
    h+=`<div class="sim-aviso sim-aviso-info">
      <span class="ic">🗓️</span>
      <div>
        <div class="t">A agenda dos meses à frente ainda está enchendo</div>
        <div class="d">A despesa fixa desses meses já está toda lançada, a receita não —
        então o fim da projeção sai mais pessimista do que a realidade. Comparando com a média
        faturada dos últimos 3 meses fechados (<b>${fmt(incompletos[0].media)}</b>):
        <ul class="sim-ul">${incompletos.map(x=>`<li><b>${x.mes}</b> tem ${fmt(x.lancado)} lançados — <b>${x.pct}%</b> da média. Historicamente ainda entram ~${fmt(x.falta)}.</li>`).join('')}</ul></div>
      </div>
    </div>`;
  }

  // ── alertas
  const alertas=[];
  if(totRecFut>0){
    const porCliente={}; recFut.forEach(r=>porCliente[r.label]=(porCliente[r.label]||0)+r.valor);
    const top=Object.entries(porCliente).sort((a,b)=>b[1]-a[1])[0];
    if(top){ const pct=Math.round(top[1]/totRecFut*100);
      if(pct>=50)alertas.push({t:'warn',ic:'⚠️',tit:'Concentração de recebíveis',
        d:`<b>${SIM_esc(top[0])}</b> é <b>${pct}%</b> de tudo que há para receber (${fmt(top[1])}).`});
    }
  }
  const grandes7=pagProj.filter(p=>{const dd=(p.dt-hoje)/86400000; return dd>=0&&dd<=7&&p.valor>=5000;});
  if(grandes7.length)alertas.push({t:'danger',ic:'🔔',tit:'Contas grandes nos próximos 7 dias',
    d:`${grandes7.length} conta(s) somando <b>${fmt(grandes7.reduce((a,p)=>a+p.valor,0))}</b>.`});
  if(meta>0&&criticoMeta)alertas.push({t:'warn',ic:'🎯',tit:'Meta de caixa em risco',
    d:`O saldo cai abaixo de <b>${fmt(meta)}</b> em ${Math.round((criticoMeta.dt-hoje)/86400000)} dia(s) — ${criticoMeta.dt.toLocaleDateString('pt-BR')}.`});
  if(critico)alertas.push({t:'critical',ic:'🚨',tit:'Caixa negativo previsto',
    d:`O saldo fica negativo em ${Math.round((critico.dt-hoje)/86400000)} dia(s) — <b>${SIM_diaSem(critico.dt)}</b>, projetado <b style="color:#dc2626">${fmt(critico.saldo)}</b>.`});
  if(!contas.length&&!usandoOverride)alertas.push({t:'warn',ic:'🏦',tit:'Sem saldo de partida',
    d:'Nenhuma conta bancária tem saldo configurado, então a projeção parte do zero.<br>'+
      '<button class="sim-cta" onclick="SIM_irParaContas()">Configurar uma conta</button>'+
      '<button class="sim-cta claro" onclick="SIM_editarSaldo()">Fixar um valor aqui</button>'});

  if(alertas.length){
    h+=`<div class="sim-alertas">`+alertas.map(a=>`<div class="sim-aviso sim-aviso-${a.t}">
      <span class="ic">${a.ic}</span><div><div class="t">${a.tit}</div><div class="d">${a.d}</div></div></div>`).join('')+`</div>`;
  }else{
    h+=`<div class="sim-aviso sim-aviso-ok"><span class="ic">✅</span><div><div class="t">Nenhum alerta — caixa saudável nos próximos ${DIAS} dias.</div></div></div>`;
  }

  // ── fôlego
  h+=`<div class="sim-folego">
    <div class="sim-folego-ic" style="background:${folegoCor}22">🛫</div>
    <div style="flex:1;min-width:0">
      <div class="sim-lbl" style="color:#6b7280">Fôlego de caixa</div>
      <div class="sim-folego-num" style="color:${folegoCor}">${folego>=365?'Mais de 1 ano':folego+' dias'}</div>
      <div style="font-size:.8rem;color:#6b7280;margin-top:3px">Considerando tudo que entra e sai, o caixa fica no positivo por este período.</div>
    </div>
    <div class="sim-folego-ate"><div style="font-size:.72rem;color:#6b7280">Até</div>
      <div style="font-size:.92rem;font-weight:700;color:#374151">${folegoAte.toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'})}</div></div>
  </div>`;

  // ── KPIs
  const kpis=[[7,'7 dias',s7],[15,'15 dias',s15],[30,'30 dias',s30],[DIAS,DIAS+' dias',sFim]]
    .filter((k,i,arr)=>k[0]<=DIAS&&arr.findIndex(x=>x[0]===k[0])===i);
  h+=`<div class="fc-sec">Saldo projetado nestas datas</div><div class="sim-kpis">`+
    kpis.map(k=>{ const d=new Date(hoje); d.setDate(hoje.getDate()+k[0]-1);
      return `<div class="sim-kpi ${k[2]>=0?'pos':'neg'}"><div class="sim-lbl">📅 ${k[1]}</div>
        <div class="sim-kpi-v" style="color:${k[2]>=0?'#16a34a':'#dc2626'}">${fmt(k[2])}</div>
        <div style="font-size:.71rem;color:#9ca3af;margin-top:3px">${SIM_dia(d)}</div></div>`;
    }).join('')+`</div>`;

  // ── gráficos
  h+=`<div class="chart-box" style="margin-top:14px">
    <h3>📈 Evolução do saldo — ${DIAS} dias${meta>0?` <span style="font-weight:400;color:#6b7280;font-size:.85rem">· meta mínima ${fmt(meta)}</span>`:''}</h3>
    <canvas id="simChartLinha" height="88"></canvas>
  </div>
  <div class="chart-box" style="margin-top:14px">
    <h3>📊 Entradas vs Saídas — por bloco de ${tamBloco} dia(s)</h3>
    <canvas id="simChartBarras" height="105"></canvas>
    ${temMov?`<div class="sim-pior">🔴 <b>Bloco mais apertado:</b> ${SIM_dia(pior.ini)} – ${SIM_dia(pior.fim)}
      · saldo ao fim <b style="color:${pior.saldoFim>=0?'#16a34a':'#dc2626'}">${fmt(pior.saldoFim)}</b>
      · entradas ${fmt(pior.entradas)} · saídas ${fmt(pior.saidas)}</div>`:''}
  </div>`;

  // ── cenário: cortar categoria
  const cats=Object.entries(catTotais).sort((a,b)=>b[1]-a[1]);
  h+=`<div class="fc-sec">Cenário — cortar categoria de despesa</div>
  <div class="sim-bloco">
    <p class="sim-nota">Os valores são só o que vence dentro dos ${DIAS} dias. O corte também tira o resto da categoria do cálculo do fôlego. Nada é apagado do sistema.</p>
    <div class="sim-cats">`+
    (cats.length?cats.map(([cat,val])=>{ const info=SIM_catInfo(cat); const on=cortadas.indexOf(cat)>=0;
      return `<label class="sim-cat${on?' off':''}">
        <input type="checkbox" ${on?'checked':''} onchange="SIM_toggleCat('${SIM_jsA(cat)}')">
        <span class="i">${info.icon}</span>
        <span class="n">${SIM_esc(info.label)}${on?' <em>(cortada)</em>':''}</span>
        <span class="v">${fmt(val)}</span></label>`;
    }).join(''):`<div class="sim-vazio">Nenhuma conta futura categorizada neste horizonte.</div>`)+
    `</div>`+
    (cortadas.length?`<div class="sim-eco">💡 Simulando sem <b>${cortadas.length}</b> categoria(s) — economia de <b>${fmt(economia)}</b> no horizonte, já refletida nos números acima.</div>`:'')+
  `</div>`;

  // ── listas
  h+=SIM_listaBloco('recFuturo','📥','A receber — futuros',recFut,'#15803d','#f0fdf4','#bbf7d0',
      recFut.length+' lançamento(s) · entram na projeção');
  if(recAtras.length)h+=SIM_listaBloco('recAtrasado','⚠️','A receber — em atraso',recAtras,'#92400e','#fffbeb','#fde68a',
      recAtras.length+' já venceram · não entram na projeção até você dar uma data',SIM_acoesGrupo('rec'));
  if(pagAtras.length)h+=SIM_listaBloco('pagAtrasado','🔴','Contas vencidas',pagAtras,'#dc2626','#fef2f2','#fecaca',
      pagAtras.length+' já venceram · não entram na projeção até você dar uma data',SIM_acoesGrupo('pag'));

  // ── dia a dia
  h+=`<div class="fc-sec">Previsão dia a dia</div><div class="sim-tl">`;
  const comMov=linha.filter((t,i)=>t.mov>0||i===0||i%7===6);
  comMov.slice(0,80).forEach(t=>{
    const hj=t.dt.getTime()===hoje.getTime();
    const naPior=temMov&&t.dt>=pior.ini&&t.dt<=pior.fim;
    if(!t.mov){
      h+=`<div class="sim-tl-marco${naPior?' pior':''}"><span>${naPior?'🔴 ':''}${SIM_diaSem(t.dt)}</span>
        <span style="font-weight:700;color:${t.saldo>=0?'#16a34a':'#dc2626'}">${fmt(t.saldo)}</span></div>`;
      return;
    }
    const uid='simtl'+t.dt.getTime();
    h+=`<div class="sim-tl-dia${hj?' hoje':''}${naPior?' pior':''}">
      <div class="sim-tl-head" onclick="SIM_toggleDia('${uid}')">
        <div><div class="sim-tl-nome">${hj?'🔴 HOJE — ':naPior?'⚠️ ':''}${SIM_diaSem(t.dt)}</div>
          <div class="sim-tl-badges">${t.tR>0?`<span class="sim-bg rec">+${fmt(t.tR)}</span>`:''}${t.tP>0?`<span class="sim-bg pag">−${fmt(t.tP)}</span>`:''}</div></div>
        <div style="text-align:right"><div style="font-size:.7rem;color:#9ca3af">saldo</div>
          <div style="font-size:.95rem;font-weight:800;color:${t.saldo>=0?'#16a34a':'#dc2626'}">${fmt(t.saldo)}</div></div>
      </div>
      <div id="${uid}" class="sim-tl-det">`;
    t.rD.concat(t.pD).forEach(x=>{ h+=SIM_itemLinha(x); });
    h+=`</div></div>`;
  });
  h+=`</div>`;

  raiz.innerHTML=h;
  SIM_desenharGraficos(linha,blocos,pior,meta,DIAS);
}

// Cenário rápido para um grupo inteiro de vencidos. Vale mais que ajustar um a um: a pergunta
// real é "se eu cobrar tudo isso e entrar em 15 dias, o caixa aguenta?".
function SIM_acoesGrupo(grupo){
  const oQue=grupo==='rec'?'entrasse':'saísse';
  return `<div class="sim-grupo-acoes">
    <span>E se tudo isso ${oQue}</span>
    <button onclick="SIM_trazerGrupo('${grupo}',7)">em 7 dias</button>
    <button onclick="SIM_trazerGrupo('${grupo}',15)">em 15 dias</button>
    <button onclick="SIM_trazerGrupo('${grupo}',30)">em 30 dias</button>
    <button class="limpar" onclick="SIM_limparGrupo('${grupo}')">desfazer</button>
  </div>`;
}

function SIM_listaBloco(id,icone,titulo,itens,cor,bg,borda,sub,acoes){
  const total=itens.reduce((a,x)=>a+x.valor,0);
  return `<div class="sim-lista" style="border-color:${borda}">
    <div class="sim-lista-head" style="background:${bg}" onclick="SIM_toggleSecao('${id}')">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.1rem">${icone}</span>
        <div><div style="font-size:.85rem;font-weight:700;color:${cor}">${titulo}</div>
        <div style="font-size:.72rem;color:#6b7280">${sub}</div></div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:1.05rem;font-weight:900;color:${cor};white-space:nowrap">${fmt(total)}</div>
        <span id="ic-${id}" style="color:#9ca3af;font-size:.9rem">▼</span>
      </div>
    </div>
    <div id="${id}" class="sim-lista-corpo">${acoes||''}${itens.length?itens.map(SIM_itemLinha).join(''):'<div class="sim-vazio">Nada aqui.</div>'}</div>
  </div>`;
}

function SIM_itemLinha(x){
  const rec=x.tipo==='rec';
  const nota=SIM_cfg.notas[x.chave];
  return `<div class="sim-item ${rec?'rec':'pag'}">
    <div style="flex:1;min-width:0">
      <div class="sim-item-n">${rec?'👤':'💳'} ${SIM_esc(x.label)}</div>
      <div class="sim-item-d">${SIM_dia(x.dt)}${x.mes?' · '+x.mes:''}${nota?' · 📝 '+SIM_esc(nota):''}${x.atrasado?' <span class="sim-tag atraso">atrasado</span>':''}${x.ajustado?' <span class="sim-tag sim">🔮 data simulada</span>':''}</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
      <b style="color:${rec?'#16a34a':'#dc2626'};white-space:nowrap">${rec?'+':'−'}${fmt(x.valor)}</b>
      <button class="sim-mini" title="Simular outra data" onclick="SIM_abrirAjuste('${SIM_jsA(x.chave)}','${x.tipo}','${SIM_jsA(x.label)}',${x.valor},'${SIM_iso(x.dt)}')">📅</button>
      <button class="sim-mini" title="Anotar" onclick="SIM_abrirNota('${SIM_jsA(x.chave)}','${SIM_jsA(x.label)}')">📝</button>
    </div>
  </div>`;
}

function SIM_desenharGraficos(linha,blocos,pior,meta,DIAS){
  if(typeof Chart==='undefined')return;
  try{ if(SIM_chartLinha)SIM_chartLinha.destroy(); }catch(e){} SIM_chartLinha=null;
  try{ if(SIM_chartBarras)SIM_chartBarras.destroy(); }catch(e){} SIM_chartBarras=null;

  const passo=Math.max(1,Math.floor(DIAS/16));
  const pts=linha.filter((_,i)=>i%passo===0||i===linha.length-1);
  const cl=document.getElementById('simChartLinha');
  if(cl){
    const dados=pts.map(t=>t.saldo);
    const ds=[{label:'Saldo',data:dados,
      segment:{borderColor:c=>c.p1.parsed.y>=0?'#22c55e':'#ef4444'},
      backgroundColor:'rgba(99,102,241,.06)',tension:.35,fill:true,pointRadius:2,borderWidth:2.5,
      pointBackgroundColor:dados.map(v=>v>=0?'#22c55e':'#ef4444')}];
    if(meta>0)ds.push({label:'Meta mínima',data:dados.map(()=>meta),borderColor:'#f97316',
      borderDash:[6,3],borderWidth:1.5,pointRadius:0,fill:false});
    SIM_chartLinha=new Chart(cl,{type:'line',
      data:{labels:pts.map(t=>SIM_dia(t.dt)),datasets:ds},
      options:{plugins:{legend:{display:meta>0,position:'bottom',labels:{boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{label:c=>c.dataset.label+': '+fmt(c.raw)}}},
        scales:{y:{ticks:{callback:v=>'R$'+Math.round(v/1000)+'k',color:'#6b7280',font:{size:11}},grid:{color:'#f1f5f9'}},
                x:{ticks:{color:'#6b7280',maxTicksLimit:10,font:{size:11}},grid:{display:false}}}}});
  }
  const cb=document.getElementById('simChartBarras');
  if(cb&&blocos.length){
    const iPior=blocos.indexOf(pior);
    SIM_chartBarras=new Chart(cb,{type:'bar',
      data:{labels:blocos.map(b=>SIM_dia(b.ini)),datasets:[
        {label:'Entradas',data:blocos.map(b=>b.entradas),backgroundColor:'rgba(34,197,94,.75)',borderRadius:6,borderSkipped:false},
        {label:'Saídas',data:blocos.map(b=>b.saidas),backgroundColor:blocos.map((_,i)=>i===iPior?'rgba(239,68,68,.95)':'rgba(239,68,68,.6)'),borderRadius:6,borderSkipped:false}]},
      options:{plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:12,font:{size:11}}},
        tooltip:{callbacks:{
          title:c=>'A partir de '+SIM_dia(blocos[c[0].dataIndex].ini),
          label:c=>c.dataset.label+': '+fmt(c.raw),
          afterBody:c=>'Saldo ao fim: '+fmt(blocos[c[0].dataIndex].saldoFim)}}},
        scales:{y:{ticks:{callback:v=>'R$'+Math.round(v/1000)+'k',color:'#6b7280',font:{size:11}},grid:{color:'#f1f5f9'}},
                x:{ticks:{color:'#6b7280',font:{size:11}},grid:{display:false}}}}});
  }
}

// ─────────────────────────────────────────────────────────────── ações
function SIM_toggleSecao(id){
  const el=document.getElementById(id),ic=document.getElementById('ic-'+id); if(!el)return;
  const aberto=el.classList.toggle('aberto'); if(ic)ic.textContent=aberto?'▲':'▼';
}
function SIM_toggleDia(uid){ const el=document.getElementById(uid); if(el)el.classList.toggle('aberto'); }

async function SIM_setHorizonte(d){
  if(SIM_HORIZONTES.indexOf(d)<0)return;
  SIM_cfg.horizonte=d; SIM_montarNaAba(); await SIM_persistir();
}
async function SIM_editarSaldo(){
  const atual=SIM_saldoPartida();
  const v=prompt('Saldo de partida da simulação (R$).\nDeixe em branco para voltar a usar o saldo real das contas.',
    (SIM_cfg.saldoOverride!==null&&SIM_cfg.saldoOverride!==undefined)?SIM_cfg.saldoOverride:atual.toFixed(2));
  if(v===null)return;
  if(String(v).trim()===''){ return SIM_usarSaldoReal(); }
  const n=parseFloat(String(v).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''));
  if(isNaN(n)){ toast('Valor inválido.','#ef4444'); return; }
  SIM_cfg.saldoOverride=n; SIM_montarNaAba(); await SIM_persistir();
  toast('✅ Saldo de partida fixado em '+fmt(n)+'.');
}
async function SIM_usarSaldoReal(){
  SIM_cfg.saldoOverride=null; SIM_montarNaAba(); await SIM_persistir();
  toast('✅ Voltou a usar o saldo real das contas.');
}
async function SIM_editarMeta(){
  const v=prompt('Meta mínima de caixa (R$) — abaixo disso a simulação avisa. Zero desliga o aviso.',SIM_cfg.metaMinima||0);
  if(v===null)return;
  const n=parseFloat(String(v).replace(/\./g,'').replace(',','.').replace(/[^\d.-]/g,''));
  if(isNaN(n)||n<0){ toast('Valor inválido.','#ef4444'); return; }
  SIM_cfg.metaMinima=n; SIM_montarNaAba(); await SIM_persistir();
  toast('✅ Meta mínima atualizada.');
}
async function SIM_toggleCat(cat){
  const i=SIM_cfg.catsCortadas.indexOf(cat);
  if(i>=0)SIM_cfg.catsCortadas.splice(i,1); else SIM_cfg.catsCortadas.push(cat);
  SIM_montarNaAba(); await SIM_persistir();
  toast(i>=0?'Categoria de volta na simulação.':'✂️ Categoria cortada da simulação.','#4f46e5');
}
async function SIM_abrirNota(chave,nome){
  const v=prompt('📝 Nota para "'+nome+'":',SIM_cfg.notas[chave]||'');
  if(v===null)return;
  if(String(v).trim()==='')delete SIM_cfg.notas[chave]; else SIM_cfg.notas[chave]=String(v).trim();
  SIM_montarNaAba(); await SIM_persistir();
  toast('✅ Nota salva.','#4f46e5');
}

function SIM_abrirAjuste(chave,tipo,nome,valor,dataIso){
  SIM_ajusteAtual={chave,tipo,base:dataIso};
  const atual=SIM_cfg.ajustes[chave]||dataIso;
  document.getElementById('simAjTitulo').textContent=tipo==='rec'?'📅 Simular outro recebimento':'📅 Simular outro pagamento';
  document.getElementById('simAjNome').textContent=(tipo==='rec'?'📥 ':'💳 ')+nome;
  document.getElementById('simAjValor').textContent=(tipo==='rec'?'+':'−')+fmt(valor);
  document.getElementById('simAjAtual').textContent=SIM_deIso(dataIso).toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  document.getElementById('simAjData').value=atual;
  document.getElementById('simAjLimpar').style.display=SIM_cfg.ajustes[chave]?'':'none';
  document.getElementById('simAjBg').classList.add('open');
}
function SIM_fecharAjuste(){ document.getElementById('simAjBg').classList.remove('open'); SIM_ajusteAtual=null; }
function SIM_ajusteRapido(dias){
  const inp=document.getElementById('simAjData');
  const base=inp.value||(SIM_ajusteAtual&&SIM_ajusteAtual.base); if(!base)return;
  const d=SIM_deIso(base); d.setDate(d.getDate()+dias); inp.value=SIM_iso(d);
}
async function SIM_confirmarAjuste(){
  if(!SIM_ajusteAtual)return;
  const nova=document.getElementById('simAjData').value;
  if(!nova){ toast('Escolha uma data.','#ef4444'); return; }
  SIM_cfg.ajustes[SIM_ajusteAtual.chave]=nova;
  SIM_fecharAjuste(); SIM_montarNaAba(); await SIM_persistir();
  toast('✅ Data simulada para '+SIM_deIso(nova).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})+'.','#4f46e5');
}
async function SIM_limparAjuste(){
  if(!SIM_ajusteAtual)return;
  delete SIM_cfg.ajustes[SIM_ajusteAtual.chave];
  SIM_fecharAjuste(); SIM_montarNaAba(); await SIM_persistir();
  toast('Data original restaurada.','#6b7280');
}

// ─────────────────────────────────────────────────────────────── cenários em lote
// Joga TODO um grupo de vencidos para daqui a N dias. O `atrasado` guarda o estado original,
// então o grupo continua rastreável mesmo depois de o item ter virado "futuro" na projeção.
async function SIM_trazerGrupo(grupo,dias){
  const {recFut,recAtras,pagFut,pagAtras}=SIM_coletar();
  const alvo=(grupo==='rec'?recFut.concat(recAtras):pagFut.concat(pagAtras)).filter(x=>x.atrasado);
  if(!alvo.length){ toast('Nada vencido neste grupo.','#6b7280'); return; }
  const d=SIM_hoje(); d.setDate(d.getDate()+dias);
  const iso=SIM_iso(d);
  alvo.forEach(x=>{ SIM_cfg.ajustes[x.chave]=iso; });
  SIM_montarNaAba(); SIM_persistir();
  const total=alvo.reduce((a,x)=>a+x.valor,0);
  toast(`🔮 ${alvo.length} lançamento(s) · ${fmt(total)} simulados para ${SIM_deIso(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}.`,'#4f46e5',4000);
}
async function SIM_limparGrupo(grupo){
  const {recFut,recAtras,pagFut,pagAtras}=SIM_coletar();
  const alvo=(grupo==='rec'?recFut.concat(recAtras):pagFut.concat(pagAtras)).filter(x=>x.atrasado&&x.ajustado);
  if(!alvo.length){ toast('Não há data simulada neste grupo.','#6b7280'); return; }
  alvo.forEach(x=>{ delete SIM_cfg.ajustes[x.chave]; });
  SIM_montarNaAba(); SIM_persistir();
  toast('Datas originais restauradas.','#6b7280');
}

// Volta a projeção ao estado cru: sem datas simuladas, sem categoria cortada. As notas ficam —
// nota é informação que o Will escreveu, não parte do cenário.
async function SIM_limparCenario(){
  if(!confirm('Voltar à projeção real?\n\nIsto desfaz todas as datas simuladas e recoloca as categorias cortadas. Suas notas continuam.'))return;
  SIM_cfg.ajustes={}; SIM_cfg.catsCortadas=[];
  SIM_montarNaAba(); SIM_persistir();
  toast('✅ De volta à projeção real.');
}

function SIM_irParaContas(){
  const btn=[...document.querySelectorAll('.nav-main button')].find(b=>b.textContent.indexOf('Contas')>=0);
  showMain('contas',btn||null);
}

// Esc fecha o modal (o resto do sistema não tem isso, mas aqui o modal é de uso repetido).
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const bg=document.getElementById('simAjBg');
  if(bg&&bg.classList.contains('open'))SIM_fecharAjuste();
});
// Fechar a aba com uma gravação ainda no debounce não pode perder o ajuste.
window.addEventListener('beforeunload',()=>{ if(SIM_gravaTimer)SIM_persistirJa(); });
