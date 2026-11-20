// Tela "Números reais e CNPJ" — 100% em ?mock=1, com os gravadores SUBSTITUÍDOS por capturadores (nada vai à nuvem).
import { chromium } from 'playwright'; import fs from 'fs';
const [URL, DIR] = process.argv.slice(2);
if (!URL || !DIR) { console.error('uso: node test/importar-numeros-reais.test.mjs <url-?mock=1> <pasta-backup>'); process.exit(2); }
const fech = JSON.parse(fs.readFileSync(DIR + '/wen_fechamentos_administrativo_20261120.json'));
const fich = JSON.parse(fs.readFileSync(DIR + '/wen_fichas_fiscais_20261120.json'));
const browser = await chromium.launch(); const page = await browser.newPage();
const erros = []; page.on('pageerror', e => erros.push(String(e?.message || e))); page.on('dialog', d => d.accept());
await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }); await page.waitForTimeout(3200);
const r = await page.evaluate(async ({ fech, fich }) => {
  const out = {};
  const gravF = [], gravC = [];
  FC_dados = fech; CFI_FICHAS = fich;
  window.FC_gravarCampos = async (id, doc, campos) => { gravF.push({ id, campos: [...campos], nfNumero: doc.nfNumero, status: doc.fiscalStatus }); };
  window.BC_fbUpsert = async (col, id, f) => { gravC.push({ col, id, nome: f.nome, doc: f.doc, razao: f.razaoSocial }); };
  window.CFI_salvarCache = () => {};
  out.botao = [...document.querySelectorAll('button')].some(b => /Números reais e CNPJ/.test(b.textContent));
  NFR_abrir();
  const marcadasF = LF => LF; // placeholder
  out.linhas = document.querySelectorAll('#nfrLista tr').length;
  out.checkedInicial = document.querySelectorAll('#nfrLista input[type=checkbox]:checked').length;
  out.resumo = document.getElementById('nfrResumo').textContent;
  out.nadaGravouAntes = gravF.length === 0 && gravC.length === 0;
  await NFR_aplicar();
  out.fechGravados = gravF.map(g => g.id + '=' + g.nfNumero).sort();
  out.camposMask = [...new Set(gravF.flatMap(g => g.campos))].sort();
  out.ficGravadas = gravC.map(g => g.nome).sort();
  out.ficReceberIntocado = !gravC.some(g => g.col !== CFI_COL);
  out.danny = gravC.find(g => g.nome === 'DANNY UEDA');
  out.ficCriada = gravC.find(g => g.nome === 'PROA');
  out.fechAposAplicar = FC_dados['m_quintessa_2026-10'].notasEmitidas.map(n => n.numero + ':' + n.valor);
  out.naoMarcadosIntactos = ['m_oswaldocruz_2026-11', 'm_iaondeissovaidar_2026-11', 'm_leadersbrief_2026-10', 'm_nube_2026-11'].map(k => FC_dados[k].nfNumero);
  // 2ª abertura: nada marcado nos já aplicados
  NFR_abrir(); out.segundaMarcados = document.querySelectorAll('#nfrLista input[type=checkbox]:checked').length; NFR_fechar();
  return out;
}, { fech, fich });
console.log(JSON.stringify(r, null, 1)); await browser.close();
const f = []; const ck = (c, m) => { if (!c) f.push(m); };
ck(r.botao, 'botão ausente'); ck(r.nadaGravouAntes, 'gravou antes de aplicar');
ck(r.fechGravados.length === 8, 'deveria gravar 8 fechamentos marcados: ' + r.fechGravados);
ck(r.fechGravados.includes('m_quintessa_2026-10=420, 425, 6') && r.fechGravados.includes('m_zest_2026-10=423, 426'), 'números reais errados');
ck(JSON.stringify(r.camposMask) === JSON.stringify(['atualizadoEm', 'fiscalStatus', 'nfData', 'nfNumero', 'notasEmitidas']), 'campos fora da lista: ' + r.camposMask);
ck(r.ficGravadas.length === 15 && r.ficReceberIntocado, 'fichas: ' + r.ficGravadas.length);
ck(r.danny?.doc === '31.955.304/0001-36' && r.ficCriada?.razao === 'ASSOCIACAO INSTITUTO PROA', 'ficha com dados errados');
ck(r.naoMarcadosIntactos.join() === '312321,887878787,323213,2323', 'desmarcados foram alterados: ' + r.naoMarcadosIntactos);
ck(r.segundaMarcados === 0, '2ª abertura ainda marca coisas: ' + r.segundaMarcados);
ck(!erros.length, 'erros de página: ' + erros.join(' | '));
if (f.length) { console.error('FALHOU:\n- ' + f.join('\n- ')); process.exit(1); } console.log('✅ importar-numeros-reais ok');
