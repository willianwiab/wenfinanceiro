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
let OF_cfg = { cartoes: {}, pessoais: {}, contas: {} }, OF_cfgCarregado = false, OF_contas = null, OF_ocupado = false;

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
    if (res.ok) { const j = await res.json(); const f = j.fields || {}; const o = {}; Object.keys(f).forEach(k => o[k] = fromFV(f[k])); OF_cfg = { cartoes: o.cartoes || {}, pessoais: o.pessoais || {}, contas: o.contas || {} }; }
  } catch (e) { /* sem rede: segue sem vínculos */ }
  OF_cfgCarregado = true;
  return OF_cfg;
}
async function OF_salvarCfg() { await BC_fbUpsert('open_finance', 'config', { cartoes: OF_cfg.cartoes || {}, pessoais: OF_cfg.pessoais || {}, contas: OF_cfg.contas || {} }); }
// Chamado pelo C_ativar: carrega os vínculos e redesenha os cartões.
async function OF_iniciar() {
  OF_garantirCategoria();
  if (!OF_cfgCarregado) { await OF_carregarCfg(); try { C_renderCartoes(); } catch (e) {} }
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
function OF_modal(html) {
  let m = document.getElementById('ofModal');
  if (!m) { m = document.createElement('div'); m.id = 'ofModal'; m.className = 'modal-bg'; m.onclick = e => { if (e.target === m) OF_fechar(); }; document.body.appendChild(m); }
  m.innerHTML = `<div class="modal" style="max-width:480px">${html}</div>`;
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
