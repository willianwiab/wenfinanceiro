// Espelho das correções de cartão do Nossa Semente (06/10/2026) — provadas com os padrões dos
// OFX reais do Inter (jul/set) e do Nubank (ago), reproduzidos em texto sintético.
// Funções REAIS extraídas do index.html; nada roda contra o Firebase.
//   node test/cartao-espelho-ns-20261006.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz=fileURLToPath(new URL('..',import.meta.url));
const src=fs.readFileSync(raiz+'/index.html','utf8');
function extrair(nome){
  const inicio=src.indexOf('function '+nome+'(');
  if(inicio<0)throw new Error('função não encontrada: '+nome);
  const abre=src.indexOf('{',inicio);let nivel=0,fim=abre;
  for(;fim<src.length;fim++){if(src[fim]==='{')nivel++;else if(src[fim]==='}'){nivel--;if(!nivel)break;}}
  return src.slice(inicio,fim+1);
}
const MES=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
const codigo=['IMP_parseOFX','IMP_ofxTotalDeclarado','IMP_ehPagamentoCartao','IMP_normalizarCartaoOFX','IMP_parseParcela',
  'C_norm','C_descSemParc','C_gidSerieParcela','C_ymAdd','C_temFaturaReal','C_montarParcelamentos','C_mesInicioDoItem','C_serieDoItem',
  'C_subconjuntoQueSoma','C_planoExclusaoFaturaWen','C_lancarFaturaEmPagar'].map(extrair).join('\n');
const api=(fx={})=>new Function('FX',`
  let C_faturas=FX.faturas||[],C_parcelamentos=FX.parcelamentos||[],P_meses=FX.P_meses||{};
  const chamadasBC=[];
  function P_salvarStorage(){} function BC_hoje(){return '2026-10-06';}
  function BC_syncMovPagar(r){chamadasBC.push(JSON.parse(JSON.stringify(r)));}
  function C_ymToWen(ym){const p=String(ym).split('-');return ${JSON.stringify(MES)}[+p[1]-1]+'/'+p[0];}
  ${codigo}
  return {IMP_parseOFX,IMP_ofxTotalDeclarado,IMP_normalizarCartaoOFX,IMP_parseParcela,C_montarParcelamentos,C_serieDoItem,
    C_subconjuntoQueSoma,C_planoExclusaoFaturaWen,C_lancarFaturaEmPagar,
    P_meses:()=>P_meses,chamadasBC:()=>chamadasBC,setParcs:(p)=>{C_parcelamentos=p;}};
`)(fx);

