// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVOLUÇÃO DOS GASTOS no WEN — espelho do Nossa Semente. O MOTOR EV_ é LITERAL (idêntico ao NS,
// provado por test/ev-paridade.test.mjs). Só a UI e um ADAPTADOR de dados são específicos do WEN.
// Adaptador: reconstrói P_meses/CF_contas em SHAPE-NS (mês 'AAAA-MM', campos contaFinanceiraId/
// criadoPor) a partir dos dados do WEN (mês 'JUL/2026', contaBancariaId, responsavel). C_faturas e
// C_parcelamentos do WEN JÁ estão em shape-NS (mês AAAA-MM) → usados direto.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ponte de escopo global: let/const de outro <script> não vão pro window, mas scripts clássicos
// compartilham o escopo léxico global — então aqui (fora do IIFE) enxergamos os globais do WEN.
function __EVW(){ return {
  P_meses: (typeof P_meses!=='undefined'&&P_meses)||{},
  C_faturas: (typeof C_faturas!=='undefined'&&C_faturas)||[],
  C_parcelamentos: (typeof C_parcelamentos!=='undefined'&&C_parcelamentos)||[],
  C_cartoes: (typeof C_cartoes!=='undefined'&&C_cartoes)||[],
  BC_CONTAS: (typeof BC_CONTAS!=='undefined'&&BC_CONTAS)||{},
}; }
(function () {
  // helpers puros iguais aos do NS (o motor os chama por estes nomes)
  function C_normalizar(desc){ let s=(desc||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); s=s.replace(/\bparc\w*\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/gi,' '); s=s.replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g,' ').replace(/[0-9]+/g,' '); return s.replace(/[^a-z\s]/g,' ').replace(/\s+/g,' ').trim(); }
  function C_lev(a,b){ const m=a.length,n=b.length; if(!m)return n; if(!n)return m; const d=Array.from({length:m+1},(_,i)=>[i,...Array(n).fill(0)]); for(let j=0;j<=n;j++)d[0][j]=j; for(let i=1;i<=m;i++)for(let j=1;j<=n;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1)); return d[m][n]; }
  function C_similaridade(a,b){ if(!a||!b)return 0; const L=Math.max(a.length,b.length); return L?1-C_lev(a,b)/L:0; }
  // shadows em shape-NS (reconstruídos a cada render)
  let P_meses={}, CF_contas=[], C_faturas=[], C_parcelamentos=[], C_cartoes=[];
  function isoDeWen(wm){ try{ return C_ymFromWen(wm); }catch(e){ return wm; } }
  function EV_mesWenAtualIso(){ try{ return isoDeWen(mesSelecionado()); }catch(e){} try{ return isoDeWen(mesAtualReal()); }catch(e){} return new Date().toISOString().slice(0,7); }
  function evMesLabel(iso){ const M=['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']; const [a,m]=String(iso).split('-'); return M[(+m||1)-1]+' de '+a; }
  function esc(s){ try{ if(typeof escapeHtml==='function')return escapeHtml(s); }catch(e){} return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function jsA(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/&/g,'&amp;').replace(/'/g,"\\'").replace(/"/g,'&quot;').replace(/</g,'&lt;'); }
  function fmt(n){ return 'R$ '+(Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  // slug do WEN -> rótulo de exibição (Aluguel/Consumo/...). A análise passa a agrupar por RÓTULO,
  // então blocos da SophIA, rankings e card já saem com o nome bonito (o motor é literal do NS).
  function _catL(slug){ try{ const c=CATS_P[slug]; return c?c.label:(slug||'Outros'); }catch(e){ return slug||'Outros'; } }
  function EV_rebuild(){
    const W=__EVW();
    // contas a pagar do WEN: mês 'JUL/2026' -> iso; contaBancariaId->contaFinanceiraId; responsavel->criadoPor
    const src=W.P_meses||{}; const P={};
    Object.keys(src).forEach(wm=>{ const iso=isoDeWen(wm); (P[iso]=P[iso]||[]); (src[wm]||[]).forEach(r=>{
      P[iso].push({ id:r.id, nome:r.nome, valor:Number(r.valor)||0, valorPago:r.valorPago, categoria:_catL(r.categoria||'outros'), contaFinanceiraId:r.contaBancariaId||null, criadoPor:r.responsavel||null, faturaId: r.faturaCartao?(r.faturaCartao.cartaoId+'_'+r.faturaCartao.mes):(r.faturaId||null) });
    }); });
    P_meses=P;
    // C_faturas/C_parcelamentos já estão em shape-NS (mês AAAA-MM); só remapeamos categoria slug->rótulo (sem mutar o original)
    C_faturas=(W.C_faturas||[]).map(f=>Object.assign({},f,{ itens:(f.itens||[]).map(it=>Object.assign({},it,{categoria:_catL(it.categoria||'outros')})) }));
    C_parcelamentos=(W.C_parcelamentos||[]).map(p=>Object.assign({},p,{categoria:_catL(p.categoria||'outros')}));
    C_cartoes=W.C_cartoes||[];
    const bc=W.BC_CONTAS||{};
    CF_contas=Object.keys(bc).map(id=>({ id, nomePersonalizado:(bc[id].nome||bc[id].banco||'Conta'), instituicaoNome:(bc[id].banco||'') }));
  }
function EV_catId(nome) { return C_normalizar(nome || 'outros').replace(/\s+/g, '_') || 'outros'; }
function EV_meioConta(contaId) {
  try { const c = (typeof CF_contas !== 'undefined' ? CF_contas : []).find(x => x.id === contaId); if (c) return { tipo: 'conta', id: c.id, nome: c.nomePersonalizado || c.instituicaoNome || 'Conta' }; } catch (e) {}
  return { tipo: 'outro', id: null, nome: 'Sem conta' };
}
function EV_meioCartao(cartaoId) {
  try { const c = (typeof C_cartoes !== 'undefined' ? C_cartoes : []).find(x => x.id === cartaoId); return { tipo: 'cartao', id: cartaoId || null, nome: (c && c.nome) || 'Cartão' }; } catch (e) { return { tipo: 'cartao', id: cartaoId || null, nome: 'Cartão' }; }
}
// Coleta os lançamentos de UM mês como itens detalhados (categoria + valor + meio + integrante + descrição
// + parcela). Espelha EXATAMENTE as fontes e o de-dup do D_gasto (contas sem faturaId + itens de fatura +
// parcelas projetadas), pra o total bater com o rateio. `modo`: competencia | pagamento | compromissos.
function EV_coleta(anoMes, modo) {
  const m = modo || 'competencia', itens = [];
  const add = o => { if ((o.valor || 0) > 0 && o.categoria !== 'Estornos/Créditos') itens.push(o); };
  (typeof P_meses !== 'undefined' ? (P_meses[anoMes] || []) : []).forEach(c => {
    if (c.faturaId) return;
    add({ fonte: 'conta', categoria: c.categoria || 'Outros', valor: Number(c.valor) || 0, meio: EV_meioConta(c.contaFinanceiraId), integrante: c.criadoPor || null, desc: c.nome || '', parcela: null });
  });
  const faturas = (typeof C_faturas !== 'undefined' ? C_faturas : []);
  if (m === 'pagamento') {
    faturas.filter(f => f.mesFatura === anoMes).forEach(f => (f.itens || []).forEach(it => add({ fonte: 'fat', categoria: it.categoria || 'Outros', valor: Number(it.valor) || 0, meio: EV_meioCartao(f.cartaoId), integrante: f.criadoPor || null, desc: it.descricao || '', parcela: it.parcela || null })));
  } else if (m === 'compromissos') {
    // valor TOTAL contratado no mês da compra (parcelada = valor da parcela × nº de parcelas), contado uma vez
    faturas.forEach(f => (f.itens || []).forEach(it => {
      if ((it.dataCompra || '').slice(0, 7) !== anoMes) return;
      if (it.parcela && (it.parcela.atual || 1) > 1) return;   // só no mês da 1ª parcela
      const tot = it.parcela ? (Number(it.valor) || 0) * (it.parcela.total || 1) : (Number(it.valor) || 0);
      add({ fonte: 'fat', categoria: it.categoria || 'Outros', valor: tot, meio: EV_meioCartao(f.cartaoId), integrante: f.criadoPor || null, desc: it.descricao || '', parcela: it.parcela || null, contratado: true });
    }));
  } else {
    faturas.forEach(f => (f.itens || []).forEach(it => { if ((it.dataCompra || '').slice(0, 7) === anoMes) add({ fonte: 'fat', categoria: it.categoria || 'Outros', valor: Number(it.valor) || 0, meio: EV_meioCartao(f.cartaoId), integrante: f.criadoPor || null, desc: it.descricao || '', parcela: it.parcela || null }); }));
  }
  // parcelas projetadas de meses ainda sem fatura importada (não entram no modo compromissos: já contadas na compra)
  if (m !== 'compromissos') {
    (typeof C_parcelamentos !== 'undefined' ? C_parcelamentos : []).filter(p => p.ativo).forEach(p => {
      const [ay, am] = (p.mesInicio || '').split('-').map(Number); if (!ay) return;
      for (let n = (p.parcelaAtual || 0) + 1; n <= (p.totalParcelas || 0); n++) {
        const d = new Date(ay, am - 1 + (n - 1), 1), k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
        if (k === anoMes) add({ fonte: 'parc', categoria: p.categoria || 'Outros', valor: Number(p.valorParcela) || 0, meio: EV_meioCartao(p.cartaoId), integrante: p.criadoPor || null, desc: p.descricao || '', parcela: { atual: n, total: p.totalParcelas } });
      }
    });
  }
  return itens;
}
// Aplica os filtros combinados (§7) sobre os itens coletados.
function EV_filtrar(itens, filtro) {
  const f = filtro || {};
  return (itens || []).filter(it => {
    if (f.categoria && (it.categoria || 'Outros') !== f.categoria) return false;
    if (f.meioTipo && it.meio.tipo !== f.meioTipo) return false;
    if (f.meioId && it.meio.id !== f.meioId) return false;
    if (f.integrante && it.integrante !== f.integrante) return false;
    if (f.soParceladas && !it.parcela) return false;
    if (f.soAVista && it.parcela) return false;
    return true;
  });
}
// Totais de um conjunto de itens: total, quantidade, ticket médio, e mapas por categoria/meio/integrante.
function EV_totais(itens) {
  const r = { total: 0, qtd: (itens || []).length, ticket: 0, porCategoria: {}, porMeio: {}, porIntegrante: {} };
  (itens || []).forEach(it => {
    const v = Number(it.valor) || 0; r.total += v;
    r.porCategoria[it.categoria || 'Outros'] = (r.porCategoria[it.categoria || 'Outros'] || 0) + v;
    const mk = it.meio.tipo + ':' + (it.meio.id || it.meio.nome);
    if (!r.porMeio[mk]) r.porMeio[mk] = { nome: it.meio.nome, tipo: it.meio.tipo, valor: 0 };
    r.porMeio[mk].valor += v;
    if (it.integrante) r.porIntegrante[it.integrante] = (r.porIntegrante[it.integrante] || 0) + v;
  });
  r.total = Math.round(r.total * 100) / 100;
  r.ticket = r.qtd ? Math.round(r.total / r.qtd * 100) / 100 : 0;
  return r;
}
function EV_arred(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function EV_pct(atual, anterior) { const a = Number(anterior) || 0; if (a <= 0.005) return (Number(atual) || 0) > 0.005 ? 100 : 0; return Math.round((atual - a) / a * 1000) / 10; }
function EV_tendencia(dif) { return dif > 0.02 ? 'aumento' : dif < -0.02 ? 'reducao' : 'estavel'; }
// Lista de meses AAAA-MM anteriores a `anoMes` (o próprio mês NÃO entra).
function EV_mesesAntes(anoMes, n) {
  const [a, mo] = anoMes.split('-').map(Number), out = [];
  for (let i = 1; i <= n; i++) { const d = new Date(a, mo - 1 - i, 1); out.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')); }
  return out;
}
// Média do total gasto nos n meses anteriores (respeita modo + filtro).
function EV_mediaHistorica(anoMes, n, modo, filtro) {
  const meses = EV_mesesAntes(anoMes, n); if (!meses.length) return 0;
  const somas = meses.map(mk => EV_totais(EV_filtrar(EV_coleta(mk, modo), filtro)).total);
  return EV_arred(somas.reduce((a, b) => a + b, 0) / meses.length);
}
// Comprometimento futuro a partir de C_parcelamentos (§19): novos parcelamentos deste mês + saldo futuro total.
function EV_comprometimento(anoMes) {
  const parc = (typeof C_parcelamentos !== 'undefined' ? C_parcelamentos : []).filter(p => p.ativo);
  let qtdNovos = 0, totalContratado = 0, impactoMensal = 0, saldoFuturo = 0, futuroTotal = 0;
  parc.forEach(p => {
    const restantes = Math.max(0, (p.totalParcelas || 0) - (p.parcelaAtual || 0));
    futuroTotal += (Number(p.valorParcela) || 0) * restantes;
    if ((p.mesInicio || '') === anoMes) {   // contratado NESTE mês = novo
      qtdNovos++;
      totalContratado += (Number(p.valorParcela) || 0) * (p.totalParcelas || 0);
      impactoMensal += Number(p.valorParcela) || 0;
      saldoFuturo += (Number(p.valorParcela) || 0) * restantes;
    }
  });
  return { quantidade_novos: qtdNovos, valor_total_contratado: EV_arred(totalContratado), impacto_mensal: EV_arred(impactoMensal), saldo_futuro: EV_arred(saldoFuturo), comprometimento_futuro_total: EV_arred(futuroTotal) };
}
// Gastos extraordinários (§18, heurística sem campo dedicado): item cujo valor destoa muito do ticket
// típico do período E pesa no total. Sem inventar flag — só sinaliza candidatos para a SophIA comentar.
function EV_extraordinarios(itens, total) {
  const arr = (itens || []).slice().sort((a, b) => (b.valor || 0) - (a.valor || 0));
  if (arr.length < 4) return [];
  const media = total / arr.length, piso = Math.max(200, media * 2.5);
  return arr.filter(it => (it.valor || 0) >= piso && (it.valor || 0) >= total * 0.12)
    .slice(0, 5).map(it => ({ categoria: it.categoria || 'Outros', descricao_resumida: it.desc || '', valor: EV_arred(it.valor) }));
}
// Resolve o "período comparado": um mês fixo OU uma média (3/6/12) OU o mesmo mês do ano anterior.
function EV_periodoComparado(anoMes, comparado, modo, filtro) {
  if (typeof comparado === 'string') { const it = EV_filtrar(EV_coleta(comparado, modo), filtro), t = EV_totais(it); return { competencia: comparado, total: t.total, quantidade_lancamentos: t.qtd, ticket_medio: t.ticket, porCategoria: t.porCategoria, porMeio: t.porMeio, itens: it, rotulo: null }; }
  const tipo = (comparado && comparado.tipo) || 'anterior';
  if (tipo === 'anoAnterior') { const [a, mo] = anoMes.split('-').map(Number), alvo = (a - 1) + '-' + String(mo).padStart(2, '0'); return EV_periodoComparado(anoMes, alvo, modo, filtro); }
  const n = tipo === 'media12' ? 12 : tipo === 'media6' ? 6 : tipo === 'media3' ? 3 : 1;
  if (n === 1) { return EV_periodoComparado(anoMes, EV_mesesAntes(anoMes, 1)[0], modo, filtro); }
  // média: agrega categoria/meio médios dos n meses
  const meses = EV_mesesAntes(anoMes, n), acCat = {}, acMeio = {}; let acTotal = 0, acQtd = 0;
  meses.forEach(mk => { const t = EV_totais(EV_filtrar(EV_coleta(mk, modo), filtro)); acTotal += t.total; acQtd += t.qtd; Object.entries(t.porCategoria).forEach(([c, v]) => acCat[c] = (acCat[c] || 0) + v); Object.entries(t.porMeio).forEach(([k, o]) => { if (!acMeio[k]) acMeio[k] = { nome: o.nome, tipo: o.tipo, valor: 0 }; acMeio[k].valor += o.valor; }); });
  const div = meses.length;
  Object.keys(acCat).forEach(c => acCat[c] = EV_arred(acCat[c] / div));
  Object.keys(acMeio).forEach(k => acMeio[k].valor = EV_arred(acMeio[k].valor / div));
  return { competencia: null, rotulo: 'média dos últimos ' + n + ' meses', total: EV_arred(acTotal / div), quantidade_lancamentos: Math.round(acQtd / div), ticket_medio: acQtd ? EV_arred(acTotal / acQtd) : 0, porCategoria: acCat, porMeio: acMeio, itens: [] };
}
// Dentro de uma categoria, qual descrição/estabelecimento mais puxou a variação (§12 "principal responsável").
function EV_principalResponsavel(itensAtual, itensAnterior, categoria) {
  const soma = (arr) => { const m = {}; arr.filter(it => (it.categoria || 'Outros') === categoria).forEach(it => { const k = C_normalizar(it.desc || '') || '(sem descrição)'; m[k] = (m[k] || 0) + (Number(it.valor) || 0); }); return m; };
  const a = soma(itensAtual), b = soma(itensAnterior), chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  let melhor = null, maiorDif = 0;
  chaves.forEach(k => { const dif = (a[k] || 0) - (b[k] || 0); if (Math.abs(dif) > Math.abs(maiorDif)) { maiorDif = dif; melhor = k; } });
  if (!melhor) return null;
  const orig = (itensAtual.concat(itensAnterior)).find(it => (C_normalizar(it.desc || '') || '(sem descrição)') === melhor);
  return { nome: (orig && orig.desc) || melhor, diferenca: EV_arred(maiorDif) };
}
// ═══ ANÁLISE PRINCIPAL: monta o SOPHIA_RATEIO_COMPARATIVO_CONTEXT completo (§22). ═══
// opts = { atual:'AAAA-MM', comparado:'AAAA-MM' | {tipo:'anterior|media3|media6|media12|anoAnterior'},
//          modo:'competencia|pagamento|compromissos', filtro:{...} }
function EV_analise(opts) {
  const o = opts || {}, modo = o.modo || 'competencia', filtro = o.filtro || {};
  const atual = o.atual, comparado = o.comparado || { tipo: 'anterior' };
  const itA = EV_filtrar(EV_coleta(atual, modo), filtro), tA = EV_totais(itA);
  const pc = EV_periodoComparado(atual, comparado, modo, filtro);
  const itB = pc.itens || [];
  // categorias que apareceram em qualquer um dos dois períodos
  const cats = new Set([...Object.keys(tA.porCategoria), ...Object.keys(pc.porCategoria || {})]);
  const categorias = [...cats].map(nome => {
    const va = EV_arred(tA.porCategoria[nome] || 0), vb = EV_arred((pc.porCategoria || {})[nome] || 0), dif = EV_arred(va - vb);
    const qtd = itA.filter(it => (it.categoria || 'Outros') === nome).length;
    return {
      id: EV_catId(nome), nome, valor_atual: va, valor_anterior: vb, diferenca: dif,
      variacao_percentual: EV_pct(va, vb), participacao_total: tA.total ? Math.round(va / tA.total * 1000) / 10 : 0,
      quantidade_lancamentos: qtd, ticket_medio: qtd ? EV_arred(va / qtd) : 0, tendencia: EV_tendencia(dif),
      principal_responsavel: EV_principalResponsavel(itA, itB, nome)
    };
  }).sort((a, b) => b.valor_atual - a.valor_atual);
  // meios de pagamento consolidados (§13)
  const meiosKeys = new Set([...Object.keys(tA.porMeio), ...Object.keys(pc.porMeio || {})]);
  const meios_pagamento = [...meiosKeys].map(k => { const a = tA.porMeio[k] || (pc.porMeio || {})[k], va = EV_arred((tA.porMeio[k] || {}).valor || 0), vb = EV_arred(((pc.porMeio || {})[k] || {}).valor || 0); return { nome: a.nome, tipo: a.tipo, valor_atual: va, valor_anterior: vb, diferenca: EV_arred(va - vb) }; }).sort((a, b) => b.valor_atual - a.valor_atual);
  const parcel = EV_comprometimento(atual);
  const varValor = EV_arred(tA.total - pc.total);
  const catAum = categorias.filter(c => c.diferenca > 0).sort((a, b) => b.diferenca - a.diferenca)[0];
  const catRed = categorias.filter(c => c.diferenca < 0).sort((a, b) => a.diferenca - b.diferenca)[0];
  const migrou = meios_pagamento.some(m => m.diferenca <= -50) && meios_pagamento.some(m => m.diferenca >= 50);
  return {
    tipo_analise: 'rateio_comparativo', visao: modo,
    periodo_atual: { competencia: atual, total: tA.total, quantidade_lancamentos: tA.qtd, ticket_medio: tA.ticket },
    periodo_comparado: { competencia: pc.competencia, rotulo: pc.rotulo, total: pc.total, quantidade_lancamentos: pc.quantidade_lancamentos, ticket_medio: pc.ticket_medio },
    variacao: { valor: varValor, percentual: EV_pct(tA.total, pc.total) },
    categorias, meios_pagamento, parcelamentos: parcel,
    gastos_extraordinarios: EV_extraordinarios(itA, tA.total),
    media_historica: { ultimos_3_meses: EV_mediaHistorica(atual, 3, modo, filtro), ultimos_6_meses: EV_mediaHistorica(atual, 6, modo, filtro), ultimos_12_meses: EV_mediaHistorica(atual, 12, modo, filtro) },
    destaques_calculados: {
      categoria_maior_aumento: catAum ? catAum.nome : null, categoria_maior_reducao: catRed ? catRed.nome : null,
      houve_migracao_meio_pagamento: migrou, comprometimento_futuro_aumentou: parcel.quantidade_novos > 0
    },
    _itensAtual: itA   // interno (não vai pra IA): alimenta a UI de detalhe/gráfico
  };
}
// Rankings ponderados (§14): NÃO ordena só por %. Combina reais + participação + frequência, com
// reais dominando — evita que "R$5→R$20 (+300%)" apareça acima de "+R$800". Só entra o que é relevante.
function EV_score(cat) {
  // reais são a BASE; participação e frequência entram como MULTIPLICADOR pequeno (no máx. ~+40%), pra
  // desempatar sem nunca deixar uma categoria enorme com alta minúscula passar na frente de uma alta grande.
  const reais = Math.abs(cat.diferenca), part = Math.min(Math.abs(cat.participacao_total) || 0, 100), freq = Math.min(cat.quantidade_lancamentos || 0, 20);
  return reais * (1 + part / 100 * 0.3 + freq / 20 * 0.1);
}
function EV_rankings(contexto, pisoReais) {
  const piso = pisoReais == null ? 30 : pisoReais;
  const relev = (contexto.categorias || []).filter(c => Math.abs(c.diferenca) >= piso || Math.abs(c.participacao_total) >= 8);
  const melhorou = relev.filter(c => c.diferenca < 0).sort((a, b) => EV_score(b) - EV_score(a));
  const piorou = relev.filter(c => c.diferenca > 0).sort((a, b) => EV_score(b) - EV_score(a));
  return { melhorou, piorou };
}
// Blocos da SophIA (§15) gerados de forma DETERMINÍSTICA a partir dos números já calculados (§23: a SophIA
// não faz conta). Tom acolhedor, não acusatório (§16). Só aparecem quando há dado suficiente.
function EV_blocosSophia(contexto, rankings) {
  const b = [], f = n => 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rk = rankings || EV_rankings(contexto), v = contexto.variacao, pc = contexto.periodo_comparado;
  const refTxt = pc.rotulo ? ('a ' + pc.rotulo) : ('a competência anterior');
  // Melhorou
  if (rk.melhorou.length) {
    const c = rk.melhorou[0], extra = c.principal_responsavel && c.principal_responsavel.diferenca < 0 ? ` — puxado por ${c.principal_responsavel.nome}` : '';
    b.push({ tipo: 'melhorou', titulo: 'Melhorou', texto: `Os gastos com ${c.nome} diminuíram ${f(-c.diferenca)} em relação ${refTxt}${extra}.` });
  }
  // Piorou
  if (rk.piorou.length) {
    const c = rk.piorou[0], resp = c.principal_responsavel && c.principal_responsavel.diferenca > 0 ? ` ${c.principal_responsavel.nome} respondeu por ${f(c.principal_responsavel.diferenca)} dessa diferença.` : '';
    b.push({ tipo: 'piorou', titulo: 'Piorou', texto: `A categoria ${c.nome} aumentou ${f(c.diferenca)}.${resp}` });
  }
  // Atenção — novos parcelamentos / migração de meio
  const p = contexto.parcelamentos;
  if (p && p.quantidade_novos > 0) {
    b.push({ tipo: 'atencao', titulo: 'Atenção', texto: `Foram assumidos ${p.quantidade_novos} novo(s) parcelamento(s), que acrescentam ${f(p.impacto_mensal)} por mês às próximas faturas (${f(p.saldo_futuro)} ainda a pagar).` });
  } else if (contexto.destaques_calculados.houve_migracao_meio_pagamento && v.valor > 0) {
    const caiu = (contexto.meios_pagamento.find(m => m.diferenca <= -50) || {}), subiu = (contexto.meios_pagamento.find(m => m.diferenca >= 50) || {});
    b.push({ tipo: 'atencao', titulo: 'Atenção', texto: `Os gastos em ${caiu.nome} diminuíram, mas parte migrou para ${subiu.nome}. No consolidado, houve aumento de ${f(v.valor)} — não foi economia real.` });
  }
  // Oportunidade — a maior alta recorrente é onde há mais a ganhar
  if (rk.piorou.length) {
    const c = rk.piorou[0], alvo = contexto.media_historica.ultimos_3_meses;
    if (c.principal_responsavel && c.principal_responsavel.diferenca > 0) b.push({ tipo: 'oportunidade', titulo: 'Oportunidade', texto: `Voltar ${c.nome} para o padrão dos últimos meses abre uma economia de cerca de ${f(c.diferenca)} por competência.` });
  }
  return b;
}
// Há histórico suficiente pra comparar? (§3 fallback)
function EV_temHistorico(anoMes, modo) {
  const anterior = EV_mesesAntes(anoMes, 1)[0];
  return EV_totais(EV_coleta(anterior, modo)).total > 0;
}
// Objeto ENXUTO que vai pra IA (§22): só o resumo calculado, sem _itensAtual nem dado bruto sensível.
function EV_contextoParaIA(contexto) {
  const c = Object.assign({}, contexto); delete c._itensAtual;
  c.categorias = (c.categorias || []).slice(0, 12);   // não mandar cauda longa
  return c;
}
// ══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EV_ — UI DA EVOLUÇÃO DOS GASTOS (§1–§21). Só apresentação: TODO cálculo vem do motor EV_ acima.
// ═══════════════════════════════════════════════════════════════════════════════════════════

let EV_estado = { atual: null, comparado: { tipo: 'anterior' }, modo: 'competencia', filtro: {}, aba: 'geral', catFoco: null };
let EV_charts = [];
const EV_MODOS = [['competencia', '📅 Competência', 'Gastos que pertencem ao mês, mesmo que sejam pagos depois.'], ['pagamento', '💸 Pagamento', 'Valores pagos (ou a pagar) neste mês, incluindo faturas que vencem agora.'], ['compromissos', '🧾 Compromissos', 'Tudo que foi contratado no mês, com o valor total das compras parceladas.']];
const EV_COMPARACOES = [['anterior', 'Competência anterior'], ['media3', 'Média dos últimos 3 meses'], ['media6', 'Média dos últimos 6 meses'], ['media12', 'Média dos últimos 12 meses'], ['anoAnterior', 'Mesmo mês do ano passado']];
function EV_fmtSig(n) { const v = Number(n) || 0; return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v)); }
function EV_pctSig(n) { const v = Number(n) || 0; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',') + '%'; }
function EV_corDif(dif, bom) { const d = Number(dif) || 0; if (Math.abs(d) < 0.02) return '#94a3b8'; const sobe = d > 0; return (bom === 'baixo' ? !sobe : sobe) ? '#16a34a' : '#dc2626'; }
function EV_catInfo(n){ try{ let slug=n; if(!CATS_P[n]){ const k=Object.keys(CATS_P).find(x=>CATS_P[x].label===n); if(k)slug=k; } const ci=catInfoP(slug); return {emoji:ci.icon,cor:ci.color,label:ci.label}; }catch(e){ return {emoji:'📦',cor:'#94a3b8',label:n}; } }
// nomes dos integrantes que já aparecem nos dados (criadoPor = e-mail)
function EV_integrantes() {
  const set = new Set();
  [EV_estado.atual, EV_mesesAntes(EV_estado.atual, 1)[0]].forEach(mk => EV_coleta(mk, EV_estado.modo).forEach(it => { if (it.integrante) set.add(it.integrante); }));
  return [...set];
}
function EV_meiosDisponiveis() {
  const map = {};
  EV_coleta(EV_estado.atual, EV_estado.modo).forEach(it => { const k = it.meio.tipo + ':' + (it.meio.id || it.meio.nome); map[k] = it.meio; });
  return Object.values(map);
}

window.EV_abrir = function (filtroInicial) {
  EV_estado.atual = EV_mesWenAtualIso();
  EV_estado.comparado = { tipo: 'anterior' }; EV_estado.filtro = filtroInicial || {}; EV_estado.aba = filtroInicial && filtroInicial.categoria ? 'categorias' : 'geral'; EV_estado.catFoco = (filtroInicial && filtroInicial.categoria) || null;
  EV_render();
};
window.EV_fechar = function () { EV_charts.forEach(c => { try { c.destroy(); } catch (e) {} }); EV_charts = []; };
window.EV_setModo = function (m) { EV_estado.modo = m; EV_render(); };
window.EV_setComparado = function (t) { EV_estado.comparado = { tipo: t }; EV_render(); };
window.EV_setAba = function (a) { EV_estado.aba = a; EV_render(); };
window.EV_setFiltroMeio = function (v) { if (!v) { delete EV_estado.filtro.meioTipo; delete EV_estado.filtro.meioId; } else { const [tipo, id] = v.split('::'); EV_estado.filtro.meioTipo = tipo; EV_estado.filtro.meioId = id || null; } EV_render(); };
window.EV_setFiltroIntegrante = function (v) { if (v) EV_estado.filtro.integrante = v; else delete EV_estado.filtro.integrante; EV_render(); };
window.EV_setFiltroCat = function (v) { if (v) { EV_estado.filtro.categoria = v; EV_estado.catFoco = v; } else { delete EV_estado.filtro.categoria; EV_estado.catFoco = null; } EV_render(); };
window.EV_mudarMes = function (delta) { const [a, m] = EV_estado.atual.split('-').map(Number); const d = new Date(a, m - 1 + delta, 1); EV_estado.atual = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); EV_render(); };
window.EV_focoCategoria = function (nome) { EV_estado.catFoco = EV_estado.catFoco === nome ? null : nome; EV_render(); };

