// 24/11 — Will: a aba chama só "🧾 Fiscal" (sem "gravou, faz a nota") e a tela ganha uma
// caixa para pesquisar o cliente: pedaço do nome, sem acento, e abre os grupos escondidos.
// Rodar:  node test/pesquisa-cliente.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/pesquisa-cliente.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));
const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dia=n=>{const d=new Date(hoje+'T12:00:00');d.setDate(d.getDate()+n);return d;};
const it=(id,n)=>{const d=dia(n);return {id,data:String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'),
  mes:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),horario:'-',horas:4,studio:'STUDIO A',valor:1000,recebido:0,saldo:1000};};
const base={exigeNota:true,condicao:'avista',cobrancaStatus:'pendente',valor:1000,recebido:0,saldo:1000,vencimento:hoje,descricaoFiscal:'Serviço',descricaoCobranca:'Cobrança',fiscalStatus:'pendente',nfNumero:'',nfData:'',notasEmitidas:[]};
const nomes=()=>page.$$eval('#lista .nf-lin',l=>l.filter(x=>x.offsetParent!==null).map(x=>x.querySelector('.nf-nome').textContent.trim()));
try{
await page.goto(BASE+'/administrativo.html?mock=1');
await page.evaluate(c=>{localStorage.setItem('wen_mock_marcas',JSON.stringify(c));localStorage.setItem('wen_fiscal_visao','fiscal');localStorage.removeItem('wen_fiscal_fechados');},{
  demo:{...base,cliente:'Vitória Régia',itens:[it('a',-3)]},
  demo2:{...base,cliente:'Vendendo Valor',itens:[it('b',-5)]},
  demo3:{...base,cliente:'Nota Feita Ltda',itens:[it('c',-9)],fiscalStatus:'emitida',nfNumero:'12',nfData:hoje,notasEmitidas:[{numero:'12',data:hoje,ids:['c'],valor:1000}]}});
await page.reload();await page.waitForSelector('#lista .nf-lin');

// ── a aba chama só "Fiscal" ──
assert.equal((await page.textContent('.visoes [data-v="fiscal"]')).trim(),'🧾 Fiscal','sem o "gravou, faz a nota"');

// ── caixa de pesquisa: pedaço do nome, sem acento, sem maiúscula ──
assert.equal(await page.getAttribute('#busca','type'),'search');
const todos=await nomes();
assert(todos.includes('VITÓRIA RÉGIA')&&todos.includes('VENDENDO VALOR'),'sem pesquisa, todos: '+todos);
assert(!todos.includes('NOTA FEITA LTDA'),'o grupo de notas emitidas nasce escondido');
await page.fill('#busca','vitoria');
assert.deepEqual(await nomes(),['VITÓRIA RÉGIA'],'"vitoria" acha "Vitória Régia"');
await page.fill('#busca','VEND');
assert.deepEqual(await nomes(),['VENDENDO VALOR'],'pedaço do nome já filtra enquanto digita');
// ── pesquisando, o grupo escondido abre para mostrar o resultado ──
await page.fill('#busca','nota feita');
assert.deepEqual(await nomes(),['NOTA FEITA LTDA'],'acha quem está em ✅ Notas emitidas (grupo abre sozinho)');
// ── nada encontrado: diz o que foi pesquisado ──
await page.fill('#busca','zzz');
assert(/Nenhum cliente com “zzz”/.test(await page.textContent('#lista')),'explica que não achou');
// ── a pesquisa vale também na Cobrança; apagar devolve a lista ──
await page.fill('#busca','vend');await page.click('.visoes [data-v="cobranca"]');
assert.deepEqual(await nomes(),['VENDENDO VALOR'],'na Cobrança a pesquisa continua valendo');
await page.fill('#busca','');
assert((await nomes()).length>=2,'apagou: a lista volta');
assert((await page.$$eval('#buscaLista option',o=>o.map(x=>x.value))).includes('Vendendo Valor'),'os clientes aparecem como sugestão');

await page.evaluate(()=>['wen_mock_marcas','wen_fiscal_visao','wen_fiscal_fechados'].forEach(k=>localStorage.removeItem(k)));
assert.deepEqual(erros,[]);
console.log('✅ pesquisa-cliente: aba "Fiscal" sem subtítulo e caixa de pesquisa de cliente');
}finally{await browser.close();}
