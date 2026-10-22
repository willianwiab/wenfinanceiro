// Open Finance no WEN — Fase 1 (22/10/2026): cartão PESSOAL do Will.
// A fatura não vira conta do studio; o que é do studio vira "🔁 Reembolsar Will"; "🙋 Pessoal do Will" fica
// fora do rateio; pagamento já feito do reembolso é preservado; o OFX gerado passa pelo parser real do WEN.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const IDX = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const OF = fs.readFileSync(new URL('../js/openfinance.js', import.meta.url), 'utf8');
function extrai(nome) { const i = IDX.indexOf('function ' + nome + '('); if (i < 0) throw new Error(nome); let d = 0, j = IDX.indexOf('{', i); for (; j < IDX.length; j++) { if (IDX[j] === '{') d++; else if (IDX[j] === '}') { d--; if (!d) break; } } return IDX.slice(i, j + 1); }
let ok = 0; const t = (n, f) => { f(); ok++; console.log('  ✓ ' + n); };

const amb = { P_meses: {}, salvos: 0 };
const api = new Function('amb', `
  let P_meses = amb.P_meses; const CATS_P = {}; const window = {};
  function P_salvarStorage(){ amb.salvos++; }
  function C_ymToWen(ym){ const [a,m]=ym.split('-'); return ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'][+m-1]+'/'+a; }
  function C_ymFromWen(k){ const [m,a]=k.split('/'); return a+'-'+String(['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'].indexOf(m)+1).padStart(2,'0'); }
  let C_faturas = amb.faturas || [];
  function C_liveCartoes(){ return []; } function C_parcelasDaPrevia(){ return []; }
  ${OF}
  ${extrai('C_itensCartaoMesWen')}
  return { OF_lancarReembolso, OF_valorStudio, OF_ofx, OF_ehCatPessoal, OF_garantirCategoria, CATS_P, C_itensCartaoMesWen,
    setCfg: c => { OF_cfg = c; }, setFaturas: f => { C_faturas = f; }, P: () => P_meses };
`)(amb);

const fatura = { id: 'nu_2026-10', cartaoId: 'nu', mesFatura: '2026-10', totalItens: 1300, itens: [
  { fitid: 'a', descricao: 'Adobe', valor: 300, categoria: 'servicos' },
  { fitid: 'b', descricao: 'Mercado', valor: 900, categoria: 'fora_pessoal' },
  { fitid: 'c', descricao: 'Uber reunião', valor: 100, categoria: 'outros' } ] };
const cartao = { nome: 'Nubank', diaVencimento: 28 };

t('reembolso = só o que é do studio (Pessoal do Will fica de fora)', () => {
  assert.equal(api.OF_valorStudio(fatura), 400);
  api.OF_lancarReembolso(fatura, cartao);
  const cs = api.P()['OUT/2026']; assert.equal(cs.length, 1);
  assert.equal(cs[0].nome, '🔁 Reembolsar Will · Nubank · OUT/2026'); assert.equal(cs[0].valor, 400); assert.equal(cs[0].status, 'PENDENTE');
  assert.ok(cs[0].faturaCartao && cs[0].faturaCartao.reembolso, 'marcada como conta de fatura: o rateio não soma de novo');
});
t('reimportar preserva o reembolso já pago e não duplica', () => {
  const c = api.P()['OUT/2026'][0]; c.valorPago = 400; c.status = 'PAGO'; c.dataPagamento = '2026-10-29';
  api.OF_lancarReembolso(fatura, cartao);
  const cs = api.P()['OUT/2026']; assert.equal(cs.length, 1); assert.equal(cs[0].valorPago, 400); assert.equal(cs[0].status, 'PAGO');
});
t('fatura toda pessoal e nada pago: não cria reembolso', () => {
  api.P()['NOV/2026'] = [];
  api.OF_lancarReembolso({ id: 'nu_2026-11', cartaoId: 'nu', mesFatura: '2026-11', itens: [{ fitid: 'x', valor: 50, categoria: 'fora_pessoal' }] }, cartao);
  assert.equal(api.P()['NOV/2026'].length, 0);
});
t('rateio do WEN (C_itensCartaoMesWen) não vê o "Pessoal do Will"', () => {
  api.setFaturas([fatura]);
  const itens = api.C_itensCartaoMesWen('OUT/2026');
  assert.deepEqual(itens.map(i => i.desc), ['Adobe', 'Uber reunião']);
});
t('categoria nova separada da "Pessoal" (equipe) que já existe', () => {
  api.OF_garantirCategoria(); assert.equal(api.CATS_P.fora_pessoal.label, 'Pessoal do Will (fora do WEN)');
  assert.ok(/pessoal:\{label:'Pessoal'/.test(IDX), 'a "Pessoal" de equipe continua como estava');
});
t('OFX gerado do banco: compra DEBIT, estorno CREDIT, pagamento PAYMENT, parcela no memo', () => {
  const ofx = api.OF_ofx([{ fitid: '1', data: '2026-10-02', descricao: 'ADOBE', valor: 300, tipo: 'DEBIT' },
    { fitid: '2', data: '2026-10-05', descricao: 'ESTORNO', valor: -20, tipo: 'CREDIT' },
    { fitid: '3', data: '2026-10-09', descricao: 'Pagamento recebido', valor: -500, pagamento: true },
    { fitid: '4', data: '2026-10-10', descricao: 'LOJA', valor: 50, tipo: 'DEBIT', parcela: { atual: 2, total: 3 } }], 330);
  assert.match(ofx, /<TRNTYPE>DEBIT<DTPOSTED>20261002<TRNAMT>300\.00<FITID>PLG1<NAME>ADOBE/);
  assert.match(ofx, /<TRNTYPE>CREDIT/); assert.match(ofx, /<TRNTYPE>PAYMENT/); assert.match(ofx, /<MEMO>LOJA parcela 2\/3/);
  assert.match(ofx, /<LEDGERBAL><BALAMT>330\.00/);
});
t('ligações no index.html do WEN (aditivas)', () => {
  assert.match(IDX, /if\(typeof OF_ehPessoal==='function'&&OF_ehPessoal\(fatura\.cartaoId\)\)\{OF_lancarReembolso\(fatura,cartao\);return;\}/);
  assert.match(IDX, /onclick="OF_trazerFatura\(\)">🏦 Trazer do banco \(Open Finance\)</);
  assert.match(IDX, /<script src="js\/openfinance\.js\?v=[0-9a-f]{8}"><\/script>/);
});
console.log(`\n✅ ${ok}/${ok} Open Finance no WEN (cartão pessoal → Reembolsar Will)\n`);
