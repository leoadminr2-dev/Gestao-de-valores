'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {cpfDigits,validDate,fileOk,parseReceipt,MAX_BYTES}=require('../caixinha-2027/api');

test('CPF válido e variações de pontuação',()=>{
 assert.equal(cpfDigits('529.982.247-25'),'52998224725');
 assert.equal(cpfDigits('52998224725'),'52998224725');
});
test('CPF inválido ou repetido não entra no cadastro',()=>{
 for(const cpf of ['111.111.111-11','123.456.789-00','00000000000','abc','123456789'])assert.equal(cpfDigits(cpf),'');
});
test('datas obrigatoriamente pertencem ao exercício de 2027 e são reais',()=>{
 assert.equal(validDate('2027-12-11'),true);
 assert.equal(validDate('2027-02-29'),false);
 assert.equal(validDate('2027-02-30'),false);
 assert.equal(validDate('2026-12-11'),false);
 assert.equal(validDate('2027-13-01'),false);
 assert.equal(validDate('2027-01-01'),true);
});
test('assinaturas reais dos anexos e tamanho',()=>{
 assert.equal(MAX_BYTES,1024*1024);
 assert.equal(fileOk(Buffer.from([255,216,255,0,0,0]),'image/jpeg'),true);
 assert.equal(fileOk(Buffer.from('%PDF-1.7 extra'), 'application/pdf'),true);
 assert.equal(fileOk(Buffer.from('not a PDF'), 'application/pdf'),false);
 assert.equal(fileOk(Buffer.from('hello'), 'text/plain'),false);
});
test('comprovantes de 2026 são bloqueados para não misturar exercícios',()=>{
 assert.throws(()=>parseReceipt({paidOn:'2026-11-03',amountCents:5000,allocations:[],fileType:'application/pdf'}),/2027/);
});
test('valor inválido é rejeitado',()=>{
 assert.throws(()=>parseReceipt({paidOn:'2027-01-10',amountCents:-1,allocations:[{category:'Mensalidade',amountCents:-1}],fileType:'application/pdf'}),/Valor inválido|data válida/);
});


test('associado pode corrigir rateio rejeitado e manter arquivo original',()=>{
 const data={paidOn:'2027-02-05',amountCents:10000,allocations:[
  {category:'Mensalidade',amountCents:5000,competence:'2027-02'},
  {category:'Rifa',amountCents:5000}
 ],notes:'Ajuste de finalidade'};
 const valid=parseReceipt(data,false,'2027-02-06');
 assert.equal(valid.cents,10000);
 assert.equal(valid.allocations.length,2);
 assert.equal(valid.notes,'Ajuste de finalidade');
 assert.equal(valid.bytes,undefined);
});
test('a correção recusa soma divergente, mês inválido e depósito futuro',()=>{
 const base={paidOn:'2027-02-05',amountCents:5000,allocations:[{category:'Mensalidade',amountCents:5000,competence:'2027-02'}]};
 assert.throws(()=>parseReceipt({...base,amountCents:6000},false,'2027-02-06'),/soma/);
 assert.throws(()=>parseReceipt({...base,allocations:[{category:'Mensalidade',amountCents:5000,competence:'2026-12'}]},false,'2027-02-06'),/competência/);
 assert.throws(()=>parseReceipt(base,false,'2027-02-04'),/data válida/);
});
