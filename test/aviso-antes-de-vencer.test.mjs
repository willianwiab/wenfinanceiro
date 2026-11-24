// Will (20/11): "hoje o 🔔 avisa quando algo acontece; falta 'vence em 3 dias e ainda
// não foi cobrado' — é a diferença entre cobrar no prazo e correr atrás depois".
//
// Estes avisos são CALCULADOS na hora, não gravados: não gastam escrita no banco e
// nunca ficam desatualizados. O "lido" mora no aparelho dela, por dia.
// A regra é pura — extraída do arquivo e exercitada sem navegador.
//
// Rodar:  node test/aviso-antes-de-vencer.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const src = fs.readFileSync(RAIZ + 'js/administrativo.js', 'utf8');
const ini = src.indexOf('const AV_LIDOS=');
const fim = src.indexOf('const todosOsAvisos=');
assert(ini > 0 && fim > ini, 'não achei o trecho dos avisos de vencimento');
// marcas do Will (24/11): adiada silencia, lembrete do dia avisa — helpers do mesmo arquivo
const hIni = src.indexOf('const adiada='), hFim = src.indexOf('\n', src.indexOf('const ddmm='));
assert(hIni > 0 && hFim > hIni, 'não achei os helpers das marcas');
const helpers = src.slice(hIni, hFim);

const HOJE = '2026-11-20';
const d = n => { const x = new Date(Date.parse(HOJE + 'T12:00:00')); x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10); };

// o trecho usa docs, today, cash e localStorage — fornecemos os quatro
function montar(lista, lidos = {}) {
  const loja = { v: JSON.stringify(lidos) };
  const ctx = new Function('docs', 'today', 'cash', 'localStorage',
    helpers + '\n' + src.slice(ini, fim) + '\nreturn {avisosDeVencimento, avLidosLocais, avMarcarLocal};');
  return ctx(lista, () => HOJE, v => 'R$ ' + Number(v || 0).toFixed(2),
    { getItem: () => loja.v, setItem: (_, v) => { loja.v = v; } });
}

const f = (id, extra) => ({ id, cliente: id,
  itens: [{ id: id + 'i', data: '10/11', mes: '2026-11', horas: 2, valor: 1000, recebido: 0, saldo: 1000 }],
  valor: 1000, recebido: 0, saldo: 1000, cobrancaStatus: 'pendente', fiscalStatus: 'pendente',
  exigeNota: true, clienteFiscal: {}, promessaData: '', vencimento: '', ...extra });

const lista = [
  f('VENCEU', { vencimento: d(-4) }),
  f('HOJE', { vencimento: d(0) }),
  f('EM3', { vencimento: d(3) }),
  f('EM4', { vencimento: d(4) }),                                  // fora da janela
  f('JAPAGO', { vencimento: d(1), cobrancaStatus: 'pago' }),
  f('COMUNICOU', { vencimento: d(1), cobrancaStatus: 'informado' }),
  f('NAOECOBRADO', { vencimento: d(1), clienteFiscal: { cobrancaAdministrativo: false } }),
  f('SEMDATA', {}),
  f('PROMETEU', { vencimento: d(-2), promessaData: d(5) }),        // promessa silencia
  f('PROMESSAVENCIDA', { vencimento: d(-2), promessaData: d(-1) }),// promessa furada volta
  f('JAENVIADA', { vencimento: d(1), cobrancaStatus: 'enviada' }),
];

const { avisosDeVencimento } = montar(lista);
const avisos = avisosDeVencimento();
const quem = avisos.map(a => a.cliente);

// ── quem entra e quem não entra ───────────────────────────────────────────
assert(quem.includes('VENCEU'), 'vencido entra');
assert(quem.includes('HOJE'), 'vence hoje entra');
assert(quem.includes('EM3'), 'o 3º dia entra');
assert(!quem.includes('EM4'), '4 dias ainda não é assunto');
assert(!quem.includes('JAPAGO'), 'pago não vira cobrança');
assert(!quem.includes('COMUNICOU'), 'pagamento comunicado está com o Will');
assert(!quem.includes('NAOECOBRADO'), 'cliente que ela não cobra fica fora');
assert(!quem.includes('SEMDATA'), 'sem vencimento não dá para avisar');
assert(!quem.includes('PROMETEU'), 'promessa futura silencia o aviso');
assert(quem.includes('PROMESSAVENCIDA'), 'promessa furada volta a avisar');
assert(quem.includes('JAENVIADA'), 'já cobrado mas vencendo continua no radar');
assert.equal(avisos.length, 5);

