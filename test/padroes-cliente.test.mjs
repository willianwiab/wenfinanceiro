// Os padrões do cliente (🧾 Nota / 💰 Cobrança) ligam e desligam DIRETO na aba Clientes.
// Exemplo do Will: CARTPANDA é mensal, exige nota e vai para cobrança — os dois ligados.
//
// Rodar:  node test/padroes-cliente.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/padroes-cliente.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);

const gravados=await page.evaluate(async()=>{
  await MOD_umaVez('notas-fiscais',NF_carregar);await MOD_umaVez('clientes-fiscais',CFI_carregar);
  // nuvem de mentira: guarda o que seria gravado, sem sair da máquina
  window.__salvos=[];
  window.BC_fbUpsert=async(col,id,doc)=>{window.__salvos.push({col,id,doc});};
  CFI_FICHAS={};
  R_todosOsDados.push({id:'cp1',cliente:'CARTPANDA',mes:'NOV/2026',data:'18/11/2026',horas:3,
    studio:'STUDIO A',valorTotal:2200,valorReserva:0,saldo:2200,desc:'Videocast'});
  showMain('notas');NF_setAba('clientes');
  await new Promise(r=>setTimeout(r,300));
  return true;
});
assert(gravados);

// CARTPANDA ainda não tem ficha, mas já aparece com os dois chips LIGADOS (é o padrão)
// antes do 1º clique ele está na seção "sem cadastro"; depois pula para "Cadastrados"
assert(await page.locator('#nfConteudo .cfi-lin.pend',{hasText:'CARTPANDA'}).count()>0,
  'CARTPANDA aparece como pendência');
const linhaDe=nome=>`#nfConteudo .cfi-lin:has(.cfi-nome:text-is("${nome}"))`;
const linha=linhaDe('CARTPANDA');
const chips=()=>page.$$eval(linha+' .cfi-chip',e=>e.map(x=>({t:x.textContent.trim(),on:x.classList.contains('on')})));
assert.deepEqual(await chips(),[{t:'🧾 Nota',on:true},{t:'💰 Cobrança',on:true}],
  'sem ficha, os dois padrões já valem — é assim que o cliente novo entra');

// desligar a cobrança cria a ficha mínima, só com o nome
await page.click(linha+' .cfi-chip:nth-child(2)');
await page.waitForFunction(()=>window.__salvos.length===1);
const f1=await page.evaluate(()=>window.__salvos[0]);
assert.equal(f1.col,'clientes_fiscais');assert.equal(f1.id,'cartpanda');
assert.equal(f1.doc.nome,'CARTPANDA','a ficha nasce com o nome do Receber');
assert.equal(f1.doc.cobrancaAdministrativo,false,'desligou a cobrança');
assert.equal(f1.doc.exigeNota,true,'e não mexeu na nota');
assert.deepEqual(await chips(),[{t:'🧾 Nota',on:true},{t:'💰 Cobrança',on:false}],'a tela acompanha');
assert.equal(await page.locator('#nfConteudo .cfi-lin.pend',{hasText:'CARTPANDA'}).count(),0,
  'o 1º clique já tira o cliente da lista de "sem cadastro"');

// desligar também a nota tira o cliente da liberação em lote
await page.click(linha+' .cfi-chip:nth-child(1)');
await page.waitForFunction(()=>window.__salvos.length===2);
assert.equal(await page.evaluate(()=>CFI_liberavel(CFI_FICHAS.cartpanda)),false,
  'desmarcado nos dois: sai da liberação');

// e religar devolve: é o estado do exemplo do Will
await page.click(linha+' .cfi-chip:nth-child(1)');
await page.click(linha+' .cfi-chip:nth-child(2)');
await page.waitForFunction(()=>window.__salvos.length===4);
const fim=await page.evaluate(()=>CFI_FICHAS.cartpanda);
assert.equal(fim.exigeNota,true);assert.equal(fim.cobrancaAdministrativo,true);
assert.equal(fim.fechamentoPadrao,'mensal','cliente mensal é o padrão da ficha');
assert.equal(await page.evaluate(()=>CFI_liberavel(CFI_FICHAS.cartpanda)),true);
assert.deepEqual(await chips(),[{t:'🧾 Nota',on:true},{t:'💰 Cobrança',on:true}]);

// o Receber não foi tocado em nenhum momento
assert.equal(await page.evaluate(()=>R_todosOsDados.filter(r=>r.cliente==='CARTPANDA').length),1);
assert(await page.evaluate(()=>window.__salvos.every(s=>s.col==='clientes_fiscais')),
  'só o cadastro fiscal foi gravado — nada de Receber');

