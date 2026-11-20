// Regras do importador de números reais, contra o BACKUP real (20/11/2026). Sem navegador, sem rede.
const NFR=require('../js/notas-reais.js'),fs=require('fs'),assert=require('assert');
const dir=process.argv[2]||'../../backups/fiscal-20261120';
const fech=JSON.parse(fs.readFileSync(dir+'/wen_fechamentos_administrativo_20261120.json'));
const fich=JSON.parse(fs.readFileSync(dir+'/wen_fichas_fiscais_20261120.json'));
const A=NFR.analisarFechamentos(fech), by=Object.fromEntries(A.map(a=>[a.fech,a]));
// 7 marcados e prontos; 3 com aviso e desmarcados; 4 para limpar
assert.strictEqual(A.filter(a=>a.tipo==='trocar'&&a.ok&&a.marca).length,7);
assert.strictEqual(A.filter(a=>a.tipo==='trocar'&&a.ok&&!a.marca).length,3);
assert.strictEqual(A.filter(a=>a.tipo==='limpar'&&a.ok).length,4);
assert.ok(A.every(a=>a.ok),'todo item do plano deveria existir no backup: '+JSON.stringify(A.filter(a=>!a.ok)));
// Quintessa: 3 notas na mesma diária, soma = valor do fechamento
const q=by['m_quintessa_2026-10']; assert.strictEqual(q.novo,'420, 425, 6'); assert.strictEqual(q.soma,4800); assert.strictEqual(q.valorFech,4800);
assert.strictEqual(new Set(q.notas.flatMap(n=>n.ids)).size,1);
// Zest: cada nota na SUA diária (27/10 e 29/10), soma 14.800
const z=by['m_zest_2026-10']; assert.strictEqual(z.soma,14800); assert.notStrictEqual(z.notas[0].ids[0],z.notas[1].ids[0]);
// Cartpanda: 424 cobre as 4 diárias, soma 8.800
const c=by['m_cartpanda_2026-10']; assert.strictEqual(c.notas[0].ids.length,4); assert.strictEqual(c.soma,8800);
// Remer nov e Oswaldo: soma ≠ fechamento (aviso)
assert.notStrictEqual(by['m_iaondeissovaidar_2026-11'].soma,by['m_iaondeissovaidar_2026-11'].valorFech);
assert.notStrictEqual(by['m_oswaldocruz_2026-11'].soma,by['m_oswaldocruz_2026-11'].valorFech);
// trava: se o número atual NÃO for o falso esperado, não mexe
const f2=JSON.parse(JSON.stringify(fech)); f2['m_cartpanda_2026-10'].nfNumero='999';
assert.strictEqual(NFR.analisarFechamentos(f2).find(a=>a.fech==='m_cartpanda_2026-10').ok,false);
// idempotência: depois de aplicar, a 2ª análise diz "já tem"
const f3=JSON.parse(JSON.stringify(fech)); Object.assign(f3['m_cartpanda_2026-10'],NFR.camposDe(by['m_cartpanda_2026-10'],'2026-11-20T00:00:00Z'));
assert.strictEqual(NFR.analisarFechamentos(f3).find(a=>a.fech==='m_cartpanda_2026-10').motivo,'já tem as notas reais');
// campos do PATCH: só estes
assert.deepStrictEqual(Object.keys(NFR.camposDe(by['m_makeone_2026-11'],'x')).sort(),['atualizadoEm','fiscalStatus','nfData','nfNumero','notasEmitidas']);
assert.strictEqual(NFR.camposDe(by['m_nube_2026-11'],'x').fiscalStatus,'pendente');
// fichas: 15 clientes, nenhum conflito, DANNY UEDA existe e só preenche
const F=NFR.analisarFichas(fich), fb=Object.fromEntries(F.map(x=>[x.nome,x]));
assert.strictEqual(F.length,15); assert.strictEqual(F.filter(x=>x.acao==='conflito').length,0);
assert.strictEqual(fb['DANNY UEDA'].acao,'preencher'); assert.strictEqual(fb['GETRONICS'].acao,'criar'); assert.strictEqual(fb['PROA'].acao,'criar');
console.log('ok · fichas:',F.map(x=>x.nome+':'+x.acao).join(' '));
