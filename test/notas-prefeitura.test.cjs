const NFP=require('../js/notas-prefeitura.js'),fs=require('fs'),assert=require('assert');
const dir=process.argv[2]; let todas=[];
for(const f of fs.readdirSync(dir).filter(x=>x.endsWith('.csv')).sort()){
  const r=NFP.lerCSV(new TextDecoder('windows-1252').decode(fs.readFileSync(dir+'/'+f))); todas=todas.concat(r.notas);}
assert.strictEqual(todas.length,20);
assert.strictEqual(todas.filter(n=>n.status==='cancelada').map(n=>n.numero).join(),'412');
assert.strictEqual(Math.round(todas.filter(n=>n.status==='emitida').reduce((a,n)=>a+n.valor,0)*100)/100,88392); // 28950+35842+23600, só válidas
const s=NFP.separar(todas,{x:{id:'x',numero:'408'}}); assert.strictEqual(s.repetidas.length,1);
fs.writeFileSync(process.argv[3],JSON.stringify(todas,null,1)); console.log('ok',todas.length,'(19 válidas + 1 cancelada)');
