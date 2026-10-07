// Espelho das correções de Contas a pagar / banco / transferências do Nossa Semente (06/10/2026).
// Funções REAIS extraídas do index.html; nada roda contra o Firebase. Receber (R_) não é tocado.
//   node test/pagar-banco-espelho-ns-20261006.test.mjs
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
const codigo=['BC_debitoLancamento','BC_movContrib','BC_movsDaConta','BC_saldoConta','BC_removerMovPagar','P_idsPorMes','P_idsRemovidos','P_mexeuNoPago',
  'BC_movimentosErrados','BC_planoExclusaoConta','BC_apagarMovsTransf','BC_movsDaTransf'].map(extrair).join('\n');
const api=(fx={})=>new Function('FX',`
  const BC_CONTAS=FX.contas||{};let BC_MOVS=FX.movs||[];const BC_COL_MOV='movimentacoes_contas';const apagados=[];
  function BC_hoje(){return '2026-10-06';} function BC_fbExcluir(col,id){apagados.push(col+'/'+id);}
  ${codigo}
  return {BC_saldoConta,BC_removerMovPagar,P_idsPorMes,P_idsRemovidos,P_mexeuNoPago,BC_movimentosErrados,BC_planoExclusaoConta,BC_apagarMovsTransf,BC_movsDaTransf,
    movs:()=>BC_MOVS,apagados:()=>apagados};
`)(fx);

test('4. saldo atual tem teto em hoje — movimento com data futura não entra',()=>{
  const A=api({contas:{b:{saldoConfigurado:true,saldoInicial:1000,dataSaldoInicial:'2026-01-01'}},
    movs:[{id:'1',contaId:'b',tipo:'saida',valor:100,data:'2026-10-01'},{id:'2',contaId:'b',tipo:'saida',valor:999,data:'2027-01-15'},{id:'3',contaId:'b',tipo:'entrada',valor:50,data:'2026-10-06'}]});
  assert.equal(A.BC_saldoConta('b'),950);
});

test('1. excluir conta a pagar: quais ids saíram, e o débito sai junto',()=>{
  const antes={'OUT/2026':[{id:'a'},{id:'b'}],'NOV/2026':[{id:'c'}]};
  const A=api({movs:[{id:'mov_pagar_b',contaId:'x',origemTipo:'pagar',origemId:'b'},{id:'mov_pagar_c',contaId:'x',origemTipo:'pagar',origemId:'c'}]});
  const ids=A.P_idsPorMes(antes);
  const depois={'OUT/2026':[{id:'a'}],'NOV/2026':[]};
  assert.deepEqual(A.P_idsRemovidos(ids,depois).sort(),['b','c']);
  assert.equal(A.BC_removerMovPagar('b'),true); assert.equal(A.BC_removerMovPagar('b'),false,'idempotente');
  assert.deepEqual(A.movs().map(m=>m.id),['mov_pagar_c']); assert.deepEqual(A.apagados(),['movimentacoes_contas/mov_pagar_b']);
});