// ── o mesmo botão dentro do card da diária (modal do Receber) ──────────────
// É onde o Will decide na hora de lançar. O lançamento NÃO ganha campo nenhum:
// o que muda é a ficha do cliente. Receber segue intocado.
await page.evaluate(()=>{
  R_todosOsDados.push({id:'vv1',cliente:'VENDENDO VALOR',mes:'NOV/2026',data:'18/11/2026',
    horario:'10:00 AS 12:00',horas:2,studio:'STUDIO A',valorTotal:2200,valorReserva:0,saldo:2200,
    desc:'1 DIÁRIA DE 2 HORAS'});
  showMain('receber');R_abrirModal('vv1');
});
await page.waitForSelector('#rPadraoChips .cfi-chip');
const noModal=()=>page.$$eval('#rPadraoChips .cfi-chip',e=>e.map(x=>({t:x.textContent.trim(),on:x.classList.contains('on')})));
assert.deepEqual(await noModal(),[{t:'🧾 Nota',on:true},{t:'💰 Cobrança',on:true}],
  'cliente novo abre com os dois padrões ligados');

const antes=await page.evaluate(()=>JSON.stringify(R_todosOsDados.find(r=>r.id==='vv1')));
await page.click('#rPadraoChips .cfi-chip:nth-child(2)');
await page.waitForFunction(()=>CFI_FICHAS['vendendovalor']);
assert.deepEqual(await noModal(),[{t:'🧾 Nota',on:true},{t:'💰 Cobrança',on:false}]);
assert.equal(await page.evaluate(()=>CFI_FICHAS['vendendovalor'].cobrancaAdministrativo),false,
  'salvou no cliente, não no lançamento');
assert.equal(await page.evaluate(()=>JSON.stringify(R_todosOsDados.find(r=>r.id==='vv1'))),antes,
  '🔒 o lançamento do Receber saiu exatamente como entrou');

// trocar o cliente no campo mostra o padrão do OUTRO cliente
await page.fill('#rFCliente','CARTPANDA');
await page.waitForFunction(()=>document.querySelectorAll('#rPadraoChips .cfi-chip')[1].classList.contains('on'));
assert.deepEqual(await noModal(),[{t:'🧾 Nota',on:true},{t:'💰 Cobrança',on:true}],
  'o bloco segue o cliente do campo');

// ── 💳 a condição de pagamento mora no mesmo lugar: o card da diária ───────
// Era um campo escondido no formulário de cadastro. O Will perguntou "onde
// selecionamos a opção que marca a necessidade dos 50%?" — resposta: aqui.
await page.fill('#rFCliente','VENDENDO VALOR');
await page.waitForFunction(()=>document.querySelector('#rPadraoChips .cfi-cond')?.dataset.k==='vendendovalor');
assert.equal(await page.locator('#rPadraoChips .cfi-cond').count(),1,'o seletor está no card');
assert.deepEqual(await page.$$eval('#rPadraoChips .cfi-cond option',e=>e.map(o=>o.value)),
  ['avista','sinal50','sinal30']);
assert.equal(await page.inputValue('#rPadraoChips .cfi-cond'),'avista','cliente novo nasce à vista');

const antesCond=await page.evaluate(()=>JSON.stringify(R_todosOsDados.find(r=>r.id==='vv1')));
await page.selectOption('#rPadraoChips .cfi-cond','sinal50');
await page.waitForFunction(()=>CFI_FICHAS['vendendovalor']?.condicaoPagamento==='sinal50');
assert.equal(await page.evaluate(()=>CFI_FICHAS['vendendovalor'].condicaoPagamento),'sinal50');
assert.equal(await page.evaluate(()=>JSON.stringify(R_todosOsDados.find(r=>r.id==='vv1'))),antesCond,
  '🔒 e o lançamento do Receber continua intocado');

// o fechamento daquele cliente passa a dizer o que cobrar agora
const quanto=await page.evaluate(()=>{
  const f=WENFechamentos.criar([{id:'z',cliente:'VENDENDO VALOR',mes:'NOV/2026',data:'18/11',
    horas:2,studio:'STUDIO A',valorTotal:10000,valorReserva:0}],CFI_FICHAS['vendendovalor']);
  return WENFechamentos.cobranca(f,f.condicao);});
assert.equal(quanto.cobrarAgora,5000,'sem nada pago, a cobrança já pede os 50%');
assert.equal(quanto.proxima,'Sinal (50%)');

assert.deepEqual(erros,[]);
console.log('✅ padroes-cliente: 🧾 e 💰 direto na lista, ficha nasce no 1º clique, Receber intocado');
}finally{await browser.close();}
