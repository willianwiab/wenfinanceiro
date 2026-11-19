// ══════════════════════════════════════════════════════════════════════════════════
// CFI_ — CADASTRO FISCAL DE CLIENTES (Fase A1, 18/11/2026)
//
// Módulo PURO: sem DOM, sem fetch, sem estado global. Recebe dado, devolve dado.
// É o que permite testar a regra em milissegundos, sem subir navegador.
//
// Por que existe: o Receber guarda o cliente como TEXTO LIVRE ("CARTPANDA") e mais nada.
// A NFS-e exige CNPJ, razão social e endereço do tomador. Esse buraco é o que trava a
// emissão — e não depende do certificado e-CNPJ, por isso vem primeiro.
//
// O vínculo é pelo NOME, que é a fragilidade conhecida. Daí a normalização agressiva
// (acento, pontuação, caixa) e os apelidos: medido no backup de 26/10, 206 clientes
// distintos produzem apenas 1 colisão real — "HISTÓRIAS DE ORLANDO" e "HISTORIAS DE
// ORLANDO", que caem no mesmo slug e se resolvem sozinhos.
// ══════════════════════════════════════════════════════════════════════════════════

const CFI_UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
                 'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// O ESSENCIAL, decidido pelo Will em 19/11: o nome já vem do financeiro; o que falta é
// CPF/CNPJ, contato, WhatsApp e (talvez) e-mail. Endereço ele não quer preencher.
//
// ⚠️ A CONFERIR COM O CONTADOR: a NFS-e identifica o tomador pelo CNPJ, e o Emissor Nacional
// normalmente resolve razão social e endereço pelo cadastro da Receita. Se na hora de emitir
// ele exigir o endereço, os campos continuam aqui (opcionais) — é só voltar a torná-los
// obrigatórios nesta lista. Não apaguei nada: só parei de cobrar.
const CFI_OBRIGATORIOS = [
  ['doc', 'CPF ou CNPJ'],
];
// Desejáveis: não bloqueiam, mas a tela mostra como pendência leve.
const CFI_DESEJAVEIS = [
  ['contatoFinanceiro',  'contato'],
  ['whatsappFinanceiro', 'WhatsApp'],
];

// ── identidade ────────────────────────────────────────────────────────────────────
// "IRMÃOS DIAS" e "irmaos  dias!" viram o mesmo slug. É a chave do documento.
function CFI_slug(nome){
  return String(nome==null?'':nome)
    .normalize('NFD').replace(/[̀-ͯ]/g,'')   // tira acento
    .toUpperCase().replace(/[^A-Z0-9]/g,'')            // só letra e número
    .toLowerCase();
}
function CFI_so(v){ return String(v==null?'':v).replace(/\D/g,''); }

// ── documento: dígito verificador de verdade, não só formato ──────────────────────
// Formato certo com dígito errado é o que vira nota rejeitada na hora de emitir.
function CFI_validarCPF(v){
  const d = CFI_so(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const [qtd, peso] of [[9,10],[10,11]]) {
    let s = 0;
    for (let i = 0; i < qtd; i++) s += Number(d[i]) * (peso - i);
    const r = (s * 10) % 11, dv = r === 10 ? 0 : r;
    if (dv !== Number(d[qtd])) return false;
  }
  return true;
}
function CFI_validarCNPJ(v){
  const d = CFI_so(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const pesos = [[5,4,3,2,9,8,7,6,5,4,3,2],[6,5,4,3,2,9,8,7,6,5,4,3,2]];
  for (let k = 0; k < 2; k++) {
    const p = pesos[k];
    let s = 0;
    for (let i = 0; i < p.length; i++) s += Number(d[i]) * p[i];
    const r = s % 11, dv = r < 2 ? 0 : 11 - r;
    if (dv !== Number(d[12 + k])) return false;
  }
  return true;
}
function CFI_validarDoc(v){
  const d = CFI_so(v);
  if (d.length === 11) return CFI_validarCPF(d);
  if (d.length === 14) return CFI_validarCNPJ(d);
  return false;
}
function CFI_tipoDoc(v){
  const d = CFI_so(v);
  return d.length === 11 ? 'CPF' : d.length === 14 ? 'CNPJ' : '';
}
function CFI_formatarDoc(v){
  const d = CFI_so(v);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');
  return String(v==null?'':v);
}

// ── demais validações ─────────────────────────────────────────────────────────────
function CFI_validarCEP(v){ return CFI_so(v).length === 8; }
function CFI_validarUF(v){ return CFI_UFS.indexOf(String(v||'').trim().toUpperCase()) >= 0; }
function CFI_validarEmail(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v||'').trim()); }

