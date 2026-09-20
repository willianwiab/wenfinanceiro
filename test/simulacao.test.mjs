// ═══════════════════════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO DE CAIXA (SIM_) — testa o motor sem navegador. Carrega js/simulacao.js dentro de
// uma Function com os globais do WEN injetados como parâmetros (o módulo é script clássico e
// enxerga esses nomes por escopo léxico, então isto reproduz o ambiente real).
//
// O que está sendo protegido aqui:
//   1. CHAVE COMPOSTA id::mês — conta fixa é clonada mês a mês com o MESMO id. Com a chave
//      antiga (só o id), adiar o MICHAEL de julho movia junto o de agosto e o de setembro,
//      e as ocorrências empilhavam no mesmo dia. É o bug que motivou a migração.
//   2. Conta parcialmente paga entra pelo saldo (valor − valorPago), não pelo valor cheio.
//   3. Somente leitura: o motor não pode alterar P_meses nem R_todosOsDados.
//   4. Saldo de partida vem das contas bancárias; o override manda quando existe.
//   5. O aviso de agenda incompleta acusa mês futuro sub-carregado.
//
//   node test/simulacao.test.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(fileURLToPath(new URL('../js/simulacao.js', import.meta.url)), 'utf8');

const MESES_ABREV=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const MESES_IDX={JAN:0,FEV:1,MAR:2,ABR:3,MAI:4,JUN:5,JUL:6,AGO:7,SET:8,OUT:9,NOV:10,DEZ:11};
const CATS_P={aluguel:{label:'Aluguel',icon:'🏠'},pessoal:{label:'Pessoal',icon:'👤'}};

// ── cenário: HOJE é 20/09/2026 (congelado, senão o teste muda de resultado todo dia)
const HOJE=new Date(2026,8,20);
class DataFixa extends Date{ constructor(...a){ if(!a.length) super(HOJE.getTime()); else super(...a); } }

function carregar({R=[],P={},contas={},saldos={}}={}){
  const localStorage={getItem:()=>null,setItem:()=>{}};
  const ctx={
    R_todosOsDados:R, P_meses:P, BC_CONTAS:contas,
    BC_contasAtivas:()=>Object.keys(contas),
    BC_saldoConta:id=>(id in saldos?saldos[id]:null),
    MESES_ABREV, MESES_IDX, CATS_P,
    mesAtualReal:()=>MESES_ABREV[HOJE.getMonth()]+'/'+HOJE.getFullYear(),
    fmt:v=>'R$ '+Number(v||0).toFixed(2),
    toast:()=>{}, Chart:undefined,
    FS_URL:'http://x', FB_API_KEY:'k',
    FB_gravar:async()=>null, toFV:v=>v, fromFV:v=>v,
    fetch:async()=>({ok:false,status:404}),
    localStorage,
    document:{getElementById:()=>null,addEventListener:()=>{},querySelectorAll:()=>[]},
    window:{addEventListener:()=>{}},
    setTimeout, clearTimeout, confirm:()=>true,
    console, Date:DataFixa,
  };
  const nomes=Object.keys(ctx);
  const corpo=SRC+`
    ;SIM_montarNaAba=function(){};                       // render fora do escopo deste teste
     return {SIM_cfg,SIM_coletar,SIM_dataReceber,SIM_chave,SIM_saldoPartida,SIM_saldoBanco,
             SIM_agendaIncompleta,SIM_catInfo,SIM_trazerGrupo,SIM_limparGrupo,SIM_limparCenario,
             ajustes:()=>SIM_cfg.ajustes, setCfg:c=>{Object.assign(SIM_cfg,c);}};`;
  return new Function(...nomes,corpo)(...nomes.map(n=>ctx[n]));
}

let pass=0,fail=0;
const ok=(d,c)=>c?pass++:(fail++,console.log('FALHOU: '+d));
const eq=(d,a,b)=>ok(d+`  (obtido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`,
                     JSON.stringify(a)===JSON.stringify(b));

