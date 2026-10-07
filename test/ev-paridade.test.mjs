// Prova que o motor EV_ do WEN é IDÊNTICO ao do Nossa Semente (texto-fonte das funções + comportamento).
import fs from 'node:fs';
// A paridade compara com o app.html do Nossa Semente, que mora em OUTRO repositório. No CI do
// GitHub ele não existe (repo privado, sem token cruzado): o teste pula com aviso em vez de
// quebrar a suíte. Para rodar fora do Mac do Will: NS_APP_HTML=/caminho/app.html.
const NS_APP = process.env.NS_APP_HTML || '/Users/willdawen/Documents/boasemente/app.html';
if (!fs.existsSync(NS_APP)) { console.log('⏭️  app.html do Nossa Semente não está nesta máquina — paridade só se prova localmente (ou com NS_APP_HTML).'); process.exit(0); }

import { fileURLToPath } from 'node:url';
const NS = fs.readFileSync(NS_APP, 'utf8');
const WEN = fs.readFileSync(fileURLToPath(new URL('../js/evolucao.js', import.meta.url)), 'utf8');
function fn(src, name){ let i=src.indexOf('function '+name+'('); if(i<0) throw new Error('não achei '+name); const b=src.indexOf('{',i); let d=0,j=b; for(;j<src.length;j++){if(src[j]==='{')d++;else if(src[j]==='}'){d--;if(!d)break;}} return src.slice(i,j+1); }
let pass=0, fail=0; const ok=(d,c)=>c?pass++:(fail++,console.log('FALHOU:',d));
const CORE=['EV_catId','EV_coleta','EV_filtrar','EV_totais','EV_pct','EV_tendencia','EV_mesesAntes','EV_mediaHistorica','EV_comprometimento','EV_extraordinarios','EV_periodoComparado','EV_principalResponsavel','EV_analise','EV_score','EV_rankings','EV_blocosSophia','EV_temHistorico','EV_contextoParaIA','EV_meioConta','EV_meioCartao'];
CORE.forEach(n=>ok('motor idêntico NS×WEN: '+n, fn(NS,n)===fn(WEN,n)));
console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail?1:0);
