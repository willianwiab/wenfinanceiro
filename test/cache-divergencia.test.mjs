// Prova funcional das correções da auditoria 27/08 — roda 100% em ?mock=1.
import { chromium } from 'playwright';
const URL = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3000);

const r = await page.evaluate(async () => {
  const out = {};
  // ── 1. Ir DIRETO ao Fluxo, sem passar pela aba Contas ──
  const antes = Object.keys(BC_CONTAS).length;
  showMain('fluxo', document.querySelector('.nav-main button'));
  await new Promise(res => setTimeout(res, 2500)); // hidratação assíncrona
  out.fluxo = { contasAntes: antes, contasDepois: Object.keys(BC_CONTAS).length,
                cartoesDepois: (typeof C_faturas!=='undefined'&&Array.isArray(C_faturas))?'array':'?' };

  // ── 2. Pagar paginado: carregarDeSheetsP leu os meses do mock ──
  out.pagar = { hidratado: P_hidratado, nuvemConfiavel: P_nuvemConfiavel, meses: Object.keys(P_meses).length };

  // ── 3. Receber: marcador só avança com cache persistido + releitura diária ──
  out.receber = {
    lancs: R_todosOsDados.length,
    syncKey: !!localStorage.getItem('wen_lancamentos_last_sync'),
    fullKey: !!localStorage.getItem('wen_lancamentos_last_full'),
  };
  // simula quota estourada: R_salvarCacheLocal deve devolver false e o marcador ser apagado
  const setReal = Storage.prototype.setItem;
  Storage.prototype.setItem = function(k,v){ if(k==='wen_lancamentos_cache') throw new DOMException('QuotaExceededError'); return setReal.apply(this,arguments); };
  await R_carregarTodos(true);
  Storage.prototype.setItem = setReal;
  out.receberQuota = {
    salvarDevolveFalse: R_salvarCacheLocal.toString().includes('return false'),
    marcadorApagado: !localStorage.getItem('wen_lancamentos_last_sync'),
    fullApagado: !localStorage.getItem('wen_lancamentos_last_full'),
  };
  // e na volta da quota, tudo se recompõe
  await R_carregarTodos(true);
  out.receberCura = { syncKeyVoltou: !!localStorage.getItem('wen_lancamentos_last_sync'),
                      fullKeyVoltou: !!localStorage.getItem('wen_lancamentos_last_full') };

  // ── 4. FB_gravar: PATCH recusado avisa em vez de fingir sucesso ──
  const fetchReal = window.fetch;
  window.fetch = () => Promise.resolve({ ok:false, status:429 });
  const res429 = await FB_gravar('http://x/patch', {method:'PATCH'}, 'Teste');
  window.fetch = fetchReal;
  out.fbGravar = { devolveNullEm429: res429===null, existeHelper: typeof FB_gravar==='function' };
  return out;
});
await browser.close();

let falhas = 0;
const ok = (cond, msg) => { console.log((cond?'✅':'❌')+' '+msg); if(!cond) falhas++; };
ok(erros.length===0, 'sem erros de página ('+erros.length+')');
ok(r.fluxo.contasDepois>0, `Fluxo direto hidrata contas da nuvem (antes=${r.fluxo.contasAntes} depois=${r.fluxo.contasDepois})`);
ok(r.pagar.hidratado && r.pagar.nuvemConfiavel && r.pagar.meses>0, `Pagar paginado hidratou (${r.pagar.meses} meses, confiável=${r.pagar.nuvemConfiavel})`);
ok(r.receber.lancs>0 && r.receber.syncKey && r.receber.fullKey, `Receber carregou (${r.receber.lancs} lançs) e gravou marcador + full`);
ok(r.receberQuota.marcadorApagado && r.receberQuota.fullApagado, 'quota estourada → marcador APAGADO (próximo sync vem completo)');
ok(r.receberCura.syncKeyVoltou && r.receberCura.fullKeyVoltou, 'quota voltou → marcadores se recompõem sozinhos');
ok(r.fbGravar.devolveNullEm429, 'FB_gravar detecta 429 e devolve null (não finge sucesso)');
if(erros.length) console.log(erros.join('\n'));
process.exit(falhas?1:0);
