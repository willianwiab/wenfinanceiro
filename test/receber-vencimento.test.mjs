// Campo de vencimento do Receber (21/10/2026) — roda 100% em ?mock=1.
// Eram 3 selects e, faltando QUALQUER um, o vencimento caía calado na data da gravação.
// Agora é um campo só, o ano vem do exercício, e a tela diz o que vai ser salvo.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/receber-vencimento.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
page.on('dialog', d => d.accept());
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3200);

const r = await page.evaluate(async () => {
  const out = {};
  const $ = id => document.getElementById(id);
  // os selects antigos não existem mais
  out.semSelectsVelhos = !$('rFVencDia') && !$('rFVencMes') && !$('rFVencAno');
  out.temCampoUnico = $('rFVenc') && $('rFVenc').type === 'date';

  R_abrirModal();
  await new Promise(r => setTimeout(r, 300));
  // gravação em 10/12 do exercício
  $('rFDia').value = '10'; $('rFMes').value = '12'; $('rFAno').value = '2026';
  atualizarMesDoFormularioR();
  out.anoExercicio = R_vencAnoExercicio();

  // vazio → a tela DIZ que vai usar a data da gravação (antes isso era invisível)
  R_vencAtalho('limpar');
  out.vazio = { valorSalvo: R_vencValor(), eco: $('rVencEco').textContent.trim() };

  // atalhos — e o ano vem sozinho, sem digitar
  R_vencAtalho('grav');  out.naGravacao = R_vencValor();
  R_vencAtalho(15);      out.mais15 = R_vencValor();
  R_vencAtalho(30);      out.mais30 = R_vencValor();
  R_vencAtalho('fim');   out.fimDoMes = R_vencValor();
  out.ecoMais30 = (R_vencAtalho(30), $('rVencEco').textContent.trim());

  // ida e volta no formato do sistema
  R_vencSet('05/01/2027');
  out.roundTrip = { input: $('rFVenc').value, devolve: R_vencValor() };
  out.ecoAnoDiferente = $('rVencEco').textContent.replace(/\s+/g, ' ').trim();
  out.classeAlerta = $('rVencEco').className.includes('alerta');

  // vencimento ANTES da gravação também avisa
  R_vencSet('01/12/2026');
  out.antes = { eco: $('rVencEco').textContent.replace(/\s+/g, ' ').trim(), alerta: $('rVencEco').className.includes('alerta') };

  // sem data de gravação o atalho avisa e PRESERVA o que já estava (não apaga o do usuário)
  const antesDoAtalho = R_vencValor();
  $('rFDia').value = '';
  R_vencAtalho(15);
  out.semGravacao = { antes: antesDoAtalho, depois: R_vencValor(), preservou: R_vencValor() === antesDoAtalho };

  // salvar de verdade: o que está no campo é o que vai pro registro
  $('rFDia').value = '10'; $('rFMes').value = '12'; $('rFAno').value = '2026';
  $('rFCliente').value = 'TESTE VENCIMENTO';
  $('rFValorLocacao').value = '1000'; $('rFValorEdicao').value = '0'; $('rFValorTotal').value = '1000';
  $('rFValorReserva').value = '0'; $('rFHoras').value = '2';
  R_vencSet('20/12/2026');
  await R_salvarLancamento();
  await new Promise(r => setTimeout(r, 600));
  const salvo = R_todosOsDados.filter(x => x.cliente === 'TESTE VENCIMENTO').pop();
  out.salvou = { vencimento: salvo && salvo.vencimento, data: salvo && salvo.data };

  // reabrir traz a data de volta no campo
  R_abrirModal(salvo.id);
  await new Promise(r => setTimeout(r, 300));
  out.reabriu = { campo: $('rFVenc').value, devolve: R_vencValor() };
  R_fecharModal();
  out.aoFechar = R_vencValor();
  return out;
});
await browser.close();

let falhas = 0;
const ok = (n, c, d) => { console.log((c ? '✅' : '❌') + ' ' + n + (d !== undefined ? ' → ' + JSON.stringify(d) : '')); if (!c) falhas++; };

console.log('\n── um campo no lugar de três ──');
ok('os 3 selects antigos sumiram', r.semSelectsVelhos);
ok('existe um campo de data único', r.temCampoUnico);

console.log('\n── o ano vem do exercício, não da digitação ──');
ok('o exercício é lido do formulário', r.anoExercicio === 2026, r.anoExercicio);
ok('"Na gravação" acerta o ano sozinho', r.naGravacao === '10/12/2026', r.naGravacao);
ok('+15 dias atravessa o mês certo', r.mais15 === '25/12/2026', r.mais15);
ok('+30 dias vira o ANO sozinho', r.mais30 === '09/01/2027', r.mais30);
ok('"Fim do mês" cai no último dia', r.fimDoMes === '31/12/2026', r.fimDoMes);

console.log('\n── a tela não esconde mais nada ──');
ok('campo vazio avisa que vai usar a gravação', /gravação/i.test(r.vazio.eco) && r.vazio.valorSalvo === '', r.vazio);
ok('mostra quantos dias depois', /30 dia/.test(r.ecoMais30), r.ecoMais30);
ok('ano fora do exercício ACENDE alerta', r.classeAlerta && /exercício/i.test(r.ecoAnoDiferente), r.ecoAnoDiferente);
ok('vencer ANTES da gravação acende alerta', r.antes.alerta && /antes/i.test(r.antes.eco), r.antes.eco);
ok('sem data de gravação, o atalho avisa e não apaga o que já estava', r.semGravacao.preservou, r.semGravacao);

console.log('\n── ida e volta com o dado ──');
ok('DD/MM/AAAA ⇄ ISO sem perder nada', r.roundTrip.devolve === '05/01/2027' && r.roundTrip.input === '2027-01-05', r.roundTrip);
ok('salva o vencimento que está no campo', r.salvou.vencimento === '20/12/2026', r.salvou);
ok('reabrir traz a data de volta', r.reabriu.devolve === '20/12/2026', r.reabriu);
ok('fechar limpa o campo', r.aoFechar === '', r.aoFechar);

console.log('\n── erros de página ──');
ok('nenhum erro de JS', erros.length === 0, erros);
console.log('\n' + (falhas ? `❌ ${falhas} falha(s)` : '✅ tudo verde'));
process.exit(falhas ? 1 : 0);
