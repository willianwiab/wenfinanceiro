// Cadastro fiscal — a TELA (Fase A2, 18/11/2026). Roda 100% em ?mock=1.
//
// A promessa que mais importa aqui: a aba inteira NÃO ESCREVE em `lancamentos`. O cadastro é
// coleção nova; o Receber é só leitura. O teste intercepta a rede e prova isso.
import { chromium } from 'playwright';
const URL = process.argv[2];
if (!URL) { console.error('uso: node test/clientes-fiscais-tela.test.mjs <url-com-?mock=1>'); process.exit(2); }
const browser = await chromium.launch();
const page = await browser.newPage();
const erros = [];
page.on('pageerror', e => erros.push('pageerror: ' + (e?.message || e)));
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
await page.waitForTimeout(3200);

const r = await page.evaluate(async () => {
  const out = {};
  // vigia da rede: qualquer escrita em lancamentos é falha
  out.escritasNoReceber = [];
  const fetchReal = window.fetch;
  window.fetch = function (u, o) {
    const url = String(u || ''), m = ((o && o.method) || 'GET').toUpperCase();
    if (/\/lancamentos/.test(url) && m !== 'GET') out.escritasNoReceber.push(m + ' ' + url.slice(0, 80));
    return fetchReal.apply(this, arguments);
  };

  const b = [...document.querySelectorAll('.nav-main button')].find(x => /Notas Fiscais/.test(x.textContent));
  showMain('notas', b);
  await new Promise(r => setTimeout(r, 1200));

  out.temAba = !!document.getElementById('nfAbaCli');

  // dados: dois clientes com faturamento no ano corrente
  const ano = String(new Date().getFullYear());
  const mes = R_mesAtual && R_mesAtual.endsWith('/' + ano) ? R_mesAtual : ('JAN/' + ano);
  // isola: o mock traz CLIENTE TESTE A/B/C, que entrariam nas pendências e embaralhariam a prova
  R_todosOsDados.length = 0;
  R_todosOsDados.push(
    { id: 'cfi1', cliente: 'CLIENTE GRANDE', mes, data: '05/01', horas: 4, valorTotal: 9000, valorReserva: 0, saldo: 9000, studio: 'STUDIO A' },
    { id: 'cfi2', cliente: 'CLIENTE PEQUENO', mes, data: '06/01', horas: 2, valorTotal: 1500, valorReserva: 0, saldo: 1500, studio: 'STUDIO A' });
  CFI_FICHAS = {}; CFI_ok = true;

  NF_setAba('clientes');
  await new Promise(r => setTimeout(r, 500));
  const txt = () => document.getElementById('nfConteudo').innerText;
  out.listaPendencias = [...document.querySelectorAll('#nfConteudo .cfi-lin.pend .cfi-nome')].map(e => e.textContent);
  out.maiorPrimeiro = out.listaPendencias[0];
  out.cardSemCadastro = [...document.querySelectorAll('#nfCards .card-p')]
    .find(c => /Sem cadastro/.test(c.querySelector('label').textContent))?.querySelector('.val')?.textContent;

  // abre pelo botão "Cadastrar" da pendência → nome vem preenchido
  document.querySelector('#nfConteudo .cfi-lin.pend button').click();
  await new Promise(r => setTimeout(r, 300));
  out.modalAbriu = document.getElementById('cfiModalBg').classList.contains('open');
  out.nomeVeioPreenchido = document.getElementById('cfiF_nome').value;
  out.statusInicial = document.getElementById('cfiStatus').innerText;

  // CNPJ inválido marca em vermelho e barra o salvar
  const setar = (k, v) => { const el = document.getElementById('cfiF_' + k); el.value = v; el.dispatchEvent(new Event('input')); };
  setar('doc', '21577617000145');
  await new Promise(r => setTimeout(r, 150));
  out.docRuimMarcado = document.getElementById('cfiF_doc').classList.contains('ruim');
  CFI_salvar();
  await new Promise(r => setTimeout(r, 300));
  out.barrouDocRuim = Object.keys(CFI_FICHAS).length === 0;

  // preenche de verdade
  [['doc','21577617000144'],['razaoSocial','CLIENTE GRANDE LTDA'],['logradouro','Rua Haddock Lobo'],
   ['numero','1307'],['bairro','Jardins'],['municipio','São Paulo'],['uf','SP'],['cep','01414-000'],
   ['emailFinanceiro','financeiro@clientegrande.com.br']].forEach(([k,v]) => setar(k, v));
  await new Promise(r => setTimeout(r, 200));
  out.statusPronto = document.getElementById('cfiStatus').innerText;

  await CFI_salvar();
  await new Promise(r => setTimeout(r, 600));
  out.salvou = Object.keys(CFI_FICHAS).length;
  const f = Object.values(CFI_FICHAS)[0];
  out.ficha = { id: f.id, nome: f.nome, doc: f.doc, uf: f.uf, cep: f.cep, pronto: CFI_completude(f).pronto };
  out.guardouNoCache = !!localStorage.getItem('wen_clientes_fiscais');

  NF_setAba('clientes');
  await new Promise(r => setTimeout(r, 400));
  out.pendenciasDepois = [...document.querySelectorAll('#nfConteudo .cfi-lin.pend .cfi-nome')].map(e => e.textContent);
  out.cadastradosNaTela = [...document.querySelectorAll('#nfConteudo .cfi-lin:not(.pend) .cfi-nome')].map(e => e.textContent);
  out.seloPronto = /pronto/.test(txt());

  // as outras abas continuam funcionando
  NF_setAba('fila'); await new Promise(r => setTimeout(r, 400));
  out.filaAindaMonta = !!document.getElementById('nfConteudo').innerHTML;
  window.fetch = fetchReal;
  return out;
});
await browser.close();

