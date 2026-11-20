// A ficha cadastral do cliente passou a ser trabalho do administrativo (20/11):
// CNPJ, razão social, contato, e-mail e WhatsApp. As DECISÕES do Will — exige nota,
// quem cobra, condição de pagamento — não podem ser tocadas por ela.
//
// Rodar:  node test/ficha-no-fiscal.test.mjs "http://localhost:8877"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const BASE=process.argv[2];
if(!BASE){console.error('uso: node test/ficha-no-fiscal.test.mjs <url-do-servidor>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(BASE+'/administrativo.html?mock=1');await page.waitForTimeout(2500);

// abre o fechamento e vai para a aba Nota fiscal
await page.evaluate(()=>{document.querySelector('#lista [data-abrir]').click();});
await page.waitForSelector('.ed-aba');
await page.click('.ed-aba[data-aba="fiscal"]');
await page.waitForSelector('#fiDoc');

// os cinco campos que o Will pediu
for(const id of ['fiRazao','fiDoc','fiContato','fiZap','fiMail'])
  assert.equal(await page.locator('#'+id).count(),1,'falta o campo '+id);

// ⚠️ as decisões do Will NÃO aparecem para ela
for(const proibido of ['exigeNota','cobrancaAdministrativo','condicaoPagamento','notaSinal'])
  assert.equal(await page.locator(`#${proibido}, [name="${proibido}"]`).count(),0,
    '🔒 '+proibido+' é decisão do Will e não pode estar na tela dela');

// CPF/CNPJ inválido é barrado antes de salvar
await page.fill('#fiDoc','11.111.111/1111-11');
await page.click('#fiSalvar');
await page.waitForFunction(()=>document.getElementById('fiAviso').textContent.includes('inválido'));
assert((await page.textContent('#fiAviso')).includes('inválido'),'barra documento inválido');

// CNPJ válido passa e sai formatado
await page.fill('#fiDoc','21577617000144');
await page.fill('#fiContato','Ana do financeiro');
await page.fill('#fiZap','11999998888');
await page.click('#fiSalvar');
await page.waitForFunction(()=>document.getElementById('fiDoc').value.includes('/'));
assert.equal(await page.inputValue('#fiDoc'),'21.577.617/0001-44','formata o CNPJ ao salvar');

// CPF também
await page.fill('#fiDoc','52998224725');
await page.click('#fiSalvar');
await page.waitForFunction(()=>document.getElementById('fiDoc').value.includes('-'));
assert.equal(await page.inputValue('#fiDoc'),'529.982.247-25','formata o CPF');

// campo vazio é permitido: nem todo cliente tem CNPJ na mão
await page.fill('#fiDoc','');
await page.click('#fiSalvar');
await page.waitForTimeout(400);
assert(!(await page.textContent('#fiAviso')).includes('inválido'),'vazio não é inválido');

// o que foi digitado fica guardado na ficha, não no fechamento
const guardado=await page.evaluate(()=>{
  const f=Object.values(window.__fichasEspiao||{})[0];return f||null;});

assert.deepEqual(erros,[]);
console.log('✅ ficha-no-fiscal: ela preenche CNPJ/contato/WhatsApp; as decisões do Will ficam fora');
}finally{await browser.close();}
