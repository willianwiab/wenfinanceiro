// ══════════════════════════════════════════════════════
// MÓDULO CONCILIAÇÃO BANCÁRIA (BK_*)
// Importa extrato .ofx do banco e SUGERE casamentos com
// Contas a Receber (R_todosOsDados) e Contas a Pagar (P_meses).
// Nada é conciliado sem confirmação explícita do usuário.
// ══════════════════════════════════════════════════════

let BK_extratos = JSON.parse(localStorage.getItem('wen_banco_extratos') || '[]');
let BK_conciliados = {};          // PERSISTIDO (Firestore): chave -> {status:'match'|'ignorado', tipo, id, mes, label, motivo}
let BK_regras = {};               // PERSISTIDO (Firestore): padrões aprendidos de contas recorrentes (só lado Pagar por ora)
let BK_candidatosAmbiguos = {};   // transitório: chave -> [candidatos] (2+ contas com o mesmo valor)
let BK_sugestoes = {};            // transitório: chave -> {tipo,id,mes,label,valor,motivo} — AGUARDANDO confirmação
let BK_toleranciaDias = 3;
let BK_filtroAtual = 'SUGESTOES';
const BK_COL = 'banco_conciliados';
const BK_COL_REGRAS = 'banco_regras';

// ── Persistência local do extrato bruto ──
function BK_salvarLocal(){ localStorage.setItem('wen_banco_extratos', JSON.stringify(BK_extratos)); }

// ── Persistência Firestore — conciliações confirmadas ──
async function BK_fbSalvarConciliado(chave, dados){
  const obj = { chave, ...dados, ts: new Date().toISOString() };
  const fields = {}; Object.keys(obj).forEach(k => fields[k] = toFV(obj[k]));
  const url = `${FS_URL}/${BK_COL}/${encodeURIComponent(chave)}?key=${FB_API_KEY}`;
  await fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) });
}
async function BK_fbRemoverConciliado(chave){
  await fetch(`${FS_URL}/${BK_COL}/${encodeURIComponent(chave)}?key=${FB_API_KEY}`, { method: 'DELETE' });
}
async function BK_carregarConciliados(){
  try{
    let pt = null;
    do{
      let url = `${FS_URL}/${BK_COL}?key=${FB_API_KEY}&pageSize=300`;
      if (pt) url += '&pageToken=' + pt;
      const res = await fetch(url); const json = await res.json();
      if (json.documents) json.documents.forEach(doc => {
        const f = doc.fields || {}; const obj = {};
        Object.keys(f).forEach(k => obj[k] = fromFV(f[k]));
        if (obj.chave) BK_conciliados[obj.chave] = obj;
      });
      pt = json.nextPageToken || null;
    } while (pt);
  }catch(e){ console.warn('BK conciliados:', e.message); }
}

