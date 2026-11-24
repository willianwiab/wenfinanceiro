// CFI_ — cadastro fiscal de clientes, Fase A1 (18/11/2026). PURO: roda sem navegador.
// É o segundo módulo de regra pura do sistema, e o motivo de ele existir é este teste:
// a regra toda se prova em milissegundos, sem subir Chromium.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../js/clientes-fiscais.js');

let pass = 0; const falhas = [];
const ok  = (c, d) => c ? pass++ : falhas.push(d);
const eq  = (o, e, d) => ok(JSON.stringify(o) === JSON.stringify(e), `${d}: esperado ${JSON.stringify(e)}, veio ${JSON.stringify(o)}`);

// ── identidade do cliente ────────────────────────────────────────────────────────
eq(C.CFI_slug('IRMÃOS DIAS'), 'irmaosdias', 'slug tira acento e espaço');
eq(C.CFI_slug('  irmaos   dias!! '), 'irmaosdias', 'slug ignora caixa, espaço e pontuação');
eq(C.CFI_slug('PODCAST 50+'), 'podcast50', 'slug mantém número, tira símbolo');
ok(C.CFI_slug('HISTÓRIAS DE ORLANDO') === C.CFI_slug('HISTORIAS DE ORLANDO'),
   'as duas grafias de Orlando TÊM que cair no mesmo slug (é a única colisão real do histórico)');
eq(C.CFI_slug(''), '', 'slug de vazio é vazio');
eq(C.CFI_slug(null), '', 'slug de null não quebra');

// ── CNPJ: dígito verificador, não só formato ─────────────────────────────────────
ok(C.CFI_validarCNPJ('21.577.617/0001-44'), 'o CNPJ real da WEN tem que valer');
ok(C.CFI_validarCNPJ('21577617000144'),     'vale sem máscara');
ok(!C.CFI_validarCNPJ('21.577.617/0001-45'),'um dígito trocado reprova');
ok(!C.CFI_validarCNPJ('11.111.111/1111-11'),'todos os dígitos iguais reprova');
ok(!C.CFI_validarCNPJ('2157761700014'),     'faltando dígito reprova');
ok(!C.CFI_validarCNPJ(''),                  'vazio reprova');

// ── CPF ──────────────────────────────────────────────────────────────────────────
ok(C.CFI_validarCPF('529.982.247-25'),  'CPF válido conhecido');
ok(!C.CFI_validarCPF('529.982.247-26'), 'CPF com dígito trocado reprova');
ok(!C.CFI_validarCPF('111.111.111-11'), 'CPF repetido reprova');

// ── o roteador escolhe pelo tamanho ──────────────────────────────────────────────
ok(C.CFI_validarDoc('21577617000144'), 'validarDoc aceita CNPJ');
ok(C.CFI_validarDoc('52998224725'),    'validarDoc aceita CPF');
ok(!C.CFI_validarDoc('123'),           'validarDoc rejeita tamanho estranho');
eq(C.CFI_tipoDoc('21577617000144'), 'CNPJ', 'identifica CNPJ');
eq(C.CFI_tipoDoc('52998224725'),    'CPF',  'identifica CPF');
eq(C.CFI_formatarDoc('21577617000144'), '21.577.617/0001-44', 'formata CNPJ');
eq(C.CFI_formatarDoc('52998224725'),    '529.982.247-25',     'formata CPF');

// ── CEP, UF, e-mail ──────────────────────────────────────────────────────────────
ok(C.CFI_validarCEP('01414-000'), 'CEP com máscara');
ok(!C.CFI_validarCEP('0141-000'), 'CEP curto reprova');
ok(C.CFI_validarUF('sp'),  'UF aceita minúscula');
ok(!C.CFI_validarUF('XX'), 'UF inexistente reprova');
eq(C.CFI_UFS.length, 27, 'as 27 UFs');
ok(C.CFI_validarEmail('contato@wenprodutora.com.br'), 'e-mail válido');
ok(!C.CFI_validarEmail('contato@wen'),                'e-mail sem TLD reprova');

