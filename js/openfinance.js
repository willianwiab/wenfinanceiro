// ═══════════════════════════════════════════════════════════════════════════════════════════
// OPEN FINANCE no WEN (Pluggy / MeuPluggy) — Fase 1: cartões de crédito (22/10/2026)
// Espelho do Nossa Semente (TF_pluggy*/C_pluggyOFX): a fatura FECHADA do banco entra pelo MESMO
// caminho do arquivo OFX (IMP_parseOFX → revisão → C_importarDaPrevia → fatura imutável). Nada é
// lançado sem a revisão. O motor (nossasemente-motor /api/pluggy-wen) só LÊ — confere o login do WEN.
//
// Regras do WEN:
//  • Cartão PESSOAL do Will (Nubank/Inter crédito): a fatura NÃO vira conta do studio. As compras
//    marcadas "🙋 Pessoal do Will" ficam fora do rateio; o resto é despesa do studio e vira UMA conta
//    a pagar "🔁 Reembolsar Will" (o studio devolve ao Will).
//  • A categoria "Pessoal" que já existe no WEN é de equipe/folha — por isso a nova é outra
//    (`fora_pessoal`), para não misturar.
//  • Vínculo cartão ↔ banco e a marca de "pessoal" moram em open_finance/config (um documento
//    próprio): a gravação REST do WEN substitui o documento inteiro, e mexer no cadastro do cartão
//    arriscaria apagar campos dele.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const OF_URL = 'https://nossasemente-motor.vercel.app/api/pluggy-wen';
const OF_CAT_PESSOAL = 'fora_pessoal';
const OF_CAT_DADOS = { label: 'Pessoal do Will (fora do WEN)', icon: '🙋', color: '#a855f7', bg: '#f3e8ff' };
let OF_cfg = { cartoes: {}, pessoais: {}, contas: {}, passagem: [] }, OF_cfgCarregado = false, OF_contas = null, OF_ocupado = false;

function OF_ehCatPessoal(cat) { return cat === OF_CAT_PESSOAL; }
function OF_ehPessoal(cartaoId) { return !!(OF_cfg.pessoais || {})[cartaoId]; }
function OF_contaDoCartao(cartaoId) { return (OF_cfg.cartoes || {})[cartaoId] || ''; }
// A categoria vive no CATS_P do WEN, que é recarregado da nuvem: garante em memória sempre que o módulo roda.
function OF_garantirCategoria() {
  if (typeof CATS_P === 'undefined') return;
  if (!CATS_P[OF_CAT_PESSOAL]) CATS_P[OF_CAT_PESSOAL] = { ...OF_CAT_DADOS };
}
async function OF_chamar(corpo) {
  const t = (typeof AUTH_ !== 'undefined' && AUTH_.token) ? await AUTH_.token() : null;
  if (!t) throw new Error('Entre no WEN de novo para falar com o banco.');
  const r = await fetch(OF_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.ok) throw new Error(d.erro || ('Falha ' + r.status));
  return d;
}
async function OF_carregarCfg() {
  try {
    const res = await fetch(`${FS_URL}/open_finance/config?key=${FB_API_KEY}`);
    if (res.ok) { const j = await res.json(); const f = j.fields || {}; const o = {}; Object.keys(f).forEach(k => o[k] = fromFV(f[k])); OF_cfg = { cartoes: o.cartoes || {}, pessoais: o.pessoais || {}, contas: o.contas || {}, passagem: o.passagem || [], regrasCat: o.regrasCat || {} }; }
  } catch (e) { /* sem rede: segue sem vínculos */ }
  OF_cfgCarregado = true;
  return OF_cfg;
}
async function OF_salvarCfg() { await BC_fbUpsert('open_finance', 'config', { cartoes: OF_cfg.cartoes || {}, pessoais: OF_cfg.pessoais || {}, contas: OF_cfg.contas || {}, passagem: OF_cfg.passagem || [], regrasCat: OF_cfg.regrasCat || {} }); }
// Chamado pelo C_ativar: carrega os vínculos e redesenha os cartões.
async function OF_iniciar() {
  OF_garantirCategoria();
  if (!OF_cfgCarregado) {
    await OF_carregarCfg();
    // compras em aberto já confirmadas entram na prévia sem precisar tocar em "Atualizar cartão"
    for (const cid of Object.keys(OF_cfg.cartoes || {})) { try { await OF_carregarAberta(cid); C_sincronizarFaturasPrevias(cid); } catch (e) {} }
    try { C_renderTudo(); } catch (e) { try { C_renderCartoes(); } catch (e2) {} }
  }
}

// ── Faixa no cartão (Meus cartões) ──
function OF_htmlCartao(c) {
  const acc = OF_contaDoCartao(c.id);
  const banco = acc ? ((OF_contas || []).find(a => a.id === acc) || null) : null;
  const pess = OF_ehPessoal(c.id) ? '<span class="cc-parc" style="background:rgba(255,255,255,.22)">🙋 pessoal → reembolso</span>' : '';
  const lig = acc
    ? `<button onclick="event.stopPropagation();OF_irImportar('${C_jsAttr(c.id)}')" title="Trazer a fatura do banco" style="background:rgba(255,255,255,.22);border:0;border-radius:8px;color:inherit;padding:3px 8px;cursor:pointer">🏦 ${banco ? C_esc((banco.nome || '') + (banco.numero ? ' ••' + String(banco.numero).slice(-4) : '')) : 'ligado ao banco'}</button>`
    : `<button onclick="event.stopPropagation();OF_ligar('${C_jsAttr(c.id)}')" style="background:rgba(255,255,255,.22);border:0;border-radius:8px;color:inherit;padding:3px 8px;cursor:pointer">🔗 Ligar ao banco</button>`;
  return `<div class="cc-bottom" style="gap:6px;flex-wrap:wrap">${lig}${pess}</div>`;
}

