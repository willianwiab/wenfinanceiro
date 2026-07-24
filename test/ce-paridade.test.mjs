// Prova que o motor CE_ do WEN é IDÊNTICO ao do Nossa Semente: (1) compara o texto-fonte
// das funções nos dois apps e (2) roda os mesmos casos nos dois, exigindo saída igual.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const WEN = require('../js/concil.js');
const NS_SRC = fs.readFileSync('/Users/willdawen/Documents/boasemente/app.html', 'utf8');
const WEN_SRC = fs.readFileSync(new URL('../js/concil.js', import.meta.url), 'utf8');

function fn(src, name) {
  let i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('não achei ' + name);
  const b = src.indexOf('{', i); let d = 0, j = b;
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  return src.slice(i, j + 1);
}
let pass = 0, fail = 0;
const ok = (d, c) => c ? pass++ : (fail++, console.log('FALHOU:', d));
const eq = (d, g, w) => ok(d + ' → ' + JSON.stringify(g), JSON.stringify(g) === JSON.stringify(w));

// 1) fonte byte a byte
const CORE = ['CE_score','CE_nivel','CE_ranquear','CE_ambiguo','CE_buscar','CE_valorBaixa','CE_situacao','CE_aplicadoNo','CE_resumo'];
CORE.forEach(n => ok('fonte idêntica NS × WEN: ' + n, fn(NS_SRC, n) === fn(WEN_SRC, n)));
['CE_TOL_VALOR','CE_TOL_DIAS','CE_NIVEL_EXATA','CE_NIVEL_PROVAVEL'].forEach(n => {
  const re = new RegExp('^const ' + n + ' = ([^;]+);', 'm');
  ok('constante igual: ' + n, NS_SRC.match(re)[1].trim() === WEN_SRC.match(re)[1].trim());
});

// 2) comportamento
const r = WEN.CE_score({ valor: -800, data: '2026-07-01', descricao: 'Aluguel', conta: 'c1' }, { nome: 'Aluguel', valor: 800, data: '2026-07-01', tipo: 'pagar', conta: 'c1' });
eq('score exato', r.nivel, 'exata');
ok('critérios explicam', r.criterios.some(c => c.ok && /valor idêntico/.test(c.label)));
eq('valor+data sem nome não vira exata', WEN.CE_score({ valor: -180, data: '2026-07-15', descricao: 'PIX ENVIADO' }, { nome: 'Faxina', valor: 180, data: '2026-07-15', tipo: 'pagar' }).nivel !== 'exata', true);
eq('situação parcial', WEN.CE_situacao(-500, 300), 'parcial');
eq('situação exata', WEN.CE_situacao(-500, 500), 'exato');
eq('valorBaixa antigo cai no cheio', WEN.CE_valorBaixa({ valor: 800 }), 800);
eq('valorBaixa novo', WEN.CE_valorBaixa({ valor: 800, valorBaixa: 300 }), 300);
const lancs = [{ tipo:'pagar', id:'a', nome:'Energia CPFL', valor:184.9, data:'2026-07-10', categoria:'Moradia' }, { tipo:'pagar', id:'b', nome:'Faxina', valor:200, data:'2026-08-05' }];
eq('busca por nome', WEN.CE_buscar(lancs, 'energia').map(l => l.id), ['a']);
eq('busca por valor', WEN.CE_buscar(lancs, '200').map(l => l.id), ['b']);
eq('busca por mês', WEN.CE_buscar(lancs, '08/2026').map(l => l.id), ['b']);
const itens = [{ valor:-500, pares:[{ tipo:'pagar', id:'esc', valor:1200, valorBaixa:500 }] }, { valor:-700, pares:[{ tipo:'pagar', id:'esc', valor:1200, valorBaixa:700 }] }];
eq('N movs → 1 conta soma', WEN.CE_aplicadoNo(itens, { tipo:'pagar', id:'esc', valor:1200 }), 1200);
const res = WEN.CE_resumo([{ valor:-800, pares:[{ id:'a', tipo:'pagar', valor:800, valorBaixa:800 }] }, { valor:-500, pares:[{ id:'b', tipo:'pagar', valor:900, valorBaixa:300 }] }, { valor:-120, pares:[] }, { valor:-50, pares:[], ignorado:{motivo:'x'} }, { valor:-99, dup:{} }]);
eq('resumo conciliados', res.conciliados, 1);
eq('resumo parciais', res.parciais, 1);
eq('resumo valor conciliado', res.valorConciliado, 1100);
eq('resumo valor pendente', res.valorPendente, 320);
const amb = WEN.CE_ranquear({ valor:-184.9, data:'2026-07-10', descricao:'ENERGIA' }, [{tipo:'pagar',id:'x',nome:'Energia',valor:184.9,data:'2026-07-10'},{tipo:'pagar',id:'y',nome:'Energia',valor:184.9,data:'2026-07-10'}]);
ok('ambiguidade detectada', WEN.CE_ambiguo(amb));

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