// ── ordem: o mais urgente primeiro ────────────────────────────────────────
assert.deepEqual(avisos.map(a => a.dias), [...avisos.map(a => a.dias)].sort((a, b) => a - b));
assert.equal(avisos[0].cliente, 'VENCEU', 'o mais atrasado encabeça');

// ── o texto diz o que fazer ───────────────────────────────────────────────
const venceu = avisos.find(a => a.cliente === 'VENCEU');
assert(venceu.texto.includes('venceu há 4 dia'), 'quantos dias de atraso: ' + venceu.texto);
assert(venceu.texto.includes('ainda não foi cobrado'), 'e que ninguém cobrou');
assert.equal(venceu.tipo, 'atraso');
assert(avisos.find(a => a.cliente === 'HOJE').texto.includes('vence HOJE'));
assert.equal(avisos.find(a => a.cliente === 'HOJE').tipo, 'vencendo');
assert(avisos.find(a => a.cliente === 'EM3').texto.includes('vence em 3 dia'));
assert(avisos.find(a => a.cliente === 'JAENVIADA').texto.includes('já cobrado'),
  'quem já foi cobrado é dito de outro jeito');

// ── o id é fixo por dia: abrir cinco vezes não vira cinco avisos ──────────
assert(avisos.every(a => a.id === 'venc-' + a.fechamentoId + '-' + HOJE));
assert(avisos.every(a => a.local === true), 'marcados como locais, não vêm do banco');
assert(avisos.every(a => !a.lidoEm), 'nascem todos como novos');

// ── "lido" vale só pelo dia de hoje ───────────────────────────────────────
const lidoHoje = montar(lista, { dia: HOJE, ids: ['venc-VENCEU-' + HOJE] }).avisosDeVencimento();
assert.equal(lidoHoje.find(a => a.cliente === 'VENCEU').lidoEm, HOJE, 'o que ela abriu fica lido');
assert.equal(lidoHoje.filter(a => !a.lidoEm).length, 4, 'os outros continuam novos');

const ontem = montar(lista, { dia: '2000-01-01', ids: ['venc-VENCEU-' + HOJE] }).avisosDeVencimento();
assert.equal(ontem.filter(a => !a.lidoEm).length, 5,
  'virou o dia: o aviso volta se a cobrança continuar parada');

// ── nada quebra com dado estranho ─────────────────────────────────────────
assert.doesNotThrow(() => montar([]).avisosDeVencimento());
assert.deepEqual(montar([]).avisosDeVencimento(), []);
assert.doesNotThrow(() => montar([{ id: 'x', vencimento: 'não é data' }]).avisosDeVencimento());

// ── marcas do Will (24/11) ────────────────────────────────────────────────
const mk = montar([
  f('ADIADA', { vencimento: d(-3), adiadoAte: d(5) }),
  f('LEMBRA', { vencimento: d(10), lembreteData: d(0), lembreteObs: 'ligar pra Ana' }),
  f('LEMBRADEPOIS', { vencimento: d(10), lembreteData: d(2) }),
]).avisosDeVencimento();
assert(!mk.some(a => a.cliente === 'ADIADA'), 'adiada não gera aviso de atraso até a data');
const lem = mk.find(a => a.cliente === 'LEMBRA' && a.tipo === 'lembrete');
assert(lem && /ligar pra Ana/.test(lem.texto), 'lembrete do dia vira aviso com a anotação');
assert.equal(mk[0].tipo, 'lembrete', 'e vem primeiro');
assert(!mk.some(a => a.cliente === 'LEMBRADEPOIS'), 'lembrete futuro ainda não avisa');

console.log('✅ aviso-antes-de-vencer: avisa 3 dias antes, respeita promessa e pagamento, e não gasta banco');