const f = [];
const eq = (o, e, q) => { if (JSON.stringify(o) !== JSON.stringify(e)) f.push(`${q}: esperado ${JSON.stringify(e)}, veio ${JSON.stringify(o)}`); };

if (!r.temAba) f.push('o botão 👥 Clientes não está na aba Notas Fiscais');
eq(r.listaPendencias, ['CLIENTE GRANDE', 'CLIENTE PEQUENO'], 'pendências do maior para o menor');
eq(r.maiorPrimeiro, 'CLIENTE GRANDE', 'quem mais fatura vem primeiro');
eq(r.cardSemCadastro, '2', 'o card conta os sem cadastro');
if (!r.modalAbriu) f.push('o modal não abriu');
eq(r.nomeVeioPreenchido, 'CLIENTE GRANDE', 'o nome vem preenchido da pendência');
if (!/falta/.test(r.statusInicial)) f.push('ficha nova tem que dizer o que falta');
if (!r.docRuimMarcado) f.push('CNPJ inválido tem que marcar o campo em vermelho');
if (!r.barrouDocRuim)  f.push('🔴 salvou com CNPJ inválido — tinha que barrar');
if (!/com CPF\/CNPJ/.test(r.statusPronto)) f.push('com o documento válido o selo tem que dizer "com CPF/CNPJ"');
eq(r.salvou, 1, 'salvou a ficha');
eq(r.ficha, { id: 'clientegrande', nome: 'CLIENTE GRANDE', doc: '21577617000144', uf: 'SP', cep: '01414000', pronto: true }, 'a ficha gravada');
if (!r.guardouNoCache) f.push('tem que guardar no cache local (padrão do BC_)');
eq(r.pendenciasDepois, ['CLIENTE PEQUENO'], 'cadastrar tira da lista de pendências');
eq(r.cadastradosNaTela, ['CLIENTE GRANDE'], 'e aparece na lista de cadastrados');
if (!r.seloPronto) f.push('o selo "pronto" não apareceu na lista');
if (!r.filaAindaMonta) f.push('a aba A faturar parou de montar');
eq(r.escritasNoReceber, [], '🔴 NÃO pode escrever em lancamentos — o Receber é só leitura');
if (erros.length) f.push('erros de página: ' + erros.join(' | '));

if (f.length) { console.error('❌ clientes-fiscais-tela\n   - ' + f.join('\n   - ')); process.exit(1); }
console.log('✅ clientes-fiscais-tela: cadastra, valida, tira das pendências — e não toca no Receber');
