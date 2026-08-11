import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz=fileURLToPath(new URL('..',import.meta.url));
const html=fs.readFileSync(raiz+'/index.html','utf8');
const banco=fs.readFileSync(raiz+'/js/banco.js','utf8');

test('inicialização não dispara módulos auxiliares do Firestore',()=>{
  const cauda=html.slice(html.lastIndexOf('MOD_prepararCachesLocais();'));
  for(const chamada of ['CAT_inicializar();','BC_inicializar();','CC_inicializar();','CF_inicializar();','FX_inicializar();','AUD_inicializar();','CONC_inicializar();','IA_carregarChave();']){
    assert.equal(cauda.includes(chamada),false,'chamada automática encontrada: '+chamada);
  }
  assert.match(cauda,/MOD_prepararCachesLocais\(\);\s*init\(\);/);
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

test('conciliação bancária não carrega duas vezes ao iniciar a página',()=>{
  assert.doesNotMatch(banco,/Promise\.all\(\[BK_carregarConciliados\(\),\s*BK_carregarRegras\(\)\]\)/);
  assert.match(banco,/async function BK_inicializar\(conciliadosJaCarregados\)/);
  assert.match(banco,/if \(!conciliadosJaCarregados\) tarefas\.push\(BK_carregarConciliados\(\)\)/);
});

test('histórico bancário é carregado apenas sob demanda',()=>{
  assert.match(html,/function MOD_hidratarMain\(id\)/);
  assert.match(html,/id==='contas'\)MOD_contasCompleto\(\)/);
  const cauda=html.slice(html.lastIndexOf('MOD_prepararCachesLocais();'));
  assert.doesNotMatch(cauda,/BC_inicializarMovimentos\(\)/);
});
