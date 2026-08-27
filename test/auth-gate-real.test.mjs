// Prova o modo REAL (sem ?mock): o app trava na tela de login e o interceptor
// anexa o Bearer. Firestore e identitytoolkit são STUBADOS na página (route),
// então NADA toca produção — nenhuma conta real, nenhuma leitura/escrita real.
import { chromium } from 'playwright';
const URL = process.argv[2]; // sem ?mock
const browser = await chromium.launch();
const page = await browser.newPage();
const fsHeaders = [];
// Intercepta a REDE antes de qualquer coisa: identitytoolkit e Firestore são falsos.
await page.route('**/identitytoolkit.googleapis.com/**', route => {
  route.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ idToken:'IDT_FAKE', refreshToken:'RT_FAKE', expiresIn:'3600', localId:'u1', email:'teste@wen' }) });
});
await page.route('**/securetoken.googleapis.com/**', route => {
  route.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ id_token:'IDT_FAKE2', refresh_token:'RT_FAKE2', expires_in:'3600' }) });
});
await page.route('**/firestore.googleapis.com/**', route => {
  fsHeaders.push(route.request().headers()['authorization'] || '(sem auth)');
  route.fulfill({ status:200, contentType:'application/json', body: JSON.stringify({ documents:[] }) });
});
const erros=[]; page.on('pageerror',e=>erros.push(String(e?.message||e)));
await page.goto(URL, { waitUntil:'domcontentloaded', timeout:45000 });
await page.waitForTimeout(1500);

// 1. Deve existir a tela de login e o app NÃO deve ter iniciado
const temTela = await page.evaluate(()=>!!document.getElementById('authOverlay'));
const naoIniciou = await page.evaluate(()=> typeof AUTH_appIniciado!=='undefined' ? AUTH_appIniciado===false : true);
const fsAntesLogin = fsHeaders.length;

// 2. Preenche e envia o login (backend stubado aceita)
await page.fill('#authEmail','teste@wen');
await page.fill('#authSenha','qualquer');
await page.click('#authBtn');
await page.waitForTimeout(2500);

// 3. Depois do login: tela some, app iniciou, e as chamadas ao Firestore levaram Bearer
const telaSumiu = await page.evaluate(()=>!document.getElementById('authOverlay'));
const iniciou   = await page.evaluate(()=> typeof AUTH_appIniciado!=='undefined' && AUTH_appIniciado===true);
const comBearer = fsHeaders.filter(h=>h && h.startsWith('Bearer ')).length;
const semBearer = fsHeaders.filter(h=>h==='(sem auth)').length;
await browser.close();

let falhas=0; const ok=(c,m)=>{console.log((c?'✅':'❌')+' '+m); if(!c)falhas++;};
ok(erros.length===0, 'sem erros de página ('+erros.length+(erros[0]?': '+erros[0]:'')+')');
ok(temTela, 'modo real: a tela de login aparece');
ok(naoIniciou, 'o app NÃO inicia antes do login (nada de dados sem autenticar)');
ok(fsAntesLogin===0, 'nenhuma chamada ao Firestore antes do login (0 = '+fsAntesLogin+')');
ok(telaSumiu, 'após login correto, a tela some');
ok(iniciou, 'após login, o app inicia');
ok(comBearer>0, 'as chamadas ao Firestore levam Authorization: Bearer ('+comBearer+' com token)');
ok(semBearer===0, 'nenhuma chamada ao Firestore saiu SEM token depois do login ('+semBearer+' sem)');
process.exit(falhas?1:0);