// ── completude ────────────────────────────────────────────────────────────────────
// Devolve o que FALTA, em português, para a tela conseguir dizer o motivo.
function CFI_completude(f){
  f = f || {};
  const faltam = [], falta = ([c,r]) => { if(!String(f[c]==null?'':f[c]).trim()) return r; };
  CFI_OBRIGATORIOS.forEach(x => { const r = falta(x); if (r) faltam.push(r); });
  // os desejáveis entram na lista do que falta, mas NÃO derrubam o "pronto"
  const leves = CFI_DESEJAVEIS.map(falta).filter(Boolean);
  if (String(f.doc||'').trim() && !CFI_validarDoc(f.doc))      faltam.push('CPF/CNPJ inválido');
  if (String(f.cep||'').trim() && !CFI_validarCEP(f.cep))      faltam.push('CEP inválido');
  if (String(f.uf||'').trim()  && !CFI_validarUF(f.uf))        faltam.push('UF inválida');
  if (String(f.email||'').trim() && !CFI_validarEmail(f.email))faltam.push('e-mail inválido');
  if (String(f.emailFinanceiro||'').trim() && !CFI_validarEmail(f.emailFinanceiro))
    faltam.push('e-mail do financeiro inválido');
  return { pronto: faltam.length === 0, faltam: faltam.concat(leves), leves };
}

// ── ficha nova ────────────────────────────────────────────────────────────────────
function CFI_novaFicha(nome){
  const n = String(nome||'').trim();
  return {
    id: CFI_slug(n), nome: n, nomes: n ? [n] : [],
    fantasia:'', razaoSocial:'', responsavel:'', telefone:'', email:'',
    doc:'', inscricaoMunicipal:'', inscricaoEstadual:'',
    logradouro:'', numero:'', complemento:'', bairro:'', municipio:'', uf:'', cep:'',
    codigoIbge:'',                       // exigido na DPS; preenchido na Fase F
    emailNota:'',
    contatoFinanceiro:'', whatsappFinanceiro:'', emailFinanceiro:'',
    exigeNota:true, fechamentoPadrao:'mensal', prazoPagamento:'', diaVencimento:null,
    instrucoes:'', observacoes:'',
    criadoEm:'', atualizadoEm:''
  };
}

// ── casar lançamento → ficha ──────────────────────────────────────────────────────
// Primeiro pelo slug do nome; depois pelos apelidos já vistos. Devolve null se não achar
// — nunca "chuta" um cliente parecido: errar o tomador é emitir nota no CNPJ errado.
function CFI_casar(nomeLancamento, fichas){
  const alvo = CFI_slug(nomeLancamento);
  if (!alvo) return null;
  const lista = Array.isArray(fichas) ? fichas : Object.values(fichas || {});
  let achou = lista.find(f => CFI_slug(f && f.nome) === alvo || String(f && f.id) === alvo);
  if (achou) return achou;
  return lista.find(f => (f && Array.isArray(f.nomes) ? f.nomes : []).some(n => CFI_slug(n) === alvo)) || null;
}

// Registra uma grafia nova como apelido, sem duplicar.
function CFI_adicionarApelido(ficha, nome){
  const f = Object.assign({}, ficha);
  const n = String(nome||'').trim();
  f.nomes = Array.isArray(f.nomes) ? f.nomes.slice() : [];
  if (n && !f.nomes.some(x => CFI_slug(x) === CFI_slug(n))) f.nomes.push(n);
  return f;
}

// ── pendências ────────────────────────────────────────────────────────────────────
// Clientes que faturaram no ano e ainda não têm ficha, do que mais fatura pro que menos.
// É o que impede um nome digitado diferente de sumir em silêncio.
function CFI_pendencias(lancamentos, fichas, ano){
  const porNome = {};
  (lancamentos || []).forEach(r => {
    if (!r || !r.cliente) return;
    const v = Number(r.valorTotal) || 0;
    if (v <= 0) return;
    if (ano && String(r.mes || '').split('/')[1] !== String(ano)) return;
    const nome = String(r.cliente).trim();
    const k = CFI_slug(nome);
    if (!k) return;
    if (!porNome[k]) porNome[k] = { nome, slug: k, diarias: 0, faturado: 0 };
    porNome[k].diarias++;
    porNome[k].faturado += v;
  });
  return Object.values(porNome)
    .filter(x => !CFI_casar(x.nome, fichas))
    .sort((a, b) => b.faturado - a.faturado);
}

// Quantos já estão prontos para emitir, de tudo que faturou no ano.
function CFI_resumo(lancamentos, fichas, ano){
  const lista = Array.isArray(fichas) ? fichas : Object.values(fichas || {});
  const pend = CFI_pendencias(lancamentos, fichas, ano);
  const prontas = lista.filter(f => CFI_completude(f).pronto).length;
  return { fichas: lista.length, prontas, incompletas: lista.length - prontas,
           semFicha: pend.length, pendencias: pend };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CFI_UFS, CFI_OBRIGATORIOS, CFI_DESEJAVEIS, CFI_slug, CFI_so, CFI_validarCPF, CFI_validarCNPJ,
    CFI_validarDoc, CFI_tipoDoc, CFI_formatarDoc, CFI_validarCEP, CFI_validarUF, CFI_validarEmail,
    CFI_completude, CFI_novaFicha, CFI_casar, CFI_adicionarApelido, CFI_pendencias, CFI_resumo };
}
