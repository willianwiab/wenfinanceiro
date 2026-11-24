#!/usr/bin/env node
// Monta e publica o WEN Fiscal (tela da Natália) num projeto Vercel SEPARADO:
// https://wen-fiscal.vercel.app — 24/11, pedido do Will: "não quero que seja vinculado
// ao financeiro". Lá só existe a tela dela; nenhum arquivo do financeiro é servido.
//
// A fonte continua aqui (administrativo.html, js/administrativo.js, js/fechamentos.js,
// manual.html), testada junto com o resto. Este script só copia o necessário.
//
//   node bin/selar-versao.mjs && node bin/publicar-fiscal.mjs          monta e publica
//   node bin/publicar-fiscal.mjs --so-montar                          só monta a pasta
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.resolve(RAIZ, '../wen-fiscal');
const ARQUIVOS = {
  'index.html': 'administrativo.html',
  'manual.html': 'manual.html',
  'js/administrativo.js': 'js/administrativo.js',
  'js/fechamentos.js': 'js/fechamentos.js',
  'assets/logo-wen.png': 'assets/logo-wen.png',
  'assets/favicon-32.png': 'assets/favicon-32.png',
  'assets/apple-touch-icon.png': 'assets/apple-touch-icon.png',
};

// limpa tudo menos o vínculo com a Vercel
fs.mkdirSync(DESTINO, { recursive: true });
for (const n of fs.readdirSync(DESTINO)) if (n !== '.vercel') fs.rmSync(path.join(DESTINO, n), { recursive: true, force: true });
for (const [dst, src] of Object.entries(ARQUIVOS)) {
  fs.mkdirSync(path.dirname(path.join(DESTINO, dst)), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, src), path.join(DESTINO, dst));
}
fs.writeFileSync(path.join(DESTINO, 'vercel.json'), JSON.stringify({
  headers: [{ source: '/(.*)', headers: [
    { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
  ] }],
}, null, 2));

// trava: nada do financeiro pode ir junto
const html = fs.readFileSync(path.join(DESTINO, 'index.html'), 'utf8');
const proibidos = ['R_todosOsDados', 'P_meses', 'CONC_', 'fechamentos-admin.js', 'concil.js'];
const vazou = proibidos.filter(p => html.includes(p));
const extras = fs.readdirSync(path.join(DESTINO, 'js')).filter(f => !['administrativo.js', 'fechamentos.js'].includes(f));
if (vazou.length || extras.length) { console.error('❌ arquivo do financeiro na pasta do fiscal:', vazou, extras); process.exit(1); }
for (const m of html.matchAll(/(?:src|href)="(js\/[^"?]+|assets\/[^"?]+|[a-z-]+\.html)/g))
  if (!fs.existsSync(path.join(DESTINO, m[1]))) { console.error('❌ referência quebrada:', m[1]); process.exit(1); }

console.log('montado em', DESTINO);
if (process.argv.includes('--so-montar')) process.exit(0);
execSync('npx vercel deploy --prod --yes', { cwd: DESTINO, stdio: 'inherit' });
