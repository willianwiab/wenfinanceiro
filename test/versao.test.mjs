// Rede de segurança do selo de versão. O pre-commit já sela sozinho, mas o hook mora
// na configuração local (core.hooksPath) — num clone novo ele não está ligado. Este teste
// falha se os 3 marcadores saírem de sincronia, então a dessincronia nunca chega calada
// na produção.
//
// Rodar:  node test/versao.test.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (d, c) => c ? pass++ : (fail++, console.log('FALHOU: ' + d));

// 1) os 3 marcadores estão em dia com o conteúdo?
let saida = '', sincronizado = true;
try { saida = execFileSync('node', ['bin/selar-versao.mjs', '--conferir'], { cwd: RAIZ, encoding: 'utf8' }); }
catch (e) { sincronizado = false; saida = (e.stdout || '') + (e.stderr || ''); }
ok('versão selada e em dia com o conteúdo\n  ' + saida.trim().split('\n').join('\n  '), sincronizado);

// 2) APP_VERSION do index e version.json apontam pro MESMO selo
const html = fs.readFileSync(RAIZ + 'index.html', 'utf8');
const noIndex = (html.match(/APP_VERSION\s*=\s*'([^']*)'/) || [])[1];
const noJson = JSON.parse(fs.readFileSync(RAIZ + 'version.json', 'utf8')).v;
ok('APP_VERSION (' + noIndex + ') == version.json (' + noJson + ')', noIndex && noIndex === noJson);

// 3) todo <script src="js/…"> local carrega com ?v= (senão o Pages serve do cache por 10 min)
const semVersao = [...html.matchAll(/src="(js\/[A-Za-z0-9_.-]+\.js)(\?v=[^"]*)?"/g)].filter(m => !m[2]).map(m => m[1]);
ok('todo js local tem ?v=' + (semVersao.length ? ' — sem versão: ' + semVersao.join(', ') : ''), semVersao.length === 0);

// 4) o ?v= de cada js bate com o hash do arquivo (não é número chutado)
const crypto = await import('node:crypto');
const h = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 8);
[...html.matchAll(/src="(js\/[A-Za-z0-9_.-]+\.js)\?v=([^"]*)"/g)].forEach(m => {
  const real = h(fs.readFileSync(RAIZ + m[1], 'utf8'));
  ok(m[1] + ' → ?v= confere com o conteúdo (' + m[2] + ')', m[2] === real);
});

console.log('\n' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
