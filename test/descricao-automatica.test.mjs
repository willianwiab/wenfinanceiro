// A descrição do lançamento se escreve sozinha com o que está preenchido, e para de
// escrever assim que alguém digita à mão. Também prova que a quantidade de edições
// entra no lançamento sem levar nenhum outro campo embora.
//
// Rodar:  node test/descricao-automatica.test.mjs "http://localhost:8877/index.html?mock=1"
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const URL=process.argv[2];
if(!URL){console.error('uso: node test/descricao-automatica.test.mjs <url-com-?mock=1>');process.exit(2);}
const browser=await chromium.launch(),page=await browser.newPage();
const erros=[];page.on('pageerror',e=>erros.push(e.message));page.on('dialog',d=>d.accept());
try{
await page.goto(URL);await page.waitForTimeout(1500);
const desc=()=>page.inputValue('#rFDesc');

await page.evaluate(()=>{showMain('receber');R_abrirModal();});
await page.waitForSelector('#rModalBg.open');

await page.fill('#rFCliente','CARTPANDA');
await page.fill('#rFHoras','2');
assert.equal(await desc(),'STUDIO A · 1 DIÁRIA DE 2 HORAS','estúdio e horas já escrevem a linha');

await page.selectOption('#rFStudio','STUDIO B');
assert.equal(await desc(),'STUDIO B · 1 DIÁRIA DE 2 HORAS','trocar de estúdio reescreve');

await page.fill('#rFQtdEdicao','2');
assert.equal(await desc(),'STUDIO B · 1 DIÁRIA DE 2 HORAS · 2 EDIÇÕES');

await page.fill('#rFQtdEdicao','1');
assert.equal(await desc(),'STUDIO B · 1 DIÁRIA DE 2 HORAS · 1 EDIÇÃO','singular');

await page.fill('#rFHoras','1');
assert.equal(await desc(),'STUDIO B · 1 DIÁRIA DE 1 HORA · 1 EDIÇÃO','hora no singular também');

await page.fill('#rFHoras','2.5');
assert.equal(await desc(),'STUDIO B · 1 DIÁRIA DE 2,5 HORAS · 1 EDIÇÃO','meia hora com vírgula');

// edição com valor mas sem quantidade ainda aparece
await page.fill('#rFQtdEdicao','');await page.fill('#rFValorEdicao','500');
assert.equal(await desc(),'STUDIO B · 1 DIÁRIA DE 2,5 HORAS · EDIÇÃO');

// texto escrito à mão manda: a automática não encosta mais
await page.fill('#rFDesc','PACOTE ANUAL — COMBINADO COM O CLIENTE');
await page.fill('#rFHoras','4');
assert.equal(await desc(),'PACOTE ANUAL — COMBINADO COM O CLIENTE','não sobrescreve o que foi digitado');

// salvar guarda a quantidade sem perder nada do lançamento
await page.evaluate(()=>{window.__salvo=null;window.R_fbSalvar=async d=>{window.__salvo=d;return d;};});
await page.selectOption('#rFDia','18');await page.fill('#rFValorLocacao','2200');await page.fill('#rFQtdEdicao','3');
await page.click('#rBtnSalvarModal');
await page.waitForFunction(()=>window.__salvo);
const g=await page.evaluate(()=>window.__salvo);
assert.equal(g.qtdEdicao,3,'a quantidade foi junto');
assert.equal(g.cliente,'CARTPANDA');assert.equal(g.studio,'STUDIO B');assert.equal(g.horas,4);
assert.equal(g.valorLocacao,2200);assert.equal(g.valorEdicao,500);assert.equal(g.valorTotal,2700);
assert.equal(g.desc,'PACOTE ANUAL — COMBINADO COM O CLIENTE','a descrição digitada foi salva');
for(const k of ['mes','data','vencimento','horario','valorReserva','saldo','obs'])
  assert(k in g,'o lançamento continua com o campo '+k);

// lançamento antigo, sem qtdEdicao, abre sem quebrar e não ganha lixo
await page.evaluate(()=>{
  R_todosOsDados.push({id:'velho',cliente:'ANTIGO',mes:'NOV/2026',data:'10/11',horario:'-',
    horas:2,studio:'STUDIO A',valorTotal:1000,valorReserva:0,saldo:1000,desc:'TEXTO ANTIGO',obs:''});
  R_abrirModal('velho');});
await page.waitForTimeout(300);
assert.equal(await page.inputValue('#rFQtdEdicao'),'','sem o campo, nasce vazio');
assert.equal(await desc(),'TEXTO ANTIGO','a descrição antiga é preservada');

assert.deepEqual(erros,[]);
console.log('✅ descricao-automatica: escreve sozinha, cala quando digitam, e a qtd de edições vai junto');
}finally{await browser.close();}
