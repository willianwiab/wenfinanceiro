// Will (20/11): "quando eu selecionar ou desselecionar um campo de diária do cliente,
// precisa atualizar a descrição". A nota era de R$ 2.000 com uma diária, mas o texto
// da nota listava as duas — e é esse texto que vai para o portal fiscal.
//
// Rodar:  node test/descricao-segue-selecao.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/descricao-segue-selecao.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForTimeout(2500);
await page.evaluate(()=>document.querySelector('#lista [data-abrir]').click());
await page.waitForSelector('.ed-aba');
await page.click('.ed-aba[data-aba="fiscal"]');
await page.waitForSelector('[data-nota]');

const desc=()=>page.inputValue('#descricaoFiscal');
const botao=()=>page.textContent('#notaRegistrar');

// tudo marcado: as três diárias no texto
let t=await desc();
assert(t.includes('3 diárias · 7h de estúdio'),'resumo das três');
for(const d of ['05/11','12/11','19/11'])assert(t.includes(d),'linha de '+d);
assert(t.includes('CNPJ'),'os dados bancários continuam');

// desmarcar uma tira do texto E do valor, juntos
await page.click('[data-nota][data-nota]:first-of-type');
await page.waitForFunction(()=>document.getElementById('descricaoFiscal').value.includes('2 diárias'));
t=await desc();
assert(t.includes('2 diárias · 5h de estúdio'),'o resumo acompanha');
assert(!t.includes('05/11'),'a desmarcada saiu do texto da nota');
assert(t.includes('12/11')&&t.includes('19/11'));
assert((await botao()).includes('4.400'),'e o valor do botão bate com o texto');

// remarcar devolve
await page.click('[data-nota]:first-of-type');
await page.waitForFunction(()=>document.getElementById('descricaoFiscal').value.includes('3 diárias'));
assert((await desc()).includes('05/11'),'voltou');

// 🔒 texto escrito à mão NÃO é sobrescrito
await page.fill('#descricaoFiscal','TEXTO QUE A NATALIA ESCREVEU PARA ESTA NOTA');
await page.click('[data-nota]:first-of-type');
await page.waitForTimeout(500);
assert.equal(await desc(),'TEXTO QUE A NATALIA ESCREVEU PARA ESTA NOTA',
  'o que ela digitou manda — a nota é responsabilidade dela');
assert((await botao()).includes('4.400'),'mas o valor continua acompanhando a seleção');

// "Marcar todas" também atualiza
await page.fill('#descricaoFiscal','');
await page.click('#notaTodas');
await page.waitForTimeout(500);
const final=await desc();
assert(final.includes('diárias')||final.includes('diária'),'marcar/desmarcar todas reescreve o texto');

assert.deepEqual(erros,[]);
console.log('✅ descricao-segue-selecao: o texto da nota acompanha as diárias marcadas');
}finally{await browser.close();}
