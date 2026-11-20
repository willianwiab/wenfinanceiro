// Regras do importador de números reais, contra o BACKUP real (20/11/2026). Sem navegador, sem rede.
const NFR=require('../js/notas-reais.js'),fs=require('fs'),assert=require('assert');
const dir=process.argv[2]||'../../backups/fiscal-20261120';
const fech=JSON.parse(fs.readFileSync(dir+'/wen_fechamentos_administrativo_20261120.json'));
const fich=JSON.parse(fs.readFileSync(dir+'/wen_fichas_fiscais_20261120.json'));
const A=NFR.analisarFechamentos(fech,new Set()), by=Object.fromEntries(A.map(a=>[a.fech,a]));
// 9 marcados e prontos (Leaders 11 e Danny confirmados); 3 com aviso e desmarcados (IA 11, Oswaldo, Leaders 10); 3 para limpar
assert.strictEqual(A.filter(a=>a.tipo==='trocar'&&a.ok&&a.marca).length,9);
assert.strictEqual(A.filter(a=>a.tipo==='trocar'&&a.ok&&!a.marca).length,3);
assert.strictEqual(A.filter(a=>a.tipo==='limpar'&&a.ok).length,3);
assert.ok(A.every(a=>a.ok),'todo item do plano deveria existir no backup: '+JSON.stringify(A.filter(a=>!a.ok)));
// Danny Ueda: nota 1 (sinais) e 8 (saldos) nas diárias 12/11 e 13/11; a de 27/11 segue livre => fiscal 'pendente'
const d=by['m_dannyueda_2026-11']; assert.strictEqual(d.novo,'1, 8'); assert.strictEqual(d.notas[0].ids.length,2); assert.strictEqual(d.notas[1].ids.length,2); assert.strictEqual(d.statusFinal,'pendente'); assert.strictEqual(d.livres,1); assert.strictEqual(d.soma,7500);
assert.strictEqual(NFR.camposDe(d,'x').fiscalStatus,'pendente'); assert.strictEqual(NFR.camposDe(by['m_cartpanda_2026-10'],'x').fiscalStatus,'emitida');
// Avulso órfão: remove só se tudo bater
const rm=A.find(a=>a.tipo==='remover'); assert.ok(rm.ok&&rm.marca);
const idAv=fech[rm.fech].itens[0].id; assert.strictEqual(NFR.analisarFechamentos(fech,new Set([String(idAv)])).find(a=>a.tipo==='remover').ok,false,'se a diária ainda existe no Receber, não remove');
const f9=JSON.parse(JSON.stringify(fech)); f9[rm.fech].notasEmitidas=[{numero:'1'}]; assert.strictEqual(NFR.analisarFechamentos(f9,new Set()).find(a=>a.tipo==='remover').ok,false,'com nota, não remove');
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
assert.strictEqual(fb['DANNY UEDA'].acao,'preencher'); assert.strictEqual(fb['LEADERS BRIEF'].acao,'preencher'); assert.ok(!fb['GETRONICS']); assert.strictEqual(fb['PROA'].acao,'criar');
console.log('ok · fichas:',F.map(x=>x.nome+':'+x.acao).join(' '));
