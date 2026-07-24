// 🔥 Teste de fumaça do WEN — abre o app num navegador headless e confere que TUDO carregou.
// Espelha o test/smoke.mjs do Nossa Semente. Pega o tipo de bug que não aparece em teste de
// unidade: um erro de sintaxe ou de ordem de carregamento que mata o script inteiro em silêncio
// (o app abre, mas metade dos botões não faz nada).
//
//   node test/smoke.mjs                          (usa o app em produção)
//   node test/smoke.mjs http://localhost:8877/index.html?mock   (ou outra URL)
//
// Dependência: o `playwright` mora em Documents/node_modules (o Node sobe os diretórios até
// achar). Se der ERR_MODULE_NOT_FOUND, rode a partir da pasta do projeto — de /tmp não resolve.
// Instalar o navegador uma vez:  npx playwright install chromium
import { chromium } from 'playwright';

// Sempre com ?mock: o teste NÃO pode tocar no Firebase real (ver a lição do incidente do
// perfil do casal — abrir o app contra a base real loga e grava de verdade).
const URL = process.argv[2] || 'https://willianwiab.github.io/wenfinanceiro/index.html?mock';

// Uma função por módulo — se o script quebrar no carregamento, elas somem todas juntas.
// Cobre os dois arquivos externos (js/banco.js → BC_/CONC_, js/concil.js → CX_) e o index.
const FUNCOES = [
  'P_abrirModalBaixa', 'P_atualizarNavMes',            // Pagar
  'R_abrirModal', 'R_aplicarRecorrente',               // Receber
  'BC_abrirModal', 'BC_saldoConta', 'BC_renderPainel', // Contas bancárias   (js/banco.js)
  'CONC_conciliar', 'CONC_candidatosDe',               // Motor de conciliação (js/banco.js)
  'CX_abrir', 'CX_aceitarSugestao', 'CX_ajustarBaixa', // Trazer extrato     (js/concil.js)
  'CX_arquivoPdf', 'CX_arquivoFoto', 'CX_ofxArquivo',  // as 4 formas de importar
  'CX_conciliarLote', 'CX_ignorarMov', 'CX_setBusca', 'CX_setFoco',
  'CC_abrirModalCartao', 'CC_fbSalvar',                // Cartão
  'IMP_abrir', 'IMP_categorizarIA',                    // Importação antiga (rede de segurança)
  'SOPHIA_abrir', 'SOPHIA_insights',                   // SophIA
  'REL_gerarHTML',                                     // Relatórios
  'IA_gerarConteudo', 'IA_getKey',                     // Motor de IA (PDF/foto dependem dele)
];

const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + ((e && e.message) || e)));
page.on('console', m => { if (m.type() === 'error') erros.push('console.error: ' + m.text()); });

console.log('🔥 Abrindo', URL, '…');
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(3500);   // deixa os scripts externos terminarem
} catch (e) {
  console.error('❌ Não consegui abrir a página:', e.message);
  await browser.close();
  process.exit(1);
}

const faltando = await page.evaluate(fns => fns.filter(f => typeof window[f] !== 'function'), FUNCOES);

// Confere também que os 3 marcadores de versão chegaram iguais ao navegador — é o que faz o
// auto-atualizador funcionar. Se divergirem, o usuário fica preso numa versão velha.
const versao = await page.evaluate(async () => {
  const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(x => x.ok ? x.json() : null).catch(() => null);
  const tags = [...document.querySelectorAll('script[src^="js/"]')].map(s => s.getAttribute('src'));
  return { app: window.APP_VERSION, json: r && r.v, tags };
});
await browser.close();

let ok = true;
if (faltando.length) { console.error('❌ Funções que NÃO carregaram (algum script quebrou):', faltando); ok = false; }
if (erros.length) { console.error('❌ Erros de execução no console/página:\n  - ' + erros.join('\n  - ')); ok = false; }
if (!versao.app || versao.app !== versao.json) {
  console.error('❌ Selo de versão divergente no ar — APP_VERSION=' + versao.app + ' × version.json=' + versao.json + '\n   (o auto-atualizador não vai disparar; rode: node bin/selar-versao.mjs)');
  ok = false;
}
const semV = versao.tags.filter(t => !/\?v=/.test(t));
if (semV.length) { console.error('❌ script local sem ?v= (o Pages serve do cache por 10 min):', semV); ok = false; }

if (ok) {
  console.log(`✅ Teste de fumaça PASSOU — ${FUNCOES.length} funções carregadas, 0 erros, selo ${versao.app}. O app está saudável.`);
  console.log('   scripts: ' + versao.tags.join('  '));
  process.exit(0);
}
console.error('\n🚨 Teste de fumaça FALHOU — NÃO publique este build.');
process.exit(1);