// ══ 1. chave composta: mesmo id em meses diferentes ══════════════════════════════════════
{
  // MICHAEL é conta fixa clonada: o MESMO id em OUT e NOV, dia 5 nos dois.
  const P={
    'OUT/2026':[{id:'w177',nome:'MICHAEL',valor:1600,dia:5,status:'PENDENTE',categoria:'pessoal'}],
    'NOV/2026':[{id:'w177',nome:'MICHAEL',valor:1600,dia:5,status:'PENDENTE',categoria:'pessoal'}],
  };
  const m=carregar({P});
  const a=m.SIM_coletar();
  eq('duas ocorrências do mesmo id viram dois lançamentos', a.pagFut.length, 2);
  ok('as chaves são diferentes (id::mês)', a.pagFut[0].chave!==a.pagFut[1].chave);
  eq('chave do de outubro', a.pagFut[0].chave, 'w177::OUT/2026');
  eq('chave do de novembro', a.pagFut[1].chave, 'w177::NOV/2026');

  // adia SÓ o de outubro em 10 dias
  m.setCfg({ajustes:{'w177::OUT/2026':'2026-10-15'}});
  const b=m.SIM_coletar();
  const out=b.pagFut.find(x=>x.mes==='OUT/2026'), nov=b.pagFut.find(x=>x.mes==='NOV/2026');
  eq('outubro moveu para o dia 15', out.dt.getDate(), 15);
  eq('outubro fica marcado como simulado', out.ajustado, true);
  eq('novembro NÃO se moveu junto', nov.dt.getDate(), 5);
  eq('novembro segue sem marca de simulado', nov.ajustado, false);
  ok('as duas ocorrências não caem no mesmo dia', out.dt.getTime()!==nov.dt.getTime());
}

// ══ 2. parcialmente paga entra pelo saldo ════════════════════════════════════════════════
{
  const P={'OUT/2026':[
    {id:'a',nome:'PARCIAL',valor:1000,valorPago:400,dia:10,status:'PENDENTE',categoria:'outros'},
    {id:'b',nome:'QUITADA',valor:900,valorPago:900,dia:10,status:'PAGO',categoria:'outros'},
    {id:'c',nome:'ZERADA',valor:500,valorPago:500,dia:10,status:'PENDENTE',categoria:'outros'},
    {id:'d',nome:'SEM DIA',valor:700,dia:null,status:'PENDENTE',categoria:'outros'},
  ]};
  const m=carregar({P});
  const a=m.SIM_coletar();
  eq('só a parcial entra', a.pagFut.length, 1);
  eq('entra pelo que falta, não pelo valor cheio', a.pagFut[0].valor, 600);
}

// ══ 3. somente leitura sobre os dados do sistema ═════════════════════════════════════════
{
  const P={'OUT/2026':[{id:'a',nome:'X',valor:100,dia:10,status:'PENDENTE',categoria:'outros'}]};
  const R=[{id:'r1',cliente:'ACME',mes:'OUT/2026',data:'10/10',saldo:500,valorTotal:500}];
  const antes=JSON.stringify({P,R});
  const m=carregar({P,R});
  m.setCfg({ajustes:{'a::OUT/2026':'2026-11-01'},notas:{'r1::OUT/2026':'ligar'}});
  m.SIM_coletar(); m.SIM_coletar();
  eq('P_meses e R_todosOsDados intactos depois de simular', JSON.stringify({P,R}), antes);
}

// ══ 4. data do recebível: vencimento manda sobre a data da reserva ═══════════════════════
{
  const R=[
    {id:'r1',cliente:'A',mes:'SET/2026',data:'29/09',vencimento:'29/10/2026',saldo:8400,valorTotal:8400},
    {id:'r2',cliente:'B',mes:'SET/2026',data:'25/09',vencimento:'-',saldo:1000,valorTotal:1000},
    {id:'r3',cliente:'C',mes:'MAR/2026',data:'10/03',saldo:780,valorTotal:780},
    {id:'r4',cliente:'D',mes:'OUT/2026',data:'05/10',saldo:0,valorTotal:3000},
  ];
  const m=carregar({R});
  const a=m.SIM_coletar();
  const r1=a.recFut.find(x=>x.label==='A');
  eq('usa o vencimento 29/10, não a data 29/09', r1.dt.getMonth(), 9);
  const r2=a.recFut.find(x=>x.label==='B');
  ok('vencimento "-" cai na data da reserva', !!r2);
  eq('e essa data é 25/09', [r2.dt.getDate(),r2.dt.getMonth()], [25,8]);
  ok('recebível velho de março entra como atrasado', a.recAtras.some(x=>x.label==='C'));
  ok('saldo zero não entra em lugar nenhum',
     !a.recFut.concat(a.recAtras).some(x=>x.label==='D'));
}

// ══ 5. saldo de partida: contas bancárias, com override ══════════════════════════════════
{
  const contas={c1:{saldoConfigurado:true},c2:{saldoConfigurado:true},c3:{saldoConfigurado:false}};
  const m=carregar({contas,saldos:{c1:20000,c2:7000,c3:99999}});
  eq('soma só as contas com saldo configurado', m.SIM_saldoBanco(), 27000);
  eq('sem override, parte do saldo real', m.SIM_saldoPartida(), 27000);
  m.setCfg({saldoOverride:50000});
  eq('com override, o valor fixado manda', m.SIM_saldoPartida(), 50000);
  m.setCfg({saldoOverride:null});
  eq('limpando o override, volta ao real', m.SIM_saldoPartida(), 27000);
}

