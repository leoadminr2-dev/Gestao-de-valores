'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseReceipt,fileSignature,MAX_BYTES}=require('../portal-api.js');
const pdf=Buffer.from('%PDF-1.4\n'+('x'.repeat(100)));
const base={
 payerName:'Pessoa Exemplo',amountCents:17000,paidOn:'2026-05-15',
 allocations:[{category:'Mensalidade',cents:16000,competence:'2026-05'},{category:'Rifa',cents:1000}],
 fileType:'application/pdf',fileName:'teste.pdf',fileBase64:pdf.toString('base64'),notes:'Mensalidades e rifa de maio'
};
test('Pix com duas finalidades soma o mesmo valor sem duplicidade',()=>{
 const x=parseReceipt(base);
 assert.equal(x.cents,17000);assert.equal(x.alloc.length,2);
 assert.equal(x.alloc[0].category,'Mensalidade');assert.equal(x.alloc[0].competence,'2026-05');
 assert.equal(x.alloc[1].category,'Rifa');assert.equal(x.bytes.length,pdf.length);
});
test('rejeitar categorias que nao somam o Pix',()=>{
 assert.throws(()=>parseReceipt({...base,allocations:[{category:'Mensalidade',cents:10000,competence:'2026-05'}]}),/soma das finalidades/);
});
test('exigir competencia para mensalidade e nome completo de pagador',()=>{
 assert.throws(()=>parseReceipt({...base,payerName:'Pessoa'}),/sobrenome/);
 assert.throws(()=>parseReceipt({...base,allocations:[{category:'Mensalidade',cents:17000}]}),/competência/);
});
test('nao aceitar JPEG com bytes falsos ou arquivo maior que 300 KB',()=>{
 assert.equal(fileSignature(pdf,'image/jpeg'),false);
 assert.throws(()=>parseReceipt({...base,fileType:'image/jpeg'}),/Arquivo inválido/);
 assert.ok(MAX_BYTES===307200);
});
test('data invalida, valor fora de limite e evento sem nome sao rejeitados',()=>{
 assert.throws(()=>parseReceipt({...base,paidOn:'2027-05-15'}),/data real/);
 assert.throws(()=>parseReceipt({...base,amountCents:0}),/Valor inválido/);
 assert.throws(()=>parseReceipt({...base,allocations:[{category:'Evento',cents:17000}]}),/nome do evento/);
});

test('datas de comprovante precisam existir no calendário de 2026',()=>{
 for(const paidOn of ['2026-02-29','2026-02-30','2026-04-31','2026-06-31']) {
  assert.throws(()=>parseReceipt({...base,paidOn}),e=>e.status===400 && /data real/.test(e.message));
 }
 for(const paidOn of ['2026-02-28','2026-04-30','2026-05-31']) assert.equal(parseReceipt({...base,paidOn}).paid,paidOn);
});

test('corpo e finalidades malformados recebem validação 400',()=>{
 for(const payload of [null,undefined,[],42,'texto']) assert.throws(()=>parseReceipt(payload),e=>e.status===400);
 for(const item of [null,[],42,'texto']) assert.throws(()=>parseReceipt({...base,allocations:[item]}),e=>e.status===400);
});
