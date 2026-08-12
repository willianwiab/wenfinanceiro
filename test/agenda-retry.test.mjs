import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz=fileURLToPath(new URL('..',import.meta.url));
const html=fs.readFileSync(raiz+'/index.html','utf8');

function extrairFuncao(nome){
  const inicioAsync=html.indexOf('async function '+nome+'(');
  const inicioNormal=html.indexOf('function '+nome+'(');
  const inicio=inicioAsync>=0?inicioAsync:inicioNormal;
  assert.notEqual(inicio,-1,'função não encontrada: '+nome);
  const primeiraChave=html.indexOf('{',inicio);
  let nivel=0;
  for(let i=primeiraChave;i<html.length;i++){
    if(html[i]==='{')nivel++;
    else if(html[i]==='}'&&--nivel===0)return html.slice(inicio,i+1);
  }
  throw new Error('função incompleta: '+nome);
}

const codigo=[
  'R_agendaStatusTemporario',
  'R_agendaAguardar',
  'R_agendaUrlSemCache',
  'fetchICS'
].map(extrairFuncao).join('\n');

function criarAgenda(fetchMock,url='https://script.google.com/macros/s/teste/exec'){
  const setTimeoutImediato=resolve=>resolve();
  return new Function('fetch','getProxyUrl','setTimeout',codigo+';return {fetchICS};')(fetchMock,()=>url,setTimeoutImediato);
}

test('Agenda tenta novamente após 404 e ignora cache do navegador',async()=>{
  const chamadas=[];
  const respostas=[
    {ok:false,status:404},
    {ok:true,status:200,json:async()=>({ok:true,ics:'BEGIN:VCALENDAR\nEND:VCALENDAR'})}
  ];
  const agenda=criarAgenda(async(url,opcoes)=>{
    chamadas.push({url,opcoes});
    return respostas.shift();
  });

  const ics=await agenda.fetchICS();
  assert.match(ics,/BEGIN:VCALENDAR/);
  assert.equal(chamadas.length,2);
  assert.ok(chamadas.every(c=>c.opcoes.cache==='no-store'));
  assert.ok(chamadas.every(c=>c.url.includes('_wen_agenda=')));
  assert.notEqual(chamadas[0].url,chamadas[1].url);
});

test('Agenda encerra após três respostas temporárias',async()=>{
  let chamadas=0;
  const agenda=criarAgenda(async()=>{chamadas++;return {ok:false,status:503};});
  await assert.rejects(agenda.fetchICS(),/HTTP 503 após 3 tentativas/);
  assert.equal(chamadas,3);
});

test('Agenda não repete erro permanente de autorização',async()=>{
  let chamadas=0;
  const agenda=criarAgenda(async()=>{chamadas++;return {ok:false,status:401};});
  await assert.rejects(agenda.fetchICS(),/HTTP 401$/);
  assert.equal(chamadas,1);
});