test('2. a edição só ressincroniza o banco quando mexeu no que vira movimento',()=>{
  const A=api();
  assert.equal(A.P_mexeuNoPago({valorPago:100},{valorPago:100,nome:'x'}),false);
  assert.equal(A.P_mexeuNoPago({valorPago:100},{valorPago:0}),true);
  assert.equal(A.P_mexeuNoPago({valorPago:100,contaBancariaId:'a'},{valorPago:100,contaBancariaId:'b'}),true);
  assert.equal(A.P_mexeuNoPago({valorPago:100},{valorPago:100,juros:2}),true);
});
test('2b. regra do pagamento na edição está no código: PARCIAL preservado, desmarcar zera, PAGO quita',()=>{
  const f=extrair('salvarContaP');
  assert.match(f,/estavaPaga&&base\.status!=='PAGO'&&!confirm\(/);
  assert.match(f,/mesclado\.valorPago=Math\.min\(pagoAntes,novoValor\);mesclado\.status=mesclado\.valorPago>0\?'PARCIAL':'PENDENTE'/);
  assert.match(f,/else if\(estavaPaga\)\{mesclado\.valorPago=0;mesclado\.status='PENDENTE';delete mesclado\.dataPagamento;\}/);
  assert.match(f,/if\(P_mexeuNoPago\(original,mesclado\)\)\{try\{BC_syncMovPagar\(mesclado\)/);
  assert.match(extrair('confirmarPropagacaoP'),/P_mexeuNoPago\(original,conta\)/);
  assert.match(extrair('confirmarExcluirP'),/P_idsRemovidos\(idsAntes,P_meses\)\.forEach\(cid=>\{if\(BC_removerMovPagar\(cid\)\)estornos\+\+;\}\)/);
});

test('3. varredura: órfão, divergente por valor, banco errado, sem banco; estornada e outras origens ficam fora',()=>{
  const A=api();
  const meses={'OUT/2026':[{id:'d1',nome:'Luz',valorPago:300,contaBancariaId:'b1'},{id:'d2',nome:'Água',valorPago:100,contaBancariaId:'b1',juros:5},{id:'d3',nome:'Sem banco',valorPago:50},{id:'d4',nome:'Zerada',valorPago:0,contaBancariaId:'b1'}]};
  const mv=(id,de,valor,conta='b1',extra={})=>({id:'mov_pagar_'+id,origemTipo:'pagar',origemId:de,contaId:conta,valor,...extra});
  const r=A.BC_movimentosErrados([mv('d1','d1',300),mv('x','sumiu',70),mv('d2','d2',100),mv('d3','d3',50),mv('d4','d4',20),
    {id:'t',origemTipo:'transferencia',origemId:'q',contaId:'b1',valor:9},mv('e','apagada',40,'b1',{estornada:true})],meses);
  assert.deepEqual(r.orfaos.map(m=>m.origemId),['sumiu']); assert.equal(r.valorOrfao,70);
  assert.deepEqual(r.divergentes.map(d=>d.conta.id).sort(),['d2','d3','d4']);
  assert.equal(r.divergentes.find(d=>d.conta.id==='d2').deveria,105,'juros entram no débito (BC_debitoLancamento)');
  assert.equal(r.divergentes.find(d=>d.conta.id==='d3').contaErrada,true,'despesa sem banco com débito pendurado');
  assert.equal(r.total,4);
  assert.equal(A.BC_movimentosErrados([mv('d1','d1',300,'b2')],meses).divergentes[0].contaErrada,true,'banco diferente do vinculado');
  assert.equal(A.BC_movimentosErrados(null,null).total,0);
});
test('3b. a varredura só age com o Pagar hidratado da nuvem e os movimentos lidos — guarda de AÇÃO, não só de tela',()=>{
  const g=extrair('BC_baseCompletaParaVarredura');
  assert.match(g,/P_hidratado/); assert.match(g,/P_nuvemConfiavel/); assert.match(g,/BC_movsOk/);
  const corr=src.slice(src.indexOf('window.BC_corrigirMovimentosErrados'),src.indexOf('function BC_planoExclusaoConta'));
  assert.ok(corr.indexOf('if(!BC_baseCompletaParaVarredura())')<corr.indexOf('BC_fbExcluir'),'aborta antes de apagar');
  assert.match(corr,/Conferido contra '\+meses\+' mês\(es\)/);
  assert.match(corr,/BC_syncMovPagar\(dv\.conta\)/,'divergente é reescrito pelo mesmo caminho da baixa');
});

test('6. plano de exclusão da conta bancária: movimentos, transferências dos dois lados, despesas desvinculadas; Receber fora',()=>{
  const A=api();
  const movs=[{id:'m1',contaId:'a'},{id:'m2',contaId:'b'}];
  const transfs=[{id:'t1',origemId:'a',destinoId:'b'},{id:'t2',origemId:'c',destinoId:'a'},{id:'t3',origemId:'b',destinoId:'c'}];
  const meses={'OUT/2026':[{id:'d1',nome:'Luz',contaBancariaId:'a'},{id:'d2',nome:'Água',contaBancariaId:'b'}]};
  const pl=A.BC_planoExclusaoConta('a',movs,transfs,meses);
  assert.deepEqual(pl.movimentos.map(m=>m.id),['m1']); assert.deepEqual(pl.transferencias.map(t=>t.id),['t1','t2']);
  assert.deepEqual(pl.despesas.map(d=>d.id),['d1']); assert.equal(pl.temHistorico,true);
  assert.equal(A.BC_planoExclusaoConta('z',[],[],{}).temHistorico,false);
  const ex=src.slice(src.indexOf('window.BC_excluirConta'),src.indexOf('function BC_apagarMovsTransf'));
  assert.ok(!/R_todosOsDados|R_lanc|R_salvar/.test(ex),'Receber não é tocado'); assert.match(ex,/delete r\.contaBancariaId/,'despesa é desvinculada, não apagada');
  assert.match(ex,/use Arquivar em vez de excluir/);
});

test('5. transferências: par determinístico, apagar as duas pontas, editar/excluir/concluir existem e a lista é desenhada',()=>{
  const A=api({movs:[{id:'mov_transf_t1_saida'},{id:'mov_transf_t1_entrada'},{id:'outro'}]});
  const par=A.BC_movsDaTransf({id:'t9',origemId:'a',destinoId:'b',valor:300,data:'2026-10-02',descricao:'Reserva'});
  assert.deepEqual(par.map(m=>[m.id,m.contaId,m.tipo,m.valor]),[['mov_transf_t9_saida','a','transferencia_saida',300],['mov_transf_t9_entrada','b','transferencia_entrada',300]]);
  A.BC_apagarMovsTransf('t1'); assert.deepEqual(A.movs().map(m=>m.id),['outro']); assert.equal(A.apagados().length,2);
  assert.match(src,/window\.BC_excluirTransf=async function/); assert.match(src,/window\.BC_concluirTransf=async function/);
  assert.match(extrair('BC_salvarTransf'),/if\(idEd\)\{BC_apagarMovsTransf\(tid\);/,'editar refaz as duas pontas');
  assert.match(extrair('BC_renderPainel'),/BC_renderTransfs\(\)/); assert.ok(src.includes('id="bcTransfs"')&&src.includes('id="bcTransfId"'));
  assert.match(extrair('BC_novaTransf'),/function BC_novaTransf\(id\)/);
});
