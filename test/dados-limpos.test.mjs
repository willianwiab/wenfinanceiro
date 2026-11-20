// Três defeitos que apareceram juntos em 20/11, todos com a mesma raiz: dado sujo
// entrando no Receber.
//   1. "PRÉ RESERVA WEN PRODUTORA ESTUDIO B - DANNY UEDA" virou outro cliente
//   2. pré-reserva ia parar na cobrança da Natália
//   3. a diária de 12/11 do Danny estava lançada DUAS vezes
//
// Rodar:  node test/dados-limpos.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../js/clientes-fiscais.js');

// ── a regra pura, sem navegador ───────────────────────────────────────────
assert.equal(C.CFI_nucleoNome('PRÉ RESERVA WEN PRODUTORA ESTUDIO B - DANNY UEDA'),'danny ueda');
assert.equal(C.CFI_nucleoNome('Danny Ueda'),'danny ueda','acento e caixa não contam');
assert.equal(C.CFI_nucleoNome('GRAVAÇÃO PODCAST BIOLAB 3H'),'biolab','tira ruído e as horas');
assert.equal(C.CFI_nucleoNome(''),'');assert.equal(C.CFI_nucleoNome(null),'');
assert.equal(C.CFI_nucleoNome('STUDIO B'),'','só ruído vira vazio');

const todos=['DANNY UEDA','CARTPANDA','SILVIA VINHAS'];
assert.deepEqual(C.CFI_parecidos('PRÉ RESERVA WEN PRODUTORA ESTUDIO B - DANNY UEDA',todos),['DANNY UEDA']);
assert.deepEqual(C.CFI_parecidos('DANNY UEDA',todos),[],'nome idêntico não é sugestão');
assert.deepEqual(C.CFI_parecidos('TOTALMENTE OUTRO',todos),[]);
assert.deepEqual(C.CFI_parecidos('',todos),[],'campo vazio não sugere nada');
assert.deepEqual(C.CFI_parecidos('IA',todos),[],'nome curto demais não arrisca palpite');
assert.deepEqual(C.CFI_parecidos('STUDIO B',todos),[],'só ruído não sugere nada');
assert.deepEqual(C.CFI_parecidos('x',['DANNY UEDA','DANNY UEDA']),[],'sem falso positivo');

// ── na tela ───────────────────────────────────────────────────────────────
const URL=process.argv[2];
if(!URL){console.log('✅ dados-limpos (só a parte pura — passe a URL para testar a tela)');process.exit(0);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
let confirmou=null;
page.on('dialog',d=>{confirmou=d.message();d.accept();});
try{
await page.goto(URL);await page.waitForTimeout(1500);
await page.evaluate(async()=>{
  await MOD_umaVez('clientes-fiscais',CFI_carregar);
  window.__salvo=null;window.R_fbSalvar=async d=>{window.__salvo=d;return d;};window.BC_fbUpsert=async()=>{};
  R_todosOsDados.push({id:'du1',cliente:'DANNY UEDA',mes:'NOV/2026',data:'12/11',horario:'12:00 as 18:00',
    horas:6,studio:'STUDIO A',valorTotal:3750,valorReserva:0,saldo:3750,desc:'x'});
  showMain('receber');R_abrirModal();
});
await page.waitForSelector('#rModalBg.open');

// 1) nome parecido avisa e oferece trocar
await page.fill('#rFCliente','PRÉ RESERVA WEN PRODUTORA ESTUDIO B - DANNY UEDA');
await page.waitForSelector('#rNomeAviso [data-nome]');
assert((await page.textContent('#rNomeAviso')).includes('DANNY UEDA'),'sugere o nome que já existe');
await page.click('#rNomeAviso [data-nome="DANNY UEDA"]');
await page.waitForFunction(()=>document.getElementById('rFCliente').value==='DANNY UEDA',null,{timeout:5000});
assert.equal(await page.inputValue('#rFCliente'),'DANNY UEDA','um clique corrige');
assert.equal(await page.locator('#rNomeAviso:visible').count(),0,'e o aviso some');

// 2) "não é faturável" esconde os padrões do cliente
assert.equal(await page.locator('#rPadraoCliente:visible').count(),1);
await page.check('#rFNaoFaturavel');
assert.equal(await page.locator('#rPadraoCliente:visible').count(),0,
  'não faturável não precisa de regra de nota nem de cobrança');
await page.uncheck('#rFNaoFaturavel');

// 3) duplicata no mesmo dia avisa antes de salvar
await page.selectOption('#rFDia','12');
await page.fill('#rFHorario','12:00 as 18:00');
await page.fill('#rFHoras','6');
await page.fill('#rFValorLocacao','3750');
await page.click('#rBtnSalvarModal');
await page.waitForFunction(()=>window.__salvo);
assert(confirmou&&confirmou.includes('Já existe lançamento'),'avisou da duplicata');
assert(confirmou.includes('DANNY UEDA'),'mostrando qual');

// e a flag vai junto no que foi salvo
const g=await page.evaluate(()=>window.__salvo);
assert.equal(g.naoFaturavel,false,'a flag viaja no lançamento');
assert.equal(g.cliente,'DANNY UEDA');

// lançamento antigo, sem a flag, abre sem quebrar
await page.evaluate(()=>R_abrirModal('du1'));
await page.waitForTimeout(300);
assert.equal(await page.isChecked('#rFNaoFaturavel'),false,'sem o campo, nasce desmarcado');

assert.deepEqual(erros,[]);
console.log('✅ dados-limpos: nome parecido, não faturável e duplicata — os três avisam a tempo');
}finally{await browser.close();}
