// Prova o núcleo do Consolidado PJ+PF (módulo CS_ do index.html).
//
// A tese do módulo é uma só: a RETIRADA é transferência entre bolsos, não despesa.
// Consequência matemática — ela tem que se CANCELAR no resultado consolidado. Se um dia
// alguém voltar a somar a retirada como custo operacional, o teste "retirada se cancela"
// quebra na hora.
//
//   node test/consolidado.test.mjs
//
// Sem dependência externa: extrai o texto-fonte das funções do index.html e roda com
// fixtures injetadas (mesmo truque do test/excluir-cartao-wen.test.mjs).
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = fs.readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
function ex(n){
  const i = SRC.indexOf('function ' + n + '(');
  if (i < 0) throw new Error('não achei ' + n + ' no index.html');
  const b = SRC.indexOf('{', i);
  let d = 0, j = b;
  for (; j < SRC.length; j++){ if (SRC[j] === '{') d++; else if (SRC[j] === '}'){ d--; if (!d) break; } }
  return SRC.slice(i, j + 1);
}

const MESES_ABREV = ['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];

function api(fx){
  return new Function('FX', `
    const MESES_ABREV = FX.MESES_ABREV;
    let CS_CFG = FX.CS_CFG, R_todosOsDados = FX.R_todosOsDados, P_meses = FX.P_meses;
    ${ex('CS_pf')}
    ${ex('CS_temPF')}
    ${ex('CS_mesesComDados')}
    ${ex('CS_calcMes')}
    return { CS_calcMes, CS_pf, CS_temPF, CS_mesesComDados };
  `)(fx);
}

let pass = 0, fail = 0;
const ok = (d, c) => c ? pass++ : (fail++, console.log('FALHOU:', d));
const eq = (d, a, b) => ok(`${d} (esperado ${b}, veio ${a})`, Math.abs(a - b) < 0.005);

// ── Cenário base ──────────────────────────────────────────────────────────
// Receita 8.000 (1.200 ainda em aberto) · despesa operacional 4.400 · retirada 2.500
// Casa: custo de vida 4.000, renda extra 500 (fora da WEN)
const R_BASE = [
  { mes:'JUL/2026', valorTotal:5000, saldo:0    },
  { mes:'JUL/2026', valorTotal:3000, saldo:1200 },
];
const P_BASE = { 'JUL/2026': [
  { valor:3800, categoria:'aluguel',  status:'PENDENTE', valorPago:0    },
  { valor:600,  categoria:'impostos', status:'PAGO',     valorPago:600  },
  { valor:2500, categoria:'retirada', status:'PAGO',     valorPago:2500 },
]};
const CFG_BASE = { pf: { 'JUL/2026': { custo:4000, renda:500 } } };

const A = api({ MESES_ABREV, CS_CFG:CFG_BASE, R_todosOsDados:R_BASE, P_meses:P_BASE });
const c = A.CS_calcMes('JUL/2026');

// 1) A retirada NÃO entra na despesa operacional
eq('despesa operacional exclui a retirada', c.despOper, 4400);
eq('retirada isolada', c.retirada, 2500);

// 2) Competência × caixa
eq('receita (competência)', c.receita, 8000);
eq('a receber em aberto', c.aReceber, 1200);
eq('recebido = receita − em aberto', c.recebido, 6800);

// 3) Os dois lados
eq('margem operacional (antes de se pagar)', c.margemOper, 3600);
eq('sobra na empresa (depois da retirada)', c.sobraEmpresa, 1100);
eq('renda da casa = retirada + extra', c.rendaPF, 3000);
eq('sobra pessoal', c.sobraPF, -1000);

// 4) O consolidado fecha pelos dois caminhos
eq('consolidado = sobraEmpresa + sobraPF', c.consolidado, 100);
eq('consolidado = margemOper + rendaExtra − custoPF', c.consolidado, 3600 + 500 - 4000);
eq('custo do conjunto', c.custoConjunto, 8400);

// ── 5) A PROVA: a retirada se cancela ─────────────────────────────────────
// Trocar 2.500 por 9.000 muda os dois lados, mas NÃO pode mudar o consolidado.
// Dinheiro trocando de bolso não cria nem destrói riqueza.
const P_ALTA = { 'JUL/2026': P_BASE['JUL/2026'].map(r => r.categoria === 'retirada' ? { ...r, valor:9000 } : r) };
const B = api({ MESES_ABREV, CS_CFG:CFG_BASE, R_todosOsDados:R_BASE, P_meses:P_ALTA });
const cB = B.CS_calcMes('JUL/2026');

eq('retirada maior não mexe na despesa operacional', cB.despOper, 4400);
eq('retirada maior não mexe na margem operacional', cB.margemOper, 3600);
ok('retirada maior MUDA a sobra da empresa', cB.sobraEmpresa !== c.sobraEmpresa);
ok('retirada maior MUDA a sobra pessoal',    cB.sobraPF     !== c.sobraPF);
eq('▶ retirada se CANCELA no consolidado', cB.consolidado, c.consolidado);

// ── 6) Mês sem o lado pessoal preenchido ──────────────────────────────────
const C = api({ MESES_ABREV, CS_CFG:{ pf:{} }, R_todosOsDados:R_BASE, P_meses:P_BASE });
const cC = C.CS_calcMes('JUL/2026');
ok('mês sem PF é marcado como incompleto', cC.temPF === false);
eq('sem PF, custo de vida é zero', cC.pf.custo, 0);
eq('sem PF, consolidado cai na margem operacional', cC.consolidado, 3600);

// ── 7) Meses disponíveis vêm dos três lados, ordenados ────────────────────
const D = api({ MESES_ABREV, CS_CFG:{ pf:{ 'MAI/2026':{custo:1} } },
  R_todosOsDados:[{ mes:'DEZ/2025', valorTotal:100, saldo:0 }],
  P_meses:{ 'JUL/2026':[] } });
const ms = D.CS_mesesComDados();
ok('une receber + pagar + pessoal, em ordem cronológica',
   JSON.stringify(ms) === JSON.stringify(['DEZ/2025','MAI/2026','JUL/2026']));

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
