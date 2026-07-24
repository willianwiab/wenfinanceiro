// ══════════════════════════════════════════════════════════════════════
// concil.js — Conciliação "Trazer extrato" portada do Nossa Semente (EX_/B_/RC_)
// para o WEN Financeiro. MESMA tela/layout/comportamento do NS; adaptada às
// costuras de dados do WEN (ver Documents/SYNC-NS-WEN.md — módulo ESPELHADO).
//
// Estratégia: o motor do NS (lado a lado, rateio, navegação de mês, filtros,
// aprendizado) roda aqui sob o namespace CX_, e um ADAPTADOR liga às APIs do WEN:
//   - mês:      NS 'YYYY-MM'  ↔  WEN 'JUL/2026'   (CX_mesNS / CX_mesWEN)
//   - contas:   BC_CONTAS / BC_saldoConta
//   - movs:     BC_MOVS / BC_fbUpsert(movimentacoes_contas)
//   - pagar:    P_meses (chave WEN) / status+valorPago / P_salvarStorage
//   - receber:  R_todosOsDados / valorReserva+saldo / R_fbSalvar
//   - concil.:  banco_conciliados (schema WEN)
//   - regras:   banco_regras (aprendizado — reaproveita a coleção legada do BK_)
//
// Testável isolado (fonte-única) — não depende do DOM para as funções puras.
// ══════════════════════════════════════════════════════════════════════

// ── Adaptador de MÊS (a diferença transversal mais delicada) ──
// WEN usa 'MMM/AAAA' com mês abreviado em maiúsculas (ex.: 'JUL/2026').
// NS (e todo o motor EX_) usa ISO 'AAAA-MM' (ex.: '2026-07').
const CX_MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const CX_MESES_IDX = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };

