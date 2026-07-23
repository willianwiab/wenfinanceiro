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
async function CX_conciliarFixa(mov, fixa) {
  if (typeof CONC_conciliar !== 'function' || !mov) return false;
  const mesWEN = CX_mesWEN(fixa.mes) || (fixa.mes || '');
  try { await CONC_conciliar(mov.id, fixa.tipo + '|' + fixa.id + '|' + mesWEN); return true; } catch (e) { return false; }
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

  // ── rateio helpers ──
  const soma = it => ((it && it.pares) || []).reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const falta = it => Math.round((Math.abs(it.valor) - soma(it)) * 100) / 100;
  const completo = it => !!(it && it.pares && it.pares.length) && Math.abs(falta(it)) < 0.02;
  const sync = it => { if (it) it.conciliar = !!(it.pares && it.pares.length); };
  const diffDias = (a, b) => { try { return Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000); } catch (e) { return 999; } };

  // ids já conciliadas antes (a partir do CONC_LINKS/banco_conciliados do WEN)
  function idsConciliadasAntes() { const s = new Set(); try { Object.values(CONC_LINKS || {}).forEach(c => { if (c && c.status === 'match' && c.id) s.add(String(c.id)); }); } catch (e) {} return s; }

  // sugestão de conciliação: PRIMEIRO regra aprendida (por descrição, casa por nome+valor ignorando data), senão valor+data
  function concilCand(item, contaId) {
    try {
      const reg = CX_regraSugerir(item.descricao || '');
      if (reg) {
        const alvo = CX_norm(reg.nome), abs = Math.abs(item.valor);
        const cands = allAbertos(contaId).filter(fx => fx.tipo === reg.tipo && CX_norm(fx.nome) === alvo && Math.abs((Number(fx.valor) || 0) - abs) < 0.02);
        if (cands.length) { cands.sort((a, b) => diffDias(a.data, item.data) - diffDias(b.data, item.data)); return Object.assign({}, cands[0], { viaRegra: true, conf: reg.conf }); }
      }
    } catch (e) {}
    return CX_candidatos(item, contaId);
  }
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
      const cc = !dup ? concilCand({ valor: b.valor, data: b.data, descricao: b.descricao }, contaId) : null;
      return { id: 'cx' + idx, fitid: b.fitid, chave, data: b.data, valor: b.valor, descricao: b.descricao, categoria: (b.valor < 0 ? (CX_categoria(b.descricao) || null) : null), confianca: 'revisar', tipoMov, dup, concilCand: cc, pares: cc ? [cc] : [], conciliar: !!cc, incluir: !dup };
    });
    const datas = itens.map(i => i.data).filter(Boolean).sort();
    if (datas.length) { const de = el('cxDe'), ate = el('cxAte'); if (de && !de.value) de.value = datas[0]; if (ate && !ate.value) ate.value = datas[datas.length - 1]; }
    const mesExtrato = (datas.length ? datas[0] : new Date().toISOString().slice(0, 10)).slice(0, 7);
    IMP = { contaId, origem, itens, saldoFinal: (saldos && saldos.saldoFinal != null) ? saldos.saldoFinal : null, filtro: 'todos', vista: itens.some(i => i.concilCand) ? 'ladoalado' : 'lista', mesConcil: mesExtrato, filtroConcil: 'aconciliar' };
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
    const pend = incl.filter(i => !i.categoria && !i.conciliar).length;
    const dupN = imp.itens.filter(i => i.dup).length;
    const concilN = imp.itens.filter(i => i.concilCand || (i.pares && i.pares.length)).length;
    const concilOn = incl.filter(i => i.conciliar).length;
    const mesesExtrato = new Set(imp.itens.map(i => (i.data || '').slice(0, 7)).filter(Boolean));
    const temFixas = fixasDoMes(imp.contaId, imp.mesConcil).length > 0 || allAbertos(imp.contaId).length > 0;
    const mostraConcil = concilN || temFixas;
    const f = imp.filtro || 'todos';
    const chip = (id, lbl, n) => `<button class="cx-chip ${f === id ? 'on' : ''}" onclick="CX_setFiltro('${id}')">${lbl}${n != null ? ` (${n})` : ''}</button>`;
    const vis = imp.itens.map((it, i) => ({ it, i })).filter(({ it }) => f === 'entradas' ? (it.incluir && it.valor >= 0) : f === 'saidas' ? (it.incluir && it.valor < 0) : f === 'pendencias' ? (it.incluir && !it.categoria && !it.conciliar) : f === 'duplicidades' ? !!it.dup : f === 'conciliacoes' ? (!!it.concilCand || (it.pares && it.pares.length)) : f === 'excluidos' ? !it.incluir : true);
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
      <div class="cx-resumo">${box(imp.itens.length, 'encontradas')}${box(money(totEnt), 'entradas', 'ok')}${box(money(totSai), 'saídas', 'rem')}${box(money(liquido), 'líquido', liquido >= 0 ? 'ok' : 'rem')}${box(pend, 'com pendência', pend ? 'rem' : '')}${box(dupN, 'duplicidades', dupN ? 'dup' : '')}${concilN ? box(concilOn + '/' + concilN, 'conciliações', 'ok') : ''}</div>
      ${saldoBloco}
      <div class="cx-chips">${chip('todos', 'Todos', imp.itens.length)}${chip('entradas', 'Entradas')}${chip('saidas', 'Saídas')}${chip('pendencias', 'Pendências', pend)}${concilN ? chip('conciliacoes', '🟢 Conciliações', concilN) : ''}${chip('duplicidades', 'Duplicidades', dupN)}${chip('excluidos', 'Excluídos', imp.itens.filter(i => !i.incluir).length)}</div>
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
    const passa = it => fTopo === 'entradas' ? it.valor >= 0 : fTopo === 'saidas' ? it.valor < 0
      : fTopo === 'pendencias' ? (it.incluir && !it.categoria && !it.conciliar)
        : fTopo === 'conciliacoes' ? (!!it.concilCand || (it.pares && it.pares.length))
          : fTopo === 'excluidos' ? !it.incluir : true;
    const itensE = (fTopo === 'duplicidades') ? imp.itens.filter(it => it.dup) : imp.itens.filter(it => !it.dup && passa(it));
    const pareaveis = imp.itens.filter(it => !it.dup);   // pareamento olha todos, não só os filtrados
    const itemDe = fx => pareaveis.find(it => (it.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo));
    const cardE = it => {
      const ent = it.valor >= 0, sel = selE === it.id, np = (it.pares || []).length, comp = completo(it);
      const bg = comp ? '#f0fdf4' : (np ? '#fffbeb' : (sel ? '#eff6ff' : '#fff')), bd = comp ? '#16a34a' : (np ? '#f59e0b' : (sel ? '#3b82f6' : '#e5e7eb'));
      let sub;
      // mostra o VALOR de cada conta ao lado do nome — dá pra conferir se a soma bate com o extrato
      if (np) { const nomes = it.pares.map(p => `${esc(p.nome)} <span style="opacity:.7">(${money(p.valor)})</span>`).join(' + '), ft = falta(it), mao = (np === 1 && it.pares[0].viaRegra) ? ' 🧠' : ''; sub = (comp ? `<span style="color:#15803d">🟢 ${nomes}${mao}</span>` : `<span style="color:#a16207">➗ ${nomes} · faltam ${money(ft)}</span>`) + ` · <a onclick="event.stopPropagation();CX_desfazerPar('${it.id}')" style="color:#dc2626;cursor:pointer">desfazer</a>`; }
      else if (it.concilCand) { const mao = it.concilCand.viaRegra ? ' 🧠 aprendida' : ''; sub = `<span style="color:#94a3b8">sugestão${mao}: ${esc(it.concilCand.nome)} <span style="opacity:.7">(${money(it.concilCand.valor)})</span></span> · <a onclick="event.stopPropagation();CX_aceitarSugestao('${it.id}')" style="color:#15803d;cursor:pointer">conciliar</a>`; }
      else sub = sel ? `<span style="color:#3b82f6">agora toque nas contas à direita →</span>` : `<span style="color:#94a3b8">sem par → vira lançamento novo</span>`;
      // TELA ÚNICA: item sem par vira lançamento novo → categoria/tipo/lançar direto no card
      const idx = imp.itens.indexOf(it);
      const linhaNovo = (!np && !it.dup) ? `<div onclick="event.stopPropagation()" style="display:flex;gap:5px;margin-top:4px;flex-wrap:wrap">
          <select class="cx-sel" style="font-size:.7rem;padding:2px 6px;flex:1;min-width:110px;border-color:${ent ? '#16a34a' : '#dc2626'}" onchange="CX_setCat(${idx},this.value)">${optsCatCtx(it)}</select>
          <select class="cx-sel" style="font-size:.7rem;padding:2px 6px;min-width:92px" onchange="CX_setTipo(${idx},this.value)">${optsTipo(it.tipoMov)}</select>
          <label style="font-size:.68rem;color:#64748b;display:inline-flex;align-items:center;gap:3px;cursor:pointer"><input type="checkbox" ${it.incluir ? 'checked' : ''} onchange="CX_toggleIncluir(${idx})">lançar</label>
        </div>` : '';
      return `<div onclick="CX_pickE('${it.id}')" style="cursor:pointer;background:${bg};border:1px solid ${bd};border-radius:9px;padding:5px 9px;margin-bottom:4px;${it.incluir ? '' : 'opacity:.55;'}"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:.82rem;font-weight:600">${esc(it.descricao)}</span><span style="font-size:.82rem;font-weight:700;color:${ent ? '#16a34a' : '#dc2626'};white-space:nowrap">${ent ? '+' : '−'}${money(Math.abs(it.valor))}</span></div><div style="font-size:.71rem;margin-top:1px">${dataBR(it.data)} · ${sub}</div>${linhaNovo}</div>`;
    };
    const colE = itensE.length ? itensE.map(cardE).join('') : `<div style="color:#94a3b8;font-size:.84rem;padding:10px">Nada a revisar.</div>`;
    const mes = imp.mesConcil, todas = fixasDoMes(imp.contaId, mes); lancCache = todas;
    const idsAntes = idsConciliadasAntes();
    const keyOf = fx => fx.tipo + '|' + fx.id + '|' + (fx.mes || '');
    const pareada = fx => pareaveis.some(it => (it.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo));
    const estado = fx => { if (ignoradas.has(keyOf(fx))) return 'ignorada'; if (pareada(fx) || idsAntes.has(String(fx.id)) || fx.pago) return 'conciliada'; return 'aconciliar'; };
    const grupos = { aconciliar: [], conciliada: [], ignorada: [] }; todas.forEach(fx => grupos[estado(fx)].push(fx));
    const fl = imp.filtroConcil || 'aconciliar', selEsq = selE && imp.itens.find(x => x.id === selE);
    const cardD = fx => {
      const key = keyOf(fx), sel = selD === key, e = estado(fx), dono = itemDe(fx), clic = (e === 'aconciliar');
      const bg = e === 'conciliada' ? '#f0fdf4' : (sel ? '#eff6ff' : '#fff'), bd = e === 'conciliada' ? '#16a34a' : (clic && selEsq ? '#3b82f6' : '#e5e7eb');
      let sub;
      if (e === 'conciliada') { if (dono) sub = `<span style="color:#15803d">✓ no rateio de ${esc((dono.descricao || '').slice(0, 16))}</span> · <a onclick="event.stopPropagation();CX_removerPar('${dono.id}','${key}')" style="color:#dc2626;cursor:pointer">tirar</a>`; else if (idsAntes.has(String(fx.id))) sub = `<span style="color:#15803d">✓ conciliada antes</span>`; else sub = `<span style="color:#94a3b8">já paga</span>`; }
      else if (e === 'ignorada') sub = `<span style="color:#94a3b8">ignorada · <a onclick="event.stopPropagation();CX_restaurarFixa('${key}')" style="color:#3b82f6;cursor:pointer">restaurar</a></span>`;
      else sub = `<span style="color:#94a3b8">vence ${dataBR(fx.data)}</span> · <a onclick="event.stopPropagation();CX_ignorarFixa('${key}')" style="color:#94a3b8;cursor:pointer">ignorar</a>`;
      return `<div ${clic ? `onclick="CX_pickD('${key}')" ` : ''}style="${clic ? 'cursor:pointer;' : ''}${e === 'ignorada' ? 'opacity:.6;' : ''}background:${bg};border:1px solid ${bd};border-radius:9px;padding:5px 9px;margin-bottom:4px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:.82rem;font-weight:600">${fx.tipo === 'receber' ? '💚' : '💸'} ${esc(fx.nome)}</span><span style="font-size:.82rem;font-weight:700;white-space:nowrap">${money(fx.valor)}</span></div><div style="font-size:.71rem;margin-top:1px">${sub}</div></div>`;
    };
    const vazio = { aconciliar: 'Nada a conciliar neste mês.', conciliada: 'Nada conciliado neste mês.', ignorada: 'Nenhuma conta ignorada.' }[fl];
    const colD = grupos[fl].length ? grupos[fl].map(cardD).join('') : `<div style="color:#94a3b8;font-size:.84rem;padding:10px">${vazio}</div>`;
    const chip = (id, lbl, n) => `<button class="cx-chip ${fl === id ? 'on' : ''}" style="padding:2px 9px;font-size:.74rem" onclick="CX_setFiltroConcil('${id}')">${lbl} (${n})</button>`;
    const nav = `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><button class="cx-btn" style="padding:1px 10px" onclick="CX_setMesConcil(-1)">‹</button><span style="font-weight:700;font-size:.82rem;flex:1;text-align:center">${esc(CX_mesLabel(mes))}</span><button class="cx-btn" style="padding:1px 10px" onclick="CX_setMesConcil(1)">›</button></div>`;
    const filtros = `<div class="cx-chips" style="margin-bottom:6px">${chip('aconciliar', 'A conciliar', grupos.aconciliar.length)}${chip('conciliada', 'Conciliadas', grupos.conciliada.length)}${grupos.ignorada.length ? chip('ignorada', 'Ignoradas', grupos.ignorada.length) : ''}</div>`;
    const nR = pareaveis.filter(it => (it.pares || []).length > 1).length;
    const dica = selEsq ? `Selecionado <b>${esc(selEsq.descricao)}</b> (${money(Math.abs(selEsq.valor))}). Toque em cada conta que ele quita — pode ser mais de uma.${soma(selEsq) ? ` Faltam ${money(falta(selEsq))}.` : ''}` : `Toque num item do extrato e depois em cada conta que ele paga. Um débito pode quitar <b>várias contas</b> (rateio). Use ‹ › pra achar contas de outros meses.`;
    return `<style>@media(max-width:640px){.cx-grid{grid-template-columns:1fr !important}}</style>
      <div class="cx-dica">👆 ${dica}${nR ? ` <span style="color:#15803d">· ${nR} rateio(s)</span>` : ''}</div>
      <div class="cx-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
        <div><div class="cx-col-h">📄 Extrato do banco</div>${colE}</div>
        <div><div class="cx-col-h">📋 Contas do mês</div>${nav}${filtros}${colD}</div></div>`;
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
  window.CX_toggleConciliar = i => { const it = IMP.itens[i]; if (!it.concilCand) return; if (it.pares && it.pares.length) it.pares = []; else { it.pares = [it.concilCand]; it.incluir = true; } sync(it); renderRevisao(); };
  window.CX_aceitarSugestao = id => { const it = IMP.itens.find(x => x.id === id); if (it && it.concilCand) { it.pares = [it.concilCand]; it.incluir = true; sync(it); aviso('Conciliado 💚', '#16a34a'); } selE = null; selD = null; renderRevisao(); };
  window.CX_pickE = id => { selE = (selE === id) ? null : id; selD = null; renderRevisao(); };
  window.CX_pickD = key => { selD = key; tentarPar(); };
  function tentarPar() {
    const it = IMP.itens.find(x => x.id === selE), fx = lancCache.find(f => (f.tipo + '|' + f.id + '|' + (f.mes || '')) === selD);
    if (it && fx) {
      const ent = it.valor >= 0, dirOk = (ent && fx.tipo === 'receber') || (!ent && fx.tipo === 'pagar'), jaTem = (it.pares || []).some(p => p.id === fx.id && p.tipo === fx.tipo);
      if (jaTem) { it.pares = it.pares.filter(p => !(p.id === fx.id && p.tipo === fx.tipo)); sync(it); aviso('Tirado do rateio', '#6b7280'); }
      else if (fx.pago) aviso('Essa conta já está paga.', '#ef4444');
      else if (!dirOk) aviso(ent ? 'Entrada só concilia com conta a receber.' : 'Saída só concilia com conta a pagar.', '#ef4444');
      else if (soma(it) + (Number(fx.valor) || 0) - Math.abs(it.valor) > 0.02) aviso('Passa do valor do extrato (' + money(Math.abs(it.valor)) + ').', '#ef4444');
      else { IMP.itens.forEach(o => { if (o !== it && o.pares) { const a = o.pares.length; o.pares = o.pares.filter(p => !(p.id === fx.id && p.tipo === fx.tipo)); if (o.pares.length !== a) sync(o); } }); it.pares = (it.pares || []).concat([{ tipo: fx.tipo, id: fx.id, mes: fx.mes || '', nome: fx.nome, valor: Number(fx.valor) || 0, conta: fx.conta }]); it.incluir = true; sync(it); const ft = falta(it); aviso(Math.abs(ft) < 0.02 ? 'Rateio fechado 💚' : ('Somando… faltam ' + money(ft)), '#16a34a'); }
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
    const incl = imp.itens.filter(i => i.incluir);
    if (!incl.length) return aviso('Nenhuma movimentação selecionada.', '#ef4444');
    const concilIncl = incl.filter(i => i.pares && i.pares.length);
    const incompletos = concilIncl.filter(i => !completo(i));
    if (incompletos.length) return aviso('Rateio incompleto em: ' + incompletos.map(i => i.descricao).join(', ') + '.', '#ef4444');
    const rawIncl = incl.filter(i => !(i.pares && i.pares.length));
    confirmando = true; const btn = el('cxBtnConfirmar'); if (btn) { btn.disabled = true; btn.textContent = 'Importando…'; }
    try {
      let concilOk = 0;
      // itens crus → 1 movimento cada
      for (const it of rawIncl) CX_criarMov(imp.contaId, it.fitid, '', it.valor, it.data, it.descricao, it.categoria || '');
      // itens conciliados → 1 mov por fixa (rateio) + baixa via CONC_conciliar
      for (const it of concilIncl) {
        for (const fx of it.pares) {
          const sinal = it.valor >= 0 ? 1 : -1;
          const mov = CX_criarMov(imp.contaId, it.fitid, fx.id, sinal * (Number(fx.valor) || 0), it.data, it.descricao, '');
          const ok = await CX_conciliarFixa(mov, fx);
          if (ok) concilOk++;
        }
        if (it.pares.length === 1) { try { await CX_regraAprender(it.descricao, it.pares[0].nome, it.pares[0].tipo); } catch (e) {} }
      }
      try { if (typeof BC_render === 'function') BC_render(); } catch (e) {}
      const c = el('cxResultado'); if (c) c.innerHTML = `<div class="cx-card"><div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:10px;padding:12px;color:#15803d">✅ Importado — ${rawIncl.length} movimentação(ões) + ${concilOk} baixa(s) por conciliação (sem duplicar).</div><button class="cx-btn prim" style="margin-top:12px" onclick="CX_fechar()">Fechar</button></div>`;
      IMP = null; aviso('Extrato importado 💚', '#16a34a');
    } catch (e) { aviso('Erro: ' + e.message, '#ef4444'); if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; } }
    finally { confirmando = false; }
  };

  // ── abrir / fechar / OFX ──
  window.CX_fechar = fechar;
  function fechar() { const m = el('cxModalBg'); if (m) m.style.display = 'none'; }
  window.CX_mudarConta = () => { const c = el('cxContaInfo'); if (c) { const s = contaSaldo(el('cxConta').value); c.textContent = 'saldo atual: ' + (s == null ? 'não informado' : money(s)); } };
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
  module.exports = { CX_mesNS, CX_mesWEN, CX_vencISO, CX_mesShift, CX_mesLabel, CX_fixasDoMes, CX_candidatos, CX_norm, CX_similar, CX_regraId, CX_regraSugerir, CX_criarMov, CX_conciliarFixa };
}
