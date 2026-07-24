#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// SELADOR DE VERSÃO — fonte única para os 3 marcadores que precisam andar juntos:
//
//   1. js/<arquivo>.js?v=…   → cache do navegador por arquivo
//   2. window.APP_VERSION    → o que o app acha que está rodando
//   3. version.json          → o que o auto-atualizador compara pra recarregar
//
// Todos passam a ser DERIVADOS DO CONTEÚDO. Não tem número pra lembrar de subir:
// mudou o arquivo, muda o hash. Não mudou, não muda nada (deploy não vira reload à toa).
//
//   node bin/selar-versao.mjs            sela (reescreve os arquivos)
//   node bin/selar-versao.mjs --conferir  só confere; sai 1 se estiver dessincronizado
//
// Roda sozinho no pre-commit (.githooks/pre-commit). O test/versao.test.mjs é a rede
// de segurança pra quando o hook não estiver instalado (clone novo, por exemplo).
// ══════════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(RAIZ, 'index.html');
const VERSION_JSON = path.join(RAIZ, 'version.json');
const conferir = process.argv.includes('--conferir');

const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);

// Normaliza o index pro hash global: mascara os próprios campos de versão, senão
// selar mudaria o hash que gerou o selo (o gato correndo atrás do rabo).
const normalizar = html => html
  .replace(/APP_VERSION\s*=\s*'[^']*'/g, "APP_VERSION='@'")
  .replace(/(js\/[A-Za-z0-9_.-]+\.js)\?v=[^"']*/g, '$1?v=@');

function selar() {
  let html = fs.readFileSync(INDEX, 'utf8');
  const original = html;

  // 1) cada <script src="js/X.js?v=…"> recebe o hash DO PRÓPRIO ARQUIVO
  const jsUsados = [];
  html = html.replace(/(src=")(js\/[A-Za-z0-9_.-]+\.js)(\?v=[^"]*)?(")/g, (m, a, rel, _q, z) => {
    const abs = path.join(RAIZ, rel);
    if (!fs.existsSync(abs)) { console.warn('  ⚠️  referenciado mas não existe: ' + rel); return m; }
    const h = hash(fs.readFileSync(abs, 'utf8'));
    jsUsados.push({ rel, h });
    return a + rel + '?v=' + h + z;
  });

  // 2) selo global = data + hash de (index normalizado + todos os js)
  const material = normalizar(html) + jsUsados.map(j => j.rel + ':' + j.h).join('|');
  const selo = new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + hash(material);

  // 3) APP_VERSION e version.json recebem o selo
  html = html.replace(/APP_VERSION\s*=\s*'[^']*'/, "APP_VERSION='" + selo + "'");
  const jsonNovo = JSON.stringify({ v: selo }) + '\n';
  const jsonAtual = fs.existsSync(VERSION_JSON) ? fs.readFileSync(VERSION_JSON, 'utf8') : '';

  // O selo só muda quando o CONTEÚDO muda: se a única diferença for a data, mantém o selo antigo.
  const seloAtual = (original.match(/APP_VERSION\s*=\s*'([^']*)'/) || [])[1] || '';
  const mesmoConteudo = seloAtual.split('-')[1] === selo.split('-')[1];
  const seloFinal = mesmoConteudo ? seloAtual : selo;
  if (mesmoConteudo) {
    html = html.replace(/APP_VERSION\s*=\s*'[^']*'/, "APP_VERSION='" + seloAtual + "'");
  }
  const jsonFinal = JSON.stringify({ v: seloFinal }) + '\n';

  const mudou = (html !== original) || (jsonFinal !== jsonAtual);
  return { html, jsonFinal, mudou, selo: seloFinal, jsUsados, original, jsonAtual };
}

const r = selar();

if (conferir) {
  if (r.mudou) {
    console.error('❌ versão dessincronizada — rode: node bin/selar-versao.mjs');
    if (r.html !== r.original) console.error('   index.html: tags ?v= e/ou APP_VERSION desatualizados');
    if (r.jsonFinal !== r.jsonAtual) console.error('   version.json: ' + JSON.stringify(r.jsonAtual.trim()) + ' → ' + JSON.stringify(r.jsonFinal.trim()));
    process.exit(1);
  }
  console.log('✅ versão em dia — selo ' + r.selo);
  r.jsUsados.forEach(j => console.log('   ' + j.rel + '?v=' + j.h));
  process.exit(0);
}

if (!r.mudou) { console.log('✅ nada a selar — já está em dia (selo ' + r.selo + ')'); process.exit(0); }
fs.writeFileSync(INDEX, r.html);
fs.writeFileSync(VERSION_JSON, r.jsonFinal);
console.log('🔒 selado: ' + r.selo);
r.jsUsados.forEach(j => console.log('   ' + j.rel + '?v=' + j.h));