function EV_render() {
  const el = document.getElementById('evConteudo'); if (!el) return;
  EV_charts.forEach(c => { try { c.destroy(); } catch (e) {} }); EV_charts = [];
  const est = EV_estado;
  if (!EV_temHistorico(est.atual, est.modo) && est.aba !== 'geral') est.aba = 'geral';
  const a = EV_analise({ atual: est.atual, comparado: est.comparado, modo: est.modo, filtro: est.filtro });
  const rk = EV_rankings(a);
  const semHist = !EV_temHistorico(est.atual, est.modo);
  // ── cabeçalho: mês + comparação + modo + filtros ──
  const mesLabel = evMesLabel(est.atual);
  const modoChips = EV_MODOS.map(([v, l, dica]) => `<button class="ev-modo ${est.modo === v ? 'on' : ''}" title="${esc(dica)}" onclick="EV_setModo('${v}')">${l}</button>`).join('');
  const compSel = `<select class="ev-sel" onchange="EV_setComparado(this.value)">${EV_COMPARACOES.map(([v, l]) => `<option value="${v}" ${est.comparado.tipo === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const meios = EV_meiosDisponiveis(), integ = EV_integrantes();
  const meioSel = `<select class="ev-sel" onchange="EV_setFiltroMeio(this.value)"><option value="">Todos os meios</option>${meios.map(m => { const val = m.tipo + '::' + (m.id || ''); const sel = est.filtro.meioTipo === m.tipo && (est.filtro.meioId || null) === (m.id || null); return `<option value="${esc(val)}" ${sel ? 'selected' : ''}>${m.tipo === 'cartao' ? '💳' : '🏦'} ${esc(m.nome)}</option>`; }).join('')}</select>`;
  const integSel = integ.length > 1 ? `<select class="ev-sel" onchange="EV_setFiltroIntegrante(this.value)"><option value="">Casal (todos)</option>${integ.map(i => `<option value="${esc(i)}" ${est.filtro.integrante === i ? 'selected' : ''}>${esc((i || '').split('@')[0])}</option>`).join('')}</select>` : '';
  const catSel = `<select class="ev-sel" onchange="EV_setFiltroCat(this.value)"><option value="">Todas as categorias</option>${a.categorias.map(c => `<option value="${esc(c.nome)}" ${est.filtro.categoria === c.nome ? 'selected' : ''}>${EV_catInfo(c.nome).emoji} ${esc(EV_catInfo(c.nome).label||c.nome)}</option>`).join('')}</select>`;
  const header = `<div class="ev-head">
    <div class="ev-head-row"><button class="ev-navmes" onclick="EV_mudarMes(-1)">‹</button><b style="flex:1;text-align:center">${esc(mesLabel)}</b><button class="ev-navmes" onclick="EV_mudarMes(1)">›</button></div>
    <div class="ev-modos">${modoChips}</div>
    <div class="ev-filtros"><span class="ev-flabel">comparar com</span>${compSel}${meioSel}${integSel}${catSel}</div>
  </div>`;
  const abas = ['geral', 'categorias', 'evolucao', 'sophia'];
  const abasLabel = { geral: '📊 Visão geral', categorias: '🧩 Categorias', evolucao: '📈 Evolução', sophia: '✨ SophIA' };
  const nav = `<div class="ev-abas">${abas.map(x => `<button class="ev-aba ${est.aba === x ? 'on' : ''}" onclick="EV_setAba('${x}')">${abasLabel[x]}</button>`).join('')}</div>`;
  let corpo = '';
  if (semHist) corpo = `<div class="ev-vazio">🌱 Ainda precisamos de mais informações para comparar sua evolução. Continue registrando seus lançamentos — na próxima competência esta análise ganha vida.</div>` + EV_secGeral(a, rk, true);
  else if (est.aba === 'geral') corpo = EV_secGeral(a, rk, false);
  else if (est.aba === 'categorias') corpo = EV_secCategorias(a);
  else if (est.aba === 'evolucao') corpo = EV_secEvolucao(a);
  else if (est.aba === 'sophia') corpo = EV_secSophia(a, rk);
  el.innerHTML = header + nav + corpo;
  // gráficos (depois do innerHTML)
  if (est.aba === 'evolucao' && !semHist) EV_desenharGraficos(a);
}

// ── §11 cards + §14 rankings + §13 meios ──
function EV_secGeral(a, rk, semHist) {
  const v = a.variacao, sobe = v.valor > 0.02, cai = v.valor < -0.02;
  const corV = sobe ? '#dc2626' : cai ? '#16a34a' : '#94a3b8';
  const refTxt = a.periodo_comparado.rotulo || 'competência anterior';
  const p = a.parcelamentos;
  const card = (lbl, val, sub, cor) => `<div class="ev-kpi"><div class="ev-kpi-l">${lbl}</div><div class="ev-kpi-v" ${cor ? `style="color:${cor}"` : ''}>${val}</div>${sub ? `<div class="ev-kpi-s">${sub}</div>` : ''}</div>`;
  const cards = `<div class="ev-kpis">
    ${card('Gasto no período', fmt(a.periodo_atual.total), a.periodo_atual.quantidade_lancamentos + ' lançamentos')}
    ${card('Período comparado', fmt(a.periodo_comparado.total), esc(refTxt))}
    ${semHist ? '' : card('Variação', EV_fmtSig(v.valor), EV_pctSig(v.percentual), corV)}
    ${card('Ticket médio', fmt(a.periodo_atual.ticket_medio), '')}
    ${a.destaques_calculados.categoria_maior_aumento ? card('Mais aumentou', a.destaques_calculados.categoria_maior_aumento, '', '#dc2626') : ''}
    ${a.destaques_calculados.categoria_maior_reducao ? card('Mais reduziu', a.destaques_calculados.categoria_maior_reducao, '', '#16a34a') : ''}
    ${p.quantidade_novos ? card('Novos parcelamentos', fmt(p.impacto_mensal) + '/mês', p.quantidade_novos + ' compra(s)', '#dc2626') : ''}
    ${p.comprometimento_futuro_total ? card('Comprometimento futuro', fmt(p.comprometimento_futuro_total), 'parcelas a pagar') : ''}
  </div>`;
  if (semHist) return cards;
  const rankLista = (arr, bom) => arr.length ? arr.slice(0, 5).map(c => {
    const ci = EV_catInfo(c.nome);
    return `<div class="ev-rk-row" onclick="EV_setAba('categorias');EV_focoCategoria('${jsA(c.nome)}')"><span class="ev-dot" style="background:${ci.cor}"></span><span class="ev-rk-nome">${ci.emoji} ${esc(EV_catInfo(c.nome).label||c.nome)}</span><span class="ev-rk-val" style="color:${EV_corDif(c.diferenca, bom)}">${EV_fmtSig(c.diferenca)}</span><span class="ev-rk-pct">${EV_pctSig(c.variacao_percentual)}</span></div>`;
  }).join('') : `<div class="ev-vazio-min">Nada relevante aqui.</div>`;
  const rankings = `<div class="ev-2col">
    <div class="ev-bloco"><div class="ev-bloco-h" style="color:#16a34a">📉 Onde melhorou</div>${rankLista(rk.melhorou, 'baixo')}</div>
    <div class="ev-bloco"><div class="ev-bloco-h" style="color:#dc2626">📈 Onde aumentou</div>${rankLista(rk.piorou, 'alto')}</div>
  </div>`;
  // §13 meios consolidados
  const meios = a.meios_pagamento.filter(m => m.valor_atual > 0 || m.valor_anterior > 0).slice(0, 6);
  const meiosHtml = meios.length ? `<div class="ev-bloco"><div class="ev-bloco-h">💳 Por meio de pagamento (consolidado)</div>${meios.map(m => `<div class="ev-rk-row"><span class="ev-rk-nome">${m.tipo === 'cartao' ? '💳' : '🏦'} ${esc(m.nome)}</span><span class="ev-rk-val">${fmt(m.valor_atual)}</span><span class="ev-rk-pct" style="color:${EV_corDif(m.diferenca, 'baixo')}">${EV_fmtSig(m.diferenca)}</span></div>`).join('')}${a.destaques_calculados.houve_migracao_meio_pagamento ? `<div class="ev-nota">↔️ Houve migração entre meios de pagamento — confira se a economia foi real ou só troca de cartão/conta.</div>` : ''}</div>` : '';
  return cards + rankings + meiosHtml;
}

// ── §12 comparativo por categoria (expansível) ──
function EV_secCategorias(a) {
  const cats = a.categorias.filter(c => c.valor_atual > 0 || c.valor_anterior > 0);
  if (!cats.length) return `<div class="ev-vazio-min">Sem categorias com movimento no período.</div>`;
  return `<div class="ev-catlist">` + cats.map(c => {
    const ci = EV_catInfo(c.nome), aberto = EV_estado.catFoco === c.nome;
    const resp = c.principal_responsavel ? `<div class="ev-cat-resp">Principal responsável: <b>${esc(c.principal_responsavel.nome)}</b> (${EV_fmtSig(c.principal_responsavel.diferenca)})</div>` : '';
    const det = aberto ? `<div class="ev-cat-det">
      <div class="ev-cat-grid"><span>Atual</span><b>${fmt(c.valor_atual)}</b><span>Anterior</span><b>${fmt(c.valor_anterior)}</b><span>Diferença</span><b style="color:${EV_corDif(c.diferenca, 'baixo')}">${EV_fmtSig(c.diferenca)} (${EV_pctSig(c.variacao_percentual)})</b><span>Participação</span><b>${c.participacao_total.toFixed(1).replace('.', ',')}%</b><span>Lançamentos</span><b>${c.quantidade_lancamentos}</b><span>Ticket médio</span><b>${fmt(c.ticket_medio)}</b></div>${resp}
      <div class="ev-cat-itens">${EV_itensCategoria(c.nome)}</div>
    </div>` : '';
    return `<div class="ev-cat ${aberto ? 'aberta' : ''}">
      <div class="ev-cat-h" onclick="EV_focoCategoria('${jsA(c.nome)}')">
        <span class="ev-dot" style="background:${ci.cor}"></span><span class="ev-cat-nome">${ci.emoji} ${esc(EV_catInfo(c.nome).label||c.nome)}</span>
        <span class="ev-cat-vals"><b>${fmt(c.valor_atual)}</b> <span style="color:${EV_corDif(c.diferenca, 'baixo')};font-size:.82rem">${EV_fmtSig(c.diferenca)}</span></span>
        <span class="ev-cat-car">${aberto ? '▾' : '▸'}</span>
      </div>${det}</div>`;
  }).join('') + `</div>`;
}
// itens da categoria no período atual + divisão por meio/integrante (§12/§17)
function EV_itensCategoria(cat) {
  const itens = EV_filtrar(EV_coleta(EV_estado.atual, EV_estado.modo), Object.assign({}, EV_estado.filtro, { categoria: cat }));
  const porMeio = {}, porInt = {};
  itens.forEach(it => { const k = it.meio.nome; porMeio[k] = (porMeio[k] || 0) + (it.valor || 0); if (it.integrante) porInt[it.integrante] = (porInt[it.integrante] || 0) + (it.valor || 0); });
  const top = itens.slice().sort((x, y) => (y.valor || 0) - (x.valor || 0)).slice(0, 8);
  const linhas = top.map(it => `<div class="ev-item"><span>${it.parcela ? '💳' : it.fonte === 'conta' ? '🧾' : '💳'} ${esc(it.desc || '(sem descrição)')}${it.parcela ? ` <span class="ev-parc">${it.parcela.atual}/${it.parcela.total}</span>` : ''}</span><b>${fmt(it.valor)}</b></div>`).join('');
  const meiosTxt = Object.entries(porMeio).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${esc(n)} ${fmt(v)}`).join(' · ');
  const intTxt = Object.keys(porInt).length > 1 ? `<div class="ev-cat-sub">👥 ${Object.entries(porInt).sort((a, b) => b[1] - a[1]).map(([n, v]) => `${esc((n || '').split('@')[0])} ${fmt(v)}`).join(' · ')}</div>` : '';
  return (linhas || '<div class="ev-vazio-min">Sem itens editáveis (pode ser projeção de parcela).</div>') + (meiosTxt ? `<div class="ev-cat-sub">💳 ${meiosTxt}</div>` : '') + intTxt;
}

// ── §20 gráficos ──
function EV_secEvolucao(a) {
  return `<div class="ev-graf"><div class="ev-bloco-h">📈 Evolução mensal (últimos 6 meses)</div><canvas id="evChartEvol" height="200"></canvas></div>
    <div class="ev-graf"><div class="ev-bloco-h">🧩 Composição do período</div><canvas id="evChartComp" height="220"></canvas></div>
    <div class="ev-graf"><div class="ev-bloco-h">💳 Distribuição por meio de pagamento</div><canvas id="evChartMeio" height="200"></canvas></div>`;
}
function EV_desenharGraficos(a) {
  if (typeof Chart === 'undefined') return;
  const est = EV_estado, meses = EV_mesesAntes(est.atual, 5).reverse().concat([est.atual]);
  const totais = meses.map(mk => EV_totais(EV_filtrar(EV_coleta(mk, est.modo), est.filtro)).total);
  const _M = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const labs = meses.map(mk => { const [a, m] = mk.split('-'); return _M[(+m || 1) - 1] + '/' + a.slice(2); });
  const c1 = document.getElementById('evChartEvol');
  if (c1) EV_charts.push(new Chart(c1, { type: 'bar', data: { labels: labs, datasets: [{ data: totais, backgroundColor: totais.map((_, i) => i === totais.length - 1 ? '#4f9a5b' : 'rgba(79,154,91,.45)') }] }, options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } }, maintainAspectRatio: false } }));
  const cats = a.categorias.filter(c => c.valor_atual > 0).slice(0, 8);
  const c2 = document.getElementById('evChartComp');
  if (c2) EV_charts.push(new Chart(c2, { type: 'doughnut', data: { labels: cats.map(c => c.nome), datasets: [{ data: cats.map(c => c.valor_atual), backgroundColor: cats.map(c => EV_catInfo(c.nome).cor) }] }, options: { plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 11 } } } }, cutout: '58%', maintainAspectRatio: false } }));
  const meios = a.meios_pagamento.filter(m => m.valor_atual > 0);
  const c3 = document.getElementById('evChartMeio');
  if (c3) EV_charts.push(new Chart(c3, { type: 'bar', data: { labels: meios.map(m => m.nome), datasets: [{ data: meios.map(m => m.valor_atual), backgroundColor: '#6b8fd6' }] }, options: { indexAxis: 'y', plugins: { legend: { display: false } }, maintainAspectRatio: false } }));
}

// ── §15 blocos da SophIA ──
function EV_secSophia(a, rk) {
  const blocos = EV_blocosSophia(a, rk);
  const cor = { melhorou: '#16a34a', piorou: '#dc2626', atencao: '#a86b1e', oportunidade: '#1e40af' };
  const emoji = { melhorou: '📉', piorou: '📈', atencao: '⚠️', oportunidade: '💡' };
  if (!blocos.length) return `<div class="ev-vazio-min">Sem observações relevantes neste período. Continue registrando — a SophIA aprende com o histórico. 💚</div>`;
  const cards = blocos.map(b => `<div class="ev-sof" style="border-left:4px solid ${cor[b.tipo]}"><div class="ev-sof-h" style="color:${cor[b.tipo]}">${emoji[b.tipo]} ${b.titulo}</div><div class="ev-sof-t">${esc(b.texto)}</div></div>`).join('');
  const aprofundar = false ? `<button class="btn btn-outline" style="width:auto;margin-top:10px" onclick="EV_aprofundarSophia()">✨ Pedir análise detalhada à SophIA</button><div id="evSofIA" class="card-sub" style="margin-top:8px"></div>` : `<div class="ev-nota">💡 Conecte a SophIA (Colheita) para uma análise ainda mais detalhada.</div>`;
  return `<div class="ev-sof-intro">A SophIA leu os números já calculados e destacou o que importa. Ela nunca faz contas nem julga — só interpreta. 💚</div>${cards}${aprofundar}`;
}
window.EV_aprofundarSophia = async function () {
  const alvo = document.getElementById('evSofIA'); if (!alvo) return;
  alvo.textContent = '✨ A SophIA está analisando…';
  try {
    const a = EV_analise({ atual: EV_estado.atual, comparado: EV_estado.comparado, modo: EV_estado.modo, filtro: EV_estado.filtro });
    const ctx = EV_contextoParaIA(a);
    const prompt = 'Você é a SophIA, assistente financeira acolhedora de um app de casal. Analise ESTE resumo JÁ CALCULADO (não faça contas, não invente dados, não julgue compras, não responsabilize ninguém). Escreva 3 a 5 frases curtas em português, tom gentil, dividindo em **Melhorou**, **Piorou**, **Atenção** e **Oportunidade** quando fizer sentido. Dados: ' + JSON.stringify(ctx);
    const r = await IA_perguntar(prompt);
    alvo.classList.remove('card-sub'); alvo.innerHTML = (typeof IA_md === 'function') ? IA_md(r) : esc(r);
  } catch (e) { alvo.textContent = e.message || 'Não consegui agora.'; }
};

// ── §3 card de acesso rápido na tela de Rateio ──
function EV_cardRapido() {
  try {
    const chave = EV_mesWenAtualIso(), modo = 'competencia';
    if (!EV_temHistorico(chave, modo)) return `<div class="ev-card-rapido ev-card-vazio"><div class="ev-cr-titulo">📈 Evolução dos seus gastos</div><div class="ev-cr-sub">Ainda precisamos de mais informações para comparar sua evolução. Continue registrando seus lançamentos.</div></div>`;
    const a = EV_analise({ atual: chave, comparado: { tipo: 'anterior' }, modo });
    const rk = EV_rankings(a), v = a.variacao, p = a.parcelamentos;
    const sobe = v.valor > 0.02, seta = sobe ? '📈' : v.valor < -0.02 ? '📉' : '➡️';
    const frase = Math.abs(v.percentual) < 0.05 ? 'Seus gastos ficaram estáveis em relação à competência anterior.' : `Seus gastos ${sobe ? 'aumentaram' : 'diminuíram'} <b>${Math.abs(v.percentual).toFixed(1).replace('.', ',')}%</b> em relação à competência anterior.`;
    const linhas = [];
    if (rk.piorou[0]) linhas.push(`<li>Principal aumento: <b>${esc(rk.piorou[0].nome)}</b> (${EV_fmtSig(rk.piorou[0].diferenca)})</li>`);
    if (rk.melhorou[0]) linhas.push(`<li>Principal redução: <b>${esc(rk.melhorou[0].nome)}</b> (${EV_fmtSig(rk.melhorou[0].diferenca)})</li>`);
    if (p.quantidade_novos) linhas.push(`<li>Novos parcelamentos: <b>${fmt(p.impacto_mensal)}</b> por mês</li>`);
    if (p.comprometimento_futuro_total) linhas.push(`<li>Comprometimento futuro: <b>${fmt(p.comprometimento_futuro_total)}</b></li>`);
    return `<div class="ev-card-rapido"><div class="ev-cr-titulo">${seta} Evolução dos seus gastos</div><div class="ev-cr-sub">${frase}</div><ul class="ev-cr-lista">${linhas.join('')}</ul><button class="ev-cr-btn" onclick="EV_abrir()">Ver análise completa →</button></div>`;
  } catch (e) { return ''; }
}
// ══════════════════════════════════════════════════════

  // ── expõe os handlers e a entrada ──
  const G=['EV_abrir','EV_fechar','EV_setModo','EV_setComparado','EV_setAba','EV_setFiltroMeio','EV_setFiltroIntegrante','EV_setFiltroCat','EV_mudarMes','EV_focoCategoria','EV_aprofundarSophia'];
  G.forEach(n=>{ if(typeof eval(n)==='function') window[n]=eval(n); });
  // render dentro da sub-aba (em vez de modal): a sub-aba chama EV_montarNaAba()
  window.EV_montarNaAba=function(){ EV_rebuild(); const host=document.getElementById('evAbaConteudo'); if(!host)return; if(!document.getElementById('evConteudo')){ host.innerHTML='<div id="evConteudo"></div>'; } EV_estado.atual=EV_mesWenAtualIso(); EV_estado.comparado={tipo:'anterior'}; EV_estado.filtro={}; EV_estado.aba='geral'; EV_render(); };
  window.EV_cardRapidoWen=function(){ EV_rebuild(); return EV_cardRapido(); };
  // intercepta EV_abrir p/ funcionar mesmo sem modal (abre a sub-aba)
  const _abrir=window.EV_abrir;
  window.EV_abrir=function(f){ EV_rebuild(); if(typeof showSubP==='function'){ try{ showSubP('p-evolucao'); const b=[...document.querySelectorAll('.sub-pagar')].find(x=>(x.getAttribute('onclick')||'').includes('p-evolucao')); if(b){document.querySelectorAll('.sub-pagar').forEach(z=>z.classList.remove('active'));b.classList.add('active');} }catch(e){} } const host=document.getElementById('evAbaConteudo'); if(host && !document.getElementById('evConteudo'))host.innerHTML='<div id="evConteudo"></div>'; if(typeof _abrir==='function'){ _abrir(f); } };
})();