// OFX em texto, nas convenções reais: TRNTYPE semântico (compra DEBIT, crédito CREDIT, pagamento PAYMENT)
const ofx=(itens,{balamt=null}={})=>`OFXHEADER:100\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>\n`
  +itens.map((it,i)=>`<STMTTRN><TRNTYPE>${it.tipo||(it.v<0?'DEBIT':'CREDIT')}<DTPOSTED>${(it.d||'2026-10-03').replace(/-/g,'')}<TRNAMT>${it.v.toFixed(2)}<FITID>F${i}<NAME>${it.n||''}<MEMO>${it.m||''}</STMTTRN>`).join('\n')
  +`\n</BANKTRANLIST>${balamt==null?'':`<LEDGERBAL><BALAMT>${balamt}</LEDGERBAL>`}</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
const soma=a=>Math.round(a.reduce((s,m)=>s+m.valor,0)*100)/100;

test('1. Inter: "Estorno deb automatico" (estorno de PAGAMENTO) não inverte a fatura; TRNTYPE manda',()=>{
  const A=api();
  const n=A.IMP_normalizarCartaoOFX(A.IMP_parseOFX(ofx([
    {n:'MERCADO',v:-450.30,tipo:'DEBIT'},{n:'POSTO',v:-200,tipo:'DEBIT'},{n:'NETFLIX',v:-55.90,tipo:'DEBIT'},
    {n:'EST DEB AUTOM PARCIAL M',m:'AJUSTE | Estorno deb automatico',v:-20.45,tipo:'DEBIT'},
    {n:'DEB AUT PARCIAL',m:'PAGAMENTO | Debito automatico parcial',v:20.45,tipo:'CREDIT'},
    {n:'PAGAMENTO DE FATURA',m:'PAGAMENTO | Pagamento fatura anterior',v:12507.36,tipo:'CREDIT'},
  ])));
  const compras=n.filter(m=>!m.pagamento);
  assert.ok(compras.every(m=>m.valor>0),'compras positivas: '+compras.map(m=>m.valor));
  assert.equal(n.filter(m=>m.pagamento).length,3,'as 3 linhas de mecânica de pagamento marcadas');
  assert.ok(n.filter(m=>m.pagamento).every(m=>m.incluir===false),'…e já desmarcadas na revisão');
  assert.equal(soma(compras),706.20);
});

test('2. Nubank: NAME vazio, "Pagamento recebido" fora, compras positivas',()=>{
  const A=api();
  const n=A.IMP_normalizarCartaoOFX(A.IMP_parseOFX(ofx([
    {m:'Mercado Extra',v:-412.90,tipo:'DEBIT'},{m:'Dr Marcos Cro Sp - Parcela 1/10',v:-200,tipo:'DEBIT'},
    {m:'Pagamento recebido',v:4018.83,tipo:'CREDIT'},{m:'Pagamento recebido',v:400,tipo:'CREDIT'},
  ])));
  assert.deepEqual(n.filter(m=>m.pagamento).map(m=>m.valor),[-4018.83,-400]);
  assert.equal(soma(n.filter(m=>!m.pagamento)),612.90);
  assert.equal(n[0].descricao,'Mercado Extra','descrição vem do MEMO');
});

test('3. fatura só de estorno (um CREDIT positivo) vira crédito, não cobrança',()=>{
  const A=api();
  const n=A.IMP_normalizarCartaoOFX(A.IMP_parseOFX(ofx([{m:'ESTORNO COMPRA',v:250,tipo:'CREDIT'}])));
  assert.equal(n[0].valor,-250);
});

test('3b. sem TRNTYPE a regra de 27/08 (maioria) continua valendo',()=>{
  const A=api();
  const txt=ofx([{m:'Loja A',v:-100},{m:'Loja B',v:-100},{m:'Loja C',v:-100},{m:'Pagamento recebido',v:1000}]).replace(/<TRNTYPE>[A-Z]+/g,'');
  const n=A.IMP_normalizarCartaoOFX(A.IMP_parseOFX(txt));
  assert.ok(n.filter(m=>/Loja/.test(m.descricao)).every(m=>m.valor>0));
});

test('4. BALAMT único vira total declarado; vários, não',()=>{
  const A=api();
  assert.equal(A.IMP_ofxTotalDeclarado(ofx([{m:'x',v:-1}],{balamt:'-4292.36'})),-4292.36);
  assert.equal(A.IMP_ofxTotalDeclarado(ofx([{m:'x',v:-1}])+'<LEDGERBAL><BALAMT>1</LEDGERBAL><LEDGERBAL><BALAMT>2</LEDGERBAL>'),null);
});

test('5. IMP_parseParcela varre todas as ocorrências (NAME truncado antes do MEMO)',()=>{
  const A=api();
  assert.deepEqual(A.IMP_parseParcela('EBN Canva04850 29 - parcela 05/1 EBN Canva04850 29 - parcela 05/12'),{atual:5,total:12});
  assert.deepEqual(A.IMP_parseParcela('Dr Marcos Cro Sp - Parcela 1/10'),{atual:1,total:10});
  assert.deepEqual(A.IMP_parseParcela('PG *PAGPOLAR DIARIODO (Parcela 05 de 06) | Cartão 5364'),{atual:5,total:6});
  assert.equal(A.IMP_parseParcela('MERCADO BOM PRECO'),null);
});

const item=(descricao,valor,data,atual,total)=>({descricao,valor,dataCompra:data,fitid:descricao+'_'+atual+'_'+data,parcela:{atual,total},categoria:'t'});
test('6. Nubank: parcela postada com a data do CICLO = UMA série, com a data da primeira compra',()=>{
  const A=api();
  const ago={id:'nu_2026-08',cartaoId:'nu',mesFatura:'2026-08',itens:[item('Dr Marcos Cro Sp - Parcela 1/10',200,'2026-07-26',1,10)]};
  const set={id:'nu_2026-09',cartaoId:'nu',mesFatura:'2026-09',itens:[item('Dr Marcos Cro Sp - Parcela 2/10',200,'2026-09-06',2,10)]};
  const out={id:'nu_2026-10',cartaoId:'nu',mesFatura:'2026-10',itens:[item('Dr Marcos Cro Sp - Parcela 3/10',200,'2026-10-03',3,10)]};
  const s=A.C_montarParcelamentos([ago,set,out]);
  assert.equal(s.length,1,JSON.stringify(s.map(p=>[p.parcelaAtual,p.dataCompraOrigem])));
  assert.equal(s[0].parcelaAtual,3); assert.equal(s[0].dataCompraOrigem,'2026-07-26'); assert.equal(s[0].ativo,true);
});

test('6b. duas compras iguais no mesmo mês (dias diferentes) seguem duas séries — e as duas avançam',()=>{
  const A=api();
  const ago={id:'nu_2026-08',cartaoId:'nu',mesFatura:'2026-08',itens:[item('Cafe Blend - Parcela 1/2',50,'2026-08-01',1,2),item('Cafe Blend - Parcela 1/2',50,'2026-08-05',1,2)]};
  const set={id:'nu_2026-09',cartaoId:'nu',mesFatura:'2026-09',itens:[item('Cafe Blend - Parcela 2/2',50,'2026-09-10',2,2),item('Cafe Blend - Parcela 2/2',50,'2026-09-10',2,2)]};
  const s=A.C_montarParcelamentos([ago,set]);
  assert.equal(s.length,2); assert.ok(s.every(p=>p.parcelaAtual===2&&!p.ativo));
});

test('6c. Inter continua igual: data original repetida casa pela data (fixture do teste de prévias)',()=>{
  const A=api();
  const jul={id:'i_2026-07',cartaoId:'i',mesFatura:'2026-07',itens:[item('PIX CRED PARCELADO - LA MARTINS',58.39,'2026-06-24',1,2),item('PIX CRED PARCELADO - LA MARTINS',58.39,'2026-06-27',1,2)]};
  const ago={id:'i_2026-08',cartaoId:'i',mesFatura:'2026-08',itens:[item('PIX CRED PARCELADO (Parcela 02 de 02)',58.38,'2026-06-24',2,2),item('PIX CRED PARCELADO (Parcela 02 de 02)',58.38,'2026-06-27',2,2)]};
  const s=A.C_montarParcelamentos([jul,ago]);
  assert.equal(s.length,2); assert.deepEqual(s.map(p=>p.dataCompraOrigem).sort(),['2026-06-24','2026-06-27']);
});

test('6d. C_serieDoItem acha a série do item do Nubank mesmo com data do ciclo',()=>{
  const A=api();
  const ago={id:'nu_2026-08',cartaoId:'nu',mesFatura:'2026-08',itens:[item('Dr Marcos - Parcela 1/10',200,'2026-07-26',1,10)]};
  const set={id:'nu_2026-09',cartaoId:'nu',mesFatura:'2026-09',itens:[item('Dr Marcos - Parcela 2/10',200,'2026-09-06',2,10)]};
  A.setParcs(A.C_montarParcelamentos([ago,set]));
  assert.ok(A.C_serieDoItem(set,set.itens[0]),'série encontrada para recategorizar');
});

test('7. subconjunto que soma',()=>{
  const A=api();
  assert.deepEqual(A.C_subconjuntoQueSoma([4018.83,400],400),[400]);
  assert.equal(A.C_subconjuntoQueSoma([4018.83,400],123.45),null);
  assert.equal(A.C_subconjuntoQueSoma([],10),null);
});

test('8. adiantamento vira pagamento parcial; reimportar não soma; baixa manual sobrevive; sem arquivo volta',()=>{
  const A=api({P_meses:{'OUT/2026':[]}});
  const cartao={nome:'Nubank',diaVencimento:27};
  const fat=(adiant)=>({id:'nu_2026-10',cartaoId:'nu',mesFatura:'2026-10',totalItens:4692.35,itens:[],pagamentosAntecipados:adiant});
  A.C_lancarFaturaEmPagar(fat([{valor:400,data:'2026-10-02'}]),cartao);
  let c=A.P_meses()['OUT/2026'][0];
  assert.equal(c.valorPago,400); assert.equal(c.pagoAntecipado,400); assert.equal(c.status,'PENDENTE'); assert.equal(A.chamadasBC().length,0,'sem banco, nada no razão');
  A.C_lancarFaturaEmPagar(fat([{valor:400,data:'2026-10-02'}]),cartao);
  c=A.P_meses()['OUT/2026'][0]; assert.equal(c.valorPago,400,'reimportar não soma');
  c.valorPago=500; c.contaBancariaId='bco1';                                    // baixa manual de 100 + vinculou banco
  A.C_lancarFaturaEmPagar(fat([{valor:400,data:'2026-10-02'}]),cartao);
  c=A.P_meses()['OUT/2026'][0]; assert.equal(c.valorPago,500,'manual 100 + adiantado 400');
  A.C_lancarFaturaEmPagar(fat([]),cartao);
  c=A.P_meses()['OUT/2026'][0]; assert.equal(c.valorPago,100,'arquivo sem adiantamento devolve só ele'); assert.equal(c.pagoAntecipado,0);
  assert.ok(A.chamadasBC().length>=1,'com banco vinculado, o razão acompanha');
  assert.equal(A.chamadasBC()[A.chamadasBC().length-1].id,'fat_nu_2026-10');
});

test('8b. adiantamento igual à fatura nasce PAGA na data do adiantamento; banco recebe a data certa',()=>{
  const A=api({P_meses:{'OUT/2026':[{id:'fat_nu_2026-10',faturaId:'nu_2026-10',valor:450.30,valorPago:0,contaBancariaId:'bco1'}]}});
  A.C_lancarFaturaEmPagar({id:'nu_2026-10',cartaoId:'nu',mesFatura:'2026-10',totalItens:450.30,itens:[],pagamentosAntecipados:[{valor:450.30,data:'2026-10-02'}]},{nome:'Nubank'});
  const c=A.P_meses()['OUT/2026'][0];
  assert.equal(c.status,'PAGO'); assert.equal(c.dataPagamento,'2026-10-02');
  assert.equal(A.chamadasBC()[0].dataPagamento,'2026-10-02');
});

test('9. plano de exclusão de UMA fatura',()=>{
  const A=api();
  const faturas=[{id:'nu_2026-10',cartaoId:'nu',mesFatura:'2026-10',totalItens:100,itens:[{}]},{id:'nu_2026-09',cartaoId:'nu',mesFatura:'2026-09',totalItens:50,itens:[]}];
  const meses={'OUT/2026':[{id:'fat_nu_2026-10',faturaId:'nu_2026-10',valorPago:100},{id:'x',nome:'Aluguel'}],'SET/2026':[{id:'fat_nu_2026-09',faturaId:'nu_2026-09',valorPago:0}]};
  const parcs=[{id:'p1',cartaoId:'nu',mesInicio:'2026-10'},{id:'p2',cartaoId:'nu',mesInicio:'2026-09'},{id:'p3',cartaoId:'outro',mesInicio:'2026-10'}];
  const movs=[{id:'mov_pagar_fat_nu_2026-10',origemTipo:'pagar',origemId:'fat_nu_2026-10'},{id:'m2',origemTipo:'pagar',origemId:'x'}];
  const pl=A.C_planoExclusaoFaturaWen('nu_2026-10',faturas,meses,parcs,movs);
  assert.deepEqual(pl.contas.map(c=>c.id),['fat_nu_2026-10']);
  assert.deepEqual(pl.parcelamentos,['p1']);
  assert.deepEqual(pl.movsReverter,['mov_pagar_fat_nu_2026-10']);
  assert.equal(pl.pago,true);
  assert.equal(A.C_planoExclusaoFaturaWen('nao_existe',faturas,meses,parcs,movs),null);
});