// ══ 6. aviso de agenda incompleta ════════════════════════════════════════════════════════
{
  // 3 meses fechados com ~70k; outubro (futuro) com só 28k lançados
  const R=[
    {id:'1',cliente:'X',mes:'JUN/2026',data:'10/06',saldo:0,valorTotal:70000},
    {id:'2',cliente:'X',mes:'JUL/2026',data:'10/07',saldo:0,valorTotal:70000},
    {id:'3',cliente:'X',mes:'AGO/2026',data:'10/08',saldo:0,valorTotal:70000},
    {id:'4',cliente:'X',mes:'SET/2026',data:'10/09',saldo:0,valorTotal:76000},
    {id:'5',cliente:'X',mes:'OUT/2026',data:'10/10',saldo:28000,valorTotal:28000},
  ];
  const m=carregar({R});
  const limite=new Date(2026,10,18);           // horizonte de 60 dias a partir de 20/09
  const av=m.SIM_agendaIncompleta(limite);
  const out=av.find(x=>x.mes==='OUT/2026');
  ok('outubro é apontado como agenda incompleta', !!out);
  eq('média dos 3 fechados (jun/jul/ago)', out.media, 70000);
  eq('outubro está em 40% da média', out.pct, 40);
  eq('falta estimada', out.falta, 42000);
  ok('o mês corrente (setembro) não é acusado', !av.some(x=>x.mes==='SET/2026'));
  ok('novembro, sem nada lançado, também é acusado', av.some(x=>x.mes==='NOV/2026'));

  // o mês corrente pode ainda não ter NENHUM lançamento — a média não pode comer um mês fechado
  const semSet=R.filter(x=>x.mes!=='SET/2026');
  const m2=carregar({R:semSet});
  const av2=m2.SIM_agendaIncompleta(limite);
  eq('sem setembro lançado, a média ainda é jun+jul+ago',
     av2.find(x=>x.mes==='OUT/2026').media, 70000);
}

// ══ 7. rótulo de categoria vem do CATS_P do sistema ══════════════════════════════════════
{
  const m=carregar({});
  eq('categoria conhecida usa o rótulo do sistema', m.SIM_catInfo('aluguel').label, 'Aluguel');
  eq('categoria desconhecida não quebra', m.SIM_catInfo('xpto').label, 'xpto');
  eq('sem categoria vira Outros', m.SIM_catInfo('').label, 'Outros');
}

// ══ 8. cenário em lote sobre os vencidos ════════════════════════════════════════════════
{
  const R=[
    {id:'v1',cliente:'EVOPE',mes:'AGO/2026',data:'10/08',vencimento:'10/09/2026',saldo:4277,valorTotal:4277},
    {id:'v2',cliente:'JACARE',mes:'AGO/2026',data:'10/08',vencimento:'10/09/2026',saldo:3360,valorTotal:3360},
    {id:'f1',cliente:'FUTURO',mes:'OUT/2026',data:'10/10',vencimento:'10/10/2026',saldo:1000,valorTotal:1000},
  ];
  const P={'AGO/2026':[{id:'pv',nome:'DAS',valor:3000,dia:20,status:'PENDENTE',categoria:'impostos'}]};
  const m=carregar({R,P});
  eq('2 recebíveis vencidos antes', m.SIM_coletar().recAtras.length, 2);

  await m.SIM_trazerGrupo('rec',15);
  const a=m.SIM_coletar();
  eq('nenhum recebível vencido sobrou', a.recAtras.length, 0);
  eq('os dois foram para o futuro', a.recFut.filter(x=>x.ajustado).length, 2);
  eq('todos na mesma data (hoje + 15 = 05/10)',
     [...new Set(a.recFut.filter(x=>x.ajustado).map(x=>x.dt.toISOString().slice(0,10)))], ['2026-10-05']);
  eq('o lançamento que já era futuro não foi tocado',
     a.recFut.find(x=>x.label==='FUTURO').ajustado, false);
  eq('o grupo de PAGAR não foi afetado', m.SIM_coletar().pagAtras.length, 1);

  await m.SIM_limparGrupo('rec');
  eq('desfazer devolve os dois ao atraso', m.SIM_coletar().recAtras.length, 2);

  // limpar cenário zera datas simuladas e cortes, mas preserva as notas
  await m.SIM_trazerGrupo('rec',30);
  m.setCfg({catsCortadas:['impostos'],notas:{'v1::AGO/2026':'cobrar por telefone'}});
  await m.SIM_limparCenario();
  eq('cenário limpo: nenhum ajuste', Object.keys(m.ajustes()).length, 0);
  eq('cenário limpo: nenhuma categoria cortada', m.SIM_cfg.catsCortadas.length, 0);
  eq('as notas sobrevivem', m.SIM_cfg.notas['v1::AGO/2026'], 'cobrar por telefone');
}

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail?1:0);
