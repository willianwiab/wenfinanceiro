// Prova a correção do OFX de cartão (incidente 27/08 — Nubank Will zerou).
// OFX de cartão traz compras NEGATIVAS e pagamentos POSITIVOS; sem normalizar,
// a soma dava negativa e Math.max(0,total) zerava a fatura.
import { chromium } from 'playwright';
const URL = process.argv[2]; // ?mock
const browser = await chromium.launch();
const page = await browser.newPage();
const erros=[]; page.on('pageerror',e=>erros.push(String(e?.message||e)));
await page.goto(URL,{waitUntil:'networkidle',timeout:45000});
await page.waitForTimeout(2500);

const r = await page.evaluate(()=>{
  // OFX de cartão estilo Nubank: 3 compras (negativas) + 1 pagamento recebido (positivo)
  const ofx=`
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
<CCSTMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260805</DTPOSTED><TRNAMT>-150.00</TRNAMT><FITID>1</FITID><MEMO>Mercado</MEMO></CCSTMTTRN>
<CCSTMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260810</DTPOSTED><TRNAMT>-89.90</TRNAMT><FITID>2</FITID><MEMO>Posto</MEMO></CCSTMTTRN>
<CCSTMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260812</DTPOSTED><TRNAMT>-260.10</TRNAMT><FITID>3</FITID><MEMO>Farmacia</MEMO></CCSTMTTRN>
<CCSTMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260815</DTPOSTED><TRNAMT>50.00</TRNAMT><FITID>5</FITID><MEMO>Estorno Farmacia</MEMO></CCSTMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
  const cru=IMP_parseOFX(ofx);
  const somaCrua=cru.reduce((a,m)=>a+m.valor,0);           // -150-89.9-260.1+50 = -449.99 (compras dominam)
  const norm=IMP_normalizarCartaoOFX(cru);                  // aplica a normalização de cartão
  const compras=norm.filter(m=>/Mercado|Posto|Farmacia(?! )/.test(m.descricao)&&!/Estorno/.test(m.descricao));
  const estorno=norm.find(m=>/Estorno/.test(m.descricao));
  const somaCompras=Math.round(compras.reduce((a,m)=>a+m.valor,0)*100)/100;
  const totalComEstorno=Math.round((compras.reduce((a,m)=>a+m.valor,0)+(estorno?estorno.valor:0))*100)/100;
  return {
    somaCrua:Math.round(somaCrua*100)/100,
    comprasPositivas: compras.every(m=>m.valor>0),
    estornoNegativo: estorno? estorno.valor<0 : false,
    somaCompras,
    totalComEstorno,
  };
});
await browser.close();

let f=0; const ok=(c,m)=>{console.log((c?'✅':'❌')+' '+m); if(!c)f++;};
ok(erros.length===0, 'sem erros de página ('+erros.length+')');
ok(r.somaCrua<0, 'OFX cru soma negativa (compras dominam) — reproduz o bug (soma crua = '+r.somaCrua+')');
ok(r.comprasPositivas, 'após normalizar: as 3 compras ficaram POSITIVAS');
ok(r.estornoNegativo, 'após normalizar: o estorno ficou NEGATIVO (abate do total)');
ok(r.somaCompras===500.00, 'compras somam R$ 500,00 positivas — '+r.somaCompras);
ok(r.totalComEstorno===450.00, 'com o estorno incluído, o total cai para R$ 450,00 (500 - 50) — '+r.totalComEstorno);
process.exit(f?1:0);