// ── completude: o selo "pronto para emitir" ──────────────────────────────────────
const vazia = C.CFI_novaFicha('CLIENTE NOVO');
eq(vazia.id, 'clientenovo', 'ficha nova nasce com o slug como id');
eq(vazia.nomes, ['CLIENTE NOVO'], 'ficha nova já guarda a grafia de origem');
ok(!C.CFI_completude(vazia).pronto, 'ficha vazia não está pronta');
eq(C.CFI_completude(vazia).faltam, ['CPF ou CNPJ','contato','WhatsApp'],
   'só CPF/CNPJ bloqueia; contato e WhatsApp entram como desejáveis (decisão do Will, 19/11)');

// 🔑 O essencial é o documento. Endereço NÃO bloqueia: o Will não quer preencher, e o
// Emissor Nacional costuma puxar razão social e endereço pelo CNPJ.
const soDoc = Object.assign(C.CFI_novaFicha('ACME'), { doc:'21577617000144' });
ok(C.CFI_completude(soDoc).pronto, 'só com CPF/CNPJ a ficha já conta como pronta');
eq(C.CFI_completude(soDoc).leves, ['contato','WhatsApp'], 'e avisa o que ainda falta, sem bloquear');

const semEndereco = Object.assign({}, soDoc, { contatoFinanceiro:'Maria', whatsappFinanceiro:'11 90000-0000' });
eq(C.CFI_completude(semEndereco), { pronto:true, faltam:[], leves:[] },
   'CNPJ + contato + WhatsApp, sem endereço nenhum: nada a cobrar');

const cheia = Object.assign({}, semEndereco, {
  razaoSocial:'ACME LTDA', logradouro:'Rua Haddock Lobo',
  numero:'1307', bairro:'Jardins', municipio:'São Paulo', uf:'SP', cep:'01414-000' });
eq(C.CFI_completude(cheia), { pronto:true, faltam:[], leves:[] }, 'ficha completa segue pronta');

const docRuim = Object.assign({}, cheia, { doc:'21577617000145' });
ok(!C.CFI_completude(docRuim).pronto, 'CNPJ com dígito errado derruba o pronto');
ok(C.CFI_completude(docRuim).faltam.includes('CPF/CNPJ inválido'), 'e diz o motivo');

const semIM = Object.assign({}, cheia, { inscricaoMunicipal:'' });
ok(C.CFI_completude(semIM).pronto, 'inscrição municipal NÃO é obrigatória');
// os campos de endereço continuam EXISTINDO no modelo — só deixaram de ser cobrados
ok('logradouro' in C.CFI_novaFicha('X'), 'o campo de endereço segue no modelo, para quando a emissão pedir');
ok('cep' in C.CFI_novaFicha('X'), 'idem o CEP');

const mailRuim = Object.assign({}, cheia, { emailFinanceiro:'joao@' });
ok(!C.CFI_completude(mailRuim).pronto, 'e-mail do financeiro inválido derruba');

// ── casar lançamento → ficha ─────────────────────────────────────────────────────
const fichas = [
  Object.assign(C.CFI_novaFicha('CARTPANDA'), { doc:'21577617000144' }),
  C.CFI_adicionarApelido(C.CFI_novaFicha('HISTÓRIAS DE ORLANDO'), 'HISTORIAS DE ORLANDO'),
];
ok(C.CFI_casar('CARTPANDA', fichas),          'casa pelo nome exato');
ok(C.CFI_casar('  cartpanda ', fichas),       'casa ignorando caixa e espaço');
ok(C.CFI_casar('HISTORIAS DE ORLANDO', fichas), 'casa a grafia sem acento pelo slug');
ok(C.CFI_casar('HISTÓRIAS DE ORLANDO', fichas), 'casa a grafia com acento');
eq(C.CFI_casar('CLIENTE QUE NAO EXISTE', fichas), null, 'não existindo devolve null');
eq(C.CFI_casar('', fichas), null, 'nome vazio devolve null');
ok(!C.CFI_casar('CARTPANDA BRASIL', fichas),
   'NÃO pode casar por semelhança — errar o tomador é emitir no CNPJ errado');

// "PANDACAST" é como a agenda do Google chama a Cartpanda (tabela de apelidos de 01/11)
const comApelido = C.CFI_adicionarApelido(fichas[0], 'PANDACAST');
eq(comApelido.nomes.length, 2, 'apelido de verdade entra');
ok(C.CFI_casar('PANDACAST', [comApelido]), 'e passa a casar pelo apelido');
eq(C.CFI_adicionarApelido(comApelido, 'pandacast').nomes.length, 2, 'apelido repetido não duplica');
eq(C.CFI_adicionarApelido(comApelido, 'CART PANDA').nomes.length, 2,
   '"CART PANDA" normaliza igual a "CARTPANDA" — é duplicata, não entra');