// ── Ligar cartão do WEN ↔ cartão do banco ──
function OF_modal(html, largura) {
  let m = document.getElementById('ofModal');
  if (!m) { m = document.createElement('div'); m.id = 'ofModal'; m.className = 'modal-bg'; m.onclick = e => { if (e.target === m) OF_fechar(); }; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal" style="max-width:${largura || 480}px;width:100%;max-height:90vh;overflow:auto;border-radius:20px">${html}</div>`;
  m.classList.add('open'); m.style.display = 'flex';
}
window.OF_fechar = function () { const m = document.getElementById('ofModal'); if (m) { m.classList.remove('open'); m.style.display = 'none'; } };
window.OF_ligar = async function (cartaoId) {
  const c = C_card(cartaoId); if (!c || !c.nome) return;
  OF_modal(`<h2 style="margin:0 0 6px">🔗 Ligar ${C_esc(c.nome)} ao banco</h2><div id="ofCorpo" class="card-sub">🔄 Buscando os cartões no banco…</div>`);
  try { OF_contas = (await OF_chamar({ acao: 'contas' })).contas || []; }
  catch (e) { document.getElementById('ofCorpo').innerHTML = `<div style="color:#ef4444">⚠️ Não consegui falar com o banco (${C_esc(e.message)}).</div><div style="text-align:right;margin-top:12px"><button class="btn btn-outline" onclick="OF_fechar()">Fechar</button></div>`; return; }
  const usados = new Set(Object.entries(OF_cfg.cartoes || {}).filter(([cid]) => cid !== cartaoId).map(([, a]) => a));
  const credito = OF_contas.filter(a => a.tipo === 'CREDIT');
  const opts = credito.map(a => `<option value="${C_esc(a.id)}" ${usados.has(a.id) ? 'disabled' : ''}>${C_esc(a.nome)}${a.numero ? ' ••' + C_esc(String(a.numero).slice(-4)) : ''}${a.titular ? ' · ' + C_esc(a.titular) : ''}${usados.has(a.id) ? ' (já ligado)' : ''}</option>`).join('');
  document.getElementById('ofCorpo').innerHTML = credito.length ? `
    <div class="form-group"><label>Qual cartão do banco é este? (confira o final)</label><select id="ofConta"><option value="">— escolha —</option>${opts}</select></div>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-top:8px;font-size:.88rem"><input type="checkbox" id="ofPessoal" ${OF_ehPessoal(cartaoId) || /nubank|inter/i.test(c.nome) ? 'checked' : ''}/> <span><b>Cartão pessoal do Will.</b> A fatura não vira conta do studio: o que for do studio vira <b>🔁 Reembolsar Will</b>; o resto você marca <b>🙋 Pessoal do Will</b> e fica fora do rateio.</span></label>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-outline" onclick="OF_fechar()">Cancelar</button><button class="btn btn-primary" onclick="OF_ligarConfirmar('${C_jsAttr(cartaoId)}')">Ligar</button></div>`
    : '<div>Nenhum cartão de crédito apareceu nas conexões do banco liberadas para o WEN.</div><div style="text-align:right;margin-top:12px"><button class="btn btn-outline" onclick="OF_fechar()">Fechar</button></div>';
};
window.OF_ligarConfirmar = async function (cartaoId) {
  const acc = (document.getElementById('ofConta') || {}).value; if (!acc) { toast('Escolha qual cartão do banco é este.', '#ef4444'); return; }
  const pess = !!(document.getElementById('ofPessoal') || {}).checked;
  OF_cfg.cartoes = { ...(OF_cfg.cartoes || {}), [cartaoId]: acc };
  OF_cfg.pessoais = { ...(OF_cfg.pessoais || {}) }; if (pess) OF_cfg.pessoais[cartaoId] = true; else delete OF_cfg.pessoais[cartaoId];
  try {
    await OF_salvarCfg();
    if (pess && typeof CAT_fbSalvar === 'function') { OF_garantirCategoria(); await CAT_fbSalvar(OF_CAT_PESSOAL, CATS_P[OF_CAT_PESSOAL]); }
    OF_fechar(); toast('🔗 Cartão ligado ao banco'); C_renderCartoes();
  } catch (e) { toast('Não consegui salvar o vínculo: ' + (e.message || e), '#ef4444'); }
};

// ── Fatura fechada do banco → revisão (o mesmo caminho do OFX) ──
function OF_ofx(transacoes, total) {
  const esc = s => String(s == null ? '' : s).replace(/[<>&]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  const linhas = (transacoes || []).map(t => {
    const dt = String(t.data || '').replace(/\D/g, '').slice(0, 8);
    const desc = esc(t.descricao) || 'Compra';
    const memo = (t.parcela && !/\d{1,2}\s*\/\s*\d{1,2}/.test(desc)) ? `${desc} parcela ${t.parcela.atual}/${t.parcela.total}` : desc;
    const tipo = t.pagamento ? 'PAYMENT' : (t.tipo === 'CREDIT' ? 'CREDIT' : 'DEBIT');
    return `<STMTTRN><TRNTYPE>${tipo}<DTPOSTED>${dt}<TRNAMT>${(Number(t.valor) || 0).toFixed(2)}<FITID>PLG${esc(t.fitid)}<NAME>${desc}<MEMO>${esc(memo)}</STMTTRN>`;
  }).join('\n');
  const bal = (total != null && isFinite(Number(total))) ? `<LEDGERBAL><BALAMT>${Number(total).toFixed(2)}<DTASOF>19000101</LEDGERBAL>` : '';
  return `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\n<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL<BANKTRANLIST>\n${linhas}\n</BANKTRANLIST>${bal}</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
}
window.OF_irImportar = function (cartaoId) {
  const sel = document.getElementById('cImpCartao'); if (sel) sel.value = cartaoId;
  const btn = [...document.querySelectorAll('#page-cartoes .sub-nav button')].find(b => /importar|trazer/i.test(b.getAttribute('onclick') || '') || /fatura/i.test(b.textContent || ''));
  C_aba('Importar', btn || null);
  const m = document.getElementById('cImpMes'); if (m && !m.value) m.value = BC_hoje().slice(0, 7);
  toast('Escolha o mês e toque em 🏦 Trazer do banco');
};
window.OF_trazerFatura = async function () {
  if (OF_ocupado) return;
  const cid = (document.getElementById('cImpCartao') || {}).value, anoMes = (document.getElementById('cImpMes') || {}).value;
  if (!cid || !C_card(cid).nome) { toast('Escolha o cartão.', '#ef4444'); return; }
  if (!anoMes) { toast('Escolha o mês da fatura (vencimento).', '#ef4444'); return; }
  const acc = OF_contaDoCartao(cid); if (!acc) { OF_ligar(cid); return; }
  OF_ocupado = true;
  IMP_iniciarInline('cartao', () => cid, 'cImpAviso2', 'cImportResultado', null);
  IMP_destinoC = true;   // confirmar → C_importarDaPrevia (fatura imutável)
  IMP_setAviso('🔄 Buscando a fatura no banco…');
  try {
    const r = await OF_chamar({ acao: 'fatura', accountId: acc, anoMes });
    if (!r.transacoes || !r.transacoes.length) { IMP_setAviso('O banco não trouxe lançamentos para essa fatura.'); return; }
    const txt = OF_ofx(r.transacoes, r.fatura && r.fatura.total);
    let previa = IMP_normalizarCartaoOFX(IMP_parseOFX(txt));
    const bal = IMP_ofxTotalDeclarado(txt); IMP_totalLido = (bal == null) ? null : Math.abs(bal);
    IMP_previa = previa;
    IMP_setAviso(`🧾 Fatura de ${C_dataBR(r.fatura.vencimento)} fechada no banco · ${previa.length} lançamento(s) (total ${fmt(r.fatura.total)}).`
      + (OF_ehPessoal(cid) ? ' <b>Cartão pessoal:</b> marque <b>🙋 Pessoal do Will</b> no que não é do studio — o resto vira <b>🔁 Reembolsar Will</b>.' : ' Revise e importe.'));
    IMP_renderPreview();
  } catch (e) { IMP_setAviso('⚠️ ' + (e.message || e)); }
  finally { OF_ocupado = false; }
};

// ── Cartão pessoal: a fatura vira "Reembolsar Will" (só o que é do studio) ──
function OF_valorStudio(fatura) {
  return Math.round((fatura.itens || []).filter(it => !OF_ehCatPessoal(it.categoria)).reduce((a, it) => a + (Number(it.valor) || 0), 0) * 100) / 100;
}
// Chamado pelo C_lancarFaturaEmPagar quando o cartão é pessoal. Mantém o pagamento já feito (o reembolso
// pode já ter sido devolvido) e nunca inventa movimento bancário.
function OF_lancarReembolso(fatura, cartao) {
  const wk = C_ymToWen(fatura.mesFatura); if (!wk) return;
  if (!P_meses[wk]) P_meses[wk] = [];
  const contas = P_meses[wk];
  const anterior = contas.find(c => c.faturaId === fatura.id && !c.previa) || null;
  const pagoAntes = anterior ? (Number(anterior.valorPago) || 0) : 0;
  const valor = Math.max(0, OF_valorStudio(fatura));
  const semEsta = contas.filter(c => c.faturaId !== fatura.id);
  if (valor < 0.005 && pagoAntes < 0.005) { P_meses[wk] = semEsta; P_salvarStorage(); return; }   // nada do studio
  const nova = { id: 'reemb_' + fatura.id, faturaId: fatura.id, reembolsoWill: true, imutavel: true,
    faturaCartao: { cartaoId: fatura.cartaoId, mes: wk, reembolso: true },   // fora do rateio: as compras do studio já entram pelos itens da fatura
    nome: '🔁 Reembolsar Will · ' + cartao.nome + ' · ' + wk, categoria: 'cartoes', dia: cartao.diaVencimento || null, mes: wk,
    valor: Math.max(valor, pagoAntes), valorPago: pagoAntes,
    status: pagoAntes >= Math.max(valor, pagoAntes) - 0.005 && pagoAntes > 0 ? 'PAGO' : 'PENDENTE',
    fixa: false, competencia: wk, obs: 'Compras do studio no cartão pessoal do Will (' + cartao.nome + '). O studio devolve ao Will.' };
  if (anterior && anterior.dataPagamento) nova.dataPagamento = anterior.dataPagamento;
  if (anterior && anterior.contaBancariaId) nova.contaBancariaId = anterior.contaBancariaId;
  semEsta.push(nova); P_meses[wk] = semEsta; P_salvarStorage();
}

// ═══ Fase 2: EXTRATO da conta do studio (Caixa) ═══
// Conta do WEN ↔ conta do banco em open_finance/config.contas. Os movimentos entram pela revisão do concil.js
// (CX_montarDoBanco): saídas podem casar com Contas a Pagar; ENTRADAS viram só movimento da conta (Receber intocado).
function OF_contaBancoDe(contaId) { return (OF_cfg.contas || {})[contaId] || ''; }
function OF_isoMenosDias(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
window.OF_ligarConta = async function (contaId, depois) {
  const c = (typeof BC_CONTAS !== 'undefined' ? BC_CONTAS : {})[contaId] || {};
  OF_modal(`<h2 style="margin:0 0 6px">🔗 Ligar ${C_esc((c.banco || '') + ' · ' + (c.nome || 'conta'))} ao banco</h2><div id="ofCorpo" class="card-sub">🔄 Buscando as contas no banco…</div>`);
  try { OF_contas = (await OF_chamar({ acao: 'contas' })).contas || []; }
  catch (e) { document.getElementById('ofCorpo').innerHTML = `<div style="color:#ef4444">⚠️ Não consegui falar com o banco (${C_esc(e.message)}).</div><div style="text-align:right;margin-top:12px"><button class="btn btn-outline" onclick="OF_fechar()">Fechar</button></div>`; return; }
  const usados = new Set(Object.entries(OF_cfg.contas || {}).filter(([id]) => id !== contaId).map(([, a]) => a));
  const banc = OF_contas.filter(a => a.tipo === 'BANK');
  const opts = banc.map(a => `<option value="${C_esc(a.id)}" ${usados.has(a.id) ? 'disabled' : ''}>${C_esc(a.nome)}${a.numero ? ' · ' + C_esc(a.numero) : ''}${a.titular ? ' · ' + C_esc(a.titular) : ''}${usados.has(a.id) ? ' (já ligada)' : ''}</option>`).join('');
  document.getElementById('ofCorpo').innerHTML = banc.length ? `
    <div class="form-group"><label>Qual conta do banco é esta? (confira o número)</label><select id="ofContaBanco"><option value="">— escolha —</option>${opts}</select></div>
    <div class="card-sub" style="margin-top:6px">As <b>entradas</b> (Pix de clientes) entram só como movimento da conta — o saldo bate sozinho e o <b>Contas a Receber não é tocado</b>.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-outline" onclick="OF_fechar()">Cancelar</button><button class="btn btn-primary" onclick="OF_ligarContaConfirmar('${C_jsAttr(contaId)}', ${depois ? 'true' : 'false'})">Ligar</button></div>`
    : '<div>Nenhuma conta corrente apareceu nas conexões do banco liberadas para o WEN.</div><div style="text-align:right;margin-top:12px"><button class="btn btn-outline" onclick="OF_fechar()">Fechar</button></div>';
};
window.OF_ligarContaConfirmar = async function (contaId, depois) {
  const acc = (document.getElementById('ofContaBanco') || {}).value; if (!acc) { toast('Escolha qual conta do banco é esta.', '#ef4444'); return; }
  OF_cfg.contas = { ...(OF_cfg.contas || {}), [contaId]: acc };
  try { await OF_salvarCfg(); OF_fechar(); toast('🔗 Conta ligada ao banco'); if (depois) OF_trazerExtrato(); }
  catch (e) { toast('Não consegui salvar o vínculo: ' + (e.message || e), '#ef4444'); }
};
// Botão "🏦 Trazer do banco" no modal do extrato: usa a conta e o período escolhidos (padrão: últimos 30 dias).
window.OF_trazerExtrato = async function () {
  if (OF_ocupado) return;
  if (!OF_cfgCarregado) await OF_carregarCfg();
  const contaId = (document.getElementById('cxConta') || {}).value; if (!contaId) { toast('Escolha a conta do extrato.', '#ef4444'); return; }
  const acc = OF_contaBancoDe(contaId); if (!acc) { OF_ligarConta(contaId, true); return; }
  const deEl = document.getElementById('cxDe'), ateEl = document.getElementById('cxAte');
  const de = (deEl && deEl.value) || OF_isoMenosDias(30), ate = (ateEl && ateEl.value) || OF_isoMenosDias(0);
  OF_ocupado = true; toast('🔄 Buscando o extrato no banco…');
  try {
    const r = await OF_chamar({ acao: 'transacoes', accountId: acc, de, ate });
    const brutos = (r.transacoes || []).map(t => ({ fitid: t.fitid, data: t.data, valor: Number(t.valor) || 0, descricao: t.descricao || '' }));
    if (!brutos.length) { toast('O banco não trouxe movimentos nesse período.', '#f59e0b'); return; }
    if (deEl && !deEl.value) deEl.value = de; if (ateEl && !ateEl.value) ateEl.value = ate;
    // saldo de AGORA no banco: só serve de conferência quando o período vai até hoje
    const saldo = (ate >= OF_isoMenosDias(0) && r.conta && typeof r.conta.saldo === 'number') ? r.conta.saldo : null;
    const n = window.CX_montarDoBanco(brutos, saldo);
    toast('🏦 ' + n + ' movimento(s) do banco para revisar' + ((r.pendentes || []).length ? ' · ' + r.pendentes.length + ' ainda pendente(s) no banco ficam para a próxima' : ''));
  } catch (e) { toast('⚠️ ' + (e.message || e), '#ef4444'); }
  finally { OF_ocupado = false; }
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Fase 3 (22/10/2026): DINHEIRO DE PASSAGEM + EXTRATO BANCÁRIO (ligar completo) + SINCRONIZAR
// Espelho do NS (MP_/XB_/NB_), adaptado ao WEN:
//  • baixa manual com banco = movimento `mov_pagar_<id>` (origemTipo 'pagar'); extrato = `mov_ofx_…` ('import').
//  • LIGAR mantém a baixa, ESTORNA a linha duplicada do extrato (fica no histórico, sai do saldo) e grava o vínculo
//    em banco_conciliados (CONC_LINKS, chave conc_<movExtrato>, ligadoExtrato:true) — o mesmo lugar das conciliações.
//  • Receber é intocável: o ligar só trabalha com Contas a Pagar.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const OF_MP_TIPOS = {
  credito: ['💳', 'crédito do cartão'], entre_contas: ['🔁', 'entre contas'], fatura: ['💳', 'pagamento de fatura'],
  caixinha: ['🏦', 'aplicação / resgate'], emprestimo: ['🤝', 'empréstimo recebido'], estorno: ['↩️', 'estorno / reembolso'], manual: ['↔', 'passagem']
};
let OF_extratoBanco = {}, OF_conexoes = {}, OF_ligandoMov = '';
function OF_norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\d+/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function OF_mpChave(desc) { return OF_norm(String(desc || '').replace(/^📥\s*/, '')).split(' ').slice(0, 4).join(' '); }
function OF_ehPixNoCredito(t) { t = String(t || ''); return /pix\s+(?:no\s+)?cr[eé]dito|cr[eé]dito\s+(?:via\s+)?pix|pix\s+parcelado|valor\s+adicionado.{0,40}cart[aã]o\s+de\s+cr[eé]dito/i.test(t) && !/juros|iof|encargo|multa|tarifa/i.test(t); }
function OF_ehPagCartao(t) { t = String(t || ''); if (/total\s+da\s+fatura\s+anterior|saldo\s+(?:da\s+)?fatura\s+anterior|saldo\s+anterior/i.test(t)) return true; return /pagamento\s+(?:de\s+)?fatura|pagamento\s+recebido|pagamento.{0,25}fatura|fatura.{0,25}cart[aã]o/i.test(t) || /\bdeb(?:ito)?\.?\s+aut(?:om(?:[aá]tico)?)?\b/i.test(t); }
function OF_mpTexto(desc, valor) {
  const t = String(desc || ''), v = Number(valor) || 0;
  if (OF_ehPixNoCredito(t)) return 'credito';
  if (v < 0 && OF_ehPagCartao(t)) return 'fatura';
  if (/aplica[çc][aã]o|resgate|\brdb\b|\bcdb\b|caixinha|dinheiro guardado|porquinho|cofrinho|poupan[çc]a|tesouro direto|\blci\b|\blca\b|investimento|fundo de invest/i.test(t)) return 'caixinha';
  if (v > 0 && /cr[eé]dito pessoal|empr[eé]stimo|antecipa[çc][aã]o d|consignado/i.test(t)) return 'emprestimo';
  if (v > 0 && /estorno|ressarcimento|reembolso|cashback|devolu[çc][aã]o/i.test(t)) return 'estorno';
  return null;
}
// Passagem só para linha do EXTRATO (a baixa de uma conta a pagar é sempre despesa do studio).
function OF_mpDoMov(m) {
  if (!m) return null;
  if (String(m.tipo || '').indexOf('transferencia') === 0) return 'entre_contas';
  if (m.origemTipo !== 'import') return null;
  if (m.passagem === false) return null;
  const v = BC_movContrib(m);
  if (m.passagem === true) return OF_mpTexto(m.descricao, v) || 'manual';
  const r = (OF_cfg.passagem || []).find(z => z && z.chave && z.chave === OF_mpChave(m.descricao));
  if (r) return r.passagem ? (OF_mpTexto(m.descricao, v) || 'manual') : null;
  return OF_mpTexto(m.descricao, v);
}
function OF_mpRotulo(tp) { const x = OF_MP_TIPOS[tp] || OF_MP_TIPOS.manual; return x[0] + ' ' + x[1]; }
// Conta para o STUDIO? (resumo do extrato) — fora: transferência, ajuste/estorno, passagem e 🙋 Pessoal do Will.
function OF_noStudio(m) {
  if (!m || m.estornada || BC_movContrib(m) === 0) return false;
  if (String(m.tipo || '').indexOf('transferencia') === 0 || m.tipo === 'ajuste' || m.tipo === 'estorno') return false;
  if (OF_ehCatPessoal(m.categoria)) return false;
  return !OF_mpDoMov(m);
}
function OF_resumoMes(movs, mes) {
  const r = { ent: 0, sai: 0, foraEnt: 0, foraSai: 0 };
  (movs || []).filter(m => (m.data || '').slice(0, 7) === mes).forEach(m => { const v = BC_movContrib(m); if (!v) return; const k = OF_noStudio(m) ? (v > 0 ? 'ent' : 'sai') : (v > 0 ? 'foraEnt' : 'foraSai'); r[k] += Math.abs(v); });
  Object.keys(r).forEach(k => { r[k] = Math.round(r[k] * 100) / 100; });
  return r;
}
window.OF_marcarPassagem = async function (movId, sim) {
  const m = (BC_MOVS || []).find(x => x.id === movId); if (!m) return;
  const lembrar = confirm(sim ? `"${m.descricao}" é dinheiro de PASSAGEM (não é gasto nem receita do studio)?\n\nOK = este e os PARECIDOS daqui pra frente\nCancelar = só este`
    : `"${m.descricao}" conta para o studio?\n\nOK = este e os PARECIDOS daqui pra frente\nCancelar = só este`);
  m.passagem = !!sim;
  try {
    await BC_fbUpsert(BC_COL_MOV, m.id, m);
    if (lembrar) { const ch = OF_mpChave(m.descricao); OF_cfg.passagem = (OF_cfg.passagem || []).filter(z => z.chave !== ch).concat([{ chave: ch, passagem: !!sim }]); await OF_salvarCfg(); }
    toast(sim ? '↔ Marcado como passagem' : 'Passa a contar para o studio'); BC_renderExtrato();
  } catch (e) { toast('Não consegui salvar agora.', '#ef4444'); }
};

// ── Estados do extrato ──
function OF_achaPagar(pagarId) { for (const mes of Object.keys(P_meses || {})) { const r = (P_meses[mes] || []).find(x => x && String(x.id) === String(pagarId)); if (r) return { r, mes }; } return null; }
function OF_linkDaBaixa(pagarId) { return Object.values(typeof CONC_LINKS !== 'undefined' ? (CONC_LINKS || {}) : {}).find(x => x && x.ligadoExtrato && x.tipo === 'pagar' && String(x.id) === String(pagarId)) || null; }
function OF_estado(m, cix) {
  if (m.origemTipo === 'import') return BC_movConciliado(m, cix) ? 'conciliado' : 'extrato';
  if (m.origemTipo === 'pagar') return (OF_linkDaBaixa(m.origemId) || (() => { const a = OF_achaPagar(m.origemId); return a && a.r.conciliadoMov; })()) ? 'conciliado' : 'sempar';
  return 'app';
}
function OF_extratoLivre(e, cix) { return e && !e.estornada && e.origemTipo === 'import' && !e.conciliadoPagar && !e.conciliadoReceber && !(cix || BC_concilIndice()).match.has(String(e.id)); }
function OF_dias(a, b) { return Math.abs((new Date(String(a) + 'T12:00:00') - new Date(String(b) + 'T12:00:00')) / 86400000); }
// Candidatos de uma BAIXA sem par: exatos/próximos (±20%) na mesma conta; exatos em outra conta (banco errado).
function OF_candidatos(m, movs, cix) {
  const v = BC_movContrib(m), av = Math.abs(v), dif = e => Math.abs(Math.abs(BC_movContrib(e)) - av);
  const base = (movs || BC_MOVS || []).filter(e => e.id !== m.id && OF_extratoLivre(e, cix) && Math.sign(BC_movContrib(e)) === Math.sign(v) && OF_dias(e.data, m.data) <= 31);
  const ord = (a, b) => dif(a) - dif(b) || OF_dias(a.data, m.data) - OF_dias(b.data, m.data);
  const mesma = base.filter(e => e.contaId === m.contaId);
  return { exatos: mesma.filter(e => dif(e) < 0.02).sort(ord), proximos: mesma.filter(e => dif(e) >= 0.02 && dif(e) <= av * 0.2).sort(ord), outros: base.filter(e => e.contaId !== m.contaId && dif(e) < 0.02).sort(ord) };
}
function OF_baixasParaExtrato(e, movs, cix) {
  return (movs || BC_MOVS || []).filter(m => !m.estornada && m.origemTipo === 'pagar' && OF_estado(m, cix) === 'sempar')
    .map(m => { const c = OF_candidatos(m, movs, cix); const tipo = c.exatos.some(x => x.id === e.id) ? 'exato' : c.proximos.some(x => x.id === e.id) ? 'proximo' : c.outros.some(x => x.id === e.id) ? 'outro' : null; return tipo ? { m, tipo } : null; })
    .filter(Boolean).sort((a, b) => ['exato', 'proximo', 'outro'].indexOf(a.tipo) - ['exato', 'proximo', 'outro'].indexOf(b.tipo));
}
function OF_paresSugeridos(contaId, movs, cix) {
  const sp = (movs || BC_MOVS || []).filter(m => !m.estornada && m.contaId === contaId && m.origemTipo === 'pagar' && OF_estado(m, cix) === 'sempar');
  const cand = sp.map(m => ({ m, ex: OF_candidatos(m, movs, cix).exatos })), uso = {};
  cand.forEach(x => x.ex.forEach(e => { uso[e.id] = (uso[e.id] || 0) + 1; }));
  return cand.filter(x => x.ex.length === 1 && uso[x.ex[0].id] === 1).map(x => ({ m: x.m, e: x.ex[0] }));
}

// ── Ligar / desligar ──
window.OF_ligarMov = async function (movId, extId, opts) {
  opts = opts || {};
  const m = (BC_MOVS || []).find(x => x.id === movId), e = (BC_MOVS || []).find(x => x.id === extId); if (!m || !e) return false;
  if (m.contaId !== e.contaId) { toast('Esse movimento é de outra conta — use "mover e ligar".', '#ef4444'); return false; }
  const a = OF_achaPagar(m.origemId); if (!a) { toast('Não achei a conta a pagar dessa baixa.', '#ef4444'); return false; }
  const dif = Math.round((BC_movContrib(e) - BC_movContrib(m)) * 100) / 100;
  if (!opts.semConfirmar && !confirm(`Ligar "${a.r.nome}" (${fmt(Math.abs(BC_movContrib(m)))}) ao movimento do banco "${String(e.descricao || '').replace(/^📥\s*/, '')}" de ${BC_dataBR(e.data)}?\n\nÉ a mesma transação: a linha do extrato é estornada (fica no histórico, sai do saldo) e a baixa passa a contar como conciliada.`
    + (Math.abs(dif) >= 0.01 ? `\n\nDiferença de ${fmt(Math.abs(dif))} (${dif < 0 ? 'o banco cobrou mais' : 'o banco cobrou menos'}): vira um ajuste ligado a esta conciliação, para o saldo bater com o banco.` : ''))) return false;
  const chave = 'conc_' + e.id, difId = Math.abs(dif) >= 0.01 ? 'mov_ligdif_' + e.id : null;
  const link = { chave, status: 'match', tipo: 'pagar', id: a.r.id, mes: a.mes, movId: e.id, label: a.r.nome || '', statusAntes: a.r.status, valorPagoAntes: Number(a.r.valorPago) || 0,
    valorBaixa: 0, parcial: false, ligadoExtrato: true, baixaMovId: m.id, difMovId: difId, ts: new Date().toISOString() };
  try {
    CONC_LINKS[chave] = link; await CC_fbSalvar(CONC_COL, chave, link);
    e.estornada = true; e.estornoMotivo = 'Ligado à baixa: ' + (a.r.nome || ''); await BC_fbUpsert(BC_COL_MOV, e.id, e);
    if (difId) { const d = { id: difId, contaId: m.contaId, tipo: dif > 0 ? 'entrada' : 'saida', valor: Math.abs(dif), data: e.data, descricao: '⚖️ diferença da ligação · ' + (a.r.nome || ''), categoria: a.r.categoria || '', origemTipo: 'ligar_dif', estornada: false };
      BC_MOVS = BC_MOVS.filter(x => x.id !== difId); BC_MOVS.push(d); await BC_fbUpsert(BC_COL_MOV, difId, d); }
    a.r.conciliadoMov = e.id; P_salvarStorage();
    if (typeof AUD_log === 'function') AUD_log('pagar', 'meses', a.r.nome, 'Baixa ligada ao extrato (Open Finance)', null, null);
    if (!opts.semRender) { OF_ligandoMov = ''; toast('🔗 Ligado ao banco'); BC_renderExtrato(); }
    return true;
  } catch (err) { toast('Não consegui ligar: ' + (err.message || err), '#ef4444'); return false; }
};
window.OF_desligar = async function (chave) {
  const x = (CONC_LINKS || {})[chave]; if (!x || !x.ligadoExtrato) return;
  if (!confirm('Desfazer a ligação? A linha do extrato volta e a baixa fica sem par no banco.')) return;
  try {
    const e = (BC_MOVS || []).find(m => m.id === x.movId); if (e) { e.estornada = false; delete e.estornoMotivo; await BC_fbUpsert(BC_COL_MOV, e.id, e); }
    if (x.difMovId) { const d = (BC_MOVS || []).find(m => m.id === x.difMovId); if (d) { d.estornada = true; await BC_fbUpsert(BC_COL_MOV, d.id, d); } }
    const a = OF_achaPagar(x.id); if (a && a.r.conciliadoMov === x.movId) { delete a.r.conciliadoMov; P_salvarStorage(); }
    delete CONC_LINKS[chave]; await CC_fbExcluir(CONC_COL, chave);
    toast('Ligação desfeita.'); BC_renderExtrato();
  } catch (err) { toast('Não consegui desfazer: ' + (err.message || err), '#ef4444'); }
};
// Baixa lançada na conta errada: muda a conta da conta a pagar (o movimento mov_pagar acompanha) e liga.
window.OF_moverELigar = async function (movId, extId) {
  const m = (BC_MOVS || []).find(x => x.id === movId), e = (BC_MOVS || []).find(x => x.id === extId); if (!m || !e) return;
  const a = OF_achaPagar(m.origemId); if (!a) return toast('Não achei a conta a pagar dessa baixa.', '#ef4444');
  const nome = ((BC_CONTAS[e.contaId] || {}).banco || '') + ' · ' + ((BC_CONTAS[e.contaId] || {}).nome || '');
  if (!confirm(`Esse pagamento aparece no extrato de ${nome} em ${BC_dataBR(e.data)}.\n\nMover a baixa de "${a.r.nome}" para essa conta e ligar? O saldo sai de uma conta e entra na outra.`)) return;
  a.r.contaBancariaId = e.contaId; P_salvarStorage(); BC_syncMovPagar(a.r);   // o mov_pagar_<id> passa para a outra conta
  const ok = await OF_ligarMov(m.id, extId, { semConfirmar: true, semRender: true });
  OF_ligandoMov = ''; if (ok) toast('Movido e ligado 💚'); BC_renderExtrato();
};
window.OF_ligarSugeridos = async function (contaId) {
  const pares = OF_paresSugeridos(contaId, BC_MOVS, BC_concilIndice()); if (!pares.length) return;
  if (!confirm(`Ligar ${pares.length} baixa(s) ao extrato (mesmo valor, sem dúvida)?\n\n` + pares.slice(0, 12).map(p => `• ${p.m.descricao} ${fmt(Math.abs(BC_movContrib(p.m)))} ↔ ${String(p.e.descricao || '').replace(/^📥\s*/, '')} ${BC_dataBR(p.e.data)}`).join('\n'))) return;
  let n = 0; for (const p of pares) if (await OF_ligarMov(p.m.id, p.e.id, { semConfirmar: true, semRender: true })) n++;
  toast(n + ' ligada(s) ao banco 💚'); BC_renderExtrato();
};
window.OF_ligarAbrir = function (id) { OF_ligandoMov = OF_ligandoMov === id ? '' : id; BC_renderExtrato(); };

// ── Banco ao vivo: saldo, "sincronizado há", o que falta lançar ──
function OF_quando(iso) {
  if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000), dia = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
  return (min < 60 ? 'há ' + Math.max(1, min) + ' min' : min < 1440 ? 'há ' + Math.round(min / 60) + 'h' : 'em ' + dia) + ' (' + dia + ' às ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ')';
}
window.OF_atualizarExtrato = async function (contaId) {
  const acc = OF_contaBancoDe(contaId); if (!acc) return;
  OF_extratoBanco[contaId] = { ...(OF_extratoBanco[contaId] || {}), carregando: true }; try { BC_renderExtrato(); } catch (e) {}
  try {
    const [r, cx] = await Promise.all([OF_chamar({ acao: 'transacoes', accountId: acc, de: OF_isoMenosDias(60), ate: OF_isoMenosDias(0) }), OF_chamar({ acao: 'conexoes' }).catch(() => ({ conexoes: [] }))]);
    (cx.conexoes || []).forEach(c => { if (c && c.itemId) OF_conexoes[c.itemId] = c; });
    const ids = new Set((BC_MOVS || []).filter(m => m.contaId === contaId).map(m => m.id));   // inclusive estornadas: já foram tratadas
    const novos = (r.transacoes || []).filter(t => !ids.has('mov_ofx_' + contaId + '_' + t.fitid)).map(t => ({ fitid: t.fitid, data: t.data, valor: Number(t.valor) || 0, descricao: t.descricao || '' }));
    OF_extratoBanco[contaId] = { saldo: r.conta && typeof r.conta.saldo === 'number' ? r.conta.saldo : null, itemId: r.conta && r.conta.itemId, novos, pendentes: (r.pendentes || []).length };
  } catch (e) { OF_extratoBanco[contaId] = { erro: e.message || String(e) }; }
  try { BC_renderExtrato(); } catch (e) {}
};
window.OF_lancarNovos = async function (contaId) {
  const b = OF_extratoBanco[contaId]; if (!b || !b.novos || !b.novos.length) return;
  const bg = document.getElementById('bcExtratoBg'); if (bg) bg.classList.remove('open');
  await CX_abrir();
  const sel = document.getElementById('cxConta'); if (sel) { sel.value = contaId; try { CX_mudarConta(); } catch (e) {} }
  const n = window.CX_montarDoBanco(b.novos, b.saldo);
  toast('🏦 ' + n + ' movimento(s) do banco para revisar');
};
function OF_htmlRefazer(contaId) {
  const b = OF_extratoBanco[contaId]; if (!b || typeof b.saldo !== 'number') return '';
  const ajs = (BC_MOVS || []).filter(m => m.contaId === contaId && !m.estornada && m.tipo === 'ajuste'); if (!ajs.length) return '';
  const app = BC_saldoConta(contaId); if (app === null || Math.abs(app - b.saldo) < 0.01) return '';
  return `<div style="background:#fef3c7;border-radius:10px;padding:8px 10px;margin:6px 0;font-size:.82rem;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><span>⚖️ O ajuste de <b>${fmt(ajs.reduce((s, m) => s + BC_movContrib(m), 0))}</b> ficou desatualizado — o saldo do sistema não bate com o do banco.</span><button class="bc-fil" onclick="OF_refazerAjuste('${C_jsAttr(contaId)}')">Refazer ajuste</button></div>`;
}
window.OF_refazerAjuste = async function (contaId) {
  const ajs = (BC_MOVS || []).filter(m => m.contaId === contaId && !m.estornada && m.tipo === 'ajuste'); if (!ajs.length) return;
  if (!confirm(`Refazer o ajuste?\n\n${ajs.map(a => `• ${a.descricao} ${fmt(BC_movContrib(a))} (${BC_dataBR(a.data)})`).join('\n')}\n\nEle(s) ficam no histórico como estornados e a conferência abre com o saldo de agora do banco.`)) return;
  for (const a of ajs) { a.estornada = true; a.estornoMotivo = 'Ajuste refeito (Open Finance)'; try { await BC_fbUpsert(BC_COL_MOV, a.id, a); } catch (e) {} }
  OF_conferirComBanco(contaId);
};
// Conferência de saldo com o saldo do banco já preenchido (quando a conta está ligada).
window.OF_conferirComBanco = function (contaId) {
  BC_conferir(contaId);
  const b = OF_extratoBanco[contaId], inp = document.getElementById('bcConfBanco');
  if (b && typeof b.saldo === 'number' && inp) { inp.value = b.saldo.toFixed(2); try { BC_conferirCalc(); } catch (e) {} }
};
// Topo do extrato da conta (dentro do modal do extrato do WEN)
function OF_htmlExtratoTopo(contaId) {
  const acc = OF_contaBancoDe(contaId);
  if (!acc) return `<div style="font-size:.8rem;color:#64748b;margin-bottom:8px">Conta sem ligação com o banco. <button class="bc-fil" onclick="OF_ligarConta('${C_jsAttr(contaId)}')">🔗 Ligar ao banco</button></div>`;
  const b = OF_extratoBanco[contaId] || {}, cix = BC_concilIndice();
  if (!b.carregando && b.saldo === undefined && !b.erro) setTimeout(() => OF_atualizarExtrato(contaId), 0);   // 1ª vez: busca sozinho
  let linha = '';
  if (b.carregando) linha = '🔄 Consultando o banco…';
  else if (b.erro) linha = `<span style="color:#ef4444">⚠️ ${C_esc(b.erro)}</span>`;
  else if (typeof b.saldo === 'number') { const app = BC_saldoConta(contaId), dif = app === null ? null : Math.round((b.saldo - app) * 100) / 100;
    const cn = b.itemId ? OF_conexoes[b.itemId] : null;
    linha = `No banco <b>${fmt(b.saldo)}</b> · no sistema <b>${app === null ? '—' : fmt(app)}</b> · ${dif === null ? '' : Math.abs(dif) < 0.01 ? '<b style="color:#16a34a">✓ Redondo</b>' : `<b style="color:#b45309">diferença ${fmt(dif)}</b>`}${cn && cn.atualizadoEm ? ` · 🕒 banco sincronizado ${C_esc(OF_quando(cn.atualizadoEm))}` : ''}`; }
  const nov = (b.novos || []).length, sug = OF_paresSugeridos(contaId, BC_MOVS, cix).length;
  return `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;margin-bottom:8px;font-size:.8rem">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><span>🏦 ${linha}</span><button class="bc-fil" onclick="OF_atualizarExtrato('${C_jsAttr(contaId)}')">🔄 Atualizar do banco</button></div>
    ${nov ? `<div style="margin-top:6px">⬇️ <b>${nov}</b> movimento(s) no banco que ainda não estão no sistema <button class="bc-fil" onclick="OF_lancarNovos('${C_jsAttr(contaId)}')">Revisar e lançar</button>${b.pendentes ? ` <span style="opacity:.7">· ${b.pendentes} pendente(s) no banco ficam para depois</span>` : ''}</div>` : ''}
    ${sug ? `<div style="margin-top:6px"><button class="bc-fil" onclick="OF_ligarSugeridos('${C_jsAttr(contaId)}')">🔗 Ligar sugeridos (${sug})</button> <span style="opacity:.7">baixas com o mesmo valor no extrato, sem dúvida</span></div>` : ''}
    ${OF_htmlRefazer(contaId)}</div>`;
}
// Selo, categoria/passagem e ações de UMA linha do extrato (vai embaixo da linha do WEN)
function OF_htmlMov(m, cix) {
  const est = OF_estado(m, cix), mp = OF_mpDoMov(m);
  const btn = (rot, js) => `<button class="bc-fil" style="font-size:.72rem;padding:2px 8px" onclick="${js}">${rot}</button>`;
  let selo = '', acoes = '';
  if (est === 'sempar') { selo = '<span style="background:#fef3c7;color:#a16207;border-radius:7px;padding:1px 6px;font-weight:700;font-size:.68rem">⚠️ pago no sistema, sem par no banco</span>'; acoes = btn('🔗 ligar', `OF_ligarAbrir('${C_jsAttr(m.id)}')`); }
  else if (est === 'extrato') {
    if (mp) { selo = `<span style="background:#eef2ff;color:#4338ca;border-radius:7px;padding:1px 6px;font-weight:700;font-size:.68rem">${OF_mpRotulo(mp)} · passagem</span>`; acoes = mp !== 'entre_contas' ? btn('contar', `OF_marcarPassagem('${C_jsAttr(m.id)}', false)`) : ''; }
    else acoes = btn('↔ passagem', `OF_marcarPassagem('${C_jsAttr(m.id)}', true)`) + (BC_movContrib(m) < 0 ? ' ' + btn('🔗 é uma conta lançada?', `OF_ligarAbrir('x:${C_jsAttr(m.id)}')`) : '');
  }
  const lk = m.origemTipo === 'pagar' ? OF_linkDaBaixa(m.origemId) : null;
  if (lk) acoes = btn('desfazer ligação', `OF_desligar('${C_jsAttr(lk.chave)}')`);
  let painel = '';
  const linhaC = (txt, b) => `<div style="display:flex;justify-content:space-between;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap"><span>${txt}</span><span>${b}</span></div>`;
  const acoesPar = (b, e, tipo) => { const ids = `'${C_jsAttr(b.id)}','${C_jsAttr(e.id)}'`, dif = Math.round((BC_movContrib(e) - BC_movContrib(b)) * 100) / 100;
    if (tipo === 'outro') return btn('está em ' + C_esc((BC_CONTAS[e.contaId] || {}).banco || 'outra conta') + ': mover e ligar', `OF_moverELigar(${ids})`);
    if (tipo === 'proximo') return btn('ligar · diferença ' + fmt(Math.abs(dif)) + ' vira ajuste', `OF_ligarMov(${ids})`);
    return btn('É este', `OF_ligarMov(${ids})`); };
  const desc = e => C_esc(String(e.descricao || '').replace(/^📥\s*/, ''));
  if (OF_ligandoMov === m.id && est === 'sempar') {
    const c = OF_candidatos(m, BC_MOVS, cix), tem = c.exatos.length + c.proximos.length + c.outros.length;
    const sec = (t, arr, tipo) => arr.length ? `<div style="margin-top:4px;font-weight:700">${t}</div>` + arr.slice(0, 5).map(e => linhaC(`${desc(e)} · ${BC_dataBR(e.data)} · <b>${fmt(Math.abs(BC_movContrib(e)))}</b>`, acoesPar(m, e, tipo))).join('') : '';
    painel = tem ? sec('Mesmo valor', c.exatos, 'exato') + sec('Valor próximo', c.proximos, 'proximo') + sec('Em outra conta', c.outros, 'outro') : 'Nenhum movimento do extrato parecido (até 1 mês). Se o pagamento não passou por banco, fica mesmo sem par.';
  } else if (OF_ligandoMov === 'x:' + m.id) {
    const bs = OF_baixasParaExtrato(m, BC_MOVS, cix);
    painel = bs.length ? '<b>Qual conta lançada é este movimento?</b>' + bs.slice(0, 6).map(({ m: b, tipo }) => linhaC(`${C_esc(b.descricao || '')} · ${BC_dataBR(b.data)} · <b>${fmt(Math.abs(BC_movContrib(b)))}</b>`, acoesPar(b, m, tipo))).join('') : 'Nenhuma baixa sem par com valor parecido (até 1 mês).';
  }
  if (!selo && !acoes && !painel) return '';
  return `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:2px 0 6px">${selo}${acoes}</div>${painel ? `<div style="border:1px dashed #94a3b8;border-radius:10px;padding:6px 8px;margin:0 0 8px;font-size:.78rem">${painel}</div>` : ''}`;
}