// 'JUL/2026' -> '2026-07'
function CX_mesNS(chaveWEN) {
  if (!chaveWEN) return '';
  const p = String(chaveWEN).split('/');
  if (p.length !== 2) return '';
  const idx = CX_MESES_IDX[(p[0] || '').toUpperCase()];
  const ano = parseInt(p[1], 10);
  if (idx == null || !ano) return '';
  return ano + '-' + String(idx + 1).padStart(2, '0');
}
// '2026-07' -> 'JUL/2026'
function CX_mesWEN(chaveNS) {
  if (!chaveNS) return '';
  const p = String(chaveNS).split('-');
  if (p.length !== 2) return '';
  const ano = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if (!ano || !m || m < 1 || m > 12) return '';
  return CX_MESES_ABREV[m - 1] + '/' + ano;
}
// vencimento (ISO 'AAAA-MM-DD') a partir da chave WEN + dia
function CX_vencISO(chaveWEN, dia) {
  const ns = CX_mesNS(chaveWEN); if (!ns) return '';
  const [a, m] = ns.split('-').map(Number);
  const diaMax = new Date(a, m, 0).getDate();
  const d = Math.min(Math.max(parseInt(dia, 10) || 1, 1), diaMax);
  return ns + '-' + String(d).padStart(2, '0');
}
// mês ISO deslocado por N meses: ('2026-07', -1) -> '2026-06'
function CX_mesShift(chaveNS, delta) {
  const [a, m] = String(chaveNS).split('-').map(Number);
  const d = new Date(a, (m - 1) + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
// rótulo pt-BR de um mês ISO ('2026-07' -> 'julho de 2026')
function CX_mesLabel(chaveNS) {
  const [a, m] = String(chaveNS).split('-').map(Number);
  if (!a || !m) return chaveNS || '';
  return new Date(a, m - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

// ── Adaptador de LEITURA (reaproveita o motor CONC_ que o WEN JÁ TEM) ──
// Descoberta: o WEN já casa e dá baixa (CONC_pagarAbertos/receberAbertos/candidatosDe/conciliar +
// banco_conciliados). O porte então é UI-on-top: trago a experiência do NS (lado a lado/rateio/mês/
// filtros/aprende) e ligo neste motor. Estes helpers devolvem os dados em SHAPE-NS pro motor CX_.

// Fixas/receber ABERTAS de um mês (chave NS), da conta ou sem conta → {tipo,id,mes,nome,valor,data,conta,pago}
function CX_fixasDoMes(contaId, mesNS) {
  const mesWEN = CX_mesWEN(mesNS), out = [];
  const naConta = cf => !cf || cf === contaId;
  try {
    (typeof CONC_pagarAbertos === 'function' ? CONC_pagarAbertos() : []).forEach(c => {
      const cf = c.r && c.r.contaBancariaId;
      if (c.mes !== mesWEN || !naConta(cf)) return;
      out.push({ tipo: 'pagar', id: c.id, mes: mesNS, nome: c.nome, valor: c.valor, data: c.iso, conta: cf || null, pago: false });
    });
  } catch (e) {}
  try {
    (typeof CONC_receberAbertos === 'function' ? CONC_receberAbertos() : []).forEach(c => {
      const cf = c.r && c.r.contaBancariaId;
      if ((c.mes || '') !== mesWEN || !naConta(cf)) return;
      out.push({ tipo: 'receber', id: c.id, mes: mesNS, nome: c.nome, valor: c.valor, data: c.iso, conta: cf || null, pago: false });
    });
  } catch (e) {}
  return out;
}

// Melhor candidato pra um item do extrato (valor + data + tolerância), reusando CONC_candidatosDe.
// Prioriza mesma conta / sem conta (como o NS). Retorna {tipo,id,mes,nome,valor,conta} ou null.
function CX_candidatos(item, contaId) {
  const mov = { tipo: (item.valor >= 0 ? 'entrada' : 'saida'), valor: Math.abs(item.valor), data: item.data };
  let cands = [];
  try { cands = (typeof CONC_candidatosDe === 'function') ? (CONC_candidatosDe(mov) || []) : []; } catch (e) { return null; }
  const naConta = c => { const cf = c.r && c.r.contaBancariaId; return !cf || cf === contaId; };
  const c = cands.filter(naConta)[0];
  if (!c) return null;
  return { tipo: c.tipo, id: c.id, mes: CX_mesNS(c.mes) || '', nome: c.nome, valor: c.valor, conta: (c.r && c.r.contaBancariaId) || null };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// Ponte pro motor CE_: no Nossa Semente ele chama C_normalizar/C_similaridade; aqui os
// equivalentes são CX_norm/CX_similar. Assim o bloco CE_ abaixo é IDÊNTICO ao do NS.
// ══════════════════════════════════════════════════════════════════════════════════════════
function C_normalizar(s) { return CX_norm(s); }
function C_similaridade(a, b) { return CX_similar(a, b); }

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CE_ — MOTOR DE CONCILIAÇÃO (funções PURAS: sem DOM, sem Firestore, sem estado global)
// É a parte reaproveitável (o WEN usa as MESMAS regras) e a parte 100% testável em Node.
// Recebe dados, devolve dados. Nada aqui grava, lê tela ou depende de variável de módulo.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const CE_TOL_VALOR = 0.02;    // folga de centavos pra considerar "mesmo valor"
const CE_TOL_DIAS = 3;        // janela de vencimento pro casamento forte por data
const CE_NIVEL_EXATA = 80;    // >= vira "exata" (entra no lote automático). 80 exige valor idêntico MAIS
                              // evidência de nome MAIS data próxima. Só valor+data (70) não chega — coincidência
                              // de valor não basta pra aplicar em lote sem você olhar item a item.
const CE_NIVEL_PROVAVEL = 65; // >= vira "provável" (sugere, mas pede olhada). 60 é de propósito a
                              // fronteira do comportamento antigo: valor exato + vencimento dentro da tolerância.
                              // Abaixo disso vira sugestão pra revisar — aparece, mas não pareia sozinho.

function CE_norm(s) { return (typeof C_normalizar === 'function') ? C_normalizar(s || '') : String(s || '').toLowerCase().trim(); }
function CE_sim(a, b) { return (typeof C_similaridade === 'function') ? C_similaridade(a, b) : (a === b ? 1 : 0); }
function CE_dias(a, b) { if (!a || !b) return 999; const d = Math.abs(new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')); return Math.round(d / 86400000); }

// Pontua o quanto ESTE lançamento combina com ESTA movimentação do extrato.
// Devolve o score 0–100, o nível e os CRITÉRIOS — é isso que a tela mostra como "por quê".
// `regra` (opcional) = regra aprendida que aponta pra este nome.
function CE_score(mov, lanc, regra) {
  const crit = [];
  const abs = Math.abs(Number(mov.valor) || 0), lv = Math.abs(Number(lanc.valor) || 0);
  const dv = Math.abs(abs - lv);
  let s = 0;
  // 1) nome primeiro — porque é ele que autoriza o crédito de "pagamento parcial" logo abaixo
  const sim = CE_sim(CE_norm(mov.descricao), CE_norm(lanc.nome));
  let ptsNome = 0, labelNome = null;
  if (sim >= 0.85) { ptsNome = 30; labelNome = 'nome bate com a descrição'; }
  else if (sim >= 0.55) { ptsNome = 16; labelNome = 'nome parecido'; }
  else if (CE_norm(lanc.nome) && CE_norm(mov.descricao).indexOf(CE_norm(lanc.nome)) >= 0) { ptsNome = 20; labelNome = 'nome aparece na descrição'; }
  // 2) valor — o critério mais forte
  if (dv < CE_TOL_VALOR) { s += 50; crit.push({ ok: true, peso: 50, label: 'valor idêntico' }); }
  else if (lv > 0 && dv / lv <= 0.02) { s += 30; crit.push({ ok: true, peso: 30, label: 'valor quase igual (' + (dv / lv * 100).toFixed(1) + '% de diferença)' }); }
  else if (lv > 0 && dv / lv <= 0.15) { s += 12; crit.push({ ok: true, peso: 12, label: 'valor próximo' }); }
  // pagou MENOS que a conta e o nome bate: num pagamento parcial o valor é menor de propósito.
  // Só vale com evidência de nome — senão qualquer valor pequeno viraria candidato de qualquer conta.
  else if (abs < lv && ptsNome) { s += 10; crit.push({ ok: true, peso: 10, label: 'valor cabe como pagamento parcial' }); }
  else crit.push({ ok: false, peso: 0, label: 'valor diferente' });
  if (ptsNome) { s += ptsNome; crit.push({ ok: true, peso: ptsNome, label: labelNome }); }
  // 3) data × vencimento
  const dd = CE_dias(mov.data, lanc.data);
  if (dd === 0) { s += 15; crit.push({ ok: true, peso: 15, label: 'vence no mesmo dia' }); }
  else if (dd <= CE_TOL_DIAS) { s += 12; crit.push({ ok: true, peso: 12, label: 'vence a ' + dd + ' dia(s)' }); }
  else if (dd <= 10) { s += 6; crit.push({ ok: true, peso: 6, label: 'vence a ' + dd + ' dias' }); }
  else crit.push({ ok: false, peso: 0, label: 'vencimento distante' });
  // 4) regra aprendida
  if (regra && CE_norm(regra.nome) === CE_norm(lanc.nome)) { s += 20; crit.push({ ok: true, peso: 20, label: '🧠 você já conciliou assim antes' }); }
  // 5) mesma conta bancária
  if (mov.conta && lanc.conta && mov.conta === lanc.conta) { s += 5; crit.push({ ok: true, peso: 5, label: 'mesma conta bancária' }); }
  const score = Math.max(0, Math.min(100, s));
  return { score, nivel: CE_nivel(score), criterios: crit };
}
function CE_nivel(score) { return score >= CE_NIVEL_EXATA ? 'exata' : score >= CE_NIVEL_PROVAVEL ? 'provavel' : 'revisao'; }
function CE_nivelLabel(n) { return n === 'exata' ? 'correspondência exata' : n === 'provavel' ? 'correspondência provável' : 'precisa de revisão'; }

// Ranqueia TODOS os lançamentos candidatos pra uma movimentação. Só devolve os que fazem sentido
// (direção certa: entrada↔receber, saída↔pagar) e que não estão quitados.
function CE_ranquear(mov, lancamentos, regra) {
  const ent = (Number(mov.valor) || 0) >= 0;
  return (lancamentos || [])
    .filter(l => l && !l.pago && ((ent && l.tipo === 'receber') || (!ent && l.tipo === 'pagar')))
    .map(l => Object.assign({}, l, CE_score(mov, l, regra)))
    .filter(l => l.score >= 25)
    .sort((a, b) => b.score - a.score);
}
// Há ambiguidade quando o 2º candidato chega perto do 1º — a tela avisa em vez de escolher sozinha.
function CE_ambiguo(rank) { return rank.length >= 2 && (rank[0].score - rank[1].score) <= 10; }

// Busca livre: acha QUALQUER lançamento por nome, valor ou data — independente do mês.
// Aceita "energia", "184", "184,90", "2026-07" ou "07/2026".
function CE_buscar(lancamentos, termo) {
  const t = String(termo || '').trim(); if (!t) return [];
  const n = CE_norm(t);
  const num = parseFloat(t.replace(/\./g, '').replace(',', '.'));
  const temNum = !isNaN(num) && /\d/.test(t);
  const dataBR = t.match(/^(\d{2})\/(\d{4})$/);
  const alvoMes = dataBR ? dataBR[2] + '-' + dataBR[1] : (/^\d{4}-\d{2}$/.test(t) ? t : null);
  return (lancamentos || []).filter(l => {
    if (alvoMes) return (l.data || '').slice(0, 7) === alvoMes;
    // `n` vazio = termo só de números (C_normalizar tira dígitos). Aí a busca é SÓ por valor —
    // senão indexOf('') casaria com todo mundo.
    if (n && CE_norm(l.nome).indexOf(n) >= 0) return true;
    if (n && l.categoria && CE_norm(l.categoria).indexOf(n) >= 0) return true;
    if (temNum && Math.abs((Number(l.valor) || 0) - num) < 0.02) return true;
    return false;
  });
}

// Valor que ESTE par tira do lançamento. Rascunhos antigos não têm valorBaixa → cai no valor cheio.
function CE_valorBaixa(p) { return (p && p.valorBaixa != null) ? (Number(p.valorBaixa) || 0) : (Number(p && p.valor) || 0); }
// Situação da soma dos pares de uma movimentação: nada / falta / fecha / passou.
function CE_situacao(valorMov, somaPares) {
  const abs = Math.abs(Number(valorMov) || 0), s = Number(somaPares) || 0;
  if (s <= 0.005) return 'vazio';
  if (Math.abs(abs - s) < CE_TOL_VALOR) return 'exato';
  return s < abs ? 'parcial' : 'excedente';
}
// Quanto já foi aplicado NESTE lançamento somando TODAS as movimentações (é o que permite N movs → 1 lançamento).
function CE_aplicadoNo(itens, lanc) {
  return (itens || []).reduce((s, it) => s + ((it.pares || []).filter(p => p.id === lanc.id && p.tipo === lanc.tipo).reduce((a, p) => a + CE_valorBaixa(p), 0)), 0);
}
// Resumo da sessão: contagens e VALORES (é o indicador "conciliado × pendente" da tela).
function CE_resumo(itens) {
  const r = { total: 0, conciliados: 0, parciais: 0, semPar: 0, ignorados: 0, duplicados: 0, valorConciliado: 0, valorPendente: 0, valorIgnorado: 0 };
  (itens || []).forEach(it => {
    if (it.dup) { r.duplicados++; return; }
    r.total++;
    const abs = Math.abs(Number(it.valor) || 0);
    if (it.ignorado) { r.ignorados++; r.valorIgnorado += abs; return; }
    const soma = (it.pares || []).reduce((s, p) => s + CE_valorBaixa(p), 0);
    const sit = CE_situacao(it.valor, soma);
    if (sit === 'exato') { r.conciliados++; r.valorConciliado += abs; }
    else if (sit === 'parcial') { r.parciais++; r.valorConciliado += soma; r.valorPendente += abs - soma; }
    else { r.semPar++; r.valorPendente += abs; }
  });
  return r;
}

// ── Helpers puros (portados do C_ do NS — normalização + similaridade p/ regras/categoria) ──
function CX_norm(desc) {
  let s = (desc || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\bparc\w*\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}/gi, ' ');
  s = s.replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ').replace(/[0-9]+/g, ' ');
  return s.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
function CX_lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function CX_similar(a, b) { if (!a || !b) return 0; const L = Math.max(a.length, b.length); return L ? 1 - CX_lev(a, b) / L : 0; }

// ── Adaptador de ESCRITA (reusa o motor de baixa CONC_ do WEN) ──
// Cria 1 movimento em movimentacoes_contas (espelha IMP_importar). id determinístico → idempotente.
// sufixo distingue as pernas de um RATEIO (1 débito → N movs, 1 por fixa, somando o valor do extrato).
function CX_criarMov(contaId, fitid, sufixo, valorSinalizado, data, descricao, categoria) {
  const ent = valorSinalizado >= 0, abs = Math.abs(valorSinalizado);
  const id = 'mov_ofx_' + contaId + '_' + fitid + (sufixo ? ('_' + sufixo) : '');
  const desc = (descricao || '').startsWith('📥') ? descricao : ('📥 ' + (descricao || ''));
  const mov = { id, contaId, tipo: ent ? 'entrada' : 'saida', valor: abs, data, descricao: desc, categoria: categoria || '', origemTipo: 'import', origemId: fitid, estornada: false };
  try { BC_MOVS = BC_MOVS.filter(m => m.id !== id); BC_MOVS.push(mov); if (typeof BC_fbUpsert === 'function') BC_fbUpsert(BC_COL_MOV, id, mov); } catch (e) {}
  return mov;
}
// Dá baixa numa fixa/receber ligando ao movimento já criado — REUSA CONC_conciliar (baixa + banco_conciliados, testado).
async function CX_conciliarFixa(mov, fixa, valorBaixa) {
  if (typeof CONC_conciliar !== 'function' || !mov) return false;
  const mesWEN = CX_mesWEN(fixa.mes) || (fixa.mes || '');
  try { await CONC_conciliar(mov.id, fixa.tipo + '|' + fixa.id + '|' + mesWEN, valorBaixa); return true; } catch (e) { return false; }
}
// Categoria sugerida — passa pelo motor do WEN (IMP_sugerirCatConf), com fallback.
function CX_categoria(desc) {
  try { if (typeof IMP_sugerirCatConf === 'function') { const s = IMP_sugerirCatConf(desc); return (s && (s.categoria || s.cat)) || ''; } } catch (e) {}
  return '';
}

// ── Aprendizado de conciliação (Fase 4) — reusa a coleção legada banco_regras do WEN ──
let CX_regras = [], CX_regrasCarregado = false;
async function CX_carregarRegras() {
  if (CX_regrasCarregado) return;
  try { const raw = (typeof BC_fbCarregar === 'function') ? await BC_fbCarregar('banco_regras') : []; CX_regras = Array.isArray(raw) ? raw : Object.values(raw || {}); CX_regrasCarregado = true; } catch (e) { CX_regras = []; }
}
function CX_regraId(norm) { return 'rc_' + norm.replace(/\s+/g, '_').slice(0, 60); }
function CX_regraSugerir(descricao) {
  const norm = CX_norm(descricao); if (!norm) return null;
  const exata = CX_regras.find(r => r.descricaoNormalizada === norm);
  if (exata) return { nome: exata.nomeConta, tipo: exata.tipo || 'pagar', conf: 'alta' };
  let melhor = null, sim = 0;
  CX_regras.forEach(r => { const s = CX_similar(norm, r.descricaoNormalizada || ''); if (s > sim) { sim = s; melhor = r; } });
  if (melhor && sim >= 0.88) return { nome: melhor.nomeConta, tipo: melhor.tipo || 'pagar', conf: 'media' };
  return null;
}
async function CX_regraAprender(descricao, nomeConta, tipo) {
  const norm = CX_norm(descricao); if (!norm || !nomeConta) return;
  const id = CX_regraId(norm);
  const ex = CX_regras.find(r => r.id === id);
  const dados = { id, descricaoNormalizada: norm, nomeConta, tipo: tipo || 'pagar', ocorrencias: (ex ? ex.ocorrencias || 0 : 0) + 1, ultimoUso: new Date().toISOString().slice(0, 10) };
  try { if (typeof BC_fbUpsert === 'function') await BC_fbUpsert('banco_regras', id, dados); } catch (e) { return; }
  if (ex) Object.assign(ex, dados); else CX_regras.push(dados);
}

// ── CATEGORIAS contextuais: DESPESA reusa CATS_P do WEN; RECEITA é uma lista nova
// e editável (coleção `categorias_receber`), espelhando o padrão de `categorias_pagar`.
// Nos dois casos o dropdown tem "➕ adicionar nova", que persiste na lista certa.
const CX_CATS_R_SEED = [
  { id: 'locacao_estudio', label: 'Locação estúdio' },
  { id: 'edicao', label: 'Edição' },
  { id: 'servicos_rec', label: 'Serviços' },
  { id: 'outros_rec', label: 'Outros' },
];
let CX_catsR = null, CX_catsRCarregado = false;
async function CX_carregarCatsR() {
  if (CX_catsRCarregado) return;
  try {
    const raw = (typeof BC_fbCarregar === 'function') ? await BC_fbCarregar('categorias_receber') : [];
    const arr = (Array.isArray(raw) ? raw : Object.values(raw || {})).filter(c => c && c.label);
    if (arr.length) CX_catsR = arr.map(c => ({ id: c.id || CX_slug(c.label), label: c.label }));
    else { CX_catsR = CX_CATS_R_SEED.slice(); for (const c of CX_catsR) { try { await BC_fbUpsert('categorias_receber', c.id, { label: c.label }); } catch (e) {} } }
    CX_catsRCarregado = true;
  } catch (e) { CX_catsR = CX_CATS_R_SEED.slice(); }
}
function CX_slug(label) { try { if (typeof CAT_slug === 'function') return CAT_slug(label); } catch (e) {} return String(label || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || ('cat_' + Date.now()); }
function CX_catsReceita() { return CX_catsR || CX_CATS_R_SEED.slice(); }
function CX_catsDespesa() { try { return Object.keys(CATS_P).map(k => ({ id: k, label: (catInfoP(k) || {}).label || k })); } catch (e) { return []; } }
// cria de verdade na lista certa (receita → categorias_receber; despesa → CATS_P/categorias_pagar)
async function CX_criarCategoria(label, ehReceita) {
  const slug = CX_slug(label);
  if (ehReceita) {
    CX_catsR = (CX_catsR || CX_CATS_R_SEED.slice()); CX_catsR.push({ id: slug, label });
    try { if (typeof BC_fbUpsert === 'function') await BC_fbUpsert('categorias_receber', slug, { label }); } catch (e) {}
  } else {
    const dados = { label, icon: '📦', color: '#94a3b8', bg: '#f1f5f9' };
    try { CATS_P[slug] = dados; } catch (e) {}
    try { if (typeof CAT_fbSalvar === 'function') await CAT_fbSalvar(slug, dados); } catch (e) {}
  }
  return slug;
}

// ══════════════════════════════════════════════════════════════════════
// MOTOR CX_ — UI portada do EX_ do Nossa Semente (lado a lado, rateio, mês,
// filtros, aprende). Só roda no navegador (usa DOM). Ligada ao adaptador acima.
// ══════════════════════════════════════════════════════════════════════
if (typeof document !== 'undefined') (function () {

  // ── shims de apresentação (delegam pros helpers do WEN, com fallback) ──
  const esc = s => { try { if (typeof escapeHtml === 'function') return escapeHtml(s); } catch (e) {} return String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); };
  const money = n => { try { if (typeof fmt === 'function') return fmt(n); } catch (e) {} return 'R$ ' + (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  const dataBR = iso => { if (!iso) return ''; const p = String(iso).split('-'); return p.length === 3 ? (p[2] + '/' + p[1] + '/' + p[0].slice(2)) : String(iso); };
  const aviso = (msg, cor) => { try { if (typeof toast === 'function') return toast(msg, cor); } catch (e) {} };
  const el = id => document.getElementById(id);

  // ── estado ──
  let IMP = null, selE = null, selD = null, lancCache = [], ignoradas = new Set(), confirmando = false;
  const TIPOS = { entrada: 'Entrada', saida: 'Saída', pix_recebido: 'Pix recebido', pix_enviado: 'Pix enviado', boleto: 'Pagamento de boleto', debito: 'Compra no débito', tarifa: 'Tarifa bancária', transferencia_recebida: 'Transf. recebida', transferencia_enviada: 'Transf. enviada', outro: 'Outro' };
  function optsTipo(sel) { return Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${v}</option>`).join(''); }
  function classificarTipo(desc, valor) { const s = (desc || '').toLowerCase(), ent = valor >= 0; if (/\bpix\b/.test(s)) return ent ? 'pix_recebido' : 'pix_enviado'; if (ent) return 'entrada'; if (/(boleto|pagamento|fatura|conta de)/.test(s)) return 'boleto'; if (/(tarifa|cesta|manutenc|anuidad)/.test(s)) return 'tarifa'; if (/(compra|debito|cartao)/.test(s)) return 'debito'; return 'saida'; }
  function confPill(c) { const m = { alta: ['#dcfce7', '#166534', 'alta'], media: ['#fef9c3', '#854d0e', 'média'], baixa: ['#fee2e2', '#991b1b', 'baixa'] }[c] || ['#f1f5f9', '#475569', 'revisar']; return `<span style="background:${m[0]};color:${m[1]};border-radius:20px;padding:1px 8px;font-size:.72rem;font-weight:700">${m[2]}</span>`; }

  // ── rateio/parcial: cada par carrega o valor que TIRA daquela conta (valorBaixa).
  // Um campo só resolve rateio (1 mov → N contas), baixa PARCIAL e N movs → 1 conta.
  const soma = it => ((it && it.pares) || []).reduce((s, p) => s + CE_valorBaixa(p), 0);
  const falta = it => Math.round((Math.abs(it.valor) - soma(it)) * 100) / 100;
  const completo = it => !!(it && it.pares && it.pares.length) && CE_situacao(it.valor, soma(it)) === 'exato';
  // par já com o valor de baixa certo: nunca tira mais do que sobra na conta nem na movimentação
  function novoPar(fx, restanteMov, jaAplicado) {
    const disp = Math.max(0, (Number(fx.valor) || 0) - (Number(jaAplicado) || 0));
    return { tipo: fx.tipo, id: fx.id, mes: fx.mes || '', nome: fx.nome, valor: Number(fx.valor) || 0, valorBaixa: Math.round(Math.min(disp, Math.max(0, Number(restanteMov) || 0)) * 100) / 100, conta: fx.conta || null, viaRegra: !!fx.viaRegra, score: fx.score != null ? fx.score : null, nivel: fx.nivel || null };
  }
  // candidatos que AINDA cabem (descarta os já cobertos por outra movimentação desta sessão)
  function candsLivres(imp, it) {
    const rank = (it && it.rank && it.rank.length) ? it.rank : (it && it.concilCand ? [it.concilCand] : []);
    const itens = (imp && imp.itens) || [];
    return rank.filter(c => (Number(c.valor) || 0) - CE_aplicadoNo(itens, c) > 0.02);
  }
  const sync = it => { if (it) it.conciliar = !!(it.pares && it.pares.length); };
  const diffDias = (a, b) => { try { return Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000); } catch (e) { return 999; } };

  // ids já conciliadas antes (a partir do CONC_LINKS/banco_conciliados do WEN)
  function idsConciliadasAntes() { const s = new Set(); try { Object.values(CONC_LINKS || {}).forEach(c => { if (c && c.status === 'match' && c.id) s.add(String(c.id)); }); } catch (e) {} return s; }

  // sugestão de conciliação: PRIMEIRO regra aprendida (por descrição, casa por nome+valor ignorando data), senão valor+data
  // Ranking COMPLETO de candidatos, com score/nível/critérios (o "por quê" da tela) — motor CE_.
  function ranking(item, contaId) {
    let regra = null; try { regra = CX_regraSugerir(item.descricao || ''); } catch (e) {}
    let lancs = []; try { lancs = allAbertos(contaId); } catch (e) { return []; }
    let r = [];
    try { r = CE_ranquear({ valor: item.valor, data: item.data, descricao: item.descricao, conta: contaId }, lancs, regra); } catch (e) { return []; }
    if (regra) r.forEach(c => { if (CE_norm(c.nome) === CE_norm(regra.nome)) c.viaRegra = true; });
    return r;
  }
  function concilCand(item, contaId) { const r = ranking(item, contaId); return r.length ? r[0] : null; }
  // todas as fixas/receber abertas (qualquer mês) da conta/sem conta — em shape NS
  function allAbertos(contaId) {
    const out = [], naConta = cf => !cf || cf === contaId;
    try { (typeof CONC_pagarAbertos === 'function' ? CONC_pagarAbertos() : []).forEach(c => { const cf = c.r && c.r.contaBancariaId; if (naConta(cf)) out.push({ tipo: 'pagar', id: c.id, mes: CX_mesNS(c.mes), nome: c.nome, valor: c.valor, data: c.iso, conta: cf || null }); }); } catch (e) {}
    try { (typeof CONC_receberAbertos === 'function' ? CONC_receberAbertos() : []).forEach(c => { const cf = c.r && c.r.contaBancariaId; if (naConta(cf)) out.push({ tipo: 'receber', id: c.id, mes: CX_mesNS(c.mes), nome: c.nome, valor: c.valor, data: c.iso, conta: cf || null }); }); } catch (e) {}
    return out;
  }
  // fixas pendentes do(s) mês(es) do extrato que NÃO casaram (rodapé)
  function pendentesSemExtrato(contaId, idsCasados, mesesNS) {
    const set = mesesNS instanceof Set ? mesesNS : new Set(mesesNS || []);
    return allAbertos(contaId).filter(fx => (!set.size || set.has(fx.mes)) && !idsCasados.has(fx.id));
  }

  // saldo final do extrato (LEDGERBAL) — alimenta o banner "saldo do extrato × saldo cadastrado"
  function parseSaldoOFX(texto) {
    try { const b = [...String(texto).matchAll(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/gi)].map(m => parseFloat(String(m[1]).replace(',', '.'))); return { saldoFinal: b.length ? b[b.length - 1] : null }; } catch (e) { return {}; }
  }
  // ── contas (BC_) ──
  const contasAtivas = () => (typeof BC_contasAtivas === 'function') ? BC_contasAtivas() : Object.keys(BC_CONTAS || {});
  const contaInfo = id => { const c = (BC_CONTAS || {})[id] || {}; return { inst: c.banco || '', nome: c.nome || '' }; };
  const contaSaldo = id => { try { return (typeof BC_saldoConta === 'function') ? BC_saldoConta(id) : null; } catch (e) { return null; } };

  // ── montar itens (categoria + tipo + duplicidade + sugestão de conciliação) ──
  function montar(brutos, saldos, origem) {
    const contaId = el('cxConta').value;
    const movsConta = (typeof BC_MOVS !== 'undefined' ? BC_MOVS : []).filter(m => m.contaId === contaId);
    const idsMov = new Set(movsConta.map(m => m.id));
    const idsConc = idsConciliadasAntes();
    const vistos = new Set();
    const itens = brutos.map((b, idx) => {
      const chave = 'mov_ofx_' + contaId + '_' + b.fitid;
      const tipoMov = classificarTipo(b.descricao, b.valor);
      let dup = null;
      if (idsMov.has(chave)) dup = { tipo: 'existente' };
      else { const k = b.data + '|' + Math.round(b.valor * 100) + '|' + CX_norm(b.descricao); if (vistos.has(k)) dup = { tipo: 'lote' }; else vistos.add(k); }
      const rank = !dup ? ranking({ valor: b.valor, data: b.data, descricao: b.descricao }, contaId) : [];
      const cc = rank.length ? rank[0] : null, amb = CE_ambiguo(rank);
      // só pareia sozinho com correspondência forte E sem empate — ambíguo é você quem decide
      const auto = !!cc && cc.nivel !== 'revisao' && !amb;
      return { id: 'cx' + idx, fitid: b.fitid, chave, data: b.data, valor: b.valor, descricao: b.descricao, categoria: (b.valor < 0 ? (CX_categoria(b.descricao) || null) : null), confianca: 'revisar', tipoMov, dup, concilCand: cc, rank: rank.slice(0, 5), ambiguo: amb, pares: auto ? [novoPar(cc, Math.abs(b.valor), 0)] : [], conciliar: auto, incluir: !dup, ignorado: null };
    });
    const datas = itens.map(i => i.data).filter(Boolean).sort();
    if (datas.length) { const de = el('cxDe'), ate = el('cxAte'); if (de && !de.value) de.value = datas[0]; if (ate && !ate.value) ate.value = datas[datas.length - 1]; }
    const mesExtrato = (datas.length ? datas[0] : new Date().toISOString().slice(0, 10)).slice(0, 7);
    IMP = { contaId, origem, itens, saldoFinal: (saldos && saldos.saldoFinal != null) ? saldos.saldoFinal : null, filtro: 'todos', mesConcil: mesExtrato, filtroConcil: 'aconciliar', busca: '', foco: false, focoIdx: 0 };
    selE = null; selD = null; ignoradas = new Set();
    renderRevisao();
  }

  // ── lançamentos do mês (coluna direita) ──
  function fixasDoMes(contaId, mesNS) { return CX_fixasDoMes(contaId, mesNS); }

  // ── render principal ──
  function renderRevisao() {
    const imp = IMP; if (!imp) return; const cont = el('cxResultado'); if (!cont) return;
    const info = contaInfo(imp.contaId);
    const incl = imp.itens.filter(i => i.incluir);
    const totEnt = incl.filter(i => i.valor >= 0).reduce((s, i) => s + i.valor, 0);
    const totSai = incl.filter(i => i.valor < 0).reduce((s, i) => s + Math.abs(i.valor), 0);
    const liquido = totEnt - totSai;
    const res = CE_resumo(imp.itens);   // motor puro: contagens E valores (conciliado × pendente)
    const pend = incl.filter(i => !i.categoria && !i.conciliar && !i.ignorado).length;
    const dupN = res.duplicados;
    const concilN = imp.itens.filter(i => i.concilCand || (i.pares && i.pares.length)).length;
    const concilOn = incl.filter(i => i.conciliar).length;
    const nSug = imp.itens.filter(i => !i.dup && !i.ignorado && !(i.pares || []).length && i.concilCand && !i.ambiguo && i.concilCand.nivel !== 'revisao').length;
    const nRevisar = imp.itens.filter(i => !i.dup && !i.ignorado && (i.ambiguo || (i.concilCand && i.concilCand.nivel === 'revisao') || CE_situacao(i.valor, soma(i)) === 'parcial')).length;
    const nExatas = imp.itens.filter(i => { if (i.dup || i.ignorado || (i.pares || []).length) return false; const lv = candsLivres(imp, i); return lv.length && lv[0].nivel === 'exata' && !CE_ambiguo(lv); }).length;
    const totCP = res.valorConciliado + res.valorPendente, pct = totCP > 0 ? Math.round(res.valorConciliado / totCP * 100) : 0;
    const barra = `<div style="margin:2px 0 10px">
      <div style="display:flex;justify-content:space-between;font-size:.76rem;color:#64748b;margin-bottom:3px"><span>🟢 conciliado <b style="color:#15803d">${money(res.valorConciliado)}</b>${res.parciais ? ` <i>(${res.parciais} parcial${res.parciais > 1 ? 'is' : ''})</i>` : ''}</span><span>⏳ a resolver <b style="color:#dc2626">${money(res.valorPendente)}</b></span></div>
      <div style="height:7px;border-radius:20px;background:#f1f5f9;overflow:hidden"><div style="height:100%;width:${pct}%;background:#16a34a"></div></div></div>`;
    const mesesExtrato = new Set(imp.itens.map(i => (i.data || '').slice(0, 7)).filter(Boolean));
    const temFixas = fixasDoMes(imp.contaId, imp.mesConcil).length > 0 || allAbertos(imp.contaId).length > 0;
    const mostraConcil = concilN || temFixas;
    const f = imp.filtro || 'todos';
    const chip = (id, lbl, n) => `<button class="cx-chip ${f === id ? 'on' : ''}" onclick="CX_setFiltro('${id}')">${lbl}${n != null ? ` (${n})` : ''}</button>`;
    const vis = imp.itens.map((it, i) => ({ it, i })).filter(({ it }) => f === 'entradas' ? (it.incluir && it.valor >= 0) : f === 'saidas' ? (it.incluir && it.valor < 0) : f === 'pendencias' ? (it.incluir && !it.categoria && !it.conciliar) : f === 'duplicidades' ? !!it.dup : f === 'conciliados' ? (it.pares && it.pares.length) : f === 'ignorados' ? !!it.ignorado : f === 'excluidos' ? !it.incluir : true);
    const box = (n, l, cls) => `<div class="cx-box ${cls || ''}"><div class="n">${n}</div><div class="l">${l}</div></div>`;
    // banner "saldo final do extrato × saldo cadastrado" (igual ao NS)
    let saldoBloco = '';
    if (imp.saldoFinal != null) {
      const sAtual = contaSaldo(imp.contaId), bate = sAtual != null && Math.abs(imp.saldoFinal - sAtual) < 0.02;
      saldoBloco = `<div style="border-radius:10px;padding:9px 12px;margin:6px 0;font-size:.84rem;${bate ? 'background:#f0fdf4;border:1px solid #16a34a;color:#15803d' : 'background:#fffbeb;border:1px solid #f59e0b;color:#92400e'}">Saldo final no extrato: <b>${money(imp.saldoFinal)}</b> · Saldo cadastrado hoje: <b>${sAtual == null ? 'não informado' : money(sAtual)}</b>. ${bate ? '✓ conferem.' : (sAtual == null ? 'Informe o saldo da conta para conciliar.' : 'O saldo do extrato está diferente do saldo no sistema.')}</div>`;
    }
    cont.innerHTML = `<div class="cx-card">
      <h3 style="margin:0 0 2px">Revisar movimentações</h3>
      <p style="margin:0 0 10px;font-size:.84rem;color:#64748b"><b>${esc(info.inst)} · ${esc(info.nome)}</b> — confira e ajuste. Nada é lançado antes de você confirmar.</p>
      <div class="cx-resumo">${box(imp.itens.length, 'encontradas')}${box(money(totEnt), 'entradas', 'ok')}${box(money(totSai), 'saídas', 'rem')}${box(money(liquido), 'líquido', liquido >= 0 ? 'ok' : 'rem')}${box(res.conciliados, 'conciliadas', 'ok')}${res.parciais ? box(res.parciais, 'parciais') : ''}${box(res.semPar, 'sem correspondência', res.semPar ? 'rem' : '')}${res.ignorados ? box(res.ignorados, 'ignoradas') : ''}${box(dupN, 'duplicidades', dupN ? 'dup' : '')}</div>
      ${barra}
      ${saldoBloco}
      <div class="cx-chips">${chip('todos', 'Todos', imp.itens.length)}${nSug ? chip('sugestoes', '🟢 Sugestões', nSug) : ''}${nRevisar ? chip('revisar', '🟠 Revisar', nRevisar) : ''}${chip('sempar', 'Sem correspondência', res.semPar)}${chip('conciliados', 'Conciliadas', res.conciliados + res.parciais)}${chip('entradas', 'Entradas')}${chip('saidas', 'Saídas')}${chip('duplicidades', 'Duplicidades', dupN)}${res.ignorados ? chip('ignorados', 'Ignoradas', res.ignorados) : ''}${chip('excluidos', 'Excluídos', imp.itens.filter(i => !i.incluir).length)}</div>
      ${nExatas ? `<div style="margin:2px 0 8px"><button class="cx-btn" onclick="CX_conciliarLote()">⚡ Conciliar as ${nExatas} correspondência(s) exata(s)</button> <span style="font-size:.74rem;color:#64748b">— mostra o resumo antes; nada é gravado sem o Confirmar.</span></div>` : ''}
      ${mostraConcil ? renderLadoALado(imp) : `
      <div style="overflow-x:auto"><table class="cx-tab"><thead><tr><th>✓</th><th>Descrição</th><th>Data</th><th>Valor</th><th>Tipo</th><th>Categoria</th><th>Conf.</th></tr></thead><tbody>${vis.map(({ it, i }) => linha(it, i)).join('') || `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:14px">Nenhum item neste filtro.</td></tr>`}</tbody></table></div>`}
      ${rodapePendentes(imp)}
      <div class="cx-acoes"><button class="cx-btn" onclick="CX_cancelar()">Cancelar</button><button class="cx-btn prim" id="cxBtnConfirmar" onclick="CX_confirmar()">Confirmar ${incl.length} ${incl.length === 1 ? 'movimentação' : 'movimentações'}${concilOn ? ` · ${concilOn} concilia${concilOn === 1 ? '' : 'm'}` : ''}</button></div>
    </div>`;
  }

  function linha(it, i) {
    const dupB = it.dup ? ` <span class="cx-badge">${it.dup.tipo === 'existente' ? 'já importada' : 'duplicidade'}</span>` : '';
    let concilB = '';
    if (it.pares && it.pares.length) { const nomes = it.pares.map(p => esc(p.nome)).join(' + '); concilB = `<div style="margin-top:2px;font-size:.72rem;color:#15803d">🟢 ${it.pares.length > 1 ? 'rateio' : 'concilia'}: <b>${nomes}</b> · <a onclick="CX_desfazerPar('${it.id}')" style="color:#dc2626;cursor:pointer">desfazer</a></div>`; }
    else if (it.concilCand) { const mao = it.concilCand.viaRegra ? ' 🧠 aprendida' : ''; concilB = `<div style="margin-top:2px"><label style="font-size:.72rem;color:#15803d;cursor:pointer"><input type="checkbox" onchange="CX_toggleConciliar(${i})"> 🟢 Conciliar${mao} com <b>${esc(it.concilCand.nome)}</b></label></div>`; }
    const ent = it.valor >= 0;
    const tipoCell = it.conciliar ? `<span style="font-size:.72rem;color:#15803d">🟢 ${(it.pares || []).length > 1 ? 'rateio' : 'conciliação'}</span>` : `<select class="cx-sel" onchange="CX_setTipo(${i},this.value)">${optsTipo(it.tipoMov)}</select>`;
    const catCell = it.conciliar ? `<span style="font-size:.72rem;color:#94a3b8">dá baixa</span>` : `<select class="cx-sel" style="border-color:${it.valor >= 0 ? '#16a34a' : '#dc2626'}" onchange="CX_setCat(${i},this.value)">${optsCatCtx(it)}</select>`;
    return `<tr${it.conciliar ? ' style="background:#f0fdf4"' : (it.incluir ? '' : ' style="opacity:.5"')}>
      <td style="text-align:center"><input type="checkbox" ${it.incluir ? 'checked' : ''} onchange="CX_toggleIncluir(${i})"></td>
      <td>${esc(it.descricao)}${dupB}${concilB}</td><td>${dataBR(it.data)}</td>
      <td style="font-weight:700;color:${ent ? '#16a34a' : '#dc2626'}">${ent ? '+' : '−'}${money(Math.abs(it.valor))}</td>
      <td>${tipoCell}</td><td>${catCell}</td><td>${it.conciliar ? '<span style="font-size:.72rem;color:#15803d">concilia</span>' : confPill(it.confianca)}</td></tr>`;
  }

  function rodapePendentes(imp) {
    const idsCasados = new Set(); imp.itens.forEach(i => (i.pares || []).forEach(p => idsCasados.add(p.id)));
    const meses = new Set(imp.itens.map(i => (i.data || '').slice(0, 7)).filter(Boolean));
    let pend = []; try { pend = pendentesSemExtrato(imp.contaId, idsCasados, meses); } catch (e) { return ''; }
    if (!pend.length) return '';
    const linhas = pend.slice(0, 12).map(s => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #fde68a"><span style="font-size:.82rem">${s.tipo === 'receber' ? '💚' : '💸'} ${esc(s.nome)} <span style="color:#a16207;font-size:.74rem">vence ${dataBR(s.data)}</span></span><span style="font-weight:700;font-size:.82rem">${money(s.valor)}</span></div>`).join('');
    return `<div class="cx-rodape"><div style="font-weight:800;margin-bottom:5px">🟡 ${pend.length} conta(s) deste período ainda não apareceram no extrato</div>${linhas}</div>`;
  }

  // ── lado a lado (rateio + mês + filtros) ──
  function renderLadoALado(imp) {
    // TELA ÚNICA: os filtros do topo valem para a coluna do extrato (não existe mais "modo lista")
    const fTopo = imp.filtro || 'todos';
    const sit = it => CE_situacao(it.valor, soma(it));
    const passa = it => fTopo === 'entradas' ? it.valor >= 0 : fTopo === 'saidas' ? it.valor < 0
      : fTopo === 'sugestoes' ? (!!it.concilCand && !it.ambiguo && it.concilCand.nivel !== 'revisao' && !it.ignorado)
        : fTopo === 'revisar' ? ((it.ambiguo || (it.concilCand && it.concilCand.nivel === 'revisao') || sit(it) === 'parcial') && !it.ignorado)
          : fTopo === 'sempar' ? (!(it.pares || []).length && !it.concilCand && !it.ignorado)
            : fTopo === 'conciliados' ? ((it.pares || []).length > 0)
              : fTopo === 'ignorados' ? !!it.ignorado
                : fTopo === 'pendencias' ? (it.incluir && !it.categoria && !it.conciliar)
                  : fTopo === 'excluidos' ? !it.incluir : true;
    const itensTodos = (fTopo === 'duplicidades') ? imp.itens.filter(it => it.dup) : imp.itens.filter(it => !it.dup && passa(it));
    const foco = !!imp.foco && itensTodos.length > 0;
    if (foco) { const n = itensTodos.length; imp.focoIdx = ((imp.focoIdx || 0) % n + n) % n; }
    const itensE = foco ? [itensTodos[imp.focoIdx]] : itensTodos;
    const pareaveis = imp.itens.filter(it => !it.dup);   // pareamento olha todos, não só os filtrados
    const itemDe = fx => pareaveis.find(it => (it.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo));
    const pill = n => `<span style="display:inline-block;padding:0 6px;border-radius:20px;font-size:.66rem;font-weight:800;${n === 'exata' ? 'background:#dcfce7;color:#166534' : n === 'provavel' ? 'background:#fef9c3;color:#854d0e' : 'background:#f1f5f9;color:#475569'}">${n === 'exata' ? '🟢 exata' : n === 'provavel' ? '🟡 provável' : '🟠 revisar'}</span>`;
    const porque = c => { const t = (c.criterios || []).filter(x => x.ok).slice(0, 3).map(x => x.label); return t.length ? `<div style="font-size:.66rem;color:#94a3b8;margin-top:1px">${c.score}% · ${esc(t.join(' · '))}</div>` : ''; };
    const cardE = it => {
      const ent = it.valor >= 0, sel = selE === it.id, np = (it.pares || []).length, comp = completo(it);
      const livres = candsLivres(imp, it);
      const bg = it.ignorado ? '#f8fafc' : comp ? '#f0fdf4' : (np ? '#fffbeb' : (sel ? '#eff6ff' : '#fff')), bd = it.ignorado ? '#e5e7eb' : comp ? '#16a34a' : (np ? '#f59e0b' : (sel ? '#3b82f6' : '#e5e7eb'));
      let sub;
      if (it.ignorado) { sub = `<span style="color:#94a3b8">🚫 ignorada — ${esc(it.ignorado.motivo || '')} · <a onclick="event.stopPropagation();CX_restaurarMov('${it.id}')" style="color:#3b82f6;cursor:pointer">restaurar</a></span>`; }
      // mostra o VALOR que sai de cada conta — menor que a conta = baixa PARCIAL, e a tela diz isso
      else if (np) {
        const nomes = it.pares.map(p => { const vb = CE_valorBaixa(p), parc = vb < (p.valor || 0) - 0.005, key = p.tipo + '|' + p.id + '|' + (p.mes || ''); return `${esc(p.nome)} <a onclick="event.stopPropagation();CX_ajustarBaixa('${it.id}','${key}')" style="opacity:.75;cursor:pointer;text-decoration:underline dotted">(${money(vb)}${parc ? ' de ' + money(p.valor) : ''})</a>`; }).join(' + ');
        // "parcial" é o estado FINAL da conta, contando TODAS as movimentações — duas parciais que
        // somam o total quitam a conta, e aí o card não deve mais dizer que ficou parcial.
        const ft = falta(it), mao = (np === 1 && it.pares[0].viaRegra) ? ' 🧠' : '', temParc = it.pares.some(p => CE_aplicadoNo(imp.itens, p) < (p.valor || 0) - 0.005);
        sub = (comp ? `<span style="color:#15803d">${temParc ? '🟢◐' : '🟢'} ${nomes}${mao}${temParc ? ' <i style="opacity:.8">· baixa parcial — a conta segue aberta pelo resto</i>' : ''}</span>` : `<span style="color:#a16207">➗ ${nomes} · faltam ${money(ft)}</span>`) + ` · <a onclick="event.stopPropagation();CX_desfazerPar('${it.id}')" style="color:#dc2626;cursor:pointer">desfazer</a>`;
      }
      else if (livres.length >= 2 && CE_ambiguo(livres)) { const ops = livres.slice(0, 2).map(c => `<a onclick="event.stopPropagation();CX_aceitarSugestao('${it.id}','${esc(c.tipo + '|' + c.id + '|' + (c.mes || ''))}')" style="color:#3b82f6;cursor:pointer">${esc(c.nome)} (${money(c.valor)})</a>`).join(' &nbsp;ou&nbsp; '); sub = `<span style="color:#a16207">⚠️ dois candidatos parecidos:</span> ${ops}`; }
      else if (livres.length) { const c = livres[0], mao = c.viaRegra ? ' 🧠' : ''; sub = `${pill(c.nivel)} <span style="color:#94a3b8">${esc(c.nome)}${mao} <span style="opacity:.7">(${money(c.valor)})</span></span> · <a onclick="event.stopPropagation();CX_aceitarSugestao('${it.id}')" style="color:#15803d;cursor:pointer">conciliar</a>${porque(c)}`; }
      else sub = sel ? `<span style="color:#3b82f6">agora toque nas contas à direita →</span>` : `<span style="color:#94a3b8">sem correspondência</span>`;
      const idx = imp.itens.indexOf(it);
      const acoes = it.ignorado ? '' : `<div onclick="event.stopPropagation()" style="display:flex;gap:10px;margin-top:3px"><a onclick="CX_ignorarMov('${it.id}')" style="font-size:.67rem;color:#94a3b8;cursor:pointer">🚫 ignorar</a>${np ? '' : `<a onclick="CX_criarLancamento('${it.id}')" style="font-size:.67rem;color:#94a3b8;cursor:pointer">➕ criar conta</a>`}</div>`;
      const linhaNovo = (!np && !it.dup && !it.ignorado) ? `<div onclick="event.stopPropagation()" style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap">
          <select class="cx-sel" style="font-size:.7rem;padding:2px 6px;flex:1;min-width:110px;border-color:${ent ? '#16a34a' : '#dc2626'}" onchange="CX_setCat(${idx},this.value)">${optsCatCtx(it)}</select>
          <select class="cx-sel" style="font-size:.7rem;padding:2px 6px;min-width:92px" onchange="CX_setTipo(${idx},this.value)">${optsTipo(it.tipoMov)}</select>
          <label style="font-size:.68rem;color:#64748b;display:inline-flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" ${it.incluir ? 'checked' : ''} onchange="CX_toggleIncluir(${idx})">lançar</label>
        </div>` : '';
      return `<div onclick="CX_pickE('${it.id}')" style="cursor:pointer;background:${bg};border:1px solid ${bd};border-radius:9px;padding:5px 9px;margin-bottom:4px;${(it.incluir || np) ? '' : 'opacity:.55;'}"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:.82rem;font-weight:600">${esc(it.descricao)}</span><span style="font-size:.82rem;font-weight:700;color:${ent ? '#16a34a' : '#dc2626'};white-space:nowrap">${ent ? '+' : '−'}${money(Math.abs(it.valor))}</span></div><div style="font-size:.71rem;margin-top:1px">${dataBR(it.data)} · ${sub}</div>${linhaNovo}${acoes}</div>`;
    };
    const navFoco = foco ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><button class="cx-btn" style="padding:1px 10px" onclick="CX_focoNav(-1)">‹</button><span style="font-weight:700;font-size:.8rem;flex:1;text-align:center">movimentação ${imp.focoIdx + 1} de ${itensTodos.length}</span><button class="cx-btn" style="padding:1px 10px" onclick="CX_focoNav(1)">›</button></div>` : '';
    const colE = itensE.length ? navFoco + itensE.map(cardE).join('') : `<div style="color:#94a3b8;font-size:.84rem;padding:10px">Nada a revisar neste filtro.</div>`;
    // coluna direita: busca livre (qualquer mês) OU o mês navegável
    const busca = (imp.busca || '').trim();
    const mes = imp.mesConcil;
    let todas, buscando = false;
    if (busca) { buscando = true; let univ = []; try { univ = allAbertos(imp.contaId); } catch (e) {} todas = CE_buscar(univ, busca); }
    else todas = fixasDoMes(imp.contaId, mes);
    lancCache = todas;
    const idsAntes = idsConciliadasAntes();
    const keyOf = fx => fx.tipo + '|' + fx.id + '|' + (fx.mes || '');
    const pareada = fx => pareaveis.some(it => (it.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo));
    const estado = fx => { if (ignoradas.has(keyOf(fx))) return 'ignorada'; if (pareada(fx) || idsAntes.has(String(fx.id)) || fx.pago) return 'conciliada'; return 'aconciliar'; };
    const grupos = { aconciliar: [], conciliada: [], ignorada: [] }; todas.forEach(fx => grupos[estado(fx)].push(fx));
    const fl = imp.filtroConcil || 'aconciliar', selEsq = selE && imp.itens.find(x => x.id === selE);
    const cardD = fx => {
      const key = keyOf(fx), sel = selD === key, e = estado(fx), dono = itemDe(fx), clic = (e === 'aconciliar');
      const _apl = CE_aplicadoNo(pareaveis, fx), _resta = (Number(fx.valor) || 0) - _apl;
      const bg = e === 'conciliada' ? (_resta > 0.02 ? '#fffbeb' : '#f0fdf4') : (sel ? '#eff6ff' : '#fff'), bd = e === 'conciliada' ? (_resta > 0.02 ? '#f59e0b' : '#16a34a') : (clic && selEsq ? '#3b82f6' : '#e5e7eb');
      let sub;
      const aplicado = CE_aplicadoNo(pareaveis, fx), resta = (Number(fx.valor) || 0) - aplicado;
      if (e === 'conciliada') {
        if (dono) { const donos = pareaveis.filter(x => (x.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo)); const qtd = donos.length > 1 ? `${donos.length} movimentações` : esc((dono.descricao || '').slice(0, 16));
          sub = resta > 0.02 ? `<span style="color:#a16207">◐ ${money(aplicado)} de ${money(fx.valor)} · faltam ${money(resta)}</span> · <a onclick="event.stopPropagation();CX_removerPar('${dono.id}','${key}')" style="color:#dc2626;cursor:pointer">tirar</a>`
            : `<span style="color:#15803d">✓ ${qtd}</span> · <a onclick="event.stopPropagation();CX_removerPar('${dono.id}','${key}')" style="color:#dc2626;cursor:pointer">tirar</a>`; }
        else if (idsAntes.has(String(fx.id))) sub = `<span style="color:#15803d">✓ conciliada antes</span>`; else sub = `<span style="color:#94a3b8">já paga</span>`;
      }
      else if (e === 'ignorada') sub = `<span style="color:#94a3b8">ignorada · <a onclick="event.stopPropagation();CX_restaurarFixa('${key}')" style="color:#3b82f6;cursor:pointer">restaurar</a></span>`;
      else sub = `<span style="color:#94a3b8">vence ${dataBR(fx.data)}${buscando && fx.mes ? ' · ' + esc(CX_mesLabel(fx.mes)) : ''}</span> · <a onclick="event.stopPropagation();CX_ignorarFixa('${key}')" style="color:#94a3b8;cursor:pointer">ignorar</a>`;
      return `<div ${clic ? `onclick="CX_pickD('${key}')" ` : ''}style="${clic ? 'cursor:pointer;' : ''}${e === 'ignorada' ? 'opacity:.6;' : ''}background:${bg};border:1px solid ${bd};border-radius:9px;padding:5px 9px;margin-bottom:4px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:.82rem;font-weight:600">${fx.tipo === 'receber' ? '💚' : '💸'} ${esc(fx.nome)}</span><span style="font-size:.82rem;font-weight:700;white-space:nowrap">${money(fx.valor)}</span></div><div style="font-size:.71rem;margin-top:1px">${sub}</div></div>`;
    };
    const vazio = buscando ? 'Nenhum lançamento encontrado para essa busca.' : { aconciliar: 'Nada a conciliar neste mês.', conciliada: 'Nada conciliado neste mês.', ignorada: 'Nenhuma conta ignorada.' }[fl];
    const colD = grupos[fl].length ? grupos[fl].map(cardD).join('') : `<div style="color:#94a3b8;font-size:.84rem;padding:10px">${vazio}</div>`;
    const chip = (id, lbl, n) => `<button class="cx-chip ${fl === id ? 'on' : ''}" style="padding:2px 9px;font-size:.74rem" onclick="CX_setFiltroConcil('${id}')">${lbl} (${n})</button>`;
    const campoBusca = `<div style="display:flex;gap:6px;margin-bottom:6px"><input id="cxBuscaInput" class="cx-sel" style="flex:1;font-size:.78rem;padding:4px 9px" placeholder="🔎 buscar lançamento (nome, valor, 08/2026)…" value="${esc(busca)}" onchange="CX_setBusca(this.value)" onkeydown="if(event.key==='Enter'){CX_setBusca(this.value)}">${busca ? `<button class="cx-btn" style="padding:1px 10px" onclick="CX_limparBusca()">✕</button>` : ''}</div>`;
    const nav = buscando ? '' : `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><button class="cx-btn" style="padding:1px 10px" onclick="CX_setMesConcil(-1)">‹</button><span style="font-weight:700;font-size:.82rem;flex:1;text-align:center">${esc(CX_mesLabel(mes))}</span><button class="cx-btn" style="padding:1px 10px" onclick="CX_setMesConcil(1)">›</button></div>`;
    const filtros = `<div class="cx-chips" style="margin-bottom:6px">${chip('aconciliar', 'A conciliar', grupos.aconciliar.length)}${chip('conciliada', 'Conciliadas', grupos.conciliada.length)}${grupos.ignorada.length ? chip('ignorada', 'Ignoradas', grupos.ignorada.length) : ''}</div>`;
    const nR = pareaveis.filter(it => (it.pares || []).length > 1).length;
    const tituloD = buscando ? '🔎 Resultado da busca' : '📋 Contas do mês';
    const dica = selEsq ? `Selecionado <b>${esc(selEsq.descricao)}</b> (${money(Math.abs(selEsq.valor))}). Toque em cada conta que ele quita — pode ser mais de uma.${soma(selEsq) ? ` Faltam ${money(falta(selEsq))}.` : ''}` : `Toque num item do extrato e depois em cada conta que ele paga. Um débito pode quitar <b>várias contas</b>, e uma conta pode ser paga por <b>várias movimentações</b>. Use a busca 🔎 pra achar lançamento de qualquer mês.`;
    return `<style>@media(max-width:640px){.cx-grid{grid-template-columns:1fr !important}}</style>
      <div class="cx-dica">👆 ${dica}${nR ? ` <span style="color:#15803d">· ${nR} rateio(s)</span>` : ''}</div>
      <div class="cx-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div><div style="display:flex;align-items:center;justify-content:space-between;gap:8px"><div class="cx-col-h">📄 Extrato do banco</div>${itensTodos.length > 1 ? `<a onclick="CX_setFoco(${foco ? 'false' : 'true'})" style="font-size:.7rem;color:#3b82f6;cursor:pointer">${foco ? '☰ ver lista' : '🎯 uma por vez'}</a>` : ''}</div>${colE}</div>
        <div><div class="cx-col-h">${tituloD}</div>${campoBusca}${nav}${filtros}${colD}</div></div>`;
  }

  // ── handlers (window.CX_*) ──
  window.CX_setFiltro = f => { IMP.filtro = f; renderRevisao(); };
  window.CX_setVista = v => { IMP.vista = v; selE = null; selD = null; renderRevisao(); };
  window.CX_toggleIncluir = i => { IMP.itens[i].incluir = !IMP.itens[i].incluir; renderRevisao(); };
  // dropdown CONTEXTUAL: entrada → categorias de receita; saída → de despesa. Sempre com "➕ adicionar nova".
  function optsCatCtx(it) {
    const ent = it.valor >= 0, sel = it.categoria || '';
    const lista = ent ? CX_catsReceita() : CX_catsDespesa();
    return `<option value="">— ${ent ? 'receita' : 'despesa'} —</option>`
      + lista.map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')
      + `<option value="__nova__">➕ adicionar nova…</option>`;
  }
  window.CX_setCat = async (i, v) => {
    const it = IMP.itens[i];
    if (v === '__nova__') {
      const ent = it.valor >= 0;
      const nome = (prompt('Nome da nova categoria de ' + (ent ? 'receita' : 'despesa') + ':') || '').trim();
      if (!nome) return renderRevisao();
      try { it.categoria = await CX_criarCategoria(nome, ent); aviso(`Categoria "${nome}" criada 💚`, '#16a34a'); }
      catch (e) { aviso('Não consegui criar a categoria agora.', '#ef4444'); }
      return renderRevisao();
    }
    it.categoria = v || null; it.confianca = v ? 'alta' : 'revisar'; renderRevisao();
  };
  window.CX_setTipo = (i, v) => { IMP.itens[i].tipoMov = v; };
  window.CX_toggleConciliar = i => { const it = IMP.itens[i]; if (!it.concilCand) return; if (it.pares && it.pares.length) it.pares = []; else { it.pares = [novoPar(it.concilCand, Math.abs(it.valor), CE_aplicadoNo(IMP.itens, it.concilCand))]; it.incluir = true; } sync(it); renderRevisao(); };
  window.CX_aceitarSugestao = (id, key) => {
    const it = IMP.itens.find(x => x.id === id); if (!it) return;
    const livres = candsLivres(IMP, it);
    const cand = key ? livres.find(c => (c.tipo + '|' + c.id + '|' + (c.mes || '')) === key) : livres[0];
    if (cand) { it.pares = [novoPar(cand, Math.abs(it.valor), CE_aplicadoNo(IMP.itens, cand))]; it.incluir = true; it.ignorado = null; sync(it); aviso('Conciliado 💚', '#16a34a'); }
    selE = null; selD = null; renderRevisao();
  };
  // ── ignorar movimentação COM MOTIVO ──
  window.CX_ignorarMov = id => {
    const it = IMP.itens.find(x => x.id === id); if (!it) return;
    const motivo = (prompt('Por que ignorar "' + (it.descricao || '') + '"?\n(ex.: tarifa do banco, transferência interna, já lancei na mão)') || '').trim();
    if (!motivo) return;
    it.ignorado = { motivo, em: new Date().toISOString().slice(0, 10) }; it.pares = []; it.incluir = false; sync(it);
    selE = null; aviso('Ignorada — o motivo fica registrado.', '#6b7280'); renderRevisao();
  };
  window.CX_restaurarMov = id => { const it = IMP.itens.find(x => x.id === id); if (it) { it.ignorado = null; it.incluir = true; } renderRevisao(); };
  // ── criar conta a pagar/receber A PARTIR do extrato ──
  window.CX_criarLancamento = async id => {
    const it = IMP.itens.find(x => x.id === id); if (!it) return;
    const ent = it.valor >= 0, abs = Math.abs(it.valor);
    if (ent) return aviso('Conta a receber é criada pelo módulo Receber — aqui dá pra conciliar com uma já existente.', '#f59e0b');
    const nome = (prompt('Nova conta a PAGAR — nome:', it.descricao || '') || '').trim(); if (!nome) return;
    const vStr = (prompt('Valor:', String(abs.toFixed(2)).replace('.', ',')) || '').trim();
    const valor = Math.abs(parseFloat(vStr.replace(/\./g, '').replace(',', '.')));
    if (!valor || isNaN(valor)) return aviso('Valor inválido.', '#ef4444');
    const venc = (prompt('Vencimento (AAAA-MM-DD):', it.data || '') || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(venc)) return aviso('Data inválida — use AAAA-MM-DD.', '#ef4444');
    try {
      const mesWEN = CX_mesWEN(venc.slice(0, 7)), dia = parseInt(venc.slice(8, 10), 10);
      const novoId = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (!P_meses[mesWEN]) P_meses[mesWEN] = [];
      P_meses[mesWEN].push({ id: novoId, nome, valor, dia, categoria: it.categoria || '', contaBancariaId: IMP.contaId, valorPago: 0, status: 'PENDENTE' });
      P_salvarStorage();
      try { if (typeof AUD_log === 'function') AUD_log('criar', 'meses', nome, 'Criada pelo extrato', null, valor); } catch (e) {}
      const fx = { tipo: 'pagar', id: novoId, mes: venc.slice(0, 7), nome, valor, data: venc, conta: IMP.contaId };
      it.pares = [novoPar(fx, abs, 0)]; it.incluir = true; it.ignorado = null; sync(it);
      aviso('Conta criada e conciliada 💚', '#16a34a');
    } catch (e) { aviso('Não consegui criar: ' + (e.message || e), '#ef4444'); }
    selE = null; renderRevisao();
  };
  // ── conciliar EM LOTE as correspondências exatas, com resumo antes ──
  window.CX_conciliarLote = () => {
    const imp = IMP; if (!imp) return;
    const alvo = imp.itens.map(it => ({ it, c: candsLivres(imp, it)[0] })).filter(({ it, c }) => !it.dup && !it.ignorado && !(it.pares || []).length && c && c.nivel === 'exata' && !CE_ambiguo(candsLivres(imp, it))).map(({ it, c }) => { it._lote = c; return it; });
    if (!alvo.length) return aviso('Nenhuma correspondência exata pendente.', '#6b7280');
    const linhas = alvo.slice(0, 15).map(it => '• ' + (it.descricao || '').slice(0, 30) + ' → ' + it._lote.nome + ' (' + money(it._lote.valor) + ')').join('\n');
    if (!confirm('Conciliar ' + alvo.length + ' correspondência(s) exata(s)?\n\n' + linhas + (alvo.length > 15 ? '\n…e mais ' + (alvo.length - 15) + '.' : '') + '\n\nNada é gravado agora — só depois do Confirmar.')) return;
    alvo.forEach(it => { it.pares = [novoPar(it._lote, Math.abs(it.valor), CE_aplicadoNo(imp.itens, it._lote))]; it.incluir = true; delete it._lote; sync(it); });
    aviso(alvo.length + ' conciliada(s) 💚', '#16a34a'); renderRevisao();
  };
  // ── ajustar à mão quanto esta movimentação tira desta conta (baixa parcial manual) ──
  window.CX_ajustarBaixa = (id, key) => {
    const it = IMP.itens.find(x => x.id === id); if (!it) return;
    const p = (it.pares || []).find(x => (x.tipo + '|' + x.id + '|' + (x.mes || '')) === key); if (!p) return;
    const atual = CE_valorBaixa(p);
    const vStr = (prompt('Quanto desta movimentação vai para "' + p.nome + '"?\nConta: ' + money(p.valor) + ' · movimentação: ' + money(Math.abs(it.valor)), String(atual.toFixed(2)).replace('.', ',')) || '').trim();
    if (!vStr) return;
    const v = parseFloat(vStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(v) || v <= 0) return aviso('Valor inválido.', '#ef4444');
    const outrosNoItem = soma(it) - atual, outrasMovs = CE_aplicadoNo(IMP.itens, p) - atual;
    if (v - (Math.abs(it.valor) - outrosNoItem) > 0.02) return aviso('Passa do valor da movimentação. Sobram ' + money(Math.abs(it.valor) - outrosNoItem) + '.', '#ef4444');
    if (v - (p.valor - outrasMovs) > 0.02) return aviso('Passa do que falta na conta. Sobram ' + money(p.valor - outrasMovs) + '.', '#ef4444');
    p.valorBaixa = Math.round(v * 100) / 100; sync(it); renderRevisao();
  };
  window.CX_setBusca = v => { if (!IMP) return; IMP.busca = v || ''; if (IMP.busca) IMP.filtroConcil = 'aconciliar'; renderRevisao(); const e = el('cxBuscaInput'); if (e) { e.focus(); e.setSelectionRange(e.value.length, e.value.length); } };
  window.CX_limparBusca = () => { if (!IMP) return; IMP.busca = ''; renderRevisao(); };
  window.CX_setFoco = on => { if (!IMP) return; IMP.foco = !!on; IMP.focoIdx = 0; renderRevisao(); };
  window.CX_focoNav = d => { if (!IMP) return; IMP.focoIdx = (IMP.focoIdx || 0) + d; renderRevisao(); };
  window.CX_pickE = id => { selE = (selE === id) ? null : id; selD = null; renderRevisao(); };
  window.CX_pickD = key => { selD = key; tentarPar(); };
  function tentarPar() {
    const it = IMP.itens.find(x => x.id === selE), fx = lancCache.find(f => (f.tipo + '|' + f.id + '|' + (f.mes || '')) === selD);
    if (it && fx) {
      const ent = it.valor >= 0, dirOk = (ent && fx.tipo === 'receber') || (!ent && fx.tipo === 'pagar'), jaTem = (it.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo);
      if (jaTem) { it.pares = it.pares.filter(p => !(p.id === fx.id && p.tipo === fx.tipo)); sync(it); aviso('Tirado do rateio', '#6b7280'); }
      else if (fx.pago) aviso('Essa conta já está paga.', '#ef4444');
      else if (!dirOk) aviso(ent ? 'Entrada só concilia com conta a receber.' : 'Saída só concilia com conta a pagar.', '#ef4444');
      else {
        // quanto sobra na MOVIMENTAÇÃO e quanto sobra na CONTA (somando o que outras movs já aplicaram nela)
        const restanteMov = Math.abs(it.valor) - soma(it), jaAplicado = CE_aplicadoNo(IMP.itens, fx), par = novoPar(fx, restanteMov, jaAplicado);
        if (restanteMov < 0.02) aviso('Esta movimentação já está toda distribuída (' + money(Math.abs(it.valor)) + ').', '#ef4444');
        else if (par.valorBaixa < 0.02) aviso('"' + (fx.nome || '') + '" já está totalmente coberta por outras movimentações.', '#ef4444');
        else {
          it.pares = (it.pares || []).concat([par]); it.incluir = true; it.ignorado = null; sync(it);
          const ft = falta(it), parc = par.valorBaixa < par.valor - 0.005;
          if (parc) aviso('Baixa PARCIAL: ' + money(par.valorBaixa) + ' de ' + money(par.valor) + ' — "' + fx.nome + '" continua aberta pelo resto.', '#f59e0b');
          else aviso(Math.abs(ft) < 0.02 ? 'Conciliação fechada 💚' : ('Somando… faltam ' + money(ft)), '#16a34a');
        }
      }
    }
    selD = null; if (it && completo(it)) selE = null; renderRevisao();
  }
  window.CX_desfazerPar = id => { const it = IMP.itens.find(x => x.id === id); if (it) { it.pares = []; sync(it); } selE = null; selD = null; renderRevisao(); };
  window.CX_removerPar = (id, key) => { const it = IMP.itens.find(x => x.id === id); if (it) { it.pares = (it.pares || []).filter(p => (p.tipo + '|' + p.id + '|' + (p.mes || '')) !== key); sync(it); } renderRevisao(); };
  window.CX_setMesConcil = d => { const [a, m] = IMP.mesConcil.split('-').map(Number); const dt = new Date(a, m - 1 + d, 1); IMP.mesConcil = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0'); selD = null; renderRevisao(); };
  window.CX_setFiltroConcil = f => { IMP.filtroConcil = f; renderRevisao(); };
  window.CX_ignorarFixa = key => { ignoradas.add(key); selD = null; renderRevisao(); };
  window.CX_restaurarFixa = key => { ignoradas.delete(key); renderRevisao(); };
  window.CX_cancelar = () => { if (!IMP || confirm('Cancelar esta importação? Nada foi gravado.')) { IMP = null; const c = el('cxResultado'); if (c) c.innerHTML = ''; fechar(); } };

  // ── confirmar: cria movimentos + baixa (reusa CONC_conciliar) + aprende ──
  window.CX_confirmar = async function () {
    if (confirmando) return; const imp = IMP; if (!imp) return;
    const incl = imp.itens.filter(i => i.incluir && !i.ignorado);
    const concilIncl = imp.itens.filter(i => !i.ignorado && i.pares && i.pares.length);
    if (!incl.length && !concilIncl.length) return aviso('Nenhuma movimentação selecionada.', '#ef4444');
    // a soma não fecha o valor do extrato → não bloqueia mais; pergunta o que fazer com a diferença
    const incompletos = concilIncl.filter(i => CE_situacao(i.valor, soma(i)) !== 'exato');
    if (incompletos.length) {
      const lista = incompletos.slice(0, 6).map(i => '• ' + (i.descricao || '').slice(0, 28) + ': ' + money(soma(i)) + ' de ' + money(Math.abs(i.valor)) + ' (diferença ' + money(falta(i)) + ')').join('\n');
      if (!confirm('Em ' + incompletos.length + ' movimentação(ões) a soma das contas não fecha o valor do extrato:\n\n' + lista + '\n\nContinuar assim?\n\n• A baixa vai pelo valor que você distribuiu (parcial: a conta continua aberta pelo resto).\n• A diferença vira uma movimentação avulsa na conta, para o saldo continuar batendo.')) return;
    }
    const rawIncl = incl.filter(i => !(i.pares && i.pares.length));
    confirmando = true; const btn = el('cxBtnConfirmar'); if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
    try {
      let concilOk = 0, itensConcil = 0, valorConcil = 0;
      // parcial é por CONTA e no FINAL: duas baixas parciais que somam o total quitam a conta e não
      // devem contar como parcial. Guardo o último acumulado de cada conta e confiro no fim.
      const estadoConta = new Map();
      // itens crus → 1 movimento cada
      for (const it of rawIncl) CX_criarMov(imp.contaId, it.fitid, '', it.valor, it.data, it.descricao, it.categoria || '');
      // itens conciliados → 1 mov por conta (rateio) + baixa via CONC_conciliar, agora pelo valorBaixa
      for (const it of concilIncl) {
        const sinal = it.valor >= 0 ? 1 : -1;
        let baixouAlgo = false;
        for (const fx of it.pares) {
          const vb = CE_valorBaixa(fx);
          if (vb < 0.005) continue;
          const mov = CX_criarMov(imp.contaId, it.fitid, fx.id, sinal * vb, it.data, it.descricao, '');
          const ok = await CX_conciliarFixa(mov, fx, vb);
          // "parcial" é o RESULTADO (a conta ficou aberta), não a fatia: duas parciais que somam o total
          // quitam a conta e não devem ser contadas como parciais. Igual ao Nossa Semente.
          if (ok) { concilOk++; baixouAlgo = true; valorConcil += vb; try { const lk = CONC_LINKS['conc_' + mov.id] || {}; const antes = Number(lk.valorPagoAntes != null ? lk.valorPagoAntes : lk.valorReservaAntes) || 0; estadoConta.set(fx.tipo + '|' + fx.id + '|' + (fx.mes || ''), { total: Number(fx.valor) || 0, acc: antes + (Number(lk.valorBaixa) || vb) }); } catch (e) {} }
        }
        if (baixouAlgo) itensConcil++;
        // diferença entre o extrato e o que foi distribuído → movimentação avulsa, pro saldo bater
        const sobra = Math.round((Math.abs(it.valor) - soma(it)) * 100) / 100;
        if (baixouAlgo && sobra > 0.02) { try { CX_criarMov(imp.contaId, it.fitid, 'dif', sinal * sobra, it.data, it.descricao + ' (diferença da conciliação)', it.categoria || ''); } catch (e) {} }
        if (it.pares.length === 1) { try { await CX_regraAprender(it.descricao, it.pares[0].nome, it.pares[0].tipo); } catch (e) {} }
      }
      try { if (typeof BC_render === 'function') BC_render(); } catch (e) {}
      // histórico da importação
      const nParciais = [...estadoConta.values()].filter(v => v.acc < v.total - 0.005).length;
      const nIgn = imp.itens.filter(i => i.ignorado).length;
      try {
        const hid = 'imp_' + imp.contaId + '_' + Date.now();
        const reg = { id: hid, contaId: imp.contaId, origem: imp.origem || 'ofx', data: new Date().toISOString().slice(0, 10), periodoDe: (el('cxDe') || {}).value || null, periodoAte: (el('cxAte') || {}).value || null, qtdLidas: imp.itens.length, qtdLancadas: rawIncl.length, qtdConciliacoes: itensConcil, qtdBaixas: concilOk, qtdParciais: nParciais, qtdIgnoradas: nIgn, qtdDuplicidades: imp.itens.filter(i => i.dup).length, valorEntradas: incl.filter(i => i.valor >= 0).reduce((a, i) => a + i.valor, 0), valorSaidas: incl.filter(i => i.valor < 0).reduce((a, i) => a + Math.abs(i.valor), 0), valorConciliado: Math.round(valorConcil * 100) / 100, ignoradas: imp.itens.filter(i => i.ignorado).slice(0, 30).map(i => ({ descricao: i.descricao, valor: i.valor, data: i.data, motivo: i.ignorado.motivo })) };
        if (typeof CC_fbSalvar === 'function') await CC_fbSalvar('importacoes_extrato', hid, reg);
      } catch (e) {}
      // resumo final da sessão
      const ln = (emoji, lbl, val, cor) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #e5e7eb"><span style="font-size:.85rem">${emoji} ${lbl}</span><b style="font-size:.85rem;${cor ? 'color:' + cor : ''}">${val}</b></div>`;
      const c = el('cxResultado');
      if (c) c.innerHTML = `<div class="cx-card">
        <div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:10px;padding:12px;color:#15803d"><div style="font-weight:800;font-size:1rem">✅ Extrato importado</div><div style="font-size:.84rem;opacity:.9">${esc(contaInfo(imp.contaId).inst)} · ${esc(contaInfo(imp.contaId).nome)}</div></div>
        <div style="margin-top:12px">
          ${ln('📄', 'Movimentações lidas', imp.itens.length)}
          ${ln('🟢', 'Conciliadas com contas já cadastradas', itensConcil + (concilOk !== itensConcil ? ` <span style="font-weight:400;opacity:.75">(${concilOk} baixas — houve rateio)</span>` : ''), '#15803d')}
          ${nParciais ? ln('◐', 'Baixas parciais (a conta segue aberta pelo resto)', nParciais, '#a16207') : ''}
          ${ln('➕', 'Lançadas como movimentação nova', rawIncl.length)}
          ${nIgn ? ln('🚫', 'Ignoradas por você', nIgn, '#94a3b8') : ''}
          ${ln('💚', 'Total conciliado', money(Math.round(valorConcil * 100) / 100), '#15803d')}
        </div>
        <button class="cx-btn prim" style="margin-top:12px" onclick="CX_fechar()">Fechar</button></div>`;
      IMP = null; aviso('Extrato importado 💚', '#16a34a');
    } catch (e) { aviso('Erro: ' + e.message, '#ef4444'); if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; } }
    finally { confirmando = false; }
  };

  // ── abrir / fechar / OFX ──
  window.CX_fechar = fechar;
  function fechar() { const m = el('cxModalBg'); if (m) m.style.display = 'none'; }
  window.CX_mudarConta = () => { const c = el('cxContaInfo'); if (c) { const s = contaSaldo(el('cxConta').value); c.textContent = 'saldo atual: ' + (s == null ? 'não informado' : money(s)); } };
  // ── Leitura por IA: PDF, foto da galeria e foto da câmera (espelha o NS, que aceita as 4 formas).
  // Reusa o que o WEN JÁ tem: IA_gerarConteudo (provedor configurado em Config → IA) e IMP_fileB64.
  // O resultado sai no mesmo formato do OFX ({fitid,data,valor,descricao,tipo}) e cai no mesmo montar().
  const PROMPT_EXTRATO = 'Você é a SophIA lendo um documento financeiro brasileiro que pode ter VÁRIAS páginas/imagens — leia TODAS as páginas. '
    + 'É um EXTRATO BANCÁRIO. valor: número NEGATIVO para saídas/débitos; POSITIVO para entradas/créditos.\n'
    + 'Extraia TODAS as transações, linha por linha, SEM PULAR NENHUMA e SEM INVENTAR. NÃO inclua linhas de total, subtotal, saldo anterior, limite ou cabeçalhos.\n'
    + 'Para cada transação devolva: data ("YYYY-MM-DD"), descricao (como aparece), valor (número).\n'
    + 'Responda SOMENTE JSON, sem texto fora do JSON: {"itens":[{"data":"","descricao":"","valor":0}]}';

  async function lerPorIA(files, origem) {
    if (!files || !files.length) return;
    if (typeof IA_temChave !== 'function' || !IA_temChave()) {
      return aviso('📸 Configure a chave da IA' + (typeof IA_provNome === 'function' ? ' (' + IA_provNome() + ')' : '') + ' em Config → Inteligência Artificial pra usar PDF ou foto.', '#f59e0b');
    }
    aviso('⏳ A SophIA está lendo ' + files.length + ' ' + (files.length === 1 ? 'arquivo' : 'páginas') + '…', '#0ea5e9');
    try {
      const imagens = [];
      for (const f of files) imagens.push({ mime: f.type || 'image/jpeg', b64: await IMP_fileB64(f) });
      const txt = await IA_gerarConteudo(PROMPT_EXTRATO, imagens, { json: true });
      let dados = null; try { dados = JSON.parse(txt); } catch (e) {}
      let arr = (dados && Array.isArray(dados.itens)) ? dados.itens : (Array.isArray(dados) ? dados : (typeof IMP_extrairJSON === 'function' ? IMP_extrairJSON(txt) : []));
      const brutos = (Array.isArray(arr) ? arr : []).map((x, i) => {
        const v = Number(x.valor) || 0;
        return { fitid: 'ia_' + origem + '_' + i + '_' + (x.data || '') + '_' + Math.round(v * 100), data: x.data || '', valor: v, descricao: x.descricao || 'Item', tipo: v < 0 ? 'saida' : 'entrada' };
      }).filter(b => b.data && b.valor);
      if (!brutos.length) return aviso('Não consegui extrair transações — tente uma imagem mais nítida, ou o PDF/OFX.', '#f59e0b');
      aviso('✅ ' + brutos.length + ' movimentação(ões) lida(s) pela SophIA. Revise antes de confirmar.', '#16a34a');
      montar(brutos, null, origem);   // sem saldo final: só o OFX traz LEDGERBAL
    } catch (e) { aviso('⚠️ Erro na leitura: ' + (e.message || e), '#ef4444'); }
  }
  window.CX_arquivoPdf = ev => { const fs = [...(ev.target.files || [])]; ev.target.value = ''; lerPorIA(fs, 'pdf'); };
  window.CX_arquivoFoto = ev => { const fs = [...(ev.target.files || [])]; ev.target.value = ''; lerPorIA(fs, 'foto'); };
  window.CX_ofxArquivo = ev => {
    const f = ev.target.files[0]; if (!f) return; ev.target.value = '';
    const r = new FileReader();
    r.onload = e => { try { const txt = e.target.result; const brutos = (typeof IMP_parseOFX === 'function') ? IMP_parseOFX(txt) : []; if (!brutos.length) return aviso('Nenhuma movimentação no arquivo.', '#f59e0b'); montar(brutos, parseSaldoOFX(txt), 'ofx'); } catch (err) { aviso('Erro ao ler OFX: ' + err.message, '#ef4444'); } };
    r.readAsText(f);
  };
  async function abrir() {
    try { if (typeof CX_carregarRegras === 'function') await CX_carregarRegras(); } catch (e) {}
    try { if (typeof CX_carregarCatsR === 'function') await CX_carregarCatsR(); } catch (e) {}   // lista de categorias de RECEITA
    const ativas = contasAtivas();
    if (!ativas.length) return aviso('Cadastre uma conta bancária primeiro.', '#ef4444');
    const sel = el('cxConta'); if (sel) sel.innerHTML = ativas.map(id => `<option value="${id}">${esc(contaInfo(id).inst + ' · ' + contaInfo(id).nome)}</option>`).join('');
    ['cxResultado'].forEach(id => { const e = el(id); if (e) e.innerHTML = ''; });
    const de = el('cxDe'), ate = el('cxAte'); if (de) de.value = ''; if (ate) ate.value = '';
    IMP = null; window.CX_mudarConta();
    const m = el('cxModalBg'); if (m) m.style.display = 'flex';
  }
  window.CX_abrir = abrir;

})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CE_score, CE_nivel, CE_ranquear, CE_ambiguo, CE_buscar, CE_valorBaixa, CE_situacao, CE_aplicadoNo, CE_resumo, CE_norm, CX_mesNS, CX_mesWEN, CX_vencISO, CX_mesShift, CX_mesLabel, CX_fixasDoMes, CX_candidatos, CX_norm, CX_similar, CX_regraId, CX_regraSugerir, CX_criarMov, CX_conciliarFixa };
}

// verificação do selador automático