// ── pendências sobre dado REAL do backup ─────────────────────────────────────────
import fs from 'node:fs';
const bks = fs.existsSync('/Users/willdawen/Downloads')
  ? fs.readdirSync('/Users/willdawen/Downloads').filter(n => /^backup-receber-.*\.json$/.test(n)).sort()
  : [];
if (!bks.length) {
  console.log('⏭️  sem backup do Receber nesta máquina — pendências só se provam localmente.');
} else {
  const R = JSON.parse(fs.readFileSync('/Users/willdawen/Downloads/' + bks[bks.length - 1], 'utf8')).registros;
  const pend = C.CFI_pendencias(R, [], '2026');
  ok(pend.length > 0, 'sem ficha nenhuma, todo cliente de 2026 é pendência');
  ok(pend[0].faturado >= pend[pend.length - 1].faturado, 'pendências vêm do que mais fatura pro que menos');
  ok(pend.every(p => p.faturado > 0), 'só entra quem faturou');

  // cadastrando o primeiro, ele sai da lista
  const umaFicha = [C.CFI_novaFicha(pend[0].nome)];
  const pend2 = C.CFI_pendencias(R, umaFicha, '2026');
  eq(pend2.length, pend.length - 1, 'cadastrar o cliente tira ele das pendências');
  ok(!pend2.some(p => C.CFI_slug(p.nome) === C.CFI_slug(pend[0].nome)), 'e é justamente ele que saiu');

  const res = C.CFI_resumo(R, umaFicha, '2026');
  eq(res.fichas, 1, 'resumo conta as fichas');
  eq(res.prontas, 0, 'a ficha recém-criada não está pronta');
  eq(res.semFicha, pend2.length, 'resumo bate com as pendências');
  console.log(`   (backup ${bks[bks.length-1]}: ${pend.length} clientes de 2026 sem ficha, maior = ${pend[0].nome})`);
}

// ── CFI_liberavel — quem o administrativo atende ────────────────────────────
// A decisão do Will (19/11): sem ficha ENTRA. Só fica de fora quem foi desmarcado
// nas duas coisas — não exige nota E não é a Natália quem cobra.
ok(C.CFI_liberavel(null), 'cliente sem ficha é atendido pelo administrativo');
ok(C.CFI_liberavel(undefined), 'ficha indefinida também');
{
  const f = C.CFI_novaFicha('Fulano');
  ok(f.exigeNota === true && f.cobrancaAdministrativo === true, 'ficha nova nasce com os dois ligados');
  ok(C.CFI_liberavel(f), 'ficha nova é liberável');

  ok(C.CFI_liberavel({ ...f, exigeNota: false }), 'sem NF mas com cobrança: entra');
  ok(C.CFI_liberavel({ ...f, cobrancaAdministrativo: false }), 'com NF mas cobrança do Will: entra');
  // 24/11 (Will): "entrou no financeiro, entra no fiscal" — desmarcado nos dois também entra
  ok(C.CFI_liberavel({ ...f, exigeNota: false, cobrancaAdministrativo: false }),
     'desmarcado nos dois: entra (só acompanhar)');
  ok(C.CFI_soAcompanhar({ ...f, exigeNota: false, cobrancaAdministrativo: false }), 'e é marcado como só acompanhar');
  ok(!C.CFI_soAcompanhar(f), 'ficha normal não é só acompanhar');

  // ficha antiga, gravada antes do campo existir, não pode sumir da liberação
  const antiga = { ...f }; delete antiga.cobrancaAdministrativo;
  ok(C.CFI_liberavel(antiga), 'ficha antiga sem o campo continua sendo atendida');
  const antigaSemNota = { ...antiga, exigeNota: false };
  ok(C.CFI_liberavel(antigaSemNota), 'ficha antiga que não exige nota segue cobrável pelo administrativo');
}

if (falhas.length) { console.error('❌ clientes-fiscais\n   - ' + falhas.join('\n   - ')); process.exit(1); }
console.log(`✅ clientes-fiscais: ${pass} verificações, sem navegador`);