// ── 🔄 Sincronizar com o banco: uma janela, uma seção por conta e por cartão ligados ──
window.OF_abrirSync = async function () {
  if (!OF_cfgCarregado) await OF_carregarCfg();
  const contas = Object.keys(OF_cfg.contas || {}).filter(id => BC_CONTAS[id]), cartoes = Object.keys(OF_cfg.cartoes || {}).filter(id => C_card(id).nome);
  const secC = id => { const c = BC_CONTAS[id], b = OF_extratoBanco[id] || {};
    const status = b.carregando ? '🔄 consultando…' : b.erro ? `<span style="color:#ef4444">⚠️ ${C_esc(b.erro)}</span>` : typeof b.saldo === 'number' ? `no banco <b>${fmt(b.saldo)}</b> · no sistema <b>${fmt(BC_saldoConta(id) || 0)}</b>` : '';
    return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>🏦 ${C_esc((c.banco || '') + ' · ' + (c.nome || ''))}</b><span style="font-size:.8rem">${status}</span></div>
      <div style="font-size:.8rem;margin-top:6px">${(b.novos || []).length ? `⬇️ <b>${b.novos.length}</b> novo(s) no banco` : (b.novos ? '✓ nada novo no banco' : '')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${(b.novos || []).length ? `<button class="btn btn-primary" style="width:auto" onclick="OF_fechar();OF_lancarNovos('${C_jsAttr(id)}')">Revisar e lançar</button>` : ''}<button class="btn btn-outline" style="width:auto" onclick="OF_fechar();BC_abrirExtrato('${C_jsAttr(id)}')">Abrir extrato</button></div></div>`; };
  const secK = id => { const c = C_card(id); return `<div style="border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>💳 ${C_esc(c.nome)}</b>${OF_ehPessoal(id) ? '<span style="font-size:.78rem">🙋 pessoal → Reembolsar Will</span>' : ''}</div><div style="margin-top:8px"><button class="btn btn-outline" style="width:auto" onclick="OF_fechar();showMain&&showMain('cartoes');setTimeout(()=>OF_irImportar('${C_jsAttr(id)}'),300)">Trazer fatura do banco</button></div></div>`; };
  const render = () => OF_modal(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h2 style="margin:0">🔄 Sincronizar com o banco</h2><button class="btn btn-outline" style="width:auto" onclick="OF_fechar()">✕</button></div>
    <p class="card-sub" style="margin:6px 0 10px">O que chegou do banco em cada conta e cartão ligados. Tudo passa por uma revisão antes de lançar.</p>
    ${contas.length || cartoes.length ? contas.map(secC).join('') + cartoes.map(secK).join('') : 'Nenhuma conta ou cartão ligado ainda. Ligue em <b>Contas bancárias → extrato</b> e em <b>Cartões → Meus cartões</b>.'}`, 760);
  render();
  for (const id of contas) { OF_extratoBanco[id] = { ...(OF_extratoBanco[id] || {}), carregando: true }; }
  render();
  await Promise.all(contas.map(id => OF_atualizarExtrato(id)));
  if (document.getElementById('ofModal') && document.getElementById('ofModal').classList.contains('open')) render();
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Fase 4 (22/10/2026): cartão IGUAL AO NS — compras em aberto + prévias; extrato concilia com o que JÁ ESTÁ
// pago/recebido no sistema ("✓ Já está no app" do NS).
// ═══════════════════════════════════════════════════════════════════════════════════════════
let OF_abertas = {};   // cartaoId → { mes, compras:[{fitid,data,descricao,valor,parcela}], cats:{fitid: categoria}, ultimaFatura }
function OF_ymAdd(ym, n) { const [y, m] = String(ym).split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
async function OF_carregarAberta(cid) {
  try { const res = await fetch(`${FS_URL}/open_finance/aberta_${encodeURIComponent(cid)}?key=${FB_API_KEY}`);
    if (res.ok) { const j = await res.json(), f = j.fields || {}, o = {}; Object.keys(f).forEach(k => o[k] = fromFV(f[k])); OF_abertas[cid] = { mes: o.mes || '', compras: o.compras || [], cats: o.cats || {}, ultimaFatura: o.ultimaFatura || null, vistos: o.vistos || [] }; } } catch (e) {}
  return OF_abertas[cid];
}
async function OF_salvarAberta(cid) { const a = OF_abertas[cid] || {}; await BC_fbUpsert('open_finance', 'aberta_' + cid, { mes: a.mes || '', compras: a.compras || [], cats: a.cats || {}, ultimaFatura: a.ultimaFatura || null, vistos: a.vistos || [] }); }
// Compra do ciclo aberto que já está numa fatura importada (mesmo id do banco, ou mesmo valor ±5 dias).
function OF_abertaJaNaFatura(cid, compras) {
  const out = new Set(), usados = new Set(), itens = [];
  (C_faturas || []).filter(f => f && f.cartaoId === cid).forEach(f => (f.itens || []).forEach((it, i) => itens.push({ k: f.id + '#' + i, it })));
  (compras || []).forEach(c => {
    if (itens.some(x => x.it.fitid === 'PLG' + c.fitid)) { out.add(c.fitid); return; }
    const cents = Math.round(Math.abs(Number(c.valor) || 0) * 100);
    const cand = itens.filter(x => !usados.has(x.k) && Math.round(Math.abs(Number(x.it.valor) || 0) * 100) === cents && x.it.dataCompra && c.data && OF_dias(x.it.dataCompra, c.data) <= 5)
      .sort((a, b) => OF_dias(a.it.dataCompra, c.data) - OF_dias(b.it.dataCompra, c.data));
    if (cand.length) { usados.add(cand[0].k); out.add(c.fitid); }
  });
  return out;
}
// Itens previstos de um cartão (espelho do C_itensPrevistos do NS): parcelas projetadas + compras em aberto
// com rateio CONFIRMADO. Mês com fatura real nunca tem previsão.
function OF_itensPrevistos(cid) {
  const itens = [];
  (C_parcelamentos || []).filter(p => p.ativo && p.cartaoId === cid).forEach(p => {
    const [ay, am] = String(p.mesInicio || '').split('-').map(Number); if (!ay) return;
    for (let n = (Number(p.parcelaAtual) || 0) + 1; n <= (Number(p.totalParcelas) || 0); n++) {
      const k = OF_ymAdd(ay + '-' + String(am).padStart(2, '0'), n - 1); if (C_temFaturaReal(cid, k)) continue;
      itens.push({ mes: k, desc: p.descricao || 'Parcela', categoria: p.categoria || '', valor: Number(p.valorParcela) || 0, n, total: p.totalParcelas, tipo: 'parcela', ref: 'p:' + p.id });
    }
  });
  const ab = OF_abertas[cid];
  if (ab && /^\d{4}-\d{2}$/.test(ab.mes || '') && !C_temFaturaReal(cid, ab.mes)) {
    const ja = OF_abertaJaNaFatura(cid, ab.compras || []);
    for (const c of (ab.compras || [])) {
      if (ja.has(c.fitid) || OF_ehPagCartao(c.descricao)) continue;
      const cat = (ab.cats || {})[c.fitid]; if (!(typeof cat === 'string' && cat)) continue;   // só depois do rateio confirmado
      const valor = Math.round((Number(c.valor) || 0) * 100) / 100; if (!valor) continue;
      const parc = c.parcela && c.parcela.total >= 2 && c.parcela.atual >= 1 && c.parcela.atual <= c.parcela.total ? c.parcela : null;
      if (!parc) { itens.push({ mes: ab.mes, desc: c.descricao || 'Compra', categoria: cat, valor, n: null, total: null, tipo: 'aberta', ref: 'a:' + c.fitid }); continue; }
      const proj = itens.find(it => it.tipo === 'parcela' && it.mes === ab.mes && !it._casada && it.n === parc.atual && it.total === parc.total && Math.abs((it.valor || 0) - Math.abs(valor)) <= 0.02);
      if (proj) { proj._casada = true; continue; }   // a mesma parcela já projetada pela fatura anterior
      for (let n = parc.atual; n <= parc.total; n++) { const k = OF_ymAdd(ab.mes, n - parc.atual); if (C_temFaturaReal(cid, k)) continue;
        itens.push({ mes: k, desc: c.descricao || 'Compra', categoria: cat, valor: Math.abs(valor), n, total: parc.total, tipo: 'aberta', ref: 'a:' + c.fitid }); }
    }
  }
  itens.forEach(it => { delete it._casada; });
  return itens;
}
// Totais da prévia por mês (cartão pessoal: só o que é do studio — o "🙋 Pessoal do Will" não é reembolsado).
function OF_porMesPrevia(cid) {
  const pess = OF_ehPessoal(cid), pm = {};
  OF_itensPrevistos(cid).forEach(it => { if (pess && OF_ehCatPessoal(it.categoria)) return; pm[it.mes] = Math.round(((pm[it.mes] || 0) + (Number(it.valor) || 0)) * 100) / 100; });
  Object.keys(pm).forEach(k => { if (!(pm[k] > 0.005)) delete pm[k]; });
  return pm;
}
// Compras em aberto CONFIRMADAS de um mês, no formato do C_parcelasDaPrevia do WEN (rateio e detalhe da prévia).
function OF_abertasDoMes(cid, mes) { return OF_itensPrevistos(cid).filter(it => it.tipo === 'aberta' && it.mes === mes).map(it => ({ desc: it.desc, categoria: it.categoria, valor: it.valor, n: it.n, total: it.total })); }
function OF_pendentesAberta(cid) {
  const ab = OF_abertas[cid]; if (!ab) return [];
  const ja = OF_abertaJaNaFatura(cid, ab.compras || []);
  return (ab.compras || []).filter(c => !ja.has(c.fitid) && !OF_ehPagCartao(c.descricao) && !(ab.cats || {})[c.fitid] && Math.abs(Number(c.valor) || 0) > 0.005);
}
// 🔄 Atualizar cartão: compras em aberto (rateio a confirmar) + a fatura fechada mais recente, se ainda não está aqui.
window.OF_atualizarCartao = async function () {
  if (OF_ocupado) return;
  const cid = (document.getElementById('cImpCartao') || {}).value; if (!cid || !C_card(cid).nome) { toast('Escolha o cartão.', '#ef4444'); return; }
  if (!OF_cfgCarregado) await OF_carregarCfg();
  const acc = OF_contaDoCartao(cid); if (!acc) { OF_ligar(cid); return; }
  OF_ocupado = true;
  OF_modal(`<h2 style="margin:0 0 10px">🔄 Sincronizar com o banco · cartão</h2><div id="ofCorpo" class="card-sub">🔄 Buscando no banco…</div>`, 760);
  try {
    const r = await OF_chamar({ acao: 'aberta', accountId: acc });
    const ant = OF_abertas[cid] || (await OF_carregarAberta(cid)) || {};
    OF_abertas[cid] = { mes: r.mes || '', compras: (r.compras || []).map(c => ({ fitid: c.fitid, data: c.data, descricao: c.descricao, valor: Number(c.valor) || 0, parcela: c.parcela || null })), cats: ant.cats || {}, vistos: ant.vistos || [], sug: ant.sug || {}, ultimaFatura: r.ultimaFatura ? { vencimento: r.ultimaFatura.vencimento, total: r.ultimaFatura.total } : null };
    await OF_salvarAberta(cid);
    C_sincronizarFaturasPrevias(cid); try { C_renderTudo(); } catch (e) {}
    OF_renderAberta(cid);
  } catch (e) { const el = document.getElementById('ofCorpo'); if (el) el.innerHTML = `<div style="color:#ef4444">⚠️ ${C_esc(e.message || e)}</div><div style="text-align:right;margin-top:12px"><button class="btn btn-outline" onclick="OF_fechar()">Fechar</button></div>`; }
  finally { OF_ocupado = false; }
};
// Sugestão de categoria (igual ao NS: aprendido → regras/palavras-chave → SophIA quando pedida)
function OF_chaveDesc(d) { return OF_norm(String(d || '').replace(/^📥\s*/, '')).split(' ').filter(w => w.length > 2).slice(0, 3).join(' '); }
function OF_sugerir(desc) {
  const ap = (OF_cfg.regrasCat || {})[OF_chaveDesc(desc)];
  if (ap && (typeof CATS_P === 'undefined' || CATS_P[ap])) return { cat: ap, conf: 'alta', origem: 'aprendido' };
  if (typeof IMP_sugerirCatConf === 'function') { const s = IMP_sugerirCatConf(desc); if (s && s.cat) return s; }
  return { cat: '', conf: 'revisar', origem: null };
}
function OF_pill(conf) {
  const m = { alta: ['alta', '#dcfce7', '#15803d'], media: ['média', '#fef9c3', '#a16207'], baixa: ['baixa', '#ffedd5', '#c2410c'], revisar: ['revisar', '#fee2e2', '#b91c1c'] }[conf || 'revisar'] || ['revisar', '#fee2e2', '#b91c1c'];
  return `<span style="background:${m[1]};color:${m[2]};border-radius:999px;padding:2px 8px;font-size:.7rem;font-weight:800;white-space:nowrap">${m[0]}</span>`;
}
// Tela do cartão no padrão do "Sincronizar com o banco" do NS: fatura se montando, total a sincronizar,
// SophIA completa, Confirmar sugestões, NOVO, e cada compra com a categoria sugerida + confiança.
function OF_renderAberta(cid) {
  const el = document.getElementById('ofCorpo'); if (!el) return;
  const ab = OF_abertas[cid] || {}, pend = OF_pendentesAberta(cid), pess = OF_ehPessoal(cid);
  const sug = ab.sug || (ab.sug = {});
  pend.forEach(c => { if (!sug[c.fitid]) sug[c.fitid] = OF_sugerir(c.descricao); });
  const vistos = new Set(ab.vistos || []);
  const prev = (ab.mes ? OF_itensPrevistos(cid).filter(it => it.mes === ab.mes) : []);
  const vConf = prev.filter(it => it.tipo === 'aberta').reduce((a, it) => a + it.valor, 0), vParc = prev.filter(it => it.tipo === 'parcela').reduce((a, it) => a + it.valor, 0);
  const vPend = pend.reduce((a, c) => a + Math.abs(Number(c.valor) || 0), 0);
  const r2 = v => Math.round(v * 100) / 100;
  const nSug = pend.filter(c => (sug[c.fitid] || {}).cat).length, nSem = pend.length - nSug;
  const uf = ab.ultimaFatura, mesUF = uf && uf.vencimento ? String(uf.vencimento).slice(0, 7) : '';
  const faltaFatura = mesUF && !C_temFaturaReal(cid, mesUF);
  const mesC = ab.mes ? C_mesCurto(ab.mes) : '—';
  const opts = sel => (typeof C_optsCategorias === 'function' ? C_optsCategorias(sel || '') : '');
  const linha = c => { const sg = sug[c.fitid] || {}; const novo = !vistos.has(c.fitid);
    return `<div style="display:flex;gap:10px;align-items:center;border-bottom:1px solid #e5e7eb;padding:9px 0">
      <div style="flex:1;min-width:0"><div style="font-size:.9rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${C_esc(c.descricao)}</div>
        <div style="font-size:.74rem;color:#94a3b8;display:flex;gap:6px;align-items:center;margin-top:2px">${novo ? '<span style="background:#dcfce7;color:#15803d;border-radius:6px;padding:0 6px;font-weight:800;font-size:.66rem">NOVO</span>' : ''}${C_dataBR(c.data)}${c.parcela ? ' · parcela ' + c.parcela.atual + '/' + c.parcela.total : ''}</div></div>
      <select data-of-fit="${C_esc(c.fitid)}" onchange="OF_setSug('${C_jsAttr(cid)}','${C_jsAttr(c.fitid)}',this.value)" style="max-width:190px;border-radius:10px;padding:6px 8px;border:1px solid #e5e7eb;background:#fafaf9">${opts(sg.cat)}</select>
      <b style="white-space:nowrap;font-size:.92rem">${fmt(Math.abs(c.valor))}</b>${OF_pill(sg.cat ? sg.conf : 'revisar')}</div>`; };
  el.innerHTML = `
    ${faltaFatura ? `<div style="background:#fef3c7;border-radius:12px;padding:9px 12px;margin-bottom:10px;font-size:.84rem">🧾 A fatura de <b>${C_dataBR(uf.vencimento)}</b> (${fmt(uf.total || 0)}) já fechou no banco e ainda não está aqui. <button class="btn btn-outline" style="width:auto;padding:3px 10px" onclick="OF_fechar();document.getElementById('cImpMes').value='${mesUF}';OF_trazerFatura()">Trazer essa fatura</button></div>` : ''}
    <div style="border:1px solid #e5e7eb;border-radius:16px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline"><b style="font-size:1.05rem">💳 ${C_esc(C_card(cid).nome || '')}</b><span style="font-size:.8rem;color:#64748b">fatura de ${C_esc(mesC)} se montando · ${(ab.compras || []).filter(c => !OF_ehPagCartao(c.descricao)).length} lançamento(s)</span></div>
      <div style="font-weight:800;font-size:1.1rem;margin-top:6px">Fatura de ${C_esc(mesC)} até agora: ${fmt(r2(vConf + vParc + vPend))}</div>
      <div style="font-size:.8rem;color:#64748b">compras confirmadas ${fmt(r2(vConf))} · parcelas ${fmt(r2(vParc))}${pend.length ? ` · <b>+ ${fmt(r2(vPend))} aguardando rateio (${pend.length})</b>` : ''}</div>
      ${pess ? '<div style="font-size:.78rem;color:#7c3aed;margin-top:4px">🙋 Cartão pessoal: o que for do studio vira <b>🔁 Reembolsar Will (prévia)</b>; o resto marque <b>🙋 Pessoal do Will</b>.</div>' : ''}
      ${pend.length ? `<div style="font-weight:800;margin-top:8px">Total a sincronizar: ${fmt(r2(vPend))} <span style="font-weight:400;color:#64748b">(${pend.length} compra${pend.length > 1 ? 's' : ''} sem categoria confirmada)</span></div>
        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0 4px"><span style="font-size:.8rem;color:#64748b">${nSem} sem categoria · confira as marcadas como <b>revisar</b> e <b>baixa</b></span>
          <span style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-outline" style="width:auto" id="ofBtnSophia" onclick="OF_sophiaAberta('${C_jsAttr(cid)}')">✨ SophIA completa (${nSem})</button>${nSug ? `<button class="btn btn-primary" style="width:auto" onclick="OF_confirmarAberta('${C_jsAttr(cid)}')">✓ Confirmar sugestões (${nSug})</button>` : ''}</span></div>
        <div style="max-height:46vh;overflow:auto">${pend.map(linha).join('')}</div>`
      : '<div style="font-size:.88rem;margin-top:8px;color:#15803d">✓ Nenhuma compra esperando rateio — a previsão está em dia.</div>'}
    </div>
    <div style="text-align:right;margin-top:12px"><button class="btn btn-outline" style="width:auto" onclick="OF_fecharAberta('${C_jsAttr(cid)}')">Fechar</button></div>`;
}
window.OF_setSug = function (cid, fitid, cat) { const ab = OF_abertas[cid]; if (!ab) return; ab.sug = ab.sug || {}; ab.sug[fitid] = cat ? { cat, conf: 'alta', origem: 'usuario' } : { cat: '', conf: 'revisar', origem: null }; OF_renderAberta(cid); };
// Fechar marca o que já foi visto (o NOVO some na próxima vez)
window.OF_fecharAberta = async function (cid) {
  const ab = OF_abertas[cid]; if (ab) { ab.vistos = (ab.compras || []).map(c => c.fitid); try { await BC_fbUpsert('open_finance', 'aberta_' + cid, { mes: ab.mes || '', compras: ab.compras || [], cats: ab.cats || {}, ultimaFatura: ab.ultimaFatura || null, vistos: ab.vistos }); } catch (e) {} }
  OF_fechar();
};
window.OF_sophiaAberta = async function (cid) {
  const ab = OF_abertas[cid]; if (!ab) return;
  if (typeof IA_temChave === 'function' && !IA_temChave()) { toast('Conecte a chave da IA em Config → Inteligência Artificial.', '#f59e0b'); return; }
  const alvo = OF_pendentesAberta(cid).filter(c => !((ab.sug || {})[c.fitid] || {}).cat);
  if (!alvo.length) { toast('Todas já têm sugestão 💚'); return; }
  const btn = document.getElementById('ofBtnSophia'); if (btn) { btn.disabled = true; btn.textContent = '✨ Categorizando…'; }
  try {
    const res = await IMP_categorizarIA(alvo.map(c => c.descricao || '')); let n = 0;
    alvo.forEach((c, k) => { if (res[k]) { ab.sug[c.fitid] = { cat: res[k], conf: 'baixa', origem: 'ia' }; n++; } });
    toast(n ? `✨ A SophIA sugeriu ${n} de ${alvo.length} — confira as marcadas como "baixa".` : 'A SophIA não teve certeza desta vez.');
  } catch (e) { toast(e.message || 'Não consegui categorizar agora.', '#ef4444'); }
  OF_renderAberta(cid);
};
// Confirma as compras com categoria escolhida/sugerida → entram na previsão; o escolhido ensina os próximos parecidos.
window.OF_confirmarAberta = async function (cid) {
  const ab = OF_abertas[cid]; if (!ab) return;
  let n = 0; const regras = { ...(OF_cfg.regrasCat || {}) };
  OF_pendentesAberta(cid).forEach(c => { const sg = (ab.sug || {})[c.fitid]; if (sg && sg.cat) { ab.cats = { ...(ab.cats || {}), [c.fitid]: sg.cat }; regras[OF_chaveDesc(c.descricao)] = sg.cat; n++; } });
  if (!n) { toast('Escolha a categoria de pelo menos uma compra.', '#f59e0b'); return; }
  try {
    await OF_salvarAberta(cid); OF_cfg.regrasCat = regras; await OF_salvarCfg();
    C_sincronizarFaturasPrevias(cid); try { C_renderTudo(); } catch (e) {}
    toast('✓ ' + n + ' compra(s) na previsão'); OF_renderAberta(cid);
  } catch (e) { toast('Não consegui salvar: ' + (e.message || e), '#ef4444'); }
};
// ── Extrato: "✓ Já está no sistema" (conta já paga / recebimento já recebido) ──
function OF_mesAnterior(ym) { return OF_ymAdd(ym, -1); }
function OF_jaNoApp(b, contaId) {
  const v = Number(b.valor) || 0, abs = Math.abs(v); if (!(abs > 0.005) || !b.data) return null;
  const ym = String(b.data).slice(0, 7), meses = new Set([ym, OF_mesAnterior(ym)]);
  const ligados = new Set(Object.values(typeof CONC_LINKS !== 'undefined' ? (CONC_LINKS || {}) : {}).filter(x => x && x.status === 'match').map(x => x.tipo + ':' + x.id));
  const cands = [];
  if (v < 0) {
    Object.keys(P_meses || {}).forEach(wk => { const mesNS = C_ymFromWen(wk); if (!meses.has(mesNS)) return;
      (P_meses[wk] || []).forEach(r => {
        if (!r || r.previa || r.conciliadoMov || ligados.has('pagar:' + r.id)) return;   // automático: só conta paga inteira e ainda não ligada
        const pago = String(r.status).toUpperCase() === 'PAGO' || (Number(r.valorPago) || 0) >= (Number(r.valor) || 0) - 0.005;
        if (!pago || Math.abs(BC_debitoLancamento(r) - abs) >= 0.02) return;
        if (r.contaBancariaId && r.contaBancariaId !== contaId) return;   // paga por outra conta: não é este movimento
        cands.push({ tipo: 'pagar', id: r.id, mes: wk, nome: r.nome || 'conta', data: r.dataPagamento || '', comBaixa: (BC_MOVS || []).some(m => m.id === 'mov_pagar_' + r.id && !m.estornada && m.contaId === contaId) });
      }); });
  } else {
    (typeof R_todosOsDados !== 'undefined' ? (R_todosOsDados || []) : []).forEach(r => {
      if (!r) return;
      // recebido (inteiro ou em parte): casa com o que ainda falta ligar ao extrato
      const rec = typeof CX_valorLigado === 'function' ? Math.round(((Number(r.valorReserva) || 0) - CX_valorLigado('receber', r.id, Number(r.valorReserva) || 0)) * 100) / 100 : (Number(r.valorReserva) || 0);
      if (!(rec > 0.005) || Math.abs(rec - abs) >= 0.02) return;
      const mesNS = r.mes ? C_ymFromWen(r.mes) : ''; if (mesNS && !meses.has(mesNS)) return;
      cands.push({ tipo: 'receber', id: r.id, mes: r.mes || '', nome: r.cliente || r.desc || 'recebimento', data: '' });
    });
  }
  return cands.length === 1 ? cands[0] : null;   // dúvida (dois iguais) fica para você decidir na revisão
}
// Na confirmação do extrato: liga o movimento recém-criado ao que já está no sistema, sem lançar de novo.
async function OF_vincularJaNoApp(mov, ja) {
  if (!mov || !ja) return false;
  if (ja.tipo === 'pagar' && ja.comBaixa) return OF_ligarMov('mov_pagar_' + ja.id, mov.id, { semConfirmar: true, semRender: true });   // a baixa já debitou: tira a duplicidade
  const chave = 'conc_' + mov.id;
  const a = ja.tipo === 'pagar' ? OF_achaPagar(ja.id) : null;
  const link = { chave, status: 'match', tipo: ja.tipo, id: ja.id, mes: ja.mes || '', movId: mov.id, label: ja.nome || '', jaNoApp: true, valorBaixa: 0, valorLigado: Math.round(Math.abs(Number(mov.valor) || 0) * 100) / 100, parcial: false, ts: new Date().toISOString() };
  if (a) { link.statusAntes = a.r.status; link.valorPagoAntes = Number(a.r.valorPago) || 0; }
  CONC_LINKS[chave] = link; await CC_fbSalvar(CONC_COL, chave, link);
  if (ja.tipo === 'pagar') { mov.conciliadoPagar = ja.id; if (a && !ja.parcial) { a.r.conciliadoMov = mov.id; P_salvarStorage(); } }
  else mov.conciliadoReceber = ja.id;   // Receber intocável: o vínculo mora só em banco_conciliados
  await BC_fbUpsert(BC_COL_MOV, mov.id, mov);
  return true;
}