// ── Persistência Firestore — regras aprendidas (recorrência por nome) ──
async function BK_fbSalvarRegra(chaveRegra, regra){
  const fields = {}; Object.keys(regra).forEach(k => fields[k] = toFV(regra[k]));
  await fetch(`${FS_URL}/${BK_COL_REGRAS}/${encodeURIComponent(chaveRegra)}?key=${FB_API_KEY}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ fields }) }).catch(()=>{});
}
async function BK_carregarRegras(){
  try{
    let pt = null;
    do{
      let url = `${FS_URL}/${BK_COL_REGRAS}?key=${FB_API_KEY}&pageSize=300`;
      if (pt) url += '&pageToken=' + pt;
      const res = await fetch(url); const json = await res.json();
      if (json.documents) json.documents.forEach(doc => {
        const f = doc.fields || {}; const obj = {};
        Object.keys(f).forEach(k => obj[k] = fromFV(f[k]));
        const nome = doc.name.split('/').pop();
        BK_regras[nome] = obj;
      });
      pt = json.nextPageToken || null;
    } while (pt);
  }catch(e){ console.warn('BK regras:', e.message); }
}
// Toda vez que uma conciliação de PAGAR é confirmada, memoriza o padrão (dia típico, valor típico, memo típico)
// para reconhecer a mesma conta em importações futuras mesmo que o valor mude um pouco (reajuste, etc).
async function BK_atualizarRegraAprendida(match, t){
  if (match.tipo !== 'pagar') return; // aprendizado, por ora, só do lado de contas a pagar (recorrência mensal fixa)
  const dataTxn = BK_parseDataBR(t.data); if (!dataTxn) return;
  const chaveRegra = 'pagar_' + match.label.trim().toUpperCase().replace(/\s+/g,'_');
  const regra = { tipo: 'pagar', nome: match.label, diaTypico: dataTxn.getDate(), valorTypico: Math.abs(t.valor), memoTypico: t.memo || '', atualizadoEm: new Date().toISOString() };
  BK_regras[chaveRegra] = regra;
  await BK_fbSalvarRegra(chaveRegra, regra);
}

// ── Chave estável de uma transação bancária (sobrevive a reimportação) ──
function BK_chave(t){ return `${t.conta || ''}_${t.data}_${t.valor}_${t.fitid || ''}_${(t.memo||'').slice(0,20)}`; }

// ── Parser OFX ──
function BK_parseOFX(texto, nomeArquivo){
  const contaMatch = texto.match(/<ACCTID>([^<\r\n]+)/);
  const conta = contaMatch ? contaMatch[1].trim() : '';
  const blocos = texto.split('<STMTTRN>');
  const txns = [];
  blocos.slice(1).forEach(bloco => {
    const get = key => { const m = bloco.match(new RegExp(key + '>([^<\\r\\n]*)')); return m ? m[1].trim() : ''; };
    const tipo = get('TRNTYPE');
    const dtRaw = get('DTPOSTED');
    const valor = parseFloat(get('TRNAMT')) || 0;
    const fitid = get('FITID');
    const memo = get('MEMO');
    if (!dtRaw || dtRaw.length < 8) return;
    const ano = dtRaw.slice(0, 4), mes = dtRaw.slice(4, 6), dia = dtRaw.slice(6, 8);
    txns.push({ conta, tipo, data: `${dia}/${mes}/${ano}`, valor, fitid, memo, arquivo: nomeArquivo });
  });
  return txns;
}

// ── Import de arquivos ──
function BK_abrirImport(){ document.getElementById('bkFileInput')?.click(); }
// Guarda o resultado da última importação pra deixar visível o que foi ignorado por duplicidade
// (mesma movimentação já importada antes, ou já sincronizada/decidida anteriormente) — nada some sem explicação.
let BK_ultimaImportacaoResumo = null;
function BK_handleFiles(input){
  const files = [...input.files]; if (!files.length) return;
  let novos = 0; const duplicados = [];
  const promessas = files.map(file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const txns = BK_parseOFX(e.target.result, file.name);
      txns.forEach(t => {
        const chave = BK_chave(t);
        if (!BK_extratos.some(x => BK_chave(x) === chave)) {
          BK_extratos.push(t); novos++;
        } else {
          const c = BK_conciliados[chave];
          const statusAtual = c?.status === 'match' ? '✅ já conciliada' : c?.status === 'ignorado' ? '🗑️ já ignorada' : '⏳ já importada, aguardando decisão';
          duplicados.push({ data: t.data, valor: t.valor, memo: t.memo, statusAtual, arquivo: file.name });
        }
      });
      resolve();
    };
    reader.onerror = () => resolve();
    reader.readAsText(file);
  }));
  Promise.all(promessas).then(() => {
    BK_salvarLocal();
    BK_ultimaImportacaoResumo = { novos, duplicados };
    const msg = novos > 0
      ? `✅ ${novos} novo(s)${duplicados.length ? `, ${duplicados.length} duplicado(s) ignorado(s)` : ''}`
      : (duplicados.length ? `♻️ As ${duplicados.length} movimentação(ões) do arquivo já tinham sido importadas antes` : '⚠️ Nenhum lançamento encontrado no arquivo');
    toast(msg, novos > 0 ? '#16a34a' : '#f97316');
    input.value = '';
    BK_executarMatching();
  });
}
// Painel visível com o detalhe das duplicidades da última importação (não é só um toast que some).
function BK_renderResumoImportacao(){
  const r = BK_ultimaImportacaoResumo;
  if (!r || !r.duplicados.length) return '';
  const linhas = r.duplicados.slice(0, 12).map(d =>
    `<div style="font-size:.76rem;color:#6b7280;padding:2px 0 2px 4px;border-left:2px solid #e5e7eb;margin-top:2px">${d.data} · ${BK_fmtValor(d.valor)} · ${d.memo || '(sem memo)'} — ${d.statusAtual}</div>`
  ).join('');
  const resto = r.duplicados.length > 12 ? `<div style="font-size:.76rem;color:#9ca3af;padding-top:4px">+ ${r.duplicados.length - 12} outra(s)…</div>` : '';
  return `<div class="concil-item alert" style="margin-bottom:12px">
    <span class="concil-item-icon">♻️</span>
    <div class="concil-item-info">
      <div class="concil-item-nome">${r.duplicados.length} movimentação(ões) da última importação já existiam — ignoradas pra não duplicar</div>
      ${linhas}${resto}
    </div>
    <button class="concil-item-acao" style="background:#f1f5f9;color:#6b7280" onclick="BK_ultimaImportacaoResumo=null;renderBanco()">Ok, entendi</button>
  </div>`;
}
function BK_limparExtratos(){
  if (!confirm('Remover todos os extratos importados desta sessão? As conciliações já confirmadas continuam salvas.')) return;
  BK_extratos = []; BK_salvarLocal(); BK_candidatosAmbiguos = {}; BK_sugestoes = {};
  renderBanco(); toast('🗑️ Extratos removidos.', '#6b7280');
}
function BK_setTolerancia(v){ BK_toleranciaDias = parseInt(v) || 3; BK_executarMatching(); }

// ── Helpers de data ──
function BK_parseDataBR(str){
  if (!str) return null;
  const p = str.split('/');
  if (p.length === 3) return new Date(parseInt(p[2].length===2?'20'+p[2]:p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  return null;
}
function BK_diffDias(d1, d2){ return Math.round((d1 - d2) / 86400000); }
function BK_mesRef(data){ return MESES_ABREV[data.getMonth()] + '/' + data.getFullYear(); }
function BK_dataVencimentoReceber(r){
  const venc = r.vencimento && r.vencimento !== '-' ? r.vencimento : r.data;
  if (!venc || venc === '-') return null;
  const partes = venc.split('/');
  if (partes.length === 3) return BK_parseDataBR(venc);
  if (partes.length === 2 && r.mes){
    const [mAbrev, anoStr] = r.mes.split('/');
    const mi = MESES_ABREV.indexOf(mAbrev); const ano = parseInt(anoStr.length===2?'20'+anoStr:anoStr);
    if (mi < 0) return null;
    return new Date(ano, mi, parseInt(partes[0]));
  }
  return null;
}
function BK_dataContaPagar(r, mes){
  const [mAbrev, anoStr] = mes.split('/');
  const mi = MESES_ABREV.indexOf(mAbrev); const ano = parseInt(anoStr.length===2?'20'+anoStr:anoStr);
  if (mi < 0 || !r.dia) return null;
  return new Date(ano, mi, r.dia);
}

// ── Motor de conciliação — candidatos por valor exato ──
function BK_candidatosParaTxn(t){
  const dataTxn = BK_parseDataBR(t.data);
  if (!dataTxn) return [];
  const candidatos = [];
  if (t.valor > 0){
    R_todosOsDados.forEach(r => {
      if (!r.valorTotal || Math.abs(Number(r.valorTotal) - t.valor) > 0.01) return;
      const dRef = BK_dataVencimentoReceber(r);
      if (!dRef || isNaN(dRef.getTime())) return;
      if (Math.abs(BK_diffDias(dataTxn, dRef)) <= BK_toleranciaDias)
        candidatos.push({ tipo: 'receber', id: r.id, mes: r.mes, label: r.cliente, valor: Number(r.valorTotal), dataRef: dRef });
    });
    candidatos.push(...BK_gruposReceberParaTxn(t, dataTxn));
  } else {
    const valorAbs = Math.abs(t.valor);
    Object.keys(P_meses).forEach(mes => {
      (P_meses[mes] || []).forEach(r => {
        if (Math.abs(r.valor - valorAbs) > 0.01) return;
        const dRef = BK_dataContaPagar(r, mes);
        if (!dRef) return;
        if (Math.abs(BK_diffDias(dataTxn, dRef)) <= BK_toleranciaDias)
          candidatos.push({ tipo: 'pagar', id: r.id, mes, label: r.nome, valor: r.valor, dataRef: dRef });
      });
    });
  }
  return candidatos;
}

// ── Candidatos por SOMA de diárias em aberto do mesmo cliente (fechamento mensal) ──
// O lançamento no sistema é feito por diária/gravação, mas o cliente costuma pagar o
// fechamento do mês inteiro numa transferência só — testa se a soma dos saldos em
// aberto de um cliente, dentro de um mês, bate com o valor da transação.
function BK_gruposReceberParaTxn(t, dataTxn){
  const porClienteMes = {};
  R_todosOsDados.forEach(r => {
    if (!r.valorTotal || Number(r.saldo) <= 0) return;
    const chave = r.cliente + '__' + r.mes;
    (porClienteMes[chave] = porClienteMes[chave] || []).push(r);
  });
  const grupos = [];
  Object.values(porClienteMes).forEach(regs => {
    if (regs.length < 2) return; // grupo só faz sentido com 2+ diárias — 1 diária já é coberta pelo match simples
    const soma = regs.reduce((a, r) => a + Number(r.saldo), 0);
    if (Math.abs(soma - t.valor) > 0.01) return;
    const datas = regs.map(BK_dataVencimentoReceber).filter(d => d && !isNaN(d.getTime()));
    if (!datas.length) return;
    const dRef = new Date(Math.max(...datas));
    if (Math.abs(BK_diffDias(dataTxn, dRef)) > BK_toleranciaDias + 5) return; // janela um pouco maior — é fechamento de mês, não de uma data só
    grupos.push({
      tipo: 'receber', grupo: true, mes: regs[0].mes,
      ids: regs.map(r => ({ id: r.id, mes: r.mes, valor: Number(r.saldo), data: r.data })),
      label: `${regs[0].cliente} (${regs.length} diárias)`, valor: soma, dataRef: dRef
    });
  });
  return grupos;
}

// ── Tentativa por padrão aprendido (quando não há candidato por valor exato) ──
// Reconhece contas recorrentes mesmo quando o valor mudou (reajuste de aluguel, luz variável, etc.)
function BK_tentarRegraAprendida(t){
  if (t.valor >= 0) return null; // aprendizado só do lado Pagar por enquanto
  const dataTxn = BK_parseDataBR(t.data); if (!dataTxn) return null;
  const diaTxn = dataTxn.getDate();
  const valorAbs = Math.abs(t.valor);
  let melhor = null, melhorScore = Infinity;
  Object.values(BK_regras).forEach(regra => {
    if (regra.tipo !== 'pagar') return;
    if (regra.memoTypico && t.memo && regra.memoTypico !== t.memo) return;
    const diffDia = Math.abs(diaTxn - regra.diaTypico);
    const diffValorPct = regra.valorTypico ? Math.abs(valorAbs - regra.valorTypico) / regra.valorTypico : 1;
    if (diffDia > BK_toleranciaDias || diffValorPct > 0.15) return; // tolera até ~15% de variação de valor
    const score = diffDia + diffValorPct * 10;
    if (score < melhorScore){ melhorScore = score; melhor = regra; }
  });
  if (!melhor) return null;
  const mesAlvo = BK_mesRef(dataTxn);
  const rec = (P_meses[mesAlvo] || []).find(r => r.nome === melhor.nome);
  if (!rec) return null;
  return { tipo: 'pagar', id: rec.id, mes: mesAlvo, label: rec.nome, valor: rec.valor, motivo: 'padrao_aprendido' };
}

// ── Roda o matching: só gera SUGESTÕES, nunca concilia sozinho ──
async function BK_executarMatching(){
  BK_candidatosAmbiguos = {}; BK_sugestoes = {};
  BK_extratos.forEach(t => {
    const chave = BK_chave(t);
    if (BK_conciliados[chave]?.status) return; // já confirmado ou ignorado antes (categoria sozinha não conta como decidido)
    const candidatos = BK_candidatosParaTxn(t);
    if (candidatos.length === 1){
      const c = candidatos[0];
      BK_sugestoes[chave] = c.grupo
        ? { tipo: c.tipo, grupo: true, ids: c.ids, mes: c.mes, label: c.label, valor: c.valor, motivo: 'grupo_diarias' }
        : { tipo: c.tipo, id: c.id, mes: c.mes, label: c.label, valor: c.valor, motivo: 'valor_exato' };
    } else if (candidatos.length > 1){
      BK_candidatosAmbiguos[chave] = candidatos;
    } else {
      const aprendida = BK_tentarRegraAprendida(t);
      if (aprendida) BK_sugestoes[chave] = aprendida;
    }
  });
  renderBanco();
}

// ── Liquidação de saldo — usada quando uma transação concilia contra VÁRIAS diárias de uma vez ──
// (o cliente pagou o fechamento do mês inteiro numa transferência só). Zera o saldo de cada
// diária do grupo, como se cada uma tivesse sido dada baixa individualmente, e guarda os
// valores anteriores para poder reverter em BK_desfazer.
async function BK_settleReceberIds(ids){
  const antes = [];
  for (const it of ids){
    const idx = R_todosOsDados.findIndex(r => String(r.id) === String(it.id));
    if (idx === -1) continue;
    const r = R_todosOsDados[idx];
    antes.push({ id: r.id, mes: r.mes, saldoAntes: r.saldo, valorReservaAntes: r.valorReserva });
    r.saldo = 0; r.valorReserva = r.valorTotal;
    await R_fbSalvar(r);
  }
  if (mainAtivo === 'receber' && subRAtivo === 'r-lancamentos') renderTabelaR();
  if (mainAtivo === 'receber') renderDashboardR();
  return antes;
}

// ── Confirmação (nada concilia sem passar por aqui) ──
async function BK_confirmarSugestao(chave){
  const s = BK_sugestoes[chave]; const t = BK_extratos.find(x => BK_chave(x) === chave);
  if (!s || !t) return;
  const antes = s.grupo ? await BK_settleReceberIds(s.ids) : null;
  BK_conciliados[chave] = { ...(BK_conciliados[chave]||{}), status: 'match', tipo: s.tipo, grupo: !!s.grupo, id: s.id, ids: s.ids, antes, mes: s.mes, label: s.label, motivo: s.motivo };
  delete BK_sugestoes[chave];
  await BK_fbSalvarConciliado(chave, BK_conciliados[chave]);
  if (!s.grupo) await BK_atualizarRegraAprendida(s, t);
  renderBanco();
}
function BK_rejeitarSugestao(chave){
  delete BK_sugestoes[chave];
  renderBanco();
  toast('Sugestão descartada — disponível em "Sem Correspondência".', '#6b7280');
}
async function BK_confirmarTodasSugestoes(){
  const chaves = Object.keys(BK_sugestoes);
  if (!chaves.length) return;
  if (!confirm(`Confirmar ${chaves.length} sugestão(ões) de uma vez? Revise a lista antes — essa ação concilia todas de uma vez.`)) return;
  for (const chave of chaves) await BK_confirmarSugestao(chave);
  toast(`✅ ${chaves.length} conciliação(ões) confirmada(s)!`);
}
async function BK_ignorar(chave){
  const t = BK_extratos.find(x => BK_chave(x) === chave); if (!t) return;
  BK_conciliados[chave] = { ...(BK_conciliados[chave]||{}), status: 'ignorado', label: t.memo, valor: t.valor, data: t.data };
  delete BK_candidatosAmbiguos[chave]; delete BK_sugestoes[chave];
  await BK_fbSalvarConciliado(chave, BK_conciliados[chave]);
  renderBanco(); toast('🗑️ Marcado como ignorado.', '#6b7280');
}
async function BK_desfazer(chave){
  if (!confirm('Desfazer esta conciliação? Ela volta para revisão.')) return;
  const c = BK_conciliados[chave];
  if (c?.grupo && Array.isArray(c.antes)){
    for (const a of c.antes){
      const idx = R_todosOsDados.findIndex(r => String(r.id) === String(a.id));
      if (idx > -1){ R_todosOsDados[idx].saldo = a.saldoAntes; R_todosOsDados[idx].valorReserva = a.valorReservaAntes; await R_fbSalvar(R_todosOsDados[idx]); }
    }
    if (mainAtivo === 'receber' && subRAtivo === 'r-lancamentos') renderTabelaR();
    if (mainAtivo === 'receber') renderDashboardR();
  }
  delete BK_conciliados[chave];
  await BK_fbRemoverConciliado(chave).catch(()=>{});
  BK_executarMatching();
  toast('↩️ Conciliação desfeita.', '#6b7280');
}

// ── Status de conciliação — usado pelas telas de Contas a Receber / Contas a Pagar para mostrar o selo 🏦 ──
function BK_statusConciliacao(tipo, id, mes){
  return Object.values(BK_conciliados).some(c => {
    if (c.status !== 'match' || c.tipo !== tipo) return false;
    if (c.grupo && Array.isArray(c.ids)) return c.ids.some(it => String(it.id) === String(id) && it.mes === mes);
    return String(c.id) === String(id) && c.mes === mes;
  });
}

// ── Descrição curta (saldo + obs) de um registro do sistema, pra identificar rápido qual é qual ──
function BK_getRegistroAtual(tipo, id, mes){
  if (tipo === 'receber') return R_todosOsDados.find(r => String(r.id) === String(id));
  return (P_meses[mes] || []).find(r => String(r.id) === String(id));
}
function BK_descricaoSaldo(tipo, id, mes){
  const r = BK_getRegistroAtual(tipo, id, mes); if (!r) return '';
  const partes = [];
  if (tipo === 'receber'){
    if (r.desc && r.desc !== '-') partes.push(r.desc);
    if (r.obs) partes.push(r.obs);
    partes.push(Number(r.saldo) > 0 ? `🔴 saldo em aberto: ${fmt(r.saldo)}` : '✅ já quitado');
  } else {
    if (r.obs) partes.push(r.obs);
    const saldo = r.valor - (r.valorPago || 0);
    if (r.status?.toUpperCase() === 'PAGO') partes.push('✅ já pago');
    else if (saldo < r.valor) partes.push(`🟡 pago parcial, saldo: ${fmt(saldo)}`);
    else partes.push('🔴 em aberto');
  }
  return partes.filter(Boolean).join(' · ');
}

// ── Entrada (+) / Saída (−) — diferenciação visual do valor da transação bancária ──
function BK_fmtValor(v){
  const cor = v >= 0 ? '#16a34a' : '#dc2626';
  const sinal = v >= 0 ? '+' : '−';
  return `<span style="color:${cor};font-weight:800">${sinal} ${fmt(Math.abs(v))}</span>`;
}

// ── Categoria: editar em conciliados (grava na conta real) e em não conciliados (grava na própria transação) ──
function BK_selectCategoriaHtml(valorAtual, onchangeAttr){
  const opts = ['<option value="">— sem categoria —</option>']
    .concat(Object.entries(CATS_P).map(([k,v]) => `<option value="${k}" ${valorAtual===k?'selected':''}>${v.icon} ${v.label}</option>`));
  return `<select onchange="${onchangeAttr}" style="font-size:.76rem;padding:3px 7px;border-radius:5px;border:1px solid #e5e7eb;background:white;cursor:pointer;margin-top:4px">${opts.join('')}</select>`;
}
function BK_alterarCategoriaConciliado(chave, categoria){
  const c = BK_conciliados[chave]; if (!c || c.tipo !== 'pagar') return;
  const r = BK_getRegistroAtual(c.tipo, c.id, c.mes); if (!r) return;
  r.categoria = categoria;
  P_salvarStorage();
  toast('🏷️ Categoria da conta atualizada!');
}
async function BK_definirCategoriaTxn(chave, categoria){
  BK_conciliados[chave] = { ...(BK_conciliados[chave]||{}), categoria };
  await BK_fbSalvarConciliado(chave, BK_conciliados[chave]);
  toast('🏷️ Categoria salva!');
}

// ── Modal de vínculo manual (busca livre) ──
let BK_chaveManualAtual = null;
let BK_manualSelecionados = []; // [{id,mes,valor,label}] — usado só no lado Receber, pra somar várias diárias
function BK_abrirModalManual(chave){
  BK_chaveManualAtual = chave;
  BK_manualSelecionados = [];
  const t = BK_extratos.find(x => BK_chave(x) === chave); if (!t) return;
  document.getElementById('bkManualInfo').innerHTML =
    `<b>${t.valor > 0 ? '💰 Recebimento' : '📤 Pagamento'}</b> — ${fmt(Math.abs(t.valor))}<br>📅 ${t.data} · 📝 ${t.memo || '(sem memo)'}`;
  document.getElementById('bkManualBusca').value = '';
  document.getElementById('bkModalManualBg').classList.add('open');
  BK_renderCandidatosManual();
}
function BK_fecharModalManual(){ document.getElementById('bkModalManualBg').classList.remove('open'); BK_chaveManualAtual = null; BK_manualSelecionados = []; }
function BK_toggleManualSel(id, mes, valor, label){
  const idx = BK_manualSelecionados.findIndex(x => x.id === id && x.mes === mes);
  if (idx > -1) BK_manualSelecionados.splice(idx, 1);
  else BK_manualSelecionados.push({ id, mes, valor, label });
  BK_renderCandidatosManual();
}
function BK_renderCandidatosManual(){
  const t = BK_extratos.find(x => BK_chave(x) === BK_chaveManualAtual); if (!t) return;
  const busca = (document.getElementById('bkManualBusca').value || '').toLowerCase();
  const lista = document.getElementById('bkManualLista');
  const isReceber = t.valor > 0;

  if (isReceber){
    // Lado Receber: seleção múltipla — dá pra marcar várias diárias do mesmo cliente e
    // vincular a soma contra a transação, já que o pagamento costuma ser o fechamento do mês.
    const itens = R_todosOsDados.filter(r => r.valorTotal > 0 && r.cliente.toLowerCase().includes(busca))
      .sort((a,b) => Math.abs((a.saldo||a.valorTotal) - t.valor) - Math.abs((b.saldo||b.valorTotal) - t.valor))
      .slice(0, 30)
      .map(r => ({ id: r.id, mes: r.mes, label: r.cliente, valor: Number(r.saldo) > 0 ? Number(r.saldo) : Number(r.valorTotal), sub: `${r.mes} · ${r.data || '-'}` }));
    const soma = BK_manualSelecionados.reduce((a,x) => a + Number(x.valor), 0);
    const bateSoma = BK_manualSelecionados.length && Math.abs(soma - t.valor) < 0.01;
    const barra = `<div id="bkManualSelBar" style="display:${BK_manualSelecionados.length?'flex':'none'};justify-content:space-between;align-items:center;background:${bateSoma?'#f0fdf4':'#eff6ff'};border:1px solid ${bateSoma?'#bbf7d0':'#bfdbfe'};border-radius:8px;padding:8px 12px;margin-bottom:10px;font-size:.82rem">
      <span>${BK_manualSelecionados.length} selecionada(s) · Soma: <b>${fmt(soma)}</b>${bateSoma?' ✅ bate com a transação':''}</span>
      <button class="btn btn-blue" style="padding:5px 12px;font-size:.78rem" onclick="BK_confirmarGrupoManual()">Vincular${BK_manualSelecionados.length>1?' Soma':''}</button>
    </div>`;
    const itensHtml = itens.map(it => {
      const checked = BK_manualSelecionados.some(x => x.id === it.id && x.mes === it.mes);
      const bateValor = Math.abs(it.valor - t.valor) < 0.01;
      const desc = BK_descricaoSaldo('receber', it.id, it.mes);
      return `<div class="concil-item ${checked?'ok':(bateValor?'ok':'info')}" style="cursor:pointer" onclick="BK_toggleManualSel('${it.id}','${it.mes}',${it.valor},'${(it.label||'').replace(/'/g,"\\'")}')">
        <input type="checkbox" ${checked?'checked':''} style="pointer-events:none;width:16px;height:16px;flex-shrink:0"/>
        <div class="concil-item-info"><div class="concil-item-nome">${it.label}</div><div class="concil-item-detalhe">${it.sub} · ${fmt(it.valor)}${desc?' · '+desc:''}</div></div>
      </div>`;
    }).join('') || '<div class="concil-vazio">Nenhum resultado.</div>';
    lista.innerHTML = barra + itensHtml;
    return;
  }

  // Lado Pagar: continua o vínculo direto de um item por vez.
  let itens = [];
  Object.keys(P_meses).forEach(mes => (P_meses[mes]||[]).forEach(r => {
    if (r.nome.toLowerCase().includes(busca)) itens.push({ tipo: 'pagar', id: r.id, mes, label: r.nome, valor: r.valor, sub: `${mes} · dia ${r.dia||'-'}` });
  }));
  itens.sort((a,b) => Math.abs(a.valor - Math.abs(t.valor)) - Math.abs(b.valor - Math.abs(t.valor)));
  itens = itens.slice(0, 30);
  lista.innerHTML = itens.map(it => {
    const bateValor = Math.abs(it.valor - Math.abs(t.valor)) < 0.01;
    const desc = BK_descricaoSaldo(it.tipo, it.id, it.mes);
    return `<div class="concil-item ${bateValor?'ok':'info'}" style="cursor:pointer" onclick='BK_confirmarVinculoManual(${JSON.stringify(it).replace(/'/g,"&#39;")})'>
      <span class="concil-item-icon">${bateValor?'✅':'📄'}</span>
      <div class="concil-item-info"><div class="concil-item-nome">${it.label}</div><div class="concil-item-detalhe">${it.sub} · ${fmt(it.valor)}${desc?' · '+desc:''}</div></div>
    </div>`;
  }).join('') || '<div class="concil-vazio">Nenhum resultado.</div>';
}
async function BK_confirmarVinculoManual(it){
  if (!BK_chaveManualAtual) return;
  const chave = BK_chaveManualAtual;
  const t = BK_extratos.find(x => BK_chave(x) === chave);
  BK_conciliados[chave] = { ...(BK_conciliados[chave]||{}), status: 'match', tipo: it.tipo, id: it.id, mes: it.mes, label: it.label, motivo: 'manual' };
  delete BK_candidatosAmbiguos[chave]; delete BK_sugestoes[chave];
  await BK_fbSalvarConciliado(chave, BK_conciliados[chave]);
  await BK_atualizarRegraAprendida(it, t);
  BK_fecharModalManual(); renderBanco(); toast('✅ Vinculado manualmente!');
}
// Confirma o vínculo manual do lado Receber — 1 diária vira link simples (igual antes),
// 2+ diárias viram grupo e o saldo de cada uma é liquidado (fechamento do mês pago de uma vez).
async function BK_confirmarGrupoManual(){
  if (!BK_manualSelecionados.length || !BK_chaveManualAtual) return;
  const chave = BK_chaveManualAtual;
  const t = BK_extratos.find(x => BK_chave(x) === chave); if (!t) return;
  const isGrupo = BK_manualSelecionados.length > 1;
  const ids = BK_manualSelecionados.map(x => ({ id: x.id, mes: x.mes, valor: x.valor }));
  const labelBase = [...new Set(BK_manualSelecionados.map(x => x.label))].join(', ');
  const label = isGrupo ? `${labelBase} (${ids.length} diárias)` : labelBase;
  const mesRep = BK_manualSelecionados[0].mes;
  const antes = isGrupo ? await BK_settleReceberIds(ids) : null;
  BK_conciliados[chave] = { ...(BK_conciliados[chave]||{}), status: 'match', tipo: 'receber', grupo: isGrupo, id: isGrupo ? null : ids[0].id, ids: isGrupo ? ids : null, antes, mes: mesRep, label, motivo: isGrupo ? 'manual_grupo' : 'manual' };
  delete BK_candidatosAmbiguos[chave]; delete BK_sugestoes[chave];
  await BK_fbSalvarConciliado(chave, BK_conciliados[chave]);
  BK_fecharModalManual(); renderBanco(); toast(isGrupo ? `✅ ${ids.length} diárias conciliadas!` : '✅ Vinculado manualmente!');
}

// ── Criar um lançamento novo direto de uma transação sem correspondência ──
function BK_criarLancamento(chave){
  const t = BK_extratos.find(x => BK_chave(x) === chave); if (!t) return;
  const dataTxn = BK_parseDataBR(t.data); if (!dataTxn) return;
  if (t.valor > 0){
    R_abrirModal();
    document.getElementById('rFValorTotal').value = t.valor;
    document.getElementById('rFDesc').value = t.memo || '';
    document.getElementById('rFDia').value = String(dataTxn.getDate()).padStart(2,'0');
    document.getElementById('rFMes').value = String(dataTxn.getMonth()+1).padStart(2,'0');
    document.getElementById('rFAno').value = dataTxn.getFullYear();
    atualizarMesDoFormularioR(); calcPreviewR();
  } else {
    abrirModalP();
    document.getElementById('pFNome').value = t.memo || '';
    document.getElementById('pFValor').value = Math.abs(t.valor);
    document.getElementById('pFDia').value = dataTxn.getDate();
    const mesTxn = BK_mesRef(dataTxn);
    document.querySelectorAll('#pMesesCheck input').forEach(cb => {
      cb.checked = (cb.value === mesTxn); cb.parentElement.classList.toggle('checked', cb.checked);
    });
  }
  toast('📝 Preencha o nome/cliente e salve — depois volte aqui e rode a conciliação para vincular.', '#4f46e5');
}

// ── Registros do sistema sem transação bancária correspondente (auditoria reversa) ──
function BK_registrosOrfaos(){
  if (!BK_extratos.length) return [];
  const datas = BK_extratos.map(t => BK_parseDataBR(t.data)).filter(Boolean);
  const min = new Date(Math.min(...datas)), max = new Date(Math.max(...datas));
  const orfaos = [];
  R_todosOsDados.forEach(r => {
    if (!r.valorTotal) return;
    const dRef = BK_dataVencimentoReceber(r); if (!dRef || dRef < min || dRef > max) return;
    const temMatch = BK_extratos.some(t => t.valor > 0 && Math.abs(t.valor - r.valorTotal) < 0.01);
    if (!temMatch) orfaos.push({ tipo: 'receber', label: r.cliente, valor: r.valorTotal, data: `venc. ${dRef.toLocaleDateString('pt-BR')} (gravado em ${r.mes} · ${r.data||'-'})` });
  });
  Object.keys(P_meses).forEach(mes => (P_meses[mes]||[]).forEach(r => {
    const dRef = BK_dataContaPagar(r, mes); if (!dRef || dRef < min || dRef > max) return;
    const temMatch = BK_extratos.some(t => t.valor < 0 && Math.abs(Math.abs(t.valor) - r.valor) < 0.01);
    if (!temMatch) orfaos.push({ tipo: 'pagar', label: r.nome, valor: r.valor, data: `venc. ${dRef.toLocaleDateString('pt-BR')} (${mes})` });
  }));
  return orfaos;
}

// ── Render ──
function BK_setFiltro(f, btn){ BK_filtroAtual = f; document.querySelectorAll('#bkFiltros button').forEach(b=>b.classList.remove('active')); if(btn) btn.classList.add('active'); renderBanco(); }

function renderBanco(){
  const total = BK_extratos.length;
  const conciliadosChaves = BK_extratos.filter(t => BK_conciliados[BK_chave(t)]?.status === 'match');
  const ignorados = BK_extratos.filter(t => BK_conciliados[BK_chave(t)]?.status === 'ignorado');
  const ambiguosChaves = BK_extratos.filter(t => BK_candidatosAmbiguos[BK_chave(t)] && !BK_conciliados[BK_chave(t)]);
  const sugestoesChaves = BK_extratos.filter(t => BK_sugestoes[BK_chave(t)] && !BK_conciliados[BK_chave(t)]);
  const semMatch = BK_extratos.filter(t => !BK_conciliados[BK_chave(t)] && !BK_candidatosAmbiguos[BK_chave(t)] && !BK_sugestoes[BK_chave(t)]);
  const orfaos = BK_registrosOrfaos();

  const importInfoEl = document.getElementById('bkImportInfo');
  if (importInfoEl) importInfoEl.innerHTML = BK_renderResumoImportacao();

  document.getElementById('bkResumo').innerHTML = total ? `
    <span class="concil-chip info">📄 ${total} importado(s)</span>
    <span class="concil-chip alert">🔵 ${sugestoesChaves.length} sugestão(ões) aguardando confirmação</span>
    <span class="concil-chip ok">✅ ${conciliadosChaves.length} conciliado(s)</span>
    <span class="concil-chip alert">🟡 ${ambiguosChaves.length} ambíguo(s)</span>
    <span class="concil-chip warn">🔴 ${semMatch.length} sem correspondência</span>
    <span class="concil-chip warn">📋 ${orfaos.length} no sistema sem transação</span>
  ` : `<span class="concil-chip info">Nenhum extrato importado ainda.</span>`;

  const corpo = document.getElementById('bkCorpo');
  if (!total){ corpo.innerHTML = '<div class="concil-vazio">📥 Importe um arquivo .ofx do banco para começar.</div>'; return; }

  if (BK_filtroAtual === 'SISTEMA_ORFAO'){
    corpo.innerHTML = orfaos.length ? orfaos.map(o => `
      <div class="concil-item warn">
        <span class="concil-item-icon">${o.tipo==='receber'?'📥':'📤'}</span>
        <div class="concil-item-info"><div class="concil-item-nome">${o.label}</div><div class="concil-item-detalhe">${o.data} · ${fmt(o.valor)} — sem transação bancária correspondente no extrato importado</div></div>
        <span class="concil-item-status" style="background:#fef9c3;color:#92400e">Verificar</span>
      </div>`).join('') : '<div class="concil-vazio">✅ Todos os registros do período têm transação bancária correspondente.</div>';
    return;
  }

  if (BK_filtroAtual === 'SUGESTOES'){
    if (!sugestoesChaves.length){ corpo.innerHTML = '<div class="concil-vazio">Nenhuma sugestão pendente. Importe um extrato ou rode a conciliação.</div>'; return; }
    const lista = sugestoesChaves.slice().sort((a,b) => BK_parseDataBR(a.data) - BK_parseDataBR(b.data));
    corpo.innerHTML = `<div style="margin-bottom:12px"><button class="btn btn-blue" onclick="BK_confirmarTodasSugestoes()">✅ Confirmar Todas (${lista.length})</button></div>` +
      lista.map(t => {
        const chave = BK_chave(t); const s = BK_sugestoes[chave]; const isCredito = t.valor > 0;
        const motivoTxt = s.motivo === 'padrao_aprendido' ? '🧠 padrão aprendido (valor pode ter mudado)'
          : s.motivo === 'grupo_diarias' ? `🧮 soma de ${s.ids.length} diárias`
          : '💯 valor exato';
        const desc = s.grupo
          ? s.ids.map(it => `<div style="font-size:.74rem;color:#6b7280;padding:2px 0 2px 4px;border-left:2px solid #e5e7eb;margin-top:2px">🎙️ ${it.data||it.mes} · ${fmt(it.valor)}</div>`).join('')
          : BK_descricaoSaldo(s.tipo, s.id, s.mes);
        return `<div class="concil-item info">
          <span class="concil-item-icon">${isCredito?'💰':'📤'}</span>
          <div class="concil-item-info">
            <div class="concil-item-nome">${s.label}</div>
            <div class="concil-item-detalhe">📅 ${t.data} · ${BK_fmtValor(t.valor)} · ${s.tipo==='receber'?'A Receber':'A Pagar'} — ${s.mes} · ${motivoTxt}</div>
            ${desc?`<div class="concil-item-detalhe">${desc}</div>`:''}
          </div>
          <button class="concil-item-acao" style="background:#16a34a;color:white" onclick="BK_confirmarSugestao('${chave}')">✅ Confirmar</button>
          <button class="concil-item-acao" style="background:#f1f5f9;color:#6b7280" onclick="BK_rejeitarSugestao('${chave}')">✕ Rejeitar</button>
        </div>`;
      }).join('');
    return;
  }

  let lista = [];
  if (BK_filtroAtual === 'AMBIGUOS') lista = ambiguosChaves;
  else if (BK_filtroAtual === 'SEM_MATCH') lista = semMatch;
  else if (BK_filtroAtual === 'CONCILIADOS') lista = conciliadosChaves;
  else if (BK_filtroAtual === 'IGNORADOS') lista = ignorados;

  lista.sort((a,b) => BK_parseDataBR(a.data) - BK_parseDataBR(b.data));
  corpo.innerHTML = lista.length ? lista.map(t => {
    const chave = BK_chave(t);
    const isCredito = t.valor > 0;
    if (BK_filtroAtual === 'AMBIGUOS'){
      const cands = BK_candidatosAmbiguos[chave] || [];
      const candsHtml = cands.map(c => {
        const desc = c.grupo ? `soma de ${c.ids.length} diárias` : BK_descricaoSaldo(c.tipo, c.id, c.mes);
        return `<div style="font-size:.78rem;color:#6b7280;padding:3px 0 3px 4px;border-left:2px solid #e5e7eb;margin-top:3px">👤 <b>${c.label}</b> — ${c.mes}${desc?' · '+desc:''}</div>`;
      }).join('');
      return `<div class="concil-item alert">
        <span class="concil-item-icon">⚡</span>
        <div class="concil-item-info">
          <div class="concil-item-nome">${BK_fmtValor(t.valor)} — ${t.memo||'(sem memo)'}</div>
          <div class="concil-item-detalhe">📅 ${t.data} · ${cands.length} conta(s) com esse valor:</div>
          ${candsHtml}
        </div>
        <button class="concil-item-acao" style="background:#f59e0b;color:white" onclick="BK_abrirModalManual('${chave}')">Escolher</button>
        <button class="concil-item-acao" style="background:#f1f5f9;color:#6b7280" onclick="BK_ignorar('${chave}')">Ignorar</button>
      </div>`;
    }
    if (BK_filtroAtual === 'SEM_MATCH'){
      return `<div class="concil-item warn">
        <span class="concil-item-icon">🔴</span>
        <div class="concil-item-info">
          <div class="concil-item-nome">${BK_fmtValor(t.valor)} — ${t.memo||'(sem memo)'}</div>
          <div class="concil-item-detalhe">📅 ${t.data} · ref. banco: ${t.fitid||'-'} · nenhuma conta bate por valor + data, nem padrão aprendido</div>
        </div>
        <button class="concil-item-acao" style="background:#4f46e5;color:white" onclick="BK_abrirModalManual('${chave}')">🔎 Buscar</button>
        <button class="concil-item-acao" style="background:#16a34a;color:white" onclick="BK_criarLancamento('${chave}')">+ Criar Lançamento</button>
        <button class="concil-item-acao" style="background:#f1f5f9;color:#6b7280" onclick="BK_ignorar('${chave}')">Ignorar</button>
      </div>`;
    }
    if (BK_filtroAtual === 'CONCILIADOS'){
      const c = BK_conciliados[chave];
      const motivoBadge = c.motivo === 'manual' ? ' <span style="font-size:.68rem;background:#e0e7ff;color:#4338ca;padding:1px 5px;border-radius:3px">manual</span>'
        : c.motivo === 'manual_grupo' ? ' <span style="font-size:.68rem;background:#e0e7ff;color:#4338ca;padding:1px 5px;border-radius:3px">manual · soma</span>'
        : c.motivo === 'grupo_diarias' ? ' <span style="font-size:.68rem;background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px">🧮 soma de diárias</span>'
        : c.motivo === 'padrao_aprendido' ? ' <span style="font-size:.68rem;background:#ede9fe;color:#6d28d9;padding:1px 5px;border-radius:3px">🧠 aprendido</span>' : '';
      const desc = c.grupo
        ? (c.ids||[]).map(it => `<div style="font-size:.74rem;color:#6b7280;padding:2px 0 2px 4px;border-left:2px solid #e5e7eb;margin-top:2px">🎙️ ${it.mes} · ${fmt(it.valor)} · ✅ saldo quitado</div>`).join('')
        : BK_descricaoSaldo(c.tipo, c.id, c.mes);
      const registro = !c.grupo ? BK_getRegistroAtual(c.tipo, c.id, c.mes) : null;
      const catAtual = (!c.grupo && c.tipo === 'pagar') ? (registro?.categoria || '') : '';
      return `<div class="concil-item ok">
        <span class="concil-item-icon">✅</span>
        <div class="concil-item-info">
          <div class="concil-item-nome">${c.label}${motivoBadge}</div>
          <div class="concil-item-detalhe">📅 ${t.data} · ${BK_fmtValor(t.valor)} · ${c.tipo==='receber'?'A Receber':'A Pagar'} — ${c.mes}</div>
          ${desc?`<div class="concil-item-detalhe">${desc}</div>`:''}
          ${(!c.grupo && c.tipo==='pagar') ? BK_selectCategoriaHtml(catAtual, `BK_alterarCategoriaConciliado('${chave}',this.value)`) : ''}
        </div>
        <button class="concil-item-acao" style="background:#f1f5f9;color:#6b7280" onclick="BK_desfazer('${chave}')">↩️ Desfazer</button>
      </div>`;
    }
    // IGNORADOS
    const catAtualIgn = BK_conciliados[chave]?.categoria || '';
    return `<div class="concil-item info">
      <span class="concil-item-icon">🗑️</span>
      <div class="concil-item-info">
        <div class="concil-item-nome">${t.memo||'(sem memo)'}</div>
        <div class="concil-item-detalhe">📅 ${t.data} · ${BK_fmtValor(t.valor)}</div>
        ${BK_selectCategoriaHtml(catAtualIgn, `BK_definirCategoriaTxn('${chave}',this.value)`)}
      </div>
      <button class="concil-item-acao" style="background:#f1f5f9;color:#6b7280" onclick="BK_desfazer('${chave}')">↩️ Reverter</button>
    </div>`;
  }).join('') : '<div class="concil-vazio">Nada aqui por enquanto.</div>';
}

// Carrega conciliações e regras persistidas assim que o módulo sobe
Promise.all([BK_carregarConciliados(), BK_carregarRegras()]).then(() => {
  if (BK_extratos.length) BK_executarMatching();
  if (mainAtivo === 'banco') renderBanco();
  // Atualiza o selo 🏦/⚪ em Receber e Pagar caso já estejam na tela (dados chegaram depois do render inicial)
  if (mainAtivo === 'receber' && subRAtivo === 'r-lancamentos') renderTabelaR();
  if (mainAtivo === 'pagar' && subPAtivo === 'p-contas') renderTabelaP();
});
