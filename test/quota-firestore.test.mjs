import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz=fileURLToPath(new URL('..',import.meta.url));
const html=fs.readFileSync(raiz+'/index.html','utf8');

test('inicialização não dispara módulos auxiliares do Firestore',()=>{
  const ini=html.indexOf('async function init(){');
  const initBody=html.slice(ini,html.indexOf('// ── Lembrete de backup diário',ini));
  for(const chamada of ['CAT_inicializar();','BC_inicializar();','CC_inicializar();','CF_inicializar();','FX_inicializar();','AUD_inicializar();','CONC_inicializar();','IA_carregarChave();']){
    assert.equal(initBody.includes(chamada),false,'chamada automática encontrada: '+chamada);
  }
  // O arranque passa pelo porteiro de login (Fase 1); ao autenticar, AUTH_iniciarApp roda o boot enxuto.
  assert.match(html,/AUTH_appIniciado=true;\s*MOD_prepararCachesLocais\(\);\s*init\(\);/);
  assert.match(html,/AUTH_bootstrap\(\);/);
});

test('auditoria busca somente os 100 registros mais recentes',()=>{
  const inicio=html.indexOf('async function AUD_fbCarregarRecentes');
  const fim=html.indexOf('async function AUD_inicializar',inicio);
  const trecho=html.slice(inicio,fim);
  assert.match(trecho,/direction:'DESCENDING'/);
  assert.match(trecho,/limit:100/);
  assert.match(trecho,/:runQuery/);
});

test('falha de categorias não é tratada como coleção vazia',()=>{
  const inicio=html.indexOf('async function CAT_fbCarregarTodas');
  const fim=html.indexOf('function CAT_popularSelectP',inicio);
  const trecho=html.slice(inicio,fim);
  assert.match(trecho,/if\(!res\.ok\)throw new Error/);
  assert.match(trecho,/catch\(e\)\{console\.warn\('Categorias:',e\.message\);return false;\}/);
});

// O módulo BK_ (js/banco.js) foi aposentado em 08/10/2026: a tela que ele servia não existia
// mais e 684 das suas 762 linhas eram inalcançáveis. Só o selo 🔗 sobreviveu, virou
// CONC_seloConciliado no index.html. Esta guarda impede o fantasma de voltar junto com a
// leitura extra de banco_regras que ele fazia por sessão sem ninguém consumir.
test('o módulo BK_ saiu de vez — nenhum resíduo no index nem na pasta js',()=>{
  assert.equal(fs.existsSync(raiz+'/js/banco.js'),false,'js/banco.js voltou');
  assert.doesNotMatch(html,/BK_[A-Za-z]/,'sobrou referência a BK_ no index.html');
  assert.doesNotMatch(html,/src="js\/banco\.js/,'a tag do script voltou');
  // o selo passou a ler CONC_LINKS (ao vivo), não um espelho congelado no boot
  assert.match(html,/function CONC_seloConciliado\(tipo,id,mes\)/);
  assert.match(html,/Object\.values\(CONC_LINKS\)\.some/);
  assert.match(html,/MOD_conciliacao\(\)\{return MOD_umaVez\('conciliacao',CONC_inicializar\);\}/);
});

test('histórico bancário é carregado apenas sob demanda',()=>{
  assert.match(html,/function MOD_hidratarMain\(id\)/);
  assert.match(html,/id==='contas'\)\{MOD_contasCompleto\(\);MOD_conciliacao\(\);\}/);
  const ini=html.indexOf('async function init(){');
  const initBody=html.slice(ini,html.indexOf('// ── Lembrete de backup diário',ini));
  assert.doesNotMatch(initBody,/BC_inicializarMovimentos\(\)/);
  assert.doesNotMatch(initBody,/MOD_conciliacao\(\)/);
});

// Os links de conciliação alimentam DUAS telas (Conciliação e as marcas ✅/⏳ do extrato de
// cada conta). Têm que passar pela mesma tarefa MOD_umaVez, senão viram duas leituras.
test('links de conciliação são lidos uma vez só, por tarefa compartilhada',()=>{
  assert.match(html,/function MOD_conciliacao\(\)\{return MOD_umaVez\('conciliacao',/);
  assert.match(html,/id==='p-conciliacao'\)MOD_contasCompleto\(\)\.then\(MOD_conciliacao\)/);
  assert.strictEqual((html.match(/MOD_umaVez\('conciliacao'/g)||[]).length,1);
});
